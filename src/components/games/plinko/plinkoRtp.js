// QA007 (#31): the Plinko payout table is a discrete distribution, so its RTP is
// an exact sum, not an estimate. Every drop is a fair Galton walk -
// `PlinkoGame.jsx:275-279` adds 1 for each of `rows` independent rolls at
// p=0.5 - so bin k has probability C(rows,k)/2^rows. The gross return is
// sum(P(k) * payout(k)); the net return subtracts the accepted ball cost.
//
// The engine's physics only decides where the ball is *drawn*; the bin that
// pays is chosen by the RNG walk before the ball is dropped. This module mirrors
// that walk, so it can disagree with the engine only if the engine starts
// steering the outcome, which would be a separate defect.
import { BIN_PAYOUTS } from './engine/constants'

// Exact binomial weights: C(n,k) as an integer, so rows up to 16 stay exact.
export function binomialWeights(rows) {
    const n = Number(rows)
    if (!Number.isInteger(n) || n < 1) return []
    const weights = []
    let c = 1
    for (let k = 0; k <= n; k++) {
        weights.push(c)
        c = (c * (n - k)) / (k + 1)
    }
    return weights
}

// Probability that a fair `rows`-step walk lands in each bin. Sums to exactly 1
// for rows <= 16 (2^53 keeps the integer weights exact).
export function binProbabilities(rows) {
    const weights = binomialWeights(rows)
    if (!weights.length) return []
    const total = 2 ** Number(rows)
    return weights.map(w => w / total)
}

// A ball scales the payout as well as the cost. `PlinkoGame.jsx:73-79` gives
// every premium ball `cost === bonus`, and `:300` multiplies the raw bin
// multiplier by `bonus` before settling, so a bronze ball costs 2x and pays 2x:
// its effective RTP equals the Basic RTP, it is not halved. Modelling only the
// cost overstates the house edge on every premium ball.
export const PLINKO_BALLS = Object.freeze([
    { id: 'normal', name: 'Basic', cost: 1, bonus: 1 },
    { id: 'bronze', name: 'Bronze', cost: 2, bonus: 2 },
    { id: 'silver', name: 'Silver', cost: 3, bonus: 3 },
    { id: 'emerald', name: 'Emerald', cost: 5, bonus: 5 },
    { id: 'ruby', name: 'Ruby', cost: 10, bonus: 10 },
    { id: 'sapphire', name: 'Sapphire', cost: 20, bonus: 20 },
])

// Rounding the settlement actually applies (PlinkoGame.jsx:89-92): the credited
// return is `round2(betAmount * multiplier)`, profit is `round2(return - cost)`.
// A quote that ignores this is wrong for any stake whose product is not already
// two decimals, so the per-stake path below is the one a disclosure must use.
const round2 = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100

// Exact per-bin settlement for one ball at one stake. This is what the player
// receives, including the ball bonus and the credited-amount rounding.
export function plinkoSettlements({ rows, risk, betAmount, ballId = 'normal' } = {}) {
    const ball = PLINKO_BALLS.find(candidate => candidate.id === ballId)
    const payouts = BIN_PAYOUTS[rows]?.[risk]
    const probabilities = binProbabilities(rows)
    const stake = Number(betAmount)
    if (!ball || !payouts || !probabilities.length || payouts.length !== probabilities.length) return null
    if (!Number.isFinite(stake) || stake <= 0) return null
    const cost = round2(stake * ball.cost)
    return payouts.map((payout, index) => {
        // `PlinkoGame.jsx:300`: mult = round4(rawMult * ball.bonus)
        const mult = Number((payout * ball.bonus).toFixed(4))
        const returnAmount = round2(stake * mult)
        return {
            bin: index,
            probability: probabilities[index],
            multiplier: mult,
            returnAmount,
            profit: round2(returnAmount - cost),
        }
    })
}

// Gross return per 1.00 GC of ball cost, plus the exact net.
export function plinkoRtp({ rows, risk, ballId = 'normal' } = {}) {
    const ball = PLINKO_BALLS.find(candidate => candidate.id === ballId)
    const payouts = BIN_PAYOUTS[rows]?.[risk]
    const probabilities = binProbabilities(rows)
    if (!ball || !payouts || !probabilities.length) return null
    if (payouts.length !== probabilities.length) {
        // A table whose bins do not match the walk cannot be quoted. Better to
        // say so than to pad, truncate, or silently renormalise.
        return null
    }
    let gross = 0
    let worst = Infinity
    let best = -Infinity
    let winChance = 0
    for (let k = 0; k < payouts.length; k++) {
        const mult = Number((payouts[k] * ball.bonus).toFixed(4))
        gross += probabilities[k] * mult
        if (mult < worst) worst = mult
        if (mult > best) best = mult
        // A bin pays net when its settled multiplier exceeds the ball cost.
        if (mult > ball.cost) winChance += probabilities[k]
    }
    return {
        rows: Number(rows),
        risk,
        ballId: ball.id,
        ballCost: ball.cost,
        ballBonus: ball.bonus,
        // NOMINAL ratios: unrounded, stake-independent. At small stakes the
        // settlement's `round2` turns some of these into pushes or losses, so a
        // disclosure must quote `settlementRtp` / `settlementWinChance` from
        // `plinkoSettlements()` at the player's actual stake instead.
        grossReturn: gross,                 // per 1.00 GC staked, multiplier units
        netReturn: gross - ball.cost,       // per 1.00 GC staked, after the ball cost
        nominalRtp: gross / ball.cost,
        nominalHouseEdge: 1 - gross / ball.cost,
        nominalWinChance: winChance,
        worstMultiplier: worst,
        bestMultiplier: best,
        probabilities,
        payouts: payouts.map(payout => Number((payout * ball.bonus).toFixed(4))),
    }
}

// Every configured table, so a quote surface can never show a stale subset.
export function plinkoRtpTable(ballId = 'normal') {
    const out = []
    for (const rows of Object.keys(BIN_PAYOUTS).map(Number).sort((a, b) => a - b)) {
        for (const risk of Object.keys(BIN_PAYOUTS[rows])) {
            out.push(plinkoRtp({ rows, risk, ballId }))
        }
    }
    return out
}

// Probability-weighted settlement at a real stake: what the player is actually
// credited, after the ball bonus and the `round2` on both the return and the
// profit. This is the figure a disclosure must quote - the nominal ratios above
// describe intent, not outcome, once a stake is small enough for rounding to
// turn a 1.1x bin into a 1.0x push (or a loss).
export function plinkoSettlementRtp(options = {}) {
    const rows = plinkoSettlements(options)
    if (!rows) return null
    const stake = Number(options.betAmount)
    const ball = PLINKO_BALLS.find(candidate => candidate.id === (options.ballId || 'normal'))
    const cost = round2(stake * ball.cost)
    let expectedReturn = 0
    let winChance = 0
    for (const row of rows) {
        expectedReturn += row.probability * row.returnAmount
        if (row.profit > 0) winChance += row.probability
    }
    return {
        rows: rows.length - 1,
        risk: options.risk,
        ballId: ball.id,
        betAmount: stake,
        cost,
        expectedReturnGc: expectedReturn,
        expectedProfitGc: expectedReturn - cost,
        // Rounded at the same precision the ledger uses, so a quote cannot claim
        // more precision than the settlement has.
        settlementRtp: expectedReturn / cost,
        settlementHouseEdge: 1 - expectedReturn / cost,
        settlementWinChance: winChance,
        pushChance: rows.reduce((sum, row) => sum + (row.profit === 0 ? row.probability : 0), 0),
    }
}
