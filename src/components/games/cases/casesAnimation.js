export const CASE_LID_LIFT_MS = 420
export const CASE_REVEAL_MS = 5200
export const CASE_SETTLE_PAD_MS = 180
export const CASE_TILE_PX = 118
export const CASE_TILE_GAP_PX = 4
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

// Wave 36 P4: map rarity name to per-rarity drop stinger SFX role
export const RARITY_SFX_MAP = {
    // Quiet tier: subtle thud
    'Consumer': 'rarityQuiet',
    'Industrial': 'rarityQuiet',
    'Mil-Spec': 'rarityQuiet',
    // Medium tier: mild reveal tone
    'Restricted': 'rarityMedium',
    'Remarkable': 'rarityMedium',
    'High': 'rarityMedium',
    // Loud tier: full fanfare
    'Covert': 'rarityCovert',
    'Extraordinary': 'rarityCovert',
    'Classified': 'rarityCovert',
    'Contraband': 'rarityContraband',
    '★': 'rarityStar',
}

export function getRaritySfxRole(drop) {
    if (!drop) return null
    return RARITY_SFX_MAP[drop.rarity] || null
}

// Wave 2: rarity priority order for "highest wins" arbitration on bulk opens.
// Higher number = louder. Used to collapse a batch of drops into a single
// stinger (e.g. a ×10 bulk open plays the rarest stinger, not all 10).
const RARITY_PRIORITY = {
    rarityQuiet: 1,
    rarityMedium: 2,
    rarityRestricted: 3,
    rarityCovert: 4,
    rarityContraband: 5,
    rarityStar: 6,
}

export function pickHighestRarityRole(drops) {
    if (!Array.isArray(drops) || drops.length === 0) return null
    let winner = null
    let winnerPriority = 0
    for (const drop of drops) {
        const role = getRaritySfxRole(drop)
        if (!role) continue
        const priority = RARITY_PRIORITY[role] || 0
        if (priority > winnerPriority) {
            winnerPriority = priority
            winner = role
        }
    }
    return winner
}

// Wave 2: cooldown gate for the rarity stinger. Without this, a ×10 bulk
// open that completes within a few seconds would spam 10 overlapping stingers
// (and a fast bulk re-trigger would re-stinger instantly). 200 ms is the
// sweet spot: long enough to avoid overlaps, short enough that the user
// perceives a clean hit.
const RARITY_STINGER_COOLDOWN_MS = 200
let lastRarityStingerAt = 0

export function shouldPlayRarityStinger(enabled, now = Date.now()) {
    if (!enabled) return false
    if (now - lastRarityStingerAt < RARITY_STINGER_COOLDOWN_MS) return false
    lastRarityStingerAt = now
    return true
}

export function _resetRarityStingerCooldown() {
    lastRarityStingerAt = 0
}

export function finalPrizeOffset(jitter = 0, prizeIndex = CASE_PRIZE_INDEX, tilePx = CASE_TILE_PX, gapPx = CASE_TILE_GAP_PX) {
    const stride = tilePx + gapPx
    return -((prizeIndex * stride) + (tilePx / 2)) + jitter
}

export function getCaseReelMetrics(element) {
    if (!element || typeof window === 'undefined') {
        return { tilePx: CASE_TILE_PX, gapPx: CASE_TILE_GAP_PX }
    }
    const tile = element.querySelector?.('.cases-carousel-tile')
    if (tile?.offsetWidth > 0) {
        const stride = tile.nextElementSibling ? tile.nextElementSibling.offsetLeft - tile.offsetLeft : 0
        return { tilePx: tile.offsetWidth, gapPx: stride > 0 ? stride - tile.offsetWidth : CASE_TILE_GAP_PX }
    }
    const style = window.getComputedStyle(element)
    const tilePx = parseFloat(style.getPropertyValue('--case-tile-px')) || CASE_TILE_PX
    const gapPx = parseFloat(style.getPropertyValue('--case-tile-gap')) || CASE_TILE_GAP_PX
    return { tilePx, gapPx }
}

export function getCaseReelStartOffset(tilePx = CASE_TILE_PX, gapPx = CASE_TILE_GAP_PX) {
    return -((tilePx + gapPx) * 4)
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

/**
 * QA040: settle an accepted Cases round, accounting only.
 *
 * Claims the round (idempotent, so a reveal timer and an unmount cannot both
 * pay), credits the return, records the drops, and writes history plus round
 * finish. Deliberately free of timers, audio, haptics and React state: the unmount
 * path calls this after teardown, so anything that scheduled work or touched state
 * would keep a dead component alive or throw before the credit landed.
 *
 * Presentation (results panel, celebration, toast, scroll, sound) stays in the
 * component's `finishPendingRound`.
 *
 * Returns the settlement plus the derived figures the UI needs.
 */
export function applyCaseAccounting(pendingRound, {
    addWinnings, collection, recordProgressCaseDrop, session, machine,
    skipped = false, newId = () => Math.random().toString(36).slice(2),
} = {}) {
    const pending = pendingRound
    if (!claimCaseSettlement(pending)) return null

    const picks = Array.isArray(pending.picks) ? pending.picks : []
    const caseData = pending.caseData || {}
    const stake = Number(pending.stake) || 0
    const rows = Number(pending.rows) || picks.length
    const settlement = summarizeCaseSettlement({ picks, stake, rows })
    const returnAmount = settlement.totalReturn
    const profit = settlement.profit
    const averageMultiplier = stake > 0 ? returnAmount / stake : 0
    const won = profit > 0

    if (returnAmount > 0) addWinnings(returnAmount, 'Cases return')
    for (const pick of picks) {
        collection.recordDrop(pick, { caseId: caseData.id, caseName: caseData.name, openPriceGc: pick.openPriceGc })
        recordProgressCaseDrop(pick)
    }

    // History is the player's durable round ledger, so it must survive a leave
    // even though the reveal never was shown.
    session.record({
        id: newId(),
        label: `${caseData.name} x${rows}`,
        profit, betAmount: stake, multiplier: averageMultiplier,
        meta: {
            picks: picks.map(p => ({
                id: p.skinId, rarity: p.rarity, multiplier: p.multiplier,
                valueGc: p.valueGc, openPriceGc: p.openPriceGc,
                wear: p.wear, statTrak: p.statTrak,
            })),
        },
    })
    machine.finish({
        kind: won ? 'win' : 'lose',
        profit,
        multiplier: averageMultiplier,
        picks: picks.map(p => p.skinId),
        // Only teardown and explicit skip pass `skipped`; a completed reveal must
        // not be reported as a skip.
        skipped,
    })

    return { ...settlement, picks, returnAmount, profit, averageMultiplier, won }
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
