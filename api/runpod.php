<?php
// On-demand RunPod GPU backend for diffusionlab.de.
//
//   POST api/runpod.php?action=start   create the GPU pod (or join the running one) -> { state, session }
//   GET  api/runpod.php?action=status&session=...  -> { state, podUrl?, token? }
//   POST api/runpod.php?action=stop    body { session }: leave; the pod is terminated when nobody is left
//
// state is one of: starting (pod booting), loading (container up, models loading),
// ready (pod /health says ready; podUrl + token are returned), stopped, error. While
// loading, `stage` carries the pod's own progress label (e.g. "loading models").
//
// One pod at a time. It is created from a RunPod template for each session and
// terminated (not stopped) afterwards, so nothing bills while idle; models live on a
// network volume or in the image. The pod also stops itself when idle, and an
// external cron is the last safety net; this script is only the front door.
//
// Settings and the RunPod API key are read from api/.secrets/runpod.json, which
// .htaccess blocks for web access and deploy.sh uploads from .env. The browser never
// sees the API key; it gets a short-lived HMAC token that the pod verifies.
//
// Safeguards (as in daydream.php): same-site requests only, fixed actions, the pod id
// only ever comes from our own state file or the RunPod API (never from the request),
// outgoing requests only to the RunPod API and our own pod's proxy URL, rate limits
// on starts, and generic errors without details.
declare(strict_types=1);

ini_set('display_errors', '0');

const RUNPOD_API = 'https://api.runpod.io/v2/';
const SECRETS_DIR = __DIR__ . '/.secrets';
const CONFIG_FILE = SECRETS_DIR . '/runpod.json';
const STATE_FILE = SECRETS_DIR . '/runpod-state.json';
const RATE_FILE = SECRETS_DIR . '/runpod-starts.json';
const ALLOWED_HOSTS = ['diffusionlab.de', 'www.diffusionlab.de'];
const STARTS_PER_VISITOR_PER_HOUR = 6;
const STARTS_PER_HOUR = 30;
const MAX_BODY_BYTES = 1024;
const CLIENT_TIMEOUT_SECONDS = 90;   // a browser that stopped polling for this long has left
const TOKEN_TTL_SECONDS = 1200;      // the page fetches a fresh token from status while it runs
const DEFAULT_MAX_SESSION_MINUTES = 60;
const POD_ID_PATTERN = '/^[a-z0-9]{8,32}$/';
const SESSION_PATTERN = '/^[a-f0-9]{32}$/';

function respond(int $status, array $body): never
{
    http_response_code($status);
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    echo json_encode($body);
    exit;
}

function fail(int $status, string $message): never
{
    respond($status, ['success' => false, 'error' => $message]);
}

function base64url(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

// v1.<payload>.<signature>; the pod checks the signature, that `pod` is its own id and `exp`
function issueToken(string $secret, string $podId): string
{
    $payload = base64url(json_encode(['pod' => $podId, 'exp' => time() + TOKEN_TTL_SECONDS]));
    return 'v1.' . $payload . '.' . base64url(hash_hmac('sha256', 'v1.' . $payload, $secret, true));
}

function loadConfig(): array
{
    $config = is_readable(CONFIG_FILE) ? json_decode((string) file_get_contents(CONFIG_FILE), true) : null;
    if (
        !is_array($config) || empty($config['apiKey']) || empty($config['tokenSecret'])
        || empty($config['templateId']) || empty($config['gpuIds']) || !is_array($config['gpuIds'])
    ) {
        error_log('runpod.php: missing or incomplete ' . CONFIG_FILE);
        fail(500, 'Backend is not configured');
    }
    return $config;
}

// Calls the RunPod REST API. Returns [status, decoded body]; status 0 = unreachable.
function runpod(array $config, string $method, string $path, ?array $body = null): array
{
    $curl = curl_init(RUNPOD_API . $path);
    curl_setopt_array($curl, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $config['apiKey'], 'Content-Type: application/json'],
    ]);
    if ($body !== null) {
        curl_setopt($curl, CURLOPT_POSTFIELDS, json_encode($body));
    }
    $response = curl_exec($curl);
    $status = $response === false ? 0 : (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);
    $decoded = is_string($response) ? json_decode($response, true) : null;
    if ($status >= 400 || $status === 0) {
        // Log the API's message for us, never pass it to the browser
        $detail = is_array($decoded) ? ($decoded['detail'] ?? $decoded['error'] ?? '') : '';
        error_log("runpod.php: $method $path -> $status " . substr((string) $detail, 0, 200));
    }
    return [$status, is_array($decoded) ? $decoded : []];
}

