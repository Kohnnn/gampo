const CASE_CATEGORY_LABELS = {
    popular: 'Popular',
    trending: 'New/Trending',
    weapon: 'Weapon Cases',
    souvenir: 'Souvenirs',
    stickers: 'Sticker Capsules',
    autographs: 'Autographs',
    music: 'Music Kits',
    highValue: 'High Value',
}

const CASE_CATEGORY_DESCRIPTIONS = {
    popular: 'Balanced cases with strong market activity and readable odds.',
    trending: 'Recent drops and event capsules surfaced by release signal.',
    weapon: 'Classic weapon cases with standard CS-style rarity ladders.',
    souvenir: 'Souvenir packages with event-style drops and gold framing.',
    stickers: 'Sticker capsule openings with lower entry prices.',
    autographs: 'Tournament autograph capsules and player signature pools.',
    music: 'Music kit boxes with compact drop pools and collectible value.',
    highValue: 'The most expensive openings, sorted by market or EV price.',
}

export const CASE_CATEGORY_ORDER = [
    'popular',
    'trending',
    'weapon',
    'souvenir',
    'stickers',
    'autographs',
    'music',
    'highValue',
]

export const CASE_CATEGORIES = CASE_CATEGORY_ORDER.map(value => ({
    value,
    label: CASE_CATEGORY_LABELS[value],
    description: CASE_CATEGORY_DESCRIPTIONS[value],
}))

export function casePriceBand(value = 0) {
    const price = Number(value) || 0
    if (price >= 20) return 'High Roller'
    if (price >= 8) return 'Premium'
    if (price >= 3) return 'Standard'
    return 'Budget'
}

export function roundGc(value, fallback = 0) {
    const n = Number(value)
    if (!Number.isFinite(n)) return fallback
    return Math.max(0, Math.round(n * 100) / 100)
}

export function roundSignedGc(value, fallback = 0) {
    const n = Number(value)
    if (!Number.isFinite(n)) return fallback
    return Math.round(n * 100) / 100
}

function firstFinite(...values) {
    for (const value of values) {
        const n = Number(value)
        if (Number.isFinite(n) && n > 0) return n
    }
    return null
}

export function marketPriceFromRecord(record) {
    if (!record || typeof record !== 'object') return null
    const cs = record.csmarket || record.csMarket || record
    return firstFinite(
        record.openPriceGc,
        record.priceGc,
        record.marketPriceUsd,
        cs.median_price,
        cs.medianPrice,
        cs.median,
        cs.price,
        cs.min_price,
        cs.minPrice,
        cs.min,
        cs.mean_price,
        cs.meanPrice,
        cs.mean,
    )
}

// Single source of truth for per-rarity drop weights. Both the EV/economy
// helpers here and the live roll picker (`caseOpening.weightedPick`) import
// these so odds shown to the player match the odds actually rolled.
export const RARITY_DROP_WEIGHTS = {
    'Mil-Spec Grade': 78.92,
    Restricted: 15.98,
    Classified: 3.20,
    Covert: 0.64,
    Extraordinary: 0.26,
    Contraband: 0.26,
    '★': 0.26,
}

// Weight applied to items flagged `isRare` (knives/gloves special pool).
export const RARE_ITEM_DROP_WEIGHT = 0.4

// Weight applied when an item's rarity is unknown / unmapped.
export const DEFAULT_DROP_WEIGHT = 12

export function rarityDropWeight(item = {}) {
    if (item.isRare) return RARE_ITEM_DROP_WEIGHT
    const mapped = RARITY_DROP_WEIGHTS[item.rarity]
    return mapped === undefined ? DEFAULT_DROP_WEIGHT : mapped
}

function lookupPriceRecord(priceMap = {}, ...keys) {
    for (const key of keys) {
        if (!key) continue
        const record = priceMap[key]
        if (record) return record
    }
    return null
}

