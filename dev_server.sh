#!/bin/bash

# WebGL Fluid Simulation Development Server with Auto-Restart
# This script automatically restarts the debug server when Python files change

echo "🚀 Starting WebGL Fluid Simulation Development Server"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to kill server process
cleanup() {
    echo -e "\n${YELLOW}🛑 Shutting down development server...${NC}"
    if [ ! -z "$SERVER_PID" ]; then
        kill $SERVER_PID 2>/dev/null
        wait $SERVER_PID 2>/dev/null
    fi
    exit 0
}

# Trap Ctrl+C
trap cleanup SIGINT SIGTERM

# Function to start the server
start_server() {
    echo -e "${GREEN}🔄 Starting debug server...${NC}"
    python3 debug_server.py &
    SERVER_PID=$!
    echo -e "${BLUE}📡 Server PID: $SERVER_PID${NC}"
}

# Function to restart server
restart_server() {
    echo -e "\n${YELLOW}🔄 Python file changed - restarting server...${NC}"
    if [ ! -z "$SERVER_PID" ]; then
        kill $SERVER_PID 2>/dev/null
        wait $SERVER_PID 2>/dev/null
    fi
    sleep 1
    start_server
}

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Error: python3 is not installed or not in PATH${NC}"
    exit 1
fi

# Check if debug_server.py exists
if [ ! -f "debug_server.py" ]; then
    echo -e "${RED}❌ Error: debug_server.py not found in current directory${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Python3 found${NC}"
echo -e "${GREEN}✅ debug_server.py found${NC}"
echo -e "${BLUE}🔍 Watching Python files for changes...${NC}"
echo -e "${BLUE}🌐 Open http://127.0.0.1:8080 in your browser${NC}"
echo -e "${YELLOW}💡 Press Ctrl+C to stop${NC}"
echo

# Start the server initially
start_server

# Store the last modification time of debug_server.py
LAST_MOD=$(stat -f %m debug_server.py 2>/dev/null || stat -c %Y debug_server.py 2>/dev/null)

# Watch for changes to Python files
while true do
    sleep 2
    
    # Check if debug_server.py has been modified
    CURRENT_MOD=$(stat -f %m debug_server.py 2>/dev/null || stat -c %Y debug_server.py 2>/dev/null)
    
    if [ "$CURRENT_MOD" != "$LAST_MOD" ]; then
        LAST_MOD=$CURRENT_MOD
        restart_server
    fi
    
    # Check if server process is still running
    if ! kill -0 $SERVER_PID 2>/dev/null; then
        echo -e "${RED}❌ Server process died unexpectedly - restarting...${NC}"
        start_server
    fi
done
