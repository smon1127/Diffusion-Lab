# OSC Control for WebGL Fluid Simulation

Control your fluid simulation remotely using TouchOSC or any OSC-compatible software!

## 🚀 Quick Setup (Same WiFi Network)

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Local OSC Server
```bash
./start-osc.sh
```

You'll see output like:
```
🚀 Fluid OSC Server Started
============================
🌐 Network IP: 192.168.178.59
🎛️  OSC Port: 8000
🔌 WebSocket: 8001

📱 TouchOSC Setup:
   Host: 192.168.178.59
   Port (outgoing): 8000
```

### 3. Configure TouchOSC
1. Open TouchOSC on your phone/tablet
2. Go to Settings → Connections → OSC
3. Set **Host**: `192.168.178.59` (use your network IP)
4. Set **Send Port**: `8000`
5. Enable **Enabled** toggle

## 📱 Available OSC Controls

### Main Toggles (0 = OFF, 1 = ON)
```
/toggle/paused            # Pause/resume simulation
/toggle/colorful          # Enable colorful mode
/toggle/animate          # Enable animation
```

### Visual Effects Toggles
```
/toggle/bloom            # Enable bloom effect
/toggle/sunrays         # Enable sunrays
/toggle/shading         # Enable 3D shading
/toggle/transparent     # Enable transparency
```

### Input Mode Toggles
```
/toggle/velocity_drawing # Enable velocity-based drawing
/toggle/fluid_drawing   # Switch to fluid drawing mode
/toggle/audio          # Switch to audio input
/toggle/camera         # Switch to camera input
/toggle/media          # Switch to media input
```

### Fluid Physics
- `/fluid/density` (0.0 - 1.0) → Density Dissipation
- `/fluid/velocity` (0.0 - 1.0) → Velocity Dissipation  
- `/fluid/pressure` (0.0 - 1.0) → Pressure
- `/fluid/vorticity` (0.0 - 1.0) → Vorticity/Curl
- `/fluid/splat` (0.0 - 1.0) → Splat Radius

### Brush Colors (RGB 0-1)
```
# Individual components:
/brush/r 1.0    # Red component
/brush/g 0.0    # Green component
/brush/b 0.0    # Blue component

# Full RGB color:
/brush/rgb [1.0, 0.0, 0.0]  # Pure red
```

### Background Colors
```
/color/background/r 0.0  # Red component
/color/background/g 0.0  # Green component
/color/background/b 0.0  # Blue component

# Full RGB color:
/color/background/rgb [0.0, 0.0, 0.0]  # Black background
```

### Visual Effects Intensities
- `/visual/bloom_intensity` (0.1 - 2.0) → Bloom strength
- `/visual/sunray_weight` (0.3 - 1.0) → Sunray intensity

### Animation Controls
- `/animation/liveliness` (0.0 - 1.0) → Animation liveliness
- `/animation/chaos` (0.0 - 1.0) → Chaos amount
- `/animation/breathing` (0.0 - 1.0) → Breathing effect
- `/animation/color_life` (0.0 - 1.0) → Color evolution
- `/animation/interval` (0.0 - 1.0) → Animation speed

### Audio Controls
- `/audio/reactivity` (0.1 - 3.0) → Audio sensitivity
- `/audio/delay` (0.0 - 1.0) → Audio delay
- `/audio/opacity` (0.0 - 1.0) → Audio blob opacity
- `/audio/colorful` (0.0 - 1.0) → Audio color cycling
- `/audio/edge_softness` (0.0 - 1.0) → Edge softness

### Actions (send 1 to trigger)
- `/action/reset` → Reset all values
- `/action/screenshot` → Take screenshot
- `/action/record` → Toggle recording

## 🎯 Example TouchOSC Layout

### Page 1: Main Controls
- Toggle buttons for paused, colorful, animate
- RGB sliders for brush color
- RGB sliders for background color

### Page 2: Visual Effects
- Toggle buttons for bloom, sunrays, shading
- Sliders for bloom/sunray intensity
- Toggle for transparency

### Page 3: Input Modes
- Toggle buttons for:
  - Velocity drawing
  - Fluid drawing
  - Audio input
  - Camera input
  - Media input

### Page 4: Animation & Audio
- Animation control sliders
- Audio control sliders
- Action buttons

## 🔧 Troubleshooting

### OSC Status Shows "Disconnected"
1. Make sure `local-osc-server.js` is running
2. Check that you're on the same WiFi network
3. Verify the IP address matches your network

### TouchOSC Not Sending Messages
1. Check TouchOSC connection settings
2. Make sure port 8000 is not blocked
3. Try a test message: `/toggle/bloom 1`

## 🌐 Network Requirements
- All devices must be on same WiFi network
- Ports needed: 8000 (OSC), 8001 (WebSocket)
- Some routers block device-to-device communication

## 💡 Tips
- Use TouchOSC's "High Frequency" mode for smooth control
- Watch the server console for message confirmation
- The browser shows connection status in top-right corner

---

Need help? Check the console output in both the OSC server and browser for debugging information.