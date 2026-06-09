import { describe, it, expect } from 'vitest'

// A-P3-2: Pump house-edge lock.
//
// Source of truth: src/components/games/pump/PumpGame.jsx:35-63.
// Each pump survives with prob (1 - STEP_BUST_CHANCE) and multiplies by
// STEP_RAMP. STEP_RAMP is locked so per-step EV = survival × ramp = PUMP_RTP.

const STEP_BUST_CHANCE = 0.12
const PUMP_RTP = 0.96
const STEP_RAMP = Number(((PUMP_RTP) / (1 - STEP_BUST_CHANCE)).toFixed(4))
const MAX_PUMPS = 10

// PumpGame.jsx:62
function multiplierAt(pumps) {
    return pumps === 0 ? 1 : Number(Math.pow(STEP_RAMP, pumps).toFixed(4))
}

// Monte-Carlo: bettor pumps to `targetPumps` then cashes.
function simulateRtp(targetPumps, trials, rng = Math.random) {
    const survival = 1 - STEP_BUST_CHANCE
    let totalReturn = 0
    for (let i = 0; i < trials; i += 1) {
        let pumps = 0
        let alive = true
        while (alive && pumps < targetPumps) {
            if (rng() < survival) pumps += 1
            else alive = false
        }
        if (alive) totalReturn += multiplierAt(targetPumps)
    }
    return totalReturn / trials
}

describe('pump payout math', () => {
    it('is 1× before any pump', () => {
        expect(multiplierAt(0)).toBe(1)
    })

    it('multiplier is strictly monotonic in pumps', () => {
        let prev = 0
        for (let p = 0; p <= MAX_PUMPS; p += 1) {
            const m = multiplierAt(p)
            expect(m).toBeGreaterThan(prev)
            prev = m
        }
    })

    it('per-step EV equals PUMP_RTP (house edge baked into the ramp)', () => {
        expect((1 - STEP_BUST_CHANCE) * STEP_RAMP).toBeCloseTo(PUMP_RTP, 3)
    })

    it('analytic EV of any target pump count is RTP^pumps (≤ 1, never +EV)', () => {
        for (let p = 1; p <= MAX_PUMPS; p += 1) {
            const ev = Math.pow(1 - STEP_BUST_CHANCE, p) * multiplierAt(p)
            expect(ev).toBeCloseTo(Math.pow(PUMP_RTP, p), 2)
            expect(ev).toBeLessThan(1)
        }
    })

    it('simulated RTP holds the house edge over 20k trials', () => {
        for (const target of [1, 3, 6]) {
            const rtp = simulateRtp(target, 20000)
            const expected = Math.pow(PUMP_RTP, target)
            // eslint-disable-next-line no-console
            console.log(`pump pumps=${target} RTP=${rtp.toFixed(4)} (expected ~${expected.toFixed(4)})`)
            expect(rtp).toBeLessThan(1)
            expect(rtp).toBeGreaterThan(expected * 0.85)
            expect(rtp).toBeLessThan(expected * 1.15)
        }
    })
})
