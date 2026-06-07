// strategySandbox — headless Monte-Carlo of betting strategies.
//
// Educational core: let a player "prove to themselves" that no staking system
// beats a negative-EV game. Given a game's win chance + payout multiplier and a
// staking strategy (flat / martingale / reverse-martingale / d'Alembert /
// fibonacci / percentage), simulate many rounds and many independent runs, then
// summarise the bankroll outcome distribution.
//
// Pure + seedable (no UI, no localStorage) so it is fully unit-testable and can
// run in a worker. Uses a mulberry32 PRNG for reproducibility.

export const STRATEGIES = [
    { id: 'flat', name: 'Flat', detail: 'Same bet every round.' },
    { id: 'martingale', name: 'Martingale', detail: 'Double after every loss; reset on win.' },
    { id: 'reverse', name: 'Reverse Martingale', detail: 'Double after every win; reset on loss.' },
    { id: 'dalembert', name: "D'Alembert", detail: '+1 unit after a loss, −1 after a win.' },
    { id: 'fibonacci', name: 'Fibonacci', detail: 'Step up the Fibonacci ladder on loss, back two on win.' },
    { id: 'percentage', name: 'Percentage', detail: 'Bet a fixed % of current bankroll.' },
]

function mulberry32(seed) {
    let a = seed >>> 0
    return function next() {
        a |= 0
        a = (a + 0x6D2B79F5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

const FIB = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987]

/**
 * Compute the next stake for a strategy given prior outcome context.
 * Returns a stake in units (multiplied by baseBet by the caller).
 */
function nextStakeUnits(strategy, ctx) {
    switch (strategy) {
        case 'flat':
            return 1
        case 'martingale':
            return ctx.lastWin ? 1 : Math.min(ctx.unitMultiplier * 2, ctx.maxUnits)
        case 'reverse':
            return ctx.lastWin ? Math.min(ctx.unitMultiplier * 2, ctx.maxUnits) : 1
        case 'dalembert':
            return Math.max(1, ctx.dalembertUnits)
        case 'fibonacci':
            return FIB[Math.min(ctx.fibIndex, FIB.length - 1)]
        case 'percentage':
            // Handled by caller (needs live bankroll); return 0 sentinel.
            return 0
        default:
            return 1
    }
}

/**
 * Run a single bankroll trajectory.
 * @returns { final, peak, trough, rounds, busted, maxBet }
 */
function runOne(opts, rand) {
    const {
        strategy, startBalance, baseBet, winChance, payoutMultiplier,
        rounds, stopProfit, stopLoss, pctOfBankroll, maxUnits,
    } = opts

    let balance = startBalance
    let peak = balance
    let trough = balance
    let maxBet = 0
    let busted = false
    let played = 0

    // strategy state
    let unitMultiplier = 1 // martingale/reverse current unit factor
    let dalembertUnits = 1
    let fibIndex = 0
    let lastWin = false

    for (let i = 0; i < rounds; i += 1) {
        let stake
        if (strategy === 'percentage') {
            stake = Math.max(baseBet * 0.01, balance * (pctOfBankroll / 100))
        } else {
            const units = nextStakeUnits(strategy, { lastWin, unitMultiplier, dalembertUnits, fibIndex, maxUnits })
            stake = baseBet * units
        }
        // can't bet more than you have
        stake = Math.min(stake, balance)
        if (stake <= 0) { busted = true; break }
        maxBet = Math.max(maxBet, stake)

        const win = rand() < winChance
        if (win) {
            // net profit on a win = stake * (payoutMultiplier - 1)
            balance += stake * (payoutMultiplier - 1)
        } else {
            balance -= stake
        }
        played += 1

        // update strategy state
        if (strategy === 'martingale') unitMultiplier = win ? 1 : unitMultiplier * 2
        else if (strategy === 'reverse') unitMultiplier = win ? unitMultiplier * 2 : 1
        else if (strategy === 'dalembert') dalembertUnits = win ? Math.max(1, dalembertUnits - 1) : dalembertUnits + 1
        else if (strategy === 'fibonacci') fibIndex = win ? Math.max(0, fibIndex - 2) : Math.min(fibIndex + 1, FIB.length - 1)
        lastWin = win

        peak = Math.max(peak, balance)
        trough = Math.min(trough, balance)

        if (balance <= 0.000001) { busted = true; balance = 0; break }
        if (Number.isFinite(stopProfit) && stopProfit > 0 && balance - startBalance >= stopProfit) break
        if (Number.isFinite(stopLoss) && stopLoss > 0 && startBalance - balance >= stopLoss) break
    }

    return { final: balance, peak, trough, rounds: played, busted, maxBet }
}

function percentile(sortedAsc, p) {
    if (sortedAsc.length === 0) return 0
    const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.round((p / 100) * (sortedAsc.length - 1))))
    return sortedAsc[idx]
}

