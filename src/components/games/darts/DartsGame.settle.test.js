import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { round2 } from '../../../utils/simulationMath'

const source = readFileSync(new URL('./DartsGame.jsx', import.meta.url), 'utf8')

// Mirrored from the component constants; pinned by the tests below.
const THROW_MS = 720
const SECTOR_PAYOUT = 1.6
const NEIGHBOR_PAYOUT = 0
const BULLSEYE_PAYOUT = 12

// Mirror of performPlay's money math.
function settle({ multiplier, betAmount }) {
    const won = multiplier > 0
    const returnAmount = won ? round2(betAmount * multiplier) : 0
    const profit = round2(returnAmount - betAmount)
    return { won, returnAmount, profit }
}

describe('darts payout rounding', () => {
    it('has a sector payout that is genuinely inexact in binary', () => {
        // If this becomes exact the round2 calls stop being load-bearing.
        expect(1 * SECTOR_PAYOUT - 1).not.toBe(0.6)
        expect(1 * SECTOR_PAYOUT - 1).toBe(0.6000000000000001)
    })

    it('books a clean 2dp profit on a sector hit', () => {
        const { returnAmount, profit } = settle({ multiplier: SECTOR_PAYOUT, betAmount: 1 })
        expect(returnAmount).toBe(1.6)
        expect(profit).toBe(0.6)
    })

    it('books a clean 2dp profit on the stakes that drifted worst', () => {
        // Raw arithmetic: stake 3 -> 4.800000000000001 / 1.8000000000000007.
        expect(settle({ multiplier: SECTOR_PAYOUT, betAmount: 3 })).toEqual({
            won: true, returnAmount: 4.8, profit: 1.8,
        })
        expect(settle({ multiplier: SECTOR_PAYOUT, betAmount: 6 })).toEqual({
            won: true, returnAmount: 9.6, profit: 3.6,
        })
    })

    it('loses exactly the stake on a miss and on a neighbor', () => {
        expect(settle({ multiplier: 0, betAmount: 5 })).toEqual({ won: false, returnAmount: 0, profit: -5 })
        expect(settle({ multiplier: NEIGHBOR_PAYOUT, betAmount: 5 })).toEqual({ won: false, returnAmount: 0, profit: -5 })
    })

    it('pays the bullseye at a whole multiple', () => {
        expect(settle({ multiplier: BULLSEYE_PAYOUT, betAmount: 5 })).toEqual({
            won: true, returnAmount: 60, profit: 55,
        })
    })

    it('keeps profit 2dp-clean across a stake sweep', () => {
        const twoDp = /^-?\d+(\.\d{1,2})?$/
        for (let stake = 1; stake <= 200; stake += 1) {
            for (const multiplier of [SECTOR_PAYOUT, BULLSEYE_PAYOUT, 0]) {
                const { returnAmount, profit } = settle({ multiplier, betAmount: stake })
                expect(String(profit)).toMatch(twoDp)
                expect(String(returnAmount)).toMatch(twoDp)
            }
        }
    })
})

describe('darts settles when the dart lands', () => {
    it('defers credit, record and toast to a THROW_MS timer', () => {
        // The settle block used to run synchronously while the dart was still
        // in flight, so the balance moved and the toast named the sector a
        // full animation before ROUND_RESULT.
        const deferred = source.slice(source.indexOf('schedule(() => {'))
        expect(deferred).toContain("addWinnings(returnAmount, 'Darts return')")
        expect(deferred).toContain('session.record({')
        expect(deferred).toContain('showToast(won ?')
        expect(deferred).toContain('}, THROW_MS)')
    })

    it('settles no earlier than the ROUND_RESULT event', () => {
        const resultAt = source.indexOf('ROUND_EVENTS.ROUND_RESULT')
        const settleAt = source.indexOf("addWinnings(returnAmount, 'Darts return')")
        expect(resultAt).toBeGreaterThan(-1)
        expect(settleAt).toBeGreaterThan(resultAt)
    })

    it('keeps the reveal and pointer ahead of the settle', () => {
        expect(source).toContain('api.push(ROUND_EVENTS.RNG_REVEAL, { outcome }, THROW_MS - 80)')
        expect(source).toContain('schedule(() => setPointer({ x, y }), THROW_MS - 80)')
    })
})

describe('darts is pinned to the component', () => {
    it('keeps the constants this mirror assumes', () => {
        expect(source).toContain(`const THROW_MS = ${THROW_MS}\n`)
        expect(source).toContain(`const SECTOR_PAYOUT = ${SECTOR_PAYOUT}\n`)
        expect(source).toContain(`const NEIGHBOR_PAYOUT = ${NEIGHBOR_PAYOUT}\n`)
        expect(source).toContain(`const BULLSEYE_PAYOUT = ${BULLSEYE_PAYOUT}\n`)
    })

    it('rounds the return and the profit', () => {
        expect(source).toContain('const returnAmount = won ? round2(betAmount * multiplier) : 0')
        expect(source).toContain('const profit = round2(returnAmount - betAmount)')
    })

    it('schedules every timer through the cancellable scheduler', () => {
        expect(source).not.toMatch(/(?<!window\.)\bsetTimeout\(/)
        expect(source).not.toContain('window.setTimeout')
        expect(source).toContain("import { useCancellableTimeouts } from '../../../utils/scheduling'")
        expect(source).toContain('const { schedule } = useCancellableTimeouts()')
    })

    it('guards against a second round starting mid-throw', () => {
        expect(source).toContain("if (running) { resolve({ profit: 0 }); return }")
    })
})

describe('darts component parses', () => {
    // The tests above read the component as text, so a syntax error would not
    // fail them. Importing makes a broken component fail here rather than only
    // in `npm run build`.
    it('imports without a syntax or module-resolution error', async () => {
        const mod = await import('./DartsGame.jsx')
        expect(typeof mod.default).toBe('function')
    })
})
