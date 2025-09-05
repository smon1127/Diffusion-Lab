# 🌊 Diffusion Lab

<video width="100%" autoplay muted loop>
  <source src="diffusion_lab_teaser.mp4" type="video/mp4">
  Your browser does not support the video tag.
</video>

**Transform fluid dynamics and more into stunning generative art with real-time AI processing**

Diffusion Lab is an advanced WebGL fluid simulation combined with real-time AI stream diffusion, designed for interactive art creation, live performances, and creative exploration. Control it through touch, remote devices, or Telegram commands.

## ✨ Key Features

- **🤖 AI Stream Diffusion**: Real-time AI processing with ControlNet support (Pose, HED, Canny, Depth, Color)
- **🌊 Advanced Fluid Simulation**: WebGL-powered fluid dynamics with customizable physics
- **📱 Telegram Integration**: Remote prompt control and preset management via Telegram bot
- **🎛️ OSC Control**: Professional TouchOSC integration for live performance
- **📷 Camera Integration**: Live camera feed as fluid background or AI input
- **🖼️ Media Backgrounds**: Support for images and videos as fluid backgrounds
- **📱 Tablet Optimized**: Touch-friendly interface designed for iPad and tablets
- **🎵 Audio Reactive**: Audio input visualization with customizable parameters
- **🎨 ControlNet Presets**: Pre-configured AI processing setups for different artistic styles

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Complete System
```bash
./start-diffusion-lab.sh
```

The startup script automatically:
- Starts the web server (port 3000)
- Launches the OSC server (port 8000) 
- Initializes WebSocket communication (port 8001)
- Activates the Telegram bot (if configured)
- Opens the application in your browser
- Closes any conflicting browser tabs

### 3. Configure AI API (Optional)
1. Open the application in your browser
2. Click the API configuration button
3. Enter your AI service API key
4. Select your preferred AI model

