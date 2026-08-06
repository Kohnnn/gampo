// Dev-only QA seam for the slots game: strict fixture validation and a
// one-shot FIFO outcome queue.
//
// WHY THIS MODULE IS SEPARATE AND PURE
//
// It holds no React state and touches no globals, so it can be unit tested
// directly, and so Rollup can tree-shake it out of production builds when its
// only caller sits behind `import.meta.env.DEV`. Absence from production output
// is asserted by scripts/qaSeamAbsence.mjs against a real build — not assumed
// from this comment.
//
// WHY VALIDATION IS STRICT RATHER THAN CONVENIENT
//
// A queued outcome is handed straight to finishRound, which awards credits.
// finishRound derives the payout itself:
//
//     const returnAmount = round2(baseBet * result.multiplier)   // :746
//     const profit       = round2(returnAmount - stake)          // :747
//
// So `multiplier` IS the payout. A NaN, a negative, or a numeric string there
// does not throw — it silently produces a wrong credit movement and wrong
// accounting evidence. Evidence that looks real and is wrong is worse than a
// crash, so every field below is checked and every rejection is total: the
// queue is never partially mutated.
//
// The required-field list is derived from what finishRound actually reads, not
// from what resolveSlotSpin happens to return. Fields called as arrays
// (featureEvents.find / .flatMap / .some, cells.reduce) must be arrays or
// finishRound throws mid-settle, which can strand the spin lock.

import { MAX_FREE_SPINS_PER_SESSION } from './slotConstants'

const ok = value => ({ ok: true, value })
const bad = reason => ({ ok: false, reason })

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

// typeof + Number.isFinite together reject NaN, Infinity, -Infinity AND the
// numeric strings ('5') that would otherwise coerce silently in arithmetic.
function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value)
}

function isNonNegativeInteger(value) {
    return Number.isInteger(value) && value >= 0
}

// Read directly by finishRound with no guard. Arrays are called as arrays;
// numbers feed payout or comparisons.
const REQUIRED_ARRAY_FIELDS = ['cells', 'featureEvents', 'winningIndexes']
const REQUIRED_NUMBER_FIELDS = ['multiplier', 'cascadeSteps', 'coinHits', 'triggeredFreeSpins']

/**
 * Validate a queued spin outcome against the fields finishRound consumes.
 *
 * @param {unknown} outcome
 * @returns {{ ok: true, value: object } | { ok: false, reason: string }}
 */
export function validateQueuedOutcome(outcome) {
    if (!isPlainObject(outcome)) return bad('outcome must be a plain object')

    for (const field of REQUIRED_ARRAY_FIELDS) {
        if (!(field in outcome)) return bad(`outcome.${field} is required`)
        if (!Array.isArray(outcome[field])) return bad(`outcome.${field} must be an array`)
    }

    for (const field of REQUIRED_NUMBER_FIELDS) {
        if (!(field in outcome)) return bad(`outcome.${field} is required`)
        if (!isFiniteNumber(outcome[field])) {
            return bad(`outcome.${field} must be a finite number (got ${JSON.stringify(outcome[field])})`)
        }
    }

    // multiplier is the payout multiplier. Negative would invert a win into a
    // silent extra debit outside placeBet.
    if (outcome.multiplier < 0) return bad('outcome.multiplier must not be negative')
    if (outcome.cascadeSteps < 0) return bad('outcome.cascadeSteps must not be negative')
    if (outcome.coinHits < 0) return bad('outcome.coinHits must not be negative')

    if (!isNonNegativeInteger(outcome.triggeredFreeSpins)) {
        return bad('outcome.triggeredFreeSpins must be a non-negative integer')
    }
    if (outcome.triggeredFreeSpins > MAX_FREE_SPINS_PER_SESSION) {
        return bad(`outcome.triggeredFreeSpins must not exceed MAX_FREE_SPINS_PER_SESSION (${MAX_FREE_SPINS_PER_SESSION})`)
    }

    // Each free-spins event carries the award finishRound feeds to
    // applyFreeSpinAward. A malformed award silently becomes 0 spins.
    for (const event of outcome.featureEvents) {
        if (!isPlainObject(event)) return bad('every outcome.featureEvents entry must be a plain object')
        if (typeof event.type !== 'string' || event.type.length === 0) {
            return bad('every outcome.featureEvents entry needs a non-empty string type')
        }
        if (event.type === 'free-spins' && 'freeSpins' in event && !isNonNegativeInteger(event.freeSpins)) {
            return bad('free-spins event freeSpins must be a non-negative integer')
        }
    }

    // buildCascadeTimeline receives this directly; a non-array is a hard throw.
    if ('cascadeFrames' in outcome && outcome.cascadeFrames != null && !Array.isArray(outcome.cascadeFrames)) {
        return bad('outcome.cascadeFrames must be an array or null when present')
    }
    if ('wildIndexes' in outcome && outcome.wildIndexes != null && !Array.isArray(outcome.wildIndexes)) {
        return bad('outcome.wildIndexes must be an array or null when present')
    }

    // Snapshot so a caller mutating its object after enqueue cannot change what
    // gets settled later. Shallow is enough: the aliasing risk is the top-level
    // handle, and a deep clone would break symbol object identity in `cells`.
    return ok({ ...outcome })
}

