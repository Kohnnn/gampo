import { kenoPayout, round2 } from '../../../utils/simulationMath'

export const LOTTERY_PAYOUTS = Object.freeze([0, 0, 4, 25, 250, 5000])

function choose(n, k) {
    if (k < 0 || k > n) return 0
    let result = 1
    for (let i = 1; i <= Math.min(k, n - k); i += 1) result = result * (n - i + 1) / i
    return result
}

export function drawDistribution(game, picks, stake) {
    const keno = game === 'keno'
    if ((!keno && game !== 'lottery') || !Number.isInteger(picks) || (keno ? picks < 1 || picks > 10 : picks !== 5)
        || !Number.isFinite(stake) || stake <= 0) return null
    const population = keno ? 40 : 36
    const drawn = keno ? 10 : 5
    const outcomes = Array.from({ length: picks + 1 }, (_, hits) => {
        const probability = choose(picks, hits) * choose(population - picks, drawn - hits) / choose(population, drawn)
        const multiplier = keno ? kenoPayout(picks, hits) : LOTTERY_PAYOUTS[hits]
        const returnAmount = round2(stake * multiplier)
        return { hits, probability, multiplier, returnAmount, profit: round2(returnAmount - stake) }
    })
    const expectedReturn = outcomes.reduce((sum, row) => sum + row.probability * row.returnAmount, 0)
    return {
        outcomes,
        expectedReturn,
        effectiveRtp: expectedReturn / stake,
        nominalRtp: outcomes.reduce((sum, row) => sum + row.probability * row.multiplier, 0),
        payingProbability: outcomes.reduce((sum, row) => sum + (row.returnAmount > 0 ? row.probability : 0), 0),
    }
}

// Probability of being unable to fund one of the next 20 plays (not funding play 21).
export function twentyPlayRisk(distribution, stake, balance) {
    if (!distribution || !Number.isFinite(balance) || balance < 0 || !Number.isFinite(stake) || stake <= 0) return null
    const cost = Math.round(stake * 100)
    if (cost <= 0 || Math.abs(cost / 100 - stake) > 1e-8) return null
    let states = new Map([[Math.round(balance * 100), 1]])
    let risk = 0
    for (let play = 0; play < 20; play += 1) {
        const next = new Map()
        for (const [wallet, probability] of states) {
            if (wallet < cost) { risk += probability; continue }
            // Even twenty consecutive zero returns cannot stop this wallet.
            if (wallet >= (20 - play) * cost) continue
            for (const row of distribution.outcomes) {
                if (!row.probability) continue
                const after = wallet - cost + Math.round(row.returnAmount * 100)
                if (after >= (19 - play) * cost) continue
                next.set(after, (next.get(after) || 0) + probability * row.probability)
            }
        }
        // ponytail: bound interactive exact-DP work; move to a worker for larger state spaces.
        if (next.size > 50000) return null
        states = next
    }
    return Math.min(1, Math.max(0, risk))
}

export function precisePercent(probability) {
    if (probability === 0) return '0%'
    const percent = probability * 100
    return `${percent < 0.0001 ? percent.toExponential(6) : Number(percent.toPrecision(8))}%`
}
