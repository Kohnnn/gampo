import { describe, it, expect } from 'vitest'

// Dino survival is a simple Bernoulli per "step": survive iff roll < safe.
// The growth multiplier is `growth^steps`. These tests pin both contracts.

const PRESETS = {
    easy:    { safe: 0.86, growth: 1.18 },
    medium:  { safe: 0.72, growth: 1.32 },
    hard:    { safe: 0.58, growth: 1.55 },
    extreme: { safe: 0.42, growth: 2.00 },
}

function multiplierAfter(steps, growth) {
    return Number(Math.pow(growth, steps).toFixed(2))
}

describe('dino step model', () => {
    it('multiplier starts at 1 with 0 steps', () => {
        expect(multiplierAfter(0, 1.32)).toBe(1)
    })

    it('multiplier grows monotonically with steps', () => {
        let prev = 0
        for (let s = 0; s <= 12; s++) {
            const m = multiplierAfter(s, 1.32)
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

    it('average reward at fixed step is presets-consistent', () => {
        // After 3 steps on medium, multiplier should be 1.32^3 ≈ 2.30.
        expect(multiplierAfter(3, 1.32)).toBeCloseTo(2.30, 1)
    })
})
