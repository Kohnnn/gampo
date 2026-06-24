import { nextRoll } from '../../../utils/fairRng'
import { rarityDropWeight, roundGc, roundSignedGc } from './caseEconomy'
import {
    CASE_CELEBRATION_RARITIES,
    CASE_PRIZE_INDEX,
    CASE_TILE_GAP_PX,
    CASE_TILE_PX,
    finalPrizeOffset,
} from './casesAnimation'

export const CASE_CAROUSEL_VISIBLE = 32
export const STATTRAK_CHANCE = 0.1
export const SOUVENIR_CHANCE = 0.06

export const STANDARD_WEARS = [
    { wear: 'Factory New',    short: 'FN', minFloat: 0.00, maxFloat: 0.07, weight: 12, mult: 1.10 },
    { wear: 'Minimal Wear',   short: 'MW', minFloat: 0.07, maxFloat: 0.15, weight: 22, mult: 1.04 },
    { wear: 'Field-Tested',   short: 'FT', minFloat: 0.15, maxFloat: 0.38, weight: 36, mult: 1.00 },
    { wear: 'Well-Worn',      short: 'WW', minFloat: 0.38, maxFloat: 0.45, weight: 18, mult: 0.92 },
    { wear: 'Battle-Scarred', short: 'BS', minFloat: 0.45, maxFloat: 1.00, weight: 12, mult: 0.85 },
]

// `rarityWeight` is kept as a thin alias so existing call sites/tests stay
// stable, but the weights themselves live in caseEconomy.js as the single
// source of truth shared with the EV math and the player-facing odds table.
export const rarityWeight = rarityDropWeight

export function weightedPick(items = [], roll = nextRoll('cases').roll) {
    const totalWeight = items.reduce((s, it) => s + rarityWeight(it), 0)
    const r = roll * totalWeight
    let acc = 0
    for (const it of items) {
        acc += rarityWeight(it)
        if (r < acc) return it
    }
    return items[items.length - 1]
}

export function pickWear(roll = nextRoll('cases-wear').roll) {
    const total = STANDARD_WEARS.reduce((s, w) => s + w.weight, 0)
    let r = roll * total
    for (const w of STANDARD_WEARS) {
        r -= w.weight
        if (r <= 0) return w
    }
    return STANDARD_WEARS[STANDARD_WEARS.length - 1]
}

export function rollFloatForWear(wear, roll = nextRoll('cases-float').roll) {
    if (!wear) return 0.18
    const span = wear.maxFloat - wear.minFloat
    return Math.round((wear.minFloat + roll * span) * 1000) / 1000
}

export function buildCaseOutcome(base = {}, {
    unitPrice = 1,
    wear = pickWear(),
    float = rollFloatForWear(wear),
    statTrak = nextRoll('cases-st').roll < STATTRAK_CHANCE,
    souvenir,
} = {}) {
    const actualSouvenir = souvenir ?? (!statTrak && nextRoll('cases-sv').roll < SOUVENIR_CHANCE)
    const wearMult = wear?.mult || 1
    const stMult = statTrak ? 1.6 : 1
    const svMult = actualSouvenir ? 1.3 : 1
    const valueGc = roundGc((base.valueGc || base.multiplier || 1) * wearMult * stMult * svMult, 1)
    const multiplier = unitPrice > 0 ? roundGc(valueGc / unitPrice, 0) : 0
    const skinId = base.skinId || base.id
    const variantKey = [
        skinId,
        wear?.short || 'NA',
        Number(float).toFixed(3),
        statTrak ? 'ST' : 'REG',
        actualSouvenir ? 'SV' : 'STD',
    ].join(':')

    return {
        ...base,
        skinId,
        wear: wear?.wear,
        wearShort: wear?.short,
        float,
        statTrak,
        souvenir: actualSouvenir,
        multiplier,
        valueGc,
        openPriceGc: unitPrice,
        profitGc: roundSignedGc(valueGc - unitPrice, 0),
        variantKey,
    }
}

// A "rare" tile for cosmetic purposes is a knife/glove special-pool item
// (`isRare`) or any celebration-tier rarity. Used by the C3 near-miss seeding to
// pick a believable "so close" tile.
export function isRareCaseItem(item) {
    return Boolean(item && (item.isRare || CASE_CELEBRATION_RARITIES.has(item.rarity)))
}

