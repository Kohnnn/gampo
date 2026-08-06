import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { round2 } from '../../../utils/simulationMath'

const source = readFileSync(new URL('./BaccaratGame.jsx', import.meta.url), 'utf8')

// Payout table mirrored from the component; pinned below.
function payoutsFor({ outcome, playerPair, bankerPair, totalCards }) {
    return {
        banker: outcome === 'B' ? 1.95 : outcome === 'T' ? 1 : 0,
        player: outcome === 'P' ? 2 : outcome === 'T' ? 1 : 0,
        tie: outcome === 'T' ? 9 : 0,
        pair_p: playerPair ? 12 : 0,
        pair_b: bankerPair ? 12 : 0,
        big: totalCards >= 5 ? 1.54 : 0,
        small: totalCards === 4 ? 2.5 : 0,
    }
}

// Mirror of the settle loop: totalReturn accumulates across every active bet,
// so drift compounds with each bet added.
function settle({ activeBets, table }) {
    const payouts = payoutsFor(table)
    const stake = Object.values(activeBets).reduce((s, v) => s + (v || 0), 0)
    let totalReturn = 0
    for (const [k, amount] of Object.entries(activeBets)) {
        if (!amount) continue
        totalReturn += amount * (payouts[k] || 0)
    }
    totalReturn = round2(totalReturn)
    const profit = round2(totalReturn - stake)
    return { totalReturn, profit, stake }
}

const TWO_DP = /^-?\d+(\.\d{1,2})?$/
const BANKER_WIN = { outcome: 'B', playerPair: false, bankerPair: false, totalCards: 4 }
const TIE = { outcome: 'T', playerPair: false, bankerPair: false, totalCards: 5 }

describe('baccarat payout rounding', () => {
    it('has commission payouts that are genuinely inexact in binary', () => {
        // 1.95 banker (5% commission) happens to stay clean on its own, but
        // 1.54 big does not, and the accumulation loop compounds it.
        expect(7 * 1.54).not.toBe(10.78)
        expect(7 * 1.54).toBe(10.780000000000001)
    })

    it('books a clean 2dp profit on a single banker bet', () => {
        const { totalReturn, profit } = settle({ activeBets: { banker: 3 }, table: BANKER_WIN })
        expect(totalReturn).toBe(5.85)
        expect(profit).toBe(2.85)
    })

    it('books a clean 2dp profit when several bets settle at once', () => {
        // The drift compounds across the accumulation loop, which is the case
        // a per-bet rounding would still get wrong.
        const { totalReturn, profit, stake } = settle({
            activeBets: { banker: 3, big: 7, small: 0, tie: 2 },
            table: { outcome: 'B', playerPair: false, bankerPair: false, totalCards: 5 },
        })
        expect(stake).toBe(12)
        expect(totalReturn).toBe(16.63)
        expect(profit).toBe(4.63)
    })

    it('would drift without the rounding', () => {
        // Guards against the rounding becoming a no-op: the same bets computed
        // raw land on 16.630000000000003.
        const raw = 3 * 1.95 + 7 * 1.54
        expect(String(raw)).not.toMatch(TWO_DP)
        expect(raw).toBe(16.630000000000003)
    })

    it('keeps every bet combination 2dp-clean', () => {
        const amounts = [0, 1, 3, 7, 25]
        for (const banker of amounts) {
            for (const big of amounts) {
                for (const small of amounts) {
                    for (const table of [BANKER_WIN, TIE]) {
                        const { totalReturn, profit } = settle({ activeBets: { banker, big, small }, table })
                        expect(String(totalReturn)).toMatch(TWO_DP)
                        expect(String(profit)).toMatch(TWO_DP)
                    }
                }
            }
        }
    })

    it('pushes banker and player bets on a tie', () => {
        const { totalReturn, profit } = settle({ activeBets: { banker: 5 }, table: TIE })
        expect(totalReturn).toBe(5)
        expect(profit).toBe(0)
    })

    it('loses the whole stake when nothing hits', () => {
        const { totalReturn, profit } = settle({
            activeBets: { player: 5 },
            table: BANKER_WIN,
        })
        expect(totalReturn).toBe(0)
        expect(profit).toBe(-5)
    })
})

describe('baccarat is pinned to the component', () => {
    it('keeps the payout table this mirror assumes', () => {
        expect(source).toContain("banker: outcome === 'B' ? 1.95 : outcome === 'T' ? 1 : 0,")
        expect(source).toContain("player: outcome === 'P' ? 2 : outcome === 'T' ? 1 : 0,")
        expect(source).toContain("tie: outcome === 'T' ? 9 : 0,")
        expect(source).toContain('big: totalCards >= 5 ? 1.54 : 0,')
        expect(source).toContain('small: totalCards === 4 ? 2.5 : 0,')
    })

    it('rounds the accumulated return and the profit', () => {
        expect(source).toContain('totalReturn = round2(totalReturn)')
        expect(source).toContain('const profit = round2(totalReturn - stake)')
    })

    it('rounds after the accumulation loop, not inside it', () => {
        const loopAt = source.indexOf('totalReturn += amount * mult')
        const roundAt = source.indexOf('totalReturn = round2(totalReturn)')
        expect(loopAt).toBeGreaterThan(-1)
        expect(roundAt).toBeGreaterThan(loopAt)
    })

    it('imports round2 from the shared money helpers', () => {
        expect(source).toMatch(/import \{[^}]*\bround2\b[^}]*\} from '(\.\.\/)+utils\/simulationMath'/)
    })
})

describe('baccarat component parses', () => {
    it('imports without a syntax or module-resolution error', async () => {
        const mod = await import('./BaccaratGame.jsx')
        expect(typeof mod.default).toBe('function')
    })
})
