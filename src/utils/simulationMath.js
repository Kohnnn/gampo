export const HOUSE_EDGE = 0.01
export const DEFAULT_RTP = 0.99

export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value))
}

export function round2(value) {
    return Number((Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2))
}

export function formatCredits(value) {
    return `GC ${round2(Number(value) || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`
}

export function impliedProbability(decimalOdds) {
    const odds = Number(decimalOdds)
    if (!Number.isFinite(odds) || odds <= 1) return 0
    return 1 / odds
}

export function fairDecimalOdds(probability) {
    const p = clamp(Number(probability) || 0, 0.0001, 0.9999)
    return round2(1 / p)
}

export function expectedValue({ betAmount, winProbability, payoutMultiplier }) {
    const bet = Number(betAmount) || 0
    const probability = clamp(Number(winProbability) || 0, 0, 1)
    const multiplier = Number(payoutMultiplier) || 0
    return round2((probability * bet * multiplier) - bet)
}

export function rtpFromOutcomes(outcomes) {
    return outcomes.reduce((sum, item) => (
        sum + ((Number(item.probability) || 0) * (Number(item.multiplier) || 0))
    ), 0)
}

export function houseEdgeFromRtp(rtp) {
    return clamp(1 - (Number(rtp) || 0), 0, 1)
}

export function bankrollRisk({ bankroll, betAmount, lossProbability, trials }) {
    const bank = Number(bankroll) || 0
    const bet = Math.max(0.01, Number(betAmount) || 0.01)
    const stepsToRuin = Math.max(1, Math.floor(bank / bet))
    const pLoss = clamp(Number(lossProbability) || 0, 0, 1)
    const sample = Math.max(1, Number(trials) || 1)
    const shortRunRisk = 1 - Math.pow(1 - Math.pow(pLoss, stepsToRuin), sample)
    return clamp(shortRunRisk, 0, 1)
}

export function rolloverProgress({ wagered, required }) {
    const req = Math.max(1, Number(required) || 1)
    return clamp((Number(wagered) || 0) / req, 0, 1)
}

export function createSeededRandom(seed = 'gampo') {
    let hash = 2166136261
    const text = String(seed)
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i)
        hash = Math.imul(hash, 16777619)
    }
    return function next() {
        hash += 0x6D2B79F5
        let t = hash
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

export function pickWeighted(outcomes, random = Math.random) {
    const total = outcomes.reduce((sum, item) => sum + Math.max(0, item.weight), 0)
    if (total <= 0) return outcomes[0]
    let roll = random() * total
    for (const item of outcomes) {
        roll -= Math.max(0, item.weight)
        if (roll <= 0) return item
    }
    return outcomes[outcomes.length - 1]
}

export function sampleUniqueNumbers({ max, count, random = Math.random }) {
    const pool = Array.from({ length: max }, (_, index) => index + 1)
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1))
        ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    return pool.slice(0, count).sort((a, b) => a - b)
}

export function dicePayout(winChance, rtp = DEFAULT_RTP) {
    const chance = clamp(Number(winChance) || 0, 0.01, 0.98)
    return round2(rtp / chance)
}

export function limboWinChance(targetMultiplier, rtp = DEFAULT_RTP) {
    const target = Math.max(1.01, Number(targetMultiplier) || 1.01)
    return clamp(rtp / target, 0.0001, 0.98)
}

export function rouletteResultMeta(number) {
    const n = Number(number)
    const red = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])
    return {
        number: n,
        color: n === 0 ? 'green' : red.has(n) ? 'red' : 'black',
        parity: n === 0 ? 'zero' : n % 2 === 0 ? 'even' : 'odd',
        range: n === 0 ? 'zero' : n <= 18 ? 'low' : 'high',
    }
}

