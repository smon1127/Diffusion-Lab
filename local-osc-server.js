#!/usr/bin/env node
/**
 * Local OSC Server for WebGL Fluid Simulation
 * Runs on local network for TouchOSC control
 * Works with FTP-hosted fluid simulation
 */

const osc = require('node-osc');
const WebSocket = require('ws');
const os = require('os');
const TelegramBot = require('node-telegram-bot-api');

// Configuration
const OSC_PORT = 8000;
const WEBSOCKET_PORT = 8001;
const CORS_ORIGINS = ['*']; // Allow all origins for local network

// Telegram Bot Configuration
let TELEGRAM_BOT_TOKEN = '';

class FluidOSCServer {
    constructor() {
        this.clients = new Set();
        this.oscServer = null;
        this.wsServer = null;
        this.telegramBot = null;
        this.networkIP = this.getNetworkIP();
        
        // Telegram waitlist tracking
        this.telegramWaitlist = [];
        this.waitlistInterval = 1; // Default 1 second
        this.processingTimer = null; // Timer for processing queue
        
        // Throttling for performance - limit OSC message rate
        this.lastMessageTime = {};
        this.throttleInterval = 16; // ~60fps (16ms between messages)
        
        // OSC velocity tracking for velocity-based drawing
        this.oscPointers = {}; // Track position and movement for each channel
        

        
        // Preset definitions
        this.promptPresets = [
            {
                name: 'Blooming Flower',
                prompt: 'blooming flower with delicate petals, vibrant colors, soft natural lighting, botanical beauty, detailed macro photography, spring garden atmosphere'
            },
            {
                name: 'Fireworks',
                prompt: 'spectacular fireworks display, colorful explosions in night sky, bright sparks and trails, celebration atmosphere, dynamic motion, festive lighting'
            },
            {
                name: 'Cotton Candy',
                prompt: 'fluffy cotton candy texture, pastel pink and blue swirls, soft dreamy atmosphere, sweet confection, carnival vibes, whimsical and light'
            },
            {
                name: 'Bouncing Balls',
                prompt: 'bouncing colorful balls in motion, dynamic movement, playful energy, vibrant spheres, kinetic art, fun and energetic atmosphere'
            },
            {
                name: 'Forest Leaves',
                prompt: 'autumn forest leaves falling, golden and red foliage, gentle breeze, natural beauty, seasonal colors, peaceful woodland scene'
            },
            {
                name: 'Chrome Blob',
                prompt: 'chrome liquid metal waves, reflective surface, fluid dynamics, metallic sheen, futuristic aesthetic, smooth flowing motion'
            }
        ];

        this.controlNetPresets = {
            balanced: {
                name: 'Balanced',
                description: 'Good for general use with moderate control',
                params: {
                    CONTROLNET_POSE_SCALE: 0.65,
                    CONTROLNET_HED_SCALE: 0.41,
                    CONTROLNET_CANNY_SCALE: 0.00,
                    CONTROLNET_DEPTH_SCALE: 0.21,
                    CONTROLNET_COLOR_SCALE: 0.26,
                    DENOISE_X: 3,
                    DENOISE_Y: 6,
                    DENOISE_Z: 6
                }
            },
            portrait: {
                name: 'Portrait',
                description: 'Optimized for human subjects with strong pose control',
                params: {
                    CONTROLNET_POSE_SCALE: 0.85,
                    CONTROLNET_HED_SCALE: 0.70,
                    CONTROLNET_CANNY_SCALE: 0.40,
                    CONTROLNET_DEPTH_SCALE: 0.60,
                    CONTROLNET_COLOR_SCALE: 0.75,
                    DENOISE_X: 2,
                    DENOISE_Y: 4,
                    DENOISE_Z: 6
                }
            },
            composition: {
                name: 'Composition',
                description: 'Strong structural control with Canny and Depth',
                params: {
                    CONTROLNET_POSE_SCALE: 0.40,
                    CONTROLNET_HED_SCALE: 0.45,
                    CONTROLNET_CANNY_SCALE: 0.80,
                    CONTROLNET_DEPTH_SCALE: 0.75,
                    CONTROLNET_COLOR_SCALE: 0.35,
                    DENOISE_X: 4,
                    DENOISE_Y: 8,
                    DENOISE_Z: 12
                }
            },
            artistic: {
                name: 'Artistic',
                description: 'More creative freedom with subtle controls',
                params: {
                    CONTROLNET_POSE_SCALE: 0.30,
                    CONTROLNET_HED_SCALE: 0.75,
                    CONTROLNET_CANNY_SCALE: 0.25,
                    CONTROLNET_DEPTH_SCALE: 0.35,
                    CONTROLNET_COLOR_SCALE: 0.40,
                    DENOISE_X: 6,
                    DENOISE_Y: 12,
                    DENOISE_Z: 18
                }
            }
        };

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
            // FORCE_CLICK removed - mouse-only feature, should not be controlled via OSC
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
            
            // Telegram Controls
            '/telegram/receive': { action: 'toggleTelegramReceive', type: 'toggle' },
            '/telegram/clear': { action: 'clearTelegramWaitlist', type: 'button' },
            '/telegram/interval': { param: 'TELEGRAM_WAITLIST_INTERVAL', min: 1, max: 30, type: 'slider' },
            
            // TouchOSC XY Pad Support (your primary format)
            '/multixy/1': { channel: 1, type: 'xy_pad' },
            '/multixy/2': { channel: 2, type: 'xy_pad' },
            '/multixy/3': { channel: 3, type: 'xy_pad' },
            '/multixy/4': { channel: 4, type: 'xy_pad' },
            '/multixy/5': { channel: 5, type: 'xy_pad' },
            
        };
    }
    
    handleVelocityDrawing(channel, x, y) {
        const pointerId = `osc_${channel}`;
        const currentTime = Date.now();
        
        // Track OSC pointer velocity for smooth drawing
        
        // Get or create pointer for this channel
        if (!this.oscPointers[pointerId]) {
            this.oscPointers[pointerId] = {
                x: x,
                y: y,
                prevX: x,
                prevY: y,
                lastTime: currentTime,
                isActive: true
            };
            

            
            // Send initial position without velocity (like mouse down)
            this.sendVelocityDrawingMessage(channel, x, y, 0, 0, 'start');

            return;
        }
        
        const pointer = this.oscPointers[pointerId];
        const deltaTime = currentTime - pointer.lastTime;
        
        // Calculate movement deltas
        const deltaX = x - pointer.prevX;
        const deltaY = y - pointer.prevY;
        
        // Calculate velocity (movement per second)
        const velocity = deltaTime > 0 ? Math.sqrt(deltaX * deltaX + deltaY * deltaY) / (deltaTime / 1000) : 0;
        
        // Update pointer state
        pointer.prevX = pointer.x;
        pointer.prevY = pointer.y;
        pointer.x = x;
        pointer.y = y;
        pointer.lastTime = currentTime;
        
        // Send velocity-based drawing message
        this.sendVelocityDrawingMessage(channel, x, y, deltaX, deltaY, 'move');
        
        console.log(`🎯 OSC Velocity Drawing ${channel}: (${x.toFixed(3)}, ${y.toFixed(3)}) v=${velocity.toFixed(2)} Δ(${deltaX.toFixed(3)}, ${deltaY.toFixed(3)})`);
    }
    
    sendVelocityDrawingMessage(channel, x, y, deltaX, deltaY, type) {
        const message = {
            type: 'osc_velocity_drawing',
            channel: channel,
            x: x,
            y: y,
            deltaX: deltaX,
            deltaY: deltaY,
            drawingType: type
        };
        
        // Broadcast to WebSocket clients
        this.clients.forEach(client => {
            if (client.readyState === 1) { // WebSocket.OPEN
                client.send(JSON.stringify(message));
            }
        });
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
        // Telegram bot will be started when token is received from client
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
            
            // Handle messages from client
            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleClientMessage(message);
                } catch (error) {
                    console.error('❌ Error parsing client message:', error);
                }
            });
            
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
    
    handleClientMessage(message) {
        switch (message.type) {
            case 'telegram_prompt_applied':
                // Client notifies that a prompt has been applied
                const appliedEntry = this.removeFromWaitlist(message.promptId);
                if (appliedEntry && appliedEntry.chatId) {
                    if (message.isPreset && message.presetName) {
                        // Send preset-specific feedback
                        this.sendPromptPresetAppliedFeedback(appliedEntry.chatId, message.presetName, appliedEntry.prompt, appliedEntry.from);
                    } else {
                        // Send regular prompt feedback
                        this.sendPromptAppliedFeedback(appliedEntry.chatId, appliedEntry.prompt, appliedEntry.from);
                    }
                }
                break;
                
            case 'controlnet_preset_applied':
                // Client notifies that a ControlNet preset has been applied
                const appliedPreset = this.removeFromWaitlistByPreset(message.presetName, message.chatId);
                if (appliedPreset && appliedPreset.chatId) {
                    this.sendControlNetPresetAppliedFeedback(appliedPreset.chatId, appliedPreset.presetName, appliedPreset.presetDescription, appliedPreset.from);
                }
                break;
                
            case 'telegram_waitlist_interval_changed':
                // Client notifies of interval change
                this.updateWaitlistInterval(message.interval);
                break;
                
            case 'telegram_waitlist_cleared':
                // Client notifies that waitlist was cleared
                this.telegramWaitlist = [];
                this.stopTelegramProcessing();
                console.log('📱 Server waitlist cleared by client');
                break;
                
            case 'telegram_token_updated':
                // Client sends updated Telegram token
                this.updateTelegramToken(message.token);
                break;
                
            default:
                console.log('📱 Unknown client message type:', message.type);
        }
    }
    
    sendQueueStatusFeedback(chatId, waitlistEntry) {
        if (!this.telegramBot) return;
        
        const position = this.telegramWaitlist.findIndex(item => item.id === waitlistEntry.id) + 1;
        const queueLength = this.telegramWaitlist.length;
        
        // Calculate actual estimated wait time based on processing timeline
        let estimatedWaitSeconds = 0;
        let expectedTime = new Date();
        
        if (position === 1) {
            // First in queue - will be processed within the current interval
            estimatedWaitSeconds = 0;
            expectedTime = new Date(Date.now() + (this.waitlistInterval * 1000));
        } else {
            // Calculate based on when this item will actually be processed
            // If there's a first item, calculate from when it was added
            const firstItem = this.telegramWaitlist[0];
            if (firstItem && firstItem.addedAt) {
                const firstItemWaitTime = (Date.now() - firstItem.addedAt) / 1000;
                const remainingTimeForFirst = Math.max(0, this.waitlistInterval - firstItemWaitTime);
                // This item will be processed after (position-1) intervals, minus time already elapsed
                estimatedWaitSeconds = remainingTimeForFirst + ((position - 2) * this.waitlistInterval);
            } else {
                // Fallback to old calculation if addedAt is not available
                estimatedWaitSeconds = (position - 1) * this.waitlistInterval;
            }
            expectedTime = new Date(Date.now() + (estimatedWaitSeconds * 1000));
        }
        
        // Customize message based on preset type
        const isControlNetPreset = waitlistEntry.type === 'controlnet_preset';
        const icon = isControlNetPreset ? '⚙️' : '📝';
        const itemType = isControlNetPreset ? 'ControlNet preset' : 'Prompt';
        
        let message = `${icon} ${itemType} added to queue: "${waitlistEntry.prompt}"\n\n`;
        
        if (position === 1) {
            message += `🎯 Position: #${position} (next to be processed)\n`;
            message += `⏱️ Expected processing: within ${this.waitlistInterval} seconds\n`;
            message += `⚙️ Current interval: ${this.waitlistInterval}s`;
        } else {
            message += `📍 Position: #${position} of ${queueLength}\n`;
            
            // Show seconds if less than 60 seconds, otherwise show minutes
            if (estimatedWaitSeconds < 60) {
                const displaySeconds = Math.max(0, Math.ceil(estimatedWaitSeconds));
                message += `⏳ Estimated wait: ~${displaySeconds} second${displaySeconds !== 1 ? 's' : ''}\n`;
            } else {
                const estimatedWaitMinutes = Math.ceil(estimatedWaitSeconds / 60);
                message += `⏳ Estimated wait: ~${estimatedWaitMinutes} minute${estimatedWaitMinutes !== 1 ? 's' : ''}\n`;
            }
            
            message += `🕐 Expected processing: ${expectedTime.toLocaleTimeString('de-DE', { hour12: false })}\n`;
            message += `⚙️ Current interval: ${this.waitlistInterval}s`;
        }
        
        this.telegramBot.sendMessage(chatId, message);
        console.log(`📱 Sent queue status to ${waitlistEntry.from}: position ${position}/${queueLength}`);
    }
    
    sendPromptAppliedFeedback(chatId, prompt, from) {
        if (!this.telegramBot) return;
        
        const timestamp = new Date().toLocaleString();
        const message = `✅ Your prompt has been applied!\n\n` +
                       `🎨 "${prompt}"\n\n` +
                       `⏰ Applied at: ${timestamp}\n\n` +
                       `The fluid simulation is now using your prompt. Enjoy! 🌊`;
        
        this.telegramBot.sendMessage(chatId, message);
        console.log(`📱 Sent application confirmation to ${from}`);
    }
    
    sendToPublicGroup(waitlistEntry) {
        if (!this.telegramBot) return;
        
        const position = this.telegramWaitlist.findIndex(item => item.id === waitlistEntry.id) + 1;
        const queueLength = this.telegramWaitlist.length;
        
        // Use the same improved calculation as in sendQueueStatusFeedback
        let estimatedWaitSeconds = 0;
        let expectedTime = new Date();
        
        if (position === 1) {
            // First in queue - will be processed within the current interval
            estimatedWaitSeconds = 0;
            expectedTime = new Date(Date.now() + (this.waitlistInterval * 1000));
        } else {
            // Calculate based on when this item will actually be processed
            const firstItem = this.telegramWaitlist[0];
            if (firstItem && firstItem.addedAt) {
                const firstItemWaitTime = (Date.now() - firstItem.addedAt) / 1000;
                const remainingTimeForFirst = Math.max(0, this.waitlistInterval - firstItemWaitTime);
                estimatedWaitSeconds = remainingTimeForFirst + ((position - 2) * this.waitlistInterval);
            } else {
                // Fallback to old calculation if addedAt is not available
                estimatedWaitSeconds = (position - 1) * this.waitlistInterval;
            }
            expectedTime = new Date(Date.now() + (estimatedWaitSeconds * 1000));
        }
        
        // Customize message based on preset type
        const isControlNetPreset = waitlistEntry.type === 'controlnet_preset';
        const icon = isControlNetPreset ? '⚙️' : '🎨';
        const itemType = isControlNetPreset ? 'ControlNet preset' : 'prompt';
        
        let message = `${icon} New ${itemType} in queue: "${waitlistEntry.prompt}"\n`;
        message += `👤 From: ${waitlistEntry.from}\n`;
        message += `📍 Position: #${position} of ${queueLength}\n`;
        
        if (position === 1) {
            message += `⏱️ Processing: within ${this.waitlistInterval} seconds\n`;
        } else {
            // Show seconds if less than 60 seconds, otherwise show minutes
            if (estimatedWaitSeconds < 60) {
                const displaySeconds = Math.max(0, Math.ceil(estimatedWaitSeconds));
                message += `⏳ Estimated wait: ~${displaySeconds} second${displaySeconds !== 1 ? 's' : ''}\n`;
            } else {
                const estimatedWaitMinutes = Math.ceil(estimatedWaitSeconds / 60);
                message += `⏳ Estimated wait: ~${estimatedWaitMinutes} minute${estimatedWaitMinutes !== 1 ? 's' : ''}\n`;
            }
            message += `🕐 Expected processing: ${expectedTime.toLocaleTimeString('de-DE', { hour12: false })}\n`;
        }
        
        message += `⚙️ Interval: ${this.waitlistInterval}s`;
        
        // Send to public group using channel username
        this.telegramBot.sendMessage('@diffusionprompts', message).catch(error => {
            console.error('❌ Failed to send to public group:', error.message);
        });
        
        console.log(`📢 Sent to public group: "${waitlistEntry.prompt}" from ${waitlistEntry.from}`);
    }
    
    updateWaitlistInterval(newInterval) {
        this.waitlistInterval = newInterval;
        console.log(`📱 Updated waitlist interval to ${newInterval} seconds`);
        
        // Restart processing timer with new interval
        if (this.processingTimer) {
            this.stopTelegramProcessing();
            if (this.telegramWaitlist.length > 0) {
                this.startTelegramProcessing();
            }
        }
    }
    
    startTelegramProcessing() {
        if (this.processingTimer) return; // Already running
        
        const interval = this.waitlistInterval * 1000; // Convert to milliseconds
        
        this.processingTimer = setInterval(() => {
            this.processNextTelegramPrompt();
        }, interval);
        
        console.log(`📱 Started server-side Telegram processing timer (${this.waitlistInterval}s intervals)`);
    }
    
    stopTelegramProcessing() {
        if (this.processingTimer) {
            clearInterval(this.processingTimer);
            this.processingTimer = null;
            console.log('📱 Stopped server-side Telegram processing timer');
        }
    }
    
    processNextTelegramPrompt() {
        if (this.telegramWaitlist.length === 0) {
            this.stopTelegramProcessing();
            return;
        }
        
        const nextItem = this.telegramWaitlist.shift(); // Remove first item (FIFO)
        console.log(`📱 Server processing: "${nextItem.prompt}" from ${nextItem.from} (type: ${nextItem.type || 'prompt'})`);
        
        // Send apply message to all connected clients
        const applyMessage = {
            type: nextItem.type === 'controlnet_preset' ? 'apply_controlnet_preset' : 'apply_telegram_prompt',
            ...nextItem // Include all the original data
        };
        
        this.broadcastToClients(applyMessage);
        console.log(`📱 Sent apply message to clients for: "${nextItem.prompt}"`);
    }
    
    updateTelegramToken(newToken) {
        TELEGRAM_BOT_TOKEN = newToken || '';
        console.log(`📱 Updated Telegram bot token: ${newToken && newToken.trim() ? 'Token set' : 'Token cleared'}`);
        
        // Stop current bot first
        this.stopTelegramBot();
        
        // Start bot with new token if provided and not empty
        if (newToken && newToken.trim()) {
            this.startTelegramBot();
        }
    }
    
    removeFromWaitlist(promptId) {
        const index = this.telegramWaitlist.findIndex(item => item.id === promptId);
        if (index !== -1) {
            const removed = this.telegramWaitlist.splice(index, 1)[0];
            console.log(`📱 Removed from server waitlist: "${removed.prompt}" from ${removed.from}`);
            return removed;
        }
        return null;
    }

    removeFromWaitlistByPreset(presetName, chatId) {
        const index = this.telegramWaitlist.findIndex(item => 
            item.type === 'controlnet_preset' && 
            item.presetKey === presetName && 
            item.chatId === chatId
        );
        if (index !== -1) {
            const removed = this.telegramWaitlist.splice(index, 1)[0];
            console.log(`📱 Removed ControlNet preset from server waitlist: "${removed.presetName}" from ${removed.from}`);
            return removed;
        }
        return null;
    }

    sendControlNetPresetAppliedFeedback(chatId, presetName, presetDescription, from) {
        if (!this.telegramBot) return;
        
        const timestamp = new Date().toLocaleString();
        const message = `✅ **${presetName}** preset has been applied!\n\n` +
                       `⚙️ ${presetDescription}\n\n` +
                       `⏰ Applied at: ${timestamp}\n\n` +
                       `The fluid simulation parameters have been updated! 🌊`;
        
        this.telegramBot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        console.log(`📱 Sent ControlNet preset application confirmation to ${from}`);
    }

    sendPromptPresetAppliedFeedback(chatId, presetName, prompt, from) {
        if (!this.telegramBot) return;
        
        const timestamp = new Date().toLocaleString();
        const message = `✅ **${presetName}** preset applied!\n\n` +
                       `🎨 "${prompt}"\n\n` +
                       `⏰ Applied at: ${timestamp}\n\n` +
                       'The fluid simulation is now using this visual theme! 🌊';
        
        this.telegramBot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        console.log(`📱 Sent prompt preset application confirmation to ${from}`);
    }
    
    startTelegramBot() {
        // Check if token is provided before attempting to start
        if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN.trim() === '') {
            console.log('📱 Telegram bot token not provided - Telegram functionality disabled');
            return;
        }
        
        try {
            this.telegramBot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
            console.log('📱 Telegram bot started successfully - ready to receive messages');
            
            // Handle text messages
            this.telegramBot.on('message', (msg) => {
                const chatId = msg.chat.id;
                const messageText = msg.text;
                
                // Skip if it's a command (starts with /)
                if (messageText && !messageText.startsWith('/')) {
                    console.log(`📱 Telegram message from ${msg.from.first_name || 'Unknown'}: ${messageText}`);
                    
                    // Add to server-side waitlist tracking
                    const waitlistEntry = {
                        prompt: messageText,
                        from: msg.from.first_name || 'Unknown User',
                        chatId: chatId,
                        timestamp: new Date().toLocaleString(),
                        id: Date.now() + Math.random(),
                        addedAt: Date.now() // Add timestamp for accurate wait calculations
                    };
                    
                    this.telegramWaitlist.push(waitlistEntry);
                    
                    // Send queue status feedback
                    this.sendQueueStatusFeedback(chatId, waitlistEntry);
                    
                    // Also send to public group
                    this.sendToPublicGroup(waitlistEntry);
                    
                    // Start processing if this is the first item
                    if (this.telegramWaitlist.length === 1 && !this.processingTimer) {
                        this.startTelegramProcessing();
                    }
                }
            });
            
            // Handle /start command
            this.telegramBot.onText(/\/start/, (msg) => {
                const chatId = msg.chat.id;
                this.telegramBot.sendMessage(chatId, 
                    '🌊 Welcome to Diffusion Prompt Bot!\n\n' +
                    'Send me any text message and I\'ll use it as a prompt for the fluid simulation.\n\n' +
                    'Commands:\n' +
                    '• /preset - View and apply preset configurations\n' +
                    '• Just type your prompt and send it!\n\n' +
                    'Examples:\n' +
                    '• "cosmic nebula with swirling colors"\n' +
                    '• "underwater coral reef scene"\n' +
                    '• "abstract geometric patterns"\n\n' +
                    'Let\'s create something amazing! 🎨'
                );
            });

            // Handle /preset command
            this.telegramBot.onText(/\/preset/, (msg) => {
                const chatId = msg.chat.id;
                
                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '🎨 Prompt Presets', callback_data: 'show_prompt_presets' },
                            { text: '⚙️ ControlNet Presets', callback_data: 'show_controlnet_presets' }
                        ]
                    ]
                };

                this.telegramBot.sendMessage(chatId, 
                    '🎛️ **Preset Categories**\n\n' +
                    '**Prompt Presets**: Ready-made visual themes and styles\n' +
                    '**ControlNet Presets**: Parameter configurations for different control modes\n\n' +
                    'Choose a category to see available presets:', 
                    { 
                        reply_markup: keyboard,
                        parse_mode: 'Markdown'
                    }
                );
            });

            // Handle callback queries for preset interactions
            this.telegramBot.on('callback_query', (callbackQuery) => {
                const msg = callbackQuery.message;
                const chatId = msg.chat.id;
                const data = callbackQuery.data;

                // Answer the callback query to remove loading state
                this.telegramBot.answerCallbackQuery(callbackQuery.id);

                if (data === 'show_prompt_presets') {
                    this.sendPromptPresets(chatId);
                } else if (data === 'show_controlnet_presets') {
                    this.sendControlNetPresets(chatId);
                } else if (data.startsWith('apply_prompt_')) {
                    const presetIndex = parseInt(data.split('_')[2]);
                    this.applyPromptPreset(chatId, presetIndex);
                } else if (data.startsWith('apply_controlnet_')) {
                    const presetKey = data.split('_')[2];
                    this.applyControlNetPreset(chatId, presetKey);
                } else if (data === 'back_to_presets') {
                    // Show main preset menu again
                    const keyboard = {
                        inline_keyboard: [
                            [
                                { text: '🎨 Prompt Presets', callback_data: 'show_prompt_presets' },
                                { text: '⚙️ ControlNet Presets', callback_data: 'show_controlnet_presets' }
                            ]
                        ]
                    };

                    this.telegramBot.editMessageText(
                        '🎛️ **Preset Categories**\n\n' +
                        '**Prompt Presets**: Ready-made visual themes and styles\n' +
                        '**ControlNet Presets**: Parameter configurations for different control modes\n\n' +
                        'Choose a category to see available presets:', 
                        {
                            chat_id: chatId,
                            message_id: msg.message_id,
                            reply_markup: keyboard,
                            parse_mode: 'Markdown'
                        }
                    );
                }
            });
            
            // Handle errors
            this.telegramBot.on('error', (error) => {
                console.error('❌ Telegram Bot error:', error);
            });
            
            console.log('📱 Telegram Bot started successfully');
            
        } catch (error) {
            console.error('❌ Failed to start Telegram Bot:', error);
            console.log('⚠️  Continuing without Telegram Bot functionality...');
        }
    }
    
    stopTelegramBot() {
        if (this.telegramBot) {
            try {
                this.telegramBot.stopPolling();
                this.telegramBot = null;
                console.log('📱 Telegram Bot stopped successfully');
            } catch (error) {
                console.error('❌ Error stopping Telegram Bot:', error);
            }
        }
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
            // Handle TouchOSC XY pad format - velocity-based drawing
            const channel = mapping.channel;
            
            // TouchOSC sends two separate arguments: args[0] = y, args[1] = x (flipped for multixy)
            if (args.length >= 2 && typeof args[0] === 'number' && typeof args[1] === 'number') {
                const x = 1.0 - Math.max(0, Math.min(1, args[1])); // Flipped X: use args[1] and invert (1-x)
                const y = Math.max(0, Math.min(1, args[0])); // Flipped: use args[0] for Y
                
                // Send velocity-based drawing only (old parameter system removed)
                this.handleVelocityDrawing(channel, x, y);
                
                console.log(`🎯 TouchOSC XY Pad ${channel}: X=${x.toFixed(3)}, Y=${y.toFixed(3)} (velocity drawing only)`);
                return;
            } else if (Array.isArray(value) && value.length >= 2) {
                // Fallback: XY pad sending [y, x] array (flipped for multixy)
                const x = 1.0 - Math.max(0, Math.min(1, value[1])); // Flipped X: use value[1] and invert (1-x)
                const y = Math.max(0, Math.min(1, value[0])); // Flipped: use value[0] for Y
                
                // Send velocity-based drawing only (old parameter system removed)
                this.handleVelocityDrawing(channel, x, y);
                
                console.log(`🎯 TouchOSC XY Pad ${channel}: X=${x.toFixed(3)}, Y=${y.toFixed(3)} (velocity drawing only)`);
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
        
        if (this.telegramBot) {
            this.telegramBot.stopPolling();
        }
        
        console.log('✅ Server stopped');
        process.exit(0);
    }

    sendPromptPresets(chatId) {
        const keyboard = {
            inline_keyboard: []
        };

        // Add preset buttons (2 per row)
        for (let i = 0; i < this.promptPresets.length; i += 2) {
            const row = [];
            row.push({ text: this.promptPresets[i].name, callback_data: `apply_prompt_${i}` });
            if (i + 1 < this.promptPresets.length) {
                row.push({ text: this.promptPresets[i + 1].name, callback_data: `apply_prompt_${i + 1}` });
            }
            keyboard.inline_keyboard.push(row);
        }

        // Add back button
        keyboard.inline_keyboard.push([{ text: '← Back to Categories', callback_data: 'back_to_presets' }]);

        this.telegramBot.sendMessage(chatId, 
            '🎨 **Prompt Presets**\n\n' +
            'Choose a visual theme to apply to your fluid simulation:\n\n' +
            this.promptPresets.map((preset, index) => `**${index + 1}.** ${preset.name}`).join('\n'), 
            { 
                reply_markup: keyboard,
                parse_mode: 'Markdown'
            }
        );
    }

    sendControlNetPresets(chatId) {
        const keyboard = {
            inline_keyboard: []
        };

        // Add preset buttons (2 per row)
        const presetKeys = Object.keys(this.controlNetPresets);
        for (let i = 0; i < presetKeys.length; i += 2) {
            const row = [];
            row.push({ text: this.controlNetPresets[presetKeys[i]].name, callback_data: `apply_controlnet_${presetKeys[i]}` });
            if (i + 1 < presetKeys.length) {
                row.push({ text: this.controlNetPresets[presetKeys[i + 1]].name, callback_data: `apply_controlnet_${presetKeys[i + 1]}` });
            }
            keyboard.inline_keyboard.push(row);
        }

        // Add back button
        keyboard.inline_keyboard.push([{ text: '← Back to Categories', callback_data: 'back_to_presets' }]);

        let message = '⚙️ **ControlNet Presets**\n\n' +
                     'Choose a parameter configuration:\n\n';
        
        Object.entries(this.controlNetPresets).forEach(([key, preset]) => {
            message += `**${preset.name}**: ${preset.description}\n`;
        });

        this.telegramBot.sendMessage(chatId, message, { 
            reply_markup: keyboard,
            parse_mode: 'Markdown'
        });
    }

    applyPromptPreset(chatId, presetIndex) {
        if (presetIndex < 0 || presetIndex >= this.promptPresets.length) {
            this.telegramBot.sendMessage(chatId, '❌ Invalid preset selection.');
            return;
        }

        const preset = this.promptPresets[presetIndex];
        
        // Add to server-side waitlist tracking (same as regular prompts)
        const waitlistEntry = {
            prompt: preset.prompt,
            from: 'Preset Bot',
            chatId: chatId,
            timestamp: new Date().toLocaleString(),
            id: Date.now() + Math.random(),
            addedAt: Date.now(), // Add timestamp for accurate wait calculations
            isPreset: true,
            presetName: preset.name
        };
        
        this.telegramWaitlist.push(waitlistEntry);
        
        // Send queue status feedback
        this.sendQueueStatusFeedback(chatId, waitlistEntry);
        
        // Also send to public group
        this.sendToPublicGroup(waitlistEntry);
        
        // Start processing if this is the first item
        if (this.telegramWaitlist.length === 1 && !this.processingTimer) {
            this.startTelegramProcessing();
        }

        console.log(`📱 Added prompt preset "${preset.name}" to queue for chat ${chatId}`);
    }

    applyControlNetPreset(chatId, presetKey) {
        if (!this.controlNetPresets[presetKey]) {
            this.telegramBot.sendMessage(chatId, '❌ Invalid preset selection.');
            return;
        }

        const preset = this.controlNetPresets[presetKey];
        
        // Add to server-side waitlist tracking (same as regular prompts)
        const waitlistEntry = {
            prompt: `ControlNet: ${preset.name}`, // Display name for queue
            from: 'Preset Bot',
            chatId: chatId,
            timestamp: new Date().toLocaleString(),
            id: Date.now() + Math.random(),
            addedAt: Date.now(), // Add timestamp for accurate wait calculations
            type: 'controlnet_preset', // Mark as ControlNet preset
            presetKey: presetKey,
            presetName: preset.name,
            presetDescription: preset.description,
            parameters: preset.params
        };
        
        this.telegramWaitlist.push(waitlistEntry);
        
        // Send ControlNet preset to clients via queue system
        const presetMessage = {
            type: 'controlnet_preset',
            presetName: presetKey,
            presetDisplayName: preset.name,
            presetDescription: preset.description,
            parameters: preset.params,
            from: 'Preset Bot',
            timestamp: new Date().toLocaleString(),
            chatId: chatId,
            isPreset: true
        };

        this.broadcastToClients(presetMessage);
        // Send queue status feedback (same as regular prompts)
        this.sendQueueStatusFeedback(chatId, waitlistEntry);
        
        // Also send to public group
        this.sendToPublicGroup(waitlistEntry);

        // Start processing if this is the first item
        if (this.telegramWaitlist.length === 1 && !this.processingTimer) {
            this.startTelegramProcessing();
        }
        console.log(`📱 Added ControlNet preset "${preset.name}" to queue for chat ${chatId}`);
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