export function itemValueGc(item = {}, priceMap = {}) {
    const direct = marketPriceFromRecord(lookupPriceRecord(
        priceMap,
        item.marketHashName,
        item.market_hash_name,
        item.name,
        item.id,
        item.skinId,
    ))
    if (direct) return roundGc(direct, 1)
    return roundGc(firstFinite(
        item.valueGc,
        item.priceGc,
        item.marketPriceUsd,
        item.estimatedPriceUsd,
        item.multiplier,
        1,
    ), 1)
}

export function fallbackOpenPriceGc(caseData = {}, priceMap = {}) {
    const items = Array.isArray(caseData.items) ? caseData.items : []
    if (!items.length) return 1
    const weighted = items.reduce((acc, item) => {
        const weight = rarityDropWeight(item)
        acc.value += itemValueGc(item, priceMap) * weight
        acc.weight += weight
        return acc
    }, { value: 0, weight: 0 })
    const ev = weighted.weight > 0 ? weighted.value / weighted.weight : 1
    return Math.max(1, roundGc(ev * 0.92, 1))
}

// Pricing decision (C-P2-4): GamPo intentionally prices every case from its
// expected value, NOT from a live market feed. `public/data/cs-prices.json` is
// deliberately absent so the simulator stays self-contained and reproducible —
// no network/market dependency. Consequently `deriveOpenPriceGc` resolves the
// `fallback-ev` source for all cases by design.
//
// The `csmarket` branch below is kept dormant-by-design (not broken): if a
// price map is ever supplied it will be honored, but the default product
// behavior is EV-based pricing. UI copy must therefore not imply "market
// median" pricing when the source is `fallback-ev` (see CasesGame.jsx).
export function deriveOpenPriceGc(caseData = {}, priceMap = {}) {
    const direct = marketPriceFromRecord(lookupPriceRecord(
        priceMap,
        caseData.marketHashName,
        caseData.market_hash_name,
        caseData.name,
        caseData.id,
    ))
    // Dormant-by-design: only taken when an explicit price map is provided.
    if (direct) return { value: Math.max(1, roundGc(direct, 1)), source: 'csmarket' }
    const existing = firstFinite(caseData.openPriceGc, caseData.priceGc, caseData.marketPriceUsd)
    if (existing) return { value: Math.max(1, roundGc(existing, 1)), source: caseData.priceSource || 'manifest' }
    // Default product path: expected-value pricing, self-contained.
    return { value: fallbackOpenPriceGc(caseData, priceMap), source: 'fallback-ev' }
}

export function caseOpenStakeGc(caseData = {}, rows = 1, priceMap = {}) {
    const count = Math.max(1, Math.floor(Number(rows) || 1))
    const price = deriveOpenPriceGc(caseData, priceMap).value
    return roundGc(price * count, price)
}

export function inferCaseCategory(caseData = {}) {
    const type = `${caseData.type || ''}`.toLowerCase()
    const name = `${caseData.name || ''}`.toLowerCase()
    if (/music/.test(type) || /music kit/.test(name)) return 'music'
    if (/souvenir/.test(type) || /souvenir/.test(name)) return 'souvenir'
    if (/autograph|signature/.test(type) || /autograph|signature/.test(name)) return 'autographs'
    if (/sticker|patch|capsule/.test(type) || /sticker|patch|capsule/.test(name)) return 'stickers'
    return 'weapon'
}

export function caseExpectedValueGc(caseData = {}) {
    const items = Array.isArray(caseData.items) ? caseData.items : []
    if (!items.length) return 0
    const weighted = items.reduce((acc, item) => {
        const weight = rarityDropWeight(item)
        acc.value += (Number(item.valueGc) || Number(item.multiplier) || 1) * weight
        acc.weight += weight
        return acc
    }, { value: 0, weight: 0 })
    return weighted.weight > 0 ? roundGc(weighted.value / weighted.weight, 0) : 0
}

