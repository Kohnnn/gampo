import { describe, it, expect } from 'vitest'
import { dicePayout, DEFAULT_RTP } from '../../../utils/simulationMath'

// A-P3-2: Dice house-edge lock.
//
// Source of truth: src/utils/simulationMath.js:98-101 (dicePayout) and
// DiceGame.jsx:64,119-120. payout = round2(rtp / chance) with rtp=DEFAULT_RTP
// (0.99). A bettor with win chance `c` wins with prob c and is paid `payout`,
// so EV = c × (rtp/c) = rtp — the house edge is constant across chances.

const RTP = DEFAULT_RTP // 0.99

// DiceGame.jsx:119 — roll in [0,100); "under" wins when roll < winChance.
function simulateRtp(winChancePct, trials, rng = Math.random) {
    const payout = dicePayout(winChancePct / 100)
    let totalReturn = 0
    for (let i = 0; i < trials; i += 1) {
        const roll = rng() * 100
        if (roll < winChancePct) totalReturn += payout
    }
    return totalReturn / trials
}

describe('dice payout math', () => {
    it('payout is monotonically decreasing as win chance rises', () => {
        let prev = Infinity
        for (let c = 5; c <= 95; c += 5) {
            const p = dicePayout(c / 100)
            expect(p).toBeLessThan(prev)
            prev = p
        }
    })

    it('payout × chance equals RTP (house edge constant across chances)', () => {
        for (const c of [2, 10, 25, 50, 75, 95]) {
            const chance = c / 100
            const ev = dicePayout(chance) * chance
            // round2 on the payout introduces tiny noise; allow 2dp tolerance.
            expect(ev).toBeCloseTo(RTP, 1)
            expect(ev).toBeLessThan(1) // house-favourable
        }
    })

    it('low chance pays a high multiplier and vice-versa', () => {
        expect(dicePayout(0.02)).toBeGreaterThan(dicePayout(0.5))
        expect(dicePayout(0.5)).toBeGreaterThan(dicePayout(0.95))
        expect(dicePayout(0.5)).toBeCloseTo(RTP / 0.5, 1) // ~1.98×
    })

    it('simulated RTP holds the house edge over 30k trials', () => {
        // Deterministic seeded RNG (mulberry32) for a stable convergence check.
        const mulberry32 = (seed) => () => {
            seed |= 0; seed = (seed + 0x6D2B79F5) | 0
            let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296
        }
        for (const c of [10, 50, 90]) {
            const rng = mulberry32(0x1ce * (c + 1))
            const rtp = simulateRtp(c, 30000, rng)
            // eslint-disable-next-line no-console
            console.log(`dice winChance=${c}% RTP=${rtp.toFixed(4)} (target ~${RTP})`)
            expect(rtp).toBeGreaterThan(RTP * 0.9)
            expect(rtp).toBeLessThan(RTP * 1.1)
        }
    })
})
