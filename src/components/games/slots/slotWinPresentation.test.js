import { describe, it, expect } from 'vitest'
import { winTier, winTierId, rollupValue, rollupDurationMs, rollupFrame, ROLLUP_TIER_MS, WIN_TIERS, SLOT_BIG_WIN_THRESHOLD, getSlotRtpDisclosure } from './slotWinPresentation'
describe('slot RTP disclosure', () => {
    it('uses the selected template target rather than the generic slot catalog', () => {
        const disclosure = getSlotRtpDisclosure({ title: 'Bass Bayou Collect', rtpTarget: 0.945 }, false)
        expect(disclosure.rtp).toBe(0.945)
        expect(disclosure.label).toBe('Configured nominal RTP')
        expect(disclosure.note).toContain('Bass Bayou Collect')
        expect(disclosure.note).toContain('Fun off')
    })

    it('discloses the actual Fun payout boost without applying the unrelated 100% cap', () => {
        const disclosure = getSlotRtpDisclosure({ title: 'Bars', rtpTarget: 0.95 }, true)
        expect(disclosure.rtp).toBeCloseTo(1.007, 10)
        expect(disclosure.note).toContain('Fun on')
        expect(disclosure.note).toContain('rounding and max-win caps')
    })
})

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

    it('rollupDurationMs scales by tier and is 0 for reduced motion / untiered', () => {
        // Bigger tiers ramp longer so the payoff feels graduated.
        expect(rollupDurationMs('nice')).toBeGreaterThan(0)
        expect(rollupDurationMs('great')).toBeGreaterThan(rollupDurationMs('nice'))
        expect(rollupDurationMs('mega')).toBeGreaterThan(rollupDurationMs('great'))
        // Untiered ('none') and unknown tiers have no rollup.
        expect(rollupDurationMs('none')).toBe(0)
        expect(rollupDurationMs('mystery-tier')).toBe(0)
        // Reduced motion forces an instant (0ms) rollup regardless of tier.
        expect(rollupDurationMs('mega', true)).toBe(0)
        // The exported table backs the durations.
        expect(rollupDurationMs('good')).toBe(ROLLUP_TIER_MS.good)
    })

    it('rollupFrame ramps 0->target over the duration, landing exactly on target', () => {
        // Start of the animation shows nothing yet.
        expect(rollupFrame(200, 0, 800)).toBe(0)
        // Mid-flight is between 0 and the target, ahead of linear (easeOutCubic).
        const mid = rollupFrame(200, 400, 800)
        expect(mid).toBeGreaterThan(100)
        expect(mid).toBeLessThan(200)
        // At/after the duration it lands exactly on the target.
        expect(rollupFrame(200, 800, 800)).toBe(200)
        expect(rollupFrame(200, 5000, 800)).toBe(200)
    })

    it('rollupFrame is instant (returns target) for reduced motion or non-positive duration', () => {
        expect(rollupFrame(200, 0, 800, true)).toBe(200)
        expect(rollupFrame(200, 10, 0)).toBe(200)
        expect(rollupFrame(200, 10, -100)).toBe(200)
    })

    it('exposes a tier table', () => {
        expect(WIN_TIERS.map(t => t.id)).toContain('great')
    })

    it('SLOT_BIG_WIN_THRESHOLD is the single source for the big-win cutoff', () => {
        expect(SLOT_BIG_WIN_THRESHOLD).toBe(8)
        // The 'big' tier min must be driven by the constant, never a stray literal.
        const big = WIN_TIERS.find(t => t.id === 'big')
        expect(big.min).toBe(SLOT_BIG_WIN_THRESHOLD)
        // The constant is exactly the boundary: just under is 'great', at/over is 'big'.
        expect(winTierId(SLOT_BIG_WIN_THRESHOLD)).toBe('big')
        expect(winTierId(SLOT_BIG_WIN_THRESHOLD - 0.01)).toBe('great')
    })
})