function podUrl(array $config, string $podId): string
{
    return 'https://' . $podId . '-' . (int) ($config['port'] ?? 8000) . '.proxy.runpod.net';
}

// Asks the pod itself whether the models are loaded: [ready, stage]. The proxy answers
// 502/404 while the container boots.
function podHealth(array $config, string $podId): array
{
    $curl = curl_init(podUrl($config, $podId) . '/health');
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 4,
        CURLOPT_TIMEOUT => 8, // the pod answers slowly while it builds engines
    ]);
    $response = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);
    $health = is_string($response) ? json_decode($response, true) : null;
    if ($status !== 200 || !is_array($health)) {
        return [false, 'starting server'];
    }
    // Only pass on a short, plain stage label (it is shown in the warm-up overlay)
    $stage = preg_replace('/[^a-zA-Z0-9 ,.()-]/', '', substr((string) ($health['stage'] ?? ''), 0, 80));
    return [($health['ready'] ?? false) === true, $stage];
}

function createPod(array $config): ?string
{
    $body = [
        'name' => 'diffusionlab-' . gmdate('Ymd-His'),
        'templateId' => $config['templateId'],
        'cloud' => $config['cloud'] ?? 'SECURE',
        'env' => ['MAX_SESSION_MINUTES' => (string) ($config['maxSessionMinutes'] ?? DEFAULT_MAX_SESSION_MINUTES)],
    ];
    if (!empty($config['dataCenterIds'])) {
        $body['dataCenterIds'] = array_values($config['dataCenterIds']);
    }
    if (!empty($config['networkVolumeId'])) {
        $body['mounts'] = ['network' => [['volumeId' => $config['networkVolumeId'], 'path' => '/workspace']]];
    }
    // create-pod places exactly the GPU type it is given, so try the list in order
    foreach ($config['gpuIds'] as $gpuId) {
        $body['gpu'] = ['id' => (string) $gpuId, 'count' => 1, 'minCudaVersion' => $config['minCudaVersion'] ?? '12.8'];
        [$status, $pod] = runpod($config, 'POST', 'pods', $body);
        $podId = (string) ($pod['id'] ?? '');
        if ($status >= 200 && $status < 300 && preg_match(POD_ID_PATTERN, $podId)) {
            return $podId;
        }
        if ($status !== 400) {
            break; // out of money, bad key, rate limited...: another GPU type won't help
        }
    }
    return null;
}

function terminatePod(array $config, string $podId): void
{
    [$status] = runpod($config, 'DELETE', 'pods/' . $podId);
    if (($status >= 200 && $status < 300) || $status === 404) {
        return; // 404: already gone
    }
    error_log("runpod.php: could not terminate pod $podId; the idle watcher or cron has to catch it");
}

// --- request checks -------------------------------------------------------------