### 4. Configure Telegram Bot (Optional)
1. Create a bot via [@BotFather](https://t.me/BotFather) on Telegram
2. Edit `local-osc-server.js` and add your token:
   ```javascript
   const TELEGRAM_BOT_TOKEN = 'YOUR_BOT_TOKEN_HERE';
   ```
3. Restart the system: `./start-diffusion-lab.sh`

## 🎨 Core Features

### AI Stream Diffusion
- **Real-time Processing**: Live AI generation with minimal latency
- **ControlNet Support**: Multiple ControlNet models for different artistic effects
- **Prompt Management**: Dynamic prompt switching and interpolation
- **Parameter Control**: Fine-tune inference steps, guidance scale, and more

### Fluid Simulation
- **Advanced Physics**: Density, velocity, pressure, and vorticity controls
- **Visual Effects**: Bloom, sunrays, 3D shading, and transparency
- **Interactive Drawing**: Multiple input modes including velocity-based drawing
- **Animation System**: Automated movement with chaos, breathing, and color evolution

### Input Methods
- **Touch/Mouse**: Direct interaction with the fluid simulation
- **Camera Feed**: Use live camera as background or AI input source
- **Media Files**: Load images/videos as backgrounds or overlays
- **Audio Input**: Microphone-driven audio visualization
- **OSC Control**: Professional remote control via TouchOSC or similar
- **Telegram Commands**: Text-based control and preset management

### Media Integration
- **Background Modes**: Fluid-only, camera, media, or combined backgrounds
- **Scaling Controls**: Independent scaling for different media layers
- **Real-time Switching**: Seamless transitions between input modes

## 🤖 Telegram Integration

### Bot Commands
- **Text Messages**: Send any text to use as an AI prompt
- **`/start`**: Welcome message and setup instructions
- **`/preset`**: Browse and apply prompt or ControlNet presets

### Preset System
- **🎨 Prompt Presets**: Ready-made visual themes and artistic styles
- **⚙️ ControlNet Presets**: AI processing parameter configurations
- **Queue Management**: Smart waitlist system with configurable intervals
- **Real-time Feedback**: Queue position and processing time estimates

### Advanced Features
- **Public Broadcasting**: Share prompts to community Telegram groups
- **Smart Processing**: Intelligent queue management with priority handling
- **Multi-user Support**: Handle multiple users simultaneously

## 🎛️ Remote Control (OSC)

### TouchOSC Setup
1. Install TouchOSC on your phone/tablet
2. Configure connection:
   - **Host**: Your computer's IP address (shown at startup)
   - **Send Port**: 8000
   - **Protocol**: OSC

### Control Categories

#### Main Toggles
```
/toggle/paused            # Pause/resume simulation
/toggle/colorful          # Enable colorful mode
/toggle/animate           # Enable animation
/toggle/bloom            # Bloom effect
/toggle/sunrays          # Sunrays effect
/toggle/shading          # 3D shading
/toggle/transparent      # Transparency
```

#### Input Modes
```
/toggle/velocity_drawing # Velocity-based drawing
/toggle/fluid_drawing    # Fluid drawing mode
/toggle/audio           # Audio input
/toggle/camera          # Camera input
/toggle/media           # Media input
```

#### Fluid Physics
```
/fluid/density    (0.0-1.0) # Density dissipation
/fluid/velocity   (0.0-1.0) # Velocity dissipation
/fluid/pressure   (0.0-1.0) # Pressure
/fluid/vorticity  (0.0-1.0) # Vorticity/curl
/fluid/splat      (0.0-1.0) # Splat radius
```

#### AI Parameters
```
/ai/inference_steps  (1-100)  # AI inference steps
/ai/seed            (0-1000) # Random seed
/ai/guidance_scale   (1-20)  # Guidance scale
/ai/delta           (0.0-1.0) # Delta parameter
```

#### ControlNet Controls
```
/controlnet/pose   (0.0-1.0) # Pose detection strength
/controlnet/hed    (0.0-1.0) # HED edge detection
/controlnet/canny  (0.0-1.0) # Canny edge detection
/controlnet/depth  (0.0-1.0) # Depth estimation
/controlnet/color  (0.0-1.0) # Color preservation
```

#### Multi-Touch XY Pads
```
/multixy/1  # Channel 1 XY control
/multixy/2  # Channel 2 XY control
/multixy/3  # Channel 3 XY control
/multixy/4  # Channel 4 XY control
/multixy/5  # Channel 5 XY control
```

#### Telegram Controls
```
/telegram/receive   (0/1)   # Enable/disable prompt reception
/telegram/clear     (1)     # Clear waitlist
/telegram/interval  (1-30)  # Processing interval (seconds)
```

#### Actions
```
/action/reset       # Reset all values
/action/screenshot  # Capture screenshot
/action/record      # Toggle video recording
```

## 📱 Recommended TouchOSC Layout

### Page 1: Main Controls
- Toggle buttons: paused, colorful, animate, bloom, sunrays
- RGB sliders for brush and background colors
- Physics controls: density, velocity, pressure

### Page 2: AI Controls
- Inference steps, seed, guidance scale sliders
- ControlNet strength controls (pose, HED, canny, depth, color)
- Delta and animation parameters

### Page 3: Multi-Touch Performance
- 5 XY pads for `/multixy/1` through `/multixy/5`
- Real-time velocity-based drawing
- Independent channel control

### Page 4: Input Modes & Media
- Input mode toggles (drawing, audio, camera, media)
- Media scaling controls
- Animation and audio parameters

### Page 5: Telegram Integration
- Telegram receive toggle
- Waitlist interval slider
- Clear waitlist button
- Status indicators

## 🔧 Troubleshooting

### General Issues
- **Application won't start**: Check that ports 3000, 8000, and 8001 are available
- **Browser conflicts**: The startup script automatically closes conflicting tabs
- **Performance issues**: Try reducing AI inference steps or disabling some visual effects

### OSC Connection Issues
- **"Disconnected" status**: Verify the OSC server is running and you're on the same WiFi network
- **TouchOSC not responding**: Check IP address and port 8000 in TouchOSC settings
- **Message lag**: Enable "High Frequency" mode in TouchOSC

### Telegram Bot Issues
- **Bot not responding**: Verify the bot token is correctly configured in `local-osc-server.js`
- **Commands not working**: Ensure the bot has proper permissions and polling is active
- **Queue not processing**: Check the waitlist interval setting and server logs

### AI/Camera Issues
- **Camera access denied**: Grant camera permissions in browser settings
- **AI generation slow**: Reduce inference steps or try a different model
- **Media files not loading**: Check file formats and browser compatibility

## 🌐 Network Setup

### Local Network Requirements
- **Ports**: 3000 (web), 8000 (OSC), 8001 (WebSocket)
- **WiFi**: All devices must be on the same network
- **Firewall**: Ensure ports are not blocked

### Multi-Device Setup
1. **Host Computer**: Run `./start-diffusion-lab.sh`
2. **iPad/Tablet**: Open browser to `http://HOST_IP:3000`
3. **Phone (TouchOSC)**: Connect to `HOST_IP:8000`
4. **Telegram**: Send messages to your configured bot

## 💡 Tips & Best Practices

### Performance Optimization
- Use lower inference steps (20-30) for real-time performance
- Disable unnecessary visual effects on slower devices
- Consider reducing ControlNet scales for better performance

### Creative Workflows
- Start with ControlNet presets to establish artistic style
- Use Telegram for collaborative prompt creation
- Combine multiple input modes for complex compositions
- Record sessions for later playback and editing

### Live Performance
- Set up TouchOSC layouts in advance
- Test OSC connections before performances
- Use the multi-touch XY pads for expressive control
- Configure Telegram for audience interaction

## 📚 Advanced Configuration

### Custom ControlNet Presets
Edit the preset definitions in `local-osc-server.js` to create custom AI processing configurations.

### API Integration
The system supports multiple AI service providers. Configure your preferred service in the web interface.

### Development Mode
Set `DEBUG=true` in `start-diffusion-lab.sh` for verbose logging and development features.

---

**Need help?** Check the console output for detailed debugging information, or refer to the troubleshooting sections above.