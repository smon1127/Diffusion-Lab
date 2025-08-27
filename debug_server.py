#!/usr/bin/env python3
"""
Debug Server for WebGL Fluid Simulation
Serves static files, captures browser console logs, and provides hot reload
"""

import http.server
import socketserver
import json
import urllib.parse
from datetime import datetime
import os
import mimetypes
import threading
import time
import hashlib
from pathlib import Path
import subprocess
import signal

# Global variables for hot reload
file_hashes = {}
reload_clients = []
watch_extensions = {'.html', '.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg'}

class DebugHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        """Handle POST requests for logging"""
        if self.path == '/log':
            # Get the content length
            content_length = int(self.headers.get('Content-Length', 0))
            
            # Read the POST data
            post_data = self.rfile.read(content_length)
            
            try:
                # Parse JSON data
                log_data = json.loads(post_data.decode('utf-8'))
                
                # Format timestamp
                timestamp = datetime.now().strftime('%H:%M:%S.%f')[:-3]
                
                # Format log message
                level = log_data.get('level', 'info').upper()
                message = log_data.get('message', '')
                source = log_data.get('source', 'unknown')
                
                # Color codes for different log levels
                colors = {
                    'ERROR': '\033[91m',    # Red
                    'WARN': '\033[93m',     # Yellow  
                    'INFO': '\033[94m',     # Blue
                    'DEBUG': '\033[95m',    # Magenta
                    'LOG': '\033[92m'       # Green
                }
                reset_color = '\033[0m'
                
                color = colors.get(level, '\033[0m')
                
                # Print formatted log to server console
                print(f"{color}[{timestamp}] BROWSER {level}: {message}{reset_color}")
                if source != 'unknown':
                    print(f"  └─ Source: {source}")
                
                # Send response
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                
                response = json.dumps({'status': 'logged'})
                self.wfile.write(response.encode())
                
            except json.JSONDecodeError:
                print(f"\033[91m[{datetime.now().strftime('%H:%M:%S')}] ERROR: Invalid JSON in log request\033[0m")
                self.send_error(400, "Invalid JSON")
                
        else:
            self.send_error(404, "Not Found")
    
    def do_GET(self):
        """Handle GET requests - includes hot reload check"""
        if self.path == '/reload-check':
            # Hot reload endpoint - check if files have changed
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            # Check if any watched files have changed
            changed = check_file_changes()
            response = json.dumps({'reload': changed})
            self.wfile.write(response.encode())
        else:
            # Handle normal file serving
            super().do_GET()
    
    def do_OPTIONS(self):
        """Handle CORS preflight requests"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def end_headers(self):
        # Add CORS headers to all responses
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()
    
    def log_message(self, format, *args):
        """Override to customize server request logging"""
        timestamp = datetime.now().strftime('%H:%M:%S')
        print(f"\033[96m[{timestamp}] SERVER: {format % args}\033[0m")

def get_file_hash(filepath):
    """Get MD5 hash of a file"""
    try:
        with open(filepath, 'rb') as f:
            return hashlib.md5(f.read()).hexdigest()
    except (OSError, IOError):
        return None

def scan_files():
    """Scan current directory for watchable files and store their hashes"""
    global file_hashes
    current_dir = Path('.')
    
    for file_path in current_dir.rglob('*'):
        if file_path.is_file() and file_path.suffix.lower() in watch_extensions:
            # Skip hidden files and directories
            if any(part.startswith('.') for part in file_path.parts):
                continue
                
            file_hash = get_file_hash(file_path)
            if file_hash:
                file_hashes[str(file_path)] = file_hash

def check_file_changes():
    """Check if any watched files have changed"""
    global file_hashes
    changed = False
    current_dir = Path('.')
    
    # Check existing files for changes
    for file_path in list(file_hashes.keys()):
        if os.path.exists(file_path):
            current_hash = get_file_hash(file_path)
            if current_hash != file_hashes[file_path]:
                print(f"\033[93m[{datetime.now().strftime('%H:%M:%S')}] FILE CHANGED: {file_path}\033[0m")
                file_hashes[file_path] = current_hash
                changed = True
        else:
            # File was deleted
            print(f"\033[91m[{datetime.now().strftime('%H:%M:%S')}] FILE DELETED: {file_path}\033[0m")
            del file_hashes[file_path]
            changed = True
    
    # Check for new files
    for file_path in current_dir.rglob('*'):
        if file_path.is_file() and file_path.suffix.lower() in watch_extensions:
            # Skip hidden files and directories
            if any(part.startswith('.') for part in file_path.parts):
                continue
                
            str_path = str(file_path)
            if str_path not in file_hashes:
                file_hash = get_file_hash(file_path)
                if file_hash:
                    print(f"\033[92m[{datetime.now().strftime('%H:%M:%S')}] NEW FILE: {str_path}\033[0m")
                    file_hashes[str_path] = file_hash
                    changed = True
    
    return changed

def kill_port_processes(port):
    """Kill any processes using the specified port"""
    try:
        # Find processes using the port
        result = subprocess.run(['lsof', '-ti', f':{port}'], 
                              capture_output=True, text=True, timeout=5)
        
        if result.returncode == 0 and result.stdout.strip():
            pids = result.stdout.strip().split('\n')
            killed_count = 0
            
            for pid in pids:
                if pid.strip():
                    try:
                        pid_int = int(pid.strip())
                        print(f"\033[93m🔪 Killing process {pid_int} using port {port}\033[0m")
                        os.kill(pid_int, signal.SIGTERM)
                        killed_count += 1
                        
                        # Give it a moment to terminate gracefully
                        time.sleep(0.5)
                        
                        # Force kill if still running
                        try:
                            os.kill(pid_int, 0)  # Check if process still exists
                            print(f"\033[91m💀 Force killing process {pid_int}\033[0m")
                            os.kill(pid_int, signal.SIGKILL)
                        except OSError:
                            pass  # Process already terminated
                            
                    except (ValueError, OSError) as e:
                        print(f"\033[91m❌ Failed to kill process {pid}: {e}\033[0m")
            
            if killed_count > 0:
                print(f"\033[92m✅ Killed {killed_count} process(es) using port {port}\033[0m")
                time.sleep(1)  # Wait a bit before starting new server
                
    except subprocess.TimeoutExpired:
        print(f"\033[93m⚠️  Timeout checking for processes on port {port}\033[0m")
    except FileNotFoundError:
        # lsof not available, try alternative method
        try_alternative_port_kill(port)
    except Exception as e:
        print(f"\033[93m⚠️  Could not check port {port}: {e}\033[0m")

def try_alternative_port_kill(port):
    """Alternative method to kill port processes (for systems without lsof)"""
    try:
        # Try netstat approach
        result = subprocess.run(['netstat', '-tulpn'], 
                              capture_output=True, text=True, timeout=5)
        
        if result.returncode == 0:
            for line in result.stdout.split('\n'):
                if f':{port}' in line and 'LISTEN' in line:
                    # Extract PID from netstat output (format varies by system)
                    parts = line.split()
                    for part in parts:
                        if '/' in part:
                            try:
                                pid = int(part.split('/')[0])
                                print(f"\033[93m🔪 Killing process {pid} using port {port}\033[0m")
                                os.kill(pid, signal.SIGTERM)
                                time.sleep(0.5)
                                try:
                                    os.kill(pid, 0)
                                    os.kill(pid, signal.SIGKILL)
                                except OSError:
                                    pass
                                break
                            except (ValueError, OSError):
                                continue
    except:
        print(f"\033[93m⚠️  Could not find alternative method to check port {port}\033[0m")

def run_server(port=8080):
    """Run the debug server"""
    handler = DebugHTTPRequestHandler
    
    print(f"""
🚀 WebGL Fluid Simulation Debug Server with Hot Reload
======================================================
📡 Server: http://127.0.0.1:{port}
🎯 Fluid Sim: http://127.0.0.1:{port}/WebGL-Fluid-Simulation/
📝 Console logs from browser will appear below
🔥 Hot reload: Files will be watched for changes
🛑 Press Ctrl+C to stop

""")
    
    # Kill any existing processes on the port
    print(f"🔍 Checking for existing processes on port {port}...")
    kill_port_processes(port)
    
    # Initialize file watching
    print("🔍 Scanning files for hot reload...")
    scan_files()
    print(f"📁 Watching {len(file_hashes)} files for changes")
    print(f"📋 Extensions: {', '.join(sorted(watch_extensions))}")
    print()
    
    try:
        with socketserver.TCPServer(("127.0.0.1", port), handler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n\n🛑 Server stopped by user")
    except OSError as e:
        if e.errno == 48:  # Address already in use
            print(f"❌ Port {port} is already in use. Try a different port or stop existing server.")
        else:
            print(f"❌ Server error: {e}")

if __name__ == "__main__":
    # Run server from current directory
    run_server()