/**
 * Validate a free-spin session fixture against the invariants the live session
 * maintains in finishRound (:1036-1043).
 *
 * @param {unknown} fixture
 * @returns {{ ok: true, value: object|null } | { ok: false, reason: string }}
 */
export function validateFreeSpinSession(fixture) {
    // null is meaningful: it clears the session, matching setFreeSpinSession(null).
    if (fixture === null) return ok(null)

    if (!isPlainObject(fixture)) return bad('session must be a plain object or null')

    const { totalAwarded, played, totalWin, baseBet, retriggers } = fixture

    if (!isNonNegativeInteger(totalAwarded)) return bad('session.totalAwarded must be a non-negative integer')
    if (!isNonNegativeInteger(played)) return bad('session.played must be a non-negative integer')

    if (totalAwarded > MAX_FREE_SPINS_PER_SESSION) {
        return bad(`session.totalAwarded must not exceed MAX_FREE_SPINS_PER_SESSION (${MAX_FREE_SPINS_PER_SESSION})`)
    }
    // A live session can never have played more than it awarded; allowing it
    // would make "remaining" negative and misreport exhaustion.
    if (played > totalAwarded) {
        return bad(`session.played (${played}) must not exceed session.totalAwarded (${totalAwarded})`)
    }

    if (!isFiniteNumber(totalWin) || totalWin < 0) return bad('session.totalWin must be a non-negative finite number')
    if (!isFiniteNumber(baseBet) || baseBet < 0) return bad('session.baseBet must be a non-negative finite number')

    if (retriggers !== undefined && !isNonNegativeInteger(retriggers)) {
        return bad('session.retriggers must be a non-negative integer when present')
    }

    return ok({ ...fixture })
}

/**
 * FIFO one-shot outcome queue.
 *
 * One-shot is the whole point: a queued outcome is consumed by exactly one
 * spin. A sticky fixture would silently repeat a win on every subsequent spin
 * and quietly invalidate any accounting run built on top of it. An empty queue
 * returns null so the caller falls through to the real resolver unchanged.
 */
export function createOutcomeQueue() {
    const pending = []

    return {
        enqueue(outcome) {
            const result = validateQueuedOutcome(outcome)
            // Reject without touching `pending` — no partial mutation.
            if (!result.ok) return result
            pending.push(result.value)
            return ok({ queued: pending.length })
        },
        // Returns null when empty; caller then uses the real resolver.
        consume() {
            return pending.length > 0 ? pending.shift() : null
        },
        size() {
            return pending.length
        },
        clear() {
            const dropped = pending.length
            pending.length = 0
            return dropped
        },
    }
}
