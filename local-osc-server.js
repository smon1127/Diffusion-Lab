#!/usr/bin/env node
/**
 * Local OSC Server for WebGL Fluid Simulation
 * Runs on local network for TouchOSC control
 * Works with FTP-hosted fluid simulation
 */

const osc = require('node-osc');
const WebSocket = require('ws');
const os = require('os');

// Configuration
const OSC_PORT = 8000;
const WEBSOCKET_PORT = 8001;
const CORS_ORIGINS = ['*']; // Allow all origins for local network

class FluidOSCServer {
    constructor() {
        this.clients = new Set();
        this.oscServer = null;
        this.wsServer = null;
        this.networkIP = this.getNetworkIP();
        
        // Throttling for performance - limit OSC message rate
        this.lastMessageTime = {};
        this.throttleInterval = 16; // ~60fps (16ms between messages)
        

        
        // OSC parameter mapping
        this.oscMap = {
            // Fluid Physics
            '/fluid/density': { param: 'DENSITY_DISSIPATION', min: 0, max: 4, type: 'slider' },
            '/fluid/velocity': { param: 'VELOCITY_DISSIPATION', min: 0, max: 4, type: 'slider' },
            '/fluid/pressure': { param: 'PRESSURE', min: 0, max: 1, type: 'slider' },
            '/fluid/vorticity': { param: 'CURL', min: 0, max: 50, type: 'slider' },
            '/fluid/splat': { param: 'OSC_SPLAT_RADIUS', min: 0.01, max: 1, type: 'slider' },
            
            // Main Toggles
            '/toggle/paused': { param: 'PAUSED', type: 'toggle' },
            '/toggle/colorful': { param: 'COLORFUL', type: 'toggle' },
            '/toggle/animate': { param: 'ANIMATE', type: 'toggle' },
            
            // Visual Effects Toggles
            '/toggle/bloom': { param: 'BLOOM', type: 'toggle' },
            '/toggle/sunrays': { param: 'SUNRAYS', type: 'toggle' },
            '/toggle/shading': { param: 'SHADING', type: 'toggle' },
            '/toggle/transparent': { param: 'TRANSPARENT', type: 'toggle' },
            
            // Input Mode Toggles
            '/toggle/velocity_drawing': { param: 'VELOCITY_DRAWING', type: 'toggle' },
            '/toggle/fluid_drawing': { action: 'toggleFluidDrawing', type: 'button' },
            '/toggle/audio': { action: 'toggleAudioBlob', type: 'button' },
            '/toggle/camera': { action: 'toggleCamera', type: 'button' },
            '/toggle/media': { action: 'toggleMedia', type: 'button' },
            
            // Visual Effects Intensities
            '/visual/bloom_intensity': { param: 'BLOOM_INTENSITY', min: 0.1, max: 2, type: 'slider' },
            '/visual/sunray_weight': { param: 'SUNRAYS_WEIGHT', min: 0.3, max: 1, type: 'slider' },
            
            // Animation
            '/animation/animate': { param: 'ANIMATE', type: 'toggle' },
            '/animation/paused': { param: 'PAUSED', type: 'toggle' },
            '/animation/liveliness': { param: 'LIVELINESS', min: 0, max: 1, type: 'slider' },
            '/animation/chaos': { param: 'CHAOS', min: 0, max: 1, type: 'slider' },
            '/animation/breathing': { param: 'BREATHING', min: 0, max: 1, type: 'slider' },
            '/animation/color_life': { param: 'COLOR_LIFE', min: 0, max: 1, type: 'slider' },
            '/animation/interval': { param: 'ANIMATION_INTERVAL', min: 0, max: 1, type: 'slider' },
            
            // AI/ML Parameters
            '/ai/inference_steps': { param: 'INFERENCE_STEPS', min: 1, max: 100, type: 'slider' },
            '/ai/seed': { param: 'SEED', min: 0, max: 1000, type: 'slider' },
            '/ai/guidance_scale': { param: 'GUIDANCE_SCALE', min: 1, max: 20, type: 'slider' },
            '/ai/delta': { param: 'DELTA', min: 0, max: 1, type: 'slider' },
            
            // ControlNet
            '/controlnet/pose': { param: 'CONTROLNET_POSE_SCALE', min: 0, max: 1, type: 'slider' },
            '/controlnet/hed': { param: 'CONTROLNET_HED_SCALE', min: 0, max: 1, type: 'slider' },
            '/controlnet/canny': { param: 'CONTROLNET_CANNY_SCALE', min: 0, max: 1, type: 'slider' },
            '/controlnet/depth': { param: 'CONTROLNET_DEPTH_SCALE', min: 0, max: 1, type: 'slider' },
            '/controlnet/color': { param: 'CONTROLNET_COLOR_SCALE', min: 0, max: 1, type: 'slider' },
            
            // Denoise
            '/denoise/x': { param: 'DENOISE_X', min: 0, max: 45, type: 'slider' },
            '/denoise/y': { param: 'DENOISE_Y', min: 0, max: 45, type: 'slider' },
            '/denoise/z': { param: 'DENOISE_Z', min: 0, max: 45, type: 'slider' },
            
            // Audio
            '/audio/reactivity': { param: 'AUDIO_REACTIVITY', min: 0.1, max: 3.0, type: 'slider' },
            '/audio/delay': { param: 'AUDIO_DELAY', min: 0, max: 1, type: 'slider' },
            '/audio/opacity': { param: 'AUDIO_OPACITY', min: 0, max: 1, type: 'slider' },
            '/audio/colorful': { param: 'AUDIO_COLORFUL', min: 0, max: 1, type: 'slider' },
            '/audio/edge_softness': { param: 'AUDIO_EDGE_SOFTNESS', min: 0, max: 1, type: 'slider' },
            
            // Media Controls
            '/media/scale': { param: 'MEDIA_SCALE', min: 0.1, max: 2.0, type: 'slider' },
            '/media/background_scale': { param: 'BACKGROUND_IMAGE_SCALE', min: 0.1, max: 2.0, type: 'slider' },
            '/media/fluid_media_scale': { param: 'FLUID_MEDIA_SCALE', min: 0.1, max: 2.0, type: 'slider' },
            '/media/fluid_camera_scale': { param: 'FLUID_CAMERA_SCALE', min: 0.1, max: 2.0, type: 'slider' },
            
            // Input Modes (special handling)
            '/input/fluid_drawing': { action: 'toggleFluidDrawing', type: 'button' },
            '/input/audio': { action: 'toggleAudioBlob', type: 'button' },
            '/input/camera': { action: 'toggleCamera', type: 'button' },
            '/input/media': { action: 'toggleMedia', type: 'button' },
            
            // Brush/Fluid Colors (RGB format, values 0-1)
            '/brush/r': { param: 'STATIC_COLOR.r', min: 0, max: 1, type: 'slider' },
            '/brush/g': { param: 'STATIC_COLOR.g', min: 0, max: 1, type: 'slider' },
            '/brush/b': { param: 'STATIC_COLOR.b', min: 0, max: 1, type: 'slider' },
            '/brush/rgb': { param: 'STATIC_COLOR', type: 'color' },
            
            '/color/background/r': { param: 'BACK_COLOR.r', min: 0, max: 1, type: 'slider' },
            '/color/background/g': { param: 'BACK_COLOR.g', min: 0, max: 1, type: 'slider' },
            '/color/background/b': { param: 'BACK_COLOR.b', min: 0, max: 1, type: 'slider' },
            '/color/background/rgb': { param: 'BACK_COLOR', type: 'color' },
            
            // Actions
            '/action/reset': { action: 'resetValues', type: 'button' },
            '/action/screenshot': { action: 'captureScreenshot', type: 'button' },
            '/action/record': { action: 'toggleVideoRecording', type: 'button' },
            
            // TouchOSC XY Pad Support (your primary format)
            '/multixy/1': { channel: 1, type: 'xy_pad' },
            '/multixy/2': { channel: 2, type: 'xy_pad' },
            '/multixy/3': { channel: 3, type: 'xy_pad' },
            '/multixy/4': { channel: 4, type: 'xy_pad' },
            '/multixy/5': { channel: 5, type: 'xy_pad' },
            
        };
    }
    
