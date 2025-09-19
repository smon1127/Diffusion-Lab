#!/bin/bash

# Android Termux Startup Script for Fluid OSC Server
# Simplified version that works on Android Termux environment

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# Change to the script's directory
cd "$SCRIPT_DIR" || {
    echo "❌ Error: Could not change to script directory: $SCRIPT_DIR"
    exit 1
}

echo "🌊 Fluid OSC Server - Android Termux"
echo "====================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
WEB_PORT=3000
OSC_PORT=8000
WEBSOCKET_PORT=8001

# Cleanup function
cleanup() {
    echo
    echo -e "${YELLOW}🛑 Shutting down servers...${NC}"
    
    # Kill background processes
    if [ ! -z "$OSC_PID" ]; then
        kill $OSC_PID 2>/dev/null
        echo -e "${GREEN}✅ OSC Server stopped${NC}"
    fi
    
    if [ ! -z "$WEB_PID" ]; then
        kill $WEB_PID 2>/dev/null
        echo -e "${GREEN}✅ Web Server stopped${NC}"
    fi
    
    echo -e "${PURPLE}👋 Fluid server stopped. Goodbye!${NC}"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Check prerequisites
echo -e "${BLUE}🔍 Checking prerequisites...${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Error: Node.js is not installed${NC}"
    echo -e "${YELLOW}💡 Install with: pkg install nodejs${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Node.js: $(node --version)${NC}"

# Check required files
if [ ! -f "local-osc-server.js" ]; then
    echo -e "${RED}❌ Error: local-osc-server.js not found${NC}"
    exit 1
fi

if [ ! -f "index.html" ]; then
    echo -e "${RED}❌ Error: index.html not found${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Required files found${NC}"

# Install dependencies if needed
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.package-lock.json" ]; then
    echo -e "${YELLOW}📦 Installing dependencies...${NC}"
    npm install
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Failed to install dependencies${NC}"
        echo -e "${YELLOW}💡 Try: npm install --verbose${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Dependencies installed${NC}"
fi

# Simple port checking function for Android
check_port_android() {
    local port=$1
    local description=$2
    
    echo -e "${YELLOW}Testing ${description} port ${port}...${NC}"
    
    # Try to bind to the port to check if it's available
    timeout 1 bash -c "echo > /dev/tcp/localhost/$port" 2>/dev/null
    if [ $? -eq 0 ]; then
        echo -e "${YELLOW}⚠️  Port ${port} appears to be in use${NC}"
        echo -e "${YELLOW}💡 Continuing anyway - the server will handle port conflicts${NC}"
    else
        echo -e "${GREEN}✅ Port ${port} is available${NC}"
    fi
}

# Get network IP for Android
get_android_ip() {
    # Try multiple methods to get the local IP
    local ip=""
    
    # Method 1: Using ifconfig
    ip=$(ifconfig 2>/dev/null | grep "inet " | grep -v "127.0.0.1" | head -1 | awk '{print $2}' | cut -d: -f2)
    
    # Method 2: Using ip command if ifconfig fails
    if [ -z "$ip" ]; then
        ip=$(ip route get 1 2>/dev/null | awk '{print $7}' | head -1)
    fi
    
    # Method 3: Fallback to localhost
    if [ -z "$ip" ]; then
        ip="localhost"
    fi
    
    echo "$ip"
}

# Test ports
echo -e "${BLUE}🔍 Testing port availability...${NC}"
check_port_android $WEB_PORT "Web Server"
check_port_android $OSC_PORT "OSC Server" 
check_port_android $WEBSOCKET_PORT "WebSocket"

# Get network IP
NETWORK_IP=$(get_android_ip)
echo -e "${BLUE}🌐 Detected IP: ${NETWORK_IP}${NC}"

# Start OSC Server
echo -e "${PURPLE}🎛️  Starting OSC Server...${NC}"
node local-osc-server.js &
OSC_PID=$!

# Wait for OSC server to initialize
echo -e "${YELLOW}⏳ Waiting for OSC server to initialize...${NC}"
sleep 3

# Check if OSC server is running
if ! kill -0 $OSC_PID 2>/dev/null; then
    echo -e "${RED}❌ OSC Server failed to start${NC}"
    echo -e "${YELLOW}💡 Check the error messages above${NC}"
    exit 1
fi

echo -e "${GREEN}✅ OSC Server running (PID: $OSC_PID)${NC}"

# Start simple HTTP server using Node.js
echo -e "${PURPLE}🌐 Starting Web Server...${NC}"

# Create a simple HTTP server script
cat > temp-server.js << 'EOF'
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.WEB_PORT || 3000;

const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './index.html';
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 Not Found</h1>', 'utf-8');
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${error.code}`);
            }
        } else {
            res.writeHead(200, { 
                'Content-Type': contentType,
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
                'Access-Control-Allow-Headers': 'Content-Type'
            });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Web Server running on port ${PORT}`);
});

