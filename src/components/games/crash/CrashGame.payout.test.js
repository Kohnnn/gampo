// Generated guard for Crash: pins the settle arithmetic against float drift.
// The component is read as source text where the settle body cannot be imported
// in isolation; the mirrors below are kept identical to the real expressions.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { round2 } from '../../../utils/simulationMath'

// Mirror of both cash-out bodies in CrashGame.jsx (manual and auto). The
// multiplier is already snapped to 2dp; stake x multiplier still drifts.
const settle = (stake, m) => {
    const effective = Number(m.toFixed(2))
    const totalReturn = round2(stake * effective)
    const profit = round2(totalReturn - stake)
    return { effective, totalReturn, profit }
}

describe('Crash payout rounding', () => {
    it('books a 2dp return and profit across the multiplier curve', () => {
        for (let cents = 100; cents <= 2000; cents += 13) {
            const m = cents / 100
            for (const stake of [0.01,0.1,0.25,0.5,1,2.5,5,7,12.5,25,33,100,140]) {
                const { totalReturn, profit } = settle(stake, m)
                expect(totalReturn).toBe(round2(totalReturn))
                expect(profit).toBe(round2(profit))
                expect(round2(profit + stake)).toBe(totalReturn)
            }
        }
    })

    it('corrects a stake/multiplier pair that drifts without rounding', () => {
        const raw = 0.1 * 1.23
        expect(raw).not.toBe(round2(raw))
        expect(settle(0.1, 1.23).totalReturn).toBe(0.12)
    })

    it('books no profit at a 1.00x cash-out', () => {
        expect(settle(5, 1).profit).toBe(0)
    })

    it('derives profit from the rounded return, not the raw product', () => {
        const { totalReturn, profit } = settle(7, 1.07)
        expect(totalReturn).toBe(7.49)
        expect(profit).toBe(0.49)
    })
})

describe('CrashGame settle source', () => {
    const src = readFileSync(new URL('./CrashGame.jsx', import.meta.url), 'utf8')

    it('rounds the return', () => {
        expect(src).toContain("const totalReturn = round2(stakeRef.current * effective)")
    })

    it('rounds the profit', () => {
        expect(src).toContain("const profit = round2(totalReturn - stakeRef.current)")
    })

    it('credits the rounded return', () => {
        expect(src).toContain("addWinnings(totalReturn, 'Crash return')")
    })
})

describe('CrashGame component parses', () => {
    it('imports without a syntax error', async () => {
        const mod = await import('./CrashGame.jsx')
        expect(typeof mod.default).toBe('function')
    })
})
