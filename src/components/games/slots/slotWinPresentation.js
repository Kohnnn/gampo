// slotWinPresentation — shared, pure helpers for presenting slot wins
// consistently across all 20 templates. No React, fully unit-testable.
//
// Win tiers band a spin's win-to-bet multiplier so mid wins (below the 8×
// BigWinOverlay threshold) still get celebratory framing, and the big tiers
// stay aligned with BigWinOverlay's own big/huge/mega cutoffs.

import { FUN_PAYOUT_BOOST } from '../../../utils/funMode'

// Single source of truth for the "big win" cutoff (win-to-bet multiplier).
// Used by BigWinOverlay's `threshold`, the bigwin SFX gate in SlotsGame, and the
// 'big' WIN_TIERS band below so they can never drift apart.
export const SLOT_BIG_WIN_THRESHOLD = 8

export const WIN_TIERS = [
    { id: 'none', min: 0, label: '' },
    { id: 'nice', min: 1.5, label: 'Nice win' },
    { id: 'good', min: 3, label: 'Good win' },
    { id: 'great', min: 5, label: 'Great win' },
    { id: 'big', min: SLOT_BIG_WIN_THRESHOLD, label: 'Big win' },
    { id: 'huge', min: 15, label: 'Huge win' },
    { id: 'mega', min: 50, label: 'Mega win' },
]

/**
 * Classify a win by its multiplier (returnAmount / betAmount, or the engine's
 * reported `multiplier`). Returns the highest tier whose threshold is met.
 * A loss or zero win returns the 'none' tier.
 */
export function winTier(multiplier) {
    const m = Number(multiplier)
    if (!Number.isFinite(m) || m <= 0) return WIN_TIERS[0]
    let tier = WIN_TIERS[0]
    for (const t of WIN_TIERS) {
        if (m >= t.min) tier = t
    }
    return tier
}

/** Convenience: just the tier id (for CSS class hooks). */
export function winTierId(multiplier) {
    return winTier(multiplier).id
}

/**
 * Frame value for a count-up rollup: given elapsed/total in [0,1], return the
 * eased intermediate value from 0→target using easeOutCubic (matches
 * BigWinOverlay's ramp feel).
 */
export function rollupValue(target, progress) {
    const p = Math.min(1, Math.max(0, Number(progress) || 0))
    const eased = 1 - Math.pow(1 - p, 3)
    return (Number(target) || 0) * eased
}

/**
 * Per-tier rollup durations (ms) for the win-tier banner count-up. Bigger tiers
 * ramp longer so the payoff feels graduated (nice < good < great < big …).
 * Reduced-motion returns 0 so callers render the final value instantly.
 */
export const ROLLUP_TIER_MS = {
    nice: 420,
    good: 620,
    great: 820,
    big: 1000,
    huge: 1200,
    mega: 1500,
}

export function rollupDurationMs(tierId, reduceMotion = false) {
    if (reduceMotion) return 0
    return ROLLUP_TIER_MS[tierId] || 0
}

/**
 * Resolve the displayed rollup amount for a given elapsed time. This is the
 * pure core of the banner count-up wiring: callers feed it the win target, how
 * long the animation has run, its total duration, and whether reduced-motion is
 * on. When reduced-motion is on (or the animation is complete / duration is
 * non-positive) it returns the exact target so the value lands instantly.
 */
export function rollupFrame(target, elapsedMs, durationMs, reduceMotion = false) {
    const t = Number(target) || 0
    const dur = Number(durationMs)
    const elapsed = Number(elapsedMs)
    if (reduceMotion || !(dur > 0) || !(elapsed >= 0) || elapsed >= dur) return t
    return rollupValue(t, elapsed / dur)
}

export function getSlotRtpDisclosure(config, funActive) {
    return {
        rtp: config.rtpTarget * (funActive ? FUN_PAYOUT_BOOST : 1),
        label: 'Configured nominal RTP',
        note: `${config.title}: calibrated target${funActive ? ` × ${FUN_PAYOUT_BOOST} Fun payout boost (Fun on)` : ' (Fun off)'}. Nominal long-run return; payout rounding and max-win caps affect realized return. Not a per-spin guarantee.`,
    }
}