/**
 * Run the full sandbox: `runs` independent trajectories of up to `rounds` each.
 * @returns aggregate summary + a coarse histogram of final balances.
 */
export function runStrategySandbox(input = {}) {
    const opts = {
        strategy: input.strategy || 'flat',
        startBalance: Number(input.startBalance) || 1000,
        baseBet: Number(input.baseBet) || 10,
        winChance: Math.min(0.999, Math.max(0.001, Number(input.winChance) || 0.495)),
        payoutMultiplier: Number(input.payoutMultiplier) || 2,
        rounds: Math.min(5000, Math.max(1, Math.round(Number(input.rounds) || 200))),
        runs: Math.min(20000, Math.max(1, Math.round(Number(input.runs) || 1000))),
        stopProfit: Number(input.stopProfit) || 0,
        stopLoss: Number(input.stopLoss) || 0,
        pctOfBankroll: Math.min(100, Math.max(0.1, Number(input.pctOfBankroll) || 5)),
        maxUnits: Math.min(1e6, Math.max(1, Number(input.maxUnits) || 1024)),
        seed: input.seed != null ? (Number(input.seed) >>> 0) : 0x9e3779b9,
    }

    const rand = mulberry32(opts.seed)
    const finals = []
    let busts = 0
    let profitable = 0
    let sumFinal = 0
    let sumRounds = 0
    let maxBetSeen = 0

    for (let r = 0; r < opts.runs; r += 1) {
        const res = runOne(opts, rand)
        finals.push(res.final)
        sumFinal += res.final
        sumRounds += res.rounds
        if (res.busted) busts += 1
        if (res.final > opts.startBalance) profitable += 1
        maxBetSeen = Math.max(maxBetSeen, res.maxBet)
    }

    const sorted = finals.slice().sort((a, b) => a - b)
    const mean = sumFinal / opts.runs
    const variance = finals.reduce((acc, v) => acc + (v - mean) ** 2, 0) / opts.runs
    const theoreticalEvPerUnit = opts.winChance * (opts.payoutMultiplier - 1) - (1 - opts.winChance)

    // 12-bucket histogram between min and max final balance
    const min = sorted[0]
    const max = sorted[sorted.length - 1]
    const bucketCount = 12
    const span = Math.max(1e-6, max - min)
    const histogram = Array.from({ length: bucketCount }, (_, i) => ({
        from: min + (span * i) / bucketCount,
        to: min + (span * (i + 1)) / bucketCount,
        count: 0,
    }))
    for (const v of finals) {
        let b = Math.floor(((v - min) / span) * bucketCount)
        if (b >= bucketCount) b = bucketCount - 1
        if (b < 0) b = 0
        histogram[b].count += 1
    }

    return {
        input: opts,
        runs: opts.runs,
        meanFinal: mean,
        medianFinal: percentile(sorted, 50),
        p05: percentile(sorted, 5),
        p95: percentile(sorted, 95),
        stdDev: Math.sqrt(variance),
        bustRate: busts / opts.runs,
        profitableRate: profitable / opts.runs,
        avgRounds: sumRounds / opts.runs,
        maxBetSeen,
        theoreticalEvPerUnit,
        // The headline lesson: net expected change vs starting bankroll.
        expectedNetPerRun: mean - opts.startBalance,
        histogram,
    }
}
