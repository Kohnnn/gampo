import { describe, expect, it } from 'vitest'
import { compactLabel } from './RecentResultsStrip'

describe('RecentResultsStrip compactLabel', () => {
    it('abbreviates roulette colour labels instead of hard-slicing', () => {
        expect(compactLabel('10 black')).toBe('10 BLK')
        expect(compactLabel('0 green')).toBe('0 GRN')
        expect(compactLabel('36 red')).toBe('36 RED')
        expect(compactLabel('17 BLACK')).toBe('17 BLK')
    })

    it('passes short labels through unchanged', () => {
        expect(compactLabel('W')).toBe('W')
        expect(compactLabel('Push')).toBe('Push')
    })

    it('falls back to a 6-char slice for other long labels', () => {
        expect(compactLabel('Skull page 1')).toBe('Skull ')
    })
})
