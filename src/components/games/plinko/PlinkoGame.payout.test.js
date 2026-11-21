import { describe, expect, it } from 'vitest'
import { plinkoReturn } from './PlinkoGame'

const MULTIPLIERS = [0.2,0.5,1.1,1.6,2.5,5.6,9.9]
const STAKES = [1, 2, 3, 5, 7, 10, 25, 100, 137]
const TWO_DP = /^-?\d+(\.\d{1,2})?$/

describe('plinko payout rounding', () => {
    it('books a 2dp-clean profit and return for every stake and multiplier', () => {
        for (const m of MULTIPLIERS) {
            for (const stake of STAKES) {
                const { returnAmount, profit } = plinkoReturn(stake, m, stake)
                expect(String(profit)).toMatch(TWO_DP)
                expect(String(returnAmount)).toMatch(TWO_DP)
            }
        }
    })


    it('loses exactly the stake when the round pays nothing', () => {
        const m = 0
        const stake = 5
        const { returnAmount, profit } = plinkoReturn(stake, m, stake)
        expect(returnAmount).toBe(0)
        expect(profit).toBe(-5)
    })

    it('keeps the credited return and the booked profit consistent', () => {
        for (const m of MULTIPLIERS) {
            for (const stake of STAKES) {
                const { returnAmount, profit } = plinkoReturn(stake, m, stake)
                expect(Number((returnAmount - stake).toFixed(2))).toBe(profit)
            }
        }
    })

    it('charges a scaled ball cost once and applies its payout bonus once', () => {
        expect(plinkoReturn(5, 3, 50)).toEqual({ returnAmount: 15, profit: -35 })
        expect(plinkoReturn(5, 20, 50)).toEqual({ returnAmount: 100, profit: 50 })
        expect(plinkoReturn(0.1, 1.1, 0.1)).toEqual({ returnAmount: 0.11, profit: 0.01 })
    })
})
