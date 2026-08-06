import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./CasinoWarGame.jsx', import.meta.url), 'utf8')

const round2 = (n) => Math.round(n * 100) / 100

describe('CasinoWarGame settle rounding', () => {
    it('rounds the surrender half-return on an odd-cent stake', () => {
        // 0.05 / 2 === 0.025 — a half-cent that must not reach the ledger
        expect(round2(0.05 / 2)).toBe(0.03)
        expect(round2(0.07 / 2)).toBe(0.04)
        expect(round2(1.23 / 2)).toBe(0.62)
    })

    it('derives the surrender profit from the credited refund so the two agree', () => {
        // Math.round(-2.5) === -2, so negating before rounding would credit 0.03
        // while recording a 0.02 loss. Profit must be stake-minus-refund.
        for (const bet of [0.05, 0.07, 1.23, 0.15, 5]) {
            const refund = round2(bet / 2)
            const profit = round2(refund - bet)
            expect(profit).toBeLessThan(0)
            expect(round2(bet + profit)).toBe(refund)
        }
    })

    it('never lets the surrender refund exceed the stake', () => {
        for (const bet of [0.01, 0.05, 0.07, 0.15, 1.23, 5]) {
            expect(round2(bet / 2)).toBeLessThanOrEqual(bet)
        }
    })

    it('rounds the 3x tie-win payout that drifts in float math', () => {
        // 0.07 * 3 === 0.21000000000000002
        expect(round2(0.07 * 3)).toBe(0.21)
        expect(round2(0.29 * 3)).toBe(0.87)
        expect(round2(1.15 * 3)).toBe(3.45)
    })

    it('leaves the 2x return unchanged when it is already exact', () => {
        expect(round2(0.29 * 2)).toBe(0.58)
        expect(round2(1.15 * 2)).toBe(2.3)
    })

    it('never emits more than two decimal places across the stake grid', () => {
        for (const bet of [0.01, 0.05, 0.07, 0.15, 0.29, 1.15, 1.23, 5]) {
            for (const value of [round2(bet * 2), round2(bet / 2), round2(bet * 3)]) {
                expect(value).toBe(Number(value.toFixed(2)))
            }
        }
    })
})

describe('CasinoWarGame source pins', () => {
    it('imports round2 from simulationMath', () => {
        expect(src).toContain("import { formatCredits, round2 } from '../../../utils/simulationMath'")
    })

    it('rounds all three payout sites', () => {
        expect(src).toContain("addWinnings(round2(betAmount * 2), 'Casino War return')")
        expect(src).toContain("addWinnings(refund, 'Casino War surrender')")
        expect(src).toContain("addWinnings(round2(pendingBet * 3), 'Casino War tie-win')")
    })

    it('rounds the surrender profit used by the session record', () => {
        expect(src).toContain('const refund = round2(pendingBet / 2)')
        expect(src).toContain("addWinnings(refund, 'Casino War surrender')")
        expect(src).toContain('const profit = round2(refund - pendingBet)')
    })

    it('uses the cancellable scheduler rather than bare setTimeout', () => {
        expect(src).toContain('const { schedule, cancelAll } = useCancellableTimeouts()')
        expect(src).not.toMatch(/window\.setTimeout\(/)
    })
})
