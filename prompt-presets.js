// Prompt presets shared by the page (preset buttons, keys 1-6) and the Telegram
// bot in local-osc-server.js, so both always offer the same list.
const PROMPT_PRESETS = [
    { name: 'Blooming Flower', prompt: 'blooming flower with delicate petals, vibrant colors, soft natural lighting, botanical beauty, detailed macro photography, spring garden atmosphere' },
    { name: 'Jellyfish Ballet', prompt: 'giant glowing jellyfish, slow graceful movement, neon blue and pink bioluminescence, flowing tendrils like silk, underwater ballet, dreamlike ocean atmosphere' },
    { name: 'Fractal Jellyfish', prompt: 'evolving fractal jellyfish, recursive growth, rainbow light trails, kaleidoscopic motion' },
    { name: 'Aurora Mountains', prompt: 'northern lights over snow-capped mountains, aurora borealis, starry night sky, ethereal green and purple lights, pristine wilderness' },
    { name: 'Floating Islands', prompt: 'floating islands with waterfalls, magical gardens, ethereal mist, fantasy landscape, soft pastel colors, Studio Ghibli style' },
    { name: 'Magic Forest', prompt: 'bioluminescent mushrooms, glowing forest at night, magical blue and green lights, fairy tale atmosphere, mystical fog' },
    { name: 'Cotton Candy', prompt: 'fluffy cotton candy texture, pastel pink and blue swirls, soft dreamy atmosphere, sweet confection, carnival vibes, whimsical and light' },
    { name: 'Spirit River', prompt: 'glowing water streams, ghostly silhouettes drifting, soft ethereal mist' },
    { name: 'Jellyfish Eye', prompt: 'hyperrealistic eye macro shot, extreme close-up iris detail, glowing jellyfish reflected in the eye, wet glossy texture, ultra-sharp eyelashes, cinematic lighting, surreal bioluminescent glow inside the pupil, hyper-detailed photorealism' },
    { name: 'Spirit Eye', prompt: 'hyperrealistic human eye close-up, iris patterned like coral reef, glowing jellyfish swimming inside reflection, golden sunlight refracting in water-like cornea, organic textures, magical natural atmosphere, ultra-detailed vibrant realism' },
    { name: 'Underwater Corals', prompt: 'vibrant coral reef city, tropical fishes and jellyfishes swimming, underwater sunbeams, crystal clear water, marine life paradise' },
    { name: 'Lightning Storm', prompt: 'electric lightning bolts, storm clouds, energy discharge, dramatic sky, purple and white electricity, powerful atmosphere' },
    { name: 'Fractal Spell Casting', prompt: 'magical spell effects, glowing runes, mystical energy swirls, fantasy magic, ethereal particles, wizard\'s study, arcane symbols, kaleidoscopic motion' },
    { name: 'Van Gogh', prompt: 'Van Gogh style swirling sky, impressionist brushstrokes, flowing paint texture, vibrant yellows and blues, artistic masterpiece' }
];

if (typeof module !== 'undefined') module.exports = PROMPT_PRESETS;
