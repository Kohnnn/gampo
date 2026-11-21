import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildRouletteCoverage, makeBet, ORPHELINS, PHONE_BOARD, roulettePhoneBoard, TIER, VOISINS, ZERO_NEIGHBOURS, resolveRouletteTicket } from './layout'

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

    // QA019: the phone defect was the rightmost columns falling outside a 301px
    // board. Reachability is now a declared property of the layout: the mobile
    // cascade lays 1-36 three per row and the computed cell width stays above the
    // 44px touch minimum at every phone width, so no column is off-screen.
    it('keeps every number and outside bet reachable on a phone viewport', () => {
        for (const width of [320, 360, 375, 390, 414, 430]) {
            const board = roulettePhoneBoard(width)
            expect(board.fits, `${width}px`).toBe(true)
            expect(board.cellWidth).toBeGreaterThanOrEqual(PHONE_BOARD.minTouch)
        }
        // 1-36 in threes plus the zero's own row: every cell has a place.
        expect(roulettePhoneBoard(375).columns * (roulettePhoneBoard(375).rows - 1)).toBeGreaterThanOrEqual(36)
        // Below the touch minimum the layout must stop shrinking targets instead
        // of silently clipping, so 150px is honestly reported as not fitting.
        expect(roulettePhoneBoard(150).fits).toBe(false)
    })

    it('declares the mobile three-column cascade the fit is computed from', () => {
        const css = readFileSync(fileURLToPath(new URL('./roulette.css', import.meta.url)), 'utf8')
        // The parity guard: the arithmetic above is only true while the phone
        // cascade keeps three shrinking columns, a 52px number cell and the 44px
        // outside-bet hit target, with the zero keeping a full row to itself so
        // it cannot be paired into a half-width cell.
        expect(css).toMatch(/\.rou-cell\.zero\s*{[^}]*grid-column:\s*1\s*\/\s*-1/)
        expect(css).toMatch(/\.rou-bottom\s*{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/)
        expect(css).toMatch(/\.rou-cell\s*{[^}]*min-height:\s*52px/)
        expect(css).toMatch(/\.rou-extra-cell,\s*\.rou-track-cell\s*{[^}]*min-height:\s*44px/)
    })
})
