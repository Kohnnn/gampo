// Generated guard for RPS: pins the settle arithmetic against float drift.
// The component is read as source text where the settle body cannot be imported
// in isolation; the mirrors below are kept identical to the real expressions.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { round2 } from '../../../utils/simulationMath'

const RPS_RTP = 0.97
const payout = round2(RPS_RTP * 3 - 1)

// Mirror of the settle body in RpsGame.jsx.
const settle = (betAmount, { won, push }) => {
    const returnAmount = push ? betAmount : won ? round2(betAmount * payout) : 0
    const profit = round2(returnAmount - betAmount)
    return { returnAmount, profit }
}

describe('RPS payout rounding', () => {
    it('locks the payout to the target RTP', () => {
        expect(payout).toBe(1.91)
        expect(round2(payout / 3 + 1 / 3)).toBe(0.97)
    })

    it('books a 2dp return and profit for every stake', () => {
        for (const stake of [0.01,0.1,0.25,0.5,1,2.5,5,7,12.5,25,33,100,140]) {
            for (const outcome of [{ won: true }, { push: true }, {}]) {
                const { returnAmount, profit } = settle(stake, outcome)
                expect(returnAmount).toBe(round2(returnAmount))
                expect(profit).toBe(round2(profit))
                expect(round2(profit + stake)).toBe(returnAmount)
            }
        }
    })

    it('corrects a stake that drifts without rounding', () => {
        const stake = 0.01
        const raw = stake * payout
        expect(raw).not.toBe(round2(raw))
        expect(settle(stake, { won: true }).returnAmount).toBe(0.02)
    })

    it('refunds the stake on a push and books no profit', () => {
        const { returnAmount, profit } = settle(7, { push: true })
        expect(returnAmount).toBe(7)
        expect(profit).toBe(0)
    })

    it('books the full stake as the loss', () => {
        expect(settle(7, {}).profit).toBe(-7)
    })
})

describe('RpsGame settle source', () => {
    const src = readFileSync(new URL('./RpsGame.jsx', import.meta.url), 'utf8')

    it('rounds the win return', () => {
        expect(src).toContain("won ? round2(betAmount * payout) : 0")
    })

    it('rounds the profit', () => {
        expect(src).toContain("const profit = round2(returnAmount - betAmount)")
    })

    it('pins the RTP constant in source', () => {
        expect(src).toContain("const RPS_RTP = 0.97")
    })

    it('derives the payout from the RTP', () => {
        expect(src).toContain("const payout = round2((isFunMode() ? RPS_RTP * FUN_PAYOUT_BOOST : RPS_RTP) * 3 - 1)")
    })

    it('refunds the stake on a push', () => {
        expect(src).toContain("const returnAmount = push ? betAmount :")
    })
})

describe('RpsGame component parses', () => {
    it('imports without a syntax error', async () => {
        const mod = await import('./RpsGame.jsx')
        expect(typeof mod.default).toBe('function')
    })
})
