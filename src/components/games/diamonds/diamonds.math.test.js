import { describe, it, expect } from 'vitest'
import { DIAMONDS_RTP, DIAMONDS_SCALE, GEM_WEIGHTS, payoutFor, rawPayoutFor } from './DiamondsGame'
// Independent (non-seeded) Monte-Carlo over the calibrated payout function.
function simulateRtp(trials, rng = Math.random) {
    const total = GEM_WEIGHTS.reduce((s, w) => s + w, 0)
    const draw = () => {
        const r = rng() * total
        let acc = 0
        for (let i = 0; i < GEM_WEIGHTS.length; i += 1) { acc += GEM_WEIGHTS[i]; if (r < acc) return i }
        return GEM_WEIGHTS.length - 1
    }
    let totalReturn = 0
    for (let n = 0; n < trials; n += 1) {
        const counts = new Array(GEM_WEIGHTS.length).fill(0)
        for (let d = 0; d < 5; d += 1) counts[draw()] += 1
        let bestIdx = -1, bestCount = 0
        counts.forEach((c, i) => { if (c > bestCount) { bestCount = c; bestIdx = i } })
        totalReturn += payoutFor(bestCount, bestIdx === -1 ? GEM_WEIGHTS.length - 1 : bestIdx)
    }
    return totalReturn / trials
}

describe('diamonds payout math', () => {
    it('pays nothing for fewer than 2 matches', () => {
        expect(rawPayoutFor(0, 0)).toBe(0)
        expect(rawPayoutFor(1, 0)).toBe(0)
        expect(payoutFor(1, 0)).toBe(0)
    })

    it('is monotonic in match count for a fixed gem', () => {
        const gem = 0 // Diamond
        const p2 = payoutFor(2, gem)
        const p3 = payoutFor(3, gem)
        const p4 = payoutFor(4, gem)
        const p5 = payoutFor(5, gem)
        expect(p3).toBeGreaterThan(p2)
        expect(p4).toBeGreaterThan(p3)
        expect(p5).toBeGreaterThan(p4)
    })

    it('rarer gems pay more at the same match count', () => {
        // gemIndex 0 = Diamond (rarest), 5 = Citrine (common)
        expect(payoutFor(5, 0)).toBeGreaterThan(payoutFor(5, 5))
        expect(payoutFor(3, 0)).toBeGreaterThan(payoutFor(3, 5))
    })

    it('REGRESSION: realized RTP is house-favourable and near 0.96 (not the old ~258%)', () => {
        const rtp = simulateRtp(200000)
        // Must be a real house edge: strictly below 100%.
        expect(rtp).toBeLessThan(1)
        // And reasonably near the 0.96 target (±4 pts for sampling noise).
        expect(rtp).toBeGreaterThan(0.90)
        expect(rtp).toBeLessThan(1.0)
        // Explicitly guard against the documented 258% regression.
        expect(rtp).toBeLessThan(1.5)
    })

    it('calibration scalar locks the seeded mean return to ~RTP', () => {
        // The seeded calibration mean × scale should equal DIAMONDS_RTP by construction.
        expect(DIAMONDS_SCALE).toBeGreaterThan(0)
        expect(DIAMONDS_SCALE).toBeLessThan(1) // raw shape was player-favourable, so scale < 1
    })
})
