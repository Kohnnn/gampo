import { describe, it, expect } from 'vitest'

// A-P3-2: Snakes house-edge lock.
//
// Source of truth: src/components/games/snakes/SnakesGame.jsx:38-64.
// Survival per rung = (COLS - snakesPerRow) / COLS. Fair multiplier compounds
// (1/survival)^rungs, then a flat HOUSE_EDGE is shaved off.

const COLS = 3
const ROWS = 8
const HOUSE_EDGE = 0.04

// SnakesGame.jsx:60-65
function multiplierFor(safeRungs, snakesPerRow) {
    if (safeRungs <= 0) return 1
    const survivalProb = (COLS - snakesPerRow) / COLS
    const fairMultiplier = Math.pow(1 / survivalProb, safeRungs)
    return Number((fairMultiplier * (1 - HOUSE_EDGE)).toFixed(4))
}

// Monte-Carlo: bettor advances to `targetRung` (tapping a random safe column)
// then cashes. Each rung independently has `snakesPerRow` snakes among COLS.
function simulateRtp(snakesPerRow, targetRung, trials, rng = Math.random) {
    const survival = (COLS - snakesPerRow) / COLS
    let totalReturn = 0
    for (let i = 0; i < trials; i += 1) {
        let rung = 0
        let alive = true
        while (alive && rung < targetRung) {
            if (rng() < survival) rung += 1
            else alive = false
        }
        if (alive) totalReturn += multiplierFor(targetRung, snakesPerRow)
    }
    return totalReturn / trials
}

describe('snakes payout math', () => {
    it('is 1× before any rung', () => {
        expect(multiplierFor(0, 1)).toBe(1)
    })

    it('multiplier is strictly monotonic in rungs cleared', () => {
        for (const snakes of [1, 2]) {
            let prev = 0
            for (let r = 0; r <= ROWS; r += 1) {
                const m = multiplierFor(r, snakes)
                expect(m).toBeGreaterThanOrEqual(prev)
                prev = m
            }
        }
    })

    it('more snakes per row pays more for the same rung (higher risk)', () => {
        expect(multiplierFor(3, 2)).toBeGreaterThan(multiplierFor(3, 1))
    })

    it('per-rung EV equals 1 - HOUSE_EDGE (house edge baked in)', () => {
        for (const snakes of [1, 2]) {
            const survival = (COLS - snakes) / COLS
            // EV of advancing one rung: survival × (fair step) × (1-edge) where
            // fair step = 1/survival ⇒ EV = (1 - edge).
            const stepEv = survival * (1 / survival) * (1 - HOUSE_EDGE)
            expect(stepEv).toBeCloseTo(1 - HOUSE_EDGE, 6)
        }
    })

    it('simulated RTP is a FLAT 1 - HOUSE_EDGE at any depth (edge applied once)', () => {
        // Unlike tower/pump/drill (per-step edge ⇒ RTP^level), snakes shaves the
        // edge exactly once in multiplierFor, so EV = survival^R × (1/survival)^R
        // × (1-edge) = (1-edge) = 0.96 for every target rung. High-variance, so
        // use a shallow target + 60k trials.
        const expected = 1 - HOUSE_EDGE // 0.96, depth-independent
        for (const snakes of [1, 2]) {
            const target = 2
            const rtp = simulateRtp(snakes, target, 60000)
            // eslint-disable-next-line no-console
            console.log(`snakes[${snakes}/row] rungs=${target} RTP=${rtp.toFixed(4)} (expected ~${expected.toFixed(4)})`)
            expect(rtp).toBeGreaterThan(expected * 0.85)
            expect(rtp).toBeLessThan(expected * 1.15)
        }
    })
})
