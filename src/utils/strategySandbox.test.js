import { describe, it, expect } from 'vitest'
import { runStrategySandbox, STRATEGIES } from './strategySandbox'

describe('runStrategySandbox', () => {
    it('is deterministic for a fixed seed', () => {
        const a = runStrategySandbox({ seed: 42, runs: 200, rounds: 100 })
        const b = runStrategySandbox({ seed: 42, runs: 200, rounds: 100 })
        expect(a.meanFinal).toBe(b.meanFinal)
        expect(a.bustRate).toBe(b.bustRate)
    })

    it('shows a negative-EV game loses money on average (the core lesson)', () => {
        // 49.5% to double => EV per unit negative
        const r = runStrategySandbox({
            strategy: 'flat', startBalance: 1000, baseBet: 10,
            winChance: 0.495, payoutMultiplier: 2, rounds: 500, runs: 2000, seed: 7,
        })
        expect(r.theoreticalEvPerUnit).toBeLessThan(0)
        expect(r.expectedNetPerRun).toBeLessThan(0)
    })

    it('martingale raises max bet far above flat and still loses long-run', () => {
        const flat = runStrategySandbox({ strategy: 'flat', winChance: 0.495, payoutMultiplier: 2, baseBet: 10, runs: 1000, rounds: 300, seed: 3 })
        const mart = runStrategySandbox({ strategy: 'martingale', winChance: 0.495, payoutMultiplier: 2, baseBet: 10, runs: 1000, rounds: 300, seed: 3 })
        expect(mart.maxBetSeen).toBeGreaterThan(flat.maxBetSeen)
        expect(mart.expectedNetPerRun).toBeLessThan(0)
    })

    it('a fair game (EV 0) stays roughly break-even on average', () => {
        const r = runStrategySandbox({ winChance: 0.5, payoutMultiplier: 2, baseBet: 10, startBalance: 1000, runs: 4000, rounds: 300, seed: 11 })
        expect(Math.abs(r.theoreticalEvPerUnit)).toBeLessThan(1e-9)
        // mean final should be within a few % of start over many runs
        expect(Math.abs(r.meanFinal - 1000)).toBeLessThan(120)
    })

    it('produces a normalised histogram summing to runs', () => {
        const r = runStrategySandbox({ runs: 500, rounds: 80, seed: 9 })
        const total = r.histogram.reduce((acc, b) => acc + b.count, 0)
        expect(total).toBe(500)
        expect(r.histogram.length).toBe(12)
    })

    it('reports bust and profitable rates between 0 and 1', () => {
        const r = runStrategySandbox({ strategy: 'martingale', winChance: 0.48, payoutMultiplier: 2, runs: 800, rounds: 400, seed: 5 })
        expect(r.bustRate).toBeGreaterThanOrEqual(0)
        expect(r.bustRate).toBeLessThanOrEqual(1)
        expect(r.profitableRate).toBeGreaterThanOrEqual(0)
        expect(r.profitableRate).toBeLessThanOrEqual(1)
    })

    it('clamps absurd inputs into safe ranges', () => {
        const r = runStrategySandbox({ rounds: 1e9, runs: 1e9, winChance: 5, payoutMultiplier: 2 })
        expect(r.input.rounds).toBeLessThanOrEqual(5000)
        expect(r.input.runs).toBeLessThanOrEqual(20000)
        expect(r.input.winChance).toBeLessThanOrEqual(0.999)
    })

    it('exposes the strategy catalog', () => {
        expect(STRATEGIES.map(s => s.id)).toContain('martingale')
        expect(STRATEGIES.length).toBeGreaterThanOrEqual(6)
    })
})