export function caseVolatilityScore(caseData = {}) {
    const items = Array.isArray(caseData.items) ? caseData.items : []
    if (!items.length) return { score: 0, label: 'Stable' }
    const ev = caseExpectedValueGc(caseData) || 1
    const weighted = items.reduce((acc, item) => {
        const weight = rarityDropWeight(item)
        const value = Number(item.valueGc) || Number(item.multiplier) || 1
        acc.variance += Math.pow(value - ev, 2) * weight
        acc.weight += weight
        acc.max = Math.max(acc.max, value)
        if (item.isRare) acc.rareWeight += weight
        return acc
    }, { variance: 0, weight: 0, max: 0, rareWeight: 0 })
    const deviation = weighted.weight > 0 ? Math.sqrt(weighted.variance / weighted.weight) : 0
    const score = roundGc(deviation / ev, 0)
    const maxRatio = weighted.max / ev
    let label = 'Low volatility'
    if (maxRatio >= 30 || score >= 4) label = 'Jackpot'
    else if (maxRatio >= 14 || score >= 2.2) label = 'High volatility'
    else if (maxRatio >= 7 || score >= 1.15) label = 'Medium volatility'
    return { score, label }
}

const RARITY_RANK = new Map([
    ['Mil-Spec Grade', 1],
    ['High Grade', 1],
    ['Restricted', 2],
    ['Remarkable', 2],
    ['Classified', 3],
    ['Exotic', 3],
    ['Covert', 4],
    ['Extraordinary', 5],
    ['Contraband', 6],
    ['★', 6],
])

export function caseRarePreview(caseData = {}, limit = 3) {
    const items = Array.isArray(caseData.items) ? caseData.items : []
    return [...items]
        .sort((a, b) => {
            const ar = a.isRare ? 10 : (RARITY_RANK.get(a.rarity) || 0)
            const br = b.isRare ? 10 : (RARITY_RANK.get(b.rarity) || 0)
            return br - ar || (b.valueGc || b.multiplier || 0) - (a.valueGc || a.multiplier || 0) || a.name.localeCompare(b.name)
        })
        .slice(0, limit)
        .map(item => ({
            id: item.id,
            name: item.name,
            image: item.image,
            rarity: item.rarity,
            color: item.color,
            valueGc: Number(item.valueGc) || Number(item.multiplier) || 0,
            isRare: Boolean(item.isRare),
        }))
}

// Per-rarity drop odds for a single case, normalized to percentages from the
// same weights the live roll uses (`rarityDropWeight`). The picker sums the
// weight of every contained item, so a rarity bucket's true probability is the
// summed weight of its items over the total weight — this groups items by their
// displayed rarity tier (rare/special items collapse into a "Rare special"
// bucket) and reports the aggregate chance the next drop lands in that tier.
export function caseDropOdds(caseData = {}) {
    const items = Array.isArray(caseData.items) ? caseData.items : []
    if (!items.length) return []
    const buckets = new Map()
    let totalWeight = 0
    items.forEach(item => {
        const weight = rarityDropWeight(item)
        totalWeight += weight
        const isSpecial = Boolean(item.isRare)
        const label = isSpecial ? 'Rare special' : (item.rarity || 'Unknown')
        const key = isSpecial ? '__rare__' : label
        const existing = buckets.get(key)
        if (existing) {
            existing.weight += weight
            existing.count += 1
            if (!existing.color && item.color) existing.color = item.color
        } else {
            buckets.set(key, {
                key,
                label,
                rarity: isSpecial ? '★' : (item.rarity || 'Unknown'),
                color: item.color || null,
                weight,
                count: 1,
                isRare: isSpecial,
            })
        }
    })
    if (totalWeight <= 0) return []
    return [...buckets.values()]
        .map(bucket => ({
            ...bucket,
            pct: (bucket.weight / totalWeight) * 100,
        }))
        .sort((a, b) => b.pct - a.pct)
}

