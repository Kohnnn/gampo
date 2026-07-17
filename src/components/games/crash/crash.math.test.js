import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { rollCrashMultiplier } from './crashMath'

const GRID_SIZE = 2 ** 32
const fixedVectors = [
    [-1, 1],
    [0, 1],
    [0.009999, 1],
    [0.01, 1],
    [0.5, 1.98],
    [0.7777, 4.45],
    [0.9, 9.9],
    [1, 990000027.99],
    [2, 990000027.99],
    [0.504999, 1.99],
    [0.505, 2],
]

const targetThresholds = [
    [1.25, 1.25],
    [2, 2],
    [5, 5],
    [10, 10],
    [100, 99.99],
]
const targets = targetThresholds.map(([target]) => target)
const thresholdAt = target => 1 - 0.99 / target
const gridProbabilityAt = target => (GRID_SIZE - Math.ceil(thresholdAt(target) * GRID_SIZE)) / GRID_SIZE

describe('crash multiplier mapping', () => {
    it('maps fixed rolls through the production function', () => {
        for (const [roll, multiplier] of fixedVectors) {
            expect(rollCrashMultiplier(roll)).toBe(multiplier)
        }
    })

    it('is monotonic for ordered deterministic rolls', () => {
        const rolls = [-1, 0, 0.009999, 0.01, 0.5, 0.504999, 0.505, 0.7777, 0.9, 1, 2]
        const multipliers = rolls.map(rollCrashMultiplier)

        for (let index = 1; index < multipliers.length; index += 1) {
            expect(multipliers[index]).toBeGreaterThanOrEqual(multipliers[index - 1])
        }
    })

    it('floors fixed vectors to whole cents', () => {
        for (const [roll] of fixedVectors) {
            expect(Number.isInteger(rollCrashMultiplier(roll) * 100)).toBe(true)
        }
        expect(rollCrashMultiplier(0.504999)).toBe(1.99)
        expect(rollCrashMultiplier(0.505)).toBe(2)
    })

    it('distinguishes continuous thresholds from JavaScript threshold representations', () => {
        for (const [target, exactMultiplier] of targetThresholds) {
            const continuousThreshold = thresholdAt(target)

            expect(rollCrashMultiplier(continuousThreshold - Number.EPSILON)).toBeLessThan(target)
            expect(rollCrashMultiplier(continuousThreshold)).toBe(exactMultiplier)
            expect(rollCrashMultiplier(continuousThreshold + Number.EPSILON)).toBeGreaterThanOrEqual(target)
        }
    })

    it('derives the documented continuous and finite-grid probabilities', () => {
        for (const target of targets) {
            const continuousProbability = 0.99 / target
            const gridProbability = gridProbabilityAt(target)

            expect(target * continuousProbability).toBeCloseTo(0.99, 12)
            expect(Math.abs(gridProbability - continuousProbability)).toBeLessThanOrEqual(1 / GRID_SIZE)
        }
    })

    it('keeps CrashGame wired to the extracted mapping and crash roll', () => {
        const source = readFileSync(new URL('./CrashGame.jsx', import.meta.url), 'utf8')

        expect(source).toContain("import { rollCrashMultiplier } from './crashMath'")
        expect(source).toContain("nextRoll('crash')")
    })
})
