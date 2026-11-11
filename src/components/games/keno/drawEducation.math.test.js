import { describe, expect, it } from 'vitest'
import { kenoPayout, round2 } from '../../../utils/simulationMath'
import { drawDistribution, precisePercent, twentyPlayRisk } from './drawEducationMath'

// Independent oracle: sequential sampling without replacement, not choose(n,k).
function oracle(population, draws, picks) {
    let mass = [1]
    for (let drawn = 0; drawn < draws; drawn += 1) {
        const next = Array(picks + 1).fill(0)
        for (let hits = 0; hits < mass.length; hits += 1) {
            if (!mass[hits]) continue
            const hit = (picks - hits) / (population - drawn)
            next[hits] += mass[hits] * (1 - hit)
            if (hits < picks) next[hits + 1] += mass[hits] * hit
        }
        mass = next
    }
    return mass
}

describe('full draw distribution independent oracle', () => {
    for (let picks = 1; picks <= 10; picks += 1) {
        it(`matches every Keno outcome for ${picks} picks and cent-rounded stakes`, () => {
            const probabilities = oracle(40, 10, picks)
            for (const stake of [0.01, 0.33, 5, 137]) {
                const quote = drawDistribution('keno', picks, stake)
                expect(quote.outcomes).toHaveLength(picks + 1)
                let expected = 0
                let paying = 0
                for (const row of quote.outcomes) {
                    expect(row.probability).toBeCloseTo(probabilities[row.hits], 14)
                    expect(row.multiplier).toBe(kenoPayout(picks, row.hits))
                    expect(row.returnAmount).toBe(round2(stake * kenoPayout(picks, row.hits)))
                    expected += probabilities[row.hits] * row.returnAmount
                    if (row.returnAmount > 0) paying += probabilities[row.hits]
                }
                expect(quote.expectedReturn).toBeCloseTo(expected, 12)
                expect(quote.effectiveRtp).toBeCloseTo(expected / stake, 12)
                expect(quote.payingProbability).toBeCloseTo(paying, 14)
                expect(quote.outcomes.reduce((sum, row) => sum + row.probability, 0)).toBeCloseTo(1, 14)
            }
        })
    }

    it('matches Lottery including the nonpaying 0 and 1 hits', () => {
        const quote = drawDistribution('lottery', 5, 7)
        const probabilities = oracle(36, 5, 5)
        const table = [0, 0, 4, 25, 250, 5000]
        quote.outcomes.forEach((row, hits) => {
            expect(row.probability).toBeCloseTo(probabilities[hits], 14)
            expect(row.multiplier).toBe(table[hits])
        })
        expect(quote.payingProbability).toBeCloseTo(probabilities.slice(2).reduce((a, b) => a + b, 0), 14)
        expect(quote.effectiveRtp).toBeCloseTo(probabilities.reduce((sum, p, h) => sum + p * table[h], 0), 12)
        expect(quote.outcomes[5].probability).toBeCloseTo(1 / 376992, 14)
        // 0 and 1 hits are real, common, nonpaying outcomes — not omitted.
        expect(quote.outcomes[0].returnAmount).toBe(0)
        expect(quote.outcomes[1].returnAmount).toBe(0)
        expect(quote.payingProbability).toBeLessThan(0.15)
    })

    it('never rounds a tiny possible outcome to zero', () => {
        expect(precisePercent(drawDistribution('keno', 10, 5).outcomes[10].probability)).not.toBe('0%')
        expect(precisePercent(1e-15)).toBe('1.000000e-13%')
    })

    it('does not fabricate a quote for invalid configurations', () => {
        for (const picks of [0, 11, 1.5, NaN]) expect(drawDistribution('keno', picks, 5)).toBeNull()
        for (const picks of [0, 1, 2, 3, 4, 6]) expect(drawDistribution('lottery', picks, 5)).toBeNull()
        for (const stake of [0, -1, NaN, Infinity]) expect(drawDistribution('keno', 5, stake)).toBeNull()
        expect(drawDistribution('roulette', 5, 5)).toBeNull()
    })
})

describe('finite wallet risk', () => {
    it('counts inability to start, but not inability to fund play 21', () => {
        const loss = { outcomes: [{ probability: 1, returnAmount: 0 }] }
        expect(twentyPlayRisk(loss, 5, 4)).toBe(1)
        expect(twentyPlayRisk(loss, 5, 95)).toBe(1)
        expect(twentyPlayRisk(loss, 5, 100)).toBe(0)
    })

    it('reinvests full payouts rather than treating every nonwin as total loss', () => {
        const push = { outcomes: [{ probability: 1, returnAmount: 5 }] }
        expect(twentyPlayRisk(push, 5, 5)).toBe(0)
    })

    it('agrees with exhaustive enumeration of all 2^20 binary sequences', () => {
        const binary = { outcomes: [{ probability: 0.5, returnAmount: 0 }, { probability: 0.5, returnAmount: 10 }] }
        const stake = 5
        const balance = 95
        // 1 million sequences of 20 plays; bit set = that play pays 2x.
        let failing = 0
        for (let mask = 0; mask < 2 ** 20; mask += 1) {
            let wallet = balance
            let failed = false
            for (let play = 0; play < 20 && !failed; play += 1) {
                if (wallet < stake) { failed = true; break }
                wallet += (mask & (1 << play)) ? stake : -stake
            }
            if (failed) failing += 1
        }
        expect(twentyPlayRisk(binary, stake, balance)).toBeCloseTo(failing / 2 ** 20, 12)
    })

    it('refuses invalid wallet and unsupported fractional-cent stakes', () => {
        const quote = drawDistribution('keno', 5, 5)
        expect(twentyPlayRisk(quote, 5, NaN)).toBeNull()
        expect(twentyPlayRisk(quote, 0.001, 5)).toBeNull()
        expect(twentyPlayRisk(null, 5, 100)).toBeNull()
    })
})