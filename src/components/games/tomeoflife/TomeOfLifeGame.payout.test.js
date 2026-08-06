import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { round2 } from '../../../utils/simulationMath'

const source = readFileSync(new URL('./TomeOfLifeGame.jsx', import.meta.url), 'utf8')

// Symbol face values, mirrored from the SYMBOLS table in the component. The
// pinning test below fails if those values change, forcing this to be updated.
const SUN = 0.6
const MOON = 0.93

// Mirror of finishRound's money math.
function finish({ mult, stake }) {
    const totalReturn = round2(stake * mult)
    const profit = round2(totalReturn - stake)
    return { totalReturn, profit }
}

describe('tome of life payout rounding', () => {
    it('accumulates a multiplier that is genuinely inexact in binary', () => {
        // This is the reason the rounding is needed at all -- if this ever
        // becomes exact, the round2 calls are no longer load-bearing.
        const mult = 1 + SUN + MOON
        expect(mult).not.toBe(2.53)
        expect(mult).toBe(2.5300000000000002)
    })

    it('books a clean 2dp profit on a Sun+Moon cash-out', () => {
        const { totalReturn, profit } = finish({ mult: 1 + SUN + MOON, stake: 5 })
        // Raw arithmetic here is 7.650000000000002.
        expect(profit).toBe(7.65)
        expect(totalReturn).toBe(12.65)
    })

    it('books a clean 2dp profit when a Star doubles a page', () => {
        // Star doubles the next page only: 1 + Moon + (Sun * 2).
        const { totalReturn, profit } = finish({ mult: 1 + MOON + SUN * 2, stake: 7 })
        expect(totalReturn).toBe(21.91)
        expect(profit).toBe(14.91)
        expect(String(profit)).toMatch(/^-?\d+(\.\d{1,2})?$/)
    })

    it('returns exactly the stake at a 1x multiplier, so profit is zero', () => {
        const { totalReturn, profit } = finish({ mult: 1, stake: 5 })
        expect(totalReturn).toBe(5)
        expect(profit).toBe(0)
    })

    it('keeps profit 2dp-clean across a sweep of stakes and multipliers', () => {
        const twoDp = /^-?\d+(\.\d{1,2})?$/
        for (const stake of [1, 3, 5, 7, 25, 100, 137]) {
            for (const mult of [1 + SUN, 1 + MOON, 1 + SUN + MOON, 1 + SUN * 2 + MOON, 1 + SUN + MOON + SUN]) {
                const { totalReturn, profit } = finish({ mult, stake })
                expect(String(profit)).toMatch(twoDp)
                expect(String(totalReturn)).toMatch(twoDp)
            }
        }
    })
})

describe('tome of life is pinned to the component', () => {
    it('keeps the symbol values this mirror assumes', () => {
        // Anchors include the trailing weight so that a drift to `value: 0.61`
        // cannot satisfy a `toContain` that stops at `value: 0.6`.
        expect(source).toContain("id: 'sun', icon: '\u2600\uFE0F', name: 'Sun', value: 0.6, weight: 38")
        expect(source).toContain("id: 'moon', icon: '\uD83C\uDF19', name: 'Moon', value: 0.93, weight: 26")
        expect(source).toContain("id: 'star', icon: '\u2B50', name: 'Star', value: 0, weight: 14")
        expect(source).toContain("id: 'skull', icon: '\uD83D\uDC80', name: 'Skull', value: 0, weight: 22")
    })

    it('rounds the return and the profit in finishRound', () => {
        expect(source).toContain('const totalReturn = round2(currentStake * mult)')
        expect(source).toContain('const profit = round2(totalReturn - currentStake)')
    })

    it('credits the rounded return rather than the raw product', () => {
        expect(source).toContain("addWinnings(totalReturn, 'Tome of Life return')")
        expect(source).not.toContain("addWinnings(currentStake * mult")
    })

    it('imports round2 instead of hand-rolling rounding', () => {
        expect(source).toContain("import { formatCredits, round2 } from '../../../utils/simulationMath'")
    })

    it('schedules every timer through the cancellable scheduler', () => {
        expect(source).not.toContain('window.setTimeout')
        expect(source).toContain("import { useCancellableTimeouts } from '../../../utils/scheduling'")
        expect(source).toContain('const { schedule } = useCancellableTimeouts()')
    })
})

describe('tome of life component parses', () => {
    // The tests above read the component as text, so a syntax error in it
    // would not fail them. Importing it makes a broken component fail here
    // instead of only failing `npm run build`.
    it('imports without a syntax or module-resolution error', async () => {
        const mod = await import('./TomeOfLifeGame.jsx')
        expect(typeof mod.default).toBe('function')
    })
})
