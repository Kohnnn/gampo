import { nextRoll } from '../../../utils/fairRng'
import { roundGc, roundSignedGc } from './caseEconomy'
import {
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

export function rarityWeight(item = {}) {
    if (item.isRare) return 0.4
    switch (item.rarity) {
        case 'Mil-Spec Grade': return 78.92
        case 'Restricted': return 15.98
        case 'Classified': return 3.20
        case 'Covert': return 0.64
        case 'Extraordinary':
        case 'Contraband':
        case '★': return 0.26
        default: return 12
    }
}

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

export function buildCaseReelTrack(items = [], outcome, {
    length = CASE_CAROUSEL_VISIBLE,
    targetIndex = CASE_PRIZE_INDEX,
} = {}) {
    const safeItems = items.length ? items : [outcome].filter(Boolean)
    const track = Array.from({ length }, () => {
        const idx = Math.floor(nextRoll('cases').roll * safeItems.length)
        return safeItems[idx]
    })
    if (outcome) track[targetIndex] = outcome
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
} = {}) {
    const items = caseData?.items || []
    const entries = Array.from({ length: rows }, () => {
        const base = weightedPick(items)
        const outcome = buildCaseOutcome(base, { unitPrice })
        const reelTrack = buildCaseReelTrack(items, outcome, { targetIndex })
        const jitter = (nextRoll('cases-jit').roll - 0.5) * 14
        const finalOffset = finalCaseReelOffset({ jitter, targetIndex })
        return { outcome, reelTrack, targetIndex, finalOffset }
    })

    return {
        caseData,
        entries,
        offsets: entries.map(entry => entry.finalOffset),
        outcomes: entries.map(entry => entry.outcome),
        rows,
        stake,
        targetIndex,
        tracks: entries.map(entry => entry.reelTrack),
    }
}
