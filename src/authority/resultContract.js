// Ticket #28 — the closed six-kind durable result contract.
//
// This is the *public contract* every migrated authority caller awaits. It is
// deliberately not a boolean and not `{ ok }` (owner decision 8, 29 Oct 2026).
//
// Kinds, and nothing else:
//   committed    | the requested durable effect is committed
//   rejected     | durable execution rejection, final, no effect
//   not-admitted | this call attempted no domain effect
//   aborted      | an identified execution attempt was observed to abort
//   unknown      | completion unresolved — never guess, never retry blind
//   superseded   | the request's epoch/protocol was replaced
//
// A consequence of the closed-union rule: `profit: 0` may no longer mean both
// "rejected" and "push". A zero-profit push is `committed/settled-result` with
// `rejected`/`not-admitted` carrying no economic fields at all.
//
// Design source: phase-01-authority-contract_PROPOSAL_30-10-26.md §1.

/** @typedef {'committed'|'rejected'|'not-admitted'|'aborted'|'unknown'|'superseded'} ResultKind */

export const RESULT_KINDS = Object.freeze([
    'committed',
    'rejected',
    'not-admitted',
    'aborted',
    'unknown',
    'superseded',
])

// Milestones distinguish three events that must never collapse again:
// durable staging/registration acknowledgement, accepted start, settled result.
// See proposal §1.2. `stage` is not a debit; `settled-result` is not "accepted".
export const COMMIT_MILESTONES = Object.freeze(['stage', 'accepted-start', 'settled-result', 'command-final'])

export const REJECT_CODES = Object.freeze([
    'insufficient-funds',
    'stale-input-generation',
    'stale-entity-revision',
    'stale-seed',
    'illegal-action',
    'valuation-mismatch',
    'not-eligible',
    'obligation-open',
    'incoming-obligation',
    'accepted-not-cancellable',
])

export const ADMISSION_CODES = Object.freeze([
    'invalid-input',
    'id-conflict',
    'unsupported-platform',
    'unavailable-storage',
    'unsupported-version',
    'gate-closed',
    'stale-writer',
    'optional-capacity',
    'base-reserve',
    'record-limit',
    'sequence-limit',
    'checkpoint-pending',
])

export const ABORT_CODES = Object.freeze(['quota', 'security', 'explicit-abort', 'connection-abort', 'transaction-error'])

export const UNKNOWN_PHASES = Object.freeze([
    'open',
    'registration',
    'execution',
    'inspection',
    'fence',
    'delivery',
    'replacement',
])

export const UNKNOWN_CODES = Object.freeze([
    'registration-unconfirmed',
    'completion-unobserved',
    'read-failed',
    'fence-unconfirmed',
    'evidence-inconsistent',
    'possible-lost-registration',
    'delivery-unconfirmed',
    'replacement-unconfirmed',
])

export const SCOPES = Object.freeze(['wallet', 'rng', 'entity', 'collection', 'claims', 'replacement', 'delivery'])

const KIND_SET = new Set(RESULT_KINDS)
const MILESTONE_SET = new Set(COMMIT_MILESTONES)
const REJECT_SET = new Set(REJECT_CODES)
const ADMISSION_SET = new Set(ADMISSION_CODES)
const ABORT_SET = new Set(ABORT_CODES)
const UNKNOWN_PHASE_SET = new Set(UNKNOWN_PHASES)
const UNKNOWN_SET = new Set(UNKNOWN_CODES)
const SCOPE_SET = new Set(SCOPES)

function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0
}

function isSafeNonNegInt(value) {
    return Number.isSafeInteger(value) && value >= 0
}

/** Normalise a scope list: unique, sorted, all known. `[]` when absent. */
export function normaliseScopes(scopes) {
    if (scopes == null) return []
    if (!Array.isArray(scopes)) throw new TypeError('scopes must be an array')
    const seen = new Set()
    for (const s of scopes) {
        if (!SCOPE_SET.has(s)) throw new TypeError(`unknown scope: ${String(s)}`)
        seen.add(s)
    }
    return [...seen].sort()
}

// --- constructors -----------------------------------------------------------
// Each returns a frozen object containing exactly its declared fields. No extra
// fields are permitted anywhere in the union (proposal §1.1), so a caller that
// tries to smuggle `profit` into a rejection fails here rather than downstream.

export function committed({ target, milestone, sequence, revision, value, replay = false, delivery = 'pending' }) {
    if (!isPlainObject(target)) throw new TypeError('committed.target must be an object')
    if (!MILESTONE_SET.has(milestone)) throw new TypeError(`unknown milestone: ${String(milestone)}`)
    if (!isSafeNonNegInt(sequence) || !isSafeNonNegInt(revision)) throw new TypeError('committed sequence/revision must be non-negative safe integers')
    if (delivery !== 'pending' && delivery !== 'seen') throw new TypeError(`unknown delivery: ${String(delivery)}`)
    if (value === undefined) throw new TypeError('committed.value is required (use null for a valueless final)')
    return Object.freeze({ kind: 'committed', target, milestone, sequence, revision, replay: Boolean(replay), delivery, value })
}

