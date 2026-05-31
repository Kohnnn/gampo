export const CASE_LID_LIFT_MS = 420
export const CASE_REVEAL_MS = 5200
export const CASE_SETTLE_PAD_MS = 180
export const CASE_TILE_PX = 100
export const CASE_PRIZE_INDEX = 28
export const CASE_LIGHT_SWEEP_LEAD_MS = 1500
export const CASE_PRIZE_ZOOM_LEAD_MS = 760
export const CASE_OPEN_PHASES = ['idle', 'arming', 'lid', 'spin', 'slowdown', 'land', 'reveal', 'settled']
export const CASE_VISIBLE_PHASES = ['arming', 'lid', 'spin', 'slowdown', 'land', 'reveal']

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
    if (phase === 'arming') return 'Preparing drop...'
    if (phase === 'lid') return 'Lifting lid...'
    if (phase === 'spin') return `Rolling ${rowText}...`
    if (phase === 'slowdown') return 'Slowing reel...'
    if (phase === 'land') return 'Pointer locked...'
    if (phase === 'reveal') return 'Revealing result...'
    if (phase === 'settled') return 'Drop recorded'
    return `Unboxing ${rowText}...`
}

export function casePhaseIndex(phase) {
    return CASE_OPEN_PHASES.indexOf(phase)
}

export function hasReachedCasePhase(current, target) {
    const currentIndex = casePhaseIndex(current)
    const targetIndex = casePhaseIndex(target)
    return currentIndex >= 0 && targetIndex >= 0 && currentIndex >= targetIndex
}

export function claimCaseSettlement(pendingRound) {
    if (!pendingRound || pendingRound.settled) return false
    pendingRound.settled = true
    return true
}

export function summarizeCaseSettlement({ picks = [], stake = 0, rows = picks.length } = {}) {
    const safePicks = Array.isArray(picks) ? picks : []
    const totalReturn = Math.max(0, Math.round(safePicks.reduce((sum, pick) => sum + (Number(pick?.valueGc) || 0), 0) * 100) / 100)
    const safeStake = Math.max(0, Math.round((Number(stake) || 0) * 100) / 100)
    const profit = Math.round((totalReturn - safeStake) * 100) / 100
    return {
        rows: Number(rows) || safePicks.length,
        resultCount: safePicks.length,
        stake: safeStake,
        totalReturn,
        profit,
        perRow: safePicks.map((pick, index) => ({
            index,
            name: pick?.name || '',
            valueGc: Math.max(0, Math.round((Number(pick?.valueGc) || 0) * 100) / 100),
            profitGc: Math.round(((Number(pick?.valueGc) || 0) - (safePicks.length ? safeStake / safePicks.length : 0)) * 100) / 100,
        })),
    }
}

export function shouldCelebrateDrop(drop) {
    return Boolean(drop && (CASE_CELEBRATION_RARITIES.has(drop.rarity) || drop.statTrak || drop.souvenir))
}

export function pickCelebrationDrop(drops = []) {
    return drops
        .filter(shouldCelebrateDrop)
        .sort((a, b) => (b.multiplier || 0) - (a.multiplier || 0))[0] || null
}
