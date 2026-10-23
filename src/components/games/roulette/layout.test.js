import { describe, expect, it } from 'vitest'
import { buildRouletteCoverage, makeBet, ORPHELINS, TIER, VOISINS, ZERO_NEIGHBOURS, resolveRouletteTicket } from './layout'

function coveredNumbers(type) {
    return [...buildRouletteCoverage([{ type, params: {}, amount: 5 }]).keys()].sort((a, b) => a - b)
}

describe('roulette layout helpers', () => {
    it('covers every number in outside dozen and column bets', () => {
        expect(coveredNumbers('dozen3')).toEqual(Array.from({ length: 12 }, (_, i) => i + 25))
        expect(coveredNumbers('col2')).toEqual([2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35])
        expect(coveredNumbers('black')).toHaveLength(18)
    })

    it('covers European racetrack sectors from makeBet definitions', () => {
        expect(coveredNumbers('voisins')).toEqual([...VOISINS].sort((a, b) => a - b))
        expect(coveredNumbers('tier')).toEqual([...TIER].sort((a, b) => a - b))
        expect(coveredNumbers('orphelins')).toEqual([...ORPHELINS].sort((a, b) => a - b))
        expect(coveredNumbers('zeroNeighbours')).toEqual([...ZERO_NEIGHBOURS].sort((a, b) => a - b))
    })

    it('keeps straight chips distinct from advanced coverage', () => {
        const coverage = buildRouletteCoverage([
            { type: 'straight', params: { n: 17 }, amount: 5 },
            { type: 'dozen2', params: {}, amount: 10 },
        ])

        expect(coverage.get(17).straightAmount).toBe(5)
        expect(coverage.get(17).coveredAmount).toBe(10)
        expect(coverage.get(17).coverCount).toBe(1)
        expect(makeBet('dozen2').numbers).toContain(17)
    })

    it('quotes all current chips before any repeat ticket', () => {
        const bets = [{ type: 'straight', params: { n: 36 }, amount: 5 }, { type: 'col3', params: {}, amount: 25 }]
        expect(resolveRouletteTicket(bets, [{ type: 'red', amount: 100 }], 'manual')).toEqual({ bets, stake: 30 })
    })

    it('quotes the existing manual and Auto repeat ticket and leaves an empty ticket empty', () => {
        const lastChips = [{ type: 'red', params: {}, amount: 5 }, { type: 'col3', params: {}, amount: 10 }]
        for (const mode of ['manual', 'auto']) {
            expect(resolveRouletteTicket([], lastChips, mode)).toEqual({ bets: lastChips, stake: 15 })
        }
        expect(resolveRouletteTicket([], lastChips, 'strategy')).toEqual({ bets: [], stake: 0 })
        expect(resolveRouletteTicket([], [], 'manual')).toEqual({ bets: [], stake: 0 })
    })
})
