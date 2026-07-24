import { describe, it, expect } from 'vitest'
import { icmEquity } from './icm'

describe('icmEquity — Malmuth-Harville', () => {
    it('splits a single prize proportionally to chips', () => {
        const eq = icmEquity([50, 50], [100])
        expect(eq[0]).toBeCloseTo(50, 6)
        expect(eq[1]).toBeCloseTo(50, 6)
    })

    it('equal stacks split the whole prize pool equally', () => {
        const eq = icmEquity([100, 100, 100], [50, 30, 20])
        expect(eq[0]).toBeCloseTo(100 / 3, 6)
        expect(eq[1]).toBeCloseTo(100 / 3, 6)
        expect(eq[2]).toBeCloseTo(100 / 3, 6)
    })

    it('chip leader has less equity than chip proportion (ICM tax)', () => {
        const stacks = [8000, 1000, 1000]
        const payouts = [50, 30, 20]
        const eq = icmEquity(stacks, payouts)
        const leaderChipShare = 8000 / 10000 // 0.8
        const leaderEquityShare = eq[0] / 100
        expect(leaderEquityShare).toBeLessThan(leaderChipShare)
        // ICM tax pulls the leader well below chip share, but equity still
        // exceeds an equal 3-way split (1/3) since more chips = more 1st-place odds.
        expect(leaderEquityShare).toBeGreaterThan(1 / 3)
    })

    it('total equity equals total prize pool', () => {
        const eq = icmEquity([4000, 3000, 2000, 1000], [50, 30, 20])
        const sum = eq.reduce((a, b) => a + b, 0)
        expect(sum).toBeCloseTo(100, 6)
    })

    it('short stack still holds positive equity', () => {
        const eq = icmEquity([9000, 900, 100], [50, 30, 20])
        expect(eq[2]).toBeGreaterThan(0)
    })
})
