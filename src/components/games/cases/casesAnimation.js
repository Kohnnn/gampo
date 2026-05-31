export const CASE_LID_LIFT_MS = 420
export const CASE_REVEAL_MS = 5200
export const CASE_SETTLE_PAD_MS = 180
export const CASE_TILE_PX = 100
export const CASE_PRIZE_INDEX = 28
export const CASE_LIGHT_SWEEP_LEAD_MS = 1500
export const CASE_PRIZE_ZOOM_LEAD_MS = 760

export const CASE_CELEBRATION_RARITIES = new Set([
    'Restricted',
    'Classified',
    'Covert',
    'Extraordinary',
    'Contraband',
    '★',
])

export function finalPrizeOffset(jitter = 0, prizeIndex = CASE_PRIZE_INDEX, tilePx = CASE_TILE_PX) {
    return -((prizeIndex * tilePx) - 50) + jitter
}

export function casePhaseLabel(phase, rows = 1) {
    const rowText = rows > 1 ? `${rows} rows` : 'case'
    if (phase === 'lid') return 'Lifting lid...'
    if (phase === 'finale' || phase === 'zoom') return 'Locking prize...'
    if (phase === 'settling') return 'Settling drop...'
    return `Unboxing ${rowText}...`
}

export function shouldCelebrateDrop(drop) {
    return Boolean(drop && (CASE_CELEBRATION_RARITIES.has(drop.rarity) || drop.statTrak || drop.souvenir))
}

export function pickCelebrationDrop(drops = []) {
    return drops
        .filter(shouldCelebrateDrop)
        .sort((a, b) => (b.multiplier || 0) - (a.multiplier || 0))[0] || null
}
