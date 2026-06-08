import { describe, it, expect } from 'vitest'
import { winTier, winTierId, rollupValue, WIN_TIERS } from './slotWinPresentation'

describe('slotWinPresentation', () => {
    it('returns none tier for losses / zero / invalid', () => {
        expect(winTier(0).id).toBe('none')
        expect(winTier(-1).id).toBe('none')
        expect(winTier(NaN).id).toBe('none')
    })

    it('bands mid wins below the big-win threshold', () => {
        expect(winTierId(1.6)).toBe('nice')
        expect(winTierId(3)).toBe('good')
        expect(winTierId(5)).toBe('great')
    })

    it('aligns big tiers with BigWinOverlay cutoffs', () => {
        expect(winTierId(8)).toBe('big')
        expect(winTierId(15)).toBe('huge')
        expect(winTierId(50)).toBe('mega')
        expect(winTierId(999)).toBe('mega')
    })

    it('sub-1.5x wins are not tiered', () => {
        expect(winTierId(1.2)).toBe('none')
    })

    it('rollupValue eases 0->target across progress', () => {
        expect(rollupValue(100, 0)).toBe(0)
        expect(rollupValue(100, 1)).toBe(100)
        const mid = rollupValue(100, 0.5)
        expect(mid).toBeGreaterThan(50) // easeOutCubic is ahead of linear
        expect(mid).toBeLessThan(100)
    })

    it('exposes a tier table', () => {
        expect(WIN_TIERS.map(t => t.id)).toContain('great')
    })
})
