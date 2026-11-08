// QA007 (#31): Plinko's RTP is an exact sum over its bin distribution, not a
// sample. These tests pin the arithmetic and, more importantly, pin what the
// table actually pays - a number the disclosure surfaces can then quote instead
// of "Unavailable".
import { describe, expect, it } from 'vitest'
import { BIN_PAYOUTS } from './engine/constants'
import { binProbabilities, binomialWeights, PLINKO_BALLS, plinkoRtp, plinkoRtpTable, plinkoSettlements } from './plinkoRtp'

describe('Plinko bin distribution', () => {
    it('builds exact binomial weights', () => {
        expect(binomialWeights(1)).toEqual([1, 1])
        expect(binomialWeights(4)).toEqual([1, 4, 6, 4, 1])
        expect(binomialWeights(16)[8]).toBe(12870)
    })

    it('gives a complete distribution that sums to one', () => {
        for (const rows of Object.keys(BIN_PAYOUTS).map(Number)) {
            const p = binProbabilities(rows)
            expect(p, `rows ${rows}`).toHaveLength(rows + 1)
            const total = p.reduce((sum, v) => sum + v, 0)
            expect(total, `rows ${rows}`).toBeCloseTo(1, 12)
        }
    })

    it('never assigns a negative or zero-width bin', () => {
        for (const rows of Object.keys(BIN_PAYOUTS).map(Number)) {
            for (const v of binProbabilities(rows)) expect(v).toBeGreaterThan(0)
        }
    })
})

describe('Plinko payout arithmetic', () => {
    it('matches a hand-computed 8-row low table', () => {
        // low: [5.6,2.1,1.1,1,0.5,1,1.1,2.1,5.6] over C(8,k)/256
        //      C(8,k) = 1,8,28,56,70,56,28,8,1
        const weighted = 1 * 5.6 + 8 * 2.1 + 28 * 1.1 + 56 * 1 + 70 * 0.5 + 56 * 1 + 28 * 1.1 + 8 * 2.1 + 1 * 5.6
        expect(plinkoRtp({ rows: 8, risk: 'low' }).grossReturn).toBeCloseTo(weighted / 256, 12)
    })

    it('does not penalise a premium ball: its bonus scales with its cost', () => {
        // PlinkoGame.jsx:73-79 gives every ball cost === bonus, and :300 scales
        // the payout by bonus. A premium ball therefore has the same RTP.
        const basic = plinkoRtp({ rows: 8, risk: 'low', ballId: 'normal' })
        for (const ball of PLINKO_BALLS.slice(1)) {
            const premium = plinkoRtp({ rows: 8, risk: 'low', ballId: ball.id })
            expect(premium.effectiveRtp, ball.id).toBeCloseTo(basic.effectiveRtp, 12)
            expect(premium.ballCost, ball.id).toBe(ball.cost)
        }
    })

    it('reports the ball cost as the net deduction per staked unit', () => {
        const ruby = plinkoRtp({ rows: 8, risk: 'low', ballId: 'ruby' })
        expect(ruby.netReturn).toBeCloseTo(ruby.grossReturn - ruby.ballCost, 12)
    })

    it('refuses to quote when the payout table does not match the walk', () => {
        // A padded or truncated table must not be silently renormalised.
        expect(plinkoRtp({ rows: 99, risk: 'low' })).toBeNull()
        expect(plinkoRtp({ rows: 8, risk: 'nope' })).toBeNull()
        expect(plinkoRtp({ rows: 8, risk: 'low', ballId: 'nope' })).toBeNull()
    })

    it('finds a win chance from multipliers that beat the accepted cost', () => {
        const basic = plinkoRtp({ rows: 8, risk: 'low', ballId: 'normal' })
        // bins paying strictly more than 1x: 5.6,2.1,1.1,1.1,2.1,5.6
        const expected = (2 + 2 * 8 + 2 * 28) / 256
        expect(basic.winChance).toBeCloseTo(expected, 12)
        // A bronze ball pays 2x and costs 2, so a bin is a *net win* only when its
        // gross multiplier exceeds 1. Bins 3, 4 and 5 pay exactly 1x, i.e. 2.0x
        // after the bonus - break-even, not a win. The same bins qualify for both
        // ball types, so the win chance is identical: the bonus scales the payout
        // and the cost together.
        const bronze = plinkoRtp({ rows: 8, risk: 'low', ballId: 'bronze' })
        expect(bronze.winChance).toBeCloseTo((2 + 2 * 8 + 2 * 28) / 256, 12)
        expect(bronze.winChance).toBeCloseTo(basic.winChance, 12)
    })

    it('quotes every configured table with a finite effective RTP', () => {
        const table = plinkoRtpTable('normal')
        const configured = Object.values(BIN_PAYOUTS).reduce((n, risks) => n + Object.keys(risks).length, 0)
        expect(table).toHaveLength(configured)
        for (const row of table) {
            expect(row, `${row.rows}/${row.risk}`).not.toBeNull()
            expect(Number.isFinite(row.effectiveRtp)).toBe(true)
            expect(row.effectiveRtp).toBeGreaterThan(0)
        }
    })
})

describe('Plinko per-stake settlement (what the player is credited)', () => {
    it('applies the ball bonus and the settlement rounding', () => {
        const rows = plinkoSettlements({ rows: 8, risk: 'low', betAmount: 1, ballId: 'bronze' })
        const basic = plinkoSettlements({ rows: 8, risk: 'low', betAmount: 1, ballId: 'normal' })
        expect(rows).toHaveLength(9)
        // bronze pays 2x the bin and costs 2 GC per 1 GC staked
        expect(rows[0].multiplier).toBeCloseTo(11.2, 10)
        expect(rows[0].returnAmount).toBeCloseTo(11.2, 10)
        expect(rows[0].profit).toBeCloseTo(9.2, 10)
        expect(basic[4].profit).toBeCloseTo(-0.5, 10) // centre bin pays 0.5x on a 1 GC stake
    })

    it('uses the exact credited amount, not the unrounded product', () => {
        // 3 GC * 1.4 = 4.2 exactly; a stake whose product needs rounding is the
        // case that matters, so check a repeating one.
        const rows = plinkoSettlements({ rows: 8, risk: 'low', betAmount: 0.33, ballId: 'normal' })
        const centre = rows[4]
        expect(centre.returnAmount).toBeCloseTo(Math.round((0.33 * 0.5 + Number.EPSILON) * 100) / 100, 10)
        expect(centre.profit).toBeCloseTo(Math.round((centre.returnAmount - 0.33 + Number.EPSILON) * 100) / 100, 10)
    })

    it('refuses a settlement quote for an unknown table or stake', () => {
        expect(plinkoSettlements({ rows: 8, risk: 'low', betAmount: 0 })).toBeNull()
        expect(plinkoSettlements({ rows: 99, risk: 'low', betAmount: 1 })).toBeNull()
    })
})
