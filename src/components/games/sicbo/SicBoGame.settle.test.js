import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./SicBoGame.jsx', import.meta.url), 'utf8')

const round2 = (n) => Math.round(n * 100) / 100

// Mirror of the settle body at SicBoGame.jsx (accumulate, then round once).
function settleSicBo(bets, multipliers, stake) {
    let totalReturn = 0
    for (const [k, amount] of Object.entries(bets)) {
        const mult = multipliers[k]
        if (mult) totalReturn += amount * mult
    }
    totalReturn = round2(totalReturn)
    const profit = round2(totalReturn - stake)
    return { totalReturn, profit }
}

describe('SicBoGame settle rounding', () => {
    it('rounds a single integer-multiplier payout that drifts in float math', () => {
        // 0.03 * 11 === 0.32999999999999996 in IEEE-754
        const { totalReturn } = settleSicBo({ triple: 0.03 }, { triple: 11 }, 0.03)
        expect(totalReturn).toBe(0.33)
    })

    it('rounds the 180:1 specific-triple payout on a fractional stake', () => {
        const { totalReturn } = settleSicBo({ t1: 0.07 }, { t1: 181 }, 0.07)
        expect(totalReturn).toBe(12.67)
    })

    it('rounds an accumulation across several winning bets', () => {
        const { totalReturn } = settleSicBo(
            { a: 0.07, b: 0.29, c: 1.15 },
            { a: 3, b: 7, c: 11 },
            1.51,
        )
        expect(totalReturn).toBe(14.89)
        expect(Number.isInteger(Math.round(totalReturn * 100))).toBe(true)
    })

    it('rounds profit so a break-even round reports exactly zero', () => {
        const { profit } = settleSicBo({ a: 0.05 }, { a: 2 }, 0.1)
        expect(profit).toBe(0)
        expect(Object.is(profit, -0)).toBe(false)
    })

    it('leaves whole-credit payouts unchanged', () => {
        const { totalReturn, profit } = settleSicBo({ a: 10 }, { a: 3 }, 10)
        expect(totalReturn).toBe(30)
        expect(profit).toBe(20)
    })

    it('never emits more than two decimal places', () => {
        for (const stake of [0.01, 0.03, 0.07, 0.29, 1.15, 3.33]) {
            for (const mult of [2, 3, 7, 11, 31, 61, 181]) {
                const { totalReturn } = settleSicBo({ a: stake }, { a: mult }, stake)
                expect(totalReturn).toBe(Number(totalReturn.toFixed(2)))
            }
        }
    })
})

describe('SicBoGame source pins', () => {
    it('imports round2 from simulationMath', () => {
        expect(src).toContain("import { formatCredits, round2 } from '../../../utils/simulationMath'")
    })

    it('rounds the accumulated total before crediting', () => {
        expect(src).toContain('totalReturn = round2(totalReturn)')
        expect(src).toContain('const profit = round2(totalReturn - stake)')
    })

    it('credits the rounded total', () => {
        expect(src).toContain("if (totalReturn > 0) addWinnings(totalReturn, 'Sic Bo return')")
    })

    it('uses the cancellable scheduler rather than bare setTimeout', () => {
        expect(src).toContain('const { schedule, cancelAll } = useCancellableTimeouts()')
        expect(src).not.toMatch(/window\.setTimeout\(/)
    })
})
