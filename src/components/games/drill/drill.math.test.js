import { describe, it, expect } from 'vitest'

// A-P3-2: Drill house-edge lock.
//
// Source of truth: src/components/games/drill/DrillGame.jsx:47-65.
// Each layer's multiplier = TARGET_RTP / cumulativeSurvival, so the cash-out EV
// is exactly TARGET_RTP at every depth — no layer is ever +EV.

const TARGET_RTP = 0.96
const DRILL_BUST_CHANCES = [0.06, 0.10, 0.14, 0.18, 0.22, 0.26, 0.32, 0.38]

// DrillGame.jsx:56-65
const LAYERS = (() => {
    let survival = 1
    return DRILL_BUST_CHANCES.map((bustChance) => {
        survival *= (1 - bustChance)
        return {
            multiplier: Math.round((TARGET_RTP / survival) * 100) / 100,
            bustChance,
        }
    })
})()

// Cumulative survival to (and including) clearing layer index `depth-1`.
function survivalTo(depth) {
    let s = 1
    for (let i = 0; i < depth; i += 1) s *= (1 - DRILL_BUST_CHANCES[i])
    return s
}

// Monte-Carlo: a bettor that always drills to `targetDepth` then cashes.
function simulateRtp(targetDepth, trials, rng = Math.random) {
    let totalReturn = 0
    for (let i = 0; i < trials; i += 1) {
        let depth = 0
        let alive = true
        while (alive && depth < targetDepth) {
            if (rng() < DRILL_BUST_CHANCES[depth]) alive = false
            else depth += 1
        }
        if (alive) totalReturn += LAYERS[targetDepth - 1].multiplier
    }
    return totalReturn / trials
}

describe('drill payout math', () => {
    it('multiplier is strictly monotonic in depth', () => {
        let prev = 0
        for (const layer of LAYERS) {
            expect(layer.multiplier).toBeGreaterThan(prev)
            prev = layer.multiplier
        }
    })

    it('bust chance rises with depth', () => {
        let prev = 0
        for (const b of DRILL_BUST_CHANCES) {
            expect(b).toBeGreaterThan(prev)
            prev = b
        }
    })

    it('cash-out EV equals TARGET_RTP at every depth (never +EV)', () => {
        for (let d = 1; d <= LAYERS.length; d += 1) {
            const ev = survivalTo(d) * LAYERS[d - 1].multiplier
            // multiplier is rounded to 2dp so allow a small tolerance.
            expect(ev).toBeCloseTo(TARGET_RTP, 2)
            expect(ev).toBeLessThan(1)
        }
    })

    it('simulated RTP holds the house edge over 20k trials at multiple depths', () => {
        for (const target of [1, 3, 6, 8]) {
            const rtp = simulateRtp(target, 20000)
            // eslint-disable-next-line no-console
            console.log(`drill depth=${target} RTP=${rtp.toFixed(4)} (target ~${TARGET_RTP})`)
            expect(rtp).toBeLessThan(1)
            expect(rtp).toBeGreaterThan(TARGET_RTP * 0.85)
            expect(rtp).toBeLessThan(TARGET_RTP * 1.15)
        }
    })
})
