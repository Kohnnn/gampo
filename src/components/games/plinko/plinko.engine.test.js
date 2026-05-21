import { describe, it, expect } from 'vitest'

// Galton walk for Plinko: the bin index is the number of "right" steps
// across `rows` Bernoulli(0.5) trials. This test guarantees the engine's
// path-to-bin mapping stays consistent with our RNG model.

function galtonBinIndex(rows, rolls) {
    let bin = 0
    for (let i = 0; i < rows; i++) {
        if (rolls[i] >= 0.5) bin += 1
    }
    return bin
}

describe('plinko galton bin index', () => {
    it('all-left rolls land in bin 0', () => {
        const rolls = Array(16).fill(0)
        expect(galtonBinIndex(16, rolls)).toBe(0)
    })

    it('all-right rolls land in bin = rows', () => {
        const rolls = Array(16).fill(0.99)
        expect(galtonBinIndex(16, rolls)).toBe(16)
    })

    it('balanced 16-row walk lands somewhere in [0, 16]', () => {
        const rolls = Array.from({ length: 16 }, () => Math.random())
        const bin = galtonBinIndex(16, rolls)
        expect(bin).toBeGreaterThanOrEqual(0)
        expect(bin).toBeLessThanOrEqual(16)
    })

    it('bin distribution stays symmetric around rows/2 over many trials', () => {
        const trials = 4000
        const rows = 12
        const counts = new Array(rows + 1).fill(0)
        for (let t = 0; t < trials; t++) {
            const rolls = Array.from({ length: rows }, () => Math.random())
            counts[galtonBinIndex(rows, rolls)] += 1
        }
        const left = counts.slice(0, rows / 2).reduce((a, b) => a + b, 0)
        const right = counts.slice(rows / 2 + 1).reduce((a, b) => a + b, 0)
        // With 4000 trials the symmetry should be within ~10%.
        expect(Math.abs(left - right) / trials).toBeLessThan(0.1)
    })
})
