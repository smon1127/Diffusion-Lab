#!/bin/bash

# WebGL Fluid OSC Server Launcher
# Quick start script for local network OSC control

echo "🎛️  WebGL Fluid OSC Server"
echo "=========================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Error: Node.js is not installed${NC}"
    echo -e "${YELLOW}💡 Please install Node.js from: https://nodejs.org${NC}"
    exit 1
fi

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ Error: npm is not available${NC}"
    exit 1
fi

# Check if package.json exists
if [ ! -f "package.json" ]; then
    echo -e "${YELLOW}⚠️  package.json not found. Creating basic setup...${NC}"
    cat > package.json << EOF
{
  "name": "fluid-osc-server",
  "version": "1.0.0",
  "description": "WebGL Fluid Simulation with OSC Control",
  "main": "local-osc-server.js",
  "dependencies": {
    "node-osc": "^9.1.0",
    "ws": "^8.14.2"
  }
}
EOF
fi

# Check if local-osc-server.js exists
if [ ! -f "local-osc-server.js" ]; then
    echo -e "${RED}❌ Error: local-osc-server.js not found${NC}"
    echo -e "${YELLOW}💡 Make sure you have the OSC server file in this directory${NC}"
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Installing dependencies...${NC}"
    npm install
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Failed to install dependencies${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Dependencies installed${NC}"
fi

echo -e "${GREEN}✅ Node.js found: $(node --version)${NC}"
echo -e "${GREEN}✅ Dependencies ready${NC}"
echo

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

echo -e "${CYAN}🌐 Network IP detected: ${NETWORK_IP}${NC}"
echo -e "${BLUE}📋 Setup Instructions:${NC}"
echo -e "${BLUE}   1. Upload fluid files to your FTP server${NC}"
echo -e "${BLUE}   2. Configure TouchOSC:${NC}"
echo -e "${BLUE}      Host: ${NETWORK_IP}${NC}"
echo -e "${BLUE}      Port: 8000${NC}"
echo -e "${BLUE}   3. Open your FTP website in a browser${NC}"
echo -e "${BLUE}   4. Look for OSC connection indicator${NC}"
echo

echo -e "${GREEN}🚀 Starting OSC Server...${NC}"
echo -e "${YELLOW}💡 Press Ctrl+C to stop${NC}"
echo

# Start the server
node local-osc-server.js