export function rejected({ target, code, sequence, revision, replay = false, delivery = 'pending' }) {
    if (!isPlainObject(target)) throw new TypeError('rejected.target must be an object')
    if (!REJECT_SET.has(code)) throw new TypeError(`unknown reject code: ${String(code)}`)
    if (!isSafeNonNegInt(sequence) || !isSafeNonNegInt(revision)) throw new TypeError('rejected sequence/revision must be non-negative safe integers')
    if (delivery !== 'pending' && delivery !== 'seen') throw new TypeError(`unknown delivery: ${String(delivery)}`)
    return Object.freeze({ kind: 'rejected', target, code, sequence, revision, replay: Boolean(replay), delivery })
}

export function notAdmitted({ target = null, code, field = null, observedRevision = null }) {
    if (target !== null && !isPlainObject(target)) throw new TypeError('not-admitted.target must be an object or null')
    if (!ADMISSION_SET.has(code)) throw new TypeError(`unknown admission code: ${String(code)}`)
    if (field !== null && !isNonEmptyString(field)) throw new TypeError('not-admitted.field must be a non-empty string or null')
    if (observedRevision !== null && !isSafeNonNegInt(observedRevision)) throw new TypeError('not-admitted.observedRevision must be a non-negative safe integer or null')
    return Object.freeze({ kind: 'not-admitted', target, code, field, observedRevision })
}

export function aborted({ target, attemptId, phase = 'execution', code, recovery }) {
    if (!isPlainObject(target)) throw new TypeError('aborted.target must be an object')
    if (!isNonEmptyString(attemptId)) throw new TypeError('aborted.attemptId must be a non-empty string')
    if (phase !== 'execution') throw new TypeError('aborted.phase must be "execution" in this contract version')
    if (!ABORT_SET.has(code)) throw new TypeError(`unknown abort code: ${String(code)}`)
    if (!isPlainObject(recovery)) throw new TypeError('aborted.recovery is required')
    return Object.freeze({ kind: 'aborted', target, attemptId, phase, code, registered: true, recovery })
}

export function unknown({ target = null, phase, code, recovery = null, lastKnownRevision = null, blockedScopes = [] }) {
    if (target !== null && !isPlainObject(target)) throw new TypeError('unknown.target must be an object or null')
    if (recovery !== null && !isPlainObject(recovery)) throw new TypeError('unknown.recovery must be an object or null')
    // "Unknown never has neither identity nor recovery handle" (reconciliation §2).
    if (target === null && recovery === null) throw new TypeError('unknown needs either a target or a recovery handle')
    if (!UNKNOWN_PHASE_SET.has(phase)) throw new TypeError(`unknown phase: ${String(phase)}`)
    if (!UNKNOWN_SET.has(code)) throw new TypeError(`unknown code: ${String(code)}`)
    if (lastKnownRevision !== null && !isSafeNonNegInt(lastKnownRevision)) throw new TypeError('unknown.lastKnownRevision must be a non-negative safe integer or null')
    return Object.freeze({
        kind: 'unknown',
        target,
        phase,
        code,
        recovery,
        lastKnownRevision,
        blockedScopes: normaliseScopes(blockedScopes),
    })
}

export function superseded({ target, currentEpoch, currentProtocol, historicResultAvailable = false, recovery = null }) {
    if (!isPlainObject(target)) throw new TypeError('superseded.target must be an object')
    if (!isNonEmptyString(currentEpoch)) throw new TypeError('superseded.currentEpoch must be a non-empty string')
    if (!isNonEmptyString(currentProtocol)) throw new TypeError('superseded.currentProtocol must be a non-empty string')
    if (recovery !== null && !isPlainObject(recovery)) throw new TypeError('superseded.recovery must be an object or null')
    return Object.freeze({ kind: 'superseded', target, currentEpoch, currentProtocol, historicResultAvailable: Boolean(historicResultAvailable), recovery })
}

// --- guards -----------------------------------------------------------------

/**
 * Exhaustive kind guard. A caller switch must handle every kind; this helper
 * exists so tests and future lint gates can assert exhaustiveness without
 * reaching for truthiness (which the contract forbids outright).
 */
export function assertResult(result) {
    if (!isPlainObject(result) || !KIND_SET.has(result.kind)) {
        throw new TypeError(`not an authority result: ${JSON.stringify(result)}`)
    }
    return result
}

export function isCommitted(result) { return isPlainObject(result) && result.kind === 'committed' }
export function isSettled(result) { return isCommitted(result) && result.milestone === 'settled-result' }
export function isCommittedStage(result) { return isCommitted(result) && result.milestone === 'stage' }
