// Per-game resource manifest for Stake/Rainbet originals.
//
// IMPORTANT: This file lists clone-owned asset PATHS only. No proprietary
// Stake/Rainbet binaries are committed. Missing roles return null at
// runtime and the game falls back to CSS/SVG primitives.
//
// Paths point inside `public/images/originals/<slug>/` and
// `public/audio/originals/<slug>/`. The audio system uses
// `src/audio/sfxManifest.js` for sound roles; this file covers visual
// resources only.
//
// Manifest schema:
//   {
//     [slug]: {
//       skin: 'stake' | 'rainbet',
//       cover?: '/images/covers/generated/<slug>.png',
//       stage: { [role]: '/images/originals/<slug>/<file>' },
//       preload: [role, role, ...]
//     }
//   }

export const originalsManifest = {
    dice: {
        skin: 'stake',
        cover: '/images/covers/generated/dice.png',
        stage: {
            // Wave 1 ships without raster stage assets for Dice; the game
            // renders pure CSS/SVG. Future audio + image batches can fill
            // these without touching DiceGame.jsx.
        },
        preload: [],
    },
    mines: {
        skin: 'stake',
        cover: '/images/covers/generated/mines.png',
        stage: {
            // Wave 2 manifests are structure-only. Existing Mines art under
            // /images/mines stays in place; raster stage assets land in
            // dedicated image batches later.
        },
        preload: [],
    },
    keno: {
        skin: 'stake',
        cover: '/images/covers/generated/keno.png',
        stage: {},
        preload: [],
    },
    limbo: {
        skin: 'stake',
        cover: '/images/covers/generated/limbo.png',
        stage: {},
        preload: [],
    },
    crash: {
        skin: 'stake',
        cover: '/images/covers/generated/crash.png',
        stage: {},
        preload: [],
    },
    plinko: {
        skin: 'stake',
        cover: '/images/covers/generated/plinko.png',
        stage: {},
        preload: [],
    },
    wheel: {
        skin: 'stake',
        cover: '/images/covers/generated/wheel.png',
        stage: {},
        preload: [],
    },
    blackjack: {
        skin: 'stake',
        cover: '/images/covers/generated/blackjack.png',
        stage: {},
        preload: [],
    },
    hilo: {
        skin: 'stake',
        cover: '/images/covers/generated/hilo.png',
        stage: {},
        preload: [],
    },
    baccarat: {
        skin: 'stake',
        cover: '/images/covers/generated/baccarat.png',
        stage: {},
        preload: [],
    },
    videopoker: {
        skin: 'stake',
        cover: '/images/covers/generated/video-poker.png',
        stage: {},
        preload: [],
    },
    flip: {
        skin: 'stake',
        cover: '/images/covers/generated/coinflip.png',
        stage: {},
        preload: [],
    },
    diamonds: {
        skin: 'stake',
        cover: '/images/covers/generated/keno.png',
        stage: {},
        preload: [],
    },
    darts: {
        skin: 'stake',
        cover: '/images/covers/generated/wheel.png',
        stage: {},
        preload: [],
    },
    pump: {
        skin: 'stake',
        cover: '/images/covers/generated/tower.png',
        stage: {},
        preload: [],
    },
    slide: {
        skin: 'stake',
        cover: '/images/covers/generated/limbo.png',
        stage: {},
        preload: [],
    },
    moles: {
        skin: 'stake',
        cover: '/images/covers/generated/mines.png',
        stage: {},
        preload: [],
    },
    snakes: {
        skin: 'stake',
        cover: '/images/covers/generated/tower.png',
        stage: {},
        preload: [],
    },
    cases: {
        skin: 'stake',
        cover: '/images/covers/generated/lottery.png',
        stage: {},
        preload: [],
    },
    drill: {
        skin: 'stake',
        cover: '/images/covers/generated/tower.png',
        stage: {},
        preload: [],
    },
    packs: {
        skin: 'stake',
        cover: '/images/covers/generated/lottery.png',
        stage: {},
        preload: [],
    },
    tomeoflife: {
        skin: 'stake',
        cover: '/images/covers/generated/limbo.png',
        stage: {},
        preload: [],
    },
    tarot: {
        skin: 'stake',
        cover: '/images/covers/generated/baccarat.png',
        stage: {},
        preload: [],
    },
    'scarab-spin': {
        skin: 'stake',
        cover: '/images/covers/generated/slots.png',
        stage: {},
        preload: [],
    },
    bars: {
        skin: 'stake',
        cover: '/images/covers/generated/slots.png',
        stage: {},
        preload: [],
    },
    'blue-samurai': {
        skin: 'stake',
        cover: '/images/covers/generated/slots.png',
        stage: {},
        preload: [],
    },
    war: {
        skin: 'stake',
        cover: '/images/covers/generated/casino-war.png',
        stage: {},
        preload: [],
    },
    chickencross: {
        skin: 'stake',
        cover: '/images/covers/generated/chickencross.png',
        stage: {},
        preload: [],
    },
    tower: {
        skin: 'stake',
        cover: '/images/covers/generated/tower.png',
        stage: {},
        preload: [],
    },
    // Other slugs land in their own waves: Wave 2 retrofits, Wave 3/4 net-new.
}

// Look up a role on a manifest entry. Returns null when missing so the
// game can fall through to default rendering without throwing.
export function resolveRole(slug, role) {
    const entry = originalsManifest[slug]
    if (!entry) return null
    if (role === 'cover') return entry.cover || null
    const path = role.split('.').reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : null), entry)
    if (typeof path === 'string') return path
    if (entry.stage && typeof entry.stage === 'object') {
        const direct = entry.stage[role] || entry.stage[role.replace(/^stage\./, '')]
        if (typeof direct === 'string') return direct
    }
    return null
}
