#!/bin/bash

# Diffusion Lab Complete Startup Script
# Starts OSC server, web server, and opens browser in optimal sequence

# Get the directory where the script is located, resolving symlinks
SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do
    SCRIPT_DIR="$( cd -P "$( dirname "$SOURCE" )" >/dev/null 2>&1 && pwd )"
    SOURCE="$(readlink "$SOURCE")"
    [[ $SOURCE != /* ]] && SOURCE="$SCRIPT_DIR/$SOURCE"
done
SCRIPT_DIR="$( cd -P "$( dirname "$SOURCE" )" >/dev/null 2>&1 && pwd )"

# Change to the script's directory
cd "$SCRIPT_DIR"
if [ $? -ne 0 ]; then
    echo "❌ Error: Could not change to script directory: $SCRIPT_DIR"
    exit 1
fi

echo "🌊 Diffusion Lab Startup"
echo "========================"

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
    
    # Kill any remaining processes on our ports
    lsof -ti:$WEB_PORT | xargs kill -9 2>/dev/null
    lsof -ti:$OSC_PORT | xargs kill -9 2>/dev/null
    lsof -ti:$WEBSOCKET_PORT | xargs kill -9 2>/dev/null
    
    echo -e "${PURPLE}👋 Diffusion Lab stopped. Goodbye!${NC}"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Check prerequisites
echo -e "${BLUE}🔍 Running from: $SCRIPT_DIR${NC}"
echo -e "${BLUE}🔍 Checking prerequisites...${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Error: Node.js is not installed${NC}"
    echo -e "${YELLOW}💡 Please install Node.js from: https://nodejs.org${NC}"
    exit 1
fi

# Check if we can use npx http-server, otherwise check for python
WEB_SERVER_CMD=""
if command -v npx &> /dev/null; then
    # Check if http-server is available or can be installed
    if npx http-server --help &> /dev/null; then
        WEB_SERVER_CMD="npx http-server"
    else
        echo -e "${YELLOW}📦 Installing http-server...${NC}"
        npm install -g http-server
        if [ $? -eq 0 ]; then
            WEB_SERVER_CMD="npx http-server"
        fi
    fi
fi

# Fallback to Python if http-server not available
if [ -z "$WEB_SERVER_CMD" ]; then
    if command -v python3 &> /dev/null; then
        WEB_SERVER_CMD="python3 -m http.server"
        WEB_PORT=8000
        OSC_PORT=8001
        WEBSOCKET_PORT=8002
        echo -e "${YELLOW}⚠️  Using Python server, ports adjusted${NC}"
    elif command -v python &> /dev/null; then
        WEB_SERVER_CMD="python -m SimpleHTTPServer"
        WEB_PORT=8000
        OSC_PORT=8001
        WEBSOCKET_PORT=8002
        echo -e "${YELLOW}⚠️  Using Python server, ports adjusted${NC}"
    else
        echo -e "${RED}❌ Error: No web server available${NC}"
        echo -e "${YELLOW}💡 Please install Node.js or Python${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✅ Node.js: $(node --version)${NC}"
echo -e "${GREEN}✅ Web server: $WEB_SERVER_CMD${NC}"

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
        exit 1
    fi
    
    echo -e "${GREEN}✅ Dependencies installed${NC}"
fi

# Get network IP
NETWORK_IP=$(node -e "
const os = require('os');
const interfaces = os.networkInterfaces();
for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
            console.log(iface.address);
            process.exit(0);
        }
    }
}
console.log('localhost');
")

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
    exit 1
fi

echo -e "${GREEN}✅ OSC Server running (PID: $OSC_PID)${NC}"

# Start Web Server
echo -e "${PURPLE}🌐 Starting Web Server...${NC}"
if [[ $WEB_SERVER_CMD == *"http-server"* ]]; then
    $WEB_SERVER_CMD -p $WEB_PORT -c-1 --cors &
elif [[ $WEB_SERVER_CMD == *"python3"* ]]; then
    $WEB_SERVER_CMD $WEB_PORT &
else
    $WEB_SERVER_CMD $WEB_PORT &
fi
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

# Show network configuration and get user choice
echo
echo -e "${CYAN}🌐 Network Configuration:${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}   Local Access:  http://localhost:${WEB_PORT}${NC}"
echo -e "${CYAN}   External Access: http://${NETWORK_IP}:${WEB_PORT}${NC}"
echo -e "${CYAN}   OSC Server:    ${NETWORK_IP}:${OSC_PORT}${NC}"
echo -e "${CYAN}   WebSocket:     ${NETWORK_IP}:${WEBSOCKET_PORT}${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo
echo -e "${GREEN}✨ All servers are running and ready!${NC}"
echo

# Ask user about access method
echo -e "${YELLOW}How would you like to access Diffusion Lab?${NC}"
echo -e "1) Open on this computer (launches browser)"
echo -e "2) Access from another device"
echo
read -p "Enter choice (1 or 2): " access_choice
echo

OPEN_BROWSER=false
if [ "$access_choice" = "1" ]; then
    OPEN_BROWSER=true
elif [ "$access_choice" = "2" ]; then
    echo -e "${YELLOW}📱 To access from another device:${NC}"
    echo -e "   Open http://${NETWORK_IP}:${WEB_PORT} in your browser"
    echo
else
    echo -e "${RED}Invalid choice. Defaulting to external access.${NC}"
    echo
fi

# Open browser if requested
if [ "$OPEN_BROWSER" = true ]; then
    echo -e "${PURPLE}🚀 Opening Diffusion Lab in browser...${NC}"
    if command -v open &> /dev/null; then
        # macOS
        open "http://localhost:${WEB_PORT}"
    elif command -v xdg-open &> /dev/null; then
        # Linux
        xdg-open "http://localhost:${WEB_PORT}"
    elif command -v start &> /dev/null; then
        # Windows
        start "http://localhost:${WEB_PORT}"
    else
        echo -e "${YELLOW}💡 Please open your browser to: http://localhost:${WEB_PORT}${NC}"
    fi
    # Wait for browser to load
    sleep 3
fi

echo
echo -e "${GREEN}🎉 Diffusion Lab is ready!${NC}"
echo
echo -e "${BLUE}📋 Quick Setup Guide:${NC}"
if [ "$OPEN_BROWSER" = true ]; then
    echo -e "${BLUE}   🌐 Web Interface: http://localhost:${WEB_PORT}${NC}"
else
    echo -e "${BLUE}   🌐 Web Interface: http://${NETWORK_IP}:${WEB_PORT}${NC}"
fi
echo -e "${BLUE}   🎛️  OSC Control: ${NETWORK_IP}:${OSC_PORT}${NC}"
echo -e "${BLUE}   📱 TouchOSC Setup:${NC}"
echo -e "${BLUE}      Host: ${NETWORK_IP}${NC}"
echo -e "${BLUE}      Port: ${OSC_PORT}${NC}"
echo
echo -e "${PURPLE}💡 Tips:${NC}"
if [ "$OPEN_BROWSER" = true ]; then
    echo -e "${PURPLE}   • The web interface will open automatically in your browser${NC}"
else
    echo -e "${PURPLE}   • Open the web interface URL in your device's browser${NC}"
fi
echo -e "${PURPLE}   • Configure TouchOSC with the IP and port above${NC}"
echo -e "${PURPLE}   • Look for OSC connection indicator in the web interface${NC}"
echo -e "${PURPLE}   • Press Ctrl+C to stop all servers${NC}"
echo
echo -e "${YELLOW}🔄 Servers running... Press Ctrl+C to stop${NC}"

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
