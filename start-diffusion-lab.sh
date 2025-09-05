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
DEBUG=false  # Set to true for verbose logging
AUTO_CLOSE_BROWSER_TABS=true  # Set to false to disable automatic browser tab closure

# Function to close specific browser tabs using AppleScript (macOS)
close_browser_tabs() {
    local port=$1
    local url_localhost="http://localhost:${port}"
    local url_network="http://${NETWORK_IP}:${port}"
    
    if [ "$AUTO_CLOSE_BROWSER_TABS" != "true" ]; then
        return 0
    fi
    
    # Only run on macOS
    if [[ "$OSTYPE" != "darwin"* ]]; then
        return 0
    fi
    
    echo -e "${YELLOW}🔍 Checking for browser tabs using port ${port}...${NC}"
    
    local tabs_closed=false
    
    # Close Chrome tabs
    if pgrep -f "Google Chrome" >/dev/null 2>&1; then
        osascript -e "
        tell application \"Google Chrome\"
            if it is running then
                repeat with w in windows
                    repeat with t in tabs of w
                        set tab_url to URL of t
                        if tab_url starts with \"$url_localhost\" or tab_url starts with \"$url_network\" then
                            close t
                            set tabs_closed to true
                        end if
                    end repeat
                end repeat
            end if
        end tell
        " 2>/dev/null && tabs_closed=true
    fi
    
    # Close Safari tabs
    if pgrep -f "Safari" >/dev/null 2>&1; then
        osascript -e "
        tell application \"Safari\"
            if it is running then
                repeat with w in windows
                    repeat with t in tabs of w
                        set tab_url to URL of t
                        if tab_url starts with \"$url_localhost\" or tab_url starts with \"$url_network\" then
                            close t
                            set tabs_closed to true
                        end if
                    end repeat
                end repeat
            end if
        end tell
        " 2>/dev/null && tabs_closed=true
    fi
    
    # Close Firefox tabs (Firefox AppleScript support is limited, so we'll use a different approach)
    if pgrep -f "firefox" >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Firefox detected. Please manually close any tabs using port ${port}${NC}"
    fi
    
    if [ "$tabs_closed" = true ]; then
        echo -e "${GREEN}✅ Closed browser tabs using port ${port}${NC}"
        sleep 2  # Give browsers time to close tabs
        return 0
    fi
    
    return 1
}

# Function to kill process using a port
kill_port() {
    local port=$1
    local pid=$(lsof -ti :$port 2>/dev/null)
    if [ ! -z "$pid" ]; then
        echo -e "${YELLOW}Found process ${pid} using port ${port}${NC}"
        local process_name=$(ps -p $pid -o comm= 2>/dev/null)
        if [[ "$process_name" == *"Google Chrome"* ]] || [[ "$process_name" == *"firefox"* ]] || [[ "$process_name" == *"Safari"* ]]; then
            echo -e "${YELLOW}🌐 Browser process detected. Attempting to close tabs first...${NC}"
            # Try to close specific browser tabs first
            if close_browser_tabs $port; then
                # Check if port is now free after closing tabs
                if ! lsof -i :$port >/dev/null 2>&1; then
                    echo -e "${GREEN}✅ Port ${port} freed by closing browser tabs${NC}"
                    return 0
                fi
            fi
            echo -e "${YELLOW}⚠️  Browser tabs couldn't be closed automatically. Killing browser process...${NC}"
        fi
        echo -e "${YELLOW}🔧 Killing process...${NC}"
        kill -9 $pid 2>/dev/null
        sleep 1
        if lsof -i :$port >/dev/null 2>&1; then
            echo -e "${RED}❌ Could not free port ${port}${NC}"
            return 1
        else
            echo -e "${GREEN}✅ Port ${port} freed${NC}"
            return 0
        fi
    else
        echo -e "${GREEN}✅ Port ${port} is not in use${NC}"
        return 0
    fi
}

# Function to test if a port is open and clean it if needed
test_port() {
    local port=$1
    local description=$2
    echo -e "${YELLOW}Testing ${description} port ${port}...${NC}"
    
    # Use lsof to check if port is in use
    if lsof -i :$port >/dev/null 2>&1; then
        echo -e "${RED}❌ Port ${port} is in use${NC}"
        echo -e "${YELLOW}🔍 Checking what's using it...${NC}"
        kill_port $port
        return $?
    fi
    
    echo -e "${GREEN}✅ Port ${port} is available${NC}"
    return 0
}

# Function to check network connectivity
check_network() {
    echo -e "${BLUE}🔍 Testing network connectivity...${NC}"
    
    # Get network interfaces without using netcat
    local interfaces=$(ifconfig 2>/dev/null || ip addr)
    if [ $? -ne 0 ]; then
        echo -e "${YELLOW}⚠️  Could not check network interfaces${NC}"
        echo -e "${YELLOW}💡 Continuing anyway...${NC}"
        return 0
    fi
    
    # Show available network interfaces (non-loopback IPv4)
    echo -e "${BLUE}Available network interfaces:${NC}"
    echo "$interfaces" | grep "inet " | grep -v "127.0.0.1" || {
        echo -e "${YELLOW}⚠️  No external network interfaces found${NC}"
        echo -e "${YELLOW}💡 Check your network connection${NC}"
    }
    
    return 0
}



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
    
    # Kill any remaining processes on our ports (more robust cleanup)
    echo -e "${YELLOW}🧹 Cleaning up ports...${NC}"
    for port in $WEB_PORT $OSC_PORT $WEBSOCKET_PORT; do
        local pids=$(lsof -ti:$port 2>/dev/null)
        if [ ! -z "$pids" ]; then
            echo "$pids" | xargs kill -9 2>/dev/null
            echo -e "${GREEN}✅ Cleaned up port ${port}${NC}"
        fi
    done
    
    echo -e "${PURPLE}👋 Diffusion Lab stopped. Goodbye!${NC}"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Check prerequisites
