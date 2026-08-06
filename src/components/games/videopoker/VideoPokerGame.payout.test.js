import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { round2 } from '../../../utils/simulationMath'

const source = readFileSync(new URL('./VideoPokerGame.jsx', import.meta.url), 'utf8')

// Mirror of the component's settle math.
function settle({ multiplier, activeBet }) {
    const returnAmount = round2(activeBet * multiplier)
    const profit = round2(returnAmount - activeBet)
    return { returnAmount, profit }
}

const MULTIPLIERS = [0,1,1.5,2,3,4.5,6,9,25,50,250,800]
const STAKES = [1, 2, 3, 5, 7, 10, 25, 100, 137]
const TWO_DP = /^-?\d+(\.\d{1,2})?$/

describe('video poker payout rounding', () => {
    it('books a 2dp-clean profit and return for every stake and multiplier', () => {
        for (const m of MULTIPLIERS) {
            for (const stake of STAKES) {
                const { returnAmount, profit } = settle({ multiplier: m, activeBet: stake })
                expect(String(profit)).toMatch(TWO_DP)
                expect(String(returnAmount)).toMatch(TWO_DP)
            }
        }
    })

    it('has a paytable that does not currently drift', () => {
        // Unlike the other games in this pass, every video poker multiplier is
        // a whole or half number, so raw arithmetic is already 2dp-clean. The
        // round2 calls here are defensive: they hold the line if the paytable
        // ever gains a fractional entry. This test documents that, so nobody
        // reads the rounding as fixing a live bug.
        const drifted = MULTIPLIERS.some(m => STAKES.some(stake => !TWO_DP.test(String(stake * m - stake))))
        expect(drifted).toBe(false)
    })

    it('stays clean if a fractional multiplier is ever added', () => {
        // A 1.6x entry would drift raw (stake 3 -> 1.8000000000000007).
        expect(String(3 * 1.6 - 3)).not.toMatch(TWO_DP)
        const { returnAmount, profit } = settle({ multiplier: 1.6, activeBet: 3 })
        expect(returnAmount).toBe(4.8)
        expect(profit).toBe(1.8)
    })

    it('loses exactly the stake on a losing round', () => {
        for (const stake of STAKES) {
            const m = 0
            const { returnAmount, profit } = settle({ multiplier: m, activeBet: stake })
            expect(returnAmount).toBe(0)
            expect(profit).toBe(-stake)
        }
    })

    it('keeps the credited return and the booked profit consistent', () => {
        for (const m of MULTIPLIERS) {
            for (const stake of STAKES) {
                const { returnAmount, profit } = settle({ multiplier: m, activeBet: stake })
                expect(round2(returnAmount - stake)).toBe(profit)
            }
        }
    })
})

describe('video poker is pinned to the component', () => {
    it('rounds the return and the profit', () => {
        expect(source).toContain("const returnAmount = round2(activeBet * outcome.multiplier)")
        expect(source).toContain("const profit = round2(returnAmount - activeBet)")
    })

    it('imports round2 from the shared money helpers', () => {
        expect(source).toMatch(/import \{[^}]*\bround2\b[^}]*\} from '(\.\.\/)+utils\/simulationMath'/)
    })

    it('keeps its existing tracked timer cleanup', () => {
        // This game already cleared its timers via a ref, so it keeps that
        // rather than gaining the shared scheduler.
        expect(source).toContain('clearTimeout')
    })
})

describe('video poker component parses', () => {
    // The tests above read the component as text, so a syntax error would not
    // fail them. Importing makes a broken component fail here rather than only
    // in `npm run build`.
    it('imports without a syntax or module-resolution error', async () => {
        const mod = await import('./VideoPokerGame.jsx')
        expect(typeof mod.default).toBe('function')
    })
})