export function rouletteMultiplier(betType, selectedNumber, resultNumber) {
    const meta = rouletteResultMeta(resultNumber)
    if (betType === 'straight') return Number(selectedNumber) === meta.number ? 36 : 0
    if (betType === 'red' || betType === 'black') return meta.color === betType ? 2 : 0
    if (betType === 'even' || betType === 'odd') return meta.parity === betType ? 2 : 0
    if (betType === 'low' || betType === 'high') return meta.range === betType ? 2 : 0
    return 0
}

// Keno: engine draws 10 of 40 balls. The old paytable was tuned for an
// 80-ball/20-draw game, so realized RTP was ~61%. We keep the *shape* (which
// hit counts pay) but scale each pick-row so realized RTP == KENO_RTP under the
// true hypergeometric distribution for N=40, drawn=10.
const KENO_RTP = 0.92
const KENO_N = 40
const KENO_DRAWN = 10

// Hypergeometric P(hits | picks): C(picks,h)·C(N-picks, drawn-h)/C(N, drawn).
function logFactorial(n) {
    let acc = 0
    for (let i = 2; i <= n; i += 1) acc += Math.log(i)
    return acc
}
function logChoose(n, k) {
    if (k < 0 || k > n) return -Infinity
    return logFactorial(n) - logFactorial(k) - logFactorial(n - k)
}
function kenoHitProb(picks, hits) {
    const num = logChoose(picks, hits) + logChoose(KENO_N - picks, KENO_DRAWN - hits)
    const den = logChoose(KENO_N, KENO_DRAWN)
    const v = Math.exp(num - den)
    return Number.isFinite(v) ? v : 0
}

const KENO_SHAPE = {
    1: [0, 3.8],
    2: [0, 0, 12],
    3: [0, 0, 2, 43],
    4: [0, 0, 1, 5, 120],
    5: [0, 0, 0, 2, 15, 800],
    6: [0, 0, 0, 1, 6, 80, 1600],
    7: [0, 0, 0, 1, 3, 12, 250, 5000],
    8: [0, 0, 0, 0, 2, 8, 80, 1000, 10000],
    9: [0, 0, 0, 0, 1, 5, 25, 200, 4000, 20000],
    10: [0, 0, 0, 0, 0, 2, 15, 80, 500, 10000, 50000],
}

// Pre-scale each pick row so Σ P(h)·payout(h) == KENO_RTP.
const KENO_TABLES = (() => {
    const out = {}
    for (let picks = 1; picks <= 10; picks += 1) {
        const shape = KENO_SHAPE[picks]
        let rawRtp = 0
        for (let h = 0; h < shape.length; h += 1) rawRtp += kenoHitProb(picks, h) * shape[h]
        const scale = rawRtp > 0 ? KENO_RTP / rawRtp : 1
        out[picks] = shape.map(v => round2(v * scale))
    }
    return out
})()

export function kenoPayout(picks, hits) {
    const table = KENO_TABLES[clamp(Number(picks) || 1, 1, 10)]
    return table?.[clamp(Number(hits) || 0, 0, table.length - 1)] || 0
}

export function scoreBlackjackHand(cards) {
    let total = 0
    let aces = 0
    for (const card of cards) {
        const rank = card.rank
        if (rank === 'A') {
            aces += 1
            total += 11
        } else if (['K', 'Q', 'J'].includes(rank)) {
            total += 10
        } else {
            total += Number(rank)
        }
    }
    while (total > 21 && aces > 0) {
        total -= 10
        aces -= 1
    }
    return total
}

export function sportsbookOverround(decimalOdds) {
    return decimalOdds.reduce((sum, odds) => sum + impliedProbability(odds), 0)
}

export function sportsbookVig(decimalOdds) {
    return Math.max(0, sportsbookOverround(decimalOdds) - 1)
}

export function sportsbookExpectedValue(wager, decimalOdds, trueProbability) {
    return expectedValue({
        betAmount: wager,
        winProbability: trueProbability,
        payoutMultiplier: decimalOdds,
    })
}
