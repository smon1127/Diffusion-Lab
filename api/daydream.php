<?php
// Daydream API proxy for diffusionlab.de.
//
// The page calls api/daydream.php?path=streams/... instead of api.daydream.live, and
// this script adds the API key server-side, so the key never reaches a browser. The
// key is read from a file outside public_html (uploaded by deploy.sh from .env).
//
// Safeguards: only the stream endpoints the app uses (fixed routes, validated stream
// ids, so no other URL can be reached), same-site requests only, a cap on new streams
// per visitor and in total, a body size limit, and generic errors without details.
declare(strict_types=1);

ini_set('display_errors', '0');

const DAYDREAM_API = 'https://api.daydream.live/v1/';
const SECRETS_DIR = __DIR__ . '/../../diffusionlab-secrets';
const KEY_FILE = SECRETS_DIR . '/daydream.key';
const RATE_FILE = SECRETS_DIR . '/stream-creations.json';
const ALLOWED_HOSTS = ['diffusionlab.de', 'www.diffusionlab.de'];
const CREATES_PER_VISITOR_PER_HOUR = 20;
const CREATES_PER_HOUR = 120;
const MAX_BODY_BYTES = 65536;

function fail(int $status, string $message): never
{
    http_response_code($status);
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    echo json_encode(['success' => false, 'error' => $message]);
    exit;
}

// Same-site only: the browser marks fetches from our own pages as same-origin
$fetchSite = $_SERVER['HTTP_SEC_FETCH_SITE'] ?? '';
$originHost = parse_url($_SERVER['HTTP_ORIGIN'] ?? '', PHP_URL_HOST) ?: '';
if ($fetchSite !== 'same-origin' && !in_array($originHost, ALLOWED_HOSTS, true)) {
    fail(403, 'Requests are only accepted from diffusionlab.de');
}

// Fixed routes: path => allowed methods
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = (string) ($_GET['path'] ?? '');
$streamId = '(str_[A-Za-z0-9]{1,64})';
if ($path === 'streams') {
    $allowed = ['POST'];
} elseif (preg_match("#^streams/$streamId$#", $path)) {
    $allowed = ['GET', 'PATCH'];
} elseif (preg_match("#^streams/$streamId/status$#", $path)) {
    $allowed = ['GET'];
} else {
    fail(404, 'Unknown endpoint');
}
if (!in_array($method, $allowed, true)) {
    fail(405, 'Method not allowed');
}

$body = '';
if ($method === 'POST' || $method === 'PATCH') {
    $body = (string) file_get_contents('php://input', false, null, 0, MAX_BODY_BYTES + 1);
    if (strlen($body) > MAX_BODY_BYTES) {
        fail(413, 'Request too large');
    }
    json_decode($body);
    if (json_last_error() !== JSON_ERROR_NONE) {
        fail(400, 'Invalid JSON');
    }
}

// Cap new streams, since each one uses credits
if ($method === 'POST') {
    $handle = fopen(RATE_FILE, 'c+');
    if ($handle === false || !flock($handle, LOCK_EX)) {
        fail(503, 'Please try again');
    }
    $now = time();
    $visitor = hash('sha256', $_SERVER['REMOTE_ADDR'] ?? '');
    $log = json_decode((string) stream_get_contents($handle), true) ?: [];
    $log = array_values(array_filter($log, fn($entry) => $entry['t'] > $now - 3600));
    $mine = count(array_filter($log, fn($entry) => $entry['v'] === $visitor));
    if ($mine >= CREATES_PER_VISITOR_PER_HOUR || count($log) >= CREATES_PER_HOUR) {
        flock($handle, LOCK_UN);
        fclose($handle);
        fail(429, 'Too many new streams, please wait a bit');
    }
    $log[] = ['t' => $now, 'v' => $visitor];
    ftruncate($handle, 0);
    rewind($handle);
    fwrite($handle, json_encode($log));
    flock($handle, LOCK_UN);
    fclose($handle);
}

$key = is_readable(KEY_FILE) ? trim((string) file_get_contents(KEY_FILE)) : '';
if ($key === '') {
    fail(500, 'Proxy is not configured');
}

$curl = curl_init(DAYDREAM_API . $path);
curl_setopt_array($curl, [
    CURLOPT_CUSTOMREQUEST => $method,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $key, 'Content-Type: application/json'],
]);
if ($body !== '') {
    curl_setopt($curl, CURLOPT_POSTFIELDS, $body);
}
$response = curl_exec($curl);
$status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
curl_close($curl);

if ($response === false || $status === 0) {
    fail(502, 'Daydream API is not reachable');
}

http_response_code($status);
header('Content-Type: application/json');
header('Cache-Control: no-store');
echo $response;
