import { describe, it, expect } from 'vitest'

// Dino survival is a simple Bernoulli per "step": survive iff roll < safe.
// The growth multiplier is `growth^steps`. Growth is locked to TARGET_RTP/safe
// so each surviving step has an expected value of exactly TARGET_RTP and no
// preset is ever player-favorable. These tests pin both contracts.

const TARGET_RTP = 0.99
const lockGrowth = safe => Number((TARGET_RTP / safe).toFixed(4))
const PRESETS = {
    easy:    { safe: 0.86, growth: lockGrowth(0.86) },
    medium:  { safe: 0.72, growth: lockGrowth(0.72) },
    hard:    { safe: 0.58, growth: lockGrowth(0.58) },
    extreme: { safe: 0.42, growth: lockGrowth(0.42) },
}

function multiplierAfter(steps, growth) {
    return Number(Math.pow(growth, steps).toFixed(2))
}

describe('dino step model', () => {
    it('multiplier starts at 1 with 0 steps', () => {
        expect(multiplierAfter(0, PRESETS.medium.growth)).toBe(1)
    })

    it('multiplier grows monotonically with steps', () => {
        let prev = 0
        for (let s = 0; s <= 12; s++) {
            const m = multiplierAfter(s, PRESETS.medium.growth)
            expect(m).toBeGreaterThanOrEqual(prev)
            prev = m
        }
    })

    it('extreme grows faster than easy at the same step', () => {
        const easy = multiplierAfter(5, PRESETS.easy.growth)
        const ext  = multiplierAfter(5, PRESETS.extreme.growth)
        expect(ext).toBeGreaterThan(easy)
    })

    it('survival is deterministic given a fixed roll', () => {
        const roll = 0.5
        expect(roll < PRESETS.easy.safe).toBe(true)
        expect(roll < PRESETS.extreme.safe).toBe(false)
    })

    it('every preset has a per-step EV of TARGET_RTP (never +EV)', () => {
        for (const preset of Object.values(PRESETS)) {
            const perStepEv = preset.safe * preset.growth
            expect(perStepEv).toBeCloseTo(TARGET_RTP, 2)
            expect(perStepEv).toBeLessThanOrEqual(1)
        }
    })
})