echo -e "${BLUE}🔍 Running from: $SCRIPT_DIR${NC}"
echo -e "${BLUE}🔍 Checking prerequisites...${NC}"

# Check network connectivity
check_network

# Get network IP early (needed for browser tab detection)
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
" 2>/dev/null || echo "localhost")

# Proactively close any existing browser tabs that might interfere
if [ "$AUTO_CLOSE_BROWSER_TABS" = "true" ]; then
    echo -e "${BLUE}🧹 Checking for existing browser tabs on required ports...${NC}"
    for port in $WEB_PORT $OSC_PORT $WEBSOCKET_PORT; do
        close_browser_tabs $port >/dev/null 2>&1
    done
fi

# Test ports before starting servers
echo
echo -e "${BLUE}🔍 Testing port availability...${NC}"
if ! test_port $WEB_PORT "Web Server"; then
    echo -e "${RED}❌ Could not free Web Server port ${WEB_PORT}${NC}"
    echo -e "${YELLOW}💡 Try changing WEB_PORT in the script or restart your computer${NC}"
    exit 1
fi

if ! test_port $OSC_PORT "OSC Server"; then
    echo -e "${RED}❌ Could not free OSC Server port ${OSC_PORT}${NC}"
    echo -e "${YELLOW}💡 Try changing OSC_PORT in the script or restart your computer${NC}"
    exit 1
fi

if ! test_port $WEBSOCKET_PORT "WebSocket"; then
    echo -e "${RED}❌ Could not free WebSocket port ${WEBSOCKET_PORT}${NC}"
    echo -e "${YELLOW}💡 Try changing WEBSOCKET_PORT in the script or restart your computer${NC}"
    exit 1
fi

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

# Network IP already determined earlier for browser tab detection

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
    $WEB_SERVER_CMD -p $WEB_PORT -c-1 --cors --silent -a 0.0.0.0 &
elif [[ $WEB_SERVER_CMD == *"python3"* ]]; then
    # Redirect stdout to /dev/null to suppress access logs, bind to all interfaces
    python3 -m http.server $WEB_PORT --bind 0.0.0.0 >/dev/null 2>&1 &
else
    # For Python 2 server - bind to all interfaces
    python -m SimpleHTTPServer $WEB_PORT >/dev/null 2>&1 &
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
echo -e "${CYAN}🌐 iPad + Mac Setup:${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}1. On your iPad (for viewing):${NC}"
echo -e "${CYAN}   • Open Safari/Chrome and go to:${NC}"
echo -e "${CYAN}   • http://${NETWORK_IP}:${WEB_PORT}${NC}"
echo
echo -e "${CYAN}2. On your Mac (OSC bridge):${NC}"
echo -e "${CYAN}   • Keep this terminal window open${NC}"
echo -e "${CYAN}   • The Mac handles all OSC messages${NC}"
echo
echo -e "${CYAN}3. In TouchOSC (control):${NC}"
echo -e "${CYAN}   • Host: ${NETWORK_IP}   ← Mac's IP address${NC}"
echo -e "${CYAN}   • Port: ${OSC_PORT}     ← OSC port${NC}"
echo
echo -e "${CYAN}Connection Flow:${NC}"
echo -e "${CYAN}   TouchOSC → Mac Bridge (${NETWORK_IP}:${OSC_PORT}) → iPad Browser${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo
echo -e "${GREEN}✨ All servers are running and ready!${NC}"

# Open browser automatically
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
sleep 2

echo
echo -e "${GREEN}🎉 Diffusion Lab is ready!${NC}"
echo
echo -e "${BLUE}📋 Quick Setup Guide:${NC}"
echo -e "${BLUE}   🌐 Local Access:    http://localhost:${WEB_PORT}${NC}"
echo -e "${BLUE}   🌐 External Access: http://${NETWORK_IP}:${WEB_PORT}${NC}"
echo -e "${BLUE}   🎛️  OSC Control: ${NETWORK_IP}:${OSC_PORT}${NC}"
echo -e "${BLUE}   📱 TouchOSC Setup:${NC}"
echo -e "${BLUE}      Host: ${NETWORK_IP}${NC}"
echo -e "${BLUE}      Port: ${OSC_PORT}${NC}"
echo
echo -e "${PURPLE}💡 Tips:${NC}"
echo -e "${PURPLE}   • Use localhost URL on this Mac, or external IP on other devices${NC}"
echo -e "${PURPLE}   • Keep this Mac running as the OSC bridge${NC}"
echo -e "${PURPLE}   • On your iPad, check that the page loads correctly${NC}"
echo -e "${PURPLE}   • Make sure your iPad and Mac are on the same WiFi${NC}"
echo -e "${PURPLE}   • In TouchOSC, ALWAYS use the Mac's IP: ${NETWORK_IP}${NC}"
echo -e "${PURPLE}   • Watch for the OSC connection indicator on your iPad${NC}"
echo -e "${PURPLE}   • Press Ctrl+C on the Mac to stop all servers${NC}"
echo
echo -e "${YELLOW}🔧 Port Issues?${NC}"
echo -e "${YELLOW}   • Browser tabs are automatically closed (set AUTO_CLOSE_BROWSER_TABS=false to disable)${NC}"
echo -e "${YELLOW}   • If issues persist, run this command to kill ports:${NC}"
echo -e "${YELLOW}   • lsof -ti :$WEB_PORT :$OSC_PORT :$WEBSOCKET_PORT | xargs kill -9${NC}"
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