server.on('error', (err) => {
    console.error('❌ Web Server error:', err);
    process.exit(1);
});
EOF

# Start the web server
WEB_PORT=$WEB_PORT node temp-server.js &
WEB_PID=$!

# Wait for web server to start
echo -e "${YELLOW}⏳ Waiting for web server to start...${NC}"
sleep 2

# Check if web server is running
if ! kill -0 $WEB_PID 2>/dev/null; then
    echo -e "${RED}❌ Web Server failed to start${NC}"
    cleanup
    exit 1
fi

echo -e "${GREEN}✅ Web Server running (PID: $WEB_PID)${NC}"

# Wait a moment for servers to fully initialize
echo -e "${YELLOW}⏳ Finalizing server initialization...${NC}"
sleep 2

# Show connection information
echo
echo -e "${CYAN}🌐 Android Termux Setup:${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}Local Access:${NC}"
echo -e "${CYAN}   http://localhost:${WEB_PORT}${NC}"
echo
echo -e "${CYAN}Network Access (from other devices):${NC}"
echo -e "${CYAN}   http://${NETWORK_IP}:${WEB_PORT}${NC}"
echo
echo -e "${CYAN}OSC Control (TouchOSC):${NC}"
echo -e "${CYAN}   Host: ${NETWORK_IP}${NC}"
echo -e "${CYAN}   Port: ${OSC_PORT}${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

echo -e "${GREEN}🎉 Fluid OSC Server is ready!${NC}"
echo
echo -e "${BLUE}📋 Quick Setup:${NC}"
echo -e "${BLUE}   🌐 Local:    http://localhost:${WEB_PORT}${NC}"
echo -e "${BLUE}   🌐 Network:  http://${NETWORK_IP}:${WEB_PORT}${NC}"
echo -e "${BLUE}   🎛️  OSC:     ${NETWORK_IP}:${OSC_PORT}${NC}"
echo
echo -e "${PURPLE}💡 Tips:${NC}"
echo -e "${PURPLE}   • Use localhost URL on this device${NC}"
echo -e "${PURPLE}   • Use network IP on other devices on same WiFi${NC}"
echo -e "${PURPLE}   • Make sure other devices are on the same network${NC}"
echo -e "${PURPLE}   • Press Ctrl+C to stop servers${NC}"
echo
echo -e "${YELLOW}🔄 Servers running... Press Ctrl+C to stop${NC}"

# Clean up temp server file on exit
trap 'rm -f temp-server.js; cleanup' EXIT

# Keep script running and wait for interrupt
while true; do
    # Check if processes are still running
    if ! kill -0 $OSC_PID 2>/dev/null; then
        echo -e "${RED}❌ OSC Server stopped unexpectedly${NC}"
        cleanup
        exit 1
    fi
    
    if ! kill -0 $WEB_PID 2>/dev/null; then
        echo -e "${RED}❌ Web Server stopped unexpectedly${NC}"
        cleanup
        exit 1
    fi
    
    sleep 5
done
