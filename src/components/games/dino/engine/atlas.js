// Sprite atlas frame coordinates extracted from
// public/dino-assets/sprites/dino-atlas.json. Image is 2402×128.
// Keep this file in sync with the atlas JSON if it changes.

export const ATLAS_SRC = '/dino-assets/sprites/dino-atlas.png'

// frame: { x, y, w, h }
export const FRAMES = {
    ground:        { x: 1,    y: 1,   w: 2400, h: 24 },
    'cactus-large-3': { x: 1,    y: 27,  w: 150,  h: 100 },
    'cactus-large-2': { x: 153,  y: 27,  w: 100,  h: 100 },
    'cactus-large-1': { x: 255,  y: 27,  w: 50,   h: 100 },
    'cactus-small-3': { x: 1263, y: 27,  w: 102,  h: 70 },
    'cactus-small-2': { x: 1367, y: 27,  w: 68,   h: 70 },
    'cactus-small-1': { x: 1437, y: 27,  w: 34,   h: 70 },
    'dino-idle-1': { x: 397, y: 27, w: 88, h: 94 },
    'dino-idle-2': { x: 487, y: 27, w: 88, h: 94 },
    'dino-run-1':  { x: 577, y: 27, w: 88, h: 94 },
    'dino-run-2':  { x: 667, y: 27, w: 88, h: 94 },
    'dino-start':  { x: 757, y: 27, w: 88, h: 90 },
    'dino-dead':   { x: 847, y: 27, w: 80, h: 86 },
    'dino-duck-1': { x: 1641, y: 27, w: 118, h: 60 },
    'dino-duck-2': { x: 1761, y: 27, w: 118, h: 60 },
    'bird-1':      { x: 1473, y: 27, w: 92, h: 68 },
    'bird-2':      { x: 1881, y: 27, w: 92, h: 60 },
    cloud:         { x: 1263, y: 99, w: 92, h: 27 },
    'moon-1':      { x: 929,  y: 27, w: 80, h: 80 },
    'star-1':      { x: 929,  y: 109, w: 18, h: 18 },
    'star-2':      { x: 949,  y: 109, w: 18, h: 18 },
    'star-3':      { x: 969,  y: 109, w: 18, h: 18 },
}

export const RUN_CYCLE   = ['dino-run-1', 'dino-run-2']
export const IDLE_CYCLE  = ['dino-idle-1', 'dino-idle-2']
export const DUCK_CYCLE  = ['dino-duck-1', 'dino-duck-2']
export const BIRD_CYCLE  = ['bird-1', 'bird-2']
export const CACTI       = ['cactus-small-1', 'cactus-small-2', 'cactus-small-3', 'cactus-large-1', 'cactus-large-2', 'cactus-large-3']

// Cache the atlas image once.
let atlasImage = null
export function loadAtlas() {
    if (atlasImage) return atlasImage
    const img = new Image()
    img.src = ATLAS_SRC
    atlasImage = img
    return img
}
