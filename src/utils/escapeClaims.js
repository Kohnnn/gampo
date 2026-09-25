// Tracks which overlay currently owns the Escape key.
//
// The mobile drawer is an overlay too, so when another layer is open above it
// both want Escape. Exactly one of them must act, and it must be the topmost.
//
// That decision cannot be inferred from the DOM:
//   - Matching mounted nodes fails, because a game route keeps a CLOSED bet
//     sheet portaled as `role="dialog"` (opacity 0, pointer-events none).
//   - Comparing `z-index` or paint order fails, because a computed z-index
//     inside a stacking context says nothing about real stacking: slots' bet
//     sheet computes `z-index: 1500` while nested in a `z-index: 1` ancestor,
//     so it paints *below* the drawer (`z-index: 1410`).
//   - Matching class names fails on the next overlay that picks a new name.
//
// So the claim is declared, not inferred. An overlay that handles Escape calls
// `claimEscape()` while it is open and releases on close; the drawer defers
// while any claim is held. Registration is a stack so nested overlays unwind in
// order.
//
// This is presentation-only: it grants no access to credits, RNG, tickets or
// any economic behaviour.

const claims = []

/**
 * Claim the Escape key for an overlay. Returns a release function; call it when
 * the overlay closes. Safe to call in a `useEffect` cleanup.
 */
export function claimEscape() {
    const token = {}
    claims.push(token)
    return () => {
        const i = claims.indexOf(token)
        if (i !== -1) claims.splice(i, 1)
    }
}

/** True while any overlay holds a claim, so the drawer must not consume Escape. */
export function overlayOwnsEscape() {
    return claims.length > 0
}

/** Test/support helper: drop all claims. */
export function resetEscapeClaims() {
    claims.length = 0
}
