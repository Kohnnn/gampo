import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { round2 } from '../../../utils/simulationMath'

const source = readFileSync(new URL('./CoinFlipGame.jsx', import.meta.url), 'utf8')

// Mirror of the component's settle math.
function settle({ won, payout, betAmount }) {
    const returnAmount = won ? round2(betAmount * payout) : 0
    const profit = round2(returnAmount - betAmount)
    return { returnAmount, profit }
}

const MULTIPLIERS = [1.96]
const STAKES = [1, 2, 3, 5, 7, 10, 25, 100, 137]
const TWO_DP = /^-?\d+(\.\d{1,2})?$/

describe('coin flip payout rounding', () => {
    it('books a 2dp-clean profit and return for every stake and multiplier', () => {
        for (const m of MULTIPLIERS) {
            for (const stake of STAKES) {
                const { returnAmount, profit } = settle({ won: m > 0, payout: m, betAmount: stake })
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
            const { returnAmount, profit } = settle({ won: m > 0, payout: m, betAmount: stake })
            expect(returnAmount).toBe(0)
            expect(profit).toBe(-stake)
        }
    })

    it('keeps the credited return and the booked profit consistent', () => {
        for (const m of MULTIPLIERS) {
            for (const stake of STAKES) {
                const { returnAmount, profit } = settle({ won: m > 0, payout: m, betAmount: stake })
                expect(round2(returnAmount - stake)).toBe(profit)
            }
        }
    })
})

describe('coin flip is pinned to the component', () => {
    it('rounds the return and the profit', () => {
        expect(source).toContain("const returnAmount = won ? round2(betAmount * payout) : 0")
        expect(source).toContain("const profit = round2(returnAmount - betAmount)")
        expect(source).toContain("const payout = 1.96")
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

describe('coin flip component parses', () => {
    // The tests above read the component as text, so a syntax error would not
    // fail them. Importing makes a broken component fail here rather than only
    // in `npm run build`.
    it('imports without a syntax or module-resolution error', async () => {
        const mod = await import('./CoinFlipGame.jsx')
        expect(typeof mod.default).toBe('function')
    })
})
