// Ticket #28 — the first vertical slice of the durable authority.
//
// Deliberately NOT all 42 callers. One thin, complete, genuinely exercisable
// path: `settleRound` — the wallet debit/payout plus the retained round final,
// committed in ONE IndexedDB transaction inside the ONE authority database.
// That single seam is where the P1 wallet-accounting findings
// (QA001/QA027/QA033/QA040) live: today the wallet and the round result are
// written as independent `localStorage.setItem` calls with swallowed failures.
//
// Everything here obeys the decided contract:
//   * one awaited six-kind result (src/authority/resultContract.js),
//   * stable round/operation IDs allocated once and persisted with effects,
//   * replay returns the stored result with `replay: true`, charging nothing,
//   * idempotency keyed on canonical request bytes (different bytes = conflict),
//   * storage failure is a visible `aborted`/`not-admitted`, never a second wallet,
//   * bounded retained finals: one per round per exit kind; identical repeats
//     coalesce; nothing silently expires.
//
// Not implemented in this slice (recorded in the ticket report instead of faked):
// async RNG commit, multi-intent scheduler/min-K admission, migration of legacy
// localStorage wallet data, Web Locks fencing, delivery/acknowledge, unknown
// inspection, replacement/import, and the remaining command families.

import { Idb, openAuthorityDb, isQuotaError, RETAINED_FINAL_CAP, EXIT_KINDS } from './idb.js'
import { committed, rejected, notAdmitted, aborted, unknown } from './resultContract.js'

export const PROTOCOL_VERSION = 1
export const EPOCH_PREFIX = 'e1'
export const COMMAND = 'settle-round'

const EXIT_KIND_SET = new Set(EXIT_KINDS)

/** Deterministic canonical encoding: sorted top-level keys, no whitespace. */
export function canonical(bytes) {
    return JSON.stringify(bytes, Object.keys(bytes).sort())
}

function roundIdFor(epoch, operationId) {
    return `${epoch}:round:${operationId}`
}

function opKey(epoch, operationId) {
    return `${epoch}\u0000${operationId}`
}

/**
 * Canonicalise a settle request into an exactly-identified operation.
 * Throws a plain TypeError for structural problems; callers map that to
 * `not-admitted/invalid-input` before any durable effect.
 */
export function makeSettleRequest(operationId, request) {
    if (typeof operationId !== 'string' || operationId.length === 0) throw new TypeError('operationId must be a non-empty string')
    const exitKind = request?.exitKind
    if (!EXIT_KIND_SET.has(exitKind)) throw new TypeError(`unknown exitKind: ${String(exitKind)}`)
    const stake = Number(request?.stake)
    const payout = Number(request?.payout ?? 0)
    if (!Number.isFinite(stake) || stake < 0) throw new TypeError('stake must be a finite non-negative number')
    if (!Number.isFinite(payout) || payout < 0) throw new TypeError('payout must be a finite non-negative number')
    return { operationId, exitKind, stake, payout, label: String(request?.label ?? 'Round') }
}

export class Authority {
    constructor(idb, { epoch = EPOCH_PREFIX, writerSessionId = 'session-0' } = {}) {
        this.idb = idb
        this.epoch = epoch
        this.writerSessionId = writerSessionId
    }

    /**
     * Open the single database. `factory` defaults to the ambient IndexedDB.
     * Throws (never falls back to memory/localStorage) when storage is
     * unavailable — the caller maps that to `not-admitted/unavailable-storage`.
     */
    static async open(factory = globalThis.indexedDB, options = {}) {
        const db = await openAuthorityDb(factory)
        return new Authority(new Idb(db), options)
    }

    _recovery() {
        return { epoch: this.epoch, writerSessionId: this.writerSessionId, generation: 0 }
    }

    _opTarget(operationId) {
        return { type: 'operation', epoch: this.epoch, operationId, command: COMMAND }
    }

