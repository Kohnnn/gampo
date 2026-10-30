// QA021: Sic Bo chip affordability must agree between the disabled *control*
// (the `disabled={!canAddSicBoBet(...)}` binding on every cell) and the
// *handler* (`addBet`). Historical hosted observation: affordable chips were
// disabled at a fractional wallet balance and only became usable after a
// top-up to an integer. The predicate in current source already accumulates the
// finite stake (`totalStake + chip <= balance`); this file pins that the
// control and the handler agree on the same inputs rather than re-deriving the
// rule. If the two paths ever diverge, one of these assertions fails.
import { describe, expect, it } from 'vitest'
import { canAddSicBoBet, applySicBoChipAdd } from './SicBoGame'

// Every boundary the acceptance criteria name, plus the fractional wallet.
const BOUNDARIES = [
    // [running, totalStake, chip, balance, expected]
    [false, 0, 5, 1286.92, true], // fractional wallet, first 5 GC chip
    [false, 1281.92, 5, 1286.92, true], // exact-balance chip
    [false, 1286.92, 5, 1286.92, false], // second over-budget chip
    [false, 1282, 5, 1286.92, false], // first over-budget chip
    [false, 0, 5, 4.5, false], // insufficient for the first chip
    [false, 4, 5, 4.5, false], // insufficient after an accumulated stake
    [true, 0, 5, 1286.92, false], // locked mid-round
]

describe('QA021 Sic Bo control/handler parity', () => {
    it('accepts a 5 GC chip at a fractional 1286.92 wallet and rejects the over-budget one', () => {
        expect(canAddSicBoBet(false, 0, 5, 1286.92)).toBe(true)
        expect(canAddSicBoBet(false, 1281.92, 5, 1286.92)).toBe(true)
        expect(canAddSicBoBet(false, 1286.92, 5, 1286.92)).toBe(false)
    })

    it('handler agrees with control on every boundary input', () => {
        for (const [running, totalStake, chip, balance, expected] of BOUNDARIES) {
            const control = canAddSicBoBet(running, totalStake, chip, balance)
            const before = { big: totalStake }
            const after = applySicBoChipAdd(before, 'big', chip, running, balance)
            const handlerAccepted = after !== before
            expect(control, `control at ${JSON.stringify([running, totalStake, chip, balance])}`).toBe(expected)
            expect(handlerAccepted, `handler at ${JSON.stringify([running, totalStake, chip, balance])}`).toBe(expected)
            expect(handlerAccepted, `handler/control parity at ${JSON.stringify([running, totalStake, chip, balance])}`).toBe(control)
        }
    })

    it('handler adds exactly one chip and never mutates the prior map', () => {
        const before = { big: 5 }
        const after = applySicBoChipAdd(before, 'odd', 5, false, 100)
        expect(before).toEqual({ big: 5 })
        expect(after).toEqual({ big: 5, odd: 5 })
    })

    it('handler returns the identical reference when the chip is rejected', () => {
        const before = { big: 4 }
        expect(applySicBoChipAdd(before, 'odd', 5, false, 4.5)).toBe(before)
    })
})
