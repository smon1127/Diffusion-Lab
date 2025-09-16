/*
MIT License

Copyright (c) 2017 Pavel Dobryakov

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

'use strict';

// Mobile promo section - removed for modern UI

// Simulation section

let canvas = document.getElementById('fluidCanvas') || document.getElementsByTagName('canvas')[0];

// Mobile debugging for canvas initialization
if (isMobile()) {
    console.log('🔍 MOBILE DEBUG: Canvas initialization at script load');
    console.log('🔍 Canvas found:', !!canvas);
    console.log('🔍 Canvas ID:', canvas ? canvas.id : 'none');
    console.log('🔍 Total canvas elements:', document.getElementsByTagName('canvas').length);
    console.log('🔍 All canvas IDs:', Array.from(document.getElementsByTagName('canvas')).map(c => c.id));
}



// Ensure we have a canvas before proceeding
if (canvas) {
    resizeCanvas();
} else if (isMobile()) {
    console.log('🔍 MOBILE DEBUG: No canvas found at script load - will retry after DOM ready');
}

// Slider handle padding to prevent clipping at edges
const SLIDER_HANDLE_PADDING = 0.035; // 3.5% padding on each side

// Device-specific configuration presets
const desktopConfig = {
    SIM_RESOLUTION: 128,        // High-quality simulation for desktop
    DYE_RESOLUTION: 1024,       // High quality
    CAPTURE_RESOLUTION: 512,
    DENSITY_DISSIPATION: 1.0,    // Increased fade rate
    VELOCITY_DISSIPATION: 0.6,
    PRESSURE: 0.37,
    PRESSURE_ITERATIONS: 20,
    CURL: 4,                    // Swirl intensity
    SPLAT_RADIUS: 0.3,         // Increased brush size
    SPLAT_FORCE: 6000,
    SHADING: true,              // Enable 3D lighting effects for desktop
    COLORFUL: false,
    COLOR_UPDATE_SPEED: 10,
    PAUSED: false,
    BACK_COLOR: { r: 0, g: 0, b: 0 },
    STATIC_COLOR: { r: 0, g: 0.831, b: 1 },
    TRANSPARENT: false,
    BLOOM: true,                // Enable bloom for desktop
    BLOOM_ITERATIONS: 8,
    BLOOM_RESOLUTION: 256,
    BLOOM_INTENSITY: 0.4,
    BLOOM_THRESHOLD: 0.6,
    BLOOM_SOFT_KNEE: 0.7,
    SUNRAYS: true,              // Enable sunrays for desktop
    SUNRAYS_RESOLUTION: 196,
    SUNRAYS_WEIGHT: 0.4,
    VELOCITY_DRAWING: false,    // Velocity-based drawing intensity
    FORCE_CLICK: true           // Click burst effects (MOUSE ONLY - never affects OSC)
};

const mobileConfig = {
    SIM_RESOLUTION: 64,         // Lower resolution for mobile
    DYE_RESOLUTION: 512,        // Reduced quality for performance
    CAPTURE_RESOLUTION: 512,
    DENSITY_DISSIPATION: 1.0,    // Increased fade rate
    VELOCITY_DISSIPATION: 0.6,
    PRESSURE: 0.37,
    PRESSURE_ITERATIONS: 20,
    CURL: 4,                    // Swirl intensity
    SPLAT_RADIUS: 0.3,         // Increased brush size
    SPLAT_FORCE: 6000,
    SHADING: false,             // Disable 3D lighting effects for mobile
    COLORFUL: false,
    COLOR_UPDATE_SPEED: 10,
    PAUSED: false,
    BACK_COLOR: { r: 0, g: 0, b: 0 },
    STATIC_COLOR: { r: 0, g: 0.831, b: 1 },
    TRANSPARENT: false,
    BLOOM: false,               // Disable bloom for mobile
    BLOOM_ITERATIONS: 8,
    BLOOM_RESOLUTION: 128,      // Lower bloom resolution for mobile
    BLOOM_INTENSITY: 0.4,
    BLOOM_THRESHOLD: 0.6,
    BLOOM_SOFT_KNEE: 0.7,
    SUNRAYS: false,             // Disable sunrays for mobile
    SUNRAYS_RESOLUTION: 96,     // Lower sunrays resolution for mobile
    SUNRAYS_WEIGHT: 0.4,
    VELOCITY_DRAWING: false,    // Velocity-based drawing intensity
    FORCE_CLICK: true           // Click burst effects (MOUSE ONLY - never affects OSC)
};

// Initialize config based on device type
// Add common parameters to both configs
const commonParams = {
    // StreamDiffusion parameters
    INFERENCE_STEPS: 50,
    SEED: 42,
    CONTROLNET_POSE_SCALE: 0.65,  // Balanced preset default
    CONTROLNET_HED_SCALE: 0.41,   // Balanced preset default
    CONTROLNET_CANNY_SCALE: 0.00, // Balanced preset default
    CONTROLNET_DEPTH_SCALE: 0.21, // Balanced preset default
    CONTROLNET_COLOR_SCALE: 0.26, // Balanced preset default
    GUIDANCE_SCALE: 7.5,
    DELTA: 0.5,
    // Denoise controls
    DENOISE_X: 3,
    DENOISE_Y: 6,
    DENOISE_Z: 6,
    // Animation Parameters
    ANIMATE: true,
    LIVELINESS: 0.62,
    CHAOS: 0.73,
    BREATHING: 0.5,
    COLOR_LIFE: 0.22,
    ANIMATION_INTERVAL: 0.1,
    // Media Parameters
    FLUID_CAMERA_SCALE: 1.0,      // Fluid background camera scale
    FLUID_MEDIA_SCALE: 1.0,       // Fluid background media scale
    MEDIA_SCALE: 1.0,             // Media overlay scale
    BACKGROUND_IMAGE_SCALE: 1.0,  // Background image scale
    // Audio Parameters
    AUDIO_REACTIVITY: 2.0,
    AUDIO_DELAY: 0,
    AUDIO_OPACITY: 0.8,
    AUDIO_COLORFUL: 0.3,
    AUDIO_EDGE_SOFTNESS: 0.25,
    // Debug Parameters
    DEBUG_MODE: false,
    
    // Telegram Parameters
    TELEGRAM_RECEIVE: true,
    TELEGRAM_WAITLIST_INTERVAL: 1,
    
    // OSC Multi-splat channels REMOVED - replaced by OSC velocity drawing system
    HIDE_CURSOR: false,
};

// Initialize config based on device type with common parameters
let config = {
    ...(isMobile() ? mobileConfig : desktopConfig),
    ...commonParams
};

// Global State Variables (declared early to avoid initialization order issues)
let streamState = {
    isStreaming: false,
    streamId: null,
    playbackId: null,
    whipUrl: null,
    peerConnection: null,
    mediaStream: null,
    popupWindow: null,
    popupCheckInterval: null,
    promptUpdateInterval: null,
    lastParameterUpdate: 0,
    isUpdatingParameters: false
};

// Simple Camera System
let cameraState = {
    active: false,
    stream: null,
    video: null,
    canvas: null,
    ctx: null,
    animationId: null
};

// Media System
let mediaState = {
    active: false,
    canvas: null,
    ctx: null,
    animationId: null,
    mediaElement: null, // Could be image, video, etc.
    mediaType: null,    // 'image' or 'video'
    mediaName: null,    // filename
    scale: 1.0          // media scale factor (will be synced with config.MEDIA_SCALE)
};

// Fluid Background Media System
let fluidBackgroundMedia = {
    loaded: false,
    texture: null,
    width: 0,
    height: 0,
    type: null, // 'image' or 'video'
    element: null, // img or video element
    scale: 1.0
};

// Fluid Background Camera System (separate from main camera input mode)
let fluidBackgroundCamera = {
    active: false,
    stream: null,
    video: null,
    texture: null,
    width: 0,
    height: 0,
    scale: 1.0
};

// Audio Blob System
let audioBlobState = {
    active: false,
    audioContext: null,
    analyser: null,
    microphone: null,
    dataArray: null,
    frequencyData: null,
    canvas: null,
    gl: null,
    animationId: null,
    
    // Visual properties
    color: { r: 0, g: 0.831, b: 1 }, // Default cyan
    baseColor: { r: 0, g: 0.831, b: 1 }, // Store original color for cycling
    
    // Control properties
    reactivity: 2.0,     // 0.1-3.0 range - How much audio affects the blob
    delay: 0,            // 0-500ms range - Audio delay in milliseconds
    opacity: 0.8,        // 0-1 range - Blob opacity
    colorful: 0.3,       // 0-1 range - Color cycling intensity
    edgeSoftness: 0.25,  // 0-1 range - Blob edge softness
    
    // Audio processing nodes
    delayNode: null,     // DelayNode for audio delay
    previewGain: null,   // GainNode for audio preview (muted by default)
    
    // Shader program
    shaderProgram: null,
    uniforms: {}
};

// Idle Animation System
let idleAnimationEnabled = true;
let lastActivityTime = Date.now();
let idleAnimationTimer = null;
const IDLE_TIMEOUT = 5000; // 5 seconds
const IDLE_SPARK_MIN_INTERVAL = 1500; // 1.5 seconds
const IDLE_SPARK_MAX_INTERVAL = 4000; // 4 seconds

function pointerPrototype () {
    this.id = -1;
    this.texcoordX = 0;
    this.texcoordY = 0;
    this.prevTexcoordX = 0;
    this.prevTexcoordY = 0;
    this.deltaX = 0;
    this.deltaY = 0;
    this.down = false;
    this.moved = false;
    this.color = [30, 0, 300];
}

let pointers = [];
let splatStack = [];
pointers.push(new pointerPrototype());

const { gl, ext } = getWebGLContext(canvas);

if (isMobile()) {
    config.DYE_RESOLUTION = 512;
}
if (!ext.supportLinearFiltering) {
    config.DYE_RESOLUTION = 512;
    config.SHADING = false;
    config.BLOOM = false;
    config.SUNRAYS = false;
}

// Wait for DOM to be ready before initializing UI
document.addEventListener('DOMContentLoaded', () => {
    startGUI();
    initializeCursorIndicator();
    
    // Auto-start stream and hide overlay initially
    setTimeout(async () => {
        try {
            if (!streamState.isStreaming) {
                console.log('🚀 Auto-starting stream on page load...');
                await startStream(false); // Don't show overlay on auto-start
                // Update button text to show diffusion is hidden
                const hideButton = document.getElementById('hideStreamToggle');
                if (hideButton) {
                    hideButton.textContent = 'Show Diffusion';
                }
            }
        } catch (error) {
            console.error('❌ Failed to auto-start stream:', error);
        }
    }, 1000); // Wait 1 second for UI to initialize
    
    // Start idle animation immediately on page load
    setTimeout(() => {
        if (Date.now() - lastActivityTime >= IDLE_TIMEOUT) {
            startIdleAnimation();
        }
    }, IDLE_TIMEOUT);
});

function getWebGLContext (canvas) {
    const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };

    let gl = canvas.getContext('webgl2', params);
    const isWebGL2 = !!gl;
    if (!isWebGL2)
        gl = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params);

    let halfFloat;
    let supportLinearFiltering;
    if (isWebGL2) {
        gl.getExtension('EXT_color_buffer_float');
        supportLinearFiltering = gl.getExtension('OES_texture_float_linear');
    } else {
        halfFloat = gl.getExtension('OES_texture_half_float');
        supportLinearFiltering = gl.getExtension('OES_texture_half_float_linear');
    }

    gl.clearColor(0.0, 0.0, 0.0, 1.0);

    const halfFloatTexType = isWebGL2 ? gl.HALF_FLOAT : halfFloat.HALF_FLOAT_OES;
    let formatRGBA;
    let formatRG;
    let formatR;

    if (isWebGL2)
    {
        formatRGBA = getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, halfFloatTexType);
        formatRG = getSupportedFormat(gl, gl.RG16F, gl.RG, halfFloatTexType);
        formatR = getSupportedFormat(gl, gl.R16F, gl.RED, halfFloatTexType);
    }
    else
    {
        formatRGBA = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
        formatRG = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
        formatR = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
    }

    ga('send', 'event', isWebGL2 ? 'webgl2' : 'webgl', formatRGBA == null ? 'not supported' : 'supported');

    return {
        gl,
        ext: {
            formatRGBA,
            formatRG,
            formatR,
            halfFloatTexType,
            supportLinearFiltering
        }
    };
}

function getSupportedFormat (gl, internalFormat, format, type)
{
    if (!supportRenderTextureFormat(gl, internalFormat, format, type))
    {
        switch (internalFormat)
        {
            case gl.R16F:
                return getSupportedFormat(gl, gl.RG16F, gl.RG, type);
            case gl.RG16F:
                return getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, type);
            default:
                return null;
        }
    }

    return {
        internalFormat,
        format
    }
}

function supportRenderTextureFormat (gl, internalFormat, format, type) {
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);

    let fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    let status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    return status == gl.FRAMEBUFFER_COMPLETE;
}

// Modern UI Control System - No external dependencies
function startGUI () {
    // Core quality settings - hidden, fixed at high quality
    // DYE_RESOLUTION is fixed at 1024 (high quality) for optimal visuals
    // SIM_RESOLUTION is fixed at 256 for optimal performance
    // SHADING is always enabled for 3D lighting effects
    
    // Initialize modern UI handlers
    initializeModernUI();
    
    // Mobile performance optimizations
    if (isMobile()) {
        config.DYE_RESOLUTION = 512; // Default to medium quality on mobile
        config.BLOOM_ITERATIONS = 4;  // Reduce bloom iterations for mobile
    }
}

// Modern UI Event Handlers
function initializeModernUI() {
    // Add slider drag functionality
    addSliderDragHandlers();
    
    // Initialize toggle states
    updateToggleStates();
    
    // Initialize slider positions
    updateSliderPositions();
}

function addSliderDragHandlers() {
    const sliders = ['density', 'velocity', 'pressure', 'vorticity', 'splat', 'bloomIntensity', 'sunray', 'denoiseX', 'denoiseY', 'denoiseZ', 'inferenceSteps', 'seed', 'controlnetPose', 'controlnetHed', 'controlnetCanny', 'controlnetDepth', 'controlnetColor', 'guidanceScale', 'delta', 'animationInterval', 'chaos', 'breathing', 'colorLife', 'backgroundImageScale', 'mediaScale', 'fluidMediaScale', 'fluidCameraScale', 'streamOpacity', 'audioReactivity', 'audioDelay', 'audioOpacity', 'audioColorful', 'audioEdgeSoftness', 'telegramWaitlistInterval'];
    
    sliders.forEach(slider => {
        const handle = document.getElementById(slider + 'Handle');
        const container = document.getElementById(slider + 'Fill');
        const sliderContainer = container ? container.parentElement : null;
        if (handle && container && sliderContainer) {
            let isDragging = false;
            
            handle.addEventListener('mousedown', (e) => {
                isDragging = true;
                e.preventDefault();
                // Immediately update slider position on mouse down
                updateSliderFromMouse(e, slider);
            });
            
            document.addEventListener('mousemove', (e) => {
                if (isDragging) {
                    updateSliderFromMouse(e, slider);
                }
            });
            
            document.addEventListener('mouseup', () => {
                isDragging = false;
            });
            
            // Touch support for handle
            handle.addEventListener('touchstart', (e) => {
                isDragging = true;
                e.preventDefault();
                e.stopPropagation(); // Prevent event bubbling
                // Immediately update slider position on touch start
                updateSliderFromTouch(e, slider);
            }, { passive: false }); // Need preventDefault for slider
            
            // Global touch move and end handlers
            document.addEventListener('touchmove', (e) => {
                if (isDragging) {
                    e.preventDefault(); // Prevent scrolling while dragging
                    updateSliderFromTouch(e, slider);
                }
            }, { passive: false }); // Need preventDefault to stop scrolling
            
            document.addEventListener('touchend', (e) => {
                if (isDragging) {
                    isDragging = false;
                    e.preventDefault();
                }
            }, { passive: false });
            
            // Add immediate response on container click/touch
            sliderContainer.addEventListener('mousedown', (e) => {
                if (e.target === sliderContainer || e.target === container) {
                    isDragging = true;
                    e.preventDefault();
                    e.stopPropagation();
                    updateSliderFromMouse(e, slider);
                }
            });
            
            sliderContainer.addEventListener('touchstart', (e) => {
                if (e.target === sliderContainer || e.target === container) {
                    isDragging = true;
                    e.preventDefault();
                    e.stopPropagation(); // Prevent event bubbling
                    updateSliderFromTouch(e, slider);
                }
            }, { passive: false }); // Need preventDefault for slider
        }
    });
}

function updateSliderFromMouse(e, sliderName) {
    const fillElement = document.getElementById(sliderName + 'Fill');
    if (!fillElement) return;
    
    const container = fillElement.parentElement;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const rawPercentage = Math.max(0, Math.min(1, x / rect.width));
    
    // Convert visual percentage back to actual percentage, accounting for handle padding
    const percentage = Math.max(0, Math.min(1, (rawPercentage - SLIDER_HANDLE_PADDING) / (1 - 2 * SLIDER_HANDLE_PADDING)));
    
    updateSliderValue(sliderName, percentage);
}

function updateSliderFromTouch(e, sliderName) {
    const fillElement = document.getElementById(sliderName + 'Fill');
    if (!fillElement) return;
    
    const container = fillElement.parentElement;
    const rect = container.getBoundingClientRect();
    const x = e.touches[0].clientX - rect.left;
    const rawPercentage = Math.max(0, Math.min(1, x / rect.width));
    
    // Convert visual percentage back to actual percentage, accounting for handle padding
    const percentage = Math.max(0, Math.min(1, (rawPercentage - SLIDER_HANDLE_PADDING) / (1 - 2 * SLIDER_HANDLE_PADDING)));
    
    updateSliderValue(sliderName, percentage);
}

function handleSliderClick(event, sliderName, min, max) {
    if (isMobile()) {
        console.log('🔍 MOBILE DEBUG: Slider click for', sliderName, 'event type:', event.type);
        console.log('🔍 Event target:', event.target.className, event.currentTarget.className);
    }
    
    event.stopPropagation(); // Prevent event bubbling
    event.preventDefault(); // Prevent default behavior
    
    const rect = event.currentTarget.getBoundingClientRect();
    let x;
    
    // Handle both mouse and touch events
    if (event.touches && event.touches.length > 0) {
        x = event.touches[0].clientX - rect.left;
    } else if (event.changedTouches && event.changedTouches.length > 0) {
        x = event.changedTouches[0].clientX - rect.left;
    } else {
        x = event.clientX - rect.left;
    }
    
    const rawPercentage = Math.max(0, Math.min(1, x / rect.width));
    
    // Convert visual percentage back to actual percentage, accounting for handle padding
    const percentage = Math.max(0, Math.min(1, (rawPercentage - SLIDER_HANDLE_PADDING) / (1 - 2 * SLIDER_HANDLE_PADDING)));
    
    updateSliderValue(sliderName, percentage);
}

function updateSliderValue(sliderName, percentage, skipSave = false, updateInput = true) {
    // Ensure percentage is between 0 and 1
    percentage = Math.min(1, Math.max(0, percentage));
    
    const sliderMap = {
        'density': { min: 0, max: 4, prop: 'DENSITY_DISSIPATION', decimals: 2 },
        'velocity': { min: 0, max: 4, prop: 'VELOCITY_DISSIPATION', decimals: 2 },
        'pressure': { min: 0, max: 1, prop: 'PRESSURE', decimals: 2 },
        'vorticity': { min: 0, max: 50, prop: 'CURL', decimals: 0 },
        'splat': { min: 0.01, max: 1, prop: 'SPLAT_RADIUS', decimals: 2 },
        'bloomIntensity': { min: 0.1, max: 2, prop: 'BLOOM_INTENSITY', decimals: 2 },
        'sunray': { min: 0.3, max: 1, prop: 'SUNRAYS_WEIGHT', decimals: 2 },
        'denoiseX': { min: 0, max: 45, prop: 'DENOISE_X', decimals: 0 },
        'denoiseY': { min: 0, max: 45, prop: 'DENOISE_Y', decimals: 0 },
        'denoiseZ': { min: 0, max: 45, prop: 'DENOISE_Z', decimals: 0 },
        'inferenceSteps': { min: 1, max: 100, prop: 'INFERENCE_STEPS', decimals: 0 },
        'seed': { min: 0, max: 1000, prop: 'SEED', decimals: 0 },
        'controlnetPose': { min: 0, max: 1, prop: 'CONTROLNET_POSE_SCALE', decimals: 2 },
        'controlnetHed': { min: 0, max: 1, prop: 'CONTROLNET_HED_SCALE', decimals: 2 },
        'controlnetCanny': { min: 0, max: 1, prop: 'CONTROLNET_CANNY_SCALE', decimals: 2 },
        'controlnetDepth': { min: 0, max: 1, prop: 'CONTROLNET_DEPTH_SCALE', decimals: 2 },
        'controlnetColor': { min: 0, max: 1, prop: 'CONTROLNET_COLOR_SCALE', decimals: 2 },
        'guidanceScale': { min: 1, max: 20, prop: 'GUIDANCE_SCALE', decimals: 1 },
        'delta': { min: 0, max: 1, prop: 'DELTA', decimals: 2 },
        'liveliness': { min: 0, max: 1, prop: 'LIVELINESS', decimals: 2 },
        'chaos': { min: 0, max: 1, prop: 'CHAOS', decimals: 2 },
        'breathing': { min: 0, max: 1, prop: 'BREATHING', decimals: 2 },
        'colorLife': { min: 0, max: 1, prop: 'COLOR_LIFE', decimals: 2 },
        'animationInterval': { min: 0, max: 1, prop: 'ANIMATION_INTERVAL', decimals: 2 },
        'backgroundImageScale': { min: 0.1, max: 2.0, prop: 'BACKGROUND_IMAGE_SCALE', decimals: 2 },
        'mediaScale': { min: 0.1, max: 2.0, prop: 'MEDIA_SCALE', decimals: 2, handler: updateMediaScale },
        'fluidMediaScale': { min: 0.1, max: 2.0, prop: 'FLUID_MEDIA_SCALE', decimals: 2, handler: updateFluidMediaScale },
        'fluidCameraScale': { min: 0.1, max: 2.0, prop: 'FLUID_CAMERA_SCALE', decimals: 2, handler: updateFluidCameraScale },
        'tIndexList': { min: 0, max: 50, prop: 'T_INDEX_LIST', decimals: 0, isArray: true },
        'audioReactivity': { min: 0.1, max: 3.0, prop: 'AUDIO_REACTIVITY', decimals: 1, handler: updateAudioReactivity },
        'audioDelay': { min: 0, max: 500, prop: 'AUDIO_DELAY', decimals: 0, handler: updateAudioDelay },
        'audioOpacity': { min: 0, max: 1, prop: 'AUDIO_OPACITY', decimals: 2, handler: updateAudioOpacity },
        'audioColorful': { min: 0, max: 1, prop: 'AUDIO_COLORFUL', decimals: 1, handler: updateAudioColorful },
        'audioEdgeSoftness': { min: 0, max: 1, prop: 'AUDIO_EDGE_SOFTNESS', decimals: 2, handler: updateAudioEdgeSoftness },
        'streamOpacity': { min: 0, max: 1, prop: 'STREAM_OPACITY', decimals: 2, handler: updateStreamOpacity },
        'telegramWaitlistInterval': { min: 1, max: 30, prop: 'TELEGRAM_WAITLIST_INTERVAL', decimals: 0, handler: updateTelegramWaitlistInterval }
    };
    
    const slider = sliderMap[sliderName];
    if (!slider) return;
    
    const value = slider.min + (slider.max - slider.min) * percentage;
    
    // Handle special array case for T_INDEX_LIST
    if (slider.isArray && slider.prop === 'T_INDEX_LIST') {
        // Generate array based on slider value (middle index)
        const middleIndex = Math.round(value);
        const step = Math.max(1, Math.floor(middleIndex / 3));
        config[slider.prop] = [0, middleIndex, Math.min(middleIndex * 2, 50)];
    } else {
        config[slider.prop] = value;
    }
    
    // Call custom handler if defined (for audio controls)
    if (slider.handler && typeof slider.handler === 'function') {
        slider.handler(value);
    }
    
    // Special handling for background media scale
    if (sliderName === 'backgroundImageScale' && backgroundMedia.loaded) {
        if (backgroundMedia.type === 'image' && backgroundMedia.originalDataURL) {
            // Regenerate the entire image with the new scale
            loadBackgroundImage(backgroundMedia.originalDataURL);
        }
        // For videos, scaling is handled in the shader via uniforms - no action needed here
    }
    
    // Update UI
    const fill = document.getElementById(sliderName + 'Fill');
    const valueDisplay = document.getElementById(sliderName + 'Value');
    
    if (fill) {
        // Convert percentage (0-1) to percentage display (0-100) and adjust for handle padding
        const displayPercentage = SLIDER_HANDLE_PADDING * 100 + (percentage * (100 - 2 * SLIDER_HANDLE_PADDING * 100));
        fill.style.width = displayPercentage + '%';
    }
    
    if (valueDisplay && updateInput) {
        if (slider.isArray && slider.prop === 'T_INDEX_LIST') {
            valueDisplay.value = '[' + config[slider.prop].join(',') + ']';
        } else {
            valueDisplay.value = value.toFixed(slider.decimals);
        }
    }
    
    // Save to localStorage only if not loading from storage
    if (!skipSave) {
        saveConfig();
    }
}

function updateSliderPositions() {
    const sliderMap = {
        'density': { prop: 'DENSITY_DISSIPATION', min: 0, max: 4 },
        'velocity': { prop: 'VELOCITY_DISSIPATION', min: 0, max: 4 },
        'pressure': { prop: 'PRESSURE', min: 0, max: 1 },
        'vorticity': { prop: 'CURL', min: 0, max: 50 },
        'splat': { prop: 'SPLAT_RADIUS', min: 0.01, max: 1 },
        'bloomIntensity': { prop: 'BLOOM_INTENSITY', min: 0.1, max: 2 },
        'sunray': { prop: 'SUNRAYS_WEIGHT', min: 0.3, max: 1 },
        'denoiseX': { prop: 'DENOISE_X', min: 0, max: 45 },
        'denoiseY': { prop: 'DENOISE_Y', min: 0, max: 45 },
        'denoiseZ': { prop: 'DENOISE_Z', min: 0, max: 45 },
        'inferenceSteps': { prop: 'INFERENCE_STEPS', min: 1, max: 100 },
        'seed': { prop: 'SEED', min: 0, max: 1000 },
        'controlnetPose': { prop: 'CONTROLNET_POSE_SCALE', min: 0, max: 1 },
        'controlnetHed': { prop: 'CONTROLNET_HED_SCALE', min: 0, max: 1 },
        'controlnetCanny': { prop: 'CONTROLNET_CANNY_SCALE', min: 0, max: 1 },
        'controlnetDepth': { prop: 'CONTROLNET_DEPTH_SCALE', min: 0, max: 1 },
        'controlnetColor': { prop: 'CONTROLNET_COLOR_SCALE', min: 0, max: 1 },
        'guidanceScale': { prop: 'GUIDANCE_SCALE', min: 1, max: 20 },
        'delta': { prop: 'DELTA', min: 0, max: 1 },
        'liveliness': { prop: 'LIVELINESS', min: 0, max: 1 },
        'chaos': { prop: 'CHAOS', min: 0, max: 1 },
        'breathing': { prop: 'BREATHING', min: 0, max: 1 },
        'colorLife': { prop: 'COLOR_LIFE', min: 0, max: 1 },
        'animationInterval': { prop: 'ANIMATION_INTERVAL', min: 0, max: 1 },
        'backgroundImageScale': { prop: 'BACKGROUND_IMAGE_SCALE', min: 0.1, max: 2.0 },
        'mediaScale': { prop: 'MEDIA_SCALE', min: 0.1, max: 2.0 },
        'fluidMediaScale': { prop: 'FLUID_MEDIA_SCALE', min: 0.1, max: 2.0 },
        'fluidCameraScale': { prop: 'FLUID_CAMERA_SCALE', min: 0.1, max: 2.0 },
        'tIndexList': { prop: 'T_INDEX_LIST', min: 0, max: 50, isArray: true },
        'audioReactivity': { prop: 'AUDIO_REACTIVITY', min: 0.1, max: 3.0 },
        'audioDelay': { prop: 'AUDIO_DELAY', min: 0, max: 500 },
        'audioOpacity': { prop: 'AUDIO_OPACITY', min: 0, max: 1 },
        'audioColorful': { prop: 'AUDIO_COLORFUL', min: 0, max: 1 },
        'audioEdgeSoftness': { prop: 'AUDIO_EDGE_SOFTNESS', min: 0, max: 1 },
        'telegramWaitlistInterval': { prop: 'TELEGRAM_WAITLIST_INTERVAL', min: 1, max: 30 }
    };
    
    Object.keys(sliderMap).forEach(sliderName => {
        const slider = sliderMap[sliderName];
        let percentage;
        
        if (slider.isArray && slider.prop === 'T_INDEX_LIST') {
            // For T_INDEX_LIST, use the middle value to determine percentage
            const middleValue = Array.isArray(config[slider.prop]) ? config[slider.prop][1] || 8 : 8;
            percentage = (middleValue - slider.min) / (slider.max - slider.min);
        } else {
            // Handle undefined config values gracefully
            const configValue = config[slider.prop];
            if (configValue === undefined || configValue === null || isNaN(configValue)) {
                // Use default value (middle of range) for undefined properties
                const defaultValue = slider.min + (slider.max - slider.min) * 0.5;
                config[slider.prop] = defaultValue;
                percentage = 0.5;
                console.warn(`Config property ${slider.prop} was undefined, using default value: ${defaultValue}`);
            } else {
                percentage = (configValue - slider.min) / (slider.max - slider.min);
            }
        }
        
        updateSliderValue(sliderName, percentage, true); // Skip saving when loading
    });
}

function updateToggleStates() {
    updateToggle('colorfulToggle', config.COLORFUL);
    updateToggle('pausedToggle', config.PAUSED);
    updateToggle('animateToggle', config.ANIMATE);
    updateToggle('hideCursorToggle', config.HIDE_CURSOR);
    updateToggle('bloomToggle', config.BLOOM);
    updateToggle('sunraysToggle', config.SUNRAYS);
    updateToggle('velocityDrawingToggle', config.VELOCITY_DRAWING);
    updateToggle('forceClickToggle', config.FORCE_CLICK);
    updateToggle('debugToggle', config.DEBUG_MODE);
    
    // Apply cursor hiding CSS class if needed
    if (config.HIDE_CURSOR) {
        document.body.classList.add('hide-cursor');
    } else {
        document.body.classList.remove('hide-cursor');
    }
    
    // Update cursor indicator visibility
    if (cursorIndicator) {
        cursorIndicator.style.display = config.HIDE_CURSOR ? 'block' : 'none';
    }
}

function updateToggle(toggleId, state) {
    const toggle = document.getElementById(toggleId);
    if (toggle) {
        if (state) {
            toggle.classList.add('active');
        } else {
            toggle.classList.remove('active');
        }
    }
}

// Toggle Functions
function togglePanel() {
    const panel = document.getElementById('controlPanel');
    panel.classList.toggle('collapsed');
    
    // Close color picker when panel is collapsed (especially important on tablets)
    if (panel.classList.contains('collapsed') && typeof Coloris !== 'undefined') {
        Coloris.close();
    }
}

function togglePanelVisibility() {
    const panel = document.getElementById('controlPanel');
    if (panel.style.display === 'none') {
        panel.style.display = 'block';
    } else {
        panel.style.display = 'none';
        // Close color picker when panel is hidden (especially important on tablets)
        if (typeof Coloris !== 'undefined') {
            Coloris.close();
        }
    }
}

function toggleFullscreen() {
    const doc = document.documentElement;
    const isFullscreen = document.fullscreenElement || 
                        document.webkitFullscreenElement || 
                        document.mozFullScreenElement || 
                        document.msFullscreenElement;
    
    if (!isFullscreen) {
        // Enter fullscreen
        if (doc.requestFullscreen) {
            doc.requestFullscreen().catch(err => {
                console.log('Fullscreen request failed:', err);
                showFullscreenFeedback('Fullscreen not supported');
            });
        } else if (doc.webkitRequestFullscreen) {
            // Safari
            doc.webkitRequestFullscreen().catch(err => {
                console.log('Webkit fullscreen request failed:', err);
                showFullscreenFeedback('Fullscreen not supported on this device');
            });
        } else if (doc.mozRequestFullScreen) {
            // Firefox
            doc.mozRequestFullScreen().catch(err => {
                console.log('Mozilla fullscreen request failed:', err);
                showFullscreenFeedback('Fullscreen not supported');
            });
        } else if (doc.msRequestFullscreen) {
            // IE/Edge
            doc.msRequestFullscreen().catch(err => {
                console.log('MS fullscreen request failed:', err);
                showFullscreenFeedback('Fullscreen not supported');
            });
        } else {
            // Fallback for unsupported browsers
            showFullscreenFeedback('Fullscreen not supported on this device');
        }
    } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
            document.exitFullscreen().catch(err => {
                console.log('Exit fullscreen failed:', err);
            });
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen().catch(err => {
                console.log('Webkit exit fullscreen failed:', err);
            });
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen().catch(err => {
                console.log('Mozilla exit fullscreen failed:', err);
            });
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen().catch(err => {
                console.log('MS exit fullscreen failed:', err);
            });
        }
    }
}

function showFullscreenFeedback(message) {
    // Show a temporary message to the user
    const button = document.getElementById('fullscreenToggleButton');
    if (button) {
        const originalTooltip = button.querySelector('.tooltiptext').textContent;
        button.querySelector('.tooltiptext').textContent = message;
        
        // Reset tooltip after 2 seconds
        setTimeout(() => {
            button.querySelector('.tooltiptext').textContent = originalTooltip;
        }, 2000);
    }
}

function updateFullscreenButton() {
    const icon = document.getElementById('fullscreenIcon');
    const tooltip = document.getElementById('fullscreenTooltip');
    
    if (!icon || !tooltip) return;
    
    const isFullscreen = document.fullscreenElement || 
                        document.webkitFullscreenElement || 
                        document.mozFullScreenElement || 
                        document.msFullscreenElement;
    
    if (isFullscreen) {
        icon.className = 'fas fa-compress';
        tooltip.textContent = 'Exit Fullscreen';
    } else {
        icon.className = 'fas fa-expand';
        tooltip.textContent = 'Enter Fullscreen';
    }
}

// Safe wrapper functions for mobile compatibility
function safeTogglePanel(event) {
    try {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        if (isMobile()) {
            console.log('🔍 MOBILE DEBUG: Panel toggle called');
        }
        togglePanel();
    } catch (error) {
        console.error('Error in safeTogglePanel:', error);
    }
}

function safeToggleStream(event) {
    try {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        if (isMobile()) {
            console.log('🔍 MOBILE DEBUG: Stream toggle called');
        }
        toggleStream();
    } catch (error) {
        console.error('Error in safeToggleStream:', error);
    }
}

function safeRestartStream(event) {
    try {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        if (isMobile()) {
            console.log('🔍 MOBILE DEBUG: Stream restart called');
        }
        restartStream();
    } catch (error) {
        console.error('Error in safeRestartStream:', error);
    }
}

function safeToggleNegativePrompt(event) {
    try {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        if (isMobile()) {
            console.log('🔍 MOBILE DEBUG: Negative prompt toggle called');
        }
        toggleNegativePrompt();
    } catch (error) {
        console.error('Error in safeToggleNegativePrompt:', error);
    }
}

function safeToggleFluidDrawing(event) {
    try {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        if (isMobile()) {
            console.log('🔍 MOBILE DEBUG: Fluid drawing toggle called');
        }
        toggleFluidDrawing();
    } catch (error) {
        console.error('Error in safeToggleFluidDrawing:', error);
    }
}

function safeToggleAudioBlob(event) {
    try {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        if (isMobile()) {
            console.log('🔍 MOBILE DEBUG: Audio blob toggle called');
        }
        toggleAudioBlob();
    } catch (error) {
        console.error('Error in safeToggleAudioBlob:', error);
    }
}

// Ensure global availability of safe functions for mobile
window.safeTogglePanel = safeTogglePanel;
window.safeToggleStream = safeToggleStream;
window.safeRestartStream = safeRestartStream;
window.safeToggleNegativePrompt = safeToggleNegativePrompt;
window.safeToggleFluidDrawing = safeToggleFluidDrawing;
window.safeToggleAudioBlob = safeToggleAudioBlob;

// Also ensure toggle functions are globally available
window.toggleDebug = toggleDebug;

// Ensure original functions are globally available as fallback (deferred)
function ensureGlobalFunctions() {
    if (typeof toggleStream !== 'undefined') window.toggleStream = toggleStream;
    if (typeof restartStream !== 'undefined') window.restartStream = restartStream;
    if (typeof toggleNegativePrompt !== 'undefined') window.toggleNegativePrompt = toggleNegativePrompt;
    if (typeof toggleFluidDrawing !== 'undefined') window.toggleFluidDrawing = toggleFluidDrawing;
    if (typeof toggleAudioBlob !== 'undefined') window.toggleAudioBlob = toggleAudioBlob;
}

// Make togglePanel available immediately since it's defined above
window.togglePanel = togglePanel;

// Mobile debugging - log function availability
if (isMobile()) {
    console.log('🔍 MOBILE DEBUG: Function availability check:');
    console.log('🔍 safeTogglePanel:', typeof window.safeTogglePanel);
    console.log('🔍 safeToggleStream:', typeof window.safeToggleStream);
    console.log('🔍 safeToggleFluidDrawing:', typeof window.safeToggleFluidDrawing);
    console.log('🔍 safeToggleAudioBlob:', typeof window.safeToggleAudioBlob);
}

// Mobile pull-down gesture to close control panel
function initializeMobilePanelGestures() {
    // Skip if not mobile or already initialized
    if (!isMobile()) return;
    
    console.log('🔍 MOBILE DEBUG: Initializing mobile panel gestures');
    
    try {
        const panel = document.getElementById('controlPanel');
        const panelHeader = document.querySelector('.panel-header');
        const panelContent = document.querySelector('.panel-content');
        
        console.log('🔍 MOBILE DEBUG: Panel elements found:', {
            panel: !!panel,
            panelHeader: !!panelHeader,
            panelContent: !!panelContent,
            panelCollapsed: panel ? panel.classList.contains('collapsed') : 'N/A'
        });
        
        if (!panel || !panelHeader) {
            console.log('🔍 MOBILE DEBUG: Missing panel elements, aborting gesture setup');
            return;
        }
        
        let startY = 0;
        let startTime = 0;
        let isDragging = false;
        let startScrollTop = 0;
        
        // Only add gesture to header to avoid conflicts with content scrolling
        setupGestureHandlers(panelHeader, panel, true);
        
        function setupGestureHandlers(element, panel, isHeader) {
            // Use AbortController for proper cleanup
            const controller = new AbortController();
            const signal = controller.signal;
            
            element.addEventListener('touchstart', (e) => {
                try {
                    // Only handle if panel is expanded (not collapsed)
                    if (!e.touches || e.touches.length === 0 || panel.classList.contains('collapsed')) return;
                    
                    startY = e.touches[0].clientY;
                    startTime = Date.now();
                    isDragging = false;
                } catch (err) {
                    console.warn('Touch start error:', err);
                }
            }, { passive: true, signal });
            
            element.addEventListener('touchmove', (e) => {
                try {
                    if (!e.touches || e.touches.length === 0 || panel.classList.contains('collapsed')) return;
                    
                    const currentY = e.touches[0].clientY;
                    const deltaY = currentY - startY;
                    
                    // Only track significant downward movement
                    if (deltaY > 15) {
                        isDragging = true;
                    }
                } catch (err) {
                    console.warn('Touch move error:', err);
                }
            }, { passive: true, signal });
            
            element.addEventListener('touchend', (e) => {
                try {
                    if (!e.changedTouches || e.changedTouches.length === 0 || panel.classList.contains('collapsed')) return;
                    
                    const endTime = Date.now();
                    const duration = endTime - startTime;
                    const endY = e.changedTouches[0].clientY;
                    const deltaY = endY - startY;
                    
                    // Close panel if dragged down significantly
                    const isValidPull = deltaY > 40 && duration < 500;
                    
                    if (isDragging && isValidPull) {
                        // Animate the collapse
                        panel.classList.add('collapsed');
                        // Close color picker when panel is closed via gesture (important on tablets)
                        if (typeof Coloris !== 'undefined') {
                            Coloris.close();
                        }
                        // Prevent the click event from firing
                        e.preventDefault();
                        e.stopPropagation();
                    }
                    
                    isDragging = false;
                } catch (err) {
                    console.warn('Touch end error:', err);
                }
            }, { passive: false, signal }); // passive: false to allow preventDefault
        }
    } catch (err) {
        console.error('Failed to initialize mobile panel gestures:', err);
    }
}

function toggleColorful() {
    if (isMobile()) {
        console.log('🔍 MOBILE DEBUG: toggleColorful called, current value:', config.COLORFUL);
    }
    config.COLORFUL = !config.COLORFUL;
    updateToggle('colorfulToggle', config.COLORFUL);
    saveConfig();
}

function togglePaused() {
    if (isMobile()) {
        console.log('🔍 MOBILE DEBUG: togglePaused called, current value:', config.PAUSED);
    }
    config.PAUSED = !config.PAUSED;
    updateToggle('pausedToggle', config.PAUSED);
    saveConfig();
}

function toggleAnimate() {
    config.ANIMATE = !config.ANIMATE;
    updateToggle('animateToggle', config.ANIMATE);
    saveConfig();
    
    // Start or stop animation based on state
    if (config.ANIMATE && !config.PAUSED) {
        startIdleAnimation();
    } else if (idleAnimationTimer) {
        clearTimeout(idleAnimationTimer);
        idleAnimationTimer = null;
    }
}

function toggleHideCursor() {
    config.HIDE_CURSOR = !config.HIDE_CURSOR;
    updateToggle('hideCursorToggle', config.HIDE_CURSOR);
    
    // Apply or remove cursor hiding CSS class
    if (config.HIDE_CURSOR) {
        document.body.classList.add('hide-cursor');
    } else {
        document.body.classList.remove('hide-cursor');
    }
    
    // Update cursor indicator visibility
    if (cursorIndicator) {
        cursorIndicator.style.display = config.HIDE_CURSOR ? 'block' : 'none';
    }
    
    saveConfig();
}

// Cursor indicator functionality
let cursorIndicator = null;

function updateCursorIndicator(x, y) {
    if (cursorIndicator && config.HIDE_CURSOR) {
        cursorIndicator.style.left = x + 'px';
        cursorIndicator.style.top = y + 'px';
    }
}

function initializeCursorIndicator() {
    cursorIndicator = document.getElementById('cursorIndicator');
    if (!cursorIndicator) return;
    
    // Track mouse movement for cursor indicator
    document.addEventListener('mousemove', (e) => {
        updateCursorIndicator(e.clientX, e.clientY);
    });
}

function toggleBloom() {
    config.BLOOM = !config.BLOOM;
    updateToggle('bloomToggle', config.BLOOM);
    updateKeywords();
    saveConfig();
}

function toggleSunrays() {
    config.SUNRAYS = !config.SUNRAYS;
    updateToggle('sunraysToggle', config.SUNRAYS);
    updateKeywords();
    saveConfig();
}

function toggleVelocityDrawing() {
    if (isMobile()) {
        console.log('🔍 MOBILE DEBUG: toggleVelocityDrawing called, current value:', config.VELOCITY_DRAWING);
    }
    config.VELOCITY_DRAWING = !config.VELOCITY_DRAWING;
    updateToggle('velocityDrawingToggle', config.VELOCITY_DRAWING);
    saveConfig();
}

function toggleForceClick() {
    config.FORCE_CLICK = !config.FORCE_CLICK;
    updateToggle('forceClickToggle', config.FORCE_CLICK);
    saveConfig();
}

function toggleSettings() {
    const content = document.getElementById('settingsContent');
    const toggle = document.getElementById('settingsIcon');
    
    if (content.classList.contains('expanded')) {
        content.classList.remove('expanded');
        toggle.textContent = '▶';
    } else {
        content.classList.add('expanded');
        toggle.textContent = '▼';
    }
}

function toggleDebug() {
    config.DEBUG_MODE = !config.DEBUG_MODE;
    updateToggle('debugToggle', config.DEBUG_MODE);
    
    // Control mobile debug overlay visibility
    const debugOverlay = document.getElementById('mobileDebug');
    const oscMessagesDiv = document.getElementById('oscMessages');
    
    if (debugOverlay) {
        if (config.DEBUG_MODE) {
            debugOverlay.style.display = 'block';
            debugOverlay.style.setProperty('display', 'block', 'important');
            console.log('🔍 Debug mode enabled - OSC messages and debug overlay will be shown');
            // Set initial OSC section visibility (hidden since no messages yet)
            updateOSCSectionVisibility();
        } else {
            debugOverlay.style.display = 'none';
            debugOverlay.style.setProperty('display', 'none', 'important');
            // Clear OSC messages when debug is disabled
            if (oscMessagesDiv) {
                oscMessagesDiv.innerHTML = '';
                // Update OSC section visibility after clearing
                updateOSCSectionVisibility();
            }
            console.log('🔍 Debug mode disabled');
        }
    }
    
          saveConfig();
  }
  

  
  

function toggleNegativePrompt() {
    const content = document.getElementById('negativePromptContent');
    const toggle = document.getElementById('negativePromptIcon');
    
    if (content.classList.contains('expanded')) {
        content.classList.remove('expanded');
        toggle.textContent = '▶';
    } else {
        content.classList.add('expanded');
        toggle.textContent = '▼';
    }
}

function toggleTelegramReceive() {
    // Toggle the global state
    if (typeof config.TELEGRAM_RECEIVE === 'undefined') {
        config.TELEGRAM_RECEIVE = true; // Default to enabled
    }
    config.TELEGRAM_RECEIVE = !config.TELEGRAM_RECEIVE;
    
    // Update the UI toggle
    updateToggle('telegramReceiveToggle', config.TELEGRAM_RECEIVE);
    
    // Show/hide waitlist controls based on state
    updateTelegramControlsVisibility();
    
    // Save the setting
    saveTelegramSettings();
    
    console.log(`📱 Telegram receive ${config.TELEGRAM_RECEIVE ? 'enabled' : 'disabled'}`);
}



function generateTelegramQR(retryCount = 0) {
    const canvas = document.getElementById('telegramQRCanvas');
    if (!canvas) {
        console.error('QR Canvas element not found');
        return;
    }
    
    // Check if both token and username fields have values
    if (!validateTelegramFields()) {
        console.log('Token or username fields are empty, skipping QR generation');
        // Clear the canvas
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }
    
    // Use stored bot username or fallback to default
    const botUsername = telegramBotUsername || 'DiffusionPromptBot';
    const telegramBotUrl = `https://t.me/${botUsername}`;
    
    // Check if QRious library is loaded
    if (typeof QRious === 'undefined') {
        if (retryCount < 5) { // Limit to 5 retries (2.5 seconds)
            console.warn(`QRious library not loaded yet, retrying in 500ms... (${retryCount + 1}/5)`);
            setTimeout(() => generateTelegramQR(retryCount + 1), 500);
            return;
        } else {
            console.error('QRious library failed to load after 5 attempts');
            // Show fallback message
            const ctx = canvas.getContext('2d');
            canvas.width = 300;
            canvas.height = 300;
            ctx.fillStyle = '#ffeeee';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#cc0000';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('QR Library Failed to Load', canvas.width/2, canvas.height/2 - 20);
            ctx.font = '12px Arial';
            ctx.fillText(telegramBotUrl, canvas.width/2, canvas.height/2 + 10);
            return;
        }
    }
    
    console.log('📱 Generating QR code for:', telegramBotUrl);
    
    // Determine QR code size based on screen size
    const isMobile = window.innerWidth <= 768;
    const qrSize = isMobile ? 120 : 300;
    
    try {
        // Create QR code using QRious
        const qr = new QRious({
            element: canvas,
            value: telegramBotUrl,
            size: qrSize,
            background: 'white',
            foreground: 'black',
            level: 'M'
        });
        
        console.log('📱 Telegram QR code generated successfully with QRious');
        canvas.style.display = 'block';
        
    } catch (error) {
        console.error('Failed to generate QR code with QRious:', error);
        // Fallback: show error message on canvas
        const ctx = canvas.getContext('2d');
        canvas.width = qrSize;
        canvas.height = qrSize;
        ctx.fillStyle = '#ffcccc';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ff0000';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('QR Generation Error:', canvas.width/2, canvas.height/2 - 20);
        ctx.font = '12px Arial';
        ctx.fillText(error.message, canvas.width/2, canvas.height/2);
        ctx.fillText(telegramBotUrl, canvas.width/2, canvas.height/2 + 20);
    }
}

function validateTelegramBotToken(token) {
    // Telegram bot token format: 8-10 digits, colon, 35 alphanumeric chars with underscores/hyphens
    const tokenPattern = /^[0-9]{8,10}:[a-zA-Z0-9_-]{35}$/;
    return tokenPattern.test(token);
}

async function fetchTelegramBotInfo(token) {
    try {
        console.log('📱 Fetching bot information from Telegram API...');
        const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
        const data = await response.json();
        
        if (data.ok && data.result) {
            console.log('📱 Bot info fetched successfully:', data.result);
            return {
                success: true,
                username: data.result.username,
                firstName: data.result.first_name,
                id: data.result.id
            };
        } else {
            console.error('📱 Telegram API error:', data.description || 'Unknown error');
            return {
                success: false,
                error: data.description || 'Invalid bot token'
            };
        }
    } catch (error) {
        console.error('📱 Network error fetching bot info:', error);
        return {
            success: false,
            error: 'Network error: Unable to connect to Telegram API'
        };
    }
}

// Store bot username in memory after API call
let telegramBotUsername = null;

async function fetchAndStoreBotUsername(token) {
    // Validate token format first
    if (!validateTelegramBotToken(token)) {
        console.log('📱 Invalid token format, skipping bot info fetch');
        telegramBotUsername = null;
        updateTelegramBotElements();
        return;
    }
    
    try {
        console.log('📱 Fetching bot information...');
        const botInfo = await fetchTelegramBotInfo(token);
        
        if (botInfo.success && botInfo.username) {
            telegramBotUsername = botInfo.username;
            console.log(`📱 Bot username fetched: ${telegramBotUsername}`);
            
            // Update UI elements with new username
            updateTelegramBotElements();
            
        } else {
            console.error('📱 Failed to fetch bot info:', botInfo.error);
            telegramBotUsername = null;
            updateTelegramBotElements();
        }
    } catch (error) {
        console.error('📱 Error fetching bot info:', error);
        telegramBotUsername = null;
        updateTelegramBotElements();
    }
}

function validateTelegramFields() {
    const effectiveToken = getEffectiveTelegramToken();
    const hasToken = effectiveToken && effectiveToken.length > 0;
    const hasUsername = telegramBotUsername && telegramBotUsername.length > 0;
    
    return hasToken && hasUsername;
}

function updateTelegramBotElements() {
    // Use stored bot username or fallback to default
    const botUsername = telegramBotUsername || 'DiffusionPromptBot';
    
    // Check if both token and username are available
    const fieldsValid = validateTelegramFields();
    
    // Update bot link
    const botLink = document.getElementById('telegramBotLink');
    if (botLink) {
        botLink.href = `https://t.me/${botUsername}`;
        botLink.closest('.control-item').style.display = fieldsValid ? 'block' : 'none';
    }
    
    // Update bot display name
    const botDisplayName = document.getElementById('telegramBotDisplayName');
    if (botDisplayName) {
        botDisplayName.textContent = `@${botUsername}`;
    }
    
    // Update QR code section visibility
    const qrSection = document.getElementById('telegramQRContent');
    if (qrSection) {
        qrSection.style.display = fieldsValid ? 'block' : 'none';
    }
    
    // Generate QR code if fields are valid
    if (fieldsValid) {
        generateTelegramQR();
    }
    
    console.log(`📱 Updated Telegram bot elements for: @${botUsername} (visible: ${fieldsValid})`);
}

// Add event listener to fetch bot info when token changes
document.addEventListener('DOMContentLoaded', function() {
    const tokenInput = document.getElementById('telegramTokenInput');
    
    if (tokenInput) {
        // Clear stored username when token changes
        tokenInput.addEventListener('input', function() {
            telegramBotUsername = null;
            updateTelegramBotElements();
        });
        
        // Fetch bot info with debouncing
        let fetchTimeout;
        tokenInput.addEventListener('input', function() {
            clearTimeout(fetchTimeout);
            const token = this.value.trim();
            
            if (token.length > 0) {
                // Debounce the fetch to avoid excessive API calls
                fetchTimeout = setTimeout(() => {
                    fetchAndStoreBotUsername(token);
                }, 1000); // Wait 1 second after user stops typing
            } else {
                // Clear username if token is empty
                telegramBotUsername = null;
                updateTelegramBotElements();
            }
        });
        
        // Also trigger on blur for immediate response
        tokenInput.addEventListener('blur', function() {
            clearTimeout(fetchTimeout);
            const token = this.value.trim();
            if (token.length > 0) {
                fetchAndStoreBotUsername(token);
            }
        });
    }
    
    // Initialize bot username for hardcoded token if no user token is provided
    setTimeout(() => {
        const effectiveToken = getEffectiveTelegramToken();
        if (effectiveToken && !telegramBotUsername) {
            console.log('📱 Initializing bot username for hardcoded token...');
            fetchAndStoreBotUsername(effectiveToken);
        }
    }, 1000); // Wait 1 second after DOM is ready
});

// Telegram Waitlist System - Server-Only Management
// Client now only applies prompts when instructed by server

function updateTelegramControlsVisibility() {
    const isVisible = config.TELEGRAM_RECEIVE === true;
    const displayValue = isVisible ? 'block' : 'none';
    
    // Control visibility of individual Telegram elements
    const waitlistControls = document.getElementById('telegramWaitlistControls');
    const clearButton = document.getElementById('telegramClearButton');
    const qrContent = document.getElementById('telegramQRContent');
    
    if (waitlistControls) waitlistControls.style.display = displayValue;
    if (clearButton) clearButton.style.display = displayValue;
    if (qrContent) qrContent.style.display = displayValue;
    
    // Find and hide/show the Bot Token section
    const telegramTokenInput = document.getElementById('telegramTokenInput');
    if (telegramTokenInput) {
        const botTokenSection = telegramTokenInput.closest('.control-item');
        if (botTokenSection) botTokenSection.style.display = displayValue;
    }
    
    // Find and hide/show the Telegram Bot Link section
    const telegramBotLink = document.getElementById('telegramBotLink');
    if (telegramBotLink) {
        const botLinkSection = telegramBotLink.closest('.control-item');
        if (botLinkSection) botLinkSection.style.display = displayValue;
    }
}

function updateTelegramWaitlistInterval(value) {
    // Ensure we store and send integer values
    const intValue = Math.round(value);
    config.TELEGRAM_WAITLIST_INTERVAL = intValue;
    console.log(`📱 Telegram waitlist interval set to ${intValue} seconds`);
    
    // Add to debug log
    addTelegramMessageToDebug({
        type: 'telegram_waitlist_interval_changed',
        interval: intValue
    });
    
    // Notify server of interval change
    sendToServer({
        type: 'telegram_waitlist_interval_changed',
        interval: intValue
    });
    
    // Save settings
    saveTelegramSettings();
}

function addToTelegramWaitlist(message) {
    // Add to debug log
    addTelegramMessageToDebug({
        type: 'telegram_waitlist_added',
        prompt: message.prompt,
        from: message.from,
        messageType: message.type || 'telegram_prompt'
    });
    
    const waitlistEntry = {
        prompt: message.prompt,
        from: message.from,
        timestamp: new Date().toLocaleString(),
        id: Date.now() + Math.random(), // Simple unique ID
        chatId: message.chatId, // Store for server feedback
        addedAt: Date.now(), // Add timestamp for smart processing
        type: message.type || 'telegram_prompt', // Store message type
        // Store additional data for ControlNet presets
        ...(message.type === 'controlnet_preset' ? {
            presetName: message.presetName,
            presetDisplayName: message.presetDisplayName,
            presetDescription: message.presetDescription,
            parameters: message.parameters
        } : {})
    };
    
    // Handle different types of prompts
    if (message.type === 'controlnet_preset') {
        // Apply ControlNet preset parameters
        Object.entries(message.parameters).forEach(([key, value]) => {
            if (config.hasOwnProperty(key)) {
                config[key] = value;
                console.log(`⚙️ Updated ${key} = ${value}`);
            }
        });
        
        // Update all slider positions and values
        updateSliderPositions();
        
        // Save configuration
        saveConfig();
        
        console.log(`✅ Applied ControlNet preset: ${message.presetDisplayName}`);
        
        // Confirm to server that ControlNet preset was applied
        sendToServer({
            type: 'controlnet_preset_applied',
            presetName: message.presetName,
            presetDisplayName: message.presetDisplayName,
            from: message.from,
            chatId: message.chatId
        });
    } else if (message.isPreset && message.presetName) {
        // Handle prompt preset
        setPrompt(message.prompt);
        
        // Confirm to server that prompt preset was applied
        sendToServer({
            type: 'telegram_prompt_applied',
            promptId: message.id,
            prompt: message.prompt,
            from: message.from,
            chatId: message.chatId,
            isPreset: true,
            presetName: message.presetName
        });
    } else {
        // Handle regular prompt (default behavior)
        setPrompt(message.prompt);
        
        // Confirm to server that prompt was applied
        sendToServer({
            type: 'telegram_prompt_applied',
            promptId: message.id,
            prompt: message.prompt,
            from: message.from,
            chatId: message.chatId
        });
    }
    
    // Update debug display
    if (config.DEBUG_MODE) {
        updateMobileDebugInfo({
            status: 'Running',
            panelState: document.getElementById('controlPanel')?.classList.contains('collapsed') ? 'collapsed' : 'expanded',
            touchEvents: window.mobileDebugTouchCount || 0,
            canvasReady: !!document.getElementById('fluidCanvas'),
            screenSize: `${window.innerWidth}x${window.innerHeight}`,
            timestamp: new Date().toLocaleTimeString()
        });
    }
}

function processNextTelegramPrompt() {
    if (telegramWaitlist.length === 0) {
        stopTelegramProcessing();
        return;
    }
    
    const nextItem = telegramWaitlist.shift(); // Remove first item (FIFO)
    console.log(`📱 Processing waitlist item: "${nextItem.prompt}" from ${nextItem.from} (type: ${nextItem.type || 'prompt'})`);
    
    // Debug logging removed - now handled in the specific processing sections below
    
    // Handle different types of waitlist items
    if (nextItem.type === 'controlnet_preset') {
        // Apply ControlNet preset parameters
        Object.entries(nextItem.parameters).forEach(([key, value]) => {
            if (config.hasOwnProperty(key)) {
                config[key] = value;
                console.log(`⚙️ Updated ${key} = ${value}`);
            }
        });
        
        // Update all slider positions and values
        updateSliderPositions();
        
        // Save configuration
        saveConfig();
        
        console.log(`✅ Applied ControlNet preset: ${nextItem.presetDisplayName}`);
        
        // Send feedback to server that ControlNet preset was applied
        sendToServer({
            type: 'controlnet_preset_applied',
            presetName: nextItem.presetName,
            presetDisplayName: nextItem.presetDisplayName,
            from: nextItem.from,
            chatId: nextItem.chatId
        });
    } else if (nextItem.isPreset && nextItem.presetName) {
        // Handle prompt preset
        setPrompt(nextItem.prompt);
        
        // Add to debug log - show processed message with content and timestamp
        addTelegramMessageToDebug({
            type: 'telegram_prompt_processed',
            prompt: nextItem.prompt,
            from: nextItem.from,
            timestamp: nextItem.timestamp || new Date().toLocaleString()
        });
        
        // Send feedback to server that prompt preset was applied
        sendToServer({
            type: 'telegram_prompt_applied',
            promptId: nextItem.id,
            prompt: nextItem.prompt,
            from: nextItem.from,
            chatId: nextItem.chatId,
            isPreset: true,
            presetName: nextItem.presetName
        });
    } else {
        // Handle regular prompt (default behavior)
        setPrompt(nextItem.prompt);
        
        // Add to debug log - show processed message with content and timestamp
        addTelegramMessageToDebug({
            type: 'telegram_prompt_processed',
            prompt: nextItem.prompt,
            from: nextItem.from,
            timestamp: nextItem.timestamp || new Date().toLocaleString()
        });
        
        // Send feedback to server that prompt was applied
        sendToServer({
            type: 'telegram_prompt_applied',
            promptId: nextItem.id,
            prompt: nextItem.prompt,
            from: nextItem.from,
            chatId: nextItem.chatId
        });
    }
    
    // Update timestamps for remaining items (they become the new "first")
    if (telegramWaitlist.length > 0) {
        telegramWaitlist[0].addedAt = Date.now();
    }
    
    // Update debug display
    if (config.DEBUG_MODE) {
        updateMobileDebugInfo({
            status: 'Running',
            panelState: document.getElementById('controlPanel')?.classList.contains('collapsed') ? 'collapsed' : 'expanded',
            touchEvents: window.mobileDebugTouchCount || 0,
            canvasReady: !!document.getElementById('fluidCanvas'),
            screenSize: `${window.innerWidth}x${window.innerHeight}`,
            timestamp: new Date().toLocaleTimeString()
        });
    }
}

function startTelegramProcessing() {
    if (telegramProcessingTimer) return; // Already running
    
    const interval = (config.TELEGRAM_WAITLIST_INTERVAL || 1) * 1000; // Convert to milliseconds
    
    telegramProcessingTimer = setInterval(() => {
        processNextTelegramPrompt();
    }, interval);
    
    console.log(`📱 Started Telegram processing timer (${config.TELEGRAM_WAITLIST_INTERVAL || 1}s intervals)`);
}

function stopTelegramProcessing() {
    if (telegramProcessingTimer) {
        clearInterval(telegramProcessingTimer);
        telegramProcessingTimer = null;
        console.log('📱 Stopped Telegram processing timer');
    }
}

function clearTelegramWaitlist() {
    // Add to debug log
    addTelegramMessageToDebug({
        type: 'telegram_waitlist_cleared'
    });
    
    // Notify server to clear its waitlist
    sendToServer({
        type: 'telegram_waitlist_cleared'
    });
    
    console.log('📱 Requested server to clear Telegram waitlist');
    
    // Show brief notification
    const notification = document.createElement('div');
    notification.textContent = '🗑️ Clearing waitlist...';
    notification.style.cssText = `
        position: fixed; top: 20px; right: 20px; background: rgba(255, 107, 107, 0.9);
        color: white; padding: 10px 15px; border-radius: 5px; z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    `;
    document.body.appendChild(notification);
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 3000);
}

function updateDebugDisplay() {
    const debugInfo = document.getElementById('debugInfo');
    if (!debugInfo || !config.DEBUG_MODE) return;
    
    // Get basic debug info (similar to existing updateMobileDebugInfo)
    const panel = document.getElementById('controlPanel');
    const info = {
        status: 'Running',
        panelState: panel ? (panel.classList.contains('collapsed') ? 'collapsed' : 'expanded') : 'missing',
        touchEvents: window.mobileDebugTouchCount || 0,
        canvasReady: !!document.getElementById('fluidCanvas'),
        screenSize: `${window.innerWidth}x${window.innerHeight}`,
        timestamp: new Date().toLocaleTimeString()
    };
    
    // Get OSC status info
    const oscStatus = getOSCStatusForDebug();
    
    // Get Telegram waitlist info
    const waitlistInfo = getTelegramWaitlistInfo();
    
    debugInfo.innerHTML = `
        <div><span style="color: #60a5fa;">Status:</span> <span style="color: #fbbf24;">${info.status}</span></div>
        <div><span style="color: #60a5fa;">Panel:</span> <span style="color: #fbbf24;">${info.panelState}</span></div>
        <div><span style="color: #60a5fa;">Touch Events:</span> <span style="color: #fbbf24;">${info.touchEvents}</span></div>
        <div><span style="color: #60a5fa;">Canvas:</span> <span style="color: #fbbf24;">${info.canvasReady ? 'Ready' : 'Missing'}</span></div>
        <div><span style="color: #60a5fa;">Screen:</span> <span style="color: #fbbf24;">${info.screenSize || 'Unknown'}</span></div>
        <div><span style="color: #60a5fa;">Time:</span> <span style="color: #fbbf24;">${info.timestamp || 'N/A'}</span></div>
        <div><span style="color: #60a5fa;">OSC Server:</span> <span style="color: ${oscStatus.color};">${oscStatus.text}</span></div>
        <div style="margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 6px;">
            <div><span style="color: #f472b6;">📱 Telegram:</span> <span style="color: #fbbf24;">${waitlistInfo.status}</span></div>
            <div><span style="color: #f472b6;">Waitlist:</span> <span style="color: #fbbf24;">${waitlistInfo.count} queued</span></div>
            ${waitlistInfo.nextPrompt ? `<div><span style="color: #f472b6;">Next:</span> <span style="color: #fbbf24;">"${waitlistInfo.nextPrompt}"</span></div>` : ''}
            <div><span style="color: #f472b6;">Interval:</span> <span style="color: #fbbf24;">${waitlistInfo.interval}s</span></div>
        </div>
    `;
}

function getTelegramWaitlistInfo() {
    const isEnabled = config.TELEGRAM_RECEIVE === true;
    const interval = config.TELEGRAM_WAITLIST_INTERVAL || 1;
    
    let status = 'Disabled';
    if (isEnabled) {
        status = 'Server Managed';
    }
    
    return {
        status: status,
        count: '?', // Server manages queue now
        nextPrompt: null, // Server manages queue now
        interval: interval
    };
}

// Send message to server via WebSocket
function sendToServer(message) {
    if (oscWebSocket && oscWebSocket.readyState === WebSocket.OPEN) {
        try {
            oscWebSocket.send(JSON.stringify(message));
            console.log('📤 Sent to server:', message.type);
        } catch (error) {
            console.error('❌ Error sending to server:', error);
        }
    } else {
        console.log('⚠️ Cannot send to server: WebSocket not connected');
    }
}

// Prompt presets for keyboard shortcuts
const PROMPT_PRESETS = [
    'blooming flower with delicate petals, vibrant colors, soft natural lighting, botanical beauty, detailed macro photography, spring garden atmosphere',
    'giant glowing jellyfish, slow graceful movement, neon blue and pink bioluminescence, flowing tendrils like silk, underwater ballet, dreamlike ocean atmosphere',
    'evolving fractal jellyfish, recursive growth, rainbow light trails, kaleidoscopic motion',
    'northern lights over snow-capped mountains, aurora borealis, starry night sky, ethereal green and purple lights, pristine wilderness',
    'floating islands with waterfalls, magical gardens, ethereal mist, fantasy landscape, soft pastel colors, Studio Ghibli style',
    'bioluminescent mushrooms, glowing forest at night, magical blue and green lights, fairy tale atmosphere, mystical fog'
];

function setPrompt(promptText) {
    const promptInput = document.getElementById('promptInput');
    console.log('🎯 setPrompt called with:', promptText);
    console.log('🎯 promptInput element:', promptInput);
    console.log('🎯 Current prompt value before setting:', promptInput ? promptInput.value : 'N/A');
    
    if (promptInput) {
        promptInput.value = promptText;
        console.log('✅ Prompt input field updated to:', promptInput.value);
        
        // Save the new prompt
        savePrompts();
        
        // Update active state for preset buttons
        const presetButtons = document.querySelectorAll('.preset-btn');
        presetButtons.forEach(button => {
            button.classList.remove('active');
            // Check if this button's prompt matches the current prompt
            const buttonPrompt = button.getAttribute('onclick').match(/setPrompt\('([^']+)'\)/);
            if (buttonPrompt && buttonPrompt[1] === promptText) {
                button.classList.add('active');
            }
        });
        
        // Trigger parameter update if stream is active
        if (streamState.streamId) {
            debouncedParameterUpdate();
        }
        
        console.log('✅ Prompt set to:', promptText);
        
        // Verify the value is still set after a short delay
        setTimeout(() => {
            console.log('🔍 Prompt verification after 100ms:', promptInput.value);
        }, 100);
    } else {
        console.error('❌ promptInput element not found!');
    }
}

function setPromptPreset(presetIndex) {
    if (presetIndex >= 0 && presetIndex < PROMPT_PRESETS.length) {
        setPrompt(PROMPT_PRESETS[presetIndex]);
    }
}

// ControlNet Presets based on Stable Diffusion Art best practices
function setControlNetPreset(presetName, event) {
    // Remove active class from all buttons
    document.querySelectorAll('.preset-button').forEach(btn => btn.classList.remove('active'));
    
    // Add active class to clicked button
    if (event && event.target) {
        event.target.classList.add('active');
    } else {
        // Fallback: find button by preset name
        const buttons = document.querySelectorAll('.preset-button');
        buttons.forEach(btn => {
            if (btn.textContent.toLowerCase() === presetName.toLowerCase()) {
                btn.classList.add('active');
            }
        });
    }
    
    let presetConfig = {};
    
    switch(presetName) {
        case 'balanced':
            // Balanced preset: Good for general use with moderate control
            presetConfig = {
                CONTROLNET_POSE_SCALE: 0.65,
                CONTROLNET_HED_SCALE: 0.41,
                CONTROLNET_CANNY_SCALE: 0.00,
                CONTROLNET_DEPTH_SCALE: 0.21,
                CONTROLNET_COLOR_SCALE: 0.26,
                DENOISE_X: 3,
                DENOISE_Y: 6,
                DENOISE_Z: 6
            };
            break;
            
        case 'portrait':
            // Portrait preset: Optimized for human subjects with strong pose control
            presetConfig = {
                CONTROLNET_POSE_SCALE: 0.85,  // Strong pose control for human figures
                CONTROLNET_HED_SCALE: 0.70,   // Good edge detection for faces
                CONTROLNET_CANNY_SCALE: 0.40, // Moderate edge detection
                CONTROLNET_DEPTH_SCALE: 0.60, // Good depth for facial features
                CONTROLNET_COLOR_SCALE: 0.75, // Strong color preservation for skin tones
                DENOISE_X: 2,
                DENOISE_Y: 4,
                DENOISE_Z: 6
            };
            break;
            
        case 'composition':
            // Composition preset: Strong structural control with Canny and Depth
            presetConfig = {
                CONTROLNET_POSE_SCALE: 0.40,  // Less pose control
                CONTROLNET_HED_SCALE: 0.45,   // Moderate soft edges
                CONTROLNET_CANNY_SCALE: 0.80, // Strong edge detection for composition
                CONTROLNET_DEPTH_SCALE: 0.75, // Strong depth control
                CONTROLNET_COLOR_SCALE: 0.35, // Lower color control for more creativity
                DENOISE_X: 4,
                DENOISE_Y: 8,
                DENOISE_Z: 12
            };
            break;
            
        case 'artistic':
            // Artistic preset: More creative freedom with subtle controls
            presetConfig = {
                CONTROLNET_POSE_SCALE: 0.30,  // Loose pose control
                CONTROLNET_HED_SCALE: 0.75,   // Strong soft edge detection
                CONTROLNET_CANNY_SCALE: 0.25, // Minimal hard edges
                CONTROLNET_DEPTH_SCALE: 0.35, // Subtle depth guidance
                CONTROLNET_COLOR_SCALE: 0.40, // Moderate color influence
                DENOISE_X: 6,
                DENOISE_Y: 12,
                DENOISE_Z: 18
            };
            break;
    }
    
    // Apply the preset configuration
    Object.keys(presetConfig).forEach(key => {
        if (config.hasOwnProperty(key)) {
            config[key] = presetConfig[key];
        }
    });
    
    // Update all slider positions and values
    updateSliderPositions();
    
    // Save configuration
    saveConfig();
    
    console.log(`Applied ControlNet preset: ${presetName}`);
}

function toggleFluidControls() {
    const content = document.getElementById('fluidControlsContent');
    const toggle = document.getElementById('fluidControlsIcon');
    
    if (content.classList.contains('expanded')) {
        content.classList.remove('expanded');
        toggle.textContent = '▶';
    } else {
        content.classList.add('expanded');
        toggle.textContent = '▼';
    }
}

function isMobile () {
    const mobile = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
           ('ontouchstart' in window) || 
           (navigator.maxTouchPoints > 0);
    
    // Mobile debugging
    if (mobile) {
        console.log('🔍 MOBILE DEBUG: Device detected as mobile');
        console.log('🔍 User Agent:', navigator.userAgent);
        console.log('🔍 Touch Support:', 'ontouchstart' in window);
        console.log('🔍 Max Touch Points:', navigator.maxTouchPoints);
        console.log('🔍 Screen Size:', window.screen.width, 'x', window.screen.height);
        console.log('🔍 Viewport Size:', window.innerWidth, 'x', window.innerHeight);
    }
    
    return mobile;
}

function isTouchDevice() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

// Mobile Debug Overlay System
function initializeMobileDebug() {
    if (!isMobile()) return;
    
    const debugOverlay = document.getElementById('mobileDebug');
    const debugInfo = document.getElementById('debugInfo');
    
    if (debugOverlay && debugInfo) {
        // Show debug overlay only if debug mode is enabled
        if (config.DEBUG_MODE) {
            debugOverlay.style.display = 'block';
            debugOverlay.style.setProperty('display', 'block', 'important');
        }
        
        // Initial debug info
        updateMobileDebugInfo({
            status: 'Initializing...',
            panelState: 'unknown',
            touchEvents: 0,
            canvasReady: !!document.getElementById('fluidCanvas')
        });
        
        // Update debug info periodically
        setInterval(() => {
            const panel = document.getElementById('controlPanel');
            updateMobileDebugInfo({
                status: 'Running',
                panelState: panel ? (panel.classList.contains('collapsed') ? 'collapsed' : 'expanded') : 'missing',
                touchEvents: window.mobileDebugTouchCount || 0,
                canvasReady: !!document.getElementById('fluidCanvas'),
                screenSize: `${window.innerWidth}x${window.innerHeight}`,
                timestamp: new Date().toLocaleTimeString()
            });
        }, 2000);
    }
}

function updateMobileDebugInfo(info) {
    const debugInfo = document.getElementById('debugInfo');
    if (!debugInfo) return;
    
    // Get OSC status info
    const oscStatus = getOSCStatusForDebug();
    
    // Get Telegram waitlist info
    const waitlistInfo = getTelegramWaitlistInfo();
    
    // Get Daydream stream status
    const daydreamStatus = getDaydreamStatusForDebug();
    
    debugInfo.innerHTML = `
        <div><span style="color: #60a5fa;">Status:</span> <span style="color: #fbbf24;">${info.status}</span></div>
        <div><span style="color: #60a5fa;">Panel:</span> <span style="color: #fbbf24;">${info.panelState}</span></div>
        <div><span style="color: #60a5fa;">Touch Events:</span> <span style="color: #fbbf24;">${info.touchEvents}</span></div>
        <div><span style="color: #60a5fa;">Canvas:</span> <span style="color: #fbbf24;">${info.canvasReady ? 'Ready' : 'Missing'}</span></div>
        <div><span style="color: #60a5fa;">Screen:</span> <span style="color: #fbbf24;">${info.screenSize || 'Unknown'}</span></div>
        <div><span style="color: #60a5fa;">Time:</span> <span style="color: #fbbf24;">${info.timestamp || 'N/A'}</span></div>
        <div><span style="color: #60a5fa;">OSC Server:</span> <span style="color: ${oscStatus.color};">${oscStatus.text}</span></div>
        <div style="margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 6px;">
            <div><span style="color: #f472b6;">📱 Telegram:</span> <span style="color: #fbbf24;">${waitlistInfo.status}</span></div>
            <div><span style="color: #f472b6;">Waitlist:</span> <span style="color: #fbbf24;">${waitlistInfo.count} queued</span></div>
            ${waitlistInfo.nextPrompt ? `<div><span style="color: #f472b6;">Next:</span> <span style="color: #fbbf24;">"${waitlistInfo.nextPrompt}"</span></div>` : ''}
            <div><span style="color: #f472b6;">Interval:</span> <span style="color: #fbbf24;">${waitlistInfo.interval}s</span></div>
        </div>
        <div style="margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 6px;">
            <div><span style="color: #8b5cf6;">☁️ Daydream:</span> <span style="color: ${daydreamStatus.color};">${daydreamStatus.text}</span></div>
            ${streamState.playbackId ? `<div><span style="color: #8b5cf6;">Playback:</span> <span style="color: #fbbf24;">${streamState.playbackId.substring(0, 12)}...</span></div>` : ''}
            ${streamState.peerConnection ? `<div><span style="color: #8b5cf6;">WebRTC:</span> <span style="color: #fbbf24;">${streamState.peerConnection.connectionState}</span></div>` : ''}
            ${streamState.isStreaming && streamState.streamId ? `
                <div><span style="color: #8b5cf6;">Stream ID:</span> <span style="color: #fbbf24;">${streamState.streamId}</span></div>
                <div><span style="color: #8b5cf6;">WHIP URL:</span> <span style="color: #fbbf24;">${streamState.whipUrl || 'N/A'}</span></div>
                <div><span style="color: #8b5cf6;">Livepeer URL:</span> <span style="color: #fbbf24;">https://lvpr.tv/?v=${streamState.playbackId}&lowLatency=force&controls=false</span></div>
            ` : ''}
        </div>
    `;
}

function getOSCStatusForDebug() {
    if (oscConnectionStatus === 'connected' && oscServerIP) {
        return {
            text: `192.168.178.59:8000`,
            color: '#22c55e' // Green
        };
    } else if (oscConnectionStatus === 'https_blocked') {
        return {
            text: 'HTTPS Blocked',
            color: '#f59e0b' // Orange
        };
    } else {
        return {
            text: 'Disconnected',
            color: '#ef4444' // Red
        };
    }
}

function getDaydreamStatusForDebug() {
    if (streamState.isStreaming && streamState.streamId && streamState.playbackId) {
        return {
            text: `Active (${streamState.streamId.substring(0, 8)}...)`,
            color: '#22c55e' // Green for active stream
        };
    } else if (streamState.streamId && streamState.playbackId && !streamState.isStreaming) {
        return {
            text: `Ready (${streamState.streamId.substring(0, 8)}...)`,
            color: '#f59e0b' // Orange for ready but not streaming
        };
    } else if (streamState.streamId && !streamState.playbackId) {
        return {
            text: 'Creating...',
            color: '#8b5cf6' // Purple for creating
        };
    } else {
        return {
            text: 'Not Connected',
            color: '#6b7280' // Gray for not connected
        };
    }
}

async function fetchDaydreamStreamStatus() {
    if (!streamState.streamId || !config.DEBUG_MODE) return null;
    
    try {
        const apiKey = getApiKey();
        if (!apiKey) return null;
        
        const response = await fetch(`https://daydream.live/api/streams/${streamState.streamId}/status`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            return data.data;
        }
    } catch (error) {
        console.warn('Failed to fetch stream status:', error);
    }
    
    return null;
}

function updateOSCSectionVisibility() {
    const oscInfoDiv = document.getElementById('oscInfo');
    const oscMessagesDiv = document.getElementById('oscMessages');
    
    if (!oscInfoDiv || !oscMessagesDiv) return;
    
    // Hide OSC section if no messages, show if messages exist
    if (oscMessagesDiv.children.length === 0) {
        oscInfoDiv.style.display = 'none';
    } else {
        oscInfoDiv.style.display = 'block';
    }
}

function updateTelegramSectionVisibility() {
    const telegramInfoDiv = document.getElementById('telegramInfo');
    const telegramMessagesDiv = document.getElementById('telegramMessages');
    
    if (!telegramInfoDiv || !telegramMessagesDiv) return;
    
    // Hide Telegram section if no messages, show if messages exist
    if (telegramMessagesDiv.children.length === 0) {
        telegramInfoDiv.style.display = 'none';
    } else {
        telegramInfoDiv.style.display = 'block';
    }
}

function updateDaydreamSectionVisibility() {
    const daydreamInfoDiv = document.getElementById('daydreamInfo');
    const daydreamMessagesDiv = document.getElementById('daydreamMessages');
    
    if (!daydreamInfoDiv || !daydreamMessagesDiv) return;
    
    // Hide Daydream section if no messages, show if messages exist
    if (daydreamMessagesDiv.children.length === 0) {
        daydreamInfoDiv.style.display = 'none';
    } else {
        daydreamInfoDiv.style.display = 'block';
    }
}

function addOSCMessageToDebug(message) {
    if (!config.DEBUG_MODE) return;
    
    const oscMessagesDiv = document.getElementById('oscMessages');
    if (!oscMessagesDiv) return;
    
    const timestamp = new Date().toLocaleTimeString();
    let messageText = '';
    let messageColor = '#60a5fa'; // Default blue
    
    if (message.type === 'osc_message') {
        if (message.parameter) {
            // Format parameter name for better readability
            const paramName = message.parameter.replace('OSC_SPLAT_', 'S').replace('_', '');
            const value = typeof message.value === 'number' ? message.value.toFixed(3) : message.value;
            messageText = `${paramName} = ${value}`;
            messageColor = '#60a5fa'; // Blue for parameters
        } else if (message.action) {
            messageText = `Action: ${message.action}`;
            messageColor = '#22c55e'; // Green for actions
        }
    } else if (message.type === 'osc_velocity_drawing') {
        const velocity = Math.sqrt(message.deltaX * message.deltaX + message.deltaY * message.deltaY);
        messageText = `VelDraw${message.channel}: (${message.x.toFixed(2)}, ${message.y.toFixed(2)}) v=${velocity.toFixed(2)}`;
        messageColor = '#f59e0b'; // Orange for velocity drawing
    } else if (message.type === 'server_info') {
        messageText = 'Server Info';
        messageColor = '#a855f7'; // Purple for server info
    } else {
        messageText = JSON.stringify(message);
    }
    
    const messageElement = document.createElement('div');
    messageElement.style.cssText = `
        margin-bottom: 2px;
        font-size: 10px;
        line-height: 1.2;
    `;
    messageElement.innerHTML = `
        <span style="color: #6b7280;">${timestamp}</span> 
        <span style="color: ${messageColor};">${messageText}</span>
    `;
    
    oscMessagesDiv.appendChild(messageElement);
    
    // Keep only the last 20 messages
    while (oscMessagesDiv.children.length > 20) {
        oscMessagesDiv.removeChild(oscMessagesDiv.firstChild);
    }
    
    // Auto-scroll to bottom
    oscMessagesDiv.scrollTop = oscMessagesDiv.scrollHeight;
    
    // Update OSC section visibility
    updateOSCSectionVisibility();
}

function addTelegramMessageToDebug(message) {
    if (!config.DEBUG_MODE) return;
    
    const telegramMessagesDiv = document.getElementById('telegramMessages');
    if (!telegramMessagesDiv) return;
    
    const timestamp = new Date().toLocaleTimeString();
    let messageText = '';
    let messageColor = '#60a5fa'; // Default blue
    
    if (message.type === 'telegram_prompt' || message.type === 'apply_telegram_prompt') {
        const prompt = message.prompt || 'No prompt';
        const from = message.from || 'Unknown';
        messageText = `Prompt from ${from}: "${prompt}"`;
        messageColor = '#60a5fa'; // Blue for prompts
    } else if (message.type === 'controlnet_preset') {
        const presetName = message.presetName || 'Unknown preset';
        messageText = `ControlNet Preset: ${presetName}`;
        messageColor = '#22c55e'; // Green for presets
    } else if (message.type === 'telegram_prompt_applied') {
        const prompt = message.prompt || 'No prompt';
        messageText = `Applied: "${prompt}"`;
        messageColor = '#10b981'; // Emerald for applied prompts
    } else if (message.type === 'telegram_waitlist_cleared') {
        messageText = 'Waitlist cleared';
        messageColor = '#f59e0b'; // Orange for waitlist actions
    } else if (message.type === 'telegram_waitlist_interval_changed') {
        const interval = message.interval || 'Unknown';
        messageText = `Interval changed to ${interval}s`;
        messageColor = '#8b5cf6'; // Purple for settings changes
    } else if (message.type === 'telegram_token_updated') {
        messageText = 'Bot token updated';
        messageColor = '#ef4444'; // Red for token updates
    } else if (message.type === 'telegram_waitlist_added') {
        const prompt = message.prompt || 'No prompt';
        const from = message.from || 'Unknown';
        messageText = `Added to waitlist: "${prompt}" from ${from}`;
        messageColor = '#f59e0b'; // Orange for waitlist additions
    } else if (message.type === 'telegram_waitlist_processing') {
        const prompt = message.prompt || 'No prompt';
        const from = message.from || 'Unknown';
        messageText = `Processing: "${prompt}" from ${from}`;
        messageColor = '#10b981'; // Emerald for processing
    } else if (message.type === 'telegram_prompt_processed') {
        const prompt = message.prompt || 'No prompt';
        const from = message.from || 'Unknown';
        const timestamp = message.timestamp || 'Unknown time';
        messageText = `Processed: "${prompt}" from ${from} (${timestamp})`;
        messageColor = '#10b981'; // Emerald for processed
    } else {
        messageText = JSON.stringify(message);
    }
    
    const messageElement = document.createElement('div');
    messageElement.style.cssText = `
        margin-bottom: 2px;
        font-size: 10px;
        line-height: 1.2;
    `;
    messageElement.innerHTML = `
        <span style="color: #6b7280;">${timestamp}</span> 
        <span style="color: ${messageColor};">${messageText}</span>
    `;
    
    telegramMessagesDiv.appendChild(messageElement);
    
    // Keep only the last 20 messages
    while (telegramMessagesDiv.children.length > 20) {
        telegramMessagesDiv.removeChild(telegramMessagesDiv.firstChild);
    }
    
    // Auto-scroll to bottom
    telegramMessagesDiv.scrollTop = telegramMessagesDiv.scrollHeight;
    
    // Update Telegram section visibility
    updateTelegramSectionVisibility();
}

function addDaydreamEventToDebug(message) {
    if (!config.DEBUG_MODE) return;
    
    const daydreamMessagesDiv = document.getElementById('daydreamMessages');
    if (!daydreamMessagesDiv) return;
    
    const timestamp = new Date().toLocaleTimeString();
    let messageText = '';
    let messageColor = '#60a5fa'; // Default blue
    
    if (message.type === 'stream_created') {
        const streamId = message.streamId || 'Unknown';
        const playbackId = message.playbackId || 'Unknown';
        messageText = `Stream created: ${streamId.substring(0, 8)}... (${playbackId.substring(0, 8)}...)`;
        messageColor = '#22c55e'; // Green for successful creation
    } else if (message.type === 'stream_started') {
        messageText = 'Stream started';
        messageColor = '#10b981'; // Emerald for active stream
    } else if (message.type === 'stream_stopped') {
        messageText = 'Stream stopped';
        messageColor = '#ef4444'; // Red for stopped stream
    } else if (message.type === 'stream_connecting') {
        messageText = 'Connecting to stream...';
        messageColor = '#f59e0b'; // Orange for connecting
    } else if (message.type === 'stream_connected') {
        messageText = 'WebRTC connected';
        messageColor = '#22c55e'; // Green for connected
    } else if (message.type === 'stream_disconnected') {
        messageText = 'WebRTC disconnected';
        messageColor = '#ef4444'; // Red for disconnected
    } else if (message.type === 'stream_error') {
        const error = message.error || 'Unknown error';
        messageText = `Error: ${error}`;
        messageColor = '#ef4444'; // Red for errors
    } else if (message.type === 'parameters_updated') {
        const prompt = message.prompt || 'No prompt';
        messageText = `Parameters updated: "${prompt.substring(0, 30)}${prompt.length > 30 ? '...' : ''}"`;
        messageColor = '#8b5cf6'; // Purple for parameter updates
    } else if (message.type === 'popup_opened') {
        const playbackId = message.playbackId || 'Unknown';
        messageText = `Player opened: ${playbackId.substring(0, 8)}...`;
        messageColor = '#06a3d7'; // Blue for popup actions
    } else if (message.type === 'popup_closed') {
        messageText = 'Player closed';
        messageColor = '#6b7280'; // Gray for popup closed
    } else if (message.type === 'stream_validated') {
        const streamId = message.streamId || 'Unknown';
        messageText = `Stream validated: ${streamId.substring(0, 8)}...`;
        messageColor = '#22c55e'; // Green for validation
    } else if (message.type === 'stream_invalid') {
        messageText = 'Saved stream invalid, creating new';
        messageColor = '#f59e0b'; // Orange for invalid stream
    } else {
        messageText = JSON.stringify(message);
    }
    
    const messageElement = document.createElement('div');
    messageElement.style.cssText = `
        margin-bottom: 2px;
        font-size: 10px;
        line-height: 1.2;
    `;
    messageElement.innerHTML = `
        <span style="color: #6b7280;">${timestamp}</span> 
        <span style="color: ${messageColor};">${messageText}</span>
    `;
    
    daydreamMessagesDiv.appendChild(messageElement);
    
    // Keep only the last 20 messages
    while (daydreamMessagesDiv.children.length > 20) {
        daydreamMessagesDiv.removeChild(daydreamMessagesDiv.firstChild);
    }
    
    // Auto-scroll to bottom
    daydreamMessagesDiv.scrollTop = daydreamMessagesDiv.scrollHeight;
    
    // Update Daydream section visibility
    updateDaydreamSectionVisibility();
}

function getDevicePixelRatio() {
    return window.devicePixelRatio || 1;
}

function captureScreenshot () {
    let res = getResolution(config.CAPTURE_RESOLUTION);
    let target = createFBO(res.width, res.height, ext.formatRGBA.internalFormat, ext.formatRGBA.format, ext.halfFloatTexType, gl.NEAREST);
    render(target);

    let texture = framebufferToTexture(target);
    texture = normalizeTexture(texture, target.width, target.height);

    let captureCanvas = textureToCanvas(texture, target.width, target.height);
    let datauri = captureCanvas.toDataURL();
    
    // Check if device is iOS (iPad/iPhone)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    
    if (isIOS) {
        // Show image in modal for iOS devices so users can long-press to save to Photos
        showScreenshotModal(datauri);
    } else {
        // Use download behavior for other devices
        downloadURI('fluid.png', datauri);
    }
    URL.revokeObjectURL(datauri);
}

function showScreenshotModal(datauri) {
    // Create modal overlay
    const modal = document.createElement('div');
    modal.id = 'screenshotModal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
    `;
    
    // Create image element
    const img = document.createElement('img');
    img.src = datauri;
    img.style.cssText = `
        max-width: 90%;
        max-height: 70%;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        user-select: none;
        -webkit-user-select: none;
    `;
    
    // Create instruction text
    const instructions = document.createElement('div');
    instructions.style.cssText = `
        color: white;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 18px;
        text-align: center;
        margin-top: 20px;
        padding: 0 20px;
        line-height: 1.4;
    `;
    instructions.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 8px;">Screenshot Captured!</div>
        <div style="font-size: 16px; opacity: 0.9;">Long press the image above to save to Photos</div>
        <div style="font-size: 14px; opacity: 0.7; margin-top: 12px;">Tap anywhere else to close</div>
    `;
    
    // Create close button
    const closeButton = document.createElement('button');
    closeButton.textContent = '✕';
    closeButton.style.cssText = `
        position: absolute;
        top: 20px;
        right: 20px;
        background: rgba(255, 255, 255, 0.2);
        border: none;
        color: white;
        font-size: 24px;
        width: 44px;
        height: 44px;
        border-radius: 22px;
        cursor: pointer;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
    `;
    
    // Add elements to modal
    modal.appendChild(closeButton);
    modal.appendChild(img);
    modal.appendChild(instructions);
    
    // Close modal function
    const closeModal = () => {
        if (modal.parentNode) {
            modal.parentNode.removeChild(modal);
        }
    };
    
    // Event listeners
    closeButton.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
    
    // ESC key to close
    const handleKeydown = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', handleKeydown);
        }
    };
    document.addEventListener('keydown', handleKeydown);
    
    // Add to DOM
    document.body.appendChild(modal);
    
    // Auto-close after 30 seconds
    setTimeout(() => {
        if (modal.parentNode) {
            closeModal();
        }
    }, 30000);
}

// Video recording functionality
let videoRecorder = {
    mediaRecorder: null,
    recordedChunks: [],
    isRecording: false,
    displayStream: null
};

async function toggleVideoRecording() {
    if (videoRecorder.isRecording) {
        stopVideoRecording();
    } else {
        await startVideoRecording();
    }
}

async function startVideoRecording() {
    try {
        // Check if there's an active stream
        if (!streamState.playbackId) {
            alert('Please start a stream first before recording.');
            return;
        }

        // Request screen capture with audio
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                mediaSource: 'screen',
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                frameRate: { ideal: 30 }
            },
            audio: {
                mediaSource: 'screen',
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            }
        });

        videoRecorder.displayStream = displayStream;
        videoRecorder.recordedChunks = [];

        // Create MediaRecorder with MP4 support
        const options = {
            mimeType: 'video/webm;codecs=vp9,opus' // WebM with VP9 for better compatibility
        };
        
        // Fallback to other formats if VP9 not supported
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options.mimeType = 'video/webm;codecs=vp8,opus';
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                options.mimeType = 'video/webm';
            }
        }

        videoRecorder.mediaRecorder = new MediaRecorder(displayStream, options);

        videoRecorder.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                videoRecorder.recordedChunks.push(event.data);
            }
        };

        videoRecorder.mediaRecorder.onstop = () => {
            downloadRecording();
            cleanup();
        };

        // Handle when user stops screen sharing
        displayStream.getVideoTracks()[0].onended = () => {
            if (videoRecorder.isRecording) {
                stopVideoRecording();
            }
        };

        videoRecorder.mediaRecorder.start(1000); // Collect data every second
        videoRecorder.isRecording = true;
        
        updateRecordButton(true);
        
        alert('Recording started! Please select the stream window to record. Click "Stop Recording" when done.');

    } catch (error) {
        console.error('Error starting video recording:', error);
        alert('Failed to start recording. Please make sure you grant screen capture permission and select the stream window.');
        cleanup();
    }
}

function stopVideoRecording() {
    if (videoRecorder.mediaRecorder && videoRecorder.isRecording) {
        videoRecorder.mediaRecorder.stop();
        videoRecorder.isRecording = false;
        updateRecordButton(false);
    }
}

function downloadRecording() {
    if (videoRecorder.recordedChunks.length === 0) {
        console.warn('No recorded data available');
        return;
    }

    const blob = new Blob(videoRecorder.recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `fluid-stream-${timestamp}.webm`;
    
    downloadURI(filename, url);
    URL.revokeObjectURL(url);
}

function updateRecordButton(isRecording) {
    const button = document.getElementById('recordButton');
    if (button) {
        button.textContent = isRecording ? 'Stop Recording' : 'Record Video';
        button.className = isRecording ? 'modern-button streaming' : 'modern-button';
    }
}

function cleanup() {
    if (videoRecorder.displayStream) {
        videoRecorder.displayStream.getTracks().forEach(track => track.stop());
        videoRecorder.displayStream = null;
    }
    videoRecorder.mediaRecorder = null;
    videoRecorder.recordedChunks = [];
    videoRecorder.isRecording = false;
    updateRecordButton(false);
}

// Background media functionality (images and videos)
let backgroundMedia = {
    texture: null,
    loaded: false,
    canvas: null,
    width: 0,
    height: 0,
    type: null, // 'image' or 'video'
    element: null, // img or video element
    originalDataURL: null // for images only
};

// Camera feed functionality (moved to line 3416 for WebGL integration)

function initializeMediaUpload() {
    // Initialize media file input
    const fileInput = document.getElementById('mediaFileInput');
    const chooseMediaButton = document.getElementById('chooseMediaButton');
    
    if (!fileInput) {
        console.error('Media file input not found');
        return;
    }
    
    // Set up file change handler
    fileInput.onchange = handleMediaFileSelection;
    
    // Initialize fluid background media upload
    const fluidMediaUpload = document.getElementById('mediaUpload');
    if (fluidMediaUpload) {
        fluidMediaUpload.onchange = handleFluidBackgroundUpload;
        console.log('✅ Fluid background media upload initialized');
    } else {
        console.warn('⚠️ Fluid background media upload input not found');
    }
    
    // Set up Choose Media button handler
    if (chooseMediaButton) {
        const handleMediaSelection = () => {
            // Only allow media selection when media mode is active
            if (mediaState.active) {
                selectMediaFile();
            } else {
                console.warn('🎬 Please activate media mode first');
            }
        };
        
        // Tablet-optimized touch handling for input media button
        if (chooseMediaButton) {
            // Handle touch events to eliminate delays
            chooseMediaButton.addEventListener('touchend', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Trigger the file input immediately
                const fileInput = document.getElementById('mediaFileInput');
                if (fileInput) {
                    fileInput.click();
                }
            }, { passive: false });
            
            // Handle click events as fallback
            chooseMediaButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const fileInput = document.getElementById('mediaFileInput');
                if (fileInput) {
                    fileInput.click();
                }
            });
            
            // Handle keyboard events for accessibility
            chooseMediaButton.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const fileInput = document.getElementById('mediaFileInput');
                    if (fileInput) {
                        fileInput.click();
                    }
                }
            });
        }
        
        // Tablet-optimized touch handling for background media button
        const backgroundMediaButton = document.querySelector('label[for="mediaUpload"]');
        if (backgroundMediaButton) {
            // Handle touch events to eliminate delays
            backgroundMediaButton.addEventListener('touchend', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Trigger the file input immediately
                const fileInput = document.getElementById('mediaUpload');
                if (fileInput) {
                    fileInput.click();
                }
            }, { passive: false });
            
            // Handle click events as fallback
            backgroundMediaButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const fileInput = document.getElementById('mediaUpload');
                if (fileInput) {
                    fileInput.click();
                }
            });
            
            // Handle keyboard events for accessibility
            backgroundMediaButton.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const fileInput = document.getElementById('mediaUpload');
                    if (fileInput) {
                        fileInput.click();
                    }
                }
            });
        }
    }
    
    // Initialize full-window drag and drop
    initializeFullWindowDragDrop();
    
    // Initialize camera functionality (now handled by input mode system)
    updateBackgroundControls();
}

// Full-window drag and drop system for media files
let dragDropState = {
    dragCounter: 0,
    overlay: null,
    isInitialized: false
};

function initializeFullWindowDragDrop() {
    if (dragDropState.isInitialized) return;
    
    // Create drag overlay element
    createDragOverlay();
    
    // Add global drag and drop event listeners
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        document.addEventListener(eventName, handleDragEvent, false);
    });
    
    dragDropState.isInitialized = true;
    console.log('✅ Full-window drag and drop initialized');
}

function createDragOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'mediaDragOverlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: linear-gradient(135deg, 
            rgba(0, 212, 255, 0.1), 
            rgba(0, 150, 255, 0.15), 
            rgba(0, 100, 255, 0.1)
        );
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border: 3px dashed rgba(0, 212, 255, 0.6);
        box-sizing: border-box;
        display: none;
        z-index: 10000;
        pointer-events: none;
        animation: dragPulse 2s ease-in-out infinite;
    `;
    
    // Create inner content
    const content = document.createElement('div');
    content.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        text-align: center;
        color: white;
        font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
        pointer-events: none;
    `;
    
    content.innerHTML = `
        <div style="font-size: 64px; margin-bottom: 20px; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.5));">📁</div>
        <div style="font-size: 28px; font-weight: bold; margin-bottom: 10px; text-shadow: 0 2px 4px rgba(0,0,0,0.5);">Drop Media Files Here</div>
        <div style="font-size: 18px; opacity: 0.9; text-shadow: 0 1px 2px rgba(0,0,0,0.5);">Images (PNG, JPG) or Videos (MP4, WebM, MOV)</div>
    `;
    
    overlay.appendChild(content);
    document.body.appendChild(overlay);
    dragDropState.overlay = overlay;
    
    // Add CSS animation
    if (!document.getElementById('dragDropStyles')) {
        const style = document.createElement('style');
        style.id = 'dragDropStyles';
        style.textContent = `
            @keyframes dragPulse {
                0%, 100% { 
                    border-color: rgba(0, 212, 255, 0.6);
                    background: linear-gradient(135deg, 
                        rgba(0, 212, 255, 0.1), 
                        rgba(0, 150, 255, 0.15), 
                        rgba(0, 100, 255, 0.1)
                    );
                }
                50% { 
                    border-color: rgba(0, 212, 255, 0.9);
                    background: linear-gradient(135deg, 
                        rgba(0, 212, 255, 0.15), 
                        rgba(0, 150, 255, 0.2), 
                        rgba(0, 100, 255, 0.15)
                    );
                }
            }
        `;
        document.head.appendChild(style);
    }
}

function handleDragEvent(e) {
    // Only handle drag events when media mode is active
    if (!mediaState.active) return;
    
    // Prevent default browser behavior
    e.preventDefault();
    e.stopPropagation();
    
    switch (e.type) {
        case 'dragenter':
            handleDragEnter(e);
            break;
        case 'dragover':
            handleDragOver(e);
            break;
        case 'dragleave':
            handleDragLeave(e);
            break;
        case 'drop':
            handleDrop(e);
            break;
    }
}

function handleDragEnter(e) {
    dragDropState.dragCounter++;
    
    // Only show overlay on first drag enter
    if (dragDropState.dragCounter === 1) {
        showDragOverlay();
    }
}

function handleDragOver(e) {
    // Required to allow dropping
    e.dataTransfer.dropEffect = 'copy';
}

function handleDragLeave(e) {
    dragDropState.dragCounter--;
    
    // Only hide overlay when leaving the window completely
    if (dragDropState.dragCounter <= 0) {
        dragDropState.dragCounter = 0;
        hideDragOverlay();
    }
}

function handleDrop(e) {
    dragDropState.dragCounter = 0;
    hideDragOverlay();
    
    const files = Array.from(e.dataTransfer.files);
    
    if (files.length === 0) {
        console.log('🎬 No files dropped');
        return;
    }
    
    // Handle the first file (media mode supports single file)
    const file = files[0];
    console.log('🎬 File dropped:', file.name, file.type);
    
    // Create a fake event object to reuse existing file handling logic
    const fakeEvent = {
        target: {
            files: [file]
        }
    };
    
    handleMediaFileSelection(fakeEvent);
}

function showDragOverlay() {
    if (dragDropState.overlay) {
        dragDropState.overlay.style.display = 'block';
        // Trigger animation by forcing reflow
        dragDropState.overlay.offsetHeight;
        console.log('🎬 Drag overlay shown');
    }
}

function hideDragOverlay() {
    if (dragDropState.overlay) {
        dragDropState.overlay.style.display = 'none';
        console.log('🎬 Drag overlay hidden');
    }
}

// Clean up drag and drop when media mode is deactivated
function cleanupFullWindowDragDrop() {
    dragDropState.dragCounter = 0;
    hideDragOverlay();
}

function handleMediaUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    const isImage = file.type.match(/^image\/(png|jpeg|jpg)$/);
    const isVideo = file.type.match(/^video\/(mp4|webm|mov|quicktime)$/); // Added quicktime for .mov files
    
    console.log(`📁 File selected: ${file.name}, type: ${file.type}, size: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
    
    if (!isImage && !isVideo) {
        alert('Please select a PNG, JPG, JPEG image file or MP4, WebM, MOV video file.');
        return;
    }

    // Validate file size (10MB for images, 50MB for videos)
    const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    const fileType = isVideo ? 'video' : 'image';
    const maxSizeText = isVideo ? '50MB' : '10MB';
    
    if (file.size > maxSize) {
        alert(`${fileType} file is too large. Please select a ${fileType} smaller than ${maxSizeText}.`);
        return;
    }

    if (isVideo) {
        // Handle video file
        const url = URL.createObjectURL(file);
        loadBackgroundVideo(url);
        loadFluidBackgroundVideo(url, file.name);
    } else {
        // Handle image file
        const reader = new FileReader();
        reader.onload = function(e) {
            // Store original data URL for scale changes
            backgroundMedia.originalDataURL = e.target.result;
            loadBackgroundImage(e.target.result);
            loadFluidBackgroundImage(e.target.result, file.name);
        };
        reader.readAsDataURL(file);
    }
}

function loadBackgroundImage(dataURL) {
    const img = new Image();
    img.onload = function() {
        // Create a canvas that matches the WebGL viewport aspect ratio
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { 
            alpha: true, 
            antialias: true,
            premultipliedAlpha: false 
        });
        
        // Get current canvas (WebGL viewport) dimensions
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const viewportAspect = viewportWidth / viewportHeight;
        const imageAspect = img.width / img.height;
        
        // Set canvas size to match viewport aspect ratio with high-DPI support
        const devicePixelRatio = window.devicePixelRatio || 1;
        const maxSize = Math.min(2048, Math.max(viewportWidth, viewportHeight) * devicePixelRatio);
        let canvasWidth, canvasHeight;
        
        if (viewportAspect > 1) {
            canvasWidth = Math.min(maxSize, viewportWidth * devicePixelRatio);
            canvasHeight = canvasWidth / viewportAspect;
        } else {
            canvasHeight = Math.min(maxSize, viewportHeight * devicePixelRatio);
            canvasWidth = canvasHeight * viewportAspect;
        }
        
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        
        // Clear canvas with transparent background
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Enable high-quality image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // Additional quality settings
        if (ctx.webkitImageSmoothingEnabled !== undefined) {
            ctx.webkitImageSmoothingEnabled = true;
        }
        if (ctx.mozImageSmoothingEnabled !== undefined) {
            ctx.mozImageSmoothingEnabled = true;
        }
        
        // Calculate how to fit the image in the canvas without stretching
        let drawWidth, drawHeight, drawX, drawY;
        
        if (imageAspect > viewportAspect) {
            // Image is wider than viewport - fit to width
            drawWidth = canvas.width;
            drawHeight = canvas.width / imageAspect;
            drawX = 0;
            drawY = (canvas.height - drawHeight) / 2;
        } else {
            // Image is taller than viewport - fit to height  
            drawHeight = canvas.height;
            drawWidth = canvas.height * imageAspect;
            drawX = (canvas.width - drawWidth) / 2;
            drawY = 0;
        }
        
        // Allow scaling up to canvas size for better quality, but respect original image size
        const maxScale = Math.min(
            canvas.width / img.width, 
            canvas.height / img.height,
            2.0 // Allow up to 2x upscaling for small images
        );
        const baseScale = Math.min(maxScale, Math.min(drawWidth / img.width, drawHeight / img.height));
        
        // Apply user scale setting (stored in config.BACKGROUND_IMAGE_SCALE) - inverted
        const userScale = config.BACKGROUND_IMAGE_SCALE || 1.0;
        const scale = baseScale / userScale;
        drawWidth = img.width * scale;
        drawHeight = img.height * scale;
        drawX = (canvas.width - drawWidth) / 2;
        drawY = (canvas.height - drawHeight) / 2;
        
        // Flip the image vertically to fix upside-down rendering in WebGL
        ctx.save();
        ctx.scale(1, -1); // Flip vertically
        ctx.translate(0, -canvas.height); // Adjust for flip
        ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
        ctx.restore();
        
        // Create WebGL texture
        createBackgroundTexture(canvas);
        
        // Update UI
        updateImagePreview(dataURL);
        showClearButton(true);
        
        backgroundMedia.canvas = canvas;
        backgroundMedia.width = canvas.width;
        backgroundMedia.height = canvas.height;
        backgroundMedia.loaded = true;
        backgroundMedia.type = 'image';
        backgroundMedia.element = img;
    };
    img.src = dataURL;
}

function loadBackgroundVideo(url) {
    // Clear any existing background
    clearBackgroundMedia();
    
    // Create video element
    const video = document.createElement('video');
    video.src = url;
    video.loop = true; // Auto-loop as required
    video.muted = true; // Muted to allow autoplay
    video.crossOrigin = 'anonymous';
    video.preload = 'auto'; // Changed from 'metadata' to 'auto' to ensure video data is loaded
    video.playsInline = true; // Ensure inline playback on mobile
    
    // Wait for video to be ready with data
    video.oncanplaythrough = function() {
        // Store video element and metadata
        backgroundMedia.element = video;
        backgroundMedia.type = 'video';
        backgroundMedia.width = video.videoWidth;
        backgroundMedia.height = video.videoHeight;
        backgroundMedia.loaded = true;
        
        // Create initial texture for the video
        updateBackgroundVideoTexture();
        
        // Start playing the video
        video.play().then(() => {
            console.log(`📹 Background video playing: ${video.videoWidth}x${video.videoHeight}`);
            
            // Update UI
            updateMediaPreview(url, 'video');
            showClearButton(true);
        }).catch(e => {
            console.warn('Video autoplay failed:', e);
            // Even if autoplay fails, the video is loaded and can be used
            updateMediaPreview(url, 'video');
            showClearButton(true);
        });
    };
    
    video.onloadedmetadata = function() {
        console.log(`📹 Video metadata loaded: ${video.videoWidth}x${video.videoHeight}`);
    };
    
    video.onerror = function(e) {
        console.error('Error loading background video:', e);
        alert('Failed to load video. Please try a different video file or ensure it\'s in a supported format (MP4, WebM, MOV).');
        clearBackgroundMedia();
    };
}

function createBackgroundTexture(canvas) {
    // Delete existing texture if it exists
    if (backgroundMedia.texture) {
        gl.deleteTexture(backgroundMedia.texture);
    }
    
    // Create new texture
    backgroundMedia.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, backgroundMedia.texture);
    
    // Set texture parameters for high quality
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    
    // Upload image data to texture
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    
    // Generate mipmaps for better quality at different scales
    gl.generateMipmap(gl.TEXTURE_2D);
    
    gl.bindTexture(gl.TEXTURE_2D, null);
}

function updateBackgroundVideoTexture() {
    if (!backgroundMedia.loaded || backgroundMedia.type !== 'video' || !backgroundMedia.element) return;
    
    const video = backgroundMedia.element;
    
    // Check if video has data to render
    if (video.readyState < video.HAVE_CURRENT_DATA) return;
    
    // Create texture if it doesn't exist
    if (!backgroundMedia.texture) {
        backgroundMedia.texture = gl.createTexture();
    }
    
    gl.bindTexture(gl.TEXTURE_2D, backgroundMedia.texture);
    
    // Set texture parameters for real-time video
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    
    // Upload video frame to texture
    try {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
            backgroundMedia.width = video.videoWidth;
            backgroundMedia.height = video.videoHeight;
        }
    } catch (e) {
        // Video might not be ready yet or have codec issues
        console.warn('Failed to update background video texture:', e);
    }
    
    // Unbind texture
    gl.bindTexture(gl.TEXTURE_2D, null);
}

// updateCameraTexture function removed - using simple canvas instead

function updateImagePreview(dataURL) {
    updateMediaPreview(dataURL, 'image');
}

function updateMediaPreview(url, type) {
    // Preview removed - no longer showing thumbnails in control panel
    console.log(`📁 Media loaded: ${type} - ${url.substring(0, 50)}...`);
}

function showClearButton(show) {
    const clearButton = document.getElementById('clearImageButton');
    if (clearButton) {
        clearButton.style.display = show ? 'inline-block' : 'none';
    }
    
    // Also show/hide the scale slider
    const scaleControl = document.getElementById('backgroundScaleControl');
    if (scaleControl) {
        scaleControl.style.display = show ? 'block' : 'none';
    }
}

function clearBackgroundImage() {
    clearBackgroundMedia();
}

function clearBackgroundMedia() {
    // Clear WebGL texture
    if (backgroundMedia.texture) {
        gl.deleteTexture(backgroundMedia.texture);
        backgroundMedia.texture = null;
    }
    
    // Clean up video element if it exists
    if (backgroundMedia.type === 'video' && backgroundMedia.element) {
        backgroundMedia.element.pause();
        // Remove event listeners before clearing src to prevent error alerts
        backgroundMedia.element.onerror = null;
        backgroundMedia.element.oncanplaythrough = null;
        backgroundMedia.element.onloadedmetadata = null;
        backgroundMedia.element.src = '';
        backgroundMedia.element = null;
    }
    
    // Reset state
    backgroundMedia.loaded = false;
    backgroundMedia.canvas = null;
    backgroundMedia.width = 0;
    backgroundMedia.height = 0;
    backgroundMedia.originalDataURL = null;
    backgroundMedia.type = null;
    backgroundMedia.element = null;
    
    // Clear UI
    const mediaUpload = document.getElementById('mediaUpload');
    if (mediaUpload) mediaUpload.value = '';
    
    updateBackgroundControls();
}

// Camera feed functionality (old implementation removed - using new input mode system)

// Old startCamera function removed - using new camera system with input modes

// Old stopCamera function removed - using new camera system with input modes

// Simple Camera Implementation - No WebGL complexity!

function clearAllBackground() {
    clearBackgroundMedia();
    // Camera stopping is now handled by input mode system
}

function clearFluidBackgroundMedia() {
    // Clear uploaded media
    if (fluidBackgroundMedia.loaded) {
        // Clean up texture
        if (fluidBackgroundMedia.texture) {
            gl.deleteTexture(fluidBackgroundMedia.texture);
            fluidBackgroundMedia.texture = null;
        }
        
        // Clean up media element
        if (fluidBackgroundMedia.element) {
            if (fluidBackgroundMedia.type === 'video') {
                fluidBackgroundMedia.element.pause();
                fluidBackgroundMedia.element.src = '';
            }
            // Revoke object URL to free memory
            if (fluidBackgroundMedia.element.src && fluidBackgroundMedia.element.src.startsWith('blob:')) {
                URL.revokeObjectURL(fluidBackgroundMedia.element.src);
            }
            fluidBackgroundMedia.element = null;
        }
        
        // Reset state
        fluidBackgroundMedia.loaded = false;
        fluidBackgroundMedia.type = null;
        fluidBackgroundMedia.width = 0;
        fluidBackgroundMedia.height = 0;
        fluidBackgroundMedia.scale = 1.0;
        
        // Hide media controls and reset file input
        const mediaScaleControl = document.getElementById('fluidMediaScaleControl');
        const mediaUpload = document.getElementById('mediaUpload');
        if (mediaScaleControl) mediaScaleControl.style.display = 'none';
        if (mediaUpload) mediaUpload.value = '';
        
        console.log('🗑️ Fluid background media cleared');
    }
    
    // Clear camera feed
    if (fluidBackgroundCamera.active) {
        stopFluidBackgroundCamera();
        const button = document.getElementById('fluidCameraButton');
        if (button) {
            button.textContent = '📷 Camera';
            button.classList.remove('active');
        }
    }
    
    // Hide old clear button if nothing is active (legacy support)
    if (!fluidBackgroundMedia.loaded && !fluidBackgroundCamera.active) {
        const clearButton = document.getElementById('clearFluidBackgroundButton');
        if (clearButton) clearButton.style.display = 'none';
    }
}

function clearFluidBackgroundMediaOnly() {
    // Clear only uploaded media, not camera
    if (fluidBackgroundMedia.loaded) {
        // Clean up texture
        if (fluidBackgroundMedia.texture) {
            gl.deleteTexture(fluidBackgroundMedia.texture);
            fluidBackgroundMedia.texture = null;
        }
        
        // Clean up media element
        if (fluidBackgroundMedia.element) {
            if (fluidBackgroundMedia.type === 'video') {
                fluidBackgroundMedia.element.pause();
                fluidBackgroundMedia.element.src = '';
            }
            // Revoke object URL to free memory
            if (fluidBackgroundMedia.element.src && fluidBackgroundMedia.element.src.startsWith('blob:')) {
                URL.revokeObjectURL(fluidBackgroundMedia.element.src);
            }
            fluidBackgroundMedia.element = null;
        }
        
        // Reset media state
        fluidBackgroundMedia.loaded = false;
        fluidBackgroundMedia.type = null;
        fluidBackgroundMedia.width = 0;
        fluidBackgroundMedia.height = 0;
        fluidBackgroundMedia.scale = 1.0;
        
        // Hide media controls and reset file input
        const mediaScaleControl = document.getElementById('fluidMediaScaleControl');
        const clearMediaButton = document.getElementById('clearFluidMediaButton');
        const mediaUpload = document.getElementById('mediaUpload');
        if (mediaScaleControl) mediaScaleControl.style.display = 'none';
        if (clearMediaButton) clearMediaButton.style.display = 'none';
        if (mediaUpload) mediaUpload.value = '';
        
        console.log('🗑️ Fluid background media cleared (camera remains active)');
    }
}

function loadFluidBackgroundFile(file) {
    const url = URL.createObjectURL(file);
    
    if (file.type.startsWith('image/')) {
        loadFluidBackgroundImage(url, file.name);
    } else if (file.type.startsWith('video/')) {
        loadFluidBackgroundVideo(url, file.name);
    }
}

function loadFluidBackgroundImage(dataURL, filename) {
    const img = new Image();
    img.onload = function() {
        // Store the image element
        fluidBackgroundMedia.element = img;
        fluidBackgroundMedia.type = 'image';
        fluidBackgroundMedia.width = img.width;
        fluidBackgroundMedia.height = img.height;
        fluidBackgroundMedia.loaded = true;
        fluidBackgroundMedia.scale = config.FLUID_MEDIA_SCALE || 1.0; // Initialize from config
        
        // Show controls
        const clearMediaButton = document.getElementById('clearFluidMediaButton');
        const mediaScaleControl = document.getElementById('fluidMediaScaleControl');
        if (clearMediaButton) clearMediaButton.style.display = 'inline-block';
        if (mediaScaleControl) mediaScaleControl.style.display = 'block';
        
        console.log(`🖼️ Fluid background image loaded: ${filename} (${img.width}x${img.height})`);
    };
    img.onerror = function() {
        console.error('Failed to load fluid background image');
    };
    img.src = dataURL;
}

function loadFluidBackgroundVideo(url, filename) {
    const video = document.createElement('video');
    video.onloadedmetadata = function() {
        // Store the video element
        fluidBackgroundMedia.element = video;
        fluidBackgroundMedia.type = 'video';
        fluidBackgroundMedia.width = video.videoWidth;
        fluidBackgroundMedia.height = video.videoHeight;
        fluidBackgroundMedia.loaded = true;
        fluidBackgroundMedia.scale = config.FLUID_MEDIA_SCALE || 1.0; // Initialize from config
        
        // Configure video
        video.muted = true;
        video.loop = true;
        video.play();
        
        // Show controls
        const clearMediaButton = document.getElementById('clearFluidMediaButton');
        const mediaScaleControl = document.getElementById('fluidMediaScaleControl');
        if (clearMediaButton) clearMediaButton.style.display = 'inline-block';
        if (mediaScaleControl) mediaScaleControl.style.display = 'block';
        
        console.log(`🎥 Fluid background video loaded: ${filename} (${video.videoWidth}x${video.videoHeight})`);
    };
    video.onerror = function() {
        console.error('Failed to load fluid background video');
    };
    video.src = url;
}

function updateBackgroundControls() {
    const clearButton = document.getElementById('clearBackgroundButton');
    const scaleControl = document.getElementById('backgroundScaleControl');
    
    const hasBackground = backgroundMedia.loaded || cameraState.active;
    
    if (clearButton) {
        clearButton.style.display = hasBackground ? 'inline-block' : 'none';
    }
    
    // Show scale control for both images and videos, not camera
    if (scaleControl) {
        const showScale = backgroundMedia.loaded && (backgroundMedia.type === 'image' || backgroundMedia.type === 'video') && !cameraState.active;
        scaleControl.style.display = showScale ? 'block' : 'none';
    }
}

function showClearButton(show) {
    // Legacy function - now handled by updateBackgroundControls
    updateBackgroundControls();
}

function framebufferToTexture (target) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    let length = target.width * target.height * 4;
    let texture = new Float32Array(length);
    gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.FLOAT, texture);
    return texture;
}

function normalizeTexture (texture, width, height) {
    let result = new Uint8Array(texture.length);
    let id = 0;
    for (let i = height - 1; i >= 0; i--) {
        for (let j = 0; j < width; j++) {
            let nid = i * width * 4 + j * 4;
            result[nid + 0] = clamp01(texture[id + 0]) * 255;
            result[nid + 1] = clamp01(texture[id + 1]) * 255;
            result[nid + 2] = clamp01(texture[id + 2]) * 255;
            result[nid + 3] = clamp01(texture[id + 3]) * 255;
            id += 4;
        }
    }
    return result;
}

function clamp01 (input) {
    return Math.min(Math.max(input, 0), 1);
}

function textureToCanvas (texture, width, height) {
    let captureCanvas = document.createElement('canvas');
    let ctx = captureCanvas.getContext('2d');
    captureCanvas.width = width;
    captureCanvas.height = height;

    let imageData = ctx.createImageData(width, height);
    imageData.data.set(texture);
    ctx.putImageData(imageData, 0, 0);

    return captureCanvas;
}

function downloadURI (filename, uri) {
    let link = document.createElement('a');
    link.download = filename;
    link.href = uri;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

class Material {
    constructor (vertexShader, fragmentShaderSource) {
        this.vertexShader = vertexShader;
        this.fragmentShaderSource = fragmentShaderSource;
        this.programs = [];
        this.activeProgram = null;
        this.uniforms = [];
    }

    setKeywords (keywords) {
        let hash = 0;
        for (let i = 0; i < keywords.length; i++)
            hash += hashCode(keywords[i]);

        let program = this.programs[hash];
        if (program == null)
        {
            let fragmentShader = compileShader(gl.FRAGMENT_SHADER, this.fragmentShaderSource, keywords);
            program = createProgram(this.vertexShader, fragmentShader);
            this.programs[hash] = program;
        }

        if (program == this.activeProgram) return;

        this.uniforms = getUniforms(program);
        this.activeProgram = program;
    }

    bind () {
        gl.useProgram(this.activeProgram);
    }
}

class Program {
    constructor (vertexShader, fragmentShader) {
        this.uniforms = {};
        this.program = createProgram(vertexShader, fragmentShader);
        this.uniforms = getUniforms(this.program);
    }

    bind () {
        gl.useProgram(this.program);
    }
}

function createProgram (vertexShader, fragmentShader) {
    let program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        console.trace(gl.getProgramInfoLog(program));

    return program;
}

function getUniforms (program) {
    let uniforms = [];
    let uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < uniformCount; i++) {
        let uniformName = gl.getActiveUniform(program, i).name;
        uniforms[uniformName] = gl.getUniformLocation(program, uniformName);
    }
    return uniforms;
}

function compileShader (type, source, keywords) {
    source = addKeywords(source, keywords);

    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        console.trace(gl.getShaderInfoLog(shader));

    return shader;
};

function addKeywords (source, keywords) {
    if (keywords == null) return source;
    let keywordsString = '';
    keywords.forEach(keyword => {
        keywordsString += '#define ' + keyword + '\n';
    });
    return keywordsString + source;
}

const baseVertexShader = compileShader(gl.VERTEX_SHADER, `
    precision highp float;

    attribute vec2 aPosition;
    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform vec2 texelSize;

    void main () {
        vUv = aPosition * 0.5 + 0.5;
        vL = vUv - vec2(texelSize.x, 0.0);
        vR = vUv + vec2(texelSize.x, 0.0);
        vT = vUv + vec2(0.0, texelSize.y);
        vB = vUv - vec2(0.0, texelSize.y);
        gl_Position = vec4(aPosition, 0.0, 1.0);
    }
`);

const blurVertexShader = compileShader(gl.VERTEX_SHADER, `
    precision highp float;

    attribute vec2 aPosition;
    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    uniform vec2 texelSize;

    void main () {
        vUv = aPosition * 0.5 + 0.5;
        float offset = 1.33333333;
        vL = vUv - texelSize * offset;
        vR = vUv + texelSize * offset;
        gl_Position = vec4(aPosition, 0.0, 1.0);
    }
`);

const blurShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;

    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    uniform sampler2D uTexture;

    void main () {
        vec4 sum = texture2D(uTexture, vUv) * 0.29411764;
        sum += texture2D(uTexture, vL) * 0.35294117;
        sum += texture2D(uTexture, vR) * 0.35294117;
        gl_FragColor = sum;
    }
`);

const copyShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    uniform sampler2D uTexture;

    void main () {
        gl_FragColor = texture2D(uTexture, vUv);
    }
`);

const clearShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    uniform sampler2D uTexture;
    uniform float value;

    void main () {
        gl_FragColor = value * texture2D(uTexture, vUv);
    }
`);

const colorShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;

    uniform vec4 color;

    void main () {
        gl_FragColor = color;
    }
`);

const simpleTextureShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTexture;

    void main () {
        gl_FragColor = texture2D(uTexture, vUv);
    }
`);

const cameraShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform float uCanvasAspect;
    uniform float uVideoAspect;

    void main () {
        // Flip Y coordinate for camera feed
        vec2 flippedUv = vec2(vUv.x, 1.0 - vUv.y);
        
        // Calculate aspect ratio correction for "cover" behavior
        vec2 scale = vec2(1.0);
        vec2 offset = vec2(0.0);
        
        if (uCanvasAspect > uVideoAspect) {
            // Canvas is wider than video - scale video to fit width, crop height
            scale.y = uCanvasAspect / uVideoAspect;
            offset.y = (1.0 - scale.y) * 0.5;
        } else {
            // Canvas is taller than video - scale video to fit height, crop width  
            scale.x = uVideoAspect / uCanvasAspect;
            offset.x = (1.0 - scale.x) * 0.5;
        }
        
        // Apply scaling and centering
        vec2 correctedUv = (flippedUv - offset) / scale;
        
        // Clamp to prevent sampling outside texture bounds
        correctedUv = clamp(correctedUv, 0.0, 1.0);
        
        gl_FragColor = texture2D(uTexture, correctedUv);
    }
`);

const backgroundVideoShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform float uCanvasAspect;
    uniform float uVideoAspect;
    uniform float uScale;

    void main () {
        vec2 uv = vUv;
        
        // Flip vertically
        uv.y = 1.0 - uv.y;
        
        // Simple aspect ratio correction
        float canvasAspect = uCanvasAspect;
        float mediaAspect = uVideoAspect;
        
        if (canvasAspect > mediaAspect) {
            // Canvas wider than media - fit width, crop height
            uv.y = (uv.y - 0.5) * (mediaAspect / canvasAspect) + 0.5;
        } else {
            // Canvas taller than media - fit height, crop width
            uv.x = (uv.x - 0.5) * (canvasAspect / mediaAspect) + 0.5;
        }
        
        // Apply user scale
        uv = (uv - 0.5) / uScale + 0.5;
        
        // Sample texture
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        } else {
            gl_FragColor = texture2D(uTexture, uv);
        }
    }
`);

const checkerboardShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform float aspectRatio;

    #define SCALE 25.0

    void main () {
        vec2 uv = floor(vUv * SCALE * vec2(aspectRatio, 1.0));
        float v = mod(uv.x + uv.y, 2.0);
        v = v * 0.1 + 0.8;
        gl_FragColor = vec4(vec3(v), 1.0);
    }
`);

const displayShaderSource = `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uTexture;
    uniform sampler2D uBloom;
    uniform sampler2D uSunrays;
    uniform sampler2D uDithering;
    uniform vec2 ditherScale;
    uniform vec2 texelSize;

    vec3 linearToGamma (vec3 color) {
        color = max(color, vec3(0));
        return max(1.055 * pow(color, vec3(0.416666667)) - 0.055, vec3(0));
    }

    void main () {
        vec3 c = texture2D(uTexture, vUv).rgb;

    #ifdef SHADING
        vec3 lc = texture2D(uTexture, vL).rgb;
        vec3 rc = texture2D(uTexture, vR).rgb;
        vec3 tc = texture2D(uTexture, vT).rgb;
        vec3 bc = texture2D(uTexture, vB).rgb;

        float dx = length(rc) - length(lc);
        float dy = length(tc) - length(bc);

        vec3 n = normalize(vec3(dx, dy, length(texelSize)));
        vec3 l = vec3(0.0, 0.0, 1.0);

        float diffuse = clamp(dot(n, l) + 0.7, 0.7, 1.0);
        c *= diffuse;
    #endif

    #ifdef BLOOM
        vec3 bloom = texture2D(uBloom, vUv).rgb;
    #endif

    #ifdef SUNRAYS
        float sunrays = texture2D(uSunrays, vUv).r;
        c *= sunrays;
    #ifdef BLOOM
        bloom *= sunrays;
    #endif
    #endif

    #ifdef BLOOM
        float noise = texture2D(uDithering, vUv * ditherScale).r;
        noise = noise * 2.0 - 1.0;
        bloom += noise / 255.0;
        bloom = linearToGamma(bloom);
        c += bloom;
    #endif

        float a = max(c.r, max(c.g, c.b));
        gl_FragColor = vec4(c, a);
    }
`;

const bloomPrefilterShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform vec3 curve;
    uniform float threshold;

    void main () {
        vec3 c = texture2D(uTexture, vUv).rgb;
        float br = max(c.r, max(c.g, c.b));
        float rq = clamp(br - curve.x, 0.0, curve.y);
        rq = curve.z * rq * rq;
        c *= max(rq, br - threshold) / max(br, 0.0001);
        gl_FragColor = vec4(c, 0.0);
    }
`);

const bloomBlurShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;

    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uTexture;

    void main () {
        vec4 sum = vec4(0.0);
        sum += texture2D(uTexture, vL);
        sum += texture2D(uTexture, vR);
        sum += texture2D(uTexture, vT);
        sum += texture2D(uTexture, vB);
        sum *= 0.25;
        gl_FragColor = sum;
    }
`);

const bloomFinalShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;

    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uTexture;
    uniform float intensity;

    void main () {
        vec4 sum = vec4(0.0);
        sum += texture2D(uTexture, vL);
        sum += texture2D(uTexture, vR);
        sum += texture2D(uTexture, vT);
        sum += texture2D(uTexture, vB);
        sum *= 0.25;
        gl_FragColor = sum * intensity;
    }
`);

const sunraysMaskShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTexture;

    void main () {
        vec4 c = texture2D(uTexture, vUv);
        float br = max(c.r, max(c.g, c.b));
        c.a = 1.0 - min(max(br * 20.0, 0.0), 0.8);
        gl_FragColor = c;
    }
`);

const sunraysShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform float weight;

    #define ITERATIONS 16

    void main () {
        float Density = 0.3;
        float Decay = 0.95;
        float Exposure = 0.7;

        vec2 coord = vUv;
        vec2 dir = vUv - 0.5;

        dir *= 1.0 / float(ITERATIONS) * Density;
        float illuminationDecay = 1.0;

        float color = texture2D(uTexture, vUv).a;

        for (int i = 0; i < ITERATIONS; i++)
        {
            coord -= dir;
            float col = texture2D(uTexture, coord).a;
            color += col * illuminationDecay * weight;
            illuminationDecay *= Decay;
        }

        gl_FragColor = vec4(color * Exposure, 0.0, 0.0, 1.0);
    }
`);

const splatShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTarget;
    uniform float aspectRatio;
    uniform vec3 color;
    uniform vec2 point;
    uniform float radius;

    void main () {
        vec2 p = vUv - point.xy;
        p.x *= aspectRatio;
        vec3 splat = exp(-dot(p, p) / radius) * color;
        vec3 base = texture2D(uTarget, vUv).xyz;
        gl_FragColor = vec4(base + splat, 1.0);
    }
`);

const advectionShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uVelocity;
    uniform sampler2D uSource;
    uniform vec2 texelSize;
    uniform vec2 dyeTexelSize;
    uniform float dt;
    uniform float dissipation;

    vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
        vec2 st = uv / tsize - 0.5;

        vec2 iuv = floor(st);
        vec2 fuv = fract(st);

        vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
        vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
        vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
        vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);

        return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
    }

    void main () {
    #ifdef MANUAL_FILTERING
        vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
        vec4 result = bilerp(uSource, coord, dyeTexelSize);
    #else
        vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
        vec4 result = texture2D(uSource, coord);
    #endif
        float decay = 1.0 + dissipation * dt;
        gl_FragColor = result / decay;
    }`,
    ext.supportLinearFiltering ? null : ['MANUAL_FILTERING']
);

const divergenceShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uVelocity;

    void main () {
        float L = texture2D(uVelocity, vL).x;
        float R = texture2D(uVelocity, vR).x;
        float T = texture2D(uVelocity, vT).y;
        float B = texture2D(uVelocity, vB).y;

        vec2 C = texture2D(uVelocity, vUv).xy;
        if (vL.x < 0.0) { L = -C.x; }
        if (vR.x > 1.0) { R = -C.x; }
        if (vT.y > 1.0) { T = -C.y; }
        if (vB.y < 0.0) { B = -C.y; }

        float div = 0.5 * (R - L + T - B);
        gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
    }
`);

const curlShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uVelocity;

    void main () {
        float L = texture2D(uVelocity, vL).y;
        float R = texture2D(uVelocity, vR).y;
        float T = texture2D(uVelocity, vT).x;
        float B = texture2D(uVelocity, vB).x;
        float vorticity = R - L - T + B;
        gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
    }
`);

const vorticityShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uVelocity;
    uniform sampler2D uCurl;
    uniform float curl;
    uniform float dt;

    void main () {
        float L = texture2D(uCurl, vL).x;
        float R = texture2D(uCurl, vR).x;
        float T = texture2D(uCurl, vT).x;
        float B = texture2D(uCurl, vB).x;
        float C = texture2D(uCurl, vUv).x;

        vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
        force /= length(force) + 0.0001;
        force *= curl * C;
        force.y *= -1.0;

        vec2 velocity = texture2D(uVelocity, vUv).xy;
        velocity += force * dt;
        velocity = min(max(velocity, -1000.0), 1000.0);
        gl_FragColor = vec4(velocity, 0.0, 1.0);
    }
`);

const pressureShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uPressure;
    uniform sampler2D uDivergence;

    void main () {
        float L = texture2D(uPressure, vL).x;
        float R = texture2D(uPressure, vR).x;
        float T = texture2D(uPressure, vT).x;
        float B = texture2D(uPressure, vB).x;
        float C = texture2D(uPressure, vUv).x;
        float divergence = texture2D(uDivergence, vUv).x;
        float pressure = (L + R + B + T - divergence) * 0.25;
        gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
    }
`);

const gradientSubtractShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uPressure;
    uniform sampler2D uVelocity;

    void main () {
        float L = texture2D(uPressure, vL).x;
        float R = texture2D(uPressure, vR).x;
        float T = texture2D(uPressure, vT).x;
        float B = texture2D(uPressure, vB).x;
        vec2 velocity = texture2D(uVelocity, vUv).xy;
        velocity.xy -= vec2(R - L, T - B);
        gl_FragColor = vec4(velocity, 0.0, 1.0);
    }
`);

const blit = (() => {
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    return (target, clear = false) => {
        if (target == null)
        {
            gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
        else
        {
            gl.viewport(0, 0, target.width, target.height);
            gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
        }
        if (clear)
        {
            gl.clearColor(0.0, 0.0, 0.0, 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }
        // CHECK_FRAMEBUFFER_STATUS();
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }
})();

function CHECK_FRAMEBUFFER_STATUS () {
    let status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status != gl.FRAMEBUFFER_COMPLETE)
        console.trace("Framebuffer error: " + status);
}

let dye;
let velocity;
let divergence;
let curl;
let pressure;
let bloom;
let bloomFramebuffers = [];
let sunrays;
let sunraysTemp;

// Create a simple noise texture for dithering instead of loading external file
let ditheringTexture = createNoiseTexture();

const blurProgram            = new Program(blurVertexShader, blurShader);
const copyProgram            = new Program(baseVertexShader, copyShader);
const clearProgram           = new Program(baseVertexShader, clearShader);
const colorProgram           = new Program(baseVertexShader, colorShader);
const simpleTextureProgram   = new Program(baseVertexShader, simpleTextureShader);
const cameraProgram          = new Program(baseVertexShader, cameraShader);
const backgroundVideoProgram = new Program(baseVertexShader, backgroundVideoShader);
const checkerboardProgram    = new Program(baseVertexShader, checkerboardShader);
const bloomPrefilterProgram  = new Program(baseVertexShader, bloomPrefilterShader);
const bloomBlurProgram       = new Program(baseVertexShader, bloomBlurShader);
const bloomFinalProgram      = new Program(baseVertexShader, bloomFinalShader);
const sunraysMaskProgram     = new Program(baseVertexShader, sunraysMaskShader);
const sunraysProgram         = new Program(baseVertexShader, sunraysShader);
const splatProgram           = new Program(baseVertexShader, splatShader);
const advectionProgram       = new Program(baseVertexShader, advectionShader);
const divergenceProgram      = new Program(baseVertexShader, divergenceShader);
const curlProgram            = new Program(baseVertexShader, curlShader);
const vorticityProgram       = new Program(baseVertexShader, vorticityShader);
const pressureProgram        = new Program(baseVertexShader, pressureShader);
const gradienSubtractProgram = new Program(baseVertexShader, gradientSubtractShader);

const displayMaterial = new Material(baseVertexShader, displayShaderSource);

function initFramebuffers () {
    let simRes = getResolution(config.SIM_RESOLUTION);
    let dyeRes = getResolution(config.DYE_RESOLUTION);

    const texType = ext.halfFloatTexType;
    const rgba    = ext.formatRGBA;
    const rg      = ext.formatRG;
    const r       = ext.formatR;
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

    gl.disable(gl.BLEND);

    if (dye == null)
        dye = createDoubleFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
    else
        dye = resizeDoubleFBO(dye, dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);

    if (velocity == null)
        velocity = createDoubleFBO(simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);
    else
        velocity = resizeDoubleFBO(velocity, simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);

    divergence = createFBO      (simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    curl       = createFBO      (simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    pressure   = createDoubleFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);

    initBloomFramebuffers();
    initSunraysFramebuffers();
}

function initBloomFramebuffers () {
    let res = getResolution(config.BLOOM_RESOLUTION);

    const texType = ext.halfFloatTexType;
    const rgba = ext.formatRGBA;
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

    bloom = createFBO(res.width, res.height, rgba.internalFormat, rgba.format, texType, filtering);

    bloomFramebuffers.length = 0;
    for (let i = 0; i < config.BLOOM_ITERATIONS; i++)
    {
        let width = res.width >> (i + 1);
        let height = res.height >> (i + 1);

        if (width < 2 || height < 2) break;

        let fbo = createFBO(width, height, rgba.internalFormat, rgba.format, texType, filtering);
        bloomFramebuffers.push(fbo);
    }
}

function initSunraysFramebuffers () {
    let res = getResolution(config.SUNRAYS_RESOLUTION);

    const texType = ext.halfFloatTexType;
    const r = ext.formatR;
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

    sunrays     = createFBO(res.width, res.height, r.internalFormat, r.format, texType, filtering);
    sunraysTemp = createFBO(res.width, res.height, r.internalFormat, r.format, texType, filtering);
}

function createFBO (w, h, internalFormat, format, type, param) {
    gl.activeTexture(gl.TEXTURE0);
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

    let fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);

    let texelSizeX = 1.0 / w;
    let texelSizeY = 1.0 / h;

    return {
        texture,
        fbo,
        width: w,
        height: h,
        texelSizeX,
        texelSizeY,
        attach (id) {
            gl.activeTexture(gl.TEXTURE0 + id);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            return id;
        }
    };
}

function createDoubleFBO (w, h, internalFormat, format, type, param) {
    let fbo1 = createFBO(w, h, internalFormat, format, type, param);
    let fbo2 = createFBO(w, h, internalFormat, format, type, param);

    return {
        width: w,
        height: h,
        texelSizeX: fbo1.texelSizeX,
        texelSizeY: fbo1.texelSizeY,
        get read () {
            return fbo1;
        },
        set read (value) {
            fbo1 = value;
        },
        get write () {
            return fbo2;
        },
        set write (value) {
            fbo2 = value;
        },
        swap () {
            let temp = fbo1;
            fbo1 = fbo2;
            fbo2 = temp;
        }
    }
}

function resizeFBO (target, w, h, internalFormat, format, type, param) {
    let newFBO = createFBO(w, h, internalFormat, format, type, param);
    copyProgram.bind();
    gl.uniform1i(copyProgram.uniforms.uTexture, target.attach(0));
    blit(newFBO);
    return newFBO;
}

function resizeDoubleFBO (target, w, h, internalFormat, format, type, param) {
    if (target.width == w && target.height == h)
        return target;
    target.read = resizeFBO(target.read, w, h, internalFormat, format, type, param);
    target.write = createFBO(w, h, internalFormat, format, type, param);
    target.width = w;
    target.height = h;
    target.texelSizeX = 1.0 / w;
    target.texelSizeY = 1.0 / h;
    return target;
}

function createTextureAsync (url) {
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255]));

    let obj = {
        texture,
        width: 1,
        height: 1,
        attach (id) {
            gl.activeTexture(gl.TEXTURE0 + id);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            return id;
        }
    };

    let image = new Image();
    image.onload = () => {
        obj.width = image.width;
        obj.height = image.height;
        gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
    };
    image.src = url;

    return obj;
}

function createNoiseTexture() {
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    
    // Create a 256x256 noise texture for dithering (ultra fine)
    const size = 256;
    const data = new Uint8Array(size * size * 3);
    
    for (let i = 0; i < data.length; i += 3) {
        // Generate subtle noise pattern (reduced contrast for less visibility)
        const noise = 128 + (Math.random() - 0.5) * 64; // Range: 96-160 instead of 0-255
        data[i] = noise;     // R
        data[i + 1] = noise; // G
        data[i + 2] = noise; // B
    }
    
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, size, size, 0, gl.RGB, gl.UNSIGNED_BYTE, data);
    
    return {
        texture,
        width: size,
        height: size,
        attach (id) {
            gl.activeTexture(gl.TEXTURE0 + id);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            return id;
        }
    };
}

function updateKeywords () {
    let displayKeywords = [];
    if (config.SHADING) displayKeywords.push("SHADING");
    if (config.BLOOM) displayKeywords.push("BLOOM");
    if (config.SUNRAYS) displayKeywords.push("SUNRAYS");
    displayMaterial.setKeywords(displayKeywords);
}

updateKeywords();
initFramebuffers();
multipleSplats(parseInt(Math.random() * 20) + 5);

let lastUpdateTime = Date.now();
let colorUpdateTimer = 0.0;
let previousColorfulState = config.COLORFUL;
let isFluidVisible = true; // Track fluid visibility for performance optimization
let performanceStats = { skippedFrames: 0, renderedFrames: 0 }; // Performance monitoring
update();

function update () {
    // Skip all fluid operations when not visible for performance
    if (!isFluidVisible) {
        performanceStats.skippedFrames++;
        requestAnimationFrame(update);
        return;
    }
    
    performanceStats.renderedFrames++;
    
    const dt = calcDeltaTime();
    
    // Mobile performance optimization
    if (isMobile()) {
        // Throttle updates on mobile for better performance
        if (dt < 0.016) { // Cap at 60fps
            requestAnimationFrame(update);
            return;
        }
    }
    
    if (resizeCanvas())
        initFramebuffers();
    updateColors(dt);
    applyInputs();
    if (!config.PAUSED)
        step(dt);
    render(null);
    requestAnimationFrame(update);
}

function calcDeltaTime () {
    let now = Date.now();
    let dt = (now - lastUpdateTime) / 1000;
    dt = Math.min(dt, 0.016666);
    lastUpdateTime = now;
    return dt;
}

function resizeCanvas () {
    // Get actual viewport dimensions
    let width, height;
    
    if (isMobile()) {
        // On mobile, use viewport dimensions directly
        width = window.innerWidth;
        height = window.innerHeight;
        
        // Account for landscape mode with control panel
        if (window.innerWidth > window.innerHeight && window.innerWidth <= 768) {
            // Landscape mode - subtract control panel width (320px) + right padding (20px) + left margin (20px)
            width = window.innerWidth - 360;
        }
        
        // Scale by pixel ratio but limit for performance
        width = scaleByPixelRatio(width);
        height = scaleByPixelRatio(height);
        
        // Limit canvas resolution on mobile for better performance
        const maxMobileSize = 1024;
        if (width > maxMobileSize) {
            const ratio = height / width;
            width = maxMobileSize;
            height = maxMobileSize * ratio;
        }
        if (height > maxMobileSize) {
            const ratio = width / height;
            height = maxMobileSize;
            width = maxMobileSize * ratio;
        }
    } else {
        // Desktop - use client dimensions
        width = scaleByPixelRatio(canvas.clientWidth);
        height = scaleByPixelRatio(canvas.clientHeight);
    }
    
    if (canvas.width != width || canvas.height != height) {
        canvas.width = width;
        canvas.height = height;
        return true;
    }
    return false;
}

function updateColors (dt) {
    // Check if colorful mode state has changed
    if (previousColorfulState !== config.COLORFUL) {
        // Colorful mode state changed - update all pointer colors immediately
        pointers.forEach(p => {
            p.color = generateColor();
        });
        
        if (window.oscPointers) {
            Object.values(window.oscPointers).forEach(p => {
                p.color = generateColor();
                if (config.DEBUG_MODE) {
                    console.log(`🎨 OSC Color Updated (mode changed):`, p.color);
                }
            });
        }
        
        previousColorfulState = config.COLORFUL;
        
        if (config.DEBUG_MODE) {
            console.log(`🎨 Colorful mode changed to: ${config.COLORFUL}`);
        }
    }
    
    if (!config.COLORFUL) return;

    colorUpdateTimer += dt * config.COLOR_UPDATE_SPEED;
    if (colorUpdateTimer >= 1) {
        colorUpdateTimer = wrap(colorUpdateTimer, 0, 1);
        pointers.forEach(p => {
            p.color = generateColor();
        });
        
        // Update OSC pointer colors when colorful mode is enabled
        if (window.oscPointers) {
            Object.values(window.oscPointers).forEach(p => {
                p.color = generateColor();
                if (config.DEBUG_MODE) {
                    console.log(`🎨 OSC Color Updated:`, p.color);
                }
            });
        }
    }
}

function applyInputs () {
    if (splatStack.length > 0)
        multipleSplats(splatStack.pop());

    pointers.forEach(p => {
        if (p.moved) {
            p.moved = false;
            splatPointer(p);
        }
    });
}

function step (dt) {
    gl.disable(gl.BLEND);

    curlProgram.bind();
    gl.uniform2f(curlProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.attach(0));
    blit(curl);

    vorticityProgram.bind();
    gl.uniform2f(vorticityProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(vorticityProgram.uniforms.uCurl, curl.attach(1));
    gl.uniform1f(vorticityProgram.uniforms.curl, config.CURL);
    gl.uniform1f(vorticityProgram.uniforms.dt, dt);
    blit(velocity.write);
    velocity.swap();

    divergenceProgram.bind();
    gl.uniform2f(divergenceProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.attach(0));
    blit(divergence);

    clearProgram.bind();
    gl.uniform1i(clearProgram.uniforms.uTexture, pressure.read.attach(0));
    gl.uniform1f(clearProgram.uniforms.value, config.PRESSURE);
    blit(pressure.write);
    pressure.swap();

    pressureProgram.bind();
    gl.uniform2f(pressureProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(pressureProgram.uniforms.uDivergence, divergence.attach(0));
    for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
        gl.uniform1i(pressureProgram.uniforms.uPressure, pressure.read.attach(1));
        blit(pressure.write);
        pressure.swap();
    }

    gradienSubtractProgram.bind();
    gl.uniform2f(gradienSubtractProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(gradienSubtractProgram.uniforms.uPressure, pressure.read.attach(0));
    gl.uniform1i(gradienSubtractProgram.uniforms.uVelocity, velocity.read.attach(1));
    blit(velocity.write);
    velocity.swap();

    advectionProgram.bind();
    gl.uniform2f(advectionProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    if (!ext.supportLinearFiltering)
        gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, velocity.texelSizeX, velocity.texelSizeY);
    let velocityId = velocity.read.attach(0);
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocityId);
    gl.uniform1i(advectionProgram.uniforms.uSource, velocityId);
    gl.uniform1f(advectionProgram.uniforms.dt, dt);
    gl.uniform1f(advectionProgram.uniforms.dissipation, config.VELOCITY_DISSIPATION);
    blit(velocity.write);
    velocity.swap();

    if (!ext.supportLinearFiltering)
        gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, dye.texelSizeX, dye.texelSizeY);
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(advectionProgram.uniforms.uSource, dye.read.attach(1));
    gl.uniform1f(advectionProgram.uniforms.dissipation, config.DENSITY_DISSIPATION);
    blit(dye.write);
    dye.swap();
}

function render (target) {
    if (config.BLOOM)
        applyBloom(dye.read, bloom);
    if (config.SUNRAYS) {
        applySunrays(dye.read, dye.write, sunrays);
        blur(sunrays, sunraysTemp, 1);
    }

    if (target == null || !config.TRANSPARENT) {
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.enable(gl.BLEND);
    }
    else {
        gl.disable(gl.BLEND);
    }

    if (!config.TRANSPARENT)
        drawColor(target, config.BACK_COLOR);
    if (target == null && config.TRANSPARENT)
        drawCheckerboard(target);
    
    // Draw fluid background camera if active (bottom layer)
    if (fluidBackgroundCamera.active && fluidBackgroundCamera.video) {
        drawFluidBackgroundCamera(target);
    }
    
    // Draw fluid background media if loaded (top layer)
    if (fluidBackgroundMedia.loaded && fluidBackgroundMedia.element) {
        drawFluidBackgroundMedia(target);
    }
    
    // Draw background media if loaded
    if (backgroundMedia.loaded && backgroundMedia.texture) {
        // Update video texture if it's a video
        if (backgroundMedia.type === 'video') {
            updateBackgroundVideoTexture();
        }
        drawBackgroundMedia(target);
    } else if (backgroundMedia.loaded && !backgroundMedia.texture) {
        // Debug: Media loaded but no texture
        console.warn('Background media loaded but texture missing:', backgroundMedia.type);
    }
    
    drawDisplay(target);
}

function drawColor (target, color) {
    colorProgram.bind();
    gl.uniform4f(colorProgram.uniforms.color, color.r, color.g, color.b, 1);
    blit(target);
}

function drawBackgroundImage (target) {
    drawBackgroundMedia(target);
}

function drawBackgroundMedia (target) {
    // Enable blending for the background media with premultiplied alpha
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    
    // Bind the background media texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, backgroundMedia.texture);
    
    if (backgroundMedia.type === 'video') {
        // Use background video program for videos with scaling support
        backgroundVideoProgram.bind();
        gl.uniform1i(backgroundVideoProgram.uniforms.uTexture, 0);
        
        // Calculate aspect ratios for proper video scaling
        const canvasWidth = target == null ? gl.drawingBufferWidth : target.width;
        const canvasHeight = target == null ? gl.drawingBufferHeight : target.height;
        const canvasAspect = canvasWidth / canvasHeight;
        const videoAspect = backgroundMedia.width / backgroundMedia.height;
        
        gl.uniform1f(backgroundVideoProgram.uniforms.uCanvasAspect, canvasAspect);
        gl.uniform1f(backgroundVideoProgram.uniforms.uVideoAspect, videoAspect);
        gl.uniform1f(backgroundVideoProgram.uniforms.uScale, config.BACKGROUND_IMAGE_SCALE || 1.0);
    } else {
        // Use simple texture program for images (already have proper scaling)
        simpleTextureProgram.bind();
        gl.uniform1i(simpleTextureProgram.uniforms.uTexture, 0);
    }
    
    // Draw the background media
    blit(target);
    
    // Restore blending state
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
}

function drawFluidBackgroundMedia(target) {
    // Create texture if not exists
    if (!fluidBackgroundMedia.texture) {
        fluidBackgroundMedia.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, fluidBackgroundMedia.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    
    // Update texture with current media
    gl.bindTexture(gl.TEXTURE_2D, fluidBackgroundMedia.texture);
    try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fluidBackgroundMedia.element);
    } catch (e) {
        console.warn('Failed to update fluid background texture:', e);
        return;
    }
    
    // Enable blending
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    
    // Use background video program for proper scaling
    backgroundVideoProgram.bind();
    gl.uniform1i(backgroundVideoProgram.uniforms.uTexture, 0);
    
    // Calculate aspect ratios
    const canvasWidth = target == null ? gl.drawingBufferWidth : target.width;
    const canvasHeight = target == null ? gl.drawingBufferHeight : target.height;
    const canvasAspect = canvasWidth / canvasHeight;
    const mediaAspect = fluidBackgroundMedia.width / fluidBackgroundMedia.height;
    
    // Pass uniforms
    gl.uniform1f(backgroundVideoProgram.uniforms.uCanvasAspect, canvasAspect);
    gl.uniform1f(backgroundVideoProgram.uniforms.uVideoAspect, mediaAspect);
    gl.uniform1f(backgroundVideoProgram.uniforms.uScale, fluidBackgroundMedia.scale);
    
    // Draw the media
    blit(target);
    
    // Restore blending state
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
}

function drawFluidBackgroundCamera(target) {
    // Create texture if not exists
    if (!fluidBackgroundCamera.texture) {
        fluidBackgroundCamera.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, fluidBackgroundCamera.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    
    // Update texture with current camera frame
    gl.bindTexture(gl.TEXTURE_2D, fluidBackgroundCamera.texture);
    try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fluidBackgroundCamera.video);
        
        // Mobile debugging for first few frames
        if (isMobile() && !fluidBackgroundCamera.debugFrameCount) {
            fluidBackgroundCamera.debugFrameCount = 0;
        }
        if (isMobile() && fluidBackgroundCamera.debugFrameCount < 3) {
            fluidBackgroundCamera.debugFrameCount++;
            console.log(`📱 Fluid background camera frame ${fluidBackgroundCamera.debugFrameCount}: texture updated successfully`);
        }
        
    } catch (e) {
        if (isMobile()) {
            console.warn('📱 Mobile fluid background camera texture update failed:', e);
        } else {
            console.warn('Failed to update fluid background camera texture:', e);
        }
        return;
    }
    
    // Enable blending
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    
    // Use background video program for proper scaling
    backgroundVideoProgram.bind();
    gl.uniform1i(backgroundVideoProgram.uniforms.uTexture, 0);
    
    // Calculate aspect ratios
    const canvasWidth = target == null ? gl.drawingBufferWidth : target.width;
    const canvasHeight = target == null ? gl.drawingBufferHeight : target.height;
    const canvasAspect = canvasWidth / canvasHeight;
    const cameraAspect = fluidBackgroundCamera.width / fluidBackgroundCamera.height;
    
    // Pass uniforms
    gl.uniform1f(backgroundVideoProgram.uniforms.uCanvasAspect, canvasAspect);
    gl.uniform1f(backgroundVideoProgram.uniforms.uVideoAspect, cameraAspect);
    gl.uniform1f(backgroundVideoProgram.uniforms.uScale, fluidBackgroundCamera.scale);
    
    // Draw the camera feed
    blit(target);
    
    // Restore blending state
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
}

// drawCameraFeed function removed - using simple canvas overlay instead

function drawCheckerboard (target) {
    checkerboardProgram.bind();
    gl.uniform1f(checkerboardProgram.uniforms.aspectRatio, canvas.width / canvas.height);
    blit(target);
}

function drawDisplay (target) {
    let width = target == null ? gl.drawingBufferWidth : target.width;
    let height = target == null ? gl.drawingBufferHeight : target.height;

    displayMaterial.bind();
    if (config.SHADING)
        gl.uniform2f(displayMaterial.uniforms.texelSize, 1.0 / width, 1.0 / height);
    gl.uniform1i(displayMaterial.uniforms.uTexture, dye.read.attach(0));
    if (config.BLOOM) {
        gl.uniform1i(displayMaterial.uniforms.uBloom, bloom.attach(1));
        gl.uniform1i(displayMaterial.uniforms.uDithering, ditheringTexture.attach(2));
        let scale = getTextureScale(ditheringTexture, width, height);
        gl.uniform2f(displayMaterial.uniforms.ditherScale, scale.x, scale.y);
    }
    if (config.SUNRAYS)
        gl.uniform1i(displayMaterial.uniforms.uSunrays, sunrays.attach(3));
    blit(target);
}

function applyBloom (source, destination) {
    if (bloomFramebuffers.length < 2)
        return;

    let last = destination;

    gl.disable(gl.BLEND);
    bloomPrefilterProgram.bind();
    let knee = config.BLOOM_THRESHOLD * config.BLOOM_SOFT_KNEE + 0.0001;
    let curve0 = config.BLOOM_THRESHOLD - knee;
    let curve1 = knee * 2;
    let curve2 = 0.25 / knee;
    gl.uniform3f(bloomPrefilterProgram.uniforms.curve, curve0, curve1, curve2);
    gl.uniform1f(bloomPrefilterProgram.uniforms.threshold, config.BLOOM_THRESHOLD);
    gl.uniform1i(bloomPrefilterProgram.uniforms.uTexture, source.attach(0));
    blit(last);

    bloomBlurProgram.bind();
    for (let i = 0; i < bloomFramebuffers.length; i++) {
        let dest = bloomFramebuffers[i];
        gl.uniform2f(bloomBlurProgram.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
        gl.uniform1i(bloomBlurProgram.uniforms.uTexture, last.attach(0));
        blit(dest);
        last = dest;
    }

    gl.blendFunc(gl.ONE, gl.ONE);
    gl.enable(gl.BLEND);

    for (let i = bloomFramebuffers.length - 2; i >= 0; i--) {
        let baseTex = bloomFramebuffers[i];
        gl.uniform2f(bloomBlurProgram.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
        gl.uniform1i(bloomBlurProgram.uniforms.uTexture, last.attach(0));
        gl.viewport(0, 0, baseTex.width, baseTex.height);
        blit(baseTex);
        last = baseTex;
    }

    gl.disable(gl.BLEND);
    bloomFinalProgram.bind();
    gl.uniform2f(bloomFinalProgram.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
    gl.uniform1i(bloomFinalProgram.uniforms.uTexture, last.attach(0));
    gl.uniform1f(bloomFinalProgram.uniforms.intensity, config.BLOOM_INTENSITY);
    blit(destination);
}

function applySunrays (source, mask, destination) {
    gl.disable(gl.BLEND);
    sunraysMaskProgram.bind();
    gl.uniform1i(sunraysMaskProgram.uniforms.uTexture, source.attach(0));
    blit(mask);

    sunraysProgram.bind();
    gl.uniform1f(sunraysProgram.uniforms.weight, config.SUNRAYS_WEIGHT);
    gl.uniform1i(sunraysProgram.uniforms.uTexture, mask.attach(0));
    blit(destination);
}

function blur (target, temp, iterations) {
    blurProgram.bind();
    for (let i = 0; i < iterations; i++) {
        gl.uniform2f(blurProgram.uniforms.texelSize, target.texelSizeX, 0.0);
        gl.uniform1i(blurProgram.uniforms.uTexture, target.attach(0));
        blit(temp);

        gl.uniform2f(blurProgram.uniforms.texelSize, 0.0, target.texelSizeY);
        gl.uniform1i(blurProgram.uniforms.uTexture, temp.attach(0));
        blit(target);
    }
}

function splatPointer (pointer) {
    let dx = pointer.deltaX * config.SPLAT_FORCE;
    let dy = pointer.deltaY * config.SPLAT_FORCE;
    
    if (config.VELOCITY_DRAWING) {
        // Calculate velocity magnitude from deltas
        const velocity = Math.sqrt(pointer.deltaX * pointer.deltaX + pointer.deltaY * pointer.deltaY);
        
        // Scale velocity for reasonable multiplier range (0.5x to 3x)
        const velocityMultiplier = Math.min(3.0, 0.5 + velocity * 25.0);
        
        // Apply velocity scaling to force (affects splat size and intensity)
        dx *= velocityMultiplier;
        dy *= velocityMultiplier;
        
        // Create brighter color based on velocity
        const brightColor = {
            r: Math.min(1.0, pointer.color.r * velocityMultiplier),
            g: Math.min(1.0, pointer.color.g * velocityMultiplier), 
            b: Math.min(1.0, pointer.color.b * velocityMultiplier)
        };
        
        splat(pointer.texcoordX, pointer.texcoordY, dx, dy, brightColor);
    } else {
        splat(pointer.texcoordX, pointer.texcoordY, dx, dy, pointer.color);
    }
}

function multipleSplats (amount) {
    for (let i = 0; i < amount; i++) {
        const color = generateColor();
        color.r *= 10.0;
        color.g *= 10.0;
        color.b *= 10.0;
        const x = Math.random();
        const y = Math.random();
        // Increased force for longer movements (from 1000 to 2500)
        const dx = 2500 * (Math.random() - 0.5);
        const dy = 2500 * (Math.random() - 0.5);
        splat(x, y, dx, dy, color);
    }
}

function createVelocityClickEffect(x, y, baseColor) {
    // Randomized parameters for varied effects each time
    const centralForceMultiplier = 1.5 + Math.random() * 1.0; // 1.5x to 2.5x (reduced from 4x)
    const centralBrightness = 1.8 + Math.random() * 0.7; // 1.8x to 2.5x brightness
    
    // Create enhanced central splat with randomized strength
    const centralForce = config.SPLAT_FORCE * centralForceMultiplier;
    const enhancedColor = {
        r: Math.min(1.0, baseColor.r * centralBrightness),
        g: Math.min(1.0, baseColor.g * centralBrightness),
        b: Math.min(1.0, baseColor.b * centralBrightness)
    };
    
    // Central splat with more randomized direction
    const centralDx = centralForce * (Math.random() - 0.5) * (0.2 + Math.random() * 0.3);
    const centralDy = centralForce * (Math.random() - 0.5) * (0.2 + Math.random() * 0.3);
    splat(x, y, centralDx, centralDy, enhancedColor);
    
    // Randomized burst parameters
    const burstCount = 3 + Math.floor(Math.random() * 3); // 3-5 splats
    const burstRadius = 0.003 + Math.random() * 0.005; // 0.003-0.008 base radius (much smaller)
    const burstForceBase = config.SPLAT_FORCE * (0.8 + Math.random() * 0.4); // 0.8x-1.2x force
    
    for (let i = 0; i < burstCount; i++) {
        // Base angle with jitter for irregular pattern
        const baseAngle = (i / burstCount) * Math.PI * 2;
        const angleJitter = (Math.random() - 0.5) * 0.4; // ±0.2 radians jitter
        const angle = baseAngle + angleJitter;
        
        // Randomized radius for each splat
        const splatRadius = burstRadius * (0.3 + Math.random() * 0.5); // 0.3x-0.8x of base radius
        const burstX = x + Math.cos(angle) * splatRadius;
        const burstY = y + Math.sin(angle) * splatRadius;
        
        // Ensure burst splats stay within canvas bounds
        const clampedX = Math.max(0, Math.min(1, burstX));
        const clampedY = Math.max(0, Math.min(1, burstY));
        
        // Randomized outward force for each splat
        const forceVariation = 0.4 + Math.random() * 0.8; // 0.4x-1.2x force variation
        const outwardDx = Math.cos(angle) * burstForceBase * forceVariation;
        const outwardDy = Math.sin(angle) * burstForceBase * forceVariation;
        
        // More varied color for each burst splat
        const colorIntensity = 1.3 + Math.random() * 0.7; // 1.3x-2.0x brightness
        const burstColor = {
            r: Math.min(1.0, baseColor.r * colorIntensity),
            g: Math.min(1.0, baseColor.g * colorIntensity),
            b: Math.min(1.0, baseColor.b * colorIntensity)
        };
        
        splat(clampedX, clampedY, outwardDx, outwardDy, burstColor);
    }
}

function splat (x, y, dx, dy, color) {
    // Debug logging for OSC splats
    if (config.DEBUG_MODE) {
        console.log(`🎨 SPLAT CALLED: pos(${x.toFixed(3)}, ${y.toFixed(3)}) delta(${dx.toFixed(1)}, ${dy.toFixed(1)}) color(${color.r.toFixed(2)}, ${color.g.toFixed(2)}, ${color.b.toFixed(2)})`);
    }
    
    splatProgram.bind();
    gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0));
    gl.uniform1f(splatProgram.uniforms.aspectRatio, canvas.width / canvas.height);
    gl.uniform2f(splatProgram.uniforms.point, x, y);
    gl.uniform3f(splatProgram.uniforms.color, dx, dy, 0.0);
    gl.uniform1f(splatProgram.uniforms.radius, correctRadius(config.SPLAT_RADIUS / 100.0));
    blit(velocity.write);
    velocity.swap();

    gl.uniform1i(splatProgram.uniforms.uTarget, dye.read.attach(0));
    gl.uniform3f(splatProgram.uniforms.color, color.r, color.g, color.b);
    blit(dye.write);
    dye.swap();
}

// performSplatAtPosition function REMOVED - replaced by OSC velocity drawing system
// This function created random directional splats (shooting effect) which is unwanted

function correctRadius (radius) {
    let aspectRatio = canvas.width / canvas.height;
    if (aspectRatio > 1)
        radius *= aspectRatio;
    return radius;
}

canvas.addEventListener('mousedown', e => {
    let posX = e.offsetX;
    let posY = e.offsetY;
    let pointer = pointers.find(p => p.id == -1);
    if (pointer == null)
        pointer = new pointerPrototype();
    updatePointerDownData(pointer, -1, posX, posY);
});

canvas.addEventListener('mousemove', e => {
    let pointer = pointers[0];
    
    // Allow movement without clicking when velocity drawing is enabled
    if (!pointer.down && !config.VELOCITY_DRAWING) return;
    
    let posX = e.offsetX;
    let posY = e.offsetY;
    
    // Initialize pointer if velocity drawing is on but pointer isn't down
    if (!pointer.down && config.VELOCITY_DRAWING) {
        // Only initialize if this is truly the first time
        if (pointer.texcoordX === 0 && pointer.texcoordY === 0) {
            pointer.texcoordX = posX / canvas.clientWidth;
            pointer.texcoordY = 1.0 - posY / canvas.clientHeight;
            pointer.prevTexcoordX = pointer.texcoordX;
            pointer.prevTexcoordY = pointer.texcoordY;
            pointer.color = generateColor();
        }
    }
    
    updatePointerMoveData(pointer, posX, posY);
});

window.addEventListener('mouseup', () => {
    updatePointerUpData(pointers[0]);
});

canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const touches = e.targetTouches;
    
    // Enhanced mobile touch handling
    if (isMobile()) {
        // Count touch events for debug overlay
        window.mobileDebugTouchCount = (window.mobileDebugTouchCount || 0) + 1;
        
        console.log('🔍 MOBILE DEBUG: Canvas touchstart with', touches.length, 'touches');
        console.log('🔍 Touch coordinates:', touches[0] ? {x: touches[0].clientX, y: touches[0].clientY} : 'none');
        console.log('🔍 Canvas dimensions:', {width: canvas.clientWidth, height: canvas.clientHeight});
        
        // 2-finger double tap detection for hiding panel and cursor
        if (touches.length === 2) {
            const currentTime = Date.now();
            
            // Check if this is a second tap within 300ms
            if (window.twoFingerFirstTap && (currentTime - window.twoFingerFirstTap) < 300) {
                console.log('🔍 MOBILE DEBUG: 2-finger double tap detected');
                
                // Trigger the same functionality as Ctrl+H
                toggleHideCursor();
                togglePanelVisibility();
                
                // Add haptic feedback for successful double tap
                if (navigator.vibrate) {
                    navigator.vibrate([100, 50, 100]); // Success pattern
                }
                
                // Reset the first tap
                window.twoFingerFirstTap = null;
            } else {
                // Store the first tap time
                window.twoFingerFirstTap = currentTime;
                console.log('🔍 MOBILE DEBUG: 2-finger first tap detected');
                
                // Add haptic feedback for first tap
                if (navigator.vibrate) {
                    navigator.vibrate(50); // Single vibration for first tap
                }
            }
        }
        
        // Add haptic feedback if available (but not for 2-finger tap)
        if (navigator.vibrate && touches.length < 2) {
            navigator.vibrate(10);
        }
        
        // Optimize for mobile performance (allow 2-finger double tap)
        if (touches.length > 2) {
            console.log('🔍 MOBILE DEBUG: Too many touches, limiting to 2');
            // Limit to 2 touches on mobile for better performance
            return;
        }
    }
    
    while (touches.length >= pointers.length)
        pointers.push(new pointerPrototype());
    for (let i = 0; i < touches.length; i++) {
        const rect = canvas.getBoundingClientRect();
        let posX = touches[i].clientX - rect.left;
        let posY = touches[i].clientY - rect.top;
        
        if (isMobile()) {
            console.log('🔍 MOBILE DEBUG: Processing touch', i, 'at position:', {posX, posY});
            console.log('🔍 Canvas rect:', rect);
        }
        
        updatePointerDownData(pointers[i + 1], touches[i].identifier, posX, posY);
    }
}, { passive: false }); // Need preventDefault for fluid interaction

canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const touches = e.targetTouches;
    
    // Mobile-optimized touch move handling
    if (isMobile()) {
        // Throttle touch events on mobile for better performance
        if (e.timeStamp - (canvas.lastTouchMove || 0) < 16) { // ~60fps
            return;
        }
        canvas.lastTouchMove = e.timeStamp;
        console.log('🔍 MOBILE DEBUG: Canvas touchmove with', touches.length, 'touches');
    }
    
    for (let i = 0; i < touches.length; i++) {
        let pointer = pointers[i + 1];
        
        // Allow touch movement without touching when velocity drawing is enabled
        if (!pointer.down && !config.VELOCITY_DRAWING) continue;
        
        const rect = canvas.getBoundingClientRect();
        let posX = touches[i].clientX - rect.left;
        let posY = touches[i].clientY - rect.top;
        
        // Initialize pointer if velocity drawing is on but pointer isn't down
        if (!pointer.down && config.VELOCITY_DRAWING) {
            // Only initialize if this is truly the first time
            if (pointer.texcoordX === 0 && pointer.texcoordY === 0) {
                pointer.texcoordX = posX / canvas.clientWidth;
                pointer.texcoordY = 1.0 - posY / canvas.clientHeight;
                pointer.prevTexcoordX = pointer.texcoordX;
                pointer.prevTexcoordY = pointer.texcoordY;
                pointer.color = generateColor();
            }
        }
        
        updatePointerMoveData(pointer, posX, posY);
    }
}, { passive: false });

window.addEventListener('touchend', e => {
    const touches = e.changedTouches;
    
    // Handle 2-finger double tap timeout (reset if too much time passes)
    if (isMobile() && window.twoFingerFirstTap) {
        const timeSinceFirstTap = Date.now() - window.twoFingerFirstTap;
        if (timeSinceFirstTap > 300) {
            // Reset if more than 300ms has passed
            window.twoFingerFirstTap = null;
            console.log('🔍 MOBILE DEBUG: 2-finger tap timeout, resetting');
        }
    }
    
    for (let i = 0; i < touches.length; i++)
    {
        let pointer = pointers.find(p => p.id == touches[i].identifier);
        if (pointer == null) continue;
        updatePointerUpData(pointer);
    }
}, { passive: true }); // No preventDefault needed for touchend

window.addEventListener('keydown', e => {
    // Skip shortcuts if user is typing in an input field
    const activeElement = document.activeElement;
    const isTyping = activeElement && (
        activeElement.tagName === 'INPUT' || 
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.contentEditable === 'true'
    );
    
    if (isTyping) return;
    
    // Require Ctrl modifier for shortcuts to avoid conflicts with text input
    // Use only Ctrl key to avoid interfering with Mac Cmd shortcuts
    if (e.ctrlKey) {
        if (e.code === 'KeyP') {
            e.preventDefault();
            config.PAUSED = !config.PAUSED;
            updateToggle('pausedToggle', config.PAUSED);
            saveConfig();
        }
        if (e.code === 'KeyB') {
            e.preventDefault();
            splatStack.push(parseInt(Math.random() * 20) + 5);
        }
        if (e.code === 'KeyC') {
            e.preventDefault();
            config.COLORFUL = !config.COLORFUL;
            updateToggle('colorfulToggle', config.COLORFUL);
            saveConfig();
        }
        if (e.code === 'KeyD') {
            e.preventDefault();
            toggleDebug();
        }
        if (e.code === 'KeyR') {
            e.preventDefault();
            toggleVideoRecording();
        }
        if (e.code === 'KeyX') {
            e.preventDefault();
            resetValues();
        }
        if (e.code === 'KeyA') {
            e.preventDefault();
            toggleAnimate();
        }
        if (e.code === 'KeyV') {
            e.preventDefault();
            toggleVelocityDrawing();
        }
        if (e.code === 'KeyH') {
            e.preventDefault();
            toggleHideCursor();
            togglePanelVisibility();
        }
        if (e.code === 'Enter') {
            e.preventDefault();
            toggleHideCursor();
            togglePanelVisibility();
        }
        if (e.code === 'KeyO') {
            e.preventDefault();
            togglePanel();
        }
        if (e.code === 'Space') {
            e.preventDefault();
            captureScreenshot();
        }
        
        // Prompt preset shortcuts (Ctrl+1 through Ctrl+6)
        if (e.code === 'Digit1') {
            e.preventDefault();
            setPromptPreset(0); // Blooming flower
        }
        if (e.code === 'Digit2') {
            e.preventDefault();
            setPromptPreset(1); // Jellyfish Ballet
        }
        if (e.code === 'Digit3') {
            e.preventDefault();
            setPromptPreset(2); // Fractal Jellyfish
        }
        if (e.code === 'Digit4') {
            e.preventDefault();
            setPromptPreset(3); // Aurora Mountains
        }
        if (e.code === 'Digit5') {
            e.preventDefault();
            setPromptPreset(4); // Floating Islands
        }
        if (e.code === 'Digit6') {
            e.preventDefault();
            setPromptPreset(5); // Magic Forest
        }
    }
});

function updatePointerDownData (pointer, id, posX, posY) {
    pointer.id = id;
    pointer.down = true;
    pointer.moved = false;
    pointer.texcoordX = posX / canvas.clientWidth;
    pointer.texcoordY = 1.0 - posY / canvas.clientHeight;
    pointer.prevTexcoordX = pointer.texcoordX;
    pointer.prevTexcoordY = pointer.texcoordY;
    pointer.deltaX = 0;
    pointer.deltaY = 0;
    pointer.color = generateColor();
    
    // Create enhanced click effect when force click is enabled AND not in velocity drawing mode
    if (config.FORCE_CLICK && !config.VELOCITY_DRAWING) {
        createVelocityClickEffect(pointer.texcoordX, pointer.texcoordY, pointer.color);
    }
}

function updatePointerMoveData (pointer, posX, posY) {
    pointer.prevTexcoordX = pointer.texcoordX;
    pointer.prevTexcoordY = pointer.texcoordY;
    pointer.texcoordX = posX / canvas.clientWidth;
    pointer.texcoordY = 1.0 - posY / canvas.clientHeight;
    pointer.deltaX = correctDeltaX(pointer.texcoordX - pointer.prevTexcoordX);
    pointer.deltaY = correctDeltaY(pointer.texcoordY - pointer.prevTexcoordY);
    pointer.moved = Math.abs(pointer.deltaX) > 0 || Math.abs(pointer.deltaY) > 0;
}

function updatePointerUpData (pointer) {
    pointer.down = false;
}

function correctDeltaX (delta) {
    let aspectRatio = canvas.width / canvas.height;
    if (aspectRatio < 1) delta *= aspectRatio;
    return delta;
}

function correctDeltaY (delta) {
    let aspectRatio = canvas.width / canvas.height;
    if (aspectRatio > 1) delta /= aspectRatio;
    return delta;
}

function generateColor () {
    if (config.COLORFUL) {
        let c = HSVtoRGB(Math.random(), 1.0, 1.0);
        c.r *= 0.15;
        c.g *= 0.15;
        c.b *= 0.15;
        return c;
    } else {
        // Use static color when Colorful is disabled
        return {
            r: config.STATIC_COLOR.r * 0.15,
            g: config.STATIC_COLOR.g * 0.15,
            b: config.STATIC_COLOR.b * 0.15
        };
    }
}

// Organic Animation Functions
function resetActivityTimer() {
    lastActivityTime = Date.now();
    
    // Only reset animation if Animate toggle is OFF
    if (!config.ANIMATE) {
        if (idleAnimationTimer) {
            clearTimeout(idleAnimationTimer);
            idleAnimationTimer = null;
        }
        scheduleIdleAnimation();
    }
    // When Animate is ON, don't interrupt the continuous animation
}

function scheduleIdleAnimation() {
    if (!idleAnimationEnabled || !config.ANIMATE) return;
    
    idleAnimationTimer = setTimeout(() => {
        if (Date.now() - lastActivityTime >= IDLE_TIMEOUT) {
            startIdleAnimation();
        } else {
            scheduleIdleAnimation();
        }
    }, IDLE_TIMEOUT);
}

function startIdleAnimation() {
    if (!idleAnimationEnabled || config.PAUSED || !config.ANIMATE) return;
    
    // Create organic fluid animation
    createOrganicSplat();
    
    // Use interval and breathing to determine timing
    const interval = config.ANIMATION_INTERVAL; // 0-1 range, flipped logic
    const breathing = config.BREATHING;
    
    // Breathing affects timing variation
    const breathingPhase = Math.sin(Date.now() * 0.003 * (breathing + 0.1)) * 0.5 + 0.5;
    
    // Flipped interval logic: 0 = very slow (3000ms), 1 = fast (358ms)
    // At 10% slider (0.1): default comfortable speed
    const minInterval = 358;   // 0.358 seconds (fast)
    const maxInterval = 3000;  // 3.0 seconds (very slow)
    const baseInterval = maxInterval - (interval * (maxInterval - minInterval)); // Flipped
    
    // Breathing creates natural rhythm variations
    const breathingVariation = 0.8 + (breathing * breathingPhase * 0.4); // 0.8-1.2 variation
    const finalInterval = baseInterval * breathingVariation;
    
    idleAnimationTimer = setTimeout(() => {
        if (config.ANIMATE) {
            // When Animate toggle is ON, continue regardless of user activity
            startIdleAnimation(); // Continue organic animation
        } else if (Date.now() - lastActivityTime >= IDLE_TIMEOUT || liveliness > 0.1) {
            // When Animate toggle is OFF, only animate during idle periods
            startIdleAnimation(); // Continue organic animation
        } else {
            scheduleIdleAnimation(); // User became active, wait again
        }
    }, finalInterval);
}

function createOrganicSplat() {
    // Redesigned animation parameters with intuitive 0-1 ranges and Ctrl+B intensity
    const interval = config.ANIMATION_INTERVAL; // Now controls splat count instead of liveliness
    const chaos = config.CHAOS;
    const breathing = config.BREATHING;
    const colorLife = config.COLOR_LIFE;
    
    // Enhanced breathing effect with more dramatic timing variations
    const time = Date.now() * 0.001;
    const breathingSpeed = 0.5 + (breathing * 1.5); // 0.5-2.0 speed range
    const breathingPhase = Math.sin(time * breathingSpeed) * 0.5 + 0.5;
    
    // INTERVAL: Controls splat count (0 = few splats, 1 = many splats)
    const baseSplatCount = Math.floor(interval * 7 + 1); // Clean 1-8 range
    const breathingPulse = 0.7 + (breathing * breathingPhase * 0.6); // 0.7-1.3 multiplier
    const finalSplatCount = Math.max(1, Math.floor(baseSplatCount * breathingPulse));
    
    // Create organic splats with redesigned logic
    for (let i = 0; i < finalSplatCount; i++) {
        const color = generateOrganicColor(colorLife);
        
        // CHAOS: Intuitive position spreading (0 = tight cluster, 1 = full screen chaos)
        const clusterCenter = chaos < 0.5 ? 0.5 : Math.random(); // Low chaos = center, high chaos = anywhere
        const spreadRadius = chaos * 0.8; // 0-0.8 spread range
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * spreadRadius;
        
        const x = Math.max(0, Math.min(1, clusterCenter + Math.cos(angle) * distance));
        const y = Math.max(0, Math.min(1, clusterCenter + Math.sin(angle) * distance));
        
        // CHAOS: Flow direction (0 = coherent streams, 1 = random directions)
        const coherentFlow = (1 - chaos) * (Math.PI * 0.25 + time * 0.1); // Slow rotating flow
        const randomChaos = chaos * Math.PI * 2 * Math.random();
        const flowWeight = 1 - chaos;
        const finalAngle = coherentFlow * flowWeight + randomChaos * chaos;
        
        // INTERVAL: Force strength (0 = gentle, 1 = powerful like Ctrl+B)
        const baseForce = 3000 + (interval * 15000); // 3k-18k range (matches Ctrl+B intensity)
        const breathingForce = 0.8 + (breathing * breathingPhase * 0.4); // 0.8-1.2 breathing boost
        const forceStrength = baseForce * breathingForce;
        
        const dx = forceStrength * Math.cos(finalAngle);
        const dy = forceStrength * Math.sin(finalAngle);
        
        // BREATHING: Size variation (0 = consistent size, 1 = dramatic pulsing)
        const sizeBase = 1.0 + (breathing * 0.5); // 1.0-1.5 base size
        const sizePulse = 1.0 + (breathing * breathingPhase * 0.8); // 1.0-1.8 pulse range
        const originalRadius = config.SPLAT_RADIUS;
        config.SPLAT_RADIUS *= sizeBase * sizePulse;
        
        splat(x, y, dx, dy, color);
        
        // Restore original radius
        config.SPLAT_RADIUS = originalRadius;
    }
}

function generateOrganicColor(colorLife) {
    const time = Date.now() * 0.001;
    
    // COLOR LIFE: Intuitive 0-1 range (0 = static color, 1 = full rainbow evolution)
    const colorfulOverride = config.COLORFUL;
    const dynamicColorStrength = Math.max(colorLife, colorfulOverride ? 1.0 : 0);
    
    if (dynamicColorStrength > 0.1) {
        // Dynamic rainbow colors - strength based on Color Life value
        const evolutionSpeed = dynamicColorStrength * 0.2; // 0-0.2 evolution speed
        const hueShift = dynamicColorStrength * Math.sin(time * 0.15) * 0.4; // Hue variation
        const baseHue = (time * evolutionSpeed) % 1.0;
        const finalHue = (baseHue + hueShift + 1) % 1.0;
        
        // Color Life affects saturation and brightness variation
        const saturation = 0.7 + (dynamicColorStrength * 0.3); // 0.7-1.0 saturation
        const brightness = 0.8 + Math.sin(time * 0.3) * dynamicColorStrength * 0.2; // Brightness pulse
        
        let c = HSVtoRGB(finalHue, saturation, brightness);
        c.r *= 10.0; // Match Ctrl+B intensity
        c.g *= 10.0;
        c.b *= 10.0;
        return c;
    } else {
        // Static color with subtle Color Life variations
        const pulsation = Math.sin(time * 0.4) * colorLife * 0.3; // Gentle pulsing
        const baseIntensity = 1.0 + pulsation; // 0.7-1.3 intensity range
        const ctrlBMultiplier = 10.0; // Match Ctrl+B intensity
        
        return {
            r: config.STATIC_COLOR.r * baseIntensity * ctrlBMultiplier,
            g: config.STATIC_COLOR.g * baseIntensity * ctrlBMultiplier,
            b: config.STATIC_COLOR.b * baseIntensity * ctrlBMultiplier
        };
    }
}

function initializeIdleAnimation() {
    // Start the idle animation system
    resetActivityTimer();
    
    // Only track canvas interactions to reset idle timer
    // UI interactions (sliders, buttons) won't stop the animation
    canvas.addEventListener('mousedown', resetActivityTimer, { passive: true });
    canvas.addEventListener('mousemove', resetActivityTimer, { passive: true });
    canvas.addEventListener('touchstart', resetActivityTimer, { passive: true });
    canvas.addEventListener('touchmove', resetActivityTimer, { passive: true });
    
    // Start animation immediately if ANIMATE toggle is on
    if (config.ANIMATE) {
        startIdleAnimation();
    } else {
        // Otherwise wait for idle timeout
        scheduleIdleAnimation();
    }
}

function HSVtoRGB (h, s, v) {
    let r, g, b, i, f, p, q, t;
    i = Math.floor(h * 6);
    f = h * 6 - i;
    p = v * (1 - s);
    q = v * (1 - f * s);
    t = v * (1 - (1 - f) * s);

    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }

    return {
        r,
        g,
        b
    };
}

// Color conversion utilities
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255
    } : null;
}

function rgbToHex(r, g, b) {
    const toHex = (c) => {
        const hex = Math.round(c * 255).toString(16);
        return hex.length == 1 ? "0" + hex : hex;
    };
    return "#" + toHex(r) + toHex(g) + toHex(b);
}

// Color picker event handlers
function updateStaticColor(hexColor) {
    const rgb = hexToRgb(hexColor);
    if (rgb) {
        config.STATIC_COLOR = rgb;
        saveConfig();
    }
}

function updateBackgroundColor(hexColor) {
    const rgb = hexToRgb(hexColor);
    if (rgb) {
        config.BACK_COLOR = rgb;
        saveConfig();
    }
}

function normalizeColor (input) {
    let output = {
        r: input.r / 255,
        g: input.g / 255,
        b: input.b / 255
    };
    return output;
}

function wrap (value, min, max) {
    let range = max - min;
    if (range == 0) return min;
    return (value - min) % range + min;
}

function getResolution (resolution) {
    let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspectRatio < 1)
        aspectRatio = 1.0 / aspectRatio;

    let min = Math.round(resolution);
    let max = Math.round(resolution * aspectRatio);

    if (gl.drawingBufferWidth > gl.drawingBufferHeight)
        return { width: max, height: min };
    else
        return { width: min, height: max };
}

function getTextureScale (texture, width, height) {
    return {
        x: width / texture.width,
        y: height / texture.height
    };
}

function scaleByPixelRatio (input) {
    let pixelRatio = window.devicePixelRatio || 1;
    return Math.floor(input * pixelRatio);
}

function hashCode (s) {
    if (s.length == 0) return 0;
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
        hash = (hash << 5) - hash + s.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
    }
    return hash;
};

// StreamDiffusion functionality (state variables moved to top of file)
const DAYDREAM_API_BASE = 'https://api.daydream.live/v1';
const PIPELINE_ID = 'pip_qpUgXycjWF6YMeSL';

function updateStreamStatus(status, className = '') {
    const statusElement = document.getElementById('streamStatus');
    if (statusElement) {
        // Hide idle status text, show others
        if (className === 'idle') {
            statusElement.textContent = '';
            statusElement.style.display = 'none';
        } else {
        statusElement.textContent = status;
            statusElement.style.display = 'inline';
        }
        statusElement.className = `stream-status ${className}`;
    }
}

function updateStreamButton(isStreaming) {
    // The main button is now the hide/show button, no longer the stream toggle
    const hideButton = document.getElementById('hideStreamToggle');
    
    // Show/hide stream controls row and opacity based on whether we have a valid stream
    const streamControlsRow = document.getElementById('streamControlsRow');
    const opacityContainer = document.getElementById('streamOpacityContainer');
    
    const hasValidStream = streamState.playbackId && streamState.streamId && isStreaming;
    
    if (streamControlsRow) {
        streamControlsRow.style.display = hasValidStream ? 'flex' : 'none';
    }
    
    if (opacityContainer) {
        opacityContainer.style.display = hasValidStream ? 'block' : 'none';
    }
    
    // Update hide button text based on overlay visibility
    if (hideButton && hasValidStream) {
        const overlay = document.getElementById('streamOverlay');
        const isVisible = overlay && overlay.classList.contains('visible');
        hideButton.textContent = isVisible ? 'Hide Diffusion' : 'Show Diffusion';
    } else if (hideButton) {
        // When no valid stream, show default text
        hideButton.textContent = 'Show Diffusion';
    }
}

async function copyStreamUrlToClipboard(forceShare = false) {
    if (!streamState.playbackId) {
        console.warn('No stream URL available to copy');
        return;
    }
    
    const streamUrl = `https://lvpr.tv/?v=${streamState.playbackId}&lowLatency=force&controls=false`;
    const copyButton = document.getElementById('copyStreamUrlButton');
    
    // Prepare share data with URL as text
    const shareData = {
        title: 'AI Fluid Simulation Stream',
        text: `Check out this AI-powered fluid simulation stream: ${streamUrl}`,
        url: streamUrl
    };
    
    // Primary action: Try Web Share API first (share sheet priority)
    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        try {
            await navigator.share(shareData);
            showShareFeedback(copyButton, 'Shared!');
            return;
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Web Share API failed:', err);
            }
            // Fall through to clipboard copy
        }
    }
    
    // Fallback action: Copy to clipboard if sharing fails or isn't available
    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(streamUrl);
            showShareFeedback(copyButton, 'Copied!');
        } catch (err) {
            console.error('Failed to copy with clipboard API:', err);
            // Fallback to older method
            fallbackCopyToClipboard(streamUrl, copyButton);
        }
    } else {
        // Fallback for older browsers
        fallbackCopyToClipboard(streamUrl, copyButton);
    }
}

function fallbackCopyToClipboard(text, button) {
    // Create a temporary textarea element
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    
    try {
        textarea.select();
        textarea.setSelectionRange(0, 99999); // For mobile devices
        document.execCommand('copy');
        showShareFeedback(button, 'Copied!');
    } catch (err) {
        console.error('Fallback copy failed:', err);
    } finally {
        document.body.removeChild(textarea);
    }
}

function showShareFeedback(button, message = 'Copied!') {
    if (!button) return;
    
    const originalText = button.textContent;
    button.textContent = `✓ ${message}`;
    button.classList.add('copied');
    
    setTimeout(() => {
        button.textContent = originalText;
        button.classList.remove('copied');
    }, 2000);
}




async function createDaydreamStream() {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error('API key is required');
    }

    const response = await fetch(`${DAYDREAM_API_BASE}/streams`, {
        method: 'POST',
            headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            pipeline_id: PIPELINE_ID
        })
        });

        if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to create stream: ${error}`);
    }

    return await response.json();
}

async function updateStreamParameters() {
    if (!streamState.streamId || !streamState.isStreaming) {
        console.log('⚠️ Skipping parameter update - no active stream');
        return;
    }
    
    // Validate stream ID format
    if (!streamState.streamId.startsWith('str_')) {
        console.error('❌ Invalid stream ID format:', streamState.streamId);
        addDaydreamEventToDebug({
            type: 'parameter_update_failed',
            error: 'Invalid stream ID format'
        });
        return;
    }
    
    const now = Date.now();
    if (now - streamState.lastParameterUpdate < 500) {
        console.log('⚠️ Skipping parameter update - too frequent');
        return; // Reduced throttle time
    }
    
    // Prevent overlapping requests
    if (streamState.isUpdatingParameters) {
        console.log('⚠️ Skipping parameter update - already updating');
        return;
    }
    streamState.isUpdatingParameters = true;
    
    try {
        const apiKey = getApiKey();
        const prompt = document.getElementById('promptInput').value;
        const negativePrompt = document.getElementById('negativePromptInput').value;
        
        console.log('🔄 Updating stream parameters:', { prompt, negativePrompt });
        
        const params = {
            pipeline: "live-video-to-video",
            model_id: "streamdiffusion",
            params: {
                model_id: "stabilityai/sd-turbo",
                prompt: prompt,
                prompt_interpolation_method: "slerp",
                normalize_prompt_weights: true,
                normalize_seed_weights: true,
                negative_prompt: negativePrompt,
                num_inference_steps: config.INFERENCE_STEPS,
                seed: config.SEED,
                t_index_list: [Math.round(config.DENOISE_X), Math.round(config.DENOISE_Y), Math.round(config.DENOISE_Z)],
                controlnets: [
                    {
                        conditioning_scale: config.CONTROLNET_POSE_SCALE,
                        control_guidance_end: 1,
                        control_guidance_start: 0,
                        enabled: true,
                        model_id: "thibaud/controlnet-sd21-openpose-diffusers",
                        preprocessor: "pose_tensorrt",
                        preprocessor_params: {}
                    },
                    {
                        conditioning_scale: config.CONTROLNET_HED_SCALE,
                        control_guidance_end: 1,
                        control_guidance_start: 0,
                        enabled: true,
                        model_id: "thibaud/controlnet-sd21-hed-diffusers",
                        preprocessor: "soft_edge",
                        preprocessor_params: {}
                    },
                    {
                        conditioning_scale: config.CONTROLNET_CANNY_SCALE,
                        control_guidance_end: 1,
                        control_guidance_start: 0,
                        enabled: true,
                        model_id: "thibaud/controlnet-sd21-canny-diffusers",
                        preprocessor: "canny",
                        preprocessor_params: {
                            high_threshold: 200,
                            low_threshold: 100
                        }
                    },
                    {
                        conditioning_scale: config.CONTROLNET_DEPTH_SCALE,
                        control_guidance_end: 1,
                        control_guidance_start: 0,
                        enabled: true,
                        model_id: "thibaud/controlnet-sd21-depth-diffusers",
                        preprocessor: "depth_tensorrt",
                        preprocessor_params: {}
                    },
                    {
                        conditioning_scale: config.CONTROLNET_COLOR_SCALE,
                        control_guidance_end: 1,
                        control_guidance_start: 0,
                        enabled: true,
                        model_id: "thibaud/controlnet-sd21-color-diffusers",
                        preprocessor: "passthrough",
                        preprocessor_params: {}
                    }
                ]
            }
        };

        const response = await fetch(`https://api.daydream.live/beta/streams/${streamState.streamId}/prompts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(params)
        });

        if (response.ok) {
            const result = await response.json();
            streamState.lastParameterUpdate = now;
            console.log('✅ Parameters updated successfully:', { 
                prompt, 
                negativePrompt, 
                response: result,
                guidance_scale: config.GUIDANCE_SCALE,
                delta: config.DELTA,
                controlnet_pose_scale: config.CONTROLNET_POSE_SCALE,
                controlnet_hed_scale: config.CONTROLNET_HED_SCALE,
                controlnet_canny_scale: config.CONTROLNET_CANNY_SCALE,
                controlnet_depth_scale: config.CONTROLNET_DEPTH_SCALE,
                controlnet_color_scale: config.CONTROLNET_COLOR_SCALE 
            });
            
            // Add to debug log
            addDaydreamEventToDebug({
                type: 'parameters_updated',
                prompt: prompt
            });
        } else {
            const errorText = await response.text();
            console.error('❌ Parameter update failed:', {
                status: response.status,
                statusText: response.statusText,
                error: errorText,
                sentParams: params,
                streamId: streamState.streamId
            });
            
            // Handle specific error cases
            if (response.status === 404) {
                console.error('🚨 Stream not found - may have expired or been deleted');
                addDaydreamEventToDebug({
                    type: 'stream_not_found',
                    streamId: streamState.streamId,
                    error: 'Stream not found (404)'
                });
            } else if (response.status === 401) {
                console.error('🚨 Unauthorized - check API key');
                addDaydreamEventToDebug({
                    type: 'unauthorized',
                    error: 'Invalid API key (401)'
                });
            } else if (response.status >= 500) {
                console.error('🚨 Server error - API may be down');
                addDaydreamEventToDebug({
                    type: 'server_error',
                    status: response.status,
                    error: 'Server error'
                });
            }
        }
    } catch (error) {
        console.warn('Failed to update stream parameters:', error);
        
        // Handle specific error types
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            console.error('🚨 Network error - check internet connection');
            addDaydreamEventToDebug({
                type: 'network_error',
                error: 'Network connection failed'
            });
        } else if (error.name === 'AbortError') {
            console.warn('⚠️ Request aborted');
            addDaydreamEventToDebug({
                type: 'request_aborted',
                error: 'Request was aborted'
            });
        } else {
            addDaydreamEventToDebug({
                type: 'stream_error',
                error: error.message || 'Parameter update failed'
            });
        }
        
        // Don't let API errors affect the simulation - just log and continue
    } finally {
        streamState.isUpdatingParameters = false;
    }
}

async function setupWebRTCConnection(whipUrl, mediaStream) {
    const peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    // Add the media stream to the peer connection
    mediaStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, mediaStream);
    });

    // Create offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    // Send offer to WHIP endpoint
    const response = await fetch(whipUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/sdp'
        },
        body: offer.sdp
    });

    if (!response.ok) {
        throw new Error(`WHIP connection failed: ${response.statusText}`);
    }

    const answerSdp = await response.text();
    await peerConnection.setRemoteDescription(new RTCSessionDescription({
        type: 'answer',
        sdp: answerSdp
    }));

    return peerConnection;
}

function openStreamPopup(playbackId) {
    // Check if we already have a popup window open
    if (streamState.popupWindow && !streamState.popupWindow.closed) {
        // Get the current URL of the existing popup
        try {
            const currentUrl = streamState.popupWindow.location.href;
            const expectedUrl = `https://lvpr.tv/?v=${playbackId}&lowLatency=force&controls=false`;
            
            // If the popup is showing the same playback ID, just focus it
            if (currentUrl === expectedUrl) {
                console.log('🔄 Reusing existing popup window for same stream');
                streamState.popupWindow.focus();
                return streamState.popupWindow;
            } else {
                console.log('🔄 Updating existing popup window to new stream');
                // Update the popup to show the new stream
                streamState.popupWindow.location.href = expectedUrl;
                streamState.popupWindow.focus();
                return streamState.popupWindow;
            }
        } catch (e) {
            // Cross-origin error - popup might be from different domain
            // In this case, we'll close the old popup and open a new one
            console.log('🔄 Closing old popup due to cross-origin restrictions');
            streamState.popupWindow.close();
        }
    }
    
    // Create new popup window
    const width = 512;
    const height = 512;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;
    
    const streamUrl = `https://lvpr.tv/?v=${playbackId}&lowLatency=force&controls=false`;

    console.log('🆕 Opening new popup window for stream');
    const popupWindow = window.open(
        streamUrl,
        'AI_Daydream_Stream',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no,menubar=no,toolbar=no,status=no`
    );

    if (!popupWindow) {
        throw new Error('Popup blocked. Please allow popups for this site.');
    }

    return popupWindow;
}

async function startStream(showOverlay = true) {
    let savedStream = null;
    let streamIsValid = false;
    
    try {
        updateStreamStatus('Connecting...', 'connecting');
        updateStreamButton(false);
        
        // Add to debug log
        addDaydreamEventToDebug({
            type: 'stream_connecting'
        });
        
        // Validate API key
        const apiKey = getApiKey();
        if (!apiKey) {
            // First, ensure settings panel is open
            const settingsContent = document.getElementById('settingsContent');
            const apiKeyInput = document.getElementById('apiKeyInput');
            
            if (settingsContent && !settingsContent.classList.contains('expanded')) {
                // Open settings panel first
                toggleSettings();
            }
            
            // Removed auto-scroll to API key input field
            // Users can manually scroll to the API key section if needed
            
            // Update UI and return without throwing error
            updateStreamStatus('API key required', 'error');
            updateStreamButton(false);
            return;
        }
        
        // Create canvas media stream from appropriate canvas (audio blob or fluid)
        const streamingCanvas = getStreamingCanvas();
        streamState.mediaStream = streamingCanvas.captureStream(30);
        if (!streamState.mediaStream) {
            throw new Error('Failed to capture canvas stream');
        }
        
        console.log(`📹 Using ${streamingCanvas === audioBlobState.canvas ? 'audio blob' : 'fluid'} canvas for streaming`);
        
        // Try to load and validate existing stream first
        savedStream = loadStreamState();
        
        if (savedStream) {
            updateStreamStatus('Checking saved stream...', 'connecting');
            streamIsValid = await validateSavedStream(savedStream);
            
            if (streamIsValid) {
                updateStreamStatus('Reconnecting to existing stream...', 'connecting');
                streamState.streamId = savedStream.streamId;
                streamState.playbackId = savedStream.playbackId;
                streamState.whipUrl = savedStream.whipUrl;
                console.log('✅ Reusing validated stream:', savedStream.streamId);
                
                // Add to debug log
                addDaydreamEventToDebug({
                    type: 'stream_validated',
                    streamId: savedStream.streamId
                });
            } else {
                console.log('❌ Saved stream is no longer valid, creating new one...');
                clearStreamState(); // Clear invalid stream data
                
                // Add to debug log
                addDaydreamEventToDebug({
                    type: 'stream_invalid'
                });
            }
        }
        
        if (!streamIsValid) {
            // Create new Daydream stream
            updateStreamStatus('Creating new stream...', 'connecting');
            const streamData = await createDaydreamStream();
            streamState.streamId = streamData.id;
            streamState.playbackId = streamData.output_playback_id;
            streamState.whipUrl = streamData.whip_url;
            
            // Save the new stream state
            saveStreamState();
            console.log('✅ Created new stream:', streamState.streamId);
            
            // Add to debug log
            addDaydreamEventToDebug({
                type: 'stream_created',
                streamId: streamState.streamId,
                playbackId: streamState.playbackId
            });
        }
        
        // Update button visibility now that we have a valid stream
        updateStreamButton(false); // Update copy button visibility
        
        // Open stream overlay instead of popup window
        updateStreamStatus('Opening player...', 'connecting');
        openStreamOverlay(streamState.playbackId, showOverlay);
        
        // Add to debug log
        addDaydreamEventToDebug({
            type: 'popup_opened',
            playbackId: streamState.playbackId
        });
        
        // Setup WebRTC connection
        updateStreamStatus('Connecting to stream...', 'connecting');
        streamState.peerConnection = await setupWebRTCConnection(
            streamState.whipUrl,
            streamState.mediaStream
        );
        
        // Monitor connection state
        streamState.peerConnection.addEventListener('connectionstatechange', () => {
            const state = streamState.peerConnection.connectionState;
            
            // Add to debug log
            addDaydreamEventToDebug({
                type: state === 'connected' ? 'stream_connected' : 
                      (state === 'failed' || state === 'disconnected') ? 'stream_disconnected' : 'stream_connecting'
            });
            
            if (state === 'failed' || state === 'disconnected') {
                updateStreamStatus('Connection lost', 'error');
                setTimeout(() => stopStream(), 2000);
            }
        });
        
        // Update parameters
        await updateStreamParameters();
        
        streamState.isStreaming = true;
        updateStreamStatus('Active', 'active');
        updateStreamButton(true);
        
        // Add to debug log
        addDaydreamEventToDebug({
            type: 'stream_started'
        });
        
        // Start continuous prompt updates to override default prompts
        streamState.promptUpdateInterval = setInterval(() => {
            if (streamState.isStreaming) {
                console.log('🔄 Auto-updating stream prompt...');
                updateStreamParameters();
            }
        }, 1000); // Update every second
        
        console.log('✅ Started continuous prompt updates every 1 second');
        
        // Monitor popup window
        const checkPopup = setInterval(() => {
            if (streamState.popupWindow && streamState.popupWindow.closed) {
                clearInterval(checkPopup);
                // Don't automatically stop stream when popup closes
                // Just clean up the popup reference
                streamState.popupWindow = null;
                streamState.popupCheckInterval = null;
            }
        }, 1000);
        
        // Store interval ID for cleanup
        streamState.popupCheckInterval = checkPopup;
        
    } catch (error) {
        console.error('Failed to start stream:', error);
        
        // Add to debug log
        addDaydreamEventToDebug({
            type: 'stream_error',
            error: error.message || 'Stream start failed'
        });
        
        let errorMessage = error.message;
        let shouldRetryWithNewStream = false;
        
        // Provide user-friendly error messages
        if (error.message.includes('API key')) {
            errorMessage = 'Invalid API key';
            // For API key errors, just update status and return - don't show confirm dialog
            // The user experience is already handled by opening settings and scrolling to input
            updateStreamStatus('Error: ' + errorMessage, 'error');
            updateStreamButton(false);
            stopStream();
            return;
        } else if (error.message.includes('Popup blocked')) {
            errorMessage = 'Popup blocked - please allow popups';
        } else if (error.message.includes('WHIP connection')) {
            errorMessage = 'Stream connection failed';
            // If we were trying to reuse a saved stream, suggest creating a new one
            if (savedStream && streamIsValid) {
                shouldRetryWithNewStream = true;
                errorMessage += ' (saved stream may be expired)';
            }
        } else if (error.message.includes('Failed to create stream')) {
            errorMessage = 'API error - check your key';
        }
        
        updateStreamStatus('Error: ' + errorMessage, 'error');
        updateStreamButton(false);
        stopStream();
        
        // If connection failed with saved stream, try creating a new one automatically
        if (shouldRetryWithNewStream) {
            console.log('🔄 Retrying with new stream after saved stream connection failed...');
            clearStreamState(); // Clear the problematic saved stream
            updateStreamStatus('Retrying with new stream...', 'connecting');
            setTimeout(() => startStream(), 2000);
            return;
        }
        
        // Show user notification for other errors
        if (window.confirm(`Stream failed: ${errorMessage}\n\nWould you like to try again?`)) {
            setTimeout(() => startStream(), 1000);
        }
    }
}

function stopStream() {
    streamState.isStreaming = false;
    
    // Add to debug log
    addDaydreamEventToDebug({
        type: 'stream_stopped'
    });
    
    // Clean up WebRTC connection
    if (streamState.peerConnection) {
        streamState.peerConnection.close();
        streamState.peerConnection = null;
    }
    
    // Clean up media stream
    if (streamState.mediaStream) {
        streamState.mediaStream.getTracks().forEach(track => track.stop());
        streamState.mediaStream = null;
    }
    
    // Clean up popup window only if it's closed or we're fully stopping
    if (streamState.popupWindow && streamState.popupWindow.closed) {
        streamState.popupWindow = null;
        console.log('🔄 Popup window was closed, clearing reference');
    } else if (streamState.popupWindow && !streamState.popupWindow.closed) {
        console.log('🔄 Keeping popup window open for potential reconnection');
        // Don't close or null the popup - keep it for reconnection
    }
    
    // Clean up intervals
    if (streamState.popupCheckInterval) {
        clearInterval(streamState.popupCheckInterval);
        streamState.popupCheckInterval = null;
    }
    
    if (streamState.promptUpdateInterval) {
        clearInterval(streamState.promptUpdateInterval);
        streamState.promptUpdateInterval = null;
        console.log('🔄 Stopped continuous prompt updates');
    }
    
    // Close stream overlay when stopping
    closeStreamOverlay();
    
    // Reset connection state but preserve stream IDs and popup for reuse
    // streamState.streamId, playbackId, whipUrl, popupWindow are kept for reconnection
    streamState.lastParameterUpdate = 0;
    streamState.isUpdatingParameters = false;
    
    updateStreamStatus('Idle', 'idle');
    updateStreamButton(false);
}

function toggleStream() {
    if (streamState.isStreaming) {
        stopStream();
    } else {
        startStream();
    }
}

async function restartStream() {
    console.log('🔄 Restarting stream...');
    
    if (streamState.isStreaming) {
        console.log('🛑 Stopping current stream...');
        await stopStream();
        
        // Wait a moment before restarting
        setTimeout(async () => {
            console.log('🚀 Starting new stream...');
            await startStream();
        }, 1000);
    } else {
        // If not streaming, just start it
        console.log('🚀 Starting stream...');
        await startStream();
    }
}

// Stream overlay management
function openStreamOverlay(playbackId, showOverlay = true) {
    const overlay = document.getElementById('streamOverlay');
    const iframe = document.getElementById('streamOverlayFrame');
    const loading = document.getElementById('streamOverlayLoading');
    
    if (!overlay || !iframe || !loading) {
        console.error('Stream overlay elements not found');
        return;
    }
    
    const streamUrl = `https://lvpr.tv/?v=${playbackId}&lowLatency=force&controls=false`;
    console.log('🔄 Loading stream URL in overlay:', streamUrl);
    
    // Show overlay only if requested
    if (showOverlay) {
        overlay.classList.add('visible');
    }
    
    // Show loading state
    loading.style.display = 'block';
    iframe.style.display = 'none';
    
    // Set iframe source and show when loaded
    iframe.onload = function() {
        console.log('✅ Stream iframe loaded successfully');
        loading.style.display = 'none';
        iframe.style.display = 'block';
    };
    
    // Add error handling
    iframe.onerror = function() {
        console.error('❌ Stream iframe failed to load');
        loading.textContent = 'Failed to load stream';
    };
    
    // Set a timeout to show if loading takes too long
    setTimeout(() => {
        if (loading.style.display !== 'none') {
            console.warn('⚠️ Stream taking longer than expected to load');
            loading.textContent = 'Stream loading...';
        }
    }, 10000);
    
    iframe.src = streamUrl;
    
    // Try to hide video controls after iframe loads
    iframe.addEventListener('load', function() {
        try {
            // Attempt to hide video controls (may be blocked by CORS)
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            if (iframeDoc) {
                const style = iframeDoc.createElement('style');
                style.textContent = `
                    video::-webkit-media-controls { display: none !important; }
                    video::-webkit-media-controls-panel { display: none !important; }
                    video::-webkit-media-controls-play-button { display: none !important; }
                    video::-webkit-media-controls-volume-slider { display: none !important; }
                    video::-webkit-media-controls-timeline { display: none !important; }
                    video::-webkit-media-controls-current-time-display { display: none !important; }
                    video::-webkit-media-controls-time-remaining-display { display: none !important; }
                    video::-webkit-media-controls-fullscreen-button { display: none !important; }
                    video { pointer-events: none !important; }
                    .video-controls, .controls, .player-controls { display: none !important; }
                    .vjs-control-bar { display: none !important; }
                `;
                iframeDoc.head.appendChild(style);
                console.log('✅ Successfully injected video control hiding styles');
            }
        } catch (e) {
            console.log('⚠️ Could not inject styles into iframe (CORS restriction):', e.message);
        }
    });
    
    console.log('🆕 Opened stream overlay');
}

function closeStreamOverlay(clearIframe = true) {
    const overlay = document.getElementById('streamOverlay');
    const iframe = document.getElementById('streamOverlayFrame');
    
    if (overlay) {
        overlay.classList.remove('visible');
    }
    
    // Only clear iframe if explicitly requested (when stopping stream)
    if (clearIframe && iframe) {
        iframe.src = '';
    }
    
    console.log('🔄 Closed stream overlay');
}

function popOutStream() {
    if (!streamState.playbackId) {
        console.warn('No stream available to pop out');
        return;
    }
    
    // Keep the overlay visible, just open popup window
    streamState.popupWindow = openStreamPopup(streamState.playbackId);
    
    console.log('🔄 Popped out stream to new window (overlay stays visible)');
}

function toggleStreamVisibility() {
    const overlay = document.getElementById('streamOverlay');
    const hideButton = document.getElementById('hideStreamToggle');
    
    if (!overlay) return;
    
    const isVisible = overlay.classList.contains('visible');
    
    if (isVisible) {
        overlay.classList.remove('visible');
        if (hideButton) hideButton.textContent = 'Show Diffusion';
    } else {
        overlay.classList.add('visible');
        if (hideButton) hideButton.textContent = 'Hide Diffusion';
        
        // Ensure iframe is still loaded when showing again
        const iframe = document.getElementById('streamOverlayFrame');
        if (iframe && streamState.playbackId && !iframe.src) {
            const streamUrl = `https://lvpr.tv/?v=${streamState.playbackId}&lowLatency=force&controls=false`;
            iframe.src = streamUrl;
        }
    }
}



// Audio Blob System

async function toggleAudioBlob() {
    const button = document.getElementById('audioBlobButton');
    if (!button) return;

    const isActive = button.classList.contains('active');
    
    if (isActive) {
        stopAudioBlob();
        deactivateAllInputModes();
    } else {
        activateInputMode('audio');
        await startAudioBlob();
    }
}

// Input mode toggle group
const inputModes = {
    audio: {
        buttonId: 'audioBlobButton',
        canvasId: 'audioBlobCanvas',
        controlIds: ['audioControls'],
        text: '🎵 Audio'
    },
    fluid: {
        buttonId: 'fluidDrawingButton',
        canvasId: 'fluidCanvas',
        controlIds: ['fluidControlsContent'],
        text: '🎨 Fluid Drawing'
    },
    camera: {
        buttonId: 'cameraButton',
        canvasId: 'cameraCanvas',
        controlIds: ['cameraControls'],
        text: '📹 Camera'
    },
    media: {
        buttonId: 'mediaButton',
        canvasId: 'mediaCanvas',
        controlIds: ['mediaControls'],
        text: '🎬 Media'
    }
};

function deactivateAllInputModes() {
    console.log('🛑 Deactivating modes, current states:', {
        media: mediaState.active,
        camera: cameraState.active,
        audio: audioBlobState.active
    });
    
    // Stop all active modes before deactivating UI
    if (cameraState.active) {
        console.log('🛑 Stopping camera...');
        stopCamera();
    }
    if (mediaState.active) {
        console.log('🛑 Stopping media...');
        stopMedia();
    }
    if (audioBlobState.active) {
        console.log('🛑 Stopping audio blob...');
        stopAudioBlob();
    }
    
    console.log('✅ All modes stopped, final states:', {
        media: mediaState.active,
        camera: cameraState.active,
        audio: audioBlobState.active
    });
    
    Object.values(inputModes).forEach(mode => {
        const button = document.getElementById(mode.buttonId);
        if (button) {
            button.classList.remove('active');
        }
        
        const canvas = document.getElementById(mode.canvasId);
        if (canvas) {
            canvas.style.display = 'none';
        }
        
        mode.controlIds.forEach(controlId => {
            const control = document.getElementById(controlId);
            if (control) {
                control.style.display = 'none';
            }
        });
    });
    
    // Hide fluid canvas and simulation for performance optimization
    const fluidCanvas = document.getElementById('fluidCanvas');
    if (fluidCanvas) {
        fluidCanvas.style.display = 'none';
    }
    
    isFluidVisible = false;
    console.log('🎨 Fluid rendering paused for performance');
    console.log(`📊 Performance stats - Rendered: ${performanceStats.renderedFrames}, Skipped: ${performanceStats.skippedFrames}`);
}

function activateInputMode(modeName) {
    console.log(`🔄 Activating input mode: ${modeName}`);
    const mode = inputModes[modeName];
    if (!mode) return;

    // Deactivate all other modes first
    console.log('🛑 Deactivating all input modes...');
    deactivateAllInputModes();
    
    console.log('✅ All modes deactivated, states:', {
        media: mediaState.active,
        camera: cameraState.active,
        audio: audioBlobState.active
    });
    
    // Activate this mode
    const button = document.getElementById(mode.buttonId);
    if (button) {
        button.classList.add('active');
    }
    
    const canvas = document.getElementById(mode.canvasId);
    if (canvas) {
        canvas.style.display = 'block';
        
        // Special handling for different input modes
        if (modeName === 'fluid') {
            // Show fluid canvas for fluid mode
            const fluidCanvas = document.getElementById('fluidCanvas');
            if (fluidCanvas) {
                fluidCanvas.style.display = 'block';
            }
            
            // Enable fluid rendering for performance optimization
            isFluidVisible = true;
            
            // Fully reinitialize WebGL context and fluid simulation
            try {
                // Ensure canvas is properly sized first
                if (resizeCanvas()) {
                    console.log('🎨 Canvas resized for fluid mode');
                }
                
                // Reinitialize framebuffers and WebGL state
                initFramebuffers();
                initBloomFramebuffers();
                initSunraysFramebuffers();
                
                // Clear and reset canvas
                gl.clearColor(0.0, 0.0, 0.0, 1.0);
                gl.clear(gl.COLOR_BUFFER_BIT);
                
                // Add initial splats for visual feedback
                multipleSplats(parseInt(Math.random() * 20) + 5);
                
                // Start animation loop
                config.PAUSED = false;
                if (window.fluidAnimationFrame) {
                    cancelAnimationFrame(window.fluidAnimationFrame);
                }
                window.fluidAnimationFrame = requestAnimationFrame(update);
                
                // Simulate animation toggle to ensure proper state refresh
                // Force animation OFF first to reset state
                if (config.ANIMATE) {
                    config.ANIMATE = false;
                    updateToggle('animateToggle', config.ANIMATE);
                }
                
                // Then trigger animation ON (this calls the full toggle system)
                toggleAnimate(); // This will turn animation ON and trigger proper initialization
                
                // Update pause toggle state
                updateToggle('pauseToggle', config.PAUSED);
                
                // Switch streaming canvas to fluid canvas if streaming is active
                switchStreamingCanvas(false);
                
                console.log('🎨 Fluid simulation reinitialized and rendering enabled');
                console.log(`📊 Performance stats reset - Starting fresh render cycle`);
            } catch (error) {
                console.error('Failed to reinitialize fluid simulation:', error);
            }
        } else if (modeName === 'camera' || modeName === 'media') {
            // Disable fluid simulation for camera and media modes
            isFluidVisible = false;
            config.PAUSED = true;
            if (window.fluidAnimationFrame) {
                cancelAnimationFrame(window.fluidAnimationFrame);
                window.fluidAnimationFrame = null;
            }
            
            // Hide fluid canvas for separate view
            const fluidCanvas = document.getElementById('fluidCanvas');
            if (fluidCanvas) {
                fluidCanvas.style.display = 'none';
            }
            
            // Start the appropriate mode
            if (modeName === 'camera') {
                startCamera();
                // Camera will switch streaming canvas after it's fully initialized
            } else if (modeName === 'media') {
                startMedia();
                // Media will switch streaming canvas after it's fully initialized
            }
            
            console.log(`🎨 Fluid simulation disabled and hidden for ${modeName} mode`);
        }
    }
    
    mode.controlIds.forEach(controlId => {
        const control = document.getElementById(controlId);
        if (control) {
            control.style.display = 'block';
        }
    });
}

function toggleFluidDrawing() {
    const button = document.getElementById('fluidDrawingButton');
    if (!button) return;

    const isActive = button.classList.contains('active');
    
    if (isActive) {
        deactivateAllInputModes();
        // Note: isFluidVisible is set to false in deactivateAllInputModes()
        config.PAUSED = true;
        if (window.fluidAnimationFrame) {
            cancelAnimationFrame(window.fluidAnimationFrame);
            window.fluidAnimationFrame = null;
        }
    } else {
        activateInputMode('fluid');
        // Note: isFluidVisible is set to true in activateInputMode('fluid')
    }
}

function toggleCamera() {
    const button = document.getElementById('cameraButton');
    if (!button) return;

    const isActive = button.classList.contains('active');
    
    if (isActive) {
        deactivateAllInputModes();
        stopCamera();
    } else {
        // Ensure fluid background camera is stopped before starting regular camera
        if (fluidBackgroundCamera.active) {
            console.log('🛑 Stopping fluid background camera before starting regular camera');
            stopFluidBackgroundCamera();
        }
        activateInputMode('camera');
        startCamera();
    }
}

function toggleFluidBackgroundCamera() {
    const button = document.getElementById('fluidCameraButton');
    if (!button) return;

    if (fluidBackgroundCamera.active) {
        stopFluidBackgroundCamera();
        button.textContent = '📷 Camera';
        button.classList.remove('active');
    } else {
        startFluidBackgroundCamera();
        button.textContent = '📷 Stop Camera';
        button.classList.add('active');
    }
}

async function startFluidBackgroundCamera() {
    try {
        console.log('📷 Starting fluid background camera...');
        
        // Mobile-optimized camera constraints (same as regular camera)
        let constraints = {
            video: {
                width: { ideal: 1920, min: 640 },
                height: { ideal: 1080, min: 480 },
                facingMode: 'user',
                frameRate: { ideal: 30, min: 15 }
            }
        };
        
        // Mobile-specific optimizations for better camera access
        if (isMobile()) {
            console.log('📱 Applying mobile-specific fluid background camera settings');
            constraints.video = {
                width: { ideal: 1280, max: 1920 },
                height: { ideal: 720, max: 1080 },
                facingMode: 'user',
                frameRate: { ideal: 24, max: 30 }
            };
        }
        
        // Request camera access
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Create video element
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        
        // Wait for video to be ready
        await new Promise((resolve) => {
            video.onloadedmetadata = () => {
                video.play();
                resolve();
            };
        });
        
        // Store camera state
        fluidBackgroundCamera.active = true;
        fluidBackgroundCamera.stream = stream;
        fluidBackgroundCamera.video = video;
        fluidBackgroundCamera.width = video.videoWidth;
        fluidBackgroundCamera.height = video.videoHeight;
        fluidBackgroundCamera.scale = config.FLUID_CAMERA_SCALE || 1.0; // Initialize from config
        
        // Show controls
        const cameraScaleControl = document.getElementById('fluidCameraScaleControl');
        if (cameraScaleControl) cameraScaleControl.style.display = 'block';
        
        console.log(`📷 Fluid background camera started: ${video.videoWidth}x${video.videoHeight}`);
        
        // Mobile debugging
        if (isMobile()) {
            console.log('📱 MOBILE FLUID CAMERA DEBUG: Successfully started');
            console.log('📱 Resolution:', `${video.videoWidth}x${video.videoHeight}`);
            console.log('📱 Scale factor:', fluidBackgroundCamera.scale);
        }
        
    } catch (error) {
        console.error('Failed to start fluid background camera:', error);
        
        // Mobile-specific error handling with fallback
        if (isMobile()) {
            console.log('📱 Mobile fluid background camera failed, trying fallback...');
            try {
                // Ultra-simple mobile fallback
                const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
                
                const video = document.createElement('video');
                video.srcObject = fallbackStream;
                video.autoplay = true;
                video.muted = true;
                video.playsInline = true;
                
                await new Promise((resolve) => {
                    video.onloadedmetadata = () => {
                        video.play();
                        resolve();
                    };
                });
                
                // Store camera state
                fluidBackgroundCamera.active = true;
                fluidBackgroundCamera.stream = fallbackStream;
                fluidBackgroundCamera.video = video;
                fluidBackgroundCamera.width = video.videoWidth;
                fluidBackgroundCamera.height = video.videoHeight;
                fluidBackgroundCamera.scale = config.FLUID_CAMERA_SCALE || 1.0;
                
                // Show controls
                const cameraScaleControl = document.getElementById('fluidCameraScaleControl');
                if (cameraScaleControl) cameraScaleControl.style.display = 'block';
                
                console.log('📱 Mobile fluid background camera fallback successful:', `${video.videoWidth}x${video.videoHeight}`);
                return;
                
            } catch (fallbackError) {
                console.error('📱 Mobile fluid background camera fallback also failed:', fallbackError);
            }
        }
        
        alert('Failed to access camera for fluid background. Please check permissions.');
    }
}

function stopFluidBackgroundCamera() {
    if (fluidBackgroundCamera.active) {
        // Clean up texture
        if (fluidBackgroundCamera.texture) {
            gl.deleteTexture(fluidBackgroundCamera.texture);
            fluidBackgroundCamera.texture = null;
        }
        
        // Stop camera stream
        if (fluidBackgroundCamera.stream) {
            fluidBackgroundCamera.stream.getTracks().forEach(track => track.stop());
            fluidBackgroundCamera.stream = null;
        }
        
        // Clean up video element
        if (fluidBackgroundCamera.video) {
            fluidBackgroundCamera.video.srcObject = null;
            fluidBackgroundCamera.video = null;
        }
        
        // Reset state
        fluidBackgroundCamera.active = false;
        fluidBackgroundCamera.width = 0;
        fluidBackgroundCamera.height = 0;
        
        // Hide camera scale control
        const cameraScaleControl = document.getElementById('fluidCameraScaleControl');
        if (cameraScaleControl) cameraScaleControl.style.display = 'none';
        
        console.log('📷 Fluid background camera stopped');
    }
}

function toggleMedia() {
    const button = document.getElementById('mediaButton');
    if (!button) return;

    const isActive = button.classList.contains('active');
    
    if (isActive) {
        deactivateAllInputModes();
        stopMedia();
    } else {
        // Just activate media mode without file selection
        activateInputMode('media');
    }
}

function selectMediaFile() {
    const fileInput = document.getElementById('mediaFileInput');
    if (!fileInput) {
        console.error('Media file input not found');
        return;
    }
    
    // Set up file change handler
    fileInput.onchange = handleMediaFileSelection;
    
    // Trigger file dialog
    fileInput.click();
}

function handleMediaFileSelection(event) {
    const file = event.target.files[0];
    if (!file) {
        console.log('No file selected');
        return;
    }
    
    console.log('🎬 Media file selected:', file.name, file.type);
    
    // Clean up previous media resources
    if (mediaState.mediaElement) {
        if (mediaState.mediaType === 'video') {
            mediaState.mediaElement.pause();
            mediaState.mediaElement.src = '';
        }
        // Revoke object URL to free memory
        if (mediaState.mediaElement.src && mediaState.mediaElement.src.startsWith('blob:')) {
            URL.revokeObjectURL(mediaState.mediaElement.src);
        }
    }
    
    // Validate file type
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
        alert('Please select an image or video file.');
        return;
    }
    
    // Activate media mode and load the file
    activateInputMode('media');
    loadMediaFile(file);
}

function handleFluidBackgroundUpload(event) {
    const file = event.target.files[0];
    if (!file) {
        console.log('🎬 No fluid background file selected');
        return;
    }
    
    console.log('🌊 Fluid background media selected:', file.name, file.type);
    
    // Validate file type
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
        alert('Please select an image or video file for fluid background.');
        return;
    }
    
    // Validate file size (max 50MB as mentioned in tooltip)
    const maxSize = 50 * 1024 * 1024; // 50MB in bytes
    if (file.size > maxSize) {
        alert('File size too large. Please select a file smaller than 50MB.');
        return;
    }
    
    // Load the file into fluid background system
    loadFluidBackgroundFile(file);
}

async function loadMediaFile(file) {
    try {
        // Start media mode first
        await startMedia();
        
        const url = URL.createObjectURL(file);
        
        if (file.type.startsWith('image/')) {
            await loadImageMedia(url, file.name);
        } else if (file.type.startsWith('video/')) {
            await loadVideoMedia(url, file.name);
        }
        
    } catch (error) {
        console.error('Failed to load media file:', error);
        alert('Failed to load media file: ' + error.message);
        stopMedia();
    }
}

async function loadImageMedia(url, filename) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            mediaState.mediaElement = img;
            mediaState.mediaType = 'image';
            mediaState.mediaName = filename;
            
            console.log(`🖼️ Image loaded: ${filename} (${img.width}x${img.height})`);
            
            // Start rendering the image
            renderMediaContent();
            resolve();
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load image'));
        };
        img.src = url;
    });
}

async function loadVideoMedia(url, filename) {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.onloadedmetadata = () => {
            mediaState.mediaElement = video;
            mediaState.mediaType = 'video';
            mediaState.mediaName = filename;
            video.muted = true; // Prevent audio feedback
            video.loop = true;
            video.play();
            
            console.log(`🎥 Video loaded: ${filename} (${video.videoWidth}x${video.videoHeight})`);
            
            // Start rendering the video
            renderMediaContent();
            resolve();
        };
        video.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load video'));
        };
        video.src = url;
    });
}

async function startCamera() {
    try {
        console.log('📹 Starting simple camera...');
        console.log('🌐 Browser:', navigator.userAgent.includes('Chrome') ? 'Chrome' : navigator.userAgent.includes('Safari') ? 'Safari' : 'Other');
        console.log('🔒 Protocol:', window.location.protocol);
        console.log('🏠 Host:', window.location.host);
        
        // Check HTTPS requirement for Chrome
        const isChrome = navigator.userAgent.includes('Chrome');
        const isHTTPS = window.location.protocol === 'https:';
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        
        if (isChrome && !isHTTPS && !isLocalhost) {
            throw new Error('Chrome requires HTTPS for camera access (except localhost). Please use https:// or localhost');
        }
        
        // Get the camera canvas
        const canvas = document.getElementById('cameraCanvas');
        if (!canvas) {
            throw new Error('Camera canvas not found');
        }
        
        // Check if getUserMedia is supported
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('getUserMedia not supported in this browser');
        }
        
        // Check permissions first
        try {
            const permissions = await navigator.permissions.query({ name: 'camera' });
            console.log('📷 Camera permission state:', permissions.state);
            if (permissions.state === 'denied') {
                throw new Error('Camera permission denied. Please allow camera access in browser settings.');
            }
        } catch (permError) {
            console.warn('⚠️ Could not check camera permissions:', permError);
        }
        
        console.log('📷 Requesting camera access...');
        
        // Browser-specific constraints for better Chrome compatibility
        let constraints = {
            video: {
                width: { ideal: 1920, min: 640 },
                height: { ideal: 1080, min: 480 },
                facingMode: 'user',
                frameRate: { ideal: 30, min: 15 }
            }
        };
        
        // Mobile-specific optimizations for better camera access
        if (isMobile()) {
            console.log('📱 Applying mobile-specific camera settings');
            constraints.video = {
                width: { ideal: 1280, max: 1920 },
                height: { ideal: 720, max: 1080 },
                facingMode: 'user',
                frameRate: { ideal: 24, max: 30 }
            };
        }
        // For Chrome, be more lenient with constraints
        else if (navigator.userAgent.includes('Chrome')) {
            console.log('🔧 Applying Chrome-specific camera settings');
            constraints.video = {
                facingMode: 'user'
            };
        }
        
        // Request camera access
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('✅ Camera stream acquired');
        
        // Create video element
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        
        console.log('📺 Video element created, waiting for metadata...');
        
        // Wait for video to load with timeout
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Video metadata load timeout'));
            }, 10000); // 10 second timeout
            
            video.addEventListener('loadedmetadata', () => {
                clearTimeout(timeout);
                console.log('✅ Video metadata loaded');
                resolve();
            }, { once: true });
            
            video.addEventListener('error', (e) => {
                clearTimeout(timeout);
                reject(new Error(`Video error: ${e.message}`));
            }, { once: true });
        });
        
        // Set up canvas
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        const ctx = canvas.getContext('2d');
        
        console.log(`📐 Canvas size: ${canvas.width}x${canvas.height}`);
        console.log(`📹 Video size: ${video.videoWidth}x${video.videoHeight}`);
        
        // Mobile debugging - confirm we're in camera mode, not fluid background
        if (isMobile()) {
            console.log('📱 MOBILE CAMERA DEBUG: Raw camera mode activated');
            console.log('📱 Camera canvas ID:', canvas.id);
            console.log('📱 Fluid background camera active:', fluidBackgroundCamera.active);
            console.log('📱 Camera state active:', cameraState.active);
        }
        
        // Store state
        cameraState.active = true;
        cameraState.stream = stream;
        cameraState.video = video;
        cameraState.canvas = canvas;
        cameraState.ctx = ctx;
        
        // Show canvas
        canvas.style.display = 'block';
        console.log('👁️ Camera canvas visible');
        
        // Test canvas streaming capability
        try {
            const testStream = canvas.captureStream(1);
            console.log('✅ Camera canvas supports streaming:', !!testStream);
            if (testStream) {
                testStream.getTracks().forEach(track => track.stop()); // Clean up test stream
            }
        } catch (streamError) {
            console.error('❌ Camera canvas streaming error:', streamError);
        }
        
        // Start simple rendering loop
        function renderCamera() {
            if (!cameraState.active) {
                console.log('🛑 Camera rendering stopped');
                return;
            }
            
            const isChrome = navigator.userAgent.includes('Chrome');
            
            // Verify video is ready
            if (video.videoWidth === 0 || video.videoHeight === 0) {
                if (isMobile()) {
                    console.warn('📱 Mobile camera: Video not ready, skipping frame');
                } else {
                    console.warn('⚠️ Video not ready, skipping frame');
                }
                cameraState.animationId = requestAnimationFrame(renderCamera);
                return;
            }
            
            // Mobile debugging for first few frames
            if (isMobile() && cameraState.frameCount < 5) {
                cameraState.frameCount = (cameraState.frameCount || 0) + 1;
                console.log(`📱 Mobile camera frame ${cameraState.frameCount}: ${video.videoWidth}x${video.videoHeight} -> ${canvas.width}x${canvas.height}`);
            }
            
            // Clear canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Calculate aspect ratio scaling
            const canvasAspect = canvas.width / canvas.height;
            const videoAspect = video.videoWidth / video.videoHeight;
            
            let drawWidth, drawHeight, drawX, drawY;
            
            if (videoAspect > canvasAspect) {
                // Video is wider - fit to height
                drawHeight = canvas.height;
                drawWidth = drawHeight * videoAspect;
                drawX = (canvas.width - drawWidth) / 2;
                drawY = 0;
            } else {
                // Video is taller - fit to width
                drawWidth = canvas.width;
                drawHeight = drawWidth / videoAspect;
                drawX = 0;
                drawY = (canvas.height - drawHeight) / 2;
            }
            
            try {
                // Chrome-specific: Check if video is actually playing
                if (isChrome && (video.paused || video.ended)) {
                    console.warn('⚠️ Video not playing in Chrome, attempting to play...');
                    video.play().catch(playError => {
                        console.warn('⚠️ Could not play video:', playError);
                    });
                }
                
                // Draw video to canvas
                ctx.drawImage(video, drawX, drawY, drawWidth, drawHeight);
                
                // Debug: Log first few successful draws
                if (!cameraState.debugDrawCount) cameraState.debugDrawCount = 0;
                if (cameraState.debugDrawCount < 5) {
                    cameraState.debugDrawCount++;
                    console.log(`🎨 Camera frame drawn ${cameraState.debugDrawCount}/5:`, {
                        videoSize: `${video.videoWidth}x${video.videoHeight}`,
                        drawRect: `${drawX},${drawY} ${drawWidth}x${drawHeight}`,
                        canvasSize: `${canvas.width}x${canvas.height}`
                    });
                }
            } catch (drawError) {
                console.warn('⚠️ Failed to draw video frame:', drawError);
                
                // Chrome fallback: try different rendering approach
                if (isChrome) {
                    try {
                        // Alternative: draw without scaling first
                        ctx.drawImage(video, 0, 0);
                        console.log('✅ Chrome fallback draw successful');
                    } catch (altError) {
                        console.warn('⚠️ Alternative draw also failed:', altError);
                    }
                }
            }
            
            // Continue loop
            cameraState.animationId = requestAnimationFrame(renderCamera);
        }
        
        // Start rendering
        renderCamera();
        console.log('🎬 Camera rendering started');
        
        // Switch streaming canvas to camera now that it's fully set up
        console.log('🔄 Switching streaming to camera canvas...');
        switchStreamingCanvas();
        
        console.log('✅ Simple camera started successfully');
        console.log(`📹 Final camera resolution: ${video.videoWidth}x${video.videoHeight}`);
        
    } catch (error) {
        console.error('❌ Failed to start camera:', error);
        console.error('📊 Error details:', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });
        
        let errorMessage = 'Failed to access camera';
        if (error.name === 'NotAllowedError') {
            errorMessage = 'Camera permission denied. Please allow camera access and refresh the page.';
        } else if (error.name === 'NotFoundError') {
            errorMessage = 'No camera found on this device.';
        } else if (error.name === 'NotReadableError') {
            errorMessage = 'Camera is already in use by another application.';
        } else if (error.name === 'OverconstrainedError') {
            errorMessage = 'Camera constraints not supported. Trying with basic settings...';
            // Try again with minimal constraints
            console.log('🔄 Retrying with minimal constraints...');
            setTimeout(() => startCameraFallback(), 1000);
            return;
        } else if (error.message.includes('HTTPS') || error.message.includes('secure context')) {
            errorMessage = 'Chrome requires HTTPS for camera access. Try:\n1. Use https://localhost:8080 instead of http://\n2. Or access via https://your-domain.com';
        } else {
            errorMessage += `: ${error.message}`;
            
            // Add Chrome-specific troubleshooting tips
            if (navigator.userAgent.includes('Chrome')) {
                errorMessage += '\n\n🔧 Chrome Troubleshooting:\n';
                errorMessage += '1. Check chrome://settings/content/camera\n';
                errorMessage += '2. Disable hardware acceleration: chrome://settings/system\n';
                errorMessage += '3. Try Incognito mode\n';
                errorMessage += '4. Restart Chrome completely';
            }
        }
        
        alert(errorMessage);
        stopCamera();
    }
}

// Fallback function for Chrome compatibility
async function startCameraFallback() {
    try {
        console.log('🔄 Starting camera with fallback constraints...');
        
        const canvas = document.getElementById('cameraCanvas');
        if (!canvas) return;
        
        // Minimal constraints for maximum compatibility
        let fallbackConstraints = { video: true };
        
        // Even in fallback, try mobile-optimized constraints first
        if (isMobile()) {
            console.log('📱 Mobile fallback: trying optimized constraints first');
            try {
                fallbackConstraints = {
                    video: {
                        width: { ideal: 640 },
                        height: { ideal: 480 },
                        facingMode: 'user'
                    }
                };
            } catch (e) {
                console.log('📱 Mobile fallback: using basic constraints');
                fallbackConstraints = { video: true };
            }
        }
        
        const stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
        
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        
        await new Promise((resolve) => {
            video.addEventListener('loadedmetadata', resolve, { once: true });
        });
        
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        const ctx = canvas.getContext('2d');
        
        cameraState.active = true;
        cameraState.stream = stream;
        cameraState.video = video;
        cameraState.canvas = canvas;
        cameraState.ctx = ctx;
        
        canvas.style.display = 'block';
        
        function renderCamera() {
            if (!cameraState.active) return;
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            if (video.videoWidth > 0 && video.videoHeight > 0) {
                const canvasAspect = canvas.width / canvas.height;
                const videoAspect = video.videoWidth / video.videoHeight;
                
                let drawWidth, drawHeight, drawX, drawY;
                
                if (videoAspect > canvasAspect) {
                    drawHeight = canvas.height;
                    drawWidth = drawHeight * videoAspect;
                    drawX = (canvas.width - drawWidth) / 2;
                    drawY = 0;
                } else {
                    drawWidth = canvas.width;
                    drawHeight = drawWidth / videoAspect;
                    drawX = 0;
                    drawY = (canvas.height - drawHeight) / 2;
                }
                
                ctx.drawImage(video, drawX, drawY, drawWidth, drawHeight);
            }
            
            cameraState.animationId = requestAnimationFrame(renderCamera);
        }
        
        renderCamera();
        
        // Switch streaming canvas to camera now that it's set up
        console.log('🔄 Switching streaming to camera canvas (fallback)...');
        switchStreamingCanvas();
        
        console.log('✅ Camera fallback successful');
        
    } catch (fallbackError) {
        console.error('❌ Camera fallback also failed:', fallbackError);
        alert('Camera access failed completely. Please check your browser settings.');
        stopCamera();
    }
}

// renderCameraFeed function removed - now using WebGL texture integration

function stopCamera() {
    console.log('📹 Stopping simple camera...');
    
    // Stop animation loop
    if (cameraState.animationId) {
        cancelAnimationFrame(cameraState.animationId);
        cameraState.animationId = null;
    }
    
    // Stop camera stream
    if (cameraState.stream) {
        cameraState.stream.getTracks().forEach(track => track.stop());
        cameraState.stream = null;
    }
    
    // Clear video element
    if (cameraState.video) {
        cameraState.video.srcObject = null;
        cameraState.video = null;
    }
    
    // Hide and clear canvas
    if (cameraState.canvas) {
        cameraState.canvas.style.display = 'none';
        if (cameraState.ctx) {
            cameraState.ctx.clearRect(0, 0, cameraState.canvas.width, cameraState.canvas.height);
        }
        cameraState.canvas = null;
        cameraState.ctx = null;
    }
    
    // Reset state
    cameraState.active = false;
    
    console.log('🔄 Simple camera stopped');
}

async function startMedia() {
    try {
        console.log('🎬 Starting media...');
        
        // Get the media canvas
        const canvas = document.getElementById('mediaCanvas');
        if (!canvas) {
            throw new Error('Media canvas element not found');
        }
        
        mediaState.canvas = canvas;
        mediaState.ctx = canvas.getContext('2d');
        
        // Ensure canvas is properly sized
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        
        // Sync scale with config
        mediaState.scale = config.MEDIA_SCALE || 1.0;
        
        mediaState.active = true;
        
        // If we have saved media, restore it
        if (mediaState.mediaElement) {
            console.log(`🎬 Restoring saved ${mediaState.mediaType}: ${mediaState.mediaName}`);
            
            // For videos, need to restart playback
            if (mediaState.mediaType === 'video') {
                mediaState.mediaElement.currentTime = 0;
                mediaState.mediaElement.play();
            }
            
            // Start rendering the saved media
            renderMediaContent();
        } else {
            // Start with a placeholder if no media loaded
            renderMediaPlaceholder();
            console.log('🎬 Media started successfully - showing placeholder');
        }
        
        // Switch streaming canvas to media if streaming is active
        switchStreamingCanvas();
        
    } catch (error) {
        console.error('Failed to start media:', error);
        
        // Clean up on error
        stopMedia();
    }
}

function renderMediaContent() {
    if (!mediaState.active || !mediaState.canvas || !mediaState.ctx) {
        return;
    }
    
    const canvas = mediaState.canvas;
    const ctx = mediaState.ctx;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (mediaState.mediaElement && mediaState.mediaType) {
        // Render the loaded media
        if (mediaState.mediaType === 'image') {
            renderImageMedia(canvas, ctx);
        } else if (mediaState.mediaType === 'video') {
            renderVideoMedia(canvas, ctx);
        }
    } else {
        // Show placeholder
        renderMediaPlaceholderContent(canvas, ctx);
    }
    
    // Continue animation loop
    if (mediaState.active) {
        mediaState.animationId = requestAnimationFrame(renderMediaContent);
    }
}

function renderImageMedia(canvas, ctx) {
    const img = mediaState.mediaElement;
    const scale = mediaState.scale;
    
    // Calculate aspect ratios for proper scaling
    const canvasAspect = canvas.width / canvas.height;
    const imageAspect = img.width / img.height;
    
    let baseWidth, baseHeight, drawX, drawY;
    
    if (imageAspect > canvasAspect) {
        // Image is wider than canvas - fit to width
        baseWidth = canvas.width;
        baseHeight = baseWidth / imageAspect;
    } else {
        // Image is taller than canvas - fit to height
        baseHeight = canvas.height;
        baseWidth = baseHeight * imageAspect;
    }
    
    // Apply scale factor (inverted - higher scale = larger media)
    const drawWidth = baseWidth * scale;
    const drawHeight = baseHeight * scale;
    
    // Center the scaled image
    drawX = (canvas.width - drawWidth) / 2;
    drawY = (canvas.height - drawHeight) / 2;
    
    // Draw image to canvas
    ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
}

function renderVideoMedia(canvas, ctx) {
    const video = mediaState.mediaElement;
    const scale = mediaState.scale;
    
    // Calculate aspect ratios for proper scaling
    const canvasAspect = canvas.width / canvas.height;
    const videoAspect = video.videoWidth / video.videoHeight;
    
    let baseWidth, baseHeight, drawX, drawY;
    
    if (videoAspect > canvasAspect) {
        // Video is wider than canvas - fit to width
        baseWidth = canvas.width;
        baseHeight = baseWidth / videoAspect;
    } else {
        // Video is taller than canvas - fit to height
        baseHeight = canvas.height;
        baseWidth = baseHeight * videoAspect;
    }
    
    // Apply scale factor (inverted - higher scale = larger media)
    const drawWidth = baseWidth * scale;
    const drawHeight = baseHeight * scale;
    
    // Center the scaled video
    drawX = (canvas.width - drawWidth) / 2;
    drawY = (canvas.height - drawHeight) / 2;
    
    // Draw video frame to canvas
    ctx.drawImage(video, drawX, drawY, drawWidth, drawHeight);
}

function renderMediaPlaceholderContent(canvas, ctx) {
    // Calculate dimensions for a modern card-like appearance
    const cardWidth = Math.min(canvas.width * 0.6, 400);
    const cardHeight = Math.min(canvas.height * 0.4, 200);
    const x = (canvas.width - cardWidth) / 2;
    const y = (canvas.height - cardHeight) / 2;
    const cornerRadius = 16;
    
    // Create animated gradient background
    const time = Date.now() * 0.001;
    const gradient = ctx.createLinearGradient(x, y, x + cardWidth, y + cardHeight);
    
    // Modern gradient with subtle animation
    const hue1 = (200 + Math.sin(time * 0.5) * 20) % 360;
    const hue2 = (240 + Math.cos(time * 0.3) * 15) % 360;
    
    gradient.addColorStop(0, `hsla(${hue1}, 15%, 20%, 0.95)`);
    gradient.addColorStop(0.5, `hsla(${hue2}, 20%, 18%, 0.9)`);
    gradient.addColorStop(1, `hsla(${hue1 + 20}, 18%, 22%, 0.95)`);
    
    // Helper function for rounded rectangle (with fallback)
    const drawRoundedRect = (x, y, width, height, radius) => {
        ctx.beginPath();
        if (ctx.roundRect) {
            // Modern browsers with roundRect support
            ctx.roundRect(x, y, width, height, radius);
        } else {
            // Fallback for older browsers
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + width - radius, y);
            ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
            ctx.lineTo(x + width, y + height - radius);
            ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
            ctx.lineTo(x + radius, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
        }
    };
    
    // Draw rounded rectangle with gradient
    ctx.fillStyle = gradient;
    drawRoundedRect(x, y, cardWidth, cardHeight, cornerRadius);
    ctx.fill();
    
    // Add subtle border with glow effect
    ctx.strokeStyle = `hsla(${180 + Math.sin(time) * 30}, 50%, 60%, 0.6)`;
    ctx.lineWidth = 2;
    drawRoundedRect(x + 1, y + 1, cardWidth - 2, cardHeight - 2, cornerRadius - 1);
    ctx.stroke();
    
    // Add inner border for depth
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    drawRoundedRect(x + 3, y + 3, cardWidth - 6, cardHeight - 6, cornerRadius - 3);
    ctx.stroke();
    
    // Create dashed border effect for drop zone feel
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.4)';
    ctx.lineWidth = 2;
    drawRoundedRect(x + 8, y + 8, cardWidth - 16, cardHeight - 16, cornerRadius - 8);
    ctx.stroke();
    ctx.setLineDash([]); // Reset line dash
    
    // Modern typography setup
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Upload icon (using Unicode)
    ctx.fillStyle = 'rgba(0, 212, 255, 0.8)';
    ctx.font = 'bold 48px system-ui, -apple-system, sans-serif';
    ctx.fillText('📁', canvas.width / 2, canvas.height / 2 - 35);
    
    // Primary text with better typography
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('Choose Media', canvas.width / 2, canvas.height / 2 + 5);
    
    // Secondary text with subtle color
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '16px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('Select an image or video file', canvas.width / 2, canvas.height / 2 + 30);
    
    // Add subtle hint text
    ctx.fillStyle = 'rgba(0, 212, 255, 0.6)';
    ctx.font = '14px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('PNG, JPG, MP4, WebM supported', canvas.width / 2, canvas.height / 2 + 50);
}

function drawMediaInfo(ctx, canvas, filename, resolution, scale = 1.0) {
    // Draw semi-transparent overlay for text
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(10, 10, 320, 100);
    
    // Draw filename, resolution, and scale
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    ctx.fillText(`📁 ${filename}`, 20, 25);
    ctx.fillText(`📐 ${resolution}`, 20, 50);
    ctx.fillText(`🔍 Scale: ${scale.toFixed(2)}x`, 20, 75);
}

function renderMediaPlaceholder() {
    // Legacy function - redirect to new implementation
    renderMediaContent();
}

function resizeMediaCanvas() {
    if (!mediaState.canvas) return;
    
    mediaState.canvas.width = window.innerWidth;
    mediaState.canvas.height = window.innerHeight;
}

function stopMedia() {
    console.log('🎬 Media stopped');
    
    mediaState.active = false;
    
    // Stop animation loop
    if (mediaState.animationId) {
        cancelAnimationFrame(mediaState.animationId);
        mediaState.animationId = null;
    }
    
    // Clear canvas
    if (mediaState.canvas && mediaState.ctx) {
        mediaState.ctx.clearRect(0, 0, mediaState.canvas.width, mediaState.canvas.height);
    }
    
    // Pause video if active but don't clear media element
    if (mediaState.mediaElement && mediaState.mediaType === 'video') {
        mediaState.mediaElement.pause();
    }
    
    // Clean up full-window drag and drop
    cleanupFullWindowDragDrop();
    
    // Reset canvas state only
    mediaState.canvas = null;
    mediaState.ctx = null;
}

async function startAudioBlob() {
    try {
        // Populate audio input devices only if not already done
        const select = document.getElementById('audioInputSelect');
        if (!select || !select.hasAttribute('data-listener-added')) {
            await populateAudioInputs();
        }
        
        // Get selected device or use default
        const deviceId = audioBlobState.selectedDeviceId;
        const constraints = {
            audio: deviceId ? { deviceId: { exact: deviceId } } : true
        };
        
        // Request microphone permission
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        audioBlobState.audioStream = stream;
        
        // Store the stream for direct audio access
        audioBlobState.audioStream = stream;
        
        // Initialize Web Audio API
        audioBlobState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        audioBlobState.analyser = audioBlobState.audioContext.createAnalyser();
        audioBlobState.microphone = audioBlobState.audioContext.createMediaStreamSource(stream);
        
        // Create audio nodes for preview control
        audioBlobState.previewGain = audioBlobState.audioContext.createGain();
        audioBlobState.previewGain.gain.value = 0; // Start muted
        
        // Create delay node for preview audio
        audioBlobState.delayNode = audioBlobState.audioContext.createDelay(10.0); // Max 10 seconds delay
        audioBlobState.delayNode.delayTime.value = (audioBlobState.delay || 0) / 1000; // Convert ms to seconds
        
        // Configure analyser
        audioBlobState.analyser.fftSize = 512;
        audioBlobState.analyser.smoothingTimeConstant = 0.8;
        
        // Initialize frequency data array
        audioBlobState.frequencyData = new Uint8Array(audioBlobState.analyser.frequencyBinCount);
        
        // Connect audio graph:
        // microphone -> analyser (for visuals)
        //           -> delayNode -> previewGain -> destination (for preview)
        audioBlobState.microphone.connect(audioBlobState.analyser);
        audioBlobState.microphone.connect(audioBlobState.delayNode);
        audioBlobState.delayNode.connect(audioBlobState.previewGain);
        audioBlobState.previewGain.connect(audioBlobState.audioContext.destination);
        
        console.log('🎵 Audio initialized:', {
            streamActive: stream.active,
            audioTracks: stream.getAudioTracks().length,
            analyzerConnected: audioBlobState.analyser !== null
        });
        
        // Get canvas and WebGL context
        const audioCanvas = document.getElementById('audioBlobCanvas');
        const fluidCanvas = document.getElementById('fluidCanvas');
        const fluidControls = document.getElementById('fluidControlsContent');
        
        if (!audioCanvas) {
            throw new Error('Audio canvas element not found');
        }
        
        audioBlobState.canvas = audioCanvas;
        audioCanvas.style.display = 'block';
        
        // Hide fluid canvas and controls if they exist
        if (fluidCanvas) fluidCanvas.style.display = 'none';
        if (fluidControls) fluidControls.style.display = 'none';
        resizeAudioCanvas();
        
        // Initialize WebGL for audio blob
        initAudioBlobGL();
        
        // Update button state and show controls
        const button = document.getElementById('audioBlobButton');
        button.classList.add('active');
        
        // Show audio controls and preview button
        const audioControls = document.getElementById('audioControls');
        const previewButton = document.getElementById('previewAudioButton');
        if (audioControls) {
            audioControls.style.display = 'block';
        }
        if (previewButton) {
            previewButton.style.display = 'block';
        }
        
        // Initialize delay buffer
        audioBlobState.delayBuffer = [];
        audioBlobState.delayIndex = 0;
        
        audioBlobState.active = true;
        
        // Switch streaming canvas to audio blob canvas if streaming is active
        switchStreamingCanvas(true);
        
        // Integrate with media stream if streaming is active
        await integrateAudioWithStream();
        
        // Start rendering loop
        renderAudioBlob();
        
        console.log('Audio blob started successfully');
        
    } catch (error) {
        console.error('Failed to start audio blob:', error);
        alert('Failed to access microphone. Please check permissions.');
    }
}

function stopAudioBlob() {
    audioBlobState.active = false;
    
    // Stop animation
    if (audioBlobState.animationId) {
        cancelAnimationFrame(audioBlobState.animationId);
    }
    
    // Clean up audio resources
    if (audioBlobState.microphone) {
        audioBlobState.microphone.disconnect();
    }
    if (audioBlobState.previewGain) {
        audioBlobState.previewGain.disconnect();
        audioBlobState.previewGain.gain.value = 0;
    }
    if (audioBlobState.delayNode) {
        audioBlobState.delayNode.disconnect();
    }
    
    // Hide and reset preview button
    const previewButton = document.getElementById('previewAudioButton');
    if (previewButton) {
        previewButton.style.display = 'none';
        previewButton.classList.remove('active');
    }
    if (audioBlobState.audioContext) {
        audioBlobState.audioContext.close();
    }
    if (audioBlobState.audioStream) {
        audioBlobState.audioStream.getTracks().forEach(track => track.stop());
        audioBlobState.audioStream = null;
    }
    
    // Clean up frequency data array
    audioBlobState.frequencyData = null;
    
    // Hide canvas and controls
    if (audioBlobState.canvas) {
        audioBlobState.canvas.style.display = 'none';
    }
    const audioControls = document.getElementById('audioControls');
    if (audioControls) {
        audioControls.style.display = 'none';
    }
    
    // Update button state
    const button = document.getElementById('audioBlobButton');
    button.classList.remove('active');
    
    // Switch streaming canvas back to fluid canvas if streaming is active
    switchStreamingCanvas(false);
    
    // Remove audio from media stream if streaming
    removeAudioFromStream();
    
    console.log('Audio blob stopped');
}

function resizeAudioCanvas() {
    if (!audioBlobState.canvas) return;
    
    audioBlobState.canvas.width = window.innerWidth;
    audioBlobState.canvas.height = window.innerHeight;
    
    if (audioBlobState.gl) {
        audioBlobState.gl.viewport(0, 0, audioBlobState.canvas.width, audioBlobState.canvas.height);
    }
}

function initAudioBlobGL() {
    const canvas = audioBlobState.canvas;
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    
    if (!gl) {
        console.error('WebGL not supported for audio blob');
        return;
    }
    
    audioBlobState.gl = gl;
    
    // Enable blending for transparency
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    
    // Create shader program for audio blob
    const vertexShaderSource = `
        attribute vec2 a_position;
        varying vec2 v_position;
        
        void main() {
            v_position = a_position;
            gl_Position = vec4(a_position, 0.0, 1.0);
        }
    `;
    
    const fragmentShaderSource = `
        precision mediump float;
        varying vec2 v_position;
        
        uniform float u_time;
        uniform float u_bassLevel;
        uniform float u_midLevel;
        uniform float u_trebleLevel;
        uniform vec2 u_resolution;
        uniform vec3 u_baseColor;
        uniform float u_opacity;
        uniform float u_colorful;
        uniform float u_edgeSoftness;
        uniform bool u_bloom;
        uniform bool u_sunrays;
        uniform float u_bloomIntensity;
        uniform float u_sunraysWeight;
        uniform vec3 u_backgroundColor;
        
        // Enhanced noise functions for organic blob shape
        float hash(vec2 p) {
            p = fract(p * vec2(123.34, 456.21));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
        }
        
        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f); // Smooth interpolation
            
            float a = hash(i);
            float b = hash(i + vec2(1.0, 0.0));
            float c = hash(i + vec2(0.0, 1.0));
            float d = hash(i + vec2(1.0, 1.0));
            
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        
        float fbm(vec2 p) {
            float f = 0.0;
            float amplitude = 0.5;
            for(int i = 0; i < 6; i++) {
                f += amplitude * noise(p);
                p *= 2.0;
                amplitude *= 0.5;
            }
            return f;
        }
        
        // Turbulence function for more chaotic movement
        float turbulence(vec2 p) {
            float t = 0.0;
            float amplitude = 1.0;
            for(int i = 0; i < 4; i++) {
                t += abs(noise(p)) * amplitude;
                p *= 2.0;
                amplitude *= 0.5;
            }
            return t;
        }
        
        // Bloom effect function
        vec3 applyBloom(vec3 color, float intensity) {
            // Simple bloom approximation using glow
            float luminance = dot(color, vec3(0.299, 0.587, 0.114));
            float bloom = smoothstep(0.3, 1.0, luminance);
            vec3 bloomColor = color * bloom * intensity * 2.0;
            return color + bloomColor;
        }
        
        // Sunrays effect function
        vec3 applySunrays(vec3 color, vec2 pos, float weight) {
            vec2 center = vec2(0.0, 0.0);
            vec2 dir = normalize(pos - center);
            float dist = length(pos - center);
            
            // Create radial rays
            float rays = 0.0;
            for(int i = 0; i < 8; i++) {
                float angle = float(i) * 0.785398; // π/4
                vec2 rayDir = vec2(cos(angle), sin(angle));
                float rayAlignment = max(0.0, dot(dir, rayDir));
                float rayIntensity = pow(rayAlignment, 4.0) * exp(-dist * 2.0);
                rays += rayIntensity;
            }
            
            // Apply sunrays based on audio intensity
            float audioIntensity = (u_bassLevel + u_midLevel + u_trebleLevel) / 3.0;
            rays *= weight * audioIntensity * 0.5;
            
            return color + vec3(rays) * color;
        }
        
        void main() {
            vec2 uv = (v_position + 1.0) * 0.5;
            vec2 center = vec2(0.5, 0.5);
            vec2 pos = uv - center;
            
            // Correct for aspect ratio to make blob circular
            float aspectRatio = u_resolution.x / u_resolution.y;
            pos.x *= aspectRatio;
            
            float dist = length(pos);
            float angle = atan(pos.y, pos.x);
            
            // Enhanced audio-reactive blob parameters
            float time = u_time * 0.5;
            
            // Bass: Controls overall size and slow organic movement
            float baseSize = 0.12 + u_bassLevel * 0.35;
            float bassWave = fbm(vec2(angle * 2.0 + time * 0.8, time * 0.3)) * u_bassLevel * 0.08;
            
            // Mid frequencies: Control medium-scale organic deformation
            float midNoise1 = fbm(vec2(angle * 4.0 + time * 1.5, time * 0.7)) * u_midLevel * 0.06;
            float midNoise2 = noise(vec2(angle * 6.0 - time * 2.0, time)) * u_midLevel * 0.04;
            float midDeform = midNoise1 + midNoise2;
            
            // Treble: Creates sharp, fast-moving details and spikes
            float trebleSpikes = 0.0;
            for(int i = 0; i < 3; i++) {
                float freq = 8.0 + float(i) * 4.0;
                float speed = 3.0 + float(i) * 2.0;
                trebleSpikes += sin(angle * freq + time * speed) * u_trebleLevel * (0.02 - float(i) * 0.005);
            }
            
            // High-frequency turbulence for organic chaos
            float organicChaos = turbulence(vec2(angle * 8.0 + time * 1.2, time * 2.5)) * 0.03;
            float audioIntensity = (u_bassLevel + u_midLevel + u_trebleLevel) / 3.0;
            organicChaos *= audioIntensity;
            
            // Breathing effect based on overall audio energy
            float breathe = sin(time * 1.5) * audioIntensity * 0.02;
            
            // Combine all deformations
            float blobRadius = baseSize + bassWave + midDeform + trebleSpikes + organicChaos + breathe;
            
            // Create soft blob edge with adjustable softness
            float edge = smoothstep(blobRadius + u_edgeSoftness, blobRadius - u_edgeSoftness, dist);
            
            // Enhanced audio-reactive colors with time-based cycling control
            vec3 baseColor = u_baseColor;
            
            // Create color variations based on frequency bands
            vec3 bassColor = vec3(1.0, 0.3, 0.1) * u_bassLevel; // Warm red/orange for bass
            vec3 midColor = vec3(0.1, 1.0, 0.3) * u_midLevel;   // Green for mids
            vec3 trebleColor = vec3(0.3, 0.1, 1.0) * u_trebleLevel; // Blue for treble
            vec3 audioColor = bassColor + midColor + trebleColor;
            
            // Use base color (will be animated by JavaScript)
            vec3 finalColor = baseColor;
            
            // Create pulsing effect synchronized with audio
            float colorPulse = sin(time * 4.0) * audioIntensity * 0.3 + 0.7;
            
            // Apply final color with audio effects
            vec3 color = finalColor * colorPulse;
            color += audioColor * 0.3; // Audio-reactive colors (constant influence)
            
            // Enhanced glow effects
            float innerGlow = exp(-dist * 4.0) * 0.4 * audioIntensity;
            float outerGlow = exp(-dist * 1.5) * 0.2 * u_bassLevel;
            color += vec3(innerGlow) * (baseColor + audioColor * 0.5);
            color += vec3(outerGlow) * bassColor;
            
            // Apply bloom effect if enabled
            if (u_bloom) {
                color = applyBloom(color, u_bloomIntensity);
            }
            
            // Apply sunrays effect if enabled
            if (u_sunrays) {
                color = applySunrays(color, pos, u_sunraysWeight);
            }
            
            // Composite blob over background color
            float blobAlpha = edge * u_opacity;
            vec3 compositeColor = mix(u_backgroundColor, color, blobAlpha);
            
            gl_FragColor = vec4(compositeColor, 1.0);
        }
    `;
    
    // Create and compile shaders
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    
    // Create shader program
    audioBlobState.shaderProgram = createAudioBlobProgram(gl, vertexShader, fragmentShader);
    
    // Get uniform locations
    audioBlobState.uniforms = {
        time: gl.getUniformLocation(audioBlobState.shaderProgram, 'u_time'),
        bassLevel: gl.getUniformLocation(audioBlobState.shaderProgram, 'u_bassLevel'),
        midLevel: gl.getUniformLocation(audioBlobState.shaderProgram, 'u_midLevel'),
        trebleLevel: gl.getUniformLocation(audioBlobState.shaderProgram, 'u_trebleLevel'),
        resolution: gl.getUniformLocation(audioBlobState.shaderProgram, 'u_resolution'),
        baseColor: gl.getUniformLocation(audioBlobState.shaderProgram, 'u_baseColor'),
        opacity: gl.getUniformLocation(audioBlobState.shaderProgram, 'u_opacity'),
        colorful: gl.getUniformLocation(audioBlobState.shaderProgram, 'u_colorful'),
        edgeSoftness: gl.getUniformLocation(audioBlobState.shaderProgram, 'u_edgeSoftness'),
        bloom: gl.getUniformLocation(audioBlobState.shaderProgram, 'u_bloom'),
        sunrays: gl.getUniformLocation(audioBlobState.shaderProgram, 'u_sunrays'),
        backgroundColor: gl.getUniformLocation(audioBlobState.shaderProgram, 'u_backgroundColor'),
        bloomIntensity: gl.getUniformLocation(audioBlobState.shaderProgram, 'u_bloomIntensity'),
        sunraysWeight: gl.getUniformLocation(audioBlobState.shaderProgram, 'u_sunraysWeight')
    };
    
    // Create vertex buffer for full-screen quad
    const positions = new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
         1,  1
    ]);
    
    audioBlobState.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, audioBlobState.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    
    // Get attribute location
    audioBlobState.positionAttributeLocation = gl.getAttribLocation(audioBlobState.shaderProgram, 'a_position');
}

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    
    return shader;
}

function createAudioBlobProgram(gl, vertexShader, fragmentShader) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Program linking error:', gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return null;
    }
    
    return program;
}

function analyzeAudio() {
    if (!audioBlobState.analyser) return;
    
    audioBlobState.analyser.getByteFrequencyData(audioBlobState.frequencyData);
    
    // Analyze frequency bands
    const bufferLength = audioBlobState.frequencyData.length;
    const bassEnd = Math.floor(bufferLength * 0.1);
    const midEnd = Math.floor(bufferLength * 0.4);
    
    // Calculate average levels for different frequency ranges
    let bassSum = 0, midSum = 0, trebleSum = 0;
    
    for (let i = 0; i < bassEnd; i++) {
        bassSum += audioBlobState.frequencyData[i];
    }
    for (let i = bassEnd; i < midEnd; i++) {
        midSum += audioBlobState.frequencyData[i];
    }
    for (let i = midEnd; i < bufferLength; i++) {
        trebleSum += audioBlobState.frequencyData[i];
    }
    
    // Normalize levels (0-1) and apply reactivity
    let bassLevel = ((bassSum / bassEnd) / 255) * audioBlobState.reactivity;
    let midLevel = ((midSum / (midEnd - bassEnd)) / 255) * audioBlobState.reactivity;
    let trebleLevel = ((trebleSum / (bufferLength - midEnd)) / 255) * audioBlobState.reactivity;
    
    // Clamp values to 0-1
    bassLevel = Math.min(1, bassLevel);
    midLevel = Math.min(1, midLevel);
    trebleLevel = Math.min(1, trebleLevel);
    
    // Apply delay if enabled
    if (audioBlobState.delay > 0 && audioBlobState.delayBuffer.length > 0) {
        // Add current values to delay buffer
        audioBlobState.delayBuffer[audioBlobState.delayIndex] = {
            bassLevel,
            midLevel,
            trebleLevel
        };
        
        // Get delayed values
        const delayedIndex = (audioBlobState.delayIndex + 1) % audioBlobState.delayBuffer.length;
        const delayed = audioBlobState.delayBuffer[delayedIndex];
        
        audioBlobState.bassLevel = delayed.bassLevel;
        audioBlobState.midLevel = delayed.midLevel;
        audioBlobState.trebleLevel = delayed.trebleLevel;
        
        // Update delay buffer index
        audioBlobState.delayIndex = (audioBlobState.delayIndex + 1) % audioBlobState.delayBuffer.length;
    } else {
        // No delay - use current values
        audioBlobState.bassLevel = bassLevel;
        audioBlobState.midLevel = midLevel;
        audioBlobState.trebleLevel = trebleLevel;
    }
}

function animateAudioBlobColor() {
    if (audioBlobState.colorful === 0.0) {
        // When colorful is 0, use the base color
        audioBlobState.color = { ...audioBlobState.baseColor };
    } else {
        // Animate color based on time and colorful slider
        const time = Date.now() * 0.001;
        const speed = audioBlobState.colorful * 6.0; // Speed multiplier (faster cycling)
        const hue = (time * speed) % (Math.PI * 2); // Full rotation every 2π/speed seconds
        
        // Generate vibrant colors using HSV-like approach
        const r = Math.sin(hue) * 0.5 + 0.5;
        const g = Math.sin(hue + (Math.PI * 2 / 3)) * 0.5 + 0.5;
        const b = Math.sin(hue + (Math.PI * 4 / 3)) * 0.5 + 0.5;
        
        audioBlobState.color = { r, g, b };
        
        // Update the color picker display
        updateColorPickerDisplay();
    }
}

function updateColorPickerDisplay() {
    const colorPicker = document.getElementById('audioBlobColorPicker');
    if (colorPicker) {
        const r = Math.round(audioBlobState.color.r * 255);
        const g = Math.round(audioBlobState.color.g * 255);
        const b = Math.round(audioBlobState.color.b * 255);
        const hexColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        
        colorPicker.value = hexColor;
        colorPicker.style.backgroundColor = hexColor;
    }
}

function renderAudioBlob() {
    if (!audioBlobState.active || !audioBlobState.gl) return;
    
    const gl = audioBlobState.gl;
    
    // Animate color based on colorful slider
    animateAudioBlobColor();
    
    // Analyze audio
    analyzeAudio();
    
    // Clear canvas
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    
    // Use shader program
    gl.useProgram(audioBlobState.shaderProgram);
    
    // Set uniforms
    gl.uniform1f(audioBlobState.uniforms.time, Date.now() * 0.001);
    gl.uniform1f(audioBlobState.uniforms.bassLevel, audioBlobState.bassLevel);
    gl.uniform1f(audioBlobState.uniforms.midLevel, audioBlobState.midLevel);
    gl.uniform1f(audioBlobState.uniforms.trebleLevel, audioBlobState.trebleLevel);
    gl.uniform2f(audioBlobState.uniforms.resolution, audioBlobState.canvas.width, audioBlobState.canvas.height);
    gl.uniform3f(audioBlobState.uniforms.baseColor, audioBlobState.color.r, audioBlobState.color.g, audioBlobState.color.b);
    gl.uniform1f(audioBlobState.uniforms.opacity, audioBlobState.opacity);
    gl.uniform1f(audioBlobState.uniforms.colorful, audioBlobState.colorful);
    // Map 0-1 range to shader range: 0 = sharp (0.001), 1 = soft (0.2)
    const shaderEdgeSoftness = 0.001 + (audioBlobState.edgeSoftness * 0.199);
    gl.uniform1f(audioBlobState.uniforms.edgeSoftness, shaderEdgeSoftness);
    
    // Set bloom and sunrays uniforms based on global config
    gl.uniform1i(audioBlobState.uniforms.bloom, config.BLOOM ? 1 : 0);
    gl.uniform1i(audioBlobState.uniforms.sunrays, config.SUNRAYS ? 1 : 0);
    gl.uniform1f(audioBlobState.uniforms.bloomIntensity, config.BLOOM_INTENSITY);
    gl.uniform1f(audioBlobState.uniforms.sunraysWeight, config.SUNRAYS_WEIGHT);
    
    // Set background color from global config
    gl.uniform3f(audioBlobState.uniforms.backgroundColor, config.BACK_COLOR.r, config.BACK_COLOR.g, config.BACK_COLOR.b);
    
    // Set up vertex attributes
    gl.bindBuffer(gl.ARRAY_BUFFER, audioBlobState.positionBuffer);
    gl.enableVertexAttribArray(audioBlobState.positionAttributeLocation);
    gl.vertexAttribPointer(audioBlobState.positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);
    
    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    
    // Continue animation
    audioBlobState.animationId = requestAnimationFrame(renderAudioBlob);
}

// Handle window resize for audio blob, camera, and media
window.addEventListener('resize', () => {
    if (audioBlobState.active) {
        resizeAudioCanvas();
    }
    if (cameraState.active) {
        resizeCameraCanvas();
    }
    if (mediaState.active) {
        resizeMediaCanvas();
    }
});

function resizeCameraCanvas() {
    if (!cameraState.canvas) return;
    
    cameraState.canvas.width = window.innerWidth;
    cameraState.canvas.height = window.innerHeight;
}

// Audio input device management
async function populateAudioInputs() {
    try {
        // Request permissions first on iOS
        if (navigator.userAgent.match(/iPad|iPhone|iPod/)) {
            await navigator.mediaDevices.getUserMedia({ audio: true });
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === 'audioinput');
        
        const select = document.getElementById('audioInputSelect');
        if (!select) return;
        
        // Store current selection to preserve it
        const currentSelection = select.value;
        
        // Group devices by type
        const deviceGroups = {
            default: [{ id: '', label: 'Default Microphone', icon: '🎤' }],
            builtin: [],
            usb: [],
            other: []
        };

        // Categorize devices
        audioInputs.forEach(device => {
            const label = device.label || `Microphone ${device.deviceId.slice(0, 8)}`;
            const deviceInfo = {
                id: device.deviceId,
                label: label,
                icon: '🎤'
            };

            // Categorize based on label (case-insensitive)
            const lowerLabel = label.toLowerCase();
            if (lowerLabel.includes('usb') || lowerLabel.includes('external')) {
                deviceInfo.icon = '🔌';
                deviceGroups.usb.push(deviceInfo);
            } else if (lowerLabel.includes('built') || lowerLabel.includes('internal') || 
                      lowerLabel.includes('macbook') || lowerLabel.includes('iphone') || 
                      lowerLabel.includes('ipad')) {
                deviceInfo.icon = '💻';
                deviceGroups.builtin.push(deviceInfo);
            } else {
                deviceGroups.other.push(deviceInfo);
            }
        });

        // Clear and rebuild select element
        select.innerHTML = '';

        // Add devices by group
        const addDeviceGroup = (devices, groupLabel) => {
            if (devices.length > 0) {
                const group = document.createElement('optgroup');
                group.label = groupLabel;
                devices.forEach(device => {
            const option = document.createElement('option');
                    option.value = device.id;
                    option.textContent = `${device.icon} ${device.label}`;
                    group.appendChild(option);
                });
                select.appendChild(group);
            }
        };

        // Add groups in specific order
        addDeviceGroup(deviceGroups.default, 'System Default');
        addDeviceGroup(deviceGroups.builtin, 'Built-in Devices');
        addDeviceGroup(deviceGroups.usb, 'USB Devices');
        addDeviceGroup(deviceGroups.other, 'Other Devices');
        
        // Restore previous selection if it still exists
        if (audioBlobState.selectedDeviceId) {
            select.value = audioBlobState.selectedDeviceId;
        } else if (currentSelection) {
            select.value = currentSelection;
        }
        
        // Only add event listeners once
        if (!select.hasAttribute('data-listener-added')) {
            select.addEventListener('change', switchAudioDevice);
            
            // Add device change monitoring
            navigator.mediaDevices.addEventListener('devicechange', async () => {
                await populateAudioInputs();
                console.log('🔄 Audio devices updated');
            });
            
            select.setAttribute('data-listener-added', 'true');
        }
        
    } catch (error) {
        console.warn('Could not enumerate audio devices:', error);
        // Show user-friendly error message
        const errorMessage = error.name === 'NotAllowedError' 
            ? 'Please allow microphone access to use audio features.'
            : 'Could not access audio devices. Please check your browser settings.';
        alert(errorMessage);
    }
}

// Separate function to handle device switching without full restart
async function switchAudioDevice(e) {
    const newDeviceId = e.target.value || null;
    
    if (!audioBlobState.active) {
        // Just store the selection if not active
        audioBlobState.selectedDeviceId = newDeviceId;
        return;
    }
    
    try {
        // Store current state
        const wasActive = audioBlobState.active;
        audioBlobState.selectedDeviceId = newDeviceId;
        
        // Get new audio stream with selected device
        const constraints = {
            audio: newDeviceId ? { deviceId: { exact: newDeviceId } } : true
        };
        
        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Clean up old audio stream
        if (audioBlobState.audioStream) {
            audioBlobState.audioStream.getTracks().forEach(track => track.stop());
        }
        
        // Store current preview state before cleanup
        const wasPreviewOn = audioBlobState.previewGain && audioBlobState.previewGain.gain.value > 0;
        
        // Clean up old audio context connections
        if (audioBlobState.microphone) {
            audioBlobState.microphone.disconnect();
        }
        if (audioBlobState.previewGain) {
            audioBlobState.previewGain.disconnect();
        }
        
        // Update with new stream
        audioBlobState.audioStream = newStream;
        audioBlobState.microphone = audioBlobState.audioContext.createMediaStreamSource(newStream);
        
        // Reconnect audio graph
        audioBlobState.microphone.connect(audioBlobState.analyser);
        audioBlobState.microphone.connect(audioBlobState.delayNode);
        audioBlobState.delayNode.connect(audioBlobState.previewGain);
        audioBlobState.previewGain.connect(audioBlobState.audioContext.destination);
        
        // Restore preview state if it was on
        if (wasPreviewOn) {
            audioBlobState.previewGain.gain.value = 1;
            const previewButton = document.getElementById('previewAudioButton');
            if (previewButton) {
                previewButton.textContent = '🔇 Stop Preview';
                previewButton.classList.add('streaming');
            }
        }
        
        console.log('🔄 Audio device switch complete:', {
            deviceId: newDeviceId || 'default',
            streamActive: newStream.active,
            audioTracks: newStream.getAudioTracks().length,
            previewState: wasPreviewOn ? 'restored' : 'muted',
            connections: {
                microphone: true,
                analyser: true,
                previewGain: true,
                destination: true
            }
        });
        
        // Update streaming if active
        await integrateAudioWithStream();
        
        console.log(`✅ Switched to audio device: ${newDeviceId || 'default'}`);
        
    } catch (error) {
        console.error('Failed to switch audio device:', error);
        
        // Handle specific error cases
        let errorMessage = 'Failed to switch audio device.';
        let shouldRestart = false;
        
        if (error.name === 'NotAllowedError') {
            errorMessage = 'Microphone access was denied. Please allow access in your browser settings.';
        } else if (error.name === 'NotFoundError') {
            errorMessage = 'The selected audio device is no longer available.';
            shouldRestart = true;
        } else if (error.name === 'NotReadableError') {
            errorMessage = 'Cannot access the audio device. It might be in use by another application.';
            shouldRestart = true;
        }
        
        // Special handling for iOS/iPadOS
        if (navigator.userAgent.match(/iPad|iPhone|iPod/)) {
            errorMessage += ' On iOS, you may need to reload the page to switch audio devices.';
            shouldRestart = true;
        }
        
        // Alert user about the error
        alert(errorMessage);
        
        if (shouldRestart) {
            console.log('🔄 Attempting to restart audio with default device...');
            
            // Stop current audio
            await stopAudioBlob();
            
            // Clear device selection
            audioBlobState.selectedDeviceId = null;
            e.target.value = '';
            
            try {
                // Restart with default device
                await startAudioBlob();
                console.log('✅ Successfully restarted audio with default device');
            } catch (restartError) {
                console.error('Failed to restart audio:', restartError);
                alert('Could not restart audio. Please refresh the page and try again.');
            }
        } else {
            // Just revert selection if no restart needed
        e.target.value = audioBlobState.selectedDeviceId || '';
        }
        
        // Refresh device list
        await populateAudioInputs();
    }
}

// Audio preview functionality
function toggleAudioPreview() {
    if (!audioBlobState.previewGain) return;
    
    const button = document.getElementById('previewAudioButton');
    const isPreviewOn = audioBlobState.previewGain.gain.value > 0;
    
    if (isPreviewOn) {
        // Turn off preview
        audioBlobState.previewGain.gain.value = 0;
        button.classList.remove('active');
    } else {
        // Turn on preview
        audioBlobState.previewGain.gain.value = 1;
        button.classList.add('active');
    }
}

// Audio streaming integration
async function integrateAudioWithStream() {
    if (!streamState.isStreaming || !audioBlobState.audioStream) return;
    
    try {
        // Get current video tracks from canvas stream
        const videoTracks = streamState.mediaStream.getVideoTracks();
        
                 // Get raw audio tracks from the microphone stream
        const audioTracks = audioBlobState.audioStream.getAudioTracks();
        
        if (audioTracks.length > 0) {
            // Create new stream with both video and audio
            const combinedStream = new MediaStream([...videoTracks, ...audioTracks]);
            
            // Update WebRTC connection with new stream
            if (streamState.peerConnection) {
                // Remove old audio tracks
                const senders = streamState.peerConnection.getSenders();
                senders.forEach(sender => {
                    if (sender.track && sender.track.kind === 'audio') {
                        streamState.peerConnection.removeTrack(sender);
                    }
                });
                
                // Add new audio track
                audioTracks.forEach(track => {
                    streamState.peerConnection.addTrack(track, combinedStream);
                });
                
                console.log('✅ Audio integrated with stream');
            }
        }
    } catch (error) {
        console.warn('Failed to integrate audio with stream:', error);
    }
}

function removeAudioFromStream() {
    if (!streamState.peerConnection) return;
    
    try {
        // Remove audio tracks from WebRTC connection
        const senders = streamState.peerConnection.getSenders();
        senders.forEach(sender => {
            if (sender.track && sender.track.kind === 'audio') {
                streamState.peerConnection.removeTrack(sender);
            }
        });
        
        console.log('✅ Audio removed from stream');
    } catch (error) {
        console.warn('Failed to remove audio from stream:', error);
    }
}

function getStreamingCanvas() {
    // Return active input canvas based on current input mode
    // Priority: media > camera > audio > fluid (media gets highest priority when active)
    const states = {
        media: mediaState.active,
        camera: cameraState.active,
        audio: audioBlobState.active,
        mediaCanvas: !!mediaState.canvas,
        cameraCanvas: !!cameraState.canvas,
        audioCanvas: !!audioBlobState.canvas
    };
    
    console.log('🔍 Checking streaming canvas states:', states);
    
    // Mobile debugging for camera canvas selection
    if (isMobile() && cameraState.active) {
        console.log('📱 Mobile camera canvas check:', {
            cameraActive: cameraState.active,
            cameraCanvas: !!cameraState.canvas,
            cameraCanvasId: cameraState.canvas ? cameraState.canvas.id : 'none',
            fluidBackgroundActive: fluidBackgroundCamera.active
        });
    }
    
    if (mediaState.active && mediaState.canvas) {
        console.log('📺 Streaming media canvas');
        return mediaState.canvas;
    }
    if (cameraState.active && cameraState.canvas) {
        console.log('📹 Streaming camera canvas');
        return cameraState.canvas;
    }
    if (audioBlobState.active && audioBlobState.canvas) {
        console.log('🎵 Streaming audio canvas');
        return audioBlobState.canvas;
    }
    console.log('🌊 Streaming fluid canvas (default)');
    return canvas; // Default to fluid canvas
}

function switchStreamingCanvas(useAudioBlob = null) {
    // Only switch if streaming is active
    if (!streamState.isStreaming || !streamState.peerConnection) return;
    
    try {
        // Get the target canvas - use active canvas or specified canvas
        const targetCanvas = useAudioBlob !== null ? 
            (useAudioBlob ? audioBlobState.canvas : canvas) : 
            getStreamingCanvas();
        
        if (!targetCanvas) {
            console.warn('Target canvas not available for streaming switch');
            return;
        }
        
        // Create new media stream from target canvas
        console.log('🎥 Attempting to capture stream from canvas:', {
            canvas: targetCanvas,
            id: targetCanvas.id,
            width: targetCanvas.width,
            height: targetCanvas.height,
            isConnected: targetCanvas.isConnected
        });
        
        const newMediaStream = targetCanvas.captureStream(30);
        if (!newMediaStream) {
            console.error('❌ Failed to capture stream from target canvas');
            return;
        }
        
        console.log('✅ Successfully captured stream from canvas:', {
            streamId: newMediaStream.id,
            tracks: newMediaStream.getTracks().length
        });
        
        // Get video tracks from new stream
        const newVideoTracks = newMediaStream.getVideoTracks();
        if (newVideoTracks.length === 0) {
            console.error('No video tracks in new media stream');
            return;
        }
        
        // Replace video track in peer connection
        const senders = streamState.peerConnection.getSenders();
        const videoSender = senders.find(sender => sender.track && sender.track.kind === 'video');
        
        if (videoSender) {
            videoSender.replaceTrack(newVideoTracks[0])
                .then(() => {
                    const canvasType = targetCanvas === audioBlobState.canvas ? 'audio blob' :
                                     targetCanvas === cameraState.canvas ? 'camera' :
                                     targetCanvas === mediaState.canvas ? 'media' : 'fluid';
                    console.log(`✅ Switched streaming canvas to ${canvasType}`);
                })
                .catch(error => {
                    console.error('Failed to replace video track:', error);
                });
        }
        
        // Update stored media stream reference
        streamState.mediaStream = newMediaStream;
        
    } catch (error) {
        console.error('Error switching streaming canvas:', error);
    }
}

// Audio control handlers
function updateAudioReactivity(value, updateInput = true) {
    audioBlobState.reactivity = value;
    if (updateInput) {
        document.getElementById('audioReactivityValue').value = value.toFixed(1);
    }
}

function updateAudioDelay(value, updateInput = true) {
    // Store delay value in ms
    audioBlobState.delay = Math.round(value);
    
    // Update input field if this update came from the slider
    if (updateInput) {
        document.getElementById('audioDelayValue').value = audioBlobState.delay;
    }
    
    // Update audio delay node if it exists
    if (audioBlobState.delayNode) {
        audioBlobState.delayNode.delayTime.value = audioBlobState.delay / 1000; // Convert ms to seconds
        console.log(`🕒 Audio delay updated: ${audioBlobState.delay}ms`);
    }
    
    // Update slider fill - cap at 100% for values over 500
    const percentage = Math.min(100, (audioBlobState.delay / 500) * 100);
    document.getElementById('audioDelayFill').style.width = `${percentage}%`;
}

// Handle manual input of delay value
function initializeAudioDelayInput() {
    const input = document.getElementById('audioDelayValue');
    if (!input) return;
    
    input.addEventListener('input', (e) => {
        // Remove any non-numeric characters
        let value = e.target.value.replace(/[^\d]/g, '');
        e.target.value = value;
    });
    
    input.addEventListener('change', (e) => {
        // Get numeric value
        let value = parseInt(e.target.value, 10);
        
        // Only clamp the minimum value to 0, allow higher than 500
        value = Math.max(0, isNaN(value) ? 0 : value);
        
        // Update the input with the cleaned value
        e.target.value = value;
        
        // Update delay without updating the input field again
        updateAudioDelay(value, false);
    });
    
    input.addEventListener('blur', (e) => {
        // Ensure the value is set when leaving the field
        if (e.target.value === '') {
            e.target.value = '0';
            updateAudioDelay(0, false);
        }
    });
}

// Initialize numeric input fields
function initializeNumericInput(id, min, max, updateFn, precision = 1) {
    const input = document.getElementById(id);
    if (!input) return;
    
    // Extract slider name from id (remove 'Value' suffix)
    const sliderName = id.replace('Value', '');
    
    function updateSliderFromInput(value, targetSlider = null) {
        const actualSlider = targetSlider || sliderName;
        
        // For denoise inputs, just update the slider position and call the update function
        if (actualSlider.startsWith('denoise')) {
            // Calculate percentage for slider
            const range = max - min;
            const percentage = range !== 0 ? ((value - min) / range) * 100 : 0;
            
            // Update slider fill directly
            const fill = document.getElementById(`${actualSlider}Fill`);
            if (fill) {
                const displayPercentage = SLIDER_HANDLE_PADDING * 100 + ((percentage / 100) * (100 - 2 * SLIDER_HANDLE_PADDING * 100));
                fill.style.width = displayPercentage + '%';
            }
            
            // Call the update function only if it's the original slider
            if (!targetSlider && updateFn) {
                updateFn(value, false);
            }
        } else if (actualSlider === 'audioDelay') {
            // Special handling for audio delay - unlimited range but slider caps at 500
            const sliderMax = 500;
            const percentage = Math.min(100, (value / sliderMax) * 100);
            
            // Update slider fill directly
            const fill = document.getElementById(`${actualSlider}Fill`);
            if (fill) {
                const displayPercentage = SLIDER_HANDLE_PADDING * 100 + ((percentage / 100) * (100 - 2 * SLIDER_HANDLE_PADDING * 100));
                fill.style.width = displayPercentage + '%';
            }
            
            // Call the update function only if it's the original slider
            if (!targetSlider && updateFn) {
                updateFn(value, false);
            }
        } else {
            // For other inputs, use the regular slider update
            const range = max - min;
            const percentage = range !== 0 ? ((value - min) / range) * 100 : 0;
            
            updateSliderValue(actualSlider, percentage / 100, false, false);
            
            if (!targetSlider && updateFn) {
                updateFn(value, false);
            }
        }
    }
    
    input.addEventListener('input', (e) => {
        // Allow any input while typing
        let value = e.target.value;
        
        // Only validate that we have at most one decimal point
        const parts = value.split('.');
        if (parts.length > 2) {
            value = parts[0] + '.' + parts.slice(1).join('');
            e.target.value = value;
        }
    });
    
    function applyValue(e) {
        const rawValue = e.target.value.trim();
        
        // Handle empty or invalid input
        if (rawValue === '' || rawValue === '.' || rawValue === '-' || isNaN(parseFloat(rawValue))) {
            const defaultValue = min < 0 ? min : 0;
            e.target.value = defaultValue.toFixed(precision);
            updateSliderFromInput(defaultValue);
            applyDenoiseRules(sliderName, defaultValue);
            return;
        }
        
        // Parse and validate value
        let value = parseFloat(rawValue);
        
        // Clamp value if min/max provided
        if (min !== undefined) value = Math.max(min, value);
        if (max !== undefined) value = Math.min(max, value);
        
        // Format value based on precision
        value = parseFloat(value.toFixed(precision));
        
        // Update the input with the cleaned value
        e.target.value = value.toFixed(precision);
        
        // Update slider and state
        updateSliderFromInput(value);
        
        // Apply denoise rules if this is a denoise input
        applyDenoiseRules(sliderName, value);
    }
    
    function applyDenoiseRules(changedSlider, value) {
        if (!changedSlider.startsWith('denoise')) return;
        
        // Update the config value first
        if (changedSlider === 'denoiseX') config.DENOISE_X = value;
        else if (changedSlider === 'denoiseY') config.DENOISE_Y = value;
        else if (changedSlider === 'denoiseZ') config.DENOISE_Z = value;
        
        const x = config.DENOISE_X;
        const y = config.DENOISE_Y;
        const z = config.DENOISE_Z;
        
        if (changedSlider === 'denoiseX' || changedSlider === 'denoiseY') {
            // Z should sync to max(X, Y)
            const newZ = Math.max(x, y);
            if (newZ !== z) {
                config.DENOISE_Z = newZ;
                const zInput = document.getElementById('denoiseZValue');
                if (zInput) {
                    zInput.value = newZ.toFixed(0);
                    updateSliderFromInput(newZ, 'denoiseZ');
                }
            }
        } else if (changedSlider === 'denoiseZ') {
            // X and Y should not exceed Z
            let updated = false;
            if (x > z) {
                config.DENOISE_X = z;
                const xInput = document.getElementById('denoiseXValue');
                if (xInput) {
                    xInput.value = z.toFixed(0);
                    updateSliderFromInput(z, 'denoiseX');
                }
                updated = true;
            }
            if (y > z) {
                config.DENOISE_Y = z;
                const yInput = document.getElementById('denoiseYValue');
                if (yInput) {
                    yInput.value = z.toFixed(0);
                    updateSliderFromInput(z, 'denoiseY');
                }
                updated = true;
            }
        }
        
        // Save config after all updates
        saveConfig();
    }
    
    // Apply value on blur or when Enter is pressed
    input.addEventListener('blur', applyValue);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.target.blur(); // This will trigger the blur event
        }
    });
}

// Initialize all input fields when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Create a map of all numeric inputs with their configurations
    const inputConfigs = {
        // Audio controls
        audioDelay: { min: 0, max: undefined, updateFn: updateAudioDelay, precision: 0 },
        audioReactivity: { min: 0.1, max: 3.0, updateFn: updateAudioReactivity, precision: 1 },
        audioOpacity: { min: 0, max: 1, updateFn: updateAudioOpacity, precision: 2 },
        audioColorful: { min: 0, max: 1, updateFn: updateAudioColorful, precision: 1 },
        audioEdgeSoftness: { min: 0, max: 1, updateFn: updateAudioEdgeSoftness, precision: 2 },
        
        // Animation controls
        animationInterval: { min: 0, max: 1, updateFn: (v) => updateSliderValue('animationInterval', v/1, false, false), precision: 2 },
        chaos: { min: 0, max: 1, updateFn: (v) => updateSliderValue('chaos', v/1, false, false), precision: 2 },
        breathing: { min: 0, max: 1, updateFn: (v) => updateSliderValue('breathing', v/1, false, false), precision: 2 },
        colorLife: { min: 0, max: 1, updateFn: (v) => updateSliderValue('colorLife', v/1, false, false), precision: 2 },
        
        // Fluid simulation controls
        density: { min: 0, max: 4, updateFn: (v) => updateSliderValue('density', v/4, false, false), precision: 2 },
        velocity: { min: 0, max: 4, updateFn: (v) => updateSliderValue('velocity', v/4, false, false), precision: 2 },
        pressure: { min: 0, max: 1, updateFn: (v) => updateSliderValue('pressure', v/1, false, false), precision: 2 },
        vorticity: { min: 0, max: 50, updateFn: (v) => updateSliderValue('vorticity', v/50, false, false), precision: 0 },
        splat: { min: 0.01, max: 1, updateFn: (v) => updateSliderValue('splat', (v-0.01)/0.99, false, false), precision: 2 },
        
        // Visual effects
        bloomIntensity: { min: 0.1, max: 2, updateFn: (v) => updateSliderValue('bloomIntensity', (v-0.1)/1.9, false, false), precision: 2 },
        sunray: { min: 0.3, max: 1, updateFn: (v) => updateSliderValue('sunray', (v-0.3)/0.7, false, false), precision: 2 },
        backgroundImageScale: { min: 0.1, max: 5, updateFn: (v) => updateSliderValue('backgroundImageScale', (v-0.1)/4.9, false, false), precision: 2 },
        
        // Media controls
        mediaScale: { min: 0.1, max: 2.0, updateFn: (v) => updateSliderValue('mediaScale', (v-0.1)/1.9, false, false), precision: 2 },
        
        // Fluid background controls
        fluidMediaScale: { min: 0.1, max: 2.0, updateFn: updateFluidMediaScale, precision: 2 },
        fluidCameraScale: { min: 0.1, max: 2.0, updateFn: updateFluidCameraScale, precision: 2 },
        
        // ControlNet weights
        controlnetPose: { min: 0, max: 1, updateFn: (v) => updateSliderValue('controlnetPose', v/1, false, false), precision: 2 },
        controlnetHed: { min: 0, max: 1, updateFn: (v) => updateSliderValue('controlnetHed', v/1, false, false), precision: 2 },
        controlnetCanny: { min: 0, max: 1, updateFn: (v) => updateSliderValue('controlnetCanny', v/1, false, false), precision: 2 },
        controlnetDepth: { min: 0, max: 1, updateFn: (v) => updateSliderValue('controlnetDepth', v/1, false, false), precision: 2 },
        controlnetColor: { min: 0, max: 1, updateFn: (v) => updateSliderValue('controlnetColor', v/1, false, false), precision: 2 },
        
        // Denoise XYZ - simple direct config updates
        denoiseX: { min: 1, max: 45, updateFn: (v) => { config.DENOISE_X = v; saveConfig(); }, precision: 0 },
        denoiseY: { min: 1, max: 45, updateFn: (v) => { config.DENOISE_Y = v; saveConfig(); }, precision: 0 },
        denoiseZ: { min: 1, max: 45, updateFn: (v) => { config.DENOISE_Z = v; saveConfig(); }, precision: 0 },
        
        // Generation parameters
        inferenceSteps: { min: 1, max: 150, updateFn: (v) => updateSliderValue('inferenceSteps', (v-1)/149, false, false), precision: 0 },
        seed: { min: -1, max: 2147483647, updateFn: (v) => updateSliderValue('seed', (v+1)/2147483648, false, false), precision: 0 },
        guidanceScale: { min: 1, max: 20, updateFn: (v) => updateSliderValue('guidanceScale', (v-1)/19, false, false), precision: 1 },
        delta: { min: 0, max: 1, updateFn: (v) => updateSliderValue('delta', v/1, false, false), precision: 2 }
    };
    
    // Initialize all inputs
    Object.entries(inputConfigs).forEach(([name, config]) => {
        initializeNumericInput(
            `${name}Value`,
            config.min,
            config.max,
            config.updateFn,
            config.precision
        );
    });
});

function updateAudioOpacity(value, updateInput = true) {
    audioBlobState.opacity = value;
    if (updateInput) {
        document.getElementById('audioOpacityValue').value = value.toFixed(2);
    }
}

function updateStreamOpacity(value, updateInput = true) {
    const iframe = document.getElementById('streamOverlayFrame');
    if (iframe) {
        iframe.style.opacity = value;
    }
    if (updateInput) {
        document.getElementById('streamOpacityValue').value = value.toFixed(2);
    }
}

function updateAudioColorful(value, updateInput = true) {
    audioBlobState.colorful = value;
    if (updateInput) {
        document.getElementById('audioColorfulValue').value = value.toFixed(1);
    }
}

function updateAudioEdgeSoftness(value, updateInput = true) {
    audioBlobState.edgeSoftness = value;
    if (updateInput) {
        document.getElementById('audioEdgeSoftnessValue').value = value.toFixed(2);
    }
}

function updateMediaScale(value, updateInput = true) {
    mediaState.scale = value;
    config.MEDIA_SCALE = value;
    if (updateInput) {
        const inputElement = document.getElementById('mediaScaleValue');
        if (inputElement) {
            inputElement.value = value.toFixed(2);
        }
    }
    console.log(`🎬 Media scale updated: ${value.toFixed(2)}`);
}

function updateFluidMediaScale(value, updateInput = true) {
    fluidBackgroundMedia.scale = value;
    config.FLUID_MEDIA_SCALE = value;
    if (updateInput) {
        const inputElement = document.getElementById('fluidMediaScaleValue');
        if (inputElement) {
            inputElement.value = value.toFixed(2);
        }
    }
    console.log(`🖼️ Fluid media scale updated: ${value.toFixed(2)}`);
}

function updateFluidCameraScale(value, updateInput = true) {
    fluidBackgroundCamera.scale = value;
    config.FLUID_CAMERA_SCALE = value;
    if (updateInput) {
        const inputElement = document.getElementById('fluidCameraScaleValue');
        if (inputElement) {
            inputElement.value = value.toFixed(2);
        }
    }
    console.log(`📷 Fluid camera scale updated: ${value.toFixed(2)}`);
}

function updateAudioBlobColor(color) {
    // Parse hex color to RGB
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16) / 255;
    const g = parseInt(hex.substr(2, 2), 16) / 255;
    const b = parseInt(hex.substr(4, 2), 16) / 255;
    
    // Update both current color and base color
    const newColor = { r, g, b };
    audioBlobState.color = newColor;
    audioBlobState.baseColor = { ...newColor }; // Store as new base color
}

// Add parameter change listeners with debouncing
function initializeStreamParameterListeners() {
    const promptInput = document.getElementById('promptInput');
    const negativePromptInput = document.getElementById('negativePromptInput');
    
    // Debounce function to prevent excessive API calls
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    // Create debounced version of updateStreamParameters
    const debouncedUpdate = debounce(updateStreamParameters, 500);
    
    if (promptInput) {
        // Use debounced input for real-time feel, but not overwhelming
        promptInput.addEventListener('input', debouncedUpdate);
        // Also update on blur/enter for immediate response
        promptInput.addEventListener('blur', updateStreamParameters);
        promptInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                updateStreamParameters();
            }
        });
    }
    
    if (negativePromptInput) {
        negativePromptInput.addEventListener('input', debouncedUpdate);
        negativePromptInput.addEventListener('blur', updateStreamParameters);
        negativePromptInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                updateStreamParameters();
            }
        });
    }
}

// Override the existing updateSliderValue to trigger parameter updates
const originalUpdateSliderValue = updateSliderValue;

// Create a debounced version for slider updates
let sliderUpdateTimeout;
function debouncedSliderParameterUpdate() {
    clearTimeout(sliderUpdateTimeout);
    sliderUpdateTimeout = setTimeout(updateStreamParameters, 200);
}

// Create a global debounced version for parameter updates
let parameterUpdateTimeout;
function debouncedParameterUpdate() {
    clearTimeout(parameterUpdateTimeout);
    parameterUpdateTimeout = setTimeout(updateStreamParametersWithRetry, 300);
}

// Stream validation function
async function validateStreamState() {
    if (!streamState.streamId || !streamState.isStreaming) {
        return false;
    }
    
    try {
        const apiKey = getApiKey();
        if (!apiKey) {
            console.warn('No API key found for stream validation');
            return false;
        }
        
        const response = await fetch(`https://api.daydream.live/beta/streams/${streamState.streamId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });
        
        if (response.ok) {
            console.log('✅ Stream validation successful');
            return true;
        } else if (response.status === 404) {
            console.error('❌ Stream not found - may have expired');
            addDaydreamEventToDebug({
                type: 'stream_validation_failed',
                error: 'Stream not found (404)'
            });
            return false;
        } else {
            console.warn('⚠️ Stream validation failed with status:', response.status);
            return false;
        }
    } catch (error) {
        console.warn('Stream validation error:', error);
        return false;
    }
}

// Retry logic for failed API calls
let retryCount = 0;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

async function updateStreamParametersWithRetry() {
    if (retryCount >= MAX_RETRIES) {
        console.error('❌ Max retries reached for parameter update');
        retryCount = 0;
        return;
    }
    
    try {
        await updateStreamParameters();
        retryCount = 0; // Reset on success
    } catch (error) {
        retryCount++;
        console.warn(`⚠️ Parameter update failed, retrying (${retryCount}/${MAX_RETRIES}):`, error);
        
        if (retryCount < MAX_RETRIES) {
            setTimeout(() => {
                updateStreamParametersWithRetry();
            }, RETRY_DELAY * retryCount); // Exponential backoff
        } else {
            console.error('❌ All retry attempts failed');
            retryCount = 0;
        }
    }
}

updateSliderValue = function(sliderName, percentage) {
    originalUpdateSliderValue(sliderName, percentage);
    
    // Handle denoise slider synchronization
    if (['denoiseX', 'denoiseY', 'denoiseZ'].includes(sliderName)) {
        syncDenoiseSliders(sliderName, true);
    }
    
    // Trigger parameter update for StreamDiffusion sliders with debouncing
    if (['denoiseX', 'denoiseY', 'denoiseZ', 'inferenceSteps', 'seed', 'controlnetPose', 'controlnetHed', 'controlnetCanny', 'controlnetDepth', 'controlnetColor', 'guidanceScale', 'delta'].includes(sliderName)) {
        debouncedSliderParameterUpdate();
    }
};



function syncDenoiseSliders(changedSlider, fromSlider = true) {
    // Skip sync if not from slider interaction
    if (!fromSlider) return;

    const x = config.DENOISE_X;
    const y = config.DENOISE_Y;
    const z = config.DENOISE_Z;
    
    if (changedSlider === 'denoiseX' || changedSlider === 'denoiseY') {
        // Z should sync to max(X, Y)
        const newZ = Math.max(x, y);
        if (newZ !== z) {
            config.DENOISE_Z = newZ;
            updateSliderPosition('denoiseZ');
        }
    } else if (changedSlider === 'denoiseZ') {
        // If Z goes below X or Y, they should follow Z down
        let updated = false;
        if (z < x) {
            config.DENOISE_X = z;
            updateSliderPosition('denoiseX');
            updated = true;
        }
        if (z < y) {
            config.DENOISE_Y = z;
            updateSliderPosition('denoiseY');
            updated = true;
        }
    }
}

function updateSliderPosition(sliderName) {
    const sliderMap = {
        'denoiseX': { prop: 'DENOISE_X', min: 0, max: 45 },
        'denoiseY': { prop: 'DENOISE_Y', min: 0, max: 45 },
        'denoiseZ': { prop: 'DENOISE_Z', min: 0, max: 45 }
    };
    
    const slider = sliderMap[sliderName];
    if (!slider) return;
    
    const percentage = (config[slider.prop] - slider.min) / (slider.max - slider.min);
    const fill = document.getElementById(sliderName + 'Fill');
    const valueDisplay = document.getElementById(sliderName + 'Value');
    
    if (fill) fill.style.width = (percentage * 100) + '%';
    if (valueDisplay) valueDisplay.textContent = Math.round(config[slider.prop]);
}

// Local Storage Management
const STORAGE_PREFIX = 'fluidSim_';
const STORAGE_KEYS = {
    CONFIG: STORAGE_PREFIX + 'config',
    API_KEY: STORAGE_PREFIX + 'apiKey',
    PROMPTS: STORAGE_PREFIX + 'prompts',
    API_KEY_CONSENT: STORAGE_PREFIX + 'apiKeyConsent',
    STREAM_STATE: STORAGE_PREFIX + 'streamState',
    TELEGRAM_SETTINGS: STORAGE_PREFIX + 'telegramSettings',
    TELEGRAM_TOKEN: STORAGE_PREFIX + 'telegramToken',
    TELEGRAM_TOKEN_CONSENT: STORAGE_PREFIX + 'telegramTokenConsent',
    WELCOME_SKIPPED: STORAGE_PREFIX + 'welcomeSkipped'
};

function isLocalStorageAvailable() {
    try {
        const test = 'test';
        localStorage.setItem(test, test);
        localStorage.removeItem(test);
        return true;
    } catch (e) {
        return false;
    }
}

function saveToLocalStorage(key, value) {
    if (!isLocalStorageAvailable()) return false;
    
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (e) {
        console.warn('Failed to save to localStorage:', e);
        return false;
    }
}

function loadFromLocalStorage(key, defaultValue = null) {
    if (!isLocalStorageAvailable()) return defaultValue;
    
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
        console.warn('Failed to load from localStorage:', e);
        return defaultValue;
    }
}

function clearLocalStorage() {
    if (!isLocalStorageAvailable()) return;
    
    Object.values(STORAGE_KEYS).forEach(key => {
        localStorage.removeItem(key);
    });
}

// Stream State Persistence Functions
function saveStreamState() {
    if (!streamState.streamId || !streamState.playbackId) return;
    
    const streamData = {
        streamId: streamState.streamId,
        playbackId: streamState.playbackId,
        whipUrl: streamState.whipUrl,
        timestamp: Date.now()
    };
    
    saveToLocalStorage(STORAGE_KEYS.STREAM_STATE, streamData);
}

// Validate if a saved stream is still active on the server
async function validateSavedStream(savedStream) {
    if (!savedStream || !savedStream.streamId) return false;
    
    try {
        const apiKey = getApiKey();
        if (!apiKey) return false;
        
        // Check if stream still exists on Daydream servers
        const response = await fetch(`https://api.daydream.live/beta/streams/${savedStream.streamId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const streamData = await response.json();
            // Check if stream is in a valid state (not ended or failed)
            const validStates = ['created', 'running', 'ready'];
            return validStates.includes(streamData.status);
        } else if (response.status === 404) {
            // Stream no longer exists on server - clear saved state
            console.log(`Stream ${savedStream.streamId} no longer exists (404), clearing saved state`);
            clearStreamState();
            return false;
        }
        
        return false;
    } catch (error) {
        console.log('Stream validation failed:', error.message);
        return false;
    }
}

function loadStreamState() {
    const savedStream = loadFromLocalStorage(STORAGE_KEYS.STREAM_STATE);
    if (!savedStream) return null;
    
    // Validate stream data structure
    if (!savedStream.streamId || !savedStream.playbackId || !savedStream.whipUrl) {
        clearStreamState();
        return null;
    }
    
    // Check if stream is too old (expire after 24 hours)
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    const age = Date.now() - (savedStream.timestamp || 0);
    
    if (age > maxAge) {
        console.log('Saved stream expired, clearing...');
        clearStreamState();
        return null;
    }
    
    return savedStream;
}

function clearStreamState() {
    if (!isLocalStorageAvailable()) return;
    localStorage.removeItem(STORAGE_KEYS.STREAM_STATE);
}

// Enhanced obfuscation for API key (browser-safe method)
const HARDCODED_OBFUSCATED_API_KEY = "amlYVjpWbkQ5OTM5Z1ZXVEh0dFhLQ1hRaXtPe2NUMkxyVHNaNXt1Q3ZqeFRCbG9XM3BHe3QyODpvOEJ5MntFa2BsdA==";
const HARDCODED_OBFUSCATED_TELEGRAM_TOKEN = "OTZ2SE9lWmpqQld4Z3NONDRVWmRUVzoxT1RlQkhgRElHQkI7MTEyOjYxMjkzOQ==";

// Enhanced obfuscation encoding function (for generating obfuscated keys)
function encodeApiKey(apiKey) {
    // Simple but effective multi-layer obfuscation
    // Layer 1: Reverse the string
    let encoded = apiKey.split('').reverse().join('');
    
    // Layer 2: Character code shift (safe range)
    encoded = encoded.split('').map(char => {
        let code = char.charCodeAt(0);
        // Shift by 1 to stay in safe ASCII range
        return String.fromCharCode(code + 1);
    }).join('');
    
    // Layer 3: Base64 encode
    return btoa(encoded);
}

// Enhanced obfuscation decoding function
function decodeApiKey(obfuscatedKey) {
    try {
        // Layer 3: Base64 decode
        let decoded = atob(obfuscatedKey);
        
        // Layer 2: Character code shift (reverse)
        decoded = decoded.split('').map(char => {
            let code = char.charCodeAt(0);
            // Reverse the shift
            return String.fromCharCode(code - 1);
        }).join('');
        
        // Layer 1: Reverse the string
        return decoded.split('').reverse().join('');
    } catch (error) {
        console.error('Failed to decode API key:', error);
        return null;
    }
}

// Simple obfuscation for localStorage (keeping for backward compatibility)
function obfuscateApiKey(key) {
    return btoa(key.split('').reverse().join(''));
}

function deobfuscateApiKey(obfuscated) {
    try {
        return atob(obfuscated).split('').reverse().join('');
    } catch (e) {
        return '';
    }
}

function saveConfig() {
    const configToSave = {
        DENSITY_DISSIPATION: config.DENSITY_DISSIPATION,
        VELOCITY_DISSIPATION: config.VELOCITY_DISSIPATION,
        PRESSURE: config.PRESSURE,
        CURL: config.CURL,
        SPLAT_RADIUS: config.SPLAT_RADIUS,
        BLOOM_INTENSITY: config.BLOOM_INTENSITY,
        SUNRAYS_WEIGHT: config.SUNRAYS_WEIGHT,
        INFERENCE_STEPS: config.INFERENCE_STEPS,
        SEED: config.SEED,
        CONTROLNET_POSE_SCALE: config.CONTROLNET_POSE_SCALE,
        CONTROLNET_HED_SCALE: config.CONTROLNET_HED_SCALE,
        CONTROLNET_CANNY_SCALE: config.CONTROLNET_CANNY_SCALE,
        CONTROLNET_DEPTH_SCALE: config.CONTROLNET_DEPTH_SCALE,
        CONTROLNET_COLOR_SCALE: config.CONTROLNET_COLOR_SCALE,
        GUIDANCE_SCALE: config.GUIDANCE_SCALE,
        DELTA: config.DELTA,
        DENOISE_X: config.DENOISE_X,
        DENOISE_Y: config.DENOISE_Y,
        DENOISE_Z: config.DENOISE_Z,
        COLORFUL: config.COLORFUL,
        PAUSED: config.PAUSED,
        ANIMATE: config.ANIMATE,
        LIVELINESS: config.LIVELINESS,
        CHAOS: config.CHAOS,
        BREATHING: config.BREATHING,
        COLOR_LIFE: config.COLOR_LIFE,
        ANIMATION_INTERVAL: config.ANIMATION_INTERVAL,
        BACKGROUND_IMAGE_SCALE: config.BACKGROUND_IMAGE_SCALE,
        BLOOM: config.BLOOM,
        SUNRAYS: config.SUNRAYS,
        STATIC_COLOR: config.STATIC_COLOR,
        BACK_COLOR: config.BACK_COLOR
    };
    
    saveToLocalStorage(STORAGE_KEYS.CONFIG, configToSave);
}

function loadConfig() {
    const savedConfig = loadFromLocalStorage(STORAGE_KEYS.CONFIG);
    if (savedConfig) {
        Object.keys(savedConfig).forEach(key => {
            if (config.hasOwnProperty(key)) {
                config[key] = savedConfig[key];
            }
        });
    }
}

function savePrompts() {
    const promptInput = document.getElementById('promptInput');
    const negativePromptInput = document.getElementById('negativePromptInput');
    
    if (promptInput && negativePromptInput) {
        const prompts = {
            prompt: promptInput.value,
            negativePrompt: negativePromptInput.value
        };
        saveToLocalStorage(STORAGE_KEYS.PROMPTS, prompts);
    }
}

function loadPrompts() {
    const savedPrompts = loadFromLocalStorage(STORAGE_KEYS.PROMPTS);
    const promptInput = document.getElementById('promptInput');
    const negativePromptInput = document.getElementById('negativePromptInput');
    
    console.log('🔄 Loading prompts:', { savedPrompts, promptInput: !!promptInput, negativePromptInput: !!negativePromptInput });
    
    if (savedPrompts) {
        // Load saved prompts
        if (promptInput && savedPrompts.prompt) {
            promptInput.value = savedPrompts.prompt;
            console.log('✅ Loaded saved prompt:', savedPrompts.prompt);
        }
        if (negativePromptInput && savedPrompts.negativePrompt) {
            negativePromptInput.value = savedPrompts.negativePrompt;
            console.log('✅ Loaded saved negative prompt:', savedPrompts.negativePrompt);
        }
    } else {
        // Set default values if no saved prompts AND no current value
        if (promptInput && !promptInput.value.trim()) {
            promptInput.value = 'blooming flower with delicate petals, vibrant colors, soft natural lighting, botanical beauty, detailed macro photography, spring garden atmosphere';
            console.log('✅ Set default prompt: blooming flower');
        } else if (promptInput && promptInput.value.trim()) {
            console.log('🔄 Skipping default prompt - current value exists:', promptInput.value.substring(0, 50) + '...');
        }
        if (negativePromptInput && !negativePromptInput.value.trim()) {
            negativePromptInput.value = 'blurry, low quality, flat, 2d';
            console.log('✅ Set default negative prompt');
        }
    }
}

function saveTelegramSettings() {
    const telegramSettings = {
        TELEGRAM_RECEIVE: config.TELEGRAM_RECEIVE,
        TELEGRAM_WAITLIST_INTERVAL: config.TELEGRAM_WAITLIST_INTERVAL
    };
    saveToLocalStorage(STORAGE_KEYS.TELEGRAM_SETTINGS, telegramSettings);
    console.log('💾 Saved Telegram settings:', telegramSettings);
}

function loadTelegramSettings() {
    const savedSettings = loadFromLocalStorage(STORAGE_KEYS.TELEGRAM_SETTINGS);
    
    if (savedSettings) {
        // Load saved settings
        config.TELEGRAM_RECEIVE = savedSettings.TELEGRAM_RECEIVE !== undefined ? savedSettings.TELEGRAM_RECEIVE : true;
        // Force waitlist interval to 1 second regardless of saved settings
        config.TELEGRAM_WAITLIST_INTERVAL = 1;
        console.log('✅ Loaded Telegram settings:', savedSettings);
        console.log('🔄 Forced waitlist interval to 1 second');
    } else {
        // Set defaults
        config.TELEGRAM_RECEIVE = true;
        config.TELEGRAM_WAITLIST_INTERVAL = 1;
        console.log('✅ Set default Telegram settings: enabled, 1s interval');
    }
    
    // Update the UI toggle to match the loaded state
    updateToggle('telegramReceiveToggle', config.TELEGRAM_RECEIVE);
    
    // Update controls visibility
    updateTelegramControlsVisibility();
    
    // Update slider position to match loaded interval value
    updateSliderPositions();
    
    // Interval will be synced when WebSocket connects
}

function saveApiKey() {
    const apiKeyInput = document.getElementById('apiKeyInput');
    const consentCheckbox = document.getElementById('apiKeyConsent');

    if (apiKeyInput && consentCheckbox && consentCheckbox.checked) {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            saveToLocalStorage(STORAGE_KEYS.API_KEY, obfuscateApiKey(apiKey));
            saveToLocalStorage(STORAGE_KEYS.API_KEY_CONSENT, true);
        }
    }
    
    // Update API instructions visibility
    updateApiInstructions();
}

function getApiKey() {
    const consent = loadFromLocalStorage(STORAGE_KEYS.API_KEY_CONSENT, false);
    if (consent) {
        const savedKey = loadFromLocalStorage(STORAGE_KEYS.API_KEY);
        if (savedKey) {
            return deobfuscateApiKey(savedKey);
        }
    }
    
    // Fallback to hardcoded obfuscated API key
    const hardcodedKey = decodeApiKey(HARDCODED_OBFUSCATED_API_KEY);
    if (hardcodedKey) {
        console.log('Using hardcoded API key');
        return hardcodedKey;
    }
    
    return null;
}

function setWelcomeSkipped() {
    saveToLocalStorage(STORAGE_KEYS.WELCOME_SKIPPED, true);
}

function getWelcomeSkipped() {
    return loadFromLocalStorage(STORAGE_KEYS.WELCOME_SKIPPED, false);
}

function loadApiKey() {
    const consent = loadFromLocalStorage(STORAGE_KEYS.API_KEY_CONSENT, false);
    if (consent) {
        const savedKey = loadFromLocalStorage(STORAGE_KEYS.API_KEY);
        if (savedKey) {
            const apiKeyInput = document.getElementById('apiKeyInput');
            const consentCheckbox = document.getElementById('apiKeyConsent');
            
            if (apiKeyInput) {
                apiKeyInput.value = deobfuscateApiKey(savedKey);
            }
            if (consentCheckbox) {
                consentCheckbox.checked = true;
            }
        }
    }
    
    // Update API instructions visibility
    updateApiInstructions();
}

function updateApiInstructions() {
    const apiKeyInput = document.getElementById('apiKeyInput');
    const apiInstructions = document.getElementById('apiInstructions');
    
    if (apiKeyInput && apiInstructions) {
        const hasApiKey = apiKeyInput.value.trim().length > 0;
        apiInstructions.style.display = hasApiKey ? 'none' : 'block';
    }
}

function saveTelegramToken() {
    const tokenInput = document.getElementById('telegramTokenInput');
    const consentCheckbox = document.getElementById('telegramTokenConsent');

    if (tokenInput && consentCheckbox && consentCheckbox.checked) {
        const token = tokenInput.value.trim();
        if (token) {
            saveToLocalStorage(STORAGE_KEYS.TELEGRAM_TOKEN, obfuscateApiKey(token));
            saveToLocalStorage(STORAGE_KEYS.TELEGRAM_TOKEN_CONSENT, true);
            
            // Add to debug log
            addTelegramMessageToDebug({
                type: 'telegram_token_updated'
            });
            
            // Send token to server
            if (typeof sendToServer === 'function') {
                sendToServer({
                    type: 'telegram_token_updated',
                    token: token
                });
                console.log('📱 Sent Telegram token to server');
            }
        }
    } else {
        // Clear token if consent is not checked
        saveToLocalStorage(STORAGE_KEYS.TELEGRAM_TOKEN, '');
        saveToLocalStorage(STORAGE_KEYS.TELEGRAM_TOKEN_CONSENT, false);
        
        // Send empty token to server
        if (typeof sendToServer === 'function') {
            sendToServer({
                type: 'telegram_token_updated',
                token: ''
            });
            console.log('📱 Cleared Telegram token on server');
        }
    }
}

function getTelegramToken() {
    const consent = loadFromLocalStorage(STORAGE_KEYS.TELEGRAM_TOKEN_CONSENT, false);
    if (consent) {
        const savedToken = loadFromLocalStorage(STORAGE_KEYS.TELEGRAM_TOKEN);
        if (savedToken) {
            return deobfuscateApiKey(savedToken);
        }
    }
    
    // Fallback to hardcoded obfuscated Telegram token
    const hardcodedToken = decodeApiKey(HARDCODED_OBFUSCATED_TELEGRAM_TOKEN);
    if (hardcodedToken) {
        console.log('Using hardcoded Telegram token');
        return hardcodedToken;
    }
    
    return null;
}

// Get effective Telegram token (user token if available, otherwise hardcoded)
function getEffectiveTelegramToken() {
    // First check if user has provided a token in the input field
    const tokenInput = document.getElementById('telegramTokenInput');
    if (tokenInput && tokenInput.value.trim()) {
        return tokenInput.value.trim();
    }
    
    // Fallback to stored user token or hardcoded token
    return getTelegramToken();
}

function loadTelegramToken() {
    const consent = loadFromLocalStorage(STORAGE_KEYS.TELEGRAM_TOKEN_CONSENT, false);
    if (consent) {
        const savedToken = loadFromLocalStorage(STORAGE_KEYS.TELEGRAM_TOKEN);
        if (savedToken) {
            const tokenInput = document.getElementById('telegramTokenInput');
            const consentCheckbox = document.getElementById('telegramTokenConsent');
            
            if (tokenInput) {
                const deobfuscatedToken = deobfuscateApiKey(savedToken);
                tokenInput.value = deobfuscatedToken;
                
                // Fetch bot username for the loaded token
                console.log('📱 Loading saved token, fetching bot username...');
                fetchAndStoreBotUsername(deobfuscatedToken);
            }
            if (consentCheckbox) {
                consentCheckbox.checked = true;
            }
            
            // Token will be sent automatically when WebSocket connects via sendStoredTelegramTokenToServer()
        }
    }
}

function sendStoredTelegramTokenToServer() {
    if (oscWebSocket && oscWebSocket.readyState === WebSocket.OPEN) {
        // Send stored token if available
        const consent = loadFromLocalStorage(STORAGE_KEYS.TELEGRAM_TOKEN_CONSENT, false);
        if (consent) {
            const savedToken = loadFromLocalStorage(STORAGE_KEYS.TELEGRAM_TOKEN);
            if (savedToken) {
                const decodedToken = deobfuscateApiKey(savedToken);
                sendToServer({
                    type: 'telegram_token_updated',
                    token: decodedToken
                });
                console.log('📱 Sent stored Telegram token to server after WebSocket connection');
            }
        }
        
        // Also sync the waitlist interval
        if (config.TELEGRAM_WAITLIST_INTERVAL) {
            sendToServer({
                type: 'telegram_waitlist_interval_changed',
                interval: config.TELEGRAM_WAITLIST_INTERVAL
            });
            console.log(`📱 Synced waitlist interval with server: ${config.TELEGRAM_WAITLIST_INTERVAL}s`);
        }
    }
}

// Video maximize function
function maximizeVideo() {
    const video = document.querySelector('.welcome-teaser-video');
    if (video) {
        if (video.requestFullscreen) {
            video.requestFullscreen();
        } else if (video.webkitRequestFullscreen) {
            video.webkitRequestFullscreen();
        } else if (video.msRequestFullscreen) {
            video.msRequestFullscreen();
        } else if (video.mozRequestFullScreen) {
            video.mozRequestFullScreen();
        }
    }
}

// Advanced Setup Overlay Functions
function showAdvancedSetup() {
    const overlay = document.getElementById('advancedSetupOverlay');
    const mainOverlay = document.getElementById('welcomeOverlay');
    if (overlay) {
        overlay.style.display = 'flex';
        // Hide main welcome overlay so fluids are visible
        if (mainOverlay) {
            mainOverlay.style.display = 'none';
        }
    }
}

function hideAdvancedSetup() {
    const overlay = document.getElementById('advancedSetupOverlay');
    const mainOverlay = document.getElementById('welcomeOverlay');
    if (overlay) {
        overlay.style.display = 'none';
        // Show main welcome overlay again
        if (mainOverlay) {
            mainOverlay.style.display = 'flex';
        }
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        // Show feedback
        const button = event.target;
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        button.style.background = 'rgba(34, 197, 94, 0.3)';
        button.style.borderColor = 'rgba(34, 197, 94, 0.5)';
        button.style.color = '#22c55e';
        
        setTimeout(() => {
            button.textContent = originalText;
            button.style.background = 'rgba(6, 163, 215, 0.2)';
            button.style.borderColor = 'rgba(6, 163, 215, 0.3)';
            button.style.color = '#06a3d7';
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy text: ', err);
    });
}

function saveAdvancedSetup() {
    const telegramToken = document.getElementById('advancedTelegramToken')?.value.trim();
    const telegramConsent = document.getElementById('advancedTelegramConsent')?.checked;
    
    if (telegramToken && telegramConsent) {
        // Save Telegram settings
        const mainTelegramInput = document.getElementById('telegramTokenInput');
        const mainTelegramConsent = document.getElementById('telegramKeyConsent');
        
        if (mainTelegramInput) {
            mainTelegramInput.value = telegramToken;
        }
        if (mainTelegramConsent) {
            mainTelegramConsent.checked = true;
        }
        
        // Trigger validation
        if (typeof validateTelegramBotToken === 'function') {
            validateTelegramBotToken(telegramToken);
        }
    }
    
    // Close advanced setup and main welcome overlay
    hideAdvancedSetup();
    hideWelcomeOverlay();
}

// Update feature status indicators
function updateFeatureStatuses() {
    // Telegram status
    const telegramStatus = document.getElementById('telegram-status');
    const telegramStatusText = document.getElementById('telegram-status-text');
    if (telegramStatus && telegramStatusText) {
        const effectiveToken = getEffectiveTelegramToken();
        if (effectiveToken) {
            telegramStatus.className = 'status-indicator active';
            telegramStatusText.textContent = 'Connected';
        } else {
            telegramStatus.className = 'status-indicator warning';
            telegramStatusText.textContent = 'Connect Now';
        }
    }

    // OSC status
    const oscStatus = document.getElementById('osc-status');
    const oscStatusText = document.getElementById('osc-status-text');
    if (oscStatus && oscStatusText) {
        if (config.DEBUG_MODE) {
            oscStatus.className = 'status-indicator active';
            oscStatusText.textContent = 'Enabled';
        } else {
            oscStatus.className = 'status-indicator';
            oscStatusText.textContent = 'Enable';
        }
    }

    // Media status
    const mediaStatus = document.getElementById('media-status');
    const mediaStatusText = document.getElementById('media-status-text');
    if (mediaStatus && mediaStatusText) {
        if (backgroundMedia.loaded) {
            mediaStatus.className = 'status-indicator active';
            mediaStatusText.textContent = 'Active';
        } else {
            mediaStatus.className = 'status-indicator';
            mediaStatusText.textContent = 'Upload Media';
        }
    }

    // Camera status
    const cameraStatus = document.getElementById('camera-status');
    const cameraStatusText = document.getElementById('camera-status-text');
    if (cameraStatus && cameraStatusText) {
        if (cameraState.isActive) {
            cameraStatus.className = 'status-indicator active';
            cameraStatusText.textContent = 'Live';
        } else {
            cameraStatus.className = 'status-indicator';
            cameraStatusText.textContent = 'Start Camera';
        }
    }
}

// Welcome overlay functions
function showWelcomeOverlay() {
    const overlay = document.getElementById('welcomeOverlay');
    if (overlay) {
        // Check if API key is already saved and show it obfuscated
        const savedApiKey = getApiKey();
        const apiKeyInput = document.getElementById('welcomeApiKey');
        const consentCheckbox = document.getElementById('welcomeApiConsent');
        const startButton = document.getElementById('welcomeStartButton');
        const apiSection = document.querySelector('.welcome-api-section h3');
        const apiDescription = document.querySelector('.welcome-api-section p');
        
        if (savedApiKey) {
            // Update content for existing users
            if (apiSection) {
                apiSection.textContent = '🔑 Your API Key';
            }
            if (apiDescription) {
                apiDescription.style.display = 'none';
            }
            if (startButton) {
                startButton.textContent = 'Continue';
            }
            
            // Show obfuscated version: show first 3 chars + dots + last 4 chars
            if (apiKeyInput) {
                const obfuscated = savedApiKey.substring(0, 3) + '•'.repeat(20) + savedApiKey.substring(savedApiKey.length - 4);
                apiKeyInput.value = obfuscated;
                apiKeyInput.setAttribute('data-original', savedApiKey);
            }
            if (consentCheckbox) {
                consentCheckbox.checked = true;
            }
        } else {
            // Reset content for new users
            if (apiSection) {
                apiSection.textContent = '🔑 Your API Key';
            }
            if (apiDescription) {
                apiDescription.style.display = 'none';
            }
            if (startButton) {
                startButton.textContent = 'Start Creating';
            }
            if (apiKeyInput) {
                apiKeyInput.value = '';
                apiKeyInput.removeAttribute('data-original');
            }
            if (consentCheckbox) {
                consentCheckbox.checked = false;
            }
        }
        
        overlay.style.display = 'flex';
    }
}

function hideWelcomeOverlay() {
    const overlay = document.getElementById('welcomeOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

function saveWelcomeApiKey() {
    const apiKeyInput = document.getElementById('welcomeApiKey');
    const consentCheckbox = document.getElementById('welcomeApiConsent');
    
    if (apiKeyInput && consentCheckbox && consentCheckbox.checked) {
        let apiKey = apiKeyInput.value.trim();
        
        // If the input contains the obfuscated version, use the original
        const originalKey = apiKeyInput.getAttribute('data-original');
        if (originalKey && apiKey.includes('•')) {
            apiKey = originalKey;
        }
        
        if (apiKey) {
            // Save to localStorage
            saveToLocalStorage(STORAGE_KEYS.API_KEY, obfuscateApiKey(apiKey));
            saveToLocalStorage(STORAGE_KEYS.API_KEY_CONSENT, true);
            
            // Also update the main API key input if it exists
            const mainApiKeyInput = document.getElementById('apiKeyInput');
            const mainConsentCheckbox = document.getElementById('apiKeyConsent');
            
            if (mainApiKeyInput) {
                mainApiKeyInput.value = apiKey;
            }
            if (mainConsentCheckbox) {
                mainConsentCheckbox.checked = true;
            }
            
            return true;
        }
    }
    return false;
}

function initializeWelcomeOverlay() {
    // Check if API key is already saved or if welcome was previously skipped
    const savedApiKey = getApiKey();
    const welcomeSkipped = getWelcomeSkipped();
    
    if (!savedApiKey && !welcomeSkipped) {
        // No API key saved and welcome not skipped, show welcome overlay
        showWelcomeOverlay();
    }
    
    // Initialize feature status indicators
    updateFeatureStatuses();
    
    // Set up event listeners
    const startButton = document.getElementById('welcomeStartButton');
    if (startButton) {
        startButton.addEventListener('click', function() {
            // Save API key if provided and consent is checked
            saveWelcomeApiKey();
            
            // If no API key was provided, mark welcome as skipped
            const apiKeyInput = document.getElementById('welcomeApiKey');
            if (apiKeyInput && !apiKeyInput.value.trim()) {
                setWelcomeSkipped();
            }
            
            // Hide overlay regardless of whether API key was saved
            hideWelcomeOverlay();
        });
    }
    
    // Allow Enter key to trigger start button and handle obfuscated key clearing
    const apiKeyInput = document.getElementById('welcomeApiKey');
    if (apiKeyInput) {
        apiKeyInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                startButton.click();
            }
        });
        
        // Clear obfuscated key when user starts typing
        apiKeyInput.addEventListener('focus', function() {
            if (this.value.includes('•')) {
                this.value = '';
                this.removeAttribute('data-original');
            }
        });
        
        // Clear obfuscated key on first keypress
        apiKeyInput.addEventListener('input', function() {
            if (this.getAttribute('data-original') && !this.value.includes('•')) {
                this.removeAttribute('data-original');
            }
        });
    }
}

function resetValues() {
    if (confirm('Are you sure you want to reset all slider values to defaults? This will not affect your prompt, API key, Telegram settings, or other input fields.')) {
        // Store current telegram settings to preserve them
        const currentTelegramReceive = config.TELEGRAM_RECEIVE;
        const currentTelegramInterval = config.TELEGRAM_WAITLIST_INTERVAL;
        
        // Reset config values to defaults (keeping input fields and telegram settings unchanged)
        config.DENSITY_DISSIPATION = 0.15;
        config.VELOCITY_DISSIPATION = 0.6;
        config.PRESSURE = 0.37;
        config.CURL = 4;
        config.SPLAT_RADIUS = 0.19;
        config.BLOOM_INTENSITY = 0.4;
        config.SUNRAYS_WEIGHT = 0.4;
        config.INFERENCE_STEPS = 50;
        config.SEED = 42;
        config.CONTROLNET_POSE_SCALE = 0.65;
        config.CONTROLNET_HED_SCALE = 0.41;
        config.CONTROLNET_CANNY_SCALE = 0.00;
        config.CONTROLNET_DEPTH_SCALE = 0.21;
        config.CONTROLNET_COLOR_SCALE = 0.26;
        config.GUIDANCE_SCALE = 7.5;
        config.DELTA = 0.5;
        config.DENOISE_X = 3;
        config.DENOISE_Y = 6;
        config.DENOISE_Z = 6;
        config.COLORFUL = false;
        config.PAUSED = false;
        config.ANIMATE = true;
        config.CHAOS = 0.73;
        config.BREATHING = 0.5;
        config.COLOR_LIFE = 0.22;
        config.ANIMATION_INTERVAL = 0.1;
        config.BLOOM = true;
        config.SUNRAYS = true;
        config.STATIC_COLOR = { r: 0, g: 0.831, b: 1 }; // Default cyan color
        config.BACK_COLOR = { r: 0, g: 0, b: 0 }; // Default black background
        
        // Restore telegram settings
        config.TELEGRAM_RECEIVE = currentTelegramReceive;
        config.TELEGRAM_WAITLIST_INTERVAL = currentTelegramInterval;
        
        // Update UI to reflect new values
        updateSliderPositions();
        updateToggleStates();
        initializeColorPickers();
        
        // Clear background image and camera
        clearAllBackground();
        
        // Save the reset values to localStorage
        saveConfig();
    }
}

function reloadAndClearCache() {
    console.log('🔄 Reloading page and clearing cache...');
    
    // Clear localStorage (optional - user might want to keep some settings)
    // localStorage.clear();
    
    // Clear sessionStorage
    sessionStorage.clear();
    
    // Clear IndexedDB if it exists
    if ('indexedDB' in window) {
        indexedDB.databases().then(databases => {
            databases.forEach(db => {
                indexedDB.deleteDatabase(db.name);
            });
        }).catch(err => {
            console.log('IndexedDB clear failed:', err);
        });
    }
    
    // Clear service worker cache if running as PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
            registrations.forEach(registration => {
                registration.unregister().then(() => {
                    console.log('Service worker unregistered');
                });
            });
        });
    }
    
    // Clear browser cache using cache API
    if ('caches' in window) {
        caches.keys().then(cacheNames => {
            cacheNames.forEach(cacheName => {
                caches.delete(cacheName);
            });
        });
    }
    
    // Force reload with cache bypass
    setTimeout(() => {
        // Use location.reload(true) for hard reload, or window.location.href for PWA
        if (window.matchMedia('(display-mode: standalone)').matches || 
            window.navigator.standalone === true) {
            // Running as PWA - use href to ensure proper reload
            window.location.href = window.location.href;
        } else {
            // Regular browser - use reload with cache bypass
            window.location.reload(true);
        }
    }, 100);
}

async function pasteFromClipboard(inputId) {
    const input = document.getElementById(inputId);
    if (!input) {
        console.error('Input element not found:', inputId);
        return;
    }

    // Check if we're on Safari (including iPad)
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent) || 
                     /iPad|iPhone|iPod/.test(navigator.userAgent);
    
    try {
        // Try modern clipboard API first
        if (navigator.clipboard && navigator.clipboard.readText) {
            const text = await navigator.clipboard.readText();
            input.value = text;
            
            // Trigger input event to update any listeners
            input.dispatchEvent(new Event('input', { bubbles: true }));
            
            // Trigger auto-resize if it's a textarea
            if (input.tagName === 'TEXTAREA') {
                input.style.height = 'auto';
                input.style.height = input.scrollHeight + 'px';
            }
            
            console.log('✅ Text pasted from clipboard');
            
            // Add visual feedback
            const button = document.getElementById('pastePromptButton');
            if (button) {
                const originalIcon = button.innerHTML;
                button.innerHTML = '<i class="fas fa-check"></i>';
                button.style.background = 'rgba(34, 197, 94, 0.2)';
                button.style.borderColor = '#22c55e';
                
                setTimeout(() => {
                    button.innerHTML = originalIcon;
                    button.style.background = '';
                    button.style.borderColor = '';
                }, 1000);
            }
            
        } else {
            // Enhanced fallback for Safari iPad and older browsers
            console.log('Clipboard API not available, trying fallback method');
            
            if (isSafari) {
                // Safari-specific fallback: create a temporary input field
                const tempInput = document.createElement('input');
                tempInput.type = 'text';
                tempInput.style.position = 'fixed';
                tempInput.style.top = '-1000px';
                tempInput.style.left = '-1000px';
                tempInput.style.opacity = '0';
                tempInput.style.pointerEvents = 'none';
                document.body.appendChild(tempInput);
                
                // Focus and select the temp input
                tempInput.focus();
                tempInput.select();
                
                // Try to paste using execCommand
                try {
                    const success = document.execCommand('paste');
                    if (success && tempInput.value) {
                        input.value = tempInput.value;
                        
                        // Trigger input event to update any listeners
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        
                        // Trigger auto-resize if it's a textarea
                        if (input.tagName === 'TEXTAREA') {
                            input.style.height = 'auto';
                            input.style.height = input.scrollHeight + 'px';
                        }
                        
                        console.log('✅ Text pasted using Safari fallback');
                        
                        // Add visual feedback
                        const button = document.getElementById('pastePromptButton');
                        if (button) {
                            const originalIcon = button.innerHTML;
                            button.innerHTML = '<i class="fas fa-check"></i>';
                            button.style.background = 'rgba(34, 197, 94, 0.2)';
                            button.style.borderColor = '#22c55e';
                            
                            setTimeout(() => {
                                button.innerHTML = originalIcon;
                                button.style.background = '';
                                button.style.borderColor = '';
                            }, 1000);
                        }
                    } else {
                        throw new Error('Safari fallback failed');
                    }
                } catch (fallbackErr) {
                    console.error('Safari fallback failed:', fallbackErr);
                    alert('Please use the standard paste gesture (Cmd+V on iPad) to paste text into the field.');
                } finally {
                    document.body.removeChild(tempInput);
                }
            } else {
                alert('Clipboard API not supported in this browser. Please use Ctrl+V to paste.');
            }
        }
    } catch (err) {
        console.error('Failed to read clipboard:', err);
        
        // Show user-friendly error message
        if (err.name === 'NotAllowedError') {
            if (isSafari) {
                alert('Clipboard access requires user permission. Please allow clipboard access in Safari settings, or use Cmd+V to paste manually.');
            } else {
                alert('Clipboard access denied. Please allow clipboard permissions and try again.');
            }
        } else if (err.name === 'NotSupportedError') {
            alert('Clipboard access not supported. Please use Cmd+V (Mac) or Ctrl+V (Windows) to paste manually.');
        } else {
            if (isSafari) {
                alert('Clipboard access failed. Please use Cmd+V to paste manually, or try refreshing the page.');
            } else {
                alert('Failed to access clipboard. Please use Ctrl+V to paste manually.');
            }
        }
    }
}

function clearAllSettings() {
    if (confirm('Are you sure you want to clear all saved settings? This will reset all sliders, prompts, API key, and saved stream data to defaults.')) {
        clearLocalStorage();
        
        // Clear current stream state in memory and close popup
        streamState.streamId = null;
        streamState.playbackId = null;
        streamState.whipUrl = null;
        
        // Close popup window when clearing all settings
        if (streamState.popupWindow && !streamState.popupWindow.closed) {
            streamState.popupWindow.close();
        }
        streamState.popupWindow = null;
        
        // Clear prompt update interval
        if (streamState.promptUpdateInterval) {
            clearInterval(streamState.promptUpdateInterval);
            streamState.promptUpdateInterval = null;
        }
        
        updateStreamButton(false);
        
        // Reset to default values - optimized for slower, longer-lasting animations
        config.DENSITY_DISSIPATION = 0.15;
        config.VELOCITY_DISSIPATION = 0.6;
        config.PRESSURE = 0.37;
        config.CURL = 4;
        config.SPLAT_RADIUS = 0.19;
        config.BLOOM_INTENSITY = 0.4;
        config.SUNRAYS_WEIGHT = 0.4;
        config.INFERENCE_STEPS = 50;
        config.SEED = 42;
        config.CONTROLNET_POSE_SCALE = 0.65;
        config.CONTROLNET_HED_SCALE = 0.41;
        config.CONTROLNET_CANNY_SCALE = 0.00;
        config.CONTROLNET_DEPTH_SCALE = 0.21;
        config.CONTROLNET_COLOR_SCALE = 0.26;
        config.GUIDANCE_SCALE = 7.5;
        config.DELTA = 0.5;
        config.DENOISE_X = 3;
        config.DENOISE_Y = 6;
        config.DENOISE_Z = 6;
        config.COLORFUL = false;
        config.PAUSED = false;
        config.BLOOM = true;
        config.SUNRAYS = true;
        config.STATIC_COLOR = { r: 0, g: 0.831, b: 1 }; // Default cyan color
        config.BACK_COLOR = { r: 0, g: 0, b: 0 }; // Default black background
        
        // Update UI
        updateSliderPositions();
        updateToggleStates();
        initializeColorPickers();
        
        // Clear input fields
        const promptInput = document.getElementById('promptInput');
        const negativePromptInput = document.getElementById('negativePromptInput');
        const apiKeyInput = document.getElementById('apiKeyInput');
        const consentCheckbox = document.getElementById('apiKeyConsent');
        const telegramTokenInput = document.getElementById('telegramTokenInput');
        const telegramTokenConsent = document.getElementById('telegramTokenConsent');
        
        if (promptInput) promptInput.value = 'blooming flower with delicate petals, vibrant colors, soft natural lighting, botanical beauty, detailed macro photography, spring garden atmosphere';
        if (negativePromptInput) negativePromptInput.value = 'blurry, low quality, flat, 2d';
        if (apiKeyInput) apiKeyInput.value = '';
        if (consentCheckbox) consentCheckbox.checked = false;
        if (telegramTokenInput) telegramTokenInput.value = '';
        if (telegramTokenConsent) telegramTokenConsent.checked = false;
        
        alert('Settings cleared! Page will reload to apply defaults.');
        window.location.reload();
    }
}

function initializeLocalStorage() {
    loadConfig();
    
    // Set balanced preset as default if no saved config exists
    const hasConfigData = loadFromLocalStorage(STORAGE_KEYS.CONFIG);
    if (!hasConfigData) {
        // Apply balanced preset values on first load
        setControlNetPreset('balanced');
        console.log('✅ Applied balanced preset as default');
    }
    
    // Ensure DOM is ready before updating UI elements
    setTimeout(() => {
        loadTelegramSettings(); // Load before slider initialization
        updateSliderPositions();
        updateToggleStates();
        loadPrompts();
        loadApiKey();
        loadTelegramToken();
        updateTelegramBotElements(); // Update visibility based on loaded values
        setupInputSaveHandlers();
        initializeStreamRecovery();
        initializeColorPickers();
    }, 200); // Increased timeout to ensure DOM is ready
}

function initializeStreamRecovery() {
    const savedStream = loadStreamState();
    if (savedStream) {
        // Restore stream state to memory
        streamState.streamId = savedStream.streamId;
        streamState.playbackId = savedStream.playbackId;
        streamState.whipUrl = savedStream.whipUrl;
        
        // Update UI to show available stream
        updateStreamButton(false); // Show copy button since we have a valid stream
        
        console.log('Recovered stream state:', savedStream.streamId);
        
        // Calculate and log stream age
        const ageHours = Math.floor((Date.now() - savedStream.timestamp) / (1000 * 60 * 60));
        if (ageHours < 1) {
            console.log('Stream is less than 1 hour old');
        } else {
            console.log(`Stream is ${ageHours} hours old`);
        }
    }
}

function initializeColorPickers() {
    // Set static color picker value
    const staticColorPicker = document.getElementById('staticColorPicker');
    if (staticColorPicker) {
        const staticColorHex = rgbToHex(config.STATIC_COLOR.r, config.STATIC_COLOR.g, config.STATIC_COLOR.b);
        staticColorPicker.value = staticColorHex;
        staticColorPicker.style.backgroundColor = staticColorHex;
        // Update Coloris if it's already initialized
        if (window.Coloris) {
            staticColorPicker.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }
    
    // Set background color picker value
    const backgroundColorPicker = document.getElementById('backgroundColorPicker');
    if (backgroundColorPicker) {
        const backgroundColorHex = rgbToHex(config.BACK_COLOR.r, config.BACK_COLOR.g, config.BACK_COLOR.b);
        backgroundColorPicker.value = backgroundColorHex;
        backgroundColorPicker.style.backgroundColor = backgroundColorHex;
        // Update Coloris if it's already initialized
        if (window.Coloris) {
            backgroundColorPicker.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }
    
    // Set audio blob color picker value
    const audioBlobColorPicker = document.getElementById('audioBlobColorPicker');
    if (audioBlobColorPicker) {
        const audioBlobColorHex = rgbToHex(audioBlobState.color.r, audioBlobState.color.g, audioBlobState.color.b);
        audioBlobColorPicker.value = audioBlobColorHex;
        audioBlobColorPicker.style.backgroundColor = audioBlobColorHex;
        // Update Coloris if it's already initialized
        if (window.Coloris) {
            audioBlobColorPicker.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }
}

function setupInputSaveHandlers() {
    const promptInput = document.getElementById('promptInput');
    const negativePromptInput = document.getElementById('negativePromptInput');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const consentCheckbox = document.getElementById('apiKeyConsent');
    const telegramTokenInput = document.getElementById('telegramTokenInput');
    const telegramTokenConsent = document.getElementById('telegramTokenConsent');
    
    // Save prompts on change
    if (promptInput) {
        promptInput.addEventListener('blur', savePrompts);
        promptInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') savePrompts();
        });
    }
    
    if (negativePromptInput) {
        negativePromptInput.addEventListener('blur', savePrompts);
        negativePromptInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') savePrompts();
        });
    }
    
    // Save API key on change
    if (apiKeyInput) {
        apiKeyInput.addEventListener('blur', saveApiKey);
        apiKeyInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') saveApiKey();
        });
        apiKeyInput.addEventListener('input', updateApiInstructions);
    }
    
    if (consentCheckbox) {
        consentCheckbox.addEventListener('change', saveApiKey);
    }
    
    // Save Telegram token on change
    if (telegramTokenInput) {
        telegramTokenInput.addEventListener('blur', saveTelegramToken);
        telegramTokenInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') saveTelegramToken();
        });
    }
    
    if (telegramTokenConsent) {
        telegramTokenConsent.addEventListener('change', saveTelegramToken);
    }
}

// Initialize parameter listeners when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    try {
        // Re-check canvas after DOM is ready (mobile debugging)
        if (isMobile()) {
            const newCanvas = document.getElementById('fluidCanvas') || document.getElementsByTagName('canvas')[0];
            if (!canvas && newCanvas) {
                console.log('🔍 MOBILE DEBUG: Canvas found after DOM ready, re-initializing');
                canvas = newCanvas;
                resizeCanvas();
            } else if (canvas !== newCanvas) {
                console.log('🔍 MOBILE DEBUG: Canvas reference changed after DOM ready');
                canvas = newCanvas;
            }
            
            console.log('🔍 MOBILE DEBUG: Final canvas check');
            console.log('🔍 Canvas ready:', !!canvas);
            console.log('🔍 Canvas dimensions:', canvas ? `${canvas.clientWidth}x${canvas.clientHeight}` : 'N/A');
            console.log('🔍 Canvas style display:', canvas ? canvas.style.display : 'N/A');
        }
        
        initializeStreamParameterListeners();
        initializeLocalStorage();
        initializeColoris();
        initializeMobilePanelGestures();
        initializeWelcomeOverlay();
        initializeIdleAnimation();
        initializeMediaUpload();
        initializeMobileDebug();
        
        
        // Start with fluid mode active
        activateInputMode('fluid');
        // Ensure fluid simulation is running
        config.PAUSED = false;
        if (!window.fluidAnimationFrame) {
            window.fluidAnimationFrame = requestAnimationFrame(update);
        }
    } catch (err) {
        console.error('Initialization error:', err);
    }
});

// Global error handler to prevent page crashes
window.addEventListener('error', (e) => {
    console.error('Global error caught:', e.error);
    return true; // Prevent default browser error handling
});

window.addEventListener('unhandledrejection', (e) => {
    console.error('Unhandled promise rejection:', e.reason);
    e.preventDefault(); // Prevent default browser error handling
});

// Initialize Coloris color picker
function initializeColoris() {
    // Ensure Coloris is available before initializing
    if (typeof Coloris === 'undefined') {
        console.warn('Coloris not loaded yet, retrying...');
        setTimeout(initializeColoris, 100);
        return;
    }

    // Configure Coloris with dark theme and custom options
    Coloris({
        el: '[data-coloris]',
        theme: 'default',
        themeMode: 'dark',
        alpha: false,
        format: 'hex',
        formatToggle: false,
        swatches: [
            // Electric/neon colors for dynamic effects - last two rows only
            '#00FF41', '#FF0080', '#8000FF', '#FF8000', '#00BFFF',
            '#FF6B35', '#F7931E', '#FFE135', '#C3FF00', '#00FFCC'
        ],
        swatchesOnly: false,
        closeButton: false,
        clearButton: false,
        margin: 8,
        onChange: (color, input) => {
            // Update the input background color to show selected color
            input.style.backgroundColor = color;
            
            // Determine which color picker was changed and update accordingly
            if (input.id === 'staticColorPicker') {
                updateStaticColor(color);
            } else if (input.id === 'backgroundColorPicker') {
                updateBackgroundColor(color);
            } else if (input.id === 'audioBlobColorPicker') {
                updateAudioBlobColor(color);
            }
        }
    });

    // Set up color picker click handling
    const staticColorPicker = document.getElementById('staticColorPicker');
    const backgroundColorPicker = document.getElementById('backgroundColorPicker');

    function setupColorPickerEvents(picker) {
        if (!picker) return;
        
        // Handle click to deactivate text focus and enable picker
        picker.addEventListener('click', (e) => {
            // Deactivate text focus
            e.target.blur();
            // Let Coloris handle the picker opening naturally
            // Don't prevent default here - let Coloris work
        });
        
        // Prevent focus from showing keyboard
        picker.addEventListener('focus', (e) => {
            e.target.blur();
        });
        
        // Handle touch events for mobile
        picker.addEventListener('touchstart', (e) => {
            // Don't prevent default - let the touch turn into a click
            // Just ensure no text selection happens
            e.target.blur();
        }, { passive: true });
        
        // Prevent keyboard input but allow Coloris shortcuts
        picker.addEventListener('keydown', (e) => {
            // Only prevent text input keys, not Coloris functionality
            if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete') {
                e.preventDefault();
            }
        });
    }

    setupColorPickerEvents(staticColorPicker);
    setupColorPickerEvents(backgroundColorPicker);
    
    // Set up audio blob color picker
    const audioBlobColorPicker = document.getElementById('audioBlobColorPicker');
    setupColorPickerEvents(audioBlobColorPicker);

    console.log('Coloris initialized successfully');
}

// Handle mobile orientation and resize changes
window.addEventListener('resize', () => {
    if (isMobile()) {
        setTimeout(() => {
            resizeCanvas();
        }, 100); // Small delay to let resize complete
    }
});

window.addEventListener('orientationchange', () => {
    if (isMobile()) {
        setTimeout(() => {
            resizeCanvas();
        }, 300); // Longer delay for orientation change
    }
});

// Fullscreen change event listeners
document.addEventListener('fullscreenchange', updateFullscreenButton);
document.addEventListener('webkitfullscreenchange', updateFullscreenButton);
document.addEventListener('mozfullscreenchange', updateFullscreenButton);
document.addEventListener('MSFullscreenChange', updateFullscreenButton);

// OSC WebSocket Connection for Remote Control
let oscWebSocket = null;
let oscConnectionStatus = 'disconnected';
let oscServerIP = null;

function initOSCConnection() {
    // Try to connect to local OSC server
    const possibleIPs = [
        'localhost',
        '192.168.1.100', // Common router IP range
        '192.168.0.100',
        '10.0.0.100'
    ];
    
    // Try to detect network IP from URL or use common local IPs
    const currentHost = window.location.hostname;
    if (currentHost !== 'localhost' && currentHost !== '127.0.0.1') {
        // If we're on a remote site, try to guess local network IP
        possibleIPs.unshift(currentHost.replace(/\d+$/, '100')); // Replace last number with 100
    }
    
    tryConnectToOSCServer(possibleIPs, 0);
}

function tryConnectToOSCServer(ips, index) {
    if (index >= ips.length) {
        console.log('🔌 Could not connect to OSC server. Make sure local-osc-server.js is running.');
        updateOSCStatus('disconnected', null);
        return;
    }
    
    const ip = ips[index];
    
    // Handle HTTPS websites - they require WSS, but local servers typically use WS
    // For HTTPS sites connecting to local IP, we'll try both protocols
    const isHTTPS = window.location.protocol === 'https:';
    const isLocalIP = ip.startsWith('192.168.') || ip.startsWith('10.0.') || ip.startsWith('172.') || ip === 'localhost' || ip === '127.0.0.1';
    
    console.log(`🔍 OSC Debug: Current protocol: ${window.location.protocol}, Target IP: ${ip}, Is Local: ${isLocalIP}`);
    
    let wsUrl;
    if (isHTTPS && isLocalIP) {
        // HTTPS site trying to connect to local server - this will likely fail due to mixed content
        // But we'll try WS first, then suggest alternatives
        wsUrl = `ws://${ip}:8001`;
        console.log(`⚠️ HTTPS website connecting to local WS server - this may be blocked by browser security`);
    } else if (isHTTPS) {
        // HTTPS site connecting to remote server - use WSS
        wsUrl = `wss://${ip}:8001`;
    } else {
        // HTTP site - use WS
        wsUrl = `ws://${ip}:8001`;
    }
    
    console.log(`🔌 Trying to connect to OSC server at ${wsUrl}...`);
    
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log(`✅ Connected to OSC server at ${ip}:8001`);
        oscWebSocket = ws;
        oscServerIP = ip;
        updateOSCStatus('connected', ip);
        setupOSCMessageHandling();
        
        // Send stored Telegram token immediately after connection
        sendStoredTelegramTokenToServer();
    };
    
    ws.onerror = (error) => {
        console.log(`❌ Failed to connect to ${wsUrl}`);
        
        // Special handling for HTTPS mixed content errors
        if (isHTTPS && isLocalIP) {
            console.log(`🔒 HTTPS Mixed Content Error: Cannot connect to local WebSocket server`);
            console.log(`💡 Solutions:`);
            console.log(`   1. Use HTTP version of the website (if available)`);
            console.log(`   2. Run OSC server with SSL certificate`);
            console.log(`   3. Use browser flag: --disable-web-security (not recommended)`);
            console.log(`   4. Upload your modified files to FTP and use that version`);
            
            updateOSCStatus('https_blocked', ip);
            return; // Don't try other IPs for HTTPS mixed content
        }
        
        // Try next IP
        setTimeout(() => tryConnectToOSCServer(ips, index + 1), 100);
    };
    
    ws.onclose = () => {
        if (oscWebSocket === ws) {
            console.log('🔌 OSC WebSocket connection closed');
            oscWebSocket = null;
            updateOSCStatus('disconnected', null);
            
            // Try to reconnect after 5 seconds
            setTimeout(initOSCConnection, 5000);
        }
    };
}

function setupOSCMessageHandling() {
    if (!oscWebSocket) return;
    
    oscWebSocket.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            
            // Debug logging for OSC messages
            if (config.DEBUG_MODE && message.type === 'osc_velocity_drawing') {
                console.log(`🔍 WebSocket: Received ${message.drawingType} for channel ${message.channel}`);
            }
            
            handleOSCMessage(message);
        } catch (error) {
            console.error('❌ Error parsing OSC message:', error);
        }
    };
}

function handleOSCMessage(message) {
    if (config.DEBUG_MODE) {
        console.log('📨 OSC Message:', message);
        
        // Only log OSC-specific messages to OSC debug section
        if (message.type === 'server_info' || message.type === 'osc_velocity_drawing' || 
            message.type === 'osc_message' || message.type.startsWith('osc_')) {
            addOSCMessageToDebug(message);
        }
    }
    
    if (message.type === 'server_info') {
        if (config.DEBUG_MODE) {
            console.log('📋 OSC Server Info:', message);
        }
        return;
    }
    
    if (message.type === 'osc_velocity_drawing') {
        handleOSCVelocityDrawing(message);
        return;
    }
    
    if (message.type === 'telegram_prompt') {
        handleTelegramPrompt(message);
        return;
    }
    
    if (message.type === 'apply_telegram_prompt') {
        console.log('🔍 Received apply_telegram_prompt message:', message);
        handleTelegramPrompt(message);
        return;
    }
    
    if (message.type === 'controlnet_preset') {
        handleControlNetPreset(message);
        return;
    }
    
    if (message.type === 'apply_controlnet_preset') {
        handleControlNetPreset(message);
        return;
    }
    
    if (message.type === 'osc_message') {
        // Handle parameter updates
        if (message.parameter) {
            config[message.parameter] = message.value;
            console.log(`🎛️  Updated ${message.parameter} = ${message.value}`);
            
            // OLD OSC splat system REMOVED - now using OSC velocity drawing system only
            // Update UI elements for parameters
            updateUIFromConfig(message.parameter, message.value);
            
            // Save config
            saveConfig();
        }
        
        // Handle actions
        if (message.action) {
            if (config.DEBUG_MODE) {
                console.log(`🎬 Executing action: ${message.action}`);
            }
            executeOSCAction(message.action, message.value);
        }
    }
}

function handleTelegramPrompt(message) {
    console.log(`📱 Received Telegram prompt from ${message.from}: "${message.prompt}"`);
    
    // Add to debug log
    addTelegramMessageToDebug(message);
    
    // Check if Telegram receive is enabled
    if (config.TELEGRAM_RECEIVE === false) {
        console.log('📱 Telegram receive is disabled, ignoring prompt');
        // Notification removed - no overlay in top right
        return;
    }
    
    // Apply the prompt to the input field
    console.log(`📱 Applying telegram prompt: "${message.prompt}" from ${message.from}`);
    setPrompt(message.prompt);
    
    // Send confirmation back to server
    sendToServer({
        type: 'telegram_prompt_applied',
        promptId: message.id,
        prompt: message.prompt,
        from: message.from,
        chatId: message.chatId,
        isPreset: message.isPreset || false,
        presetName: message.presetName || null
    });
}

function handleControlNetPreset(message) {
    console.log(`📱 Received ControlNet preset from ${message.from}: "${message.presetDisplayName}"`);
    
    // Add to debug log
    addTelegramMessageToDebug(message);
    
    // Check if Telegram receive is enabled
    if (config.TELEGRAM_RECEIVE === false) {
        console.log('📱 Telegram receive is disabled, ignoring preset');
        return;
    }
    
    // Add to waitlist instead of immediately processing (same as prompts)
    // Include all preset data for processing
    const waitlistMessage = {
        ...message,
        chatId: message.chatId, // Pass through from server
        type: 'controlnet_preset' // Ensure type is preserved
    };
    addToTelegramWaitlist(waitlistMessage);
    
    // Debug notification removed - no longer showing waitlist additions in UI
}

function showTelegramNotification(message, ignored = false) {
    // Disabled - no overlay notifications in top right corner
    return;
    
    // Create a temporary notification element
    const notification = document.createElement('div');
    notification.className = 'telegram-notification';
    
    const title = ignored ? 'Telegram Prompt Ignored' : 'Telegram Prompt Received';
    const icon = ignored ? '🚫' : '📱';
    const titleColor = ignored ? '#ff6b6b' : '#4ecdc4';
    
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-icon">${icon}</span>
            <div class="notification-text">
                <div class="notification-title" style="color: ${titleColor};">${title}</div>
                <div class="notification-subtitle">From: ${message.from}</div>
                <div class="notification-prompt">"${message.prompt}"</div>
                ${ignored ? '<div class="notification-status">Toggle "Receive from Telegram" to enable</div>' : ''}
            </div>
        </div>
    `;
    
    // Add styles
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 15px;
        border-radius: 10px;
        border: 1px solid #333;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        z-index: 10000;
        max-width: 350px;
        animation: slideIn 0.3s ease-out;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    
    // Add animation styles if not already present
    if (!document.querySelector('#telegram-notification-styles')) {
        const style = document.createElement('style');
        style.id = 'telegram-notification-styles';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            .notification-content {
                display: flex;
                align-items: flex-start;
                gap: 10px;
            }
            .notification-icon {
                font-size: 24px;
                flex-shrink: 0;
            }
            .notification-text {
                flex: 1;
            }
            .notification-title {
                font-weight: bold;
                margin-bottom: 4px;
                font-size: 14px;
            }
            .notification-subtitle {
                font-size: 12px;
                opacity: 0.8;
                margin-bottom: 6px;
            }
            .notification-prompt {
                font-size: 13px;
                font-style: italic;
                opacity: 0.9;
                line-height: 1.3;
            }
            .notification-status {
                font-size: 11px;
                opacity: 0.7;
                margin-top: 4px;
                font-style: normal;
            }
        `;
        document.head.appendChild(style);
    }
    
    // Add to page
    document.body.appendChild(notification);
    
    // Remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideIn 0.3s ease-out reverse';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }
    }, 5000);
}

function updateUIFromConfig(parameter, value) {
    // Update sliders based on parameter
    const sliderMappings = {
        'DENSITY_DISSIPATION': 'density',
        'VELOCITY_DISSIPATION': 'velocity',
        'PRESSURE': 'pressure',
        'CURL': 'vorticity',
        'SPLAT_RADIUS': 'splat',
        'BLOOM_INTENSITY': 'bloomIntensity',
        'SUNRAYS_WEIGHT': 'sunray',
        'LIVELINESS': 'liveliness',
        'CHAOS': 'chaos',
        'BREATHING': 'breathing',
        'COLOR_LIFE': 'colorLife',
        'ANIMATION_INTERVAL': 'animationInterval',
        'AUDIO_REACTIVITY': 'audioReactivity',
        'AUDIO_DELAY': 'audioDelay',
        'AUDIO_OPACITY': 'audioOpacity',
        'AUDIO_COLORFUL': 'audioColorful',
        'AUDIO_EDGE_SOFTNESS': 'audioEdgeSoftness'
    };
    
    const sliderName = sliderMappings[parameter];
    if (sliderName) {
        updateSliderPositions(); // This will update all sliders from config
    }
    
    // Update toggles
    const toggleMappings = {
        'BLOOM': 'bloomToggle',
        'SUNRAYS': 'sunraysToggle',
        'COLORFUL': 'colorfulToggle',
        'PAUSED': 'pausedToggle',
        'ANIMATE': 'animateToggle',
        'VELOCITY_DRAWING': 'velocityDrawingToggle',
        'FORCE_CLICK': 'forceClickToggle'
    };
    
    const toggleId = toggleMappings[parameter];
    if (toggleId) {
        updateToggle(toggleId, value);
    }
}

function executeOSCAction(action, value) {
    // Only execute on button press (value > 0)
    if (value <= 0) return;
    
    switch (action) {
        case 'toggleFluidDrawing':
            toggleFluidDrawing();
            break;
        case 'toggleAudioBlob':
            toggleAudioBlob();
            break;
        case 'toggleCamera':
            toggleCamera();
            break;
        case 'toggleMedia':
            toggleMedia();
            break;
        case 'resetValues':
            resetValues();
            break;
        case 'captureScreenshot':
            captureScreenshot();
            break;
        case 'toggleVideoRecording':
            toggleVideoRecording();
            break;
        case 'splatAt':
            // REMOVED - performSplatAtPosition created shooting effects
            // Use OSC velocity drawing system instead for smooth directional splats
            console.log(`⚠️  splatAt action disabled - use OSC velocity drawing system instead`);
            break;
        default:
            console.log(`⚠️  Unknown OSC action: ${action}`);
    }
}

function handleOSCVelocityDrawing(message) {
    const { channel, x, y, deltaX, deltaY, drawingType } = message;
    
        // OSC velocity drawing is completely isolated from mouse click effects
    // Never triggers FORCE_CLICK or createVelocityClickEffect

    // Create or get OSC pointer for this channel
    const pointerId = `osc_${channel}`;

    if (config.DEBUG_MODE) {
        console.log(`🎯 handleOSCVelocityDrawing: channel=${channel}, type=${drawingType}, pos=(${x.toFixed(3)}, ${y.toFixed(3)}), delta=(${deltaX.toFixed(4)}, ${deltaY.toFixed(4)})`);
    }
    
    if (!window.oscPointers) {
        window.oscPointers = {};
    }
    
    // Apply WebGL coordinate system (flip Y and ensure proper texture coordinates)
    const texcoordX = x;
    const texcoordY = 1.0 - y; // Flip Y coordinate to match WebGL coordinate system
    
            if (drawingType === 'start') {
            // Initialize OSC pointer (like mouse down)
            window.oscPointers[pointerId] = {
                id: pointerId,
                down: true,
                moved: false,
                texcoordX: texcoordX,
                texcoordY: texcoordY,
                prevTexcoordX: texcoordX,
                prevTexcoordY: texcoordY,
                deltaX: 0,
                deltaY: 0,
                color: generateColor()
            };

            if (config.DEBUG_MODE) {
                console.log(`🎯 OSC Velocity Drawing ${channel}: Started at (${x.toFixed(3)}, ${y.toFixed(3)}) -> tex(${texcoordX.toFixed(3)}, ${texcoordY.toFixed(3)})`);
            }

            // Don't create test splat or return - let the first real movement create the first splat
            return;
        }
    
    if (drawingType === 'move') {
        const pointer = window.oscPointers[pointerId];
        if (!pointer) return; // No start event received
        
        // Update pointer with velocity data
        pointer.prevTexcoordX = pointer.texcoordX;
        pointer.prevTexcoordY = pointer.texcoordY;
        pointer.texcoordX = texcoordX;
        pointer.texcoordY = texcoordY;
        
        // Scale deltas properly - OSC deltas are already in normalized coordinates like mouse deltas
        // Apply the same scaling as mouse movement (just multiply by SPLAT_FORCE)
        const scaledDeltaX = deltaX * config.SPLAT_FORCE; // Same scale as mouse movement
        const scaledDeltaY = -deltaY * config.SPLAT_FORCE; // Flip Y delta and scale same as mouse
        
        if (config.DEBUG_MODE) {
            console.log(`🔧 OSC Scaling Step 1: deltaX=${deltaX.toFixed(4)} -> scaledX=${scaledDeltaX.toFixed(1)}, deltaY=${deltaY.toFixed(4)} -> scaledY=${scaledDeltaY.toFixed(1)}`);
        }
        
        pointer.deltaX = scaledDeltaX;
        pointer.deltaY = scaledDeltaY;
        pointer.moved = Math.abs(deltaX) > 0.001 || Math.abs(deltaY) > 0.001; // Lower threshold
        
        // Apply velocity-based scaling like regular velocity drawing
        const velocity = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        const velocityMultiplier = Math.min(3.0, 0.5 + velocity * 25.0);
        
        if (config.DEBUG_MODE) {
            console.log(`🔧 OSC Scaling Step 2: velocity=${velocity.toFixed(4)}, multiplier=${velocityMultiplier.toFixed(2)}`);
        }
        
        // Scale deltas by velocity multiplier
        pointer.deltaX *= velocityMultiplier;
        pointer.deltaY *= velocityMultiplier;
        
        if (config.DEBUG_MODE) {
            console.log(`🔧 OSC Final Deltas: deltaX=${pointer.deltaX.toFixed(1)}, deltaY=${pointer.deltaY.toFixed(1)}`);
        }
        
        // Create splat using velocity drawing logic
        if (config.DEBUG_MODE) {
            console.log(`🎯 OSC Movement Check: deltaX=${deltaX.toFixed(4)}, deltaY=${deltaY.toFixed(4)}, moved=${pointer.moved}`);
        }
        
                if (pointer.moved) {
            splat(pointer.texcoordX, pointer.texcoordY, pointer.deltaX, pointer.deltaY, pointer.color);

            if (config.DEBUG_MODE) {
                console.log(`🎯 OSC Splat Channel ${channel}: pos(${pointer.texcoordX.toFixed(3)}, ${pointer.texcoordY.toFixed(3)}) delta(${pointer.deltaX.toFixed(1)}, ${pointer.deltaY.toFixed(1)}) v=${velocity.toFixed(2)}`);
            }
        }
        
        if (config.DEBUG_MODE) {
            console.log(`🎯 OSC Velocity Drawing ${channel}: v=${velocity.toFixed(2)} mult=${velocityMultiplier.toFixed(2)} moved=${pointer.moved}`);
        }
    }
}

function updateOSCStatus(status, ip) {
    oscConnectionStatus = status;
    
    // Always hide the separate OSC status overlay - only show in debug overlay
    let statusElement = document.getElementById('oscStatus');
    if (statusElement) {
        statusElement.style.display = 'none';
    }
    
    // The debug overlay will show OSC status when debug mode is enabled
}

// Initialize OSC connection when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Wait a bit for the main app to initialize
    setTimeout(initOSCConnection, 2000);
});

// Cleanup video recording and camera when page is closed
window.addEventListener('beforeunload', () => {
    if (videoRecorder.isRecording) {
        cleanup();
    }
    
    // Stop camera if active
    if (cameraState.active) {
        stopCamera();
    }
    
    // Close OSC connection
    if (oscWebSocket) {
        oscWebSocket.close();
    }
});

// Ensure all toggle functions are globally available for mobile compatibility
ensureGlobalFunctions();