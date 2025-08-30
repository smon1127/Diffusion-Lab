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

const canvas = document.getElementsByTagName('canvas')[0];
resizeCanvas();

// Slider handle padding to prevent clipping at edges
const SLIDER_HANDLE_PADDING = 0.035; // 3.5% padding on each side

let config = {
    SIM_RESOLUTION: 256,        // Fixed simulation resolution for better performance
    DYE_RESOLUTION: 1024,       // High quality by default
    CAPTURE_RESOLUTION: 512,
    DENSITY_DISSIPATION: 0.5,   // Default fade level for balanced fluid persistence
    VELOCITY_DISSIPATION: 0.6,  // Much lower for longer-lasting fluid motion
    PRESSURE: 0.37,             // Updated default from screenshot
    PRESSURE_ITERATIONS: 20,
    CURL: 4,                    // Updated default from screenshot (Vorticity)
    SPLAT_RADIUS: 0.19,         // Updated default from screenshot
    SPLAT_FORCE: 6000,
    SHADING: true,              // Adds 3D lighting effects for depth and realism
    COLORFUL: false,            // Disabled by default for cleaner look
    COLOR_UPDATE_SPEED: 10,
    PAUSED: false,
    BACK_COLOR: { r: 0, g: 0, b: 0 },
    STATIC_COLOR: { r: 0, g: 0.831, b: 1 }, // Default cyan color (#00d4ff)
    TRANSPARENT: false,
    BLOOM: true,
    BLOOM_ITERATIONS: 8,
    BLOOM_RESOLUTION: 256,
    BLOOM_INTENSITY: 0.4,       // Default glow level
    BLOOM_THRESHOLD: 0.6,
    BLOOM_SOFT_KNEE: 0.7,
    SUNRAYS: true,
    SUNRAYS_RESOLUTION: 196,
    SUNRAYS_WEIGHT: 0.4,        // Default rays level
    // StreamDiffusion parameters
    INFERENCE_STEPS: 50,
    SEED: 42,
    CONTROLNET_POSE_SCALE: 0.65,  // Balanced preset default
    CONTROLNET_HED_SCALE: 0.60,   // Balanced preset default
    CONTROLNET_CANNY_SCALE: 0.50, // Balanced preset default
    CONTROLNET_DEPTH_SCALE: 0.45, // Balanced preset default
    CONTROLNET_COLOR_SCALE: 0.55, // Balanced preset default
    GUIDANCE_SCALE: 7.5,
    DELTA: 0.5,
    // Denoise controls (t_index_list values) - Balanced preset default
    DENOISE_X: 3,
    DENOISE_Y: 6, 
    DENOISE_Z: 9,
    // Animation Parameters - Redesigned with intuitive 0-1 ranges
    ANIMATE: true,
    LIVELINESS: 0.62,   // 0=gentle (1 splat), 1=energetic (8 splats) - Default: moderate-high energy
    CHAOS: 0.73,        // 0=ordered streams, 1=full chaos - Default: high chaos
    BREATHING: 0.5,     // 0=consistent, 1=dramatic pulsing - Default: moderate rhythm  
    COLOR_LIFE: 0.22,   // 0=static color, 1=rainbow evolution - Default: subtle color shifts
    ANIMATION_INTERVAL: 0.1, // 0-1 range - Controls animation speed (0 = slow, 1 = fast) - Default: 10%
    // Background Image Parameters
    BACKGROUND_IMAGE_SCALE: 1.0, // 0.1-2.0 range - Controls background image size (1.0 = fit to viewport)
}

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
    const sliders = ['density', 'velocity', 'pressure', 'vorticity', 'splat', 'bloomIntensity', 'sunray', 'denoiseX', 'denoiseY', 'denoiseZ', 'inferenceSteps', 'seed', 'controlnetPose', 'controlnetHed', 'controlnetCanny', 'controlnetDepth', 'controlnetColor', 'guidanceScale', 'delta', 'animationInterval', 'chaos', 'breathing', 'colorLife', 'backgroundImageScale'];
    
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

