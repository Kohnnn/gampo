// Generated guard for Diamonds: pins the settle arithmetic against float drift.
// The component is read as source text where the settle body cannot be imported
// in isolation; the mirrors below are kept identical to the real expressions.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { round2 } from '../../../utils/simulationMath'

// Mirror of the settle body in DiamondsGame.jsx. payoutFor() is already
// rounded at source; the drift here comes from stake x multiplier.
const settle = (betAmount, multiplier) => {
    const won = multiplier > 0
    const returnAmount = won ? round2(betAmount * multiplier) : 0
    const profit = round2(returnAmount - betAmount)
    return { returnAmount, profit }
}

describe('Diamonds payout rounding', () => {
    it('books a 2dp return and profit across plausible multipliers and stakes', () => {
        for (let cents = 1; cents <= 400; cents += 7) {
            const multiplier = round2(cents / 10)
            for (const stake of [0.01,0.1,0.25,0.5,1,2.5,5,7,12.5,25,33,100,140]) {
                const { returnAmount, profit } = settle(stake, multiplier)
                expect(returnAmount).toBe(round2(returnAmount))
                expect(profit).toBe(round2(profit))
                expect(round2(profit + stake)).toBe(returnAmount)
            }
        }
    })

    it('corrects a stake/multiplier pair that drifts without rounding', () => {
        const raw = 0.1 * 1.17
        expect(raw).not.toBe(round2(raw))
        expect(settle(0.1, 1.17).returnAmount).toBe(0.12)
    })

    it('books the full stake as the loss when nothing matches', () => {
        expect(settle(7, 0)).toEqual({ returnAmount: 0, profit: -7 })
    })
})

describe('DiamondsGame settle source', () => {
    const src = readFileSync(new URL('./DiamondsGame.jsx', import.meta.url), 'utf8')

    it('rounds the win return', () => {
        expect(src).toContain("won ? round2(betAmount * multiplier) : 0")
    })

    it('rounds the profit', () => {
        expect(src).toContain("const profit = round2(returnAmount - betAmount)")
    })
})

describe('DiamondsGame component parses', () => {
    it('imports without a syntax error', async () => {
        const mod = await import('./DiamondsGame.jsx')
        expect(typeof mod.default).toBe('function')
    })
})
