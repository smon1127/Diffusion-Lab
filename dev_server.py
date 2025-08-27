#!/usr/bin/env python3
"""
Development Server with Auto-Restart
Watches Python files and automatically restarts the debug server when changes are detected
"""

import os
import sys
import time
import signal
import subprocess
from pathlib import Path
from datetime import datetime

class DevServer:
    def __init__(self):
        self.server_process = None
        self.watch_files = ['debug_server.py']
        self.file_mtimes = {}
        self.running = True
        
    def get_file_mtime(self, filepath):
        """Get modification time of a file"""
        try:
            return os.path.getmtime(filepath)
        except OSError:
            return None
    
    def scan_files(self):
        """Scan for Python files to watch"""
        for filepath in self.watch_files:
            if os.path.exists(filepath):
                self.file_mtimes[filepath] = self.get_file_mtime(filepath)
    
    def check_file_changes(self):
        """Check if any watched files have changed"""
        changed_files = []
        
        for filepath in self.watch_files:
            if not os.path.exists(filepath):
                continue
                
            current_mtime = self.get_file_mtime(filepath)
            if filepath not in self.file_mtimes:
                self.file_mtimes[filepath] = current_mtime
                continue
                
            if current_mtime != self.file_mtimes[filepath]:
                changed_files.append(filepath)
                self.file_mtimes[filepath] = current_mtime
        
        return changed_files
    
    def kill_port_8080(self):
        """Kill any processes using port 8080"""
        try:
            result = subprocess.run(['lsof', '-ti', ':8080'], 
                                  capture_output=True, text=True, timeout=5)
            
            if result.returncode == 0 and result.stdout.strip():
                pids = result.stdout.strip().split('\n')
                for pid in pids:
                    if pid.strip():
                        try:
                            pid_int = int(pid.strip())
                            print(f"\033[93m🔪 Killing existing process {pid_int} on port 8080\033[0m")
                            os.kill(pid_int, signal.SIGTERM)
                            time.sleep(0.5)
                            try:
                                os.kill(pid_int, 0)
                                os.kill(pid_int, signal.SIGKILL)
                            except OSError:
                                pass
                        except (ValueError, OSError):
                            pass
        except:
            pass  # Ignore errors, port might be free

    def start_server(self):
        """Start the debug server"""
        if self.server_process:
            self.stop_server()
        
        # Kill any existing processes on port 8080
        self.kill_port_8080()
        
        print(f"\033[92m🔄 Starting debug server...\033[0m")
        try:
            self.server_process = subprocess.Popen([
                sys.executable, 'debug_server.py'
            ], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            print(f"\033[94m📡 Server PID: {self.server_process.pid}\033[0m")
            return True
        except Exception as e:
            print(f"\033[91m❌ Failed to start server: {e}\033[0m")
            return False
    
    def stop_server(self):
        """Stop the debug server"""
        if self.server_process:
            try:
                self.server_process.terminate()
                self.server_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.server_process.kill()
                self.server_process.wait()
            except Exception as e:
                print(f"\033[93m⚠️  Warning stopping server: {e}\033[0m")
            finally:
                self.server_process = None
    
    def is_server_running(self):
        """Check if server process is still running"""
        if not self.server_process:
            return False
        return self.server_process.poll() is None
    
    def handle_signal(self, signum, frame):
        """Handle shutdown signals"""
        print(f"\n\033[93m🛑 Received signal {signum} - shutting down...\033[0m")
        self.running = False
        self.stop_server()
        sys.exit(0)
    
    def run(self):
        """Main development server loop"""
        # Set up signal handlers
        signal.signal(signal.SIGINT, self.handle_signal)
        signal.signal(signal.SIGTERM, self.handle_signal)
        
        print("""
🚀 WebGL Fluid Simulation Development Server
============================================
🔍 Watching Python files for changes
🔄 Auto-restart enabled
🌐 Open http://127.0.0.1:8080 in your browser
💡 Press Ctrl+C to stop
""")
        
        # Check if debug_server.py exists
        if not os.path.exists('debug_server.py'):
            print("\033[91m❌ Error: debug_server.py not found in current directory\033[0m")
            return 1
        
        # Initial file scan
        self.scan_files()
        
        # Start the server
        if not self.start_server():
            return 1
        
        # Watch loop
        try:
            while self.running:
                time.sleep(1)
                
                # Check for file changes
                changed_files = self.check_file_changes()
                if changed_files:
                    timestamp = datetime.now().strftime('%H:%M:%S')
                    print(f"\n\033[93m[{timestamp}] 📝 Files changed: {', '.join(changed_files)}\033[0m")
                    print("\033[93m🔄 Restarting server...\033[0m")
                    
                    if not self.start_server():
                        print("\033[91m❌ Failed to restart server\033[0m")
                        break
                
                # Check if server is still running
                elif not self.is_server_running():
                    print("\033[91m❌ Server process died unexpectedly - restarting...\033[0m")
                    if not self.start_server():
                        print("\033[91m❌ Failed to restart server\033[0m")
                        break
        
        except KeyboardInterrupt:
            pass
        finally:
            self.stop_server()
        
        return 0

if __name__ == "__main__":
    dev_server = DevServer()
    sys.exit(dev_server.run())