export function buildCaseReelTrack(items = [], outcome, {
    length = CASE_CAROUSEL_VISIBLE,
    targetIndex = CASE_PRIZE_INDEX,
    nearMiss = false,
} = {}) {
    const safeItems = items.length ? items : [outcome].filter(Boolean)
    const track = Array.from({ length }, () => {
        const idx = Math.floor(nextRoll('cases').roll * safeItems.length)
        return safeItems[idx]
    })
    // The forced outcome is the LAST write at targetIndex — it is the real,
    // already-resolved drop and must never be overwritten by any cosmetic step.
    if (outcome) track[targetIndex] = outcome
    // C3 near-miss (cosmetic only): when the real outcome is NOT rare, seed a
    // rare tile DIRECTLY ADJACENT to the target so the reel teases a big drop
    // that "just missed". Never writes targetIndex, so the settlement math is
    // untouched. Opt-in (default false) keeps existing callers/tests stable.
    if (nearMiss && outcome && !isRareCaseItem(outcome)) {
        const rares = safeItems.filter(isRareCaseItem)
        if (rares.length) {
            const slot = nextRoll('cases').roll < 0.5 ? targetIndex - 1 : targetIndex + 1
            if (slot !== targetIndex && slot >= 0 && slot < length) {
                track[slot] = rares[Math.floor(nextRoll('cases').roll * rares.length)]
            }
        }
    }
    return track
}

export function finalCaseReelOffset({
    jitter = 0,
    targetIndex = CASE_PRIZE_INDEX,
    tilePx = CASE_TILE_PX,
    gapPx = CASE_TILE_GAP_PX,
} = {}) {
    return finalPrizeOffset(jitter, targetIndex, tilePx, gapPx)
}

export function createCaseOpeningRound({
    caseData,
    rows = 1,
    unitPrice = 1,
    stake = unitPrice * rows,
    targetIndex = CASE_PRIZE_INDEX,
    nearMissChance = 0.34,
    tilePx = CASE_TILE_PX,
    gapPx = CASE_TILE_GAP_PX,
} = {}) {
    const items = caseData?.items || []
    const entries = Array.from({ length: rows }, () => {
        // Pull the pick roll explicitly so we can stamp its seed+nonce onto the
        // outcome for the per-drop fairness badge. This is the deterministic
        // sync hash (`hmacRollSync`), not the async SHA-256 path.
        const pick = nextRoll('cases')
        const base = weightedPick(items, pick.roll)
        const outcome = {
            ...buildCaseOutcome(base, { unitPrice }),
            nonce: pick.nonce,
            serverSeedHash: pick.serverSeedHash,
            clientSeed: pick.clientSeed,
        }
        // C3: only roll a near-miss for non-rare outcomes, on a minority of
        // spins, so the tease stays special. Cosmetic — never alters `outcome`.
        const wantNearMiss = !isRareCaseItem(outcome)
            && nearMissChance > 0
            && nextRoll('cases-nearmiss').roll < nearMissChance
        const reelTrack = buildCaseReelTrack(items, outcome, { targetIndex, nearMiss: wantNearMiss })
        // Detect whether a rare tile actually landed adjacent to the target so
        // the UI can drive the slowdown heartbeat without rescanning the board.
        const nearMiss = wantNearMiss && (
            isRareCaseItem(reelTrack[targetIndex - 1]) || isRareCaseItem(reelTrack[targetIndex + 1])
        )
        const jitter = (nextRoll('cases-jit').roll - 0.5) * 14
        const finalOffset = finalCaseReelOffset({ jitter, targetIndex, tilePx, gapPx })
        return { outcome, reelTrack, targetIndex, finalOffset, nearMiss }
    })

    return {
        caseData,
        entries,
        offsets: entries.map(entry => entry.finalOffset),
        outcomes: entries.map(entry => entry.outcome),
        nearMiss: entries.some(entry => entry.nearMiss),
        rows,
        stake,
        targetIndex,
        tracks: entries.map(entry => entry.reelTrack),
    }
}