    /**
     * Commit an accepted round settlement atomically.
     * @returns {Promise<object>} one of the six kinds.
     */
    async settleRound(operationId, request) {
        let exact
        try {
            exact = makeSettleRequest(operationId, request)
        } catch (cause) {
            return notAdmitted({ target: null, code: 'invalid-input', field: cause?.message ?? 'request', observedRevision: null })
        }

        const epoch = this.epoch
        const key = opKey(epoch, exact.operationId)
        const bytes = canonical(exact)
        const roundId = roundIdFor(epoch, exact.operationId)
        const finalId = `${roundId}:${exact.exitKind}`
        const target = this._opTarget(exact.operationId)

        const outcome = { result: null }
        try {
            await this.idb.readwrite(['meta', 'operations', 'rounds', 'finals', 'wallet'], async (stores) => {
                // 1. Inspect the stored final BEFORE any legality check so an
                //    exact replay always wins (proposal §2.5).
                const existingOp = await stores.operations.get(key)
                if (existingOp) {
                    if (existingOp.requestBytes !== bytes) {
                        outcome.result = notAdmitted({ target: null, code: 'id-conflict', field: 'operationId', observedRevision: existingOp.revision ?? null })
                        return
                    }
                    outcome.result = { ...existingOp.result, replay: true }
                    return
                }

                const meta = await stores.meta.get('current')
                const sequence = meta?.nextSequence ?? 0
                const walletRow = await stores.wallet.get('current')
                const balance = typeof walletRow?.balance === 'number' ? walletRow.balance : 0

                // 2. Legality, then the synchronous reducer. Ordinary
                //    stale/illegal requests become durable `rejected`.
                if (exact.stake > balance) {
                    const rej = rejected({ target, code: 'insufficient-funds', sequence, revision: walletRow?.revision ?? 0 })
                    await stores.operations.put({ id: key, sequence, requestBytes: bytes, revision: walletRow?.revision ?? 0, result: clone(rej), roundId })
                    await stores.meta.put({ ...(meta ?? {}), id: 'current', nextSequence: sequence + 1, epoch, writerSessionId: this.writerSessionId, protocolVersion: PROTOCOL_VERSION })
                    outcome.result = rej
                    return
                }

                const nextBalance = Math.max(0, Number((balance - exact.stake + exact.payout).toFixed(2)))
                const revision = (walletRow?.revision ?? 0) + 1
                const value = {
                    operationId: exact.operationId,
                    roundId,
                    exitKind: exact.exitKind,
                    stake: exact.stake,
                    payout: exact.payout,
                    profit: Number((exact.payout - exact.stake).toFixed(2)),
                    balanceAfter: nextBalance,
                }
                const result = committed({ target, milestone: 'settled-result', sequence, revision, value })

                // 3. Wallet, operation, round and final commit together.
                await stores.wallet.put({ id: 'current', balance: nextBalance, revision })
                await stores.operations.put({ id: key, sequence, requestBytes: bytes, revision, result: clone(result), roundId })
                await stores.rounds.put({ id: roundId, status: exact.exitKind, exitKind: exact.exitKind, revision })
                await stores.finals.put({ id: finalId, roundId, exitKind: exact.exitKind, requestBytes: bytes, result: clone(result), createdAt: sequence })
                await stores.meta.put({ ...(meta ?? {}), id: 'current', nextSequence: sequence + 1, epoch, writerSessionId: this.writerSessionId, protocolVersion: PROTOCOL_VERSION })
                outcome.result = result
            })
        } catch (cause) {
            return this._mapFailure(cause, exact)
        }
        return outcome.result ?? this._mapFailure(new Error('no result produced'), exact)
    }

    _mapFailure(cause, exact) {
        const target = this._opTarget(exact.operationId)
        const attemptId = `${this.epoch}:${exact.operationId}:1`
        if (isQuotaError(cause)) return aborted({ target, attemptId, code: 'quota', recovery: this._recovery() })
        if (cause?.aborted) return aborted({ target, attemptId, code: 'transaction-error', recovery: this._recovery() })
        if (cause?.unavailableStorage) return notAdmitted({ target: null, code: 'unavailable-storage', field: null, observedRevision: null })
        // A failure we cannot classify is an unresolved completion: not a
        // rejection, not a refund, not a silent retry.
        return unknown({ target, phase: 'execution', code: 'completion-unobserved', recovery: this._recovery(), blockedScopes: ['wallet'] })
    }

    /** Read the current authoritative wallet row (no mutation). */
    async readWallet() {
        const row = await this.idb.read('wallet', 'current')
        return row ? { balance: row.balance, revision: row.revision } : { balance: 0, revision: 0 }
    }

    /** Read retained finals for a round. */
    async readFinals(roundId) {
        const rows = await this.idb.all('finals')
        return rows.filter(r => r.roundId === roundId)
    }
}

/** Store a plain structured-clone-safe copy (the envelope is frozen). */
function clone(value) {
    return JSON.parse(JSON.stringify(value))
}

/**
 * Bound the retained-final store: one final per round per exit kind, capped.
 * Identical repeats coalesce (same id). Never silently expires an
 * unacknowledged final — eviction is oldest-first among delivered rows only,
 * and refuses when nothing is evictable.
 */
export function planFinalRetention(rows, cap = RETAINED_FINAL_CAP) {
    const byId = new Map()
    for (const row of rows) byId.set(row.id, row) // coalesce identical repeats
    const unique = [...byId.values()]
    if (unique.length <= cap) return { keep: unique.map(r => r.id), evict: [] }
    const evictable = unique.filter(r => r.delivered === true).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
    const overflow = unique.length - cap
    if (evictable.length < overflow) return { keep: unique.map(r => r.id), evict: [], refused: 'no-evictable-final' }
    const evict = evictable.slice(0, overflow).map(r => r.id)
    return { keep: unique.map(r => r.id).filter(id => !evict.includes(id)), evict }
}
