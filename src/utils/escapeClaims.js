// Tracks which overlay currently owns the Escape key.
//
// The mobile drawer is an overlay too, so when another layer is open above it
// both want Escape. Exactly one layer must act, and it must be the topmost.
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
// So ownership is declared, not inferred: a layer registers a self-contained
// Escape HANDLER while it is open and releases on close. The registry then
// routes the key to exactly one handler, so one Escape dismisses exactly one
// layer no matter how many are open.
//
// Two properties matter and are covered by escapeClaims.test.js:
//   - Registration is a stack; the most recent registrant acts first.
//   - A handler that declines (returns false) yields to the next one, so a
//     layer that is open but does not handle Escape never traps the key.
//
// This is presentation-only: it grants no access to credits, RNG, tickets or
// any economic behaviour.

const handlers = []

/**
 * Register an Escape handler for an open layer.
 *
 * `handler` returns `true` when it consumed the key and `false` to yield to the
 * next registered layer. Returns a release function; call it on close.
 */
export function claimEscape(handler) {
    const token = { handler }
    handlers.push(token)
    return () => {
        const i = handlers.indexOf(token)
        if (i !== -1) handlers.splice(i, 1)
    }
}

/** True while any layer has registered an Escape handler. */
export function overlayOwnsEscape() {
    return handlers.length > 0
}

/**
 * Route Escape to the highest registered handler that consumes it.
 * Returns true when some handler acted, false when none did.
 */
export function dispatchEscape(event) {
    for (let i = handlers.length - 1; i >= 0; i -= 1) {
        if (handlers[i].handler(event) === true) return true
    }
    return false
}

/** Test/support helper: drop all claims. */
export function resetEscapeClaims() {
    handlers.length = 0
}