$fetchSite = $_SERVER['HTTP_SEC_FETCH_SITE'] ?? '';
$originHost = parse_url($_SERVER['HTTP_ORIGIN'] ?? '', PHP_URL_HOST) ?: '';
if ($fetchSite !== 'same-origin' && !in_array($originHost, ALLOWED_HOSTS, true)) {
    fail(403, 'Requests are only accepted from diffusionlab.de');
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = (string) ($_GET['action'] ?? '');
$allowed = ['start' => 'POST', 'status' => 'GET', 'stop' => 'POST'];
if (!isset($allowed[$action])) {
    fail(404, 'Unknown action');
}
if ($method !== $allowed[$action]) {
    fail(405, 'Method not allowed');
}

$session = (string) ($_GET['session'] ?? '');
if ($method === 'POST') {
    // stop is also sent with navigator.sendBeacon (text/plain), so don't insist on a content type
    $raw = (string) file_get_contents('php://input', false, null, 0, MAX_BODY_BYTES + 1);
    if (strlen($raw) > MAX_BODY_BYTES) {
        fail(413, 'Request too large');
    }
    $input = $raw === '' ? [] : json_decode($raw, true);
    if (!is_array($input)) {
        fail(400, 'Invalid JSON');
    }
    $session = (string) ($input['session'] ?? $session);
}
if ($session !== '' && !preg_match(SESSION_PATTERN, $session)) {
    fail(400, 'Invalid session');
}

$config = loadConfig();
$maxSessionSeconds = 60 * (int) ($config['maxSessionMinutes'] ?? DEFAULT_MAX_SESSION_MINUTES);

// Everything below runs under one lock on the state file, so two visitors can't
// create two pods
$handle = fopen(STATE_FILE, 'c+');
if ($handle === false || !flock($handle, LOCK_EX)) {
    fail(503, 'Please try again');
}
$state = json_decode((string) stream_get_contents($handle), true) ?: [];
$saveState = function (array $newState) use ($handle): void {
    ftruncate($handle, 0);
    rewind($handle);
    fwrite($handle, json_encode($newState));
    fflush($handle);
};
$now = time();
$podId = (string) ($state['podId'] ?? '');
if ($podId !== '' && !preg_match(POD_ID_PATTERN, $podId)) {
    $podId = ''; // never trust a malformed id, even from our own file
    $state = [];
}
$clients = array_filter(
    (array) ($state['clients'] ?? []),
    fn($lastSeen) => is_int($lastSeen) && $lastSeen > $now - CLIENT_TIMEOUT_SECONDS
);

// --- actions ----------------------------------------------------------------------

if ($action === 'start') {
    if ($session === '') {
        $session = bin2hex(random_bytes(16));
    }
    if ($podId === '') {
        // Cap new pods, since each one costs money
        $rates = fopen(RATE_FILE, 'c+');
        if ($rates === false || !flock($rates, LOCK_EX)) {
            fail(503, 'Please try again');
        }
        $visitor = hash('sha256', $_SERVER['REMOTE_ADDR'] ?? '');
        $log = json_decode((string) stream_get_contents($rates), true) ?: [];
        $log = array_values(array_filter($log, fn($entry) => ($entry['t'] ?? 0) > $now - 3600));
        $mine = count(array_filter($log, fn($entry) => ($entry['v'] ?? '') === $visitor));
        if ($mine >= STARTS_PER_VISITOR_PER_HOUR || count($log) >= STARTS_PER_HOUR) {
            fail(429, 'Too many starts, please wait a bit');
        }
        $log[] = ['t' => $now, 'v' => $visitor];
        ftruncate($rates, 0);
        rewind($rates);
        fwrite($rates, json_encode($log));
        flock($rates, LOCK_UN);
        fclose($rates);

        $podId = createPod($config) ?? '';
        if ($podId === '') {
            fail(503, 'No GPU available right now, please try again later');
        }
        $state = ['podId' => $podId, 'createdAt' => $now];
        $clients = [];
    }
    $clients[$session] = $now;
    $state['clients'] = $clients;
    $saveState($state);
    respond(200, ['success' => true, 'state' => 'starting', 'session' => $session]);
}

if ($action === 'stop') {
    unset($clients[$session]);
    if ($podId !== '' && count($clients) === 0) {
        terminatePod($config, $podId);
        $saveState([]);
    } else {
        $state['clients'] = $clients;
        $saveState($state);
    }
    respond(200, ['success' => true, 'state' => 'stopped']);
}

// status. The page keeps polling (about every 15 s) during a session; that keeps its
// session alive and fetches a fresh token. An unknown or timed-out session gets
// "stopped" and has to call start again to (re)join the pod.
if ($podId === '' || !isset($clients[$session])) {
    respond(200, ['success' => true, 'state' => 'stopped']);
}
if ($now - (int) ($state['createdAt'] ?? $now) > $maxSessionSeconds) {
    terminatePod($config, $podId);
    $saveState([]);
    respond(200, ['success' => true, 'state' => 'stopped', 'reason' => 'time limit']);
}

[$status, $pod] = runpod($config, 'GET', 'pods/' . $podId);
if ($status === 404) {
    $saveState([]); // terminated by the idle watcher, the cron or by hand
    respond(200, ['success' => true, 'state' => 'stopped']);
}
if ($status === 0 || $status >= 400) {
    fail(502, 'GPU backend is not reachable');
}

$clients[$session] = $now;
$state['clients'] = $clients;
$podStatus = (string) ($pod['status'] ?? '');
$result = ['success' => true];
if ($podStatus === 'EXITED' || $podStatus === 'TERMINATED') {
    // A stopped pod still bills for its disk; we never restart one, so remove it
    terminatePod($config, $podId);
    $state = [];
    $result['state'] = 'stopped';
} elseif ($podStatus === 'ERROR') {
    terminatePod($config, $podId);
    $state = [];
    $result['state'] = 'error';
} elseif ($podStatus !== 'RUNNING' || empty($pod['runtime'])) {
    $result['state'] = 'starting';
} elseif (!([$ready, $stage] = podHealth($config, $podId))[0]) {
    $result['state'] = 'loading';
    $result['stage'] = $stage;
} else {
    $result['state'] = 'ready';
    $result['podUrl'] = podUrl($config, $podId);
    $result['token'] = issueToken($config['tokenSecret'], $podId);
}
if (isset($state['createdAt'])) {
    $result['uptime'] = $now - (int) $state['createdAt'];
}
$saveState($state);
respond(200, $result);