export function normalizeCaseForRuntime(caseData = {}, priceMap = {}) {
    const price = deriveOpenPriceGc(caseData, priceMap)
    const category = inferCaseCategory(caseData)
    const items = (caseData.items || []).map(item => ({
        ...item,
        valueGc: itemValueGc(item, priceMap),
    }))
    const pricedCase = { ...caseData, items }
    return {
        ...caseData,
        category,
        categoryLabel: CASE_CATEGORY_LABELS[category],
        openPriceGc: price.value,
        priceSource: price.source,
        evGc: caseExpectedValueGc(pricedCase),
        volatility: caseVolatilityScore(pricedCase),
        rarePreview: caseRarePreview(pricedCase),
        items,
    }
}

function popularScore(caseData = {}) {
    const bucket = inferCaseCategory(caseData)
    const price = Number(caseData.openPriceGc) || 1
    let score = 0
    if (bucket === 'weapon') score += 46
    if (bucket === 'souvenir') score += 24
    if (bucket === 'stickers') score += 16
    if (bucket === 'autographs') score += 16
    if (bucket === 'music') score += 8
    score += Math.max(0, 22 - Math.abs(price - 4) * 2)
    score += Math.min(12, Math.max(0, price - 8) * 0.5)
    score += Math.min(10, (caseData.items?.length || 0) / 2)
    return score
}

function recencyScore(caseData = {}) {
    const name = `${caseData.name || ''}`
    const idNumber = Number(`${caseData.id || ''}`.match(/\d+/)?.[0]) || 0
    const years = [...name.matchAll(/\b(20\d{2})\b/g)].map(match => Number(match[1]))
    const newestYear = years.length ? Math.max(...years) : 0
    let score = idNumber / 100
    if (newestYear) score += (newestYear - 2020) * 28
    if (/limited|deluge|nightmode|masterminds|champions|austin|budapest|shanghai|copenhagen/i.test(name)) score += 16
    score += Math.min(18, Number(caseData.openPriceGc) || 0)
    return score
}

export function filterCasesByCategory(cases = [], category = 'popular') {
    const list = Array.isArray(cases) ? cases : []
    if (category === 'highValue') {
        return [...list]
            .sort((a, b) => (b.openPriceGc || 0) - (a.openPriceGc || 0) || a.name.localeCompare(b.name))
            .slice(0, 18)
    }
    if (category === 'trending') {
        return [...list]
            .sort((a, b) => recencyScore(b) - recencyScore(a) || a.name.localeCompare(b.name))
            .slice(0, 24)
    }
    if (category === 'popular') {
        return [...list]
            .sort((a, b) => popularScore(b) - popularScore(a) || a.name.localeCompare(b.name))
            .slice(0, 24)
    }
    return list
        .filter(caseData => inferCaseCategory(caseData) === category)
        .sort((a, b) => a.name.localeCompare(b.name))
}

export function caseCategoryCounts(cases = []) {
    return Object.fromEntries(CASE_CATEGORY_ORDER.map(category => [
        category,
        filterCasesByCategory(cases, category).length,
    ]))
}

export function caseCategoryStats(cases = []) {
    return Object.fromEntries(CASE_CATEGORY_ORDER.map(category => {
        const list = filterCasesByCategory(cases, category)
        const prices = list.map(c => Number(c.openPriceGc) || 0).filter(Boolean)
        const min = prices.length ? Math.min(...prices) : 0
        const max = prices.length ? Math.max(...prices) : 0
        const avg = prices.length ? prices.reduce((sum, price) => sum + price, 0) / prices.length : 0
        return [category, {
            count: list.length,
            minPriceGc: roundGc(min, 0),
            maxPriceGc: roundGc(max, 0),
            avgPriceGc: roundGc(avg, 0),
            band: casePriceBand(avg),
        }]
    }))
}
