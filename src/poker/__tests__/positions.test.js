import { describe, expect, it } from 'vitest'
import { roleFor, rolesForSeats } from '../util/positions'

describe('positions', () => {
    it('6-max rotates BTN/SB/BB/UTG/MP/CO clockwise', () => {
        const roles = rolesForSeats(6, 0)
        expect(roles).toEqual(['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO'])
    })
    it('6-max with button moved', () => {
        expect(roleFor(2, 2, 6)).toBe('BTN')
        expect(roleFor(3, 2, 6)).toBe('SB')
        expect(roleFor(4, 2, 6)).toBe('BB')
    })
    it('heads-up has BTN/BB only', () => {
        expect(rolesForSeats(2, 0)).toEqual(['BTN', 'BB'])
        expect(rolesForSeats(2, 1)).toEqual(['BB', 'BTN'])
    })
})
