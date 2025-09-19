#!/bin/bash

# Simple Direct Server Launcher for Android Termux
# Minimal version that just starts the servers without complex checks

echo "🌊 Starting Fluid OSC Server (Simple Mode)"
echo "=========================================="

# Change to script directory
cd "$(dirname "$0")" || exit 1

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}🛑 Stopping servers...${NC}"
    jobs -p | xargs -r kill 2>/dev/null
    echo -e "${GREEN}✅ Servers stopped${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Installing dependencies...${NC}"
    npm install || {
        echo -e "${RED}❌ Failed to install dependencies${NC}"
        exit 1
    }
fi

echo -e "${GREEN}✅ Dependencies ready${NC}"

# Start OSC Server
echo -e "${YELLOW}🎛️  Starting OSC Server...${NC}"
node local-osc-server.js &
OSC_PID=$!

# Start simple HTTP server
echo -e "${YELLOW}🌐 Starting Web Server...${NC}"
python3 -m http.server 3000 --bind 0.0.0.0 >/dev/null 2>&1 &
WEB_PID=$!

# Wait a moment
sleep 3

# Check if servers are running
if kill -0 $OSC_PID 2>/dev/null && kill -0 $WEB_PID 2>/dev/null; then
    echo -e "${GREEN}✅ Both servers are running!${NC}"
    echo
    echo -e "${GREEN}🌐 Access URLs:${NC}"
    echo -e "   Local:   http://localhost:3000"
    echo -e "   Network: http://$(hostname -I | awk '{print $1}'):3000"
    echo
    echo -e "${GREEN}🎛️  OSC: $(hostname -I | awk '{print $1}'):8000${NC}"
    echo
    echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
    
    # Wait for interrupt
    wait
else
    echo -e "${RED}❌ Server startup failed${NC}"
    cleanup
    exit 1
fi
