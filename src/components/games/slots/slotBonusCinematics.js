// slotBonusCinematics.js — bespoke per-theme bonus-entry cinematics.
//
// When a free-spin session opens (and on the vault-burst entry) the UI plays a
// short, themed intro before the bonus reels begin. Each template maps to a
// "motion family" (the CSS animation choreography) plus theme-specific copy,
// a glyph, and an accent. This file is pure data + a resolver; it touches no
// DOM and no game math, so RTP is unaffected.
//
// Motion families (see slots.css `.slot-bonus-cine.cine-*`):
//   open  — gates/doors split outward (ascension reveal)
//   rise  — element rises/ignites from below (fire, spirits)
//   slash — a blade wipe crosses the stage (samurai/ronin)
//   burst — radial shockwave punch (vault/jackpot energy)
//   drift — soft particles drift in (sweets, lanterns, bayou)

const FALLBACK = {
    family: 'burst',
    glyph: '✦',
    eyebrow: 'BONUS',
    title: 'Free Spins',
    caption: 'Bonus round unlocked',
}

// Keyed by template id. Every one of the 20 templates is covered.
const CINEMATICS = {
    'vault-rush': {
        family: 'burst',
        glyph: '🏦',
        eyebrow: 'VAULT CRACKED',
        title: 'Vault Burst',
        caption: 'The vault doors blow open',
    },
    'river-catcher': {
        family: 'drift',
        glyph: '🎣',
        eyebrow: 'BIG CATCH',
        title: 'Free Spins',
        caption: 'The hook reels in the bonus',
    },
    'dust-rail': {
        family: 'slash',
        glyph: '⭐',
        eyebrow: 'WANTED',
        title: 'Bounty Spins',
        caption: 'Sheriff badges call the posse',
    },
    'storm-banner': {
        family: 'rise',
        glyph: '⚡',
        eyebrow: 'ASGARD CALLS',
        title: 'Storm Spins',
        caption: 'Runes summon the storm banner',
    },
    'bassline-bonus': {
        family: 'rise',
        glyph: '🎸',
        eyebrow: 'ENCORE',
        title: 'Free Spins',
        caption: 'The bassline drops the bonus',
    },
    'scarab-spin': {
        family: 'open',
        glyph: '🪲',
        eyebrow: 'SANDS PART',
        title: 'Scarab Spins',
        caption: 'Golden scarabs lock the reels',
    },
    bars: {
        family: 'burst',
        glyph: '7',
        eyebrow: 'TRIPLE SEVEN',
        title: 'Jackpot',
        caption: 'The classic reels strike gold',
    },
    'blue-samurai': {
        family: 'slash',
        glyph: '⚔',
        eyebrow: 'BUSHIDO',
        title: 'Wild Reels',
        caption: 'The samurai cuts the reels wild',
    },
    'wanted-revelation': {
        family: 'open',
        glyph: '🤠',
        eyebrow: 'REVELATION',
        title: 'Free Spins',
        caption: 'The wanted poster turns over',
    },
    'gates-ascent': {
        family: 'open',
        glyph: '🏛',
        eyebrow: 'OLYMPUS OPENS',
        title: 'Gates Ascent',
        caption: 'The gates of heaven swing wide',
    },
    'bass-bayou': {
        family: 'drift',
        glyph: '🐟',
        eyebrow: 'BAYOU TROPHY',
        title: 'Collect Spins',
        caption: 'The angler wades into the bonus',
    },
    'mummy-cascade': {
        family: 'open',
        glyph: '🏺',
        eyebrow: 'TOMB OPENS',
        title: 'Flame Spins',
        caption: 'The sarcophagus cracks alight',
    },
    'phoenix-megaways': {
        family: 'rise',
        glyph: '🔥',
        eyebrow: 'REBIRTH',
        title: 'Phoenix Spins',
        caption: 'The phoenix rises from the ash',
    },
    'mansion-megaways': {
        family: 'open',
        glyph: '🕯',
        eyebrow: 'MANSION WAKES',
        title: 'Haunt Spins',
        caption: 'The mansion doors creak open',
    },
    'ghostblade-strike': {
        family: 'slash',
        glyph: '👻',
        eyebrow: 'SPIRIT STRIKE',
        title: 'Ghostblade Spins',
        caption: 'The spectral blade slices through',
    },
    'iron-fist': {
        family: 'burst',
        glyph: '🥊',
        eyebrow: 'KNOCKOUT',
        title: 'Demolition Spins',
        caption: 'The gong rings the bonus in',
    },
    'coop-cluck': {
        family: 'burst',
        glyph: '🥚',
        eyebrow: 'BARN BURST',
        title: 'Cluck Spins',
        caption: 'The coop bursts with golden eggs',
    },
    'miko-spirit': {
        family: 'drift',
        glyph: '🏮',
        eyebrow: 'SPIRITS RISE',
        title: 'Lantern Spins',
        caption: 'Lanterns float the shrine open',
    },
    'forge-anvil': {
        family: 'burst',
        glyph: '🔨',
        eyebrow: 'STRIKE THE ANVIL',
        title: 'Forge Spins',
        caption: 'The hammer sparks the forge',
    },
    'gummy-drops': {
        family: 'drift',
        glyph: '🍬',
        eyebrow: 'SUGAR RUSH',
        title: 'Sweet Spins',
        caption: 'Gummies tumble into the bonus',
    },
}

// Optional secondary line by entry kind so the same template reads correctly
// whether the bonus opened via scatters/free-spins or a vault-style burst.
const KIND_HINTS = {
    'free-spins': 'spins',
    'coin-meter-fill': 'burst',
}

export function getBonusCinematic(templateId, { kind = 'free-spins', freeSpins = 0, accent } = {}) {
    const base = CINEMATICS[templateId] || FALLBACK
    const spinsLabel = freeSpins > 0
        ? `${freeSpins} free ${freeSpins === 1 ? 'spin' : 'spins'}`
        : (KIND_HINTS[kind] === 'burst' ? 'Vault free spins' : 'Free spins')
    return {
        templateId: templateId || null,
        family: base.family,
        glyph: base.glyph,
        eyebrow: base.eyebrow,
        title: base.title,
        caption: base.caption,
        spinsLabel,
        accent: accent || null,
        kind,
    }
}

export const BONUS_CINEMATIC_IDS = Object.keys(CINEMATICS)
export const BONUS_CINEMATIC_MS = 1500
