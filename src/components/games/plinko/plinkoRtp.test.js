// QA007 (#31): Plinko's RTP is an exact sum over its bin distribution, not a
// sample. These tests pin the arithmetic and, more importantly, pin what the
// table actually pays - a number the disclosure surfaces can then quote instead
// of "Unavailable".
import { describe, expect, it } from 'vitest'
import { BIN_PAYOUTS } from './engine/constants'
import { plinkoReturn } from './PlinkoGame'
import { binProbabilities, binomialWeights, PLINKO_BALLS, plinkoRtp, plinkoRtpTable, plinkoSettlementRtp, plinkoSettlements } from './plinkoRtp'

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
            expect(premium.nominalRtp, ball.id).toBeCloseTo(basic.nominalRtp, 12)
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
        expect(basic.nominalWinChance).toBeCloseTo(expected, 12)
        // A bronze ball pays 2x and costs 2, so a bin is a *net win* only when its
        // gross multiplier exceeds 1. Bins 3, 4 and 5 pay exactly 1x, i.e. 2.0x
        // after the bonus - break-even, not a win. The same bins qualify for both
        // ball types, so the win chance is identical: the bonus scales the payout
        // and the cost together.
        const bronze = plinkoRtp({ rows: 8, risk: 'low', ballId: 'bronze' })
        expect(bronze.nominalWinChance).toBeCloseTo((2 + 2 * 8 + 2 * 28) / 256, 12)
        expect(bronze.nominalWinChance).toBeCloseTo(basic.nominalWinChance, 12)
    })

    it('quotes every configured table with a finite effective RTP', () => {
        const table = plinkoRtpTable('normal')
        const configured = Object.values(BIN_PAYOUTS).reduce((n, risks) => n + Object.keys(risks).length, 0)
        expect(table).toHaveLength(configured)
        for (const row of table) {
            expect(row, `${row.rows}/${row.risk}`).not.toBeNull()
            expect(Number.isFinite(row.nominalRtp)).toBe(true)
            expect(row.nominalRtp).toBeGreaterThan(0)
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

describe('Plinko settlement RTP at a real stake', () => {
    it('differs from the nominal ratio in both directions at a tiny stake', () => {
        // 0.01 GC stake, 8 rows low. round2(0.01 * 1.1) = 0.01, so bins 2 and 6
        // become pushes (not wins), which REDUCES the win chance. But round2
        // also lifts round2(0.01 * 0.5) to 0.01, so the centre bin stops being a
        // half loss - and the mean rises to 1.1016 against a nominal 0.9898.
        // Rounding is not a pure house favour at this scale, and a quote that
        // showed only the nominal figure would understate what is actually paid.
        const nominal = plinkoRtp({ rows: 8, risk: 'low', ballId: 'normal' })
        const settled = plinkoSettlementRtp({ rows: 8, risk: 'low', betAmount: 0.01, ballId: 'normal' })
        expect(settled.settlementWinChance).toBeCloseTo(18 / 256, 12)
        expect(settled.settlementWinChance).toBeLessThan(nominal.nominalWinChance)
        expect(settled.pushChance).toBeCloseTo(238 / 256, 12)
        expect(settled.settlementRtp).toBeGreaterThan(nominal.nominalRtp)
        expect(settled.settlementRtp).toBeCloseTo(1.1015625, 10)
    })

    it('converges to the nominal ratio at a stake large enough to round cleanly', () => {
        const nominal = plinkoRtp({ rows: 8, risk: 'low', ballId: 'normal' })
        const settled = plinkoSettlementRtp({ rows: 8, risk: 'low', betAmount: 100, ballId: 'normal' })
        expect(settled.settlementRtp).toBeCloseTo(nominal.nominalRtp, 6)
    })

    it('matches an independent sum over the settlement rows', () => {
        const stake = 5
        const rows = plinkoSettlements({ rows: 10, risk: 'high', betAmount: stake, ballId: 'emerald' })
        const expectedReturn = rows.reduce((sum, row) => sum + row.probability * row.returnAmount, 0)
        const quote = plinkoSettlementRtp({ rows: 10, risk: 'high', betAmount: stake, ballId: 'emerald' })
        expect(quote.expectedReturnGc).toBeCloseTo(expectedReturn, 10)
        expect(quote.settlementRtp).toBeCloseTo(expectedReturn / quote.cost, 10)
        expect(quote.expectedProfitGc).toBeCloseTo(expectedReturn - quote.cost, 10)
    })
    it('agrees with production plinkoReturn on win/push/loss at a fractional-cent stake (QA007)', () => {
        // 0.015 GC, Basic, 8 rows low. Production subtracts the *unrounded*
        // 0.015 cost, so rounding it first (0.02) would misclassify bins 2-6.
        const stake = 0.015
        const rows = plinkoSettlements({ rows: 8, risk: 'low', betAmount: stake, ballId: 'normal' })
        const quote = plinkoSettlementRtp({ rows: 8, risk: 'low', betAmount: stake, ballId: 'normal' })
        expect(quote.cost).toBe(stake)
        for (const row of rows) {
            const settled = plinkoReturn(stake, row.multiplier, stake)
            expect(row.returnAmount).toBe(settled.returnAmount)
            expect(row.profit).toBe(settled.profit)
            expect(Math.sign(row.profit)).toBe(Math.sign(settled.profit))
        }
        // round2(0.015 * 0.5) = 0.01, i.e. 0.005 under the 0.015 cost: rounded
        // to -0, a push rather than the -0.005 a naive quote would show.
        expect(rows[4].profit).toBe(0)
        expect(quote.pushChance).toBeCloseTo(70 / 256, 12)
        // Every other bin credits 0.02+ against a 0.015 cost, so only the centre
        // bin is not a win: 1.1x and 1.0x become wins at this stake.
        expect(quote.settlementWinChance).toBeCloseTo(186 / 256, 12)
        const expectedReturn = (2 * 0.08 + 2 * 8 * 0.03 + 2 * 28 * 0.02 + 2 * 56 * 0.02 + 70 * 0.01) / 256
        expect(quote.expectedReturnGc).toBeCloseTo(expectedReturn, 12)
        expect(quote.settlementRtp).toBeCloseTo(expectedReturn / stake, 12)
    })


    it('refuses an unquotable settlement', () => {
        expect(plinkoSettlementRtp({ rows: 8, risk: 'low', betAmount: 0 })).toBeNull()
    })
})
