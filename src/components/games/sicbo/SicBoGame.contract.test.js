import { describe, expect, it } from 'vitest'
import { canAddSicBoBet } from './SicBoGame'
import { resolveSicBoTicket } from './bets'

describe('Sic Bo chip eligibility', () => {
    it('accepts a funded chip from a fractional wallet', () => {
        expect(canAddSicBoBet(false, 0, 5, 1422.04)).toBe(true)
        expect(canAddSicBoBet(false, 1417, 5, 1422.04)).toBe(true)
        expect(canAddSicBoBet(false, 5, 5, 10)).toBe(true)
    })

    it('rejects a chip when the whole accumulated ticket is not funded', () => {
        expect(canAddSicBoBet(false, 0, 5, 4.5)).toBe(false)
        expect(canAddSicBoBet(false, 1418, 5, 1422.04)).toBe(false)
        expect(canAddSicBoBet(false, 5, 5, 9)).toBe(false)
        expect(canAddSicBoBet(true, 0, 5, 1422.04)).toBe(false)
    })

    it('rejects invalid wallet, ticket, and chip values without coercion', () => {
        for (const invalid of [NaN, Infinity, -Infinity, undefined, null, '10']) {
            expect(canAddSicBoBet(false, 0, 5, invalid)).toBe(false)
            expect(canAddSicBoBet(false, invalid, 5, 100)).toBe(false)
            expect(canAddSicBoBet(false, 0, invalid, 100)).toBe(false)
        }
        expect(canAddSicBoBet(false, -1, 5, 100)).toBe(false)
        expect(canAddSicBoBet(false, 0, 0, 100)).toBe(false)
        expect(canAddSicBoBet(false, 0, -5, 100)).toBe(false)
        expect(canAddSicBoBet(false, 0, 5, -1)).toBe(false)
    })
})

describe('Sic Bo charged ticket', () => {
    it('quotes every placed chip rather than the next chip denomination', () => {
        const bets = { big: 5, odd: 25 }
        expect(resolveSicBoTicket(bets, { small: 100 }, 'manual')).toEqual({ bets, stake: 30 })
    })

    it('quotes the existing repeat fallback for manual and auto play', () => {
        const lastChips = { big: 5, odd: 10 }
        for (const mode of ['manual', 'auto']) {
            expect(resolveSicBoTicket({}, lastChips, mode)).toEqual({ bets: lastChips, stake: 15 })
        }
        expect(resolveSicBoTicket({}, lastChips, 'strategy')).toEqual({ bets: {}, stake: 0 })
        expect(resolveSicBoTicket({}, {}, 'manual')).toEqual({ bets: {}, stake: 0 })
    })
})
