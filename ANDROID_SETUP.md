# Android Termux Setup Guide

This guide helps you run the Fluid OSC Server on Android using Termux.

## Prerequisites

### Install Termux
1. Install Termux from F-Droid (recommended) or Google Play Store
2. Open Termux and run initial setup

### Install Required Packages
```bash
# Update package lists
pkg update && pkg upgrade

# Install Node.js and Python
pkg install nodejs python

# Install Git (if you need to clone the repository)
pkg install git
```

## Setup Options

### Option 1: Android-Optimized Script (Recommended)
Use the Android-specific startup script that handles Android Termux environment:

```bash
# Make sure you're in the fluid directory
cd /path/to/fluid

# Run the Android startup script
./start-android.sh
```

### Option 2: Simple Direct Launcher
If the main Android script has issues, use the simplified version:

```bash
# Run the simple launcher
./start-simple.sh
```

### Option 3: Manual Server Start
If both scripts fail, start servers manually:

```bash
# Install dependencies
npm install

# Start OSC server in background
node local-osc-server.js &

# Start web server (choose one)
# Option A: Using Python
python3 -m http.server 3000 --bind 0.0.0.0 &

# Option B: Using Node.js http-server (if available)
npx http-server -p 3000 -a 0.0.0.0 --cors
```

## Troubleshooting

### Common Issues on Android

#### 1. "lsof: command not found"
The original script uses `lsof` which isn't available on Android. Use the Android-specific scripts instead.

#### 2. Network IP Detection Issues
Android Termux might have different network interface names. The Android script uses multiple fallback methods:
- `ifconfig` output parsing
- `ip route` command
- Fallback to `localhost`

#### 3. Port Binding Issues
If you get "EADDRINUSE" errors:
```bash
# Check what's using the port
netstat -tulpn | grep :3000

# Kill the process (replace PID with actual process ID)
kill -9 PID
```

#### 4. Permission Issues
Make sure the script is executable:
```bash
chmod +x start-android.sh
chmod +x start-simple.sh
```

#### 5. Node.js Version Issues
Some older Node.js versions might have issues. Update if possible:
```bash
# Check Node.js version
node --version

# Update if needed (requires reinstalling)
pkg uninstall nodejs
pkg install nodejs
```

### Network Access

#### Find Your Android Device IP
```bash
# Method 1: Using ifconfig
ifconfig | grep "inet " | grep -v "127.0.0.1"

# Method 2: Using ip command
ip route get 1 | awk '{print $7}'

# Method 3: Check network info
termux-wifi-connectioninfo
```

#### Access from Other Devices
Once the server is running, access it from other devices on the same WiFi:
- **Local (on Android)**: `http://localhost:3000`
- **From other devices**: `http://ANDROID_IP:3000`
- **OSC Control**: `ANDROID_IP:8000`

### TouchOSC Setup
1. Install TouchOSC on your phone/tablet
2. Set Host to your Android device's IP address
3. Set Port to `8000` (OSC port)
4. Make sure both devices are on the same WiFi network

## Performance Tips

### For Better Performance
1. **Close other apps** to free up memory
2. **Use wired connection** if possible for better stability
3. **Keep Termux in foreground** to prevent Android from killing the process
4. **Disable battery optimization** for Termux in Android settings

### Memory Management
```bash
# Check memory usage
free -h

# Kill background processes if needed
jobs
kill %1  # Replace 1 with job number
```

## Advanced Configuration

### Custom Ports
If default ports are in use, modify the scripts:
```bash
# Edit start-android.sh and change these lines:
WEB_PORT=3001      # Change web server port
OSC_PORT=8001      # Change OSC port  
WEBSOCKET_PORT=8002 # Change WebSocket port
```

### Running in Background
To keep servers running when Termux is closed:
```bash
# Install tmux for persistent sessions
pkg install tmux

# Start servers in tmux session
tmux new-session -d -s fluid './start-android.sh'

# Detach from session (servers keep running)
# Press Ctrl+B, then D

# Reattach to session later
tmux attach -t fluid
```

## Support

If you encounter issues:
1. Check the error messages in the terminal
2. Try the simple launcher (`start-simple.sh`)
3. Start servers manually and check for specific errors
4. Ensure all dependencies are installed
5. Check network connectivity between devices

## Notes

- Android Termux has some limitations compared to full Linux
- Some advanced bash features might not work
- Network access might be restricted by Android's firewall
- Battery optimization can kill background processes