function updateSliderValue(sliderName, percentage, skipSave = false) {
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
        'tIndexList': { min: 0, max: 50, prop: 'T_INDEX_LIST', decimals: 0, isArray: true },
        'audioReactivity': { min: 0.1, max: 3.0, prop: 'AUDIO_REACTIVITY', decimals: 1, handler: updateAudioReactivity },
        'audioDelay': { min: 0, max: 500, prop: 'AUDIO_DELAY', decimals: 0, handler: updateAudioDelay }
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
        // Adjust percentage to prevent handle clipping
        // Reserve space for handle on both ends (8px handle radius + 2px border = 10px each side)
        // For a typical 280px slider, this is about 3.5% padding on each side
        const adjustedPercentage = SLIDER_HANDLE_PADDING + (percentage * (1 - 2 * SLIDER_HANDLE_PADDING));
        fill.style.width = (adjustedPercentage * 100) + '%';
    }
    
    if (valueDisplay) {
        if (slider.isArray && slider.prop === 'T_INDEX_LIST') {
            valueDisplay.textContent = '[' + config[slider.prop].join(',') + ']';
        } else {
            valueDisplay.textContent = value.toFixed(slider.decimals);
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
        'tIndexList': { prop: 'T_INDEX_LIST', min: 0, max: 50, isArray: true }
    };
    
    Object.keys(sliderMap).forEach(sliderName => {
        const slider = sliderMap[sliderName];
        let percentage;
        
        if (slider.isArray && slider.prop === 'T_INDEX_LIST') {
            // For T_INDEX_LIST, use the middle value to determine percentage
            const middleValue = Array.isArray(config[slider.prop]) ? config[slider.prop][1] || 8 : 8;
            percentage = (middleValue - slider.min) / (slider.max - slider.min);
        } else {
            percentage = (config[slider.prop] - slider.min) / (slider.max - slider.min);
        }
        
        updateSliderValue(sliderName, percentage, true); // Skip saving when loading
    });
}

function updateToggleStates() {
    updateToggle('colorfulToggle', config.COLORFUL);
    updateToggle('pausedToggle', config.PAUSED);
    updateToggle('animateToggle', config.ANIMATE);
    updateToggle('bloomToggle', config.BLOOM);
    updateToggle('sunraysToggle', config.SUNRAYS);
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
}

