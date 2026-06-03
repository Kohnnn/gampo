import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildRouletteCoverage, makeBet, ORPHELINS, TIER, VOISINS, ZERO_NEIGHBOURS } from './layout'

const rouletteCss = readFileSync(new URL('./roulette.css', import.meta.url), 'utf8')
const rouletteSource = readFileSync(new URL('./RouletteGame.jsx', import.meta.url), 'utf8')

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

    it('keeps live-table rows from truncating the whole panel', () => {
        expect(rouletteCss).toContain('grid-template-columns: minmax(74px, 1.1fr)')
        expect(rouletteCss).toContain('text-overflow: ellipsis')
        expect(rouletteCss).toContain('font-variant-numeric: tabular-nums')
        expect(rouletteSource).toContain('title={p.name}')
        expect(rouletteSource).toContain('title={p.label}')
    })
})