    getNetworkIP() {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                // Skip internal and non-IPv4 addresses
                if (iface.family === 'IPv4' && !iface.internal) {
                    return iface.address;
                }
            }
        }
        return 'localhost';
    }
    
    start() {
        this.startOSCServer();
        this.startWebSocketServer();
        this.printStartupInfo();
    }
    
    startOSCServer() {
        this.oscServer = new osc.Server(OSC_PORT, '0.0.0.0', () => {
            console.log(`🎛️  OSC Server listening on ${this.networkIP}:${OSC_PORT}`);
        });
        
        this.oscServer.on('message', (msg) => {
            this.handleOSCMessage(msg);
        });
        
        this.oscServer.on('error', (err) => {
            console.error('❌ OSC Server error:', err);
        });
    }
    
    startWebSocketServer() {
        this.wsServer = new WebSocket.Server({ 
            port: WEBSOCKET_PORT,
            host: '0.0.0.0'
        });
        
        this.wsServer.on('connection', (ws, req) => {
            const clientIP = req.socket.remoteAddress;
            console.log(`🔌 WebSocket client connected from ${clientIP}`);
            
            this.clients.add(ws);
            
            // Send welcome message with server info
            ws.send(JSON.stringify({
                type: 'server_info',
                networkIP: this.networkIP,
                oscPort: OSC_PORT,
                websocketPort: WEBSOCKET_PORT,
                availableAddresses: Object.keys(this.oscMap)
            }));
            
            ws.on('close', () => {
                this.clients.delete(ws);
                console.log(`🔌 WebSocket client disconnected from ${clientIP}`);
            });
            
            ws.on('error', (err) => {
                console.error('❌ WebSocket error:', err);
                this.clients.delete(ws);
            });
        });
        
        console.log(`🌐 WebSocket Server listening on ${this.networkIP}:${WEBSOCKET_PORT}`);
    }
    
    handleOSCMessage(msg) {
        const [address, ...args] = msg;
        const value = args.length === 1 ? args[0] : args;
        
        // Throttle messages for performance
        const now = Date.now();
        const lastTime = this.lastMessageTime[address] || 0;
        
        if (now - lastTime < this.throttleInterval) {
            // Skip this message - too frequent
            return;
        }
        
        this.lastMessageTime[address] = now;
        console.log(`📨 OSC: ${address} = ${value}`);
        
        const mapping = this.oscMap[address];
        if (!mapping) {
            console.log(`⚠️  Unknown OSC address: ${address}`);
            return;
        }
        
        // Process the message based on type
        let processedValue = value;
        
        if (mapping.type === 'slider') {
            // Normalize value to 0-1 range, then scale to parameter range
            const normalizedValue = Math.max(0, Math.min(1, value));
            if (mapping.min !== undefined && mapping.max !== undefined) {
                processedValue = mapping.min + (normalizedValue * (mapping.max - mapping.min));
            }
        } else if (mapping.type === 'toggle') {
            processedValue = value > 0;
        } else if (mapping.type === 'color') {
            // Handle RGB color messages (expects array [r, g, b] with values 0-1)
            if (Array.isArray(value) && value.length >= 3) {
                processedValue = {
                    r: Math.max(0, Math.min(1, value[0])),
                    g: Math.max(0, Math.min(1, value[1])),
                    b: Math.max(0, Math.min(1, value[2]))
                };
            } else {
                console.log(`⚠️  Invalid color value: ${value}. Expected [r, g, b] array.`);
                return;
            }
        } else if (mapping.type === 'position') {
            // Handle splat position trigger (expects array [x, y] or [x, y, force])
            if (Array.isArray(value) && value.length >= 2) {
                processedValue = {
                    x: Math.max(0, Math.min(1, value[0])),
                    y: Math.max(0, Math.min(1, value[1])),
                    force: value.length >= 3 ? Math.max(0.1, Math.min(3.0, value[2])) : 1.0
                };
            } else {
                console.log(`⚠️  Invalid position value: ${value}. Expected [x, y] or [x, y, force] array.`);
                return;
            }
        } else if (mapping.type === 'xy_pad') {
            // Handle TouchOSC XY pad format - simple X/Y coordinates only
            const channel = mapping.channel;
            
            // TouchOSC sends two separate arguments: args[0] = y, args[1] = x (flipped for multixy)
            if (args.length >= 2 && typeof args[0] === 'number' && typeof args[1] === 'number') {
                const x = 1.0 - Math.max(0, Math.min(1, args[1])); // Flipped X: use args[1] and invert (1-x)
                const y = Math.max(0, Math.min(1, args[0])); // Flipped: use args[0] for Y
                
                // Send simple X/Y coordinates
                const xMessage = {
                    type: 'osc_message',
                    parameter: `OSC_SPLAT_${channel}_X`,
                    value: x
                };
                
                const yMessage = {
                    type: 'osc_message',
                    parameter: `OSC_SPLAT_${channel}_Y`,
                    value: y
                };
                
                // Broadcast to WebSocket clients
                this.clients.forEach(client => {
                    if (client.readyState === 1) { // WebSocket.OPEN
                        client.send(JSON.stringify(xMessage));
                        client.send(JSON.stringify(yMessage));
                    }
                });
                
                console.log(`🎯 TouchOSC XY Pad ${channel}: X=${x.toFixed(3)}, Y=${y.toFixed(3)}`);
                return; // Already broadcast, don't continue
            } else if (Array.isArray(value) && value.length >= 2) {
                // Fallback: XY pad sending [y, x] array (flipped for multixy)
                const x = 1.0 - Math.max(0, Math.min(1, value[1])); // Flipped X: use value[1] and invert (1-x)
                const y = Math.max(0, Math.min(1, value[0])); // Flipped: use value[0] for Y
                
                const xMessage = {
                    type: 'osc_message',
                    parameter: `OSC_SPLAT_${channel}_X`,
                    value: x
                };
                
                const yMessage = {
                    type: 'osc_message',
                    parameter: `OSC_SPLAT_${channel}_Y`,
                    value: y
                };
                
                this.clients.forEach(client => {
                    if (client.readyState === 1) {
                        client.send(JSON.stringify(xMessage));
                        client.send(JSON.stringify(yMessage));
                    }
                });
                
                console.log(`🎯 TouchOSC XY Pad ${channel}: X=${x.toFixed(3)}, Y=${y.toFixed(3)}`);
                return;
            } else {
                console.log(`⚠️  TouchOSC XY Pad ${channel}: Expected 2 args, got ${args.length}: [${args.join(', ')}]`);
                return;
            }
        }
        
        // Send to all connected WebSocket clients
        const message = {
            type: 'osc_message',
            address: address,
            parameter: mapping.param || null,
            action: mapping.action || null,
            value: processedValue,
            originalValue: value,
            mappingType: mapping.type
        };
        
        this.broadcastToClients(message);
    }
    
    broadcastToClients(message) {
        const messageStr = JSON.stringify(message);
        
        this.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(messageStr);
            }
        });
    }
    
    printStartupInfo() {
        console.log(`
🚀 Fluid OSC Server Started
============================
🌐 Network IP: ${this.networkIP}
🎛️  OSC Port: ${OSC_PORT}
🔌 WebSocket: ${WEBSOCKET_PORT}

📱 TouchOSC Setup:
   Host: ${this.networkIP}
   Port (outgoing): ${OSC_PORT}
   
🌐 Website Setup:
   Upload fluid files to FTP
   Access via: http://your-ftp-domain.com
   OSC will auto-connect to: ${this.networkIP}:${WEBSOCKET_PORT}
   
📋 Available OSC Addresses: ${Object.keys(this.oscMap).length} total
   
💡 Examples:
   /fluid/density 0.5
   /visual/bloom 1
   /animation/chaos 0.8
   /action/screenshot 1
   /splat/trigger [0.5, 0.5, 2.0]
   
🛑 Press Ctrl+C to stop
`);
    }
    
    stop() {
        console.log('\n🛑 Shutting down OSC server...');
        
        if (this.oscServer) {
            this.oscServer.close();
        }
        
        if (this.wsServer) {
            this.wsServer.close();
        }
        
        console.log('✅ Server stopped');
        process.exit(0);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    if (server) {
        server.stop();
    }
});

process.on('SIGTERM', () => {
    if (server) {
        server.stop();
    }
});

// Start the server
const server = new FluidOSCServer();
server.start();
