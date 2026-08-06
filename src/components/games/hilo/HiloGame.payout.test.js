import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { round2 } from '../../../utils/simulationMath'

const source = readFileSync(new URL('./HiloGame.jsx', import.meta.url), 'utf8')

// Mirror of the component's settle math.
function settle({ push, won, payout, betAmount }) {
    const returnAmount = push ? betAmount : won ? round2(betAmount * payout) : 0
    const profit = round2(returnAmount - betAmount)
    return { returnAmount, profit }
}

const MULTIPLIERS = [1.1466666666666667,1.2414814814814814,1.4497777777777776,2.174666666666667,3.262,10.873333333333333]
const STAKES = [1, 2, 3, 5, 7, 10, 25, 100, 137]
const TWO_DP = /^-?\d+(\.\d{1,2})?$/

describe('hi-lo payout rounding', () => {
    it('books a 2dp-clean profit and return for every stake and multiplier', () => {
        for (const m of MULTIPLIERS) {
            for (const stake of STAKES) {
                const { returnAmount, profit } = settle({ push: false, won: m > 0, payout: m, betAmount: stake })
                expect(String(profit)).toMatch(TWO_DP)
                expect(String(returnAmount)).toMatch(TWO_DP)
            }
        }
    })

    it('would drift without the rounding', () => {
        // Fails if the rounding ever becomes a no-op: at least one real
        // multiplier must produce a raw value that is not already 2dp.
        const drifted = MULTIPLIERS.some(m => STAKES.some(stake => !TWO_DP.test(String(stake * m - stake))))
        expect(drifted).toBe(true)
    })

    it('loses exactly the stake on a losing round', () => {
        for (const stake of STAKES) {
            const m = 0
            const { returnAmount, profit } = settle({ push: false, won: m > 0, payout: m, betAmount: stake })
            expect(returnAmount).toBe(0)
            expect(profit).toBe(-stake)
        }
    })

    it('keeps the credited return and the booked profit consistent', () => {
        for (const m of MULTIPLIERS) {
            for (const stake of STAKES) {
                const { returnAmount, profit } = settle({ push: false, won: m > 0, payout: m, betAmount: stake })
                expect(round2(returnAmount - stake)).toBe(profit)
            }
        }
    })

    it('pushes back exactly the stake when the ranks tie', () => {
        for (const stake of STAKES) {
            const { returnAmount, profit } = settle({ push: true, won: false, payout: 0, betAmount: stake })
            expect(returnAmount).toBe(stake)
            expect(profit).toBe(0)
        }
    })
})

describe('hi-lo is pinned to the component', () => {
    it('rounds the return and the profit', () => {
        expect(source).toContain("const returnAmount = push ? betAmount : won ? round2(betAmount * payout) : 0")
        expect(source).toContain("const profit = round2(returnAmount - betAmount)")
    })

    it('imports round2 from the shared money helpers', () => {
        expect(source).toMatch(/import \{[^}]*\bround2\b[^}]*\} from '(\.\.\/)+utils\/simulationMath'/)
    })

    it('routes its timers through the cancellable scheduler', () => {
        expect(source).not.toMatch(/(?<![.\w])setTimeout\(/)
        expect(source).toContain("import { useCancellableTimeouts } from '../../../utils/scheduling'")
        expect(source).toContain('const { schedule } = useCancellableTimeouts()')
    })
})

describe('hi-lo component parses', () => {
    // The tests above read the component as text, so a syntax error would not
    // fail them. Importing makes a broken component fail here rather than only
    // in `npm run build`.
    it('imports without a syntax or module-resolution error', async () => {
        const mod = await import('./HiloGame.jsx')
        expect(typeof mod.default).toBe('function')
    })
})
