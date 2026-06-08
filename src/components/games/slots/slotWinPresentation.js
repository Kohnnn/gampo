// slotWinPresentation — shared, pure helpers for presenting slot wins
// consistently across all 20 templates. No React, fully unit-testable.
//
// Win tiers band a spin's win-to-bet multiplier so mid wins (below the 8×
// BigWinOverlay threshold) still get celebratory framing, and the big tiers
// stay aligned with BigWinOverlay's own big/huge/mega cutoffs.

export const WIN_TIERS = [
    { id: 'none', min: 0, label: '' },
    { id: 'nice', min: 1.5, label: 'Nice win' },
    { id: 'good', min: 3, label: 'Good win' },
    { id: 'great', min: 5, label: 'Great win' },
    { id: 'big', min: 8, label: 'Big win' },
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