// Mobile pull-down gesture to close control panel
function initializeMobilePanelGestures() {
    // Skip if not mobile or already initialized
    if (!isMobile()) return;
    
    try {
        const panel = document.getElementById('controlPanel');
        const panelHeader = document.querySelector('.panel-header');
        const panelContent = document.querySelector('.panel-content');
        
        if (!panel || !panelHeader) return;
        
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
    config.COLORFUL = !config.COLORFUL;
    updateToggle('colorfulToggle', config.COLORFUL);
    saveConfig();
}

function togglePaused() {
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

function togglePromptPresets() {
    const content = document.getElementById('promptPresetsContent');
    const toggle = document.getElementById('promptPresetsIcon');
    
    if (content.classList.contains('expanded')) {
        content.classList.remove('expanded');
        toggle.textContent = '▶';
    } else {
        content.classList.add('expanded');
        toggle.textContent = '▼';
    }
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

function setPrompt(promptText) {
    const promptInput = document.getElementById('promptInput');
    if (promptInput) {
        promptInput.value = promptText;
        
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
    return /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
           ('ontouchstart' in window) || 
           (navigator.maxTouchPoints > 0);
}

function isTouchDevice() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
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
    downloadURI('fluid.png', datauri);
    URL.revokeObjectURL(datauri);
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

// Camera feed functionality
let cameraFeed = {
    stream: null,
    video: null,
    texture: null,
    active: false,
    canvas: null
};

function initializeMediaUpload() {
    const mediaUpload = document.getElementById('mediaUpload');
    if (mediaUpload) {
        mediaUpload.addEventListener('change', handleMediaUpload);
    }
    
    // Initialize camera functionality
    updateCameraButton();
    updateBackgroundControls();
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
    } else {
        // Handle image file
        const reader = new FileReader();
        reader.onload = function(e) {
            // Store original data URL for scale changes
            backgroundMedia.originalDataURL = e.target.result;
            loadBackgroundImage(e.target.result);
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

function updateCameraTexture() {
    if (!cameraFeed.active || !cameraFeed.video) return;
    
    // Create texture if it doesn't exist
    if (!cameraFeed.texture) {
        cameraFeed.texture = gl.createTexture();
    }
    
    // Bind texture
    gl.bindTexture(gl.TEXTURE_2D, cameraFeed.texture);
    
    // Set texture parameters for real-time video
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    
    // Upload video frame to texture
    try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cameraFeed.video);
    } catch (e) {
        // Video might not be ready yet
        console.warn('Failed to update camera texture:', e);
    }
    
    // Unbind texture
    gl.bindTexture(gl.TEXTURE_2D, null);
}

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

// Camera feed functionality
async function toggleCamera() {
    if (cameraFeed.active) {
        stopCamera();
    } else {
        await startCamera();
    }
}

async function startCamera() {
    try {
        // Request camera access
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                facingMode: 'user' // Front camera by default
            } 
        });
        
        // Get video element
        const video = document.getElementById('cameraVideo');
        if (!video) {
            throw new Error('Camera video element not found');
        }
        
        // Set up video stream
        video.srcObject = stream;
        video.play();
        
        // Wait for video to be ready
        await new Promise((resolve) => {
            video.addEventListener('loadedmetadata', resolve, { once: true });
        });
        
        // Store references
        cameraFeed.stream = stream;
        cameraFeed.video = video;
        cameraFeed.active = true;
        
        // Clear any existing background image
        clearBackgroundImage();
        
        // Show camera preview and update UI
        const cameraPreview = document.getElementById('cameraPreview');
        if (cameraPreview) cameraPreview.style.display = 'block';
        
        updateCameraButton();
        updateBackgroundControls();
        
        console.log('✅ Camera started successfully');
        
    } catch (error) {
        console.error('❌ Failed to start camera:', error);
        
        let errorMessage = 'Failed to access camera';
        if (error.name === 'NotAllowedError') {
            errorMessage = 'Camera access denied. Please allow camera permissions.';
        } else if (error.name === 'NotFoundError') {
            errorMessage = 'No camera found on this device.';
        } else if (error.name === 'NotReadableError') {
            errorMessage = 'Camera is already in use by another application.';
        }
        
        alert(errorMessage);
        updateCameraButton();
    }
}

function stopCamera() {
    // Stop camera stream
    if (cameraFeed.stream) {
        cameraFeed.stream.getTracks().forEach(track => track.stop());
        cameraFeed.stream = null;
    }
    
    // Clear video element
    if (cameraFeed.video) {
        cameraFeed.video.srcObject = null;
        cameraFeed.video = null;
    }
    
    // Clear WebGL texture
    if (cameraFeed.texture) {
        gl.deleteTexture(cameraFeed.texture);
        cameraFeed.texture = null;
    }
    
    // Reset state
    cameraFeed.active = false;
    cameraFeed.canvas = null;
    
    // Hide camera preview
    const cameraPreview = document.getElementById('cameraPreview');
    if (cameraPreview) cameraPreview.style.display = 'none';
    
    updateCameraButton();
    updateBackgroundControls();
    
    console.log('🔄 Camera stopped');
}

function updateCameraButton() {
    const button = document.getElementById('cameraButton');
    if (button) {
        if (cameraFeed.active) {
            button.textContent = '📷 Stop Camera';
            button.classList.add('streaming'); // Use existing streaming style
        } else {
            button.textContent = '📷 Camera';
            button.classList.remove('streaming');
        }
    }
}

function clearAllBackground() {
    clearBackgroundMedia();
    stopCamera();
}

function updateBackgroundControls() {
    const clearButton = document.getElementById('clearBackgroundButton');
    const scaleControl = document.getElementById('backgroundScaleControl');
    
    const hasBackground = backgroundMedia.loaded || cameraFeed.active;
    
    if (clearButton) {
        clearButton.style.display = hasBackground ? 'inline-block' : 'none';
    }
    
    // Show scale control for both images and videos, not camera
    if (scaleControl) {
        const showScale = backgroundMedia.loaded && (backgroundMedia.type === 'image' || backgroundMedia.type === 'video') && !cameraFeed.active;
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
        // Flip Y coordinate for video (videos are upside down in WebGL)
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
        
        // Apply user scale factor (inverted: higher slider value = smaller scale)
        scale /= uScale;
        offset = (vec2(1.0) - scale) * 0.5;
        
        // Apply scaling and offset
        vec2 scaledUv = flippedUv * scale + offset;
        
        // Sample texture with bounds checking
        if (scaledUv.x < 0.0 || scaledUv.x > 1.0 || scaledUv.y < 0.0 || scaledUv.y > 1.0) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        } else {
            gl_FragColor = texture2D(uTexture, scaledUv);
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
update();

function update () {
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
    if (!config.COLORFUL) return;

    colorUpdateTimer += dt * config.COLOR_UPDATE_SPEED;
    if (colorUpdateTimer >= 1) {
        colorUpdateTimer = wrap(colorUpdateTimer, 0, 1);
        pointers.forEach(p => {
            p.color = generateColor();
        });
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
    
    // Draw camera feed if active (bottom background layer)
    if (cameraFeed.active && cameraFeed.video) {
        drawCameraFeed(target);
    }
    
    // Draw background media if loaded (top background layer, over camera)
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

function drawCameraFeed (target) {
    // Update camera texture with latest video frame
    updateCameraTexture();
    
    if (!cameraFeed.texture || !cameraFeed.video) return;
    
    // Enable blending for the camera feed
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    
    // Use the camera program for aspect-corrected rendering
    cameraProgram.bind();
    
    // Calculate aspect ratios
    const canvasWidth = target == null ? gl.drawingBufferWidth : target.width;
    const canvasHeight = target == null ? gl.drawingBufferHeight : target.height;
    const canvasAspect = canvasWidth / canvasHeight;
    
    const videoWidth = cameraFeed.video.videoWidth || cameraFeed.video.width || 1920;
    const videoHeight = cameraFeed.video.videoHeight || cameraFeed.video.height || 1080;
    const videoAspect = videoWidth / videoHeight;
    
    // Bind the camera texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, cameraFeed.texture);
    gl.uniform1i(cameraProgram.uniforms.uTexture, 0);
    
    // Pass aspect ratios to shader
    gl.uniform1f(cameraProgram.uniforms.uCanvasAspect, canvasAspect);
    gl.uniform1f(cameraProgram.uniforms.uVideoAspect, videoAspect);
    
    // Draw the camera feed (aspect-corrected, flipped)
    blit(target);
    
    // Restore blending state
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
}

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
    splat(pointer.texcoordX, pointer.texcoordY, dx, dy, pointer.color);
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

function splat (x, y, dx, dy, color) {
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
    if (!pointer.down) return;
    let posX = e.offsetX;
    let posY = e.offsetY;
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
        // Add haptic feedback if available
        if (navigator.vibrate) {
            navigator.vibrate(10);
        }
        
        // Optimize for mobile performance
        if (touches.length > 2) {
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
    }
    
    for (let i = 0; i < touches.length; i++) {
        let pointer = pointers[i + 1];
        if (!pointer.down) continue;
        const rect = canvas.getBoundingClientRect();
        let posX = touches[i].clientX - rect.left;
        let posY = touches[i].clientY - rect.top;
        updatePointerMoveData(pointer, posX, posY);
    }
}, { passive: false });

window.addEventListener('touchend', e => {
    const touches = e.changedTouches;
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
    if (e.ctrlKey || e.metaKey) { // metaKey for Mac Cmd key
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
    
    // Flipped interval logic: 0 = slow (1000ms), 1 = moderate (512ms)
    // Current 50% speed becomes new 100% maximum
    // At 10% slider (0.1): default comfortable speed
    const minInterval = 512;  // 0.512 seconds (moderate speed, was 50%)
    const maxInterval = 1000; // 1.0 seconds (slow)
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

// StreamDiffusion functionality
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

// Audio Blob System
let audioBlobState = {
    active: false,
    audioContext: null,
    analyser: null,
    microphone: null,
    dataArray: null,
    canvas: null,
    gl: null,
    animationId: null,
    frequencyData: new Uint8Array(256),
    bassLevel: 0,
    midLevel: 0,
    trebleLevel: 0,
    reactivity: 1.0,
    delay: 0,
    color: { r: 0, g: 0.831, b: 1 },
    selectedDeviceId: null,
    audioStream: null,
    delayBuffer: [],
    delayIndex: 0
};

const DAYDREAM_API_BASE = 'https://api.daydream.live/v1';
const PIPELINE_ID = 'pip_qpUgXycjWF6YMeSL';

function updateStreamStatus(status, className = '') {
    const statusElement = document.getElementById('streamStatus');
    if (statusElement) {
        statusElement.textContent = status;
        statusElement.className = `stream-status ${className}`;
    }
}

function updateStreamButton(isStreaming) {
    const button = document.getElementById('streamButton');
    if (button) {
        button.textContent = isStreaming ? 'Stop Stream' : 'Start Stream';
        button.className = isStreaming ? 'modern-button streaming' : 'modern-button';
    }
    
    // Show/hide copy stream URL button based on whether we have a valid stream
    const copyButton = document.getElementById('copyStreamUrlButton');
    if (copyButton) {
        // Show button if we have a playback ID (stream exists), regardless of popup state
        const hasValidStream = streamState.playbackId && streamState.streamId;
        copyButton.style.display = hasValidStream ? 'block' : 'none';
    }
}

async function copyStreamUrlToClipboard(forceShare = false) {
    if (!streamState.playbackId) {
        console.warn('No stream URL available to copy');
        return;
    }
    
    const streamUrl = `https://lvpr.tv/?v=${streamState.playbackId}&lowLatency=force`;
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
    const apiKey = document.getElementById('apiKeyInput').value;
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
    if (!streamState.streamId || !streamState.isStreaming) return;
    
    const now = Date.now();
    if (now - streamState.lastParameterUpdate < 500) return; // Reduced throttle time
    
    // Prevent overlapping requests
    if (streamState.isUpdatingParameters) return;
    streamState.isUpdatingParameters = true;
    
    try {
        const apiKey = document.getElementById('apiKeyInput').value;
        const prompt = document.getElementById('promptInput').value;
        const negativePrompt = document.getElementById('negativePromptInput').value;
        
        console.log('🔄 Updating stream parameters:', { prompt, negativePrompt });
        
        const params = {
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
        } else {
            const errorText = await response.text();
            console.error('❌ Parameter update failed:', {
                status: response.status,
                statusText: response.statusText,
                error: errorText,
                sentParams: params
            });
        }
    } catch (error) {
        console.warn('Failed to update stream parameters:', error);
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
            const expectedUrl = `https://lvpr.tv/?v=${playbackId}&lowLatency=force`;
            
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
    
    const streamUrl = `https://lvpr.tv/?v=${playbackId}&lowLatency=force`;

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

async function startStream() {
    let savedStream = null;
    let streamIsValid = false;
    
    try {
        updateStreamStatus('Connecting...', 'connecting');
        updateStreamButton(false);
        
        // Validate API key
        const apiKey = document.getElementById('apiKeyInput').value.trim();
        if (!apiKey) {
            throw new Error('Please enter your Daydream API key');
        }
        
        // Create canvas media stream
        streamState.mediaStream = canvas.captureStream(30);
        if (!streamState.mediaStream) {
            throw new Error('Failed to capture canvas stream');
        }
        
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
            } else {
                console.log('❌ Saved stream is no longer valid, creating new one...');
                clearStreamState(); // Clear invalid stream data
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
        }
        
        // Update button visibility now that we have a valid stream
        updateStreamButton(false); // Update copy button visibility
        
        // Open popup window
        updateStreamStatus('Opening player...', 'connecting');
        streamState.popupWindow = openStreamPopup(streamState.playbackId);
        
        // Setup WebRTC connection
        updateStreamStatus('Connecting to stream...', 'connecting');
        streamState.peerConnection = await setupWebRTCConnection(
            streamState.whipUrl,
            streamState.mediaStream
        );
        
        // Monitor connection state
        streamState.peerConnection.addEventListener('connectionstatechange', () => {
            const state = streamState.peerConnection.connectionState;
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
        let errorMessage = error.message;
        let shouldRetryWithNewStream = false;
        
        // Provide user-friendly error messages
        if (error.message.includes('API key')) {
            errorMessage = 'Invalid API key';
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

// Audio Blob System

async function toggleAudioBlob() {
    if (audioBlobState.active) {
        stopAudioBlob();
    } else {
        await startAudioBlob();
    }
}

async function startAudioBlob() {
    try {
        // Populate audio input devices
        await populateAudioInputs();
        
        // Get selected device or use default
        const deviceId = audioBlobState.selectedDeviceId;
        const constraints = {
            audio: deviceId ? { deviceId: { exact: deviceId } } : true
        };
        
        // Request microphone permission
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        audioBlobState.audioStream = stream;
        
        // Initialize Web Audio API
        audioBlobState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        audioBlobState.analyser = audioBlobState.audioContext.createAnalyser();
        audioBlobState.microphone = audioBlobState.audioContext.createMediaStreamSource(stream);
        
        // Configure analyser
        audioBlobState.analyser.fftSize = 512;
        audioBlobState.analyser.smoothingTimeConstant = 0.8;
        audioBlobState.microphone.connect(audioBlobState.analyser);
        
        // Get canvas and WebGL context
        audioBlobState.canvas = document.getElementById('audioBlobCanvas');
        audioBlobState.canvas.style.display = 'block';
        resizeAudioCanvas();
        
        // Initialize WebGL for audio blob
        initAudioBlobGL();
        
        // Update button state and show controls
        const button = document.getElementById('audioBlobButton');
        button.textContent = '🎵 Stop Audio';
        button.classList.add('streaming');
        
        // Show audio controls
        const audioControls = document.getElementById('audioControls');
        if (audioControls) {
            audioControls.style.display = 'block';
        }
        
        // Initialize delay buffer
        audioBlobState.delayBuffer = [];
        audioBlobState.delayIndex = 0;
        
        audioBlobState.active = true;
        
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
    if (audioBlobState.audioContext) {
        audioBlobState.audioContext.close();
    }
    if (audioBlobState.audioStream) {
        audioBlobState.audioStream.getTracks().forEach(track => track.stop());
        audioBlobState.audioStream = null;
    }
    
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
    button.textContent = '🎵 Audio Blob';
    button.classList.remove('streaming');
    
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
        
        // Noise function for organic blob shape
        float noise(vec2 p) {
            return sin(p.x * 12.9898 + p.y * 78.233) * 43758.5453;
        }
        
        float fbm(vec2 p) {
            float f = 0.0;
            f += 0.5 * sin(noise(p));
            f += 0.25 * sin(noise(p * 2.0));
            f += 0.125 * sin(noise(p * 4.0));
            return f;
        }
        
        void main() {
            vec2 uv = (v_position + 1.0) * 0.5;
            vec2 center = vec2(0.5, 0.5);
            vec2 pos = uv - center;
            
            float dist = length(pos);
            float angle = atan(pos.y, pos.x);
            
            // Audio-reactive blob parameters
            float baseSize = 0.15 + u_bassLevel * 0.3;
            float wobble = fbm(vec2(angle * 3.0, u_time * 2.0)) * 0.05;
            float midWobble = sin(angle * 5.0 + u_time * 3.0) * u_midLevel * 0.02;
            float trebleSpikes = sin(angle * 12.0 + u_time * 8.0) * u_trebleLevel * 0.015;
            
            float blobRadius = baseSize + wobble + midWobble + trebleSpikes;
            
            // Create soft blob edge
            float edge = smoothstep(blobRadius + 0.05, blobRadius - 0.05, dist);
            
            // Audio-reactive colors based on base color
            vec3 color = u_baseColor + vec3(
                u_bassLevel * 0.3,
                u_midLevel * 0.3,
                u_trebleLevel * 0.3
            );
            
            // Add glow effect
            float glow = exp(-dist * 3.0) * 0.3;
            color += vec3(glow * u_bassLevel);
            
            gl_FragColor = vec4(color, edge * 0.7);
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
        baseColor: gl.getUniformLocation(audioBlobState.shaderProgram, 'u_baseColor')
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

function renderAudioBlob() {
    if (!audioBlobState.active || !audioBlobState.gl) return;
    
    const gl = audioBlobState.gl;
    
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
    
    // Set up vertex attributes
    gl.bindBuffer(gl.ARRAY_BUFFER, audioBlobState.positionBuffer);
    gl.enableVertexAttribArray(audioBlobState.positionAttributeLocation);
    gl.vertexAttribPointer(audioBlobState.positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);
    
    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    
    // Continue animation
    audioBlobState.animationId = requestAnimationFrame(renderAudioBlob);
}

// Handle window resize for audio blob
window.addEventListener('resize', () => {
    if (audioBlobState.active) {
        resizeAudioCanvas();
    }
});

// Audio input device management
async function populateAudioInputs() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === 'audioinput');
        
        const select = document.getElementById('audioInputSelect');
        if (!select) return;
        
        // Clear existing options except default
        select.innerHTML = '<option value="">Default Microphone</option>';
        
        // Add available audio inputs
        audioInputs.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `Microphone ${device.deviceId.slice(0, 8)}`;
            select.appendChild(option);
        });
        
        // Set change listener
        select.addEventListener('change', (e) => {
            audioBlobState.selectedDeviceId = e.target.value || null;
            if (audioBlobState.active) {
                // Restart audio with new device
                stopAudioBlob();
                setTimeout(() => startAudioBlob(), 500);
            }
        });
        
    } catch (error) {
        console.warn('Could not enumerate audio devices:', error);
    }
}

// Audio streaming integration
async function integrateAudioWithStream() {
    if (!streamState.isStreaming || !audioBlobState.audioStream) return;
    
    try {
        // Get current video tracks from canvas stream
        const videoTracks = streamState.mediaStream.getVideoTracks();
        
        // Get audio tracks from audio stream
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

// Audio control handlers
function updateAudioReactivity(value) {
    audioBlobState.reactivity = value;
    document.getElementById('audioReactivityValue').textContent = value.toFixed(1);
}

function updateAudioDelay(value) {
    audioBlobState.delay = Math.round(value);
    document.getElementById('audioDelayValue').textContent = audioBlobState.delay + 'ms';
    
    // Resize delay buffer based on sample rate (assuming 60fps analysis)
    const bufferSize = Math.max(1, Math.round(audioBlobState.delay / 16.67)); // 60fps = ~16.67ms per frame
    audioBlobState.delayBuffer = new Array(bufferSize).fill({
        bassLevel: 0,
        midLevel: 0,
        trebleLevel: 0
    });
    audioBlobState.delayIndex = 0;
}

function updateAudioBlobColor(color) {
    // Parse hex color to RGB
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16) / 255;
    const g = parseInt(hex.substr(2, 2), 16) / 255;
    const b = parseInt(hex.substr(4, 2), 16) / 255;
    
    audioBlobState.color = { r, g, b };
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

updateSliderValue = function(sliderName, percentage) {
    originalUpdateSliderValue(sliderName, percentage);
    
    // Handle denoise slider synchronization
    if (['denoiseX', 'denoiseY', 'denoiseZ'].includes(sliderName)) {
        syncDenoiseSliders(sliderName);
    }
    
    // Trigger parameter update for StreamDiffusion sliders with debouncing
    if (['denoiseX', 'denoiseY', 'denoiseZ', 'inferenceSteps', 'seed', 'controlnetPose', 'controlnetHed', 'controlnetCanny', 'controlnetDepth', 'controlnetColor', 'guidanceScale', 'delta'].includes(sliderName)) {
        debouncedSliderParameterUpdate();
    }
};



function syncDenoiseSliders(changedSlider) {
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
    STREAM_STATE: STORAGE_PREFIX + 'streamState'
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

// Simple obfuscation for API key (not cryptographically secure, just basic protection)
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
        // Set default values if no saved prompts
        if (promptInput && !promptInput.value) {
            promptInput.value = 'blooming flower with delicate petals, vibrant colors, soft natural lighting, botanical beauty, detailed macro photography, spring garden atmosphere';
            console.log('✅ Set default prompt: blooming flower');
        }
        if (negativePromptInput && !negativePromptInput.value) {
            negativePromptInput.value = 'blurry, low quality, flat, 2d';
            console.log('✅ Set default negative prompt');
        }
    }
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
    return null;
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
        
        // Focus on the API key input after a short delay (only if no saved key)
        setTimeout(() => {
            if (apiKeyInput && !savedApiKey) {
                apiKeyInput.focus();
            }
        }, 500);
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
    // Check if API key is already saved
    const savedApiKey = getApiKey();
    
    if (!savedApiKey) {
        // No API key saved, show welcome overlay
        showWelcomeOverlay();
    }
    
    // Set up event listeners
    const startButton = document.getElementById('welcomeStartButton');
    if (startButton) {
        startButton.addEventListener('click', function() {
            // Save API key if provided and consent is checked
            saveWelcomeApiKey();
            
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
    if (confirm('Are you sure you want to reset all slider values to defaults? This will not affect your prompt, API key, or other input fields.')) {
        // Reset config values to defaults (keeping input fields unchanged)
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
        
        if (promptInput) promptInput.value = 'blooming flower with delicate petals, vibrant colors, soft natural lighting, botanical beauty, detailed macro photography, spring garden atmosphere';
        if (negativePromptInput) negativePromptInput.value = 'blurry, low quality, flat, 2d';
        if (apiKeyInput) apiKeyInput.value = '';
        if (consentCheckbox) consentCheckbox.checked = false;
        
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
        updateSliderPositions();
        updateToggleStates();
        loadPrompts();
        loadApiKey();
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
}

// Initialize parameter listeners when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    try {
        initializeStreamParameterListeners();
        initializeLocalStorage();
        initializeColoris();
        initializeMobilePanelGestures();
        initializeWelcomeOverlay();
        initializeIdleAnimation();
        initializeMediaUpload();
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
            // Curated 10-color palette
            '#FFD700', '#FFF400', '#FF4500', '#FF1493', '#8A2BE2', 
            '#4169E1', '#3B74FF', '#0000FF', '#00BFFF', '#00FFFF'
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

// Cleanup video recording and camera when page is closed
window.addEventListener('beforeunload', () => {
    if (videoRecorder.isRecording) {
        cleanup();
    }
    
    // Stop camera if active
    if (cameraFeed.active) {
        stopCamera();
    }
});