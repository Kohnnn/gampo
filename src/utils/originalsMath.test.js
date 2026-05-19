import { describe, it, expect } from 'vitest'

// Tower curve: cumulative survival probability and multiplier compounding
function towerExpected(level, safeChance = 0.7, growth = 1.28) {
    return {
        survival: Math.pow(safeChance, Math.max(1, level)),
        multiplier: Math.pow(growth, level),
    }
}

// Chicken Cross: 12 lanes with config
function chickenExpected(lane, config) {
    return {
        survival: Math.pow(config.safe, Math.max(1, lane + 1)),
        multiplier: Math.pow(config.growth, lane),
    }
}

// Sic Bo distribution helper
function totalDistribution() {
    const counts = {}
    for (let a = 1; a <= 6; a++) {
        for (let b = 1; b <= 6; b++) {
            for (let c = 1; c <= 6; c++) {
                const total = a + b + c
                counts[total] = (counts[total] || 0) + 1
            }
        }
    }
    return counts
}

describe('originals math', () => {
    it('tower compounds geometrically', () => {
        const lvl0 = towerExpected(0)
        const lvl5 = towerExpected(5)
        expect(lvl0.multiplier).toBe(1)
        expect(lvl5.multiplier).toBeCloseTo(Math.pow(1.28, 5), 5)
        expect(lvl5.survival).toBeLessThan(0.2)
    })

    it('chicken cross harder = lower survival, higher payout', () => {
        const easy = chickenExpected(5, { safe: 0.85, growth: 1.18 })
        const hard = chickenExpected(5, { safe: 0.58, growth: 1.55 })
        expect(easy.survival).toBeGreaterThan(hard.survival)
        expect(hard.multiplier).toBeGreaterThan(easy.multiplier)
    })

    it('sic bo total distribution is symmetric and sums to 216', () => {
        const counts = totalDistribution()
        const sum = Object.values(counts).reduce((a, b) => a + b, 0)
        expect(sum).toBe(216)
        // symmetry around 10.5
        for (let total = 4; total <= 17; total++) {
            const mirror = 21 - total
            expect(counts[total]).toBe(counts[mirror])
        }
    })

    it('sic bo big range probability matches 105/216', () => {
        const counts = totalDistribution()
        let big = 0
        for (let t = 11; t <= 17; t++) big += counts[t] || 0
        // Excluding triples that sum to those totals
        const triples = [11, 12, 13, 14, 15, 16, 17].filter(t => t % 3 === 0).length // none are triples
        expect(big - triples).toBe(105)
    })
})
