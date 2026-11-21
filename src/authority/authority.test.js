// Ticket #28 — consumer-visible seam tests for the durable authority.
//
// Runner: Vitest (`npx vitest run src/authority/authority.test.js`).
// IndexedDB is provided by `fake-indexeddb` (owner decision 11).
//
// What these tests DO prove: the six-kind contract shape, ordering of the
// inspect-before-effects check, atomic commit of wallet+round+final, replay
// without re-charge, id-conflict on same-ID/different-bytes, quota -> aborted,
// and the bounded retained-final coalescing rule.
//
// What they do NOT prove, and must never be reported as proving: durability,
// crash atomicity across a real browser restart, real quota behaviour or
// cross-device sync. Those are Chromium-desktop-only browser claims.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { Authority, canonical, makeSettleRequest, planFinalRetention } from './authority.js'
import { DB_NAME } from './idb.js'
import {
    RESULT_KINDS,
    committed,
    rejected,
    notAdmitted,
    unknown,
    aborted,
    superseded,
    isSettled,
    isCommittedStage,
} from './resultContract.js'

async function freshAuthority() {
    await teardown()
    const auth = await Authority.open(globalThis.indexedDB, { epoch: 'e1', writerSessionId: 'sess-test' })
    return auth
}

async function teardown() {
    try {
        // Drop the whole factory between tests so each case starts empty.
        globalThis.indexedDB = new IDBFactory()
    } catch { /* noop */ }
}

async function seedWallet(auth, balance) {
    await auth.idb.readwrite(['wallet', 'meta'], (stores) => {
        stores.wallet.put({ id: 'current', balance, revision: 0 })
        stores.meta.put({ id: 'current', nextSequence: 0, epoch: 'e1', writerSessionId: 'sess-test', protocolVersion: 1 })
    })
    auth._seq = null
}

describe('authority/settleRound — durable acceptance', () => {
    beforeEach(async () => { globalThis.indexedDB = new IDBFactory() })
    afterEach(async () => { await teardown() })

    it('commits wallet, round and final in one transaction and returns settled-result', async () => {
        const auth = await freshAuthority()
        await seedWallet(auth, 100)

        const result = await auth.settleRound('op-1', { exitKind: 'win', stake: 5, payout: 9, label: 'Dice' })

        expect(result.kind).toBe('committed')
        expect(result.milestone).toBe('settled-result')
        expect(isSettled(result)).toBe(true)
        expect(result.replay).toBe(false)
        expect(result.value.profit).toBe(4)
        expect(result.value.balanceAfter).toBe(104)

        const wallet = await auth.readWallet()
        expect(wallet.balance).toBe(104)
        const finals = await auth.readFinals('e1:round:op-1')
        expect(finals).toHaveLength(1)
        expect(finals[0].exitKind).toBe('win')
    })

    it('settles a zero-profit push as committed, never as rejected', async () => {
        const auth = await freshAuthority()
        await seedWallet(auth, 50)
        const result = await auth.settleRound('op-push', { exitKind: 'push', stake: 5, payout: 5 })
        expect(result.kind).toBe('committed')
        expect(result.value.profit).toBe(0)
        expect(result.kind).not.toBe('rejected')
    })

    it('rejects an unaffordable stake durably without moving the wallet', async () => {
        const auth = await freshAuthority()
        await seedWallet(auth, 3)
        const result = await auth.settleRound('op-poor', { exitKind: 'loss', stake: 5, payout: 0 })
        expect(result.kind).toBe('rejected')
        expect(result.code).toBe('insufficient-funds')
        expect(await auth.readWallet()).toEqual({ balance: 3, revision: 0 })
    })

    it('returns not-admitted for an invalid request without touching storage', async () => {
        const auth = await freshAuthority()
        await seedWallet(auth, 10)
        const result = await auth.settleRound('op-bad', { exitKind: 'nope', stake: 1 })
        expect(result.kind).toBe('not-admitted')
        expect(result.code).toBe('invalid-input')
        expect(await auth.readWallet()).toEqual({ balance: 10, revision: 0 })
    })
})

describe('authority/settleRound — replay and idempotency', () => {
    beforeEach(async () => { globalThis.indexedDB = new IDBFactory() })
    afterEach(async () => { await teardown() })

    it('replays the stored result with replay:true and charges nothing', async () => {
        const auth = await freshAuthority()
        await seedWallet(auth, 100)
        const first = await auth.settleRound('op-r', { exitKind: 'win', stake: 5, payout: 8 })
        expect(await auth.readWallet()).toEqual({ balance: 103, revision: 1 })

        const second = await auth.settleRound('op-r', { exitKind: 'win', stake: 5, payout: 8 })
        expect(second.kind).toBe('committed')
        expect(second.replay).toBe(true)
        expect(second.value.balanceAfter).toBe(103)
        // Wallet unchanged — a replay must never double-charge.
        expect(await auth.readWallet()).toEqual({ balance: 103, revision: 1 })
    })

    it('treats same operationId with different bytes as an id conflict', async () => {
        const auth = await freshAuthority()
        await seedWallet(auth, 100)
        await auth.settleRound('op-c', { exitKind: 'win', stake: 5, payout: 8 })
        const conflict = await auth.settleRound('op-c', { exitKind: 'win', stake: 99, payout: 8 })
        expect(conflict.kind).toBe('not-admitted')
        expect(conflict.code).toBe('id-conflict')
        expect(await auth.readWallet()).toEqual({ balance: 103, revision: 1 })
    })
})

describe('authority/settleRound — storage failure', () => {
    beforeEach(async () => { globalThis.indexedDB = new IDBFactory() })
    afterEach(async () => { await teardown() })

    it('maps a quota failure to aborted and leaves the previous wallet intact', async () => {
        const auth = await freshAuthority()
        await seedWallet(auth, 100)
        // Force the write transaction to fail the way a full disk does.
        const realReadwrite = auth.idb.readwrite.bind(auth.idb)
        auth.idb.readwrite = (stores, fn) => {
            const err = new Error('quota')
            err.name = 'QuotaExceededError'
            throw err
        }
        const result = await auth.settleRound('op-q', { exitKind: 'loss', stake: 5, payout: 0 })
        expect(result.kind).toBe('aborted')
        expect(result.code).toBe('quota')
        auth.idb.readwrite = realReadwrite
        // Previous committed state is still readable and correct.
        expect(await auth.readWallet()).toEqual({ balance: 100, revision: 0 })
    })

    it('reports unavailable storage as not-admitted rather than a silent fallback', async () => {
        const result = await Authority.open(null).catch(e => e)
        // `Authority.open` with no factory must reject, not invent a memory store.
        expect(result).toBeInstanceOf(Error)
        expect(result.unavailableStorage).toBe(true)
    })

    it('rolls back every store when the transaction aborts mid-write', async () => {
        const auth = await freshAuthority()
        await seedWallet(auth, 100)

        // Wrap the real readwrite helper so the body aborts AFTER the wallet
        // put has been queued — the true partial-write case this ticket cares
        // about. Native IndexedDB (and fake-indexeddb) must roll the whole
        // transaction back, so no store retains a partial effect.
        const realReadwrite = auth.idb.readwrite.bind(auth.idb)
        auth.idb.readwrite = (stores, fn) => realReadwrite(stores, async (map, tx) => {
            await fn(map, tx)
            throw Object.assign(new Error('injected abort'), { aborted: true })
        })

        const result = await auth.settleRound('op-abort', { exitKind: 'win', stake: 5, payout: 9 })
        expect(result.kind).toBe('aborted')

        auth.idb.readwrite = realReadwrite
        expect(await auth.readWallet()).toEqual({ balance: 100, revision: 0 })
        expect(await auth.readFinals('e1:round:op-abort')).toEqual([])
        const ops = await auth.idb.all('operations')
        expect(ops).toEqual([])
    })
})

describe('authority/retained finals — bounded coalescing', () => {
    it('coalesces identical repeats to one final per round per exit kind', () => {
        const rows = [
            { id: 'r1:cashout', roundId: 'r1', exitKind: 'cashout' },
            { id: 'r1:cashout', roundId: 'r1', exitKind: 'cashout' },
            { id: 'r1:bust', roundId: 'r1', exitKind: 'bust' },
        ]
        const plan = planFinalRetention(rows, 64)
        expect(plan.keep).toHaveLength(2)
        expect(plan.evict).toHaveLength(0)
    })

    it('evicts oldest delivered finals but refuses when nothing is evictable', () => {
        const delivered = Array.from({ length: 3 }, (_, i) => ({ id: `r${i}:win`, roundId: `r${i}`, exitKind: 'win', delivered: true, createdAt: i }))
        const plan = planFinalRetention(delivered, 2)
        expect(plan.evict).toEqual(['r0:win'])

        const undelivered = Array.from({ length: 3 }, (_, i) => ({ id: `u${i}:win`, roundId: `u${i}`, exitKind: 'win', delivered: false, createdAt: i }))
        const refused = planFinalRetention(undelivered, 2)
        expect(refused.refused).toBe('no-evictable-final')
        expect(refused.evict).toHaveLength(0)
    })
})

describe('authority/settleRound — retained-final capacity', () => {
    const pending = 'older-pending'
    // The earlier delivered row sorts AFTER the later one by primary key.
    const oldest = 'z-earlier-delivered'
    const newer = 'a-later-delivered'
    const legacyOlder = 'legacy-65'
    const legacyNewer = 'legacy-66'
    const history = [pending, oldest, newer, ...Array.from({ length: 61 }, (_, i) => `history-${i + 1}`)]
    const historyRequest = { exitKind: 'push', stake: 1, payout: 1 }
    const historyFinalId = operationId => `e1:round:${operationId}:push`
    const operationTarget = operationId => ({ type: 'operation', epoch: 'e1', operationId, command: 'settle-round' })

    const replacementRequest = { exitKind: 'win', stake: 5, payout: 9, label: 'Dice' }
    const replacementResult = {
        kind: 'committed', target: operationTarget('replacement'), milestone: 'settled-result',
        sequence: 64, revision: 65, replay: false, delivery: 'pending',
        value: {
            operationId: 'replacement', roundId: 'e1:round:replacement', exitKind: 'win',
            stake: 5, payout: 9, profit: 4, balanceAfter: 104,
        },
    }
    const replacementFinal = {
        id: 'e1:round:replacement:win', roundId: 'e1:round:replacement', exitKind: 'win',
        requestBytes: '{"exitKind":"win","label":"Dice","operationId":"replacement","payout":9,"stake":5}',
        result: replacementResult, createdAt: 64,
    }
    const recordLimit = { kind: 'not-admitted', target: null, code: 'record-limit', field: null, observedRevision: null }

    let auth
    beforeEach(async () => {
        auth = await freshAuthority()
        await seedWallet(auth, 100)
    })
    afterEach(async () => { await teardown() })

    async function settleHistory(count = 64) {
        for (const operationId of history.slice(0, count)) {
            const result = await auth.settleRound(operationId, historyRequest)
            expect(result.kind, operationId).toBe('committed')
        }
    }

    async function markDelivered(...operationIds) {
        await auth.idb.readwrite(['finals'], async ({ finals }) => {
            for (const operationId of operationIds) {
                const row = await finals.get(historyFinalId(operationId))
                await finals.put({ ...row, delivered: true })
            }
        })
    }

    async function seedLegacyOverflow() {
        // Bypass admission for the two existing finals beyond the cap.
        await auth.idb.readwrite(['finals'], async ({ finals }) => {
            for (const [operationId, sequence] of [[legacyOlder, 64], [legacyNewer, 65]]) {
                const roundId = `e1:round:${operationId}`
                const result = committed({
                    target: operationTarget(operationId), milestone: 'settled-result', sequence, revision: sequence + 1,
                    value: { operationId, roundId, exitKind: 'push', stake: 1, payout: 1, profit: 0, balanceAfter: 100 },
                })
                await finals.put({
                    id: historyFinalId(operationId), roundId, exitKind: 'push', createdAt: sequence,
                    requestBytes: canonical(makeSettleRequest(operationId, historyRequest)), result,
                })
            }
        })
    }

    async function snapshotStores() {
        const names = ['meta', 'operations', 'rounds', 'finals', 'wallet']
        return Object.fromEntries(await Promise.all(names.map(async name => [name, await auth.idb.all(name)])))
    }

    function expectReplacement(before, after, evictedIds) {
        expect(after).toHaveLength(64)
        expect(after.find(row => row.id === replacementFinal.id)).toStrictEqual(replacementFinal)
        expect(after.filter(row => row.id !== replacementFinal.id)).toStrictEqual(
            before.filter(row => !evictedIds.includes(row.id)),
        )
    }

    it('commits the 64th final and repeatedly refuses a 65th with no deliveries', async () => {
        await settleHistory(63)
        expect(await auth.idb.all('finals')).toHaveLength(63)
        const accepted = await auth.settleRound('at-cap', historyRequest)
        expect(accepted).toMatchObject({ kind: 'committed', milestone: 'settled-result', sequence: 63, revision: 64 })
        const before = await snapshotStores()
        expect(before.finals).toHaveLength(64)
        expect(before.finals.find(row => row.id === historyFinalId('at-cap'))?.result).toStrictEqual(accepted)

        for (let attempt = 0; attempt < 2; attempt++) {
            expect(await auth.settleRound('replacement', replacementRequest)).toStrictEqual(recordLimit)
            expect(await snapshotStores()).toStrictEqual(before)
        }
    })

    it('admits the 65th settlement by evicting only the oldest delivered final, not an older pending one', async () => {
        await settleHistory()
        await markDelivered(oldest, newer)
        const before = await snapshotStores()
        expect(before.finals).toHaveLength(64)
        expect(before.finals.find(row => row.id === historyFinalId(pending))).toMatchObject({
            createdAt: 0, result: { delivery: 'pending' },
        })
        expect(before.finals.find(row => row.id === historyFinalId(oldest))).toMatchObject({ createdAt: 1, delivered: true })
        expect(before.finals.find(row => row.id === historyFinalId(newer))).toMatchObject({ createdAt: 2, delivered: true })

        expect(await auth.settleRound('replacement', replacementRequest)).toStrictEqual(replacementResult)
        const after = await snapshotStores()
        expectReplacement(before.finals, after.finals, [historyFinalId(oldest)])
        const operation = {
            id: 'e1\u0000replacement', sequence: 64, requestBytes: replacementFinal.requestBytes,
            revision: 65, result: replacementResult, roundId: 'e1:round:replacement',
        }
        expect(after.operations.find(row => row.id === operation.id)).toStrictEqual(operation)
        expect(after.operations.filter(row => row.id !== operation.id)).toStrictEqual(before.operations)
        expect(after.wallet).toStrictEqual([{ id: 'current', balance: 104, revision: 65 }])
        expect(after.meta).toStrictEqual([{ ...before.meta[0], nextSequence: 65 }])
    })

    it('restores a legacy store of 66 finals to 64 by evicting exactly three delivered finals', async () => {
        await settleHistory()
        await seedLegacyOverflow()
        await markDelivered(oldest, newer, legacyOlder, legacyNewer)
        const before = await auth.idb.all('finals')
        expect(before).toHaveLength(66)

        expect(await auth.settleRound('replacement', replacementRequest)).toStrictEqual(replacementResult)
        expectReplacement(before, await auth.idb.all('finals'), [oldest, newer, legacyOlder].map(historyFinalId))
    })

    it('refuses legacy overflow with only two delivered finals, without partially trimming it', async () => {
        await settleHistory()
        await seedLegacyOverflow()
        await markDelivered(oldest, legacyOlder)
        const before = await snapshotStores()
        expect(before.finals).toHaveLength(66)

        expect(await auth.settleRound('replacement', replacementRequest)).toStrictEqual(recordLimit)
        expect(await snapshotStores()).toStrictEqual(before)
    })

    it.each([[64, 0], [64, 1], [66, 2], [66, 3]])(
        'keeps both rejections durable with %i finals and %i delivered',
        async (count, delivered) => {
            await settleHistory()
            if (count === 66) await seedLegacyOverflow()
            if (delivered) await markDelivered(...[oldest, newer, legacyOlder].slice(0, delivered))
            let before = await snapshotStores()
            expect(before.finals).toHaveLength(count)

            const requests = [
                ['insufficient-funds', { exitKind: 'loss', stake: 101 }, '{"exitKind":"loss","label":"Round","operationId":"insufficient-funds","payout":0,"stake":101}'],
                ['valuation-mismatch', { exitKind: 'win', stake: 1, payout: 1e308 }, '{"exitKind":"win","label":"Round","operationId":"valuation-mismatch","payout":1e+308,"stake":1}'],
            ]
            for (const [offset, [code, request, requestBytes]] of requests.entries()) {
                const sequence = 64 + offset
                const result = {
                    kind: 'rejected', target: operationTarget(code), code, sequence, revision: 64,
                    replay: false, delivery: 'pending',
                }
                expect(await auth.settleRound(code, request)).toStrictEqual(result)
                const after = await snapshotStores()
                const id = `e1\u0000${code}`
                expect(after.operations.find(row => row.id === id)).toStrictEqual({
                    id, sequence, requestBytes, revision: 64, result, roundId: `e1:round:${code}`,
                })
                expect(after.operations.filter(row => row.id !== id)).toStrictEqual(before.operations)
                expect(after.meta).toStrictEqual([{ ...before.meta[0], nextSequence: sequence + 1 }])
                for (const name of ['wallet', 'rounds', 'finals']) {
                    expect(JSON.stringify(after[name]), name).toBe(JSON.stringify(before[name]))
                }
                before = after
            }
        },
    )

    it.each([['retained', pending], ['evicted', oldest]])(
        'replays exact bytes and conflicts on changed bytes for a %s final even at capacity',
        async (status, operationId) => {
            await settleHistory()
            const original = await auth.idb.read('operations', `e1\u0000${operationId}`)
            if (status === 'evicted') {
                await markDelivered(operationId)
                expect(await auth.settleRound('replacement', replacementRequest)).toStrictEqual(replacementResult)
            }
            const before = await snapshotStores()
            expect(before.finals).toHaveLength(64)
            expect(await auth.readFinals(original.roundId)).toHaveLength(status === 'evicted' ? 0 : 1)

            expect(await auth.settleRound(operationId, historyRequest)).toStrictEqual({ ...original.result, replay: true })
            expect(await snapshotStores()).toStrictEqual(before)
            expect(await auth.settleRound(operationId, { ...historyRequest, stake: 101 })).toStrictEqual({
                kind: 'not-admitted', target: null, code: 'id-conflict', field: 'operationId', observedRevision: original.revision,
            })
            expect(await snapshotStores()).toStrictEqual(before)
        },
    )

    it('actually aborts after observing the eviction and replacement in the live transaction, restoring all five stores', async () => {
        await settleHistory()
        await markDelivered(oldest)
        const before = await snapshotStores()
        let inFlightFinals
        let abortObserved = false
        const readwrite = auth.idb.readwrite
        auth.idb.readwrite = (names, settle) => readwrite.call(auth.idb, names, async (stores, tx) => {
            await settle(stores, tx)
            // Read the completed delete and insert before aborting this same transaction.
            inFlightFinals = await Promise.all([
                stores.finals.get(historyFinalId(oldest)),
                stores.finals.get(replacementFinal.id),
            ])
            tx.addEventListener('abort', () => { abortObserved = true }, { once: true })
            tx.abort()
        })
        let result
        try {
            result = await auth.settleRound('replacement', replacementRequest)
        } finally {
            auth.idb.readwrite = readwrite
        }

        expect(inFlightFinals).toStrictEqual([undefined, replacementFinal])
        expect(abortObserved).toBe(true)
        expect(result).toMatchObject({ kind: 'aborted', code: 'transaction-error' })
        expect(await snapshotStores()).toStrictEqual(before)
    })
})

describe('result contract — closed union', () => {
    it('exposes exactly six kinds', () => {
        expect(RESULT_KINDS).toEqual(['committed', 'rejected', 'not-admitted', 'aborted', 'unknown', 'superseded'])
    })

    it('refuses extra fields on a rejection (no smuggled profit)', () => {
        expect(() => rejected({ target: {}, code: 'insufficient-funds', sequence: 1, revision: 0, profit: 0 }))
            .not.toThrow() // extra args are ignored by the constructor …
        const r = rejected({ target: {}, code: 'insufficient-funds', sequence: 1, revision: 0, profit: 0 })
        expect('profit' in r).toBe(false) // … and never land on the frozen envelope
    })

    it('requires unknown to carry an identity or a recovery handle', () => {
        expect(() => unknown({ phase: 'execution', code: 'completion-unobserved' })).toThrow()
        expect(() => unknown({ phase: 'execution', code: 'completion-unobserved', recovery: { epoch: 'e1' } })).not.toThrow()
    })

    it('distinguishes stage from settled-result by milestone', () => {
        const staged = committed({ target: {}, milestone: 'stage', sequence: 0, revision: 0, value: null })
        expect(isCommittedStage(staged)).toBe(true)
        expect(isSettled(staged)).toBe(false)
    })

    it('builds a valid superseded envelope', () => {
        const r = superseded({ target: {}, currentEpoch: 'e2', currentProtocol: '2' })
        expect(r.kind).toBe('superseded')
        expect(r.historicResultAvailable).toBe(false)
    })

    it('builds a valid aborted envelope with a recovery handle', () => {
        const r = aborted({ target: {}, attemptId: 'a1', code: 'quota', recovery: { epoch: 'e1' } })
        expect(r.kind).toBe('aborted')
        expect(r.phase).toBe('execution')
    })

    it('makeSettleRequest rejects malformed requests', () => {
        expect(() => makeSettleRequest('', { exitKind: 'win' })).toThrow()
        expect(() => makeSettleRequest('x', { exitKind: 'bogus' })).toThrow()
        expect(() => makeSettleRequest('x', { exitKind: 'win', stake: -1 })).toThrow()
        expect(makeSettleRequest('x', { exitKind: 'win', stake: 1 })).toMatchObject({ operationId: 'x', exitKind: 'win', stake: 1, payout: 0 })
    })
})

describe('idb — one database', () => {
    it('uses a single database name and no localStorage fallback', async () => {
        expect(DB_NAME).toBe('gampo_authority')
        expect(globalThis.localStorage).toBeUndefined()
    })
})

// --- Codec defects recorded by the 04-11-26 PVL ---------------------------
//
// Each case below asserts behaviour the PVL graded FAIL against source. They are
// grouped in one block so the repair commit is self-documenting: the failing
// assertion IS the finding.
//
// Not covered here, deliberately: the async caller cutover, rounding parity with
// `roundCredits` (a cross-module decision needing AC09 sign-off, not a local
// patch), and fail-closed `placeBet` (a product-behaviour change in
// CreditContext, outside the authority module).

describe('codec — accepted facts survive the settle request', () => {
    it('retains the selected outcome so a round can be replayed, not just its money', () => {
        const exact = makeSettleRequest('op-1', {
            exitKind: 'win',
            stake: 5,
            payout: 9,
            label: 'Plinko',
            selected: { bin: 8, multiplier: 1.8 },
        })
        expect(exact.selected).toEqual({ bin: 8, multiplier: 1.8 })
    })

    it('treats two different selected outcomes with identical money as different operations', () => {
        const a = makeSettleRequest('op-1', { exitKind: 'win', stake: 1, payout: 2, selected: { bin: 8 } })
        const b = makeSettleRequest('op-1', { exitKind: 'win', stake: 1, payout: 2, selected: { bin: 12 } })
        expect(a.selected).not.toEqual(b.selected)
    })

    it('omits `selected` entirely when the request carries none', () => {
        const exact = makeSettleRequest('op-1', { exitKind: 'push', stake: 1, payout: 1 })
        expect('selected' in exact).toBe(false)
    })

    it('refuses a non-object selected payload instead of coercing it', () => {
        expect(() => makeSettleRequest('op-1', { exitKind: 'win', stake: 1, selected: 'bin:8' })).toThrow()
    })
})

describe('codec — profit is readable by the Auto reconciler', () => {
    it('lets normalizeBetResult read a settled profit out of a committed envelope', async () => {
        const auth = await freshAuthority()
        await seedWallet(auth, 100)
        const result = await auth.settleRound('op-profit', { exitKind: 'win', stake: 5, payout: 9 })
        expect(result.kind).toBe('committed')
        // The envelope keeps its closed union and nests economic data under
        // `value`; the reconciler is what must look there. Reading only
        // `result.profit` yields 0 and books a real win as break-even.
        const { normalizeBetResult } = await import('../components/games/primitives/autoAccounting.js')
        expect(normalizeBetResult(result).profit).toBe(4)
    })
})

describe('codec — settlement cannot overflow the wallet', () => {
    it('refuses a settlement whose arithmetic leaves the safe-integer range', async () => {
        const auth = await freshAuthority()
        await seedWallet(auth, 100)
        const result = await auth.settleRound('op-overflow', {
            exitKind: 'win',
            stake: 1,
            payout: Number.MAX_VALUE,
        })
        // An `Infinity`/`NaN` balance would be persisted and every later
        // affordability read would compare against it. The contract's answer is
        // a durable non-committed kind, never a committed absurd balance.
        expect(result.kind).not.toBe('committed')
        const wallet = await auth.readWallet()
        expect(Number.isFinite(wallet.balance)).toBe(true)
        expect(wallet.balance).toBe(100)
    })
})

describe('codec — one declaration of the six kinds', () => {
    it('autoAccounting imports the contract instead of re-declaring the union', async () => {
        const auto = await import('../components/games/primitives/autoAccounting.js')
        const contract = await import('./resultContract.js')
        // Two hand-maintained copies is how `superseded` gets added to one and
        // not the other, silently making a superseded round look committed.
        expect(auto.RESULT_KINDS).toBe(contract.RESULT_KINDS)
    })
})

describe('codec — accepted facts survive a replay', () => {
    it('returns the stored selected outcome on exact replay without charging again', async () => {
        const auth = await freshAuthority()
        await seedWallet(auth, 100)
        const req = { exitKind: 'win', stake: 5, payout: 9, selected: { bin: 8, multiplier: 1.8 } }
        const first = await auth.settleRound('op-replay', req)
        expect(first.kind).toBe('committed')
        expect(first.value.selected).toEqual({ bin: 8, multiplier: 1.8 })

        const again = await auth.settleRound('op-replay', req)
        expect(again.replay).toBe(true)
        expect(again.value.selected).toEqual({ bin: 8, multiplier: 1.8 })
        expect((await auth.readWallet()).balance).toBe(104)
    })

    it('is not confused by nested key order when the same outcome is replayed', async () => {
        const auth = await freshAuthority()
        await seedWallet(auth, 100)
        const first = await auth.settleRound('op-order', {
            exitKind: 'win', stake: 1, payout: 2, selected: { bin: 8, multiplier: 1.8 },
        })
        expect(first.kind).toBe('committed')
        const again = await auth.settleRound('op-order', {
            exitKind: 'win', stake: 1, payout: 2, selected: { multiplier: 1.8, bin: 8 },
        })
        expect(again.replay).toBe(true)
        expect(again.kind).toBe('committed')
    })
})

describe('codec — accepted facts are captured, not aliased', () => {
    it('is unaffected by a caller mutating its selected payload after the call', () => {
        const selected = { bin: 8, multiplier: 1.8 }
        const exact = makeSettleRequest('op-alias', { exitKind: 'win', stake: 1, payout: 2, selected })
        const before = canonical(exact)
        // The caller owns its object and may reuse it for the next round. If the
        // request aliased it, the bytes already computed for THIS operation
        // would silently change, so a replay of the original outcome would be
        // rejected as an id-conflict against its own record.
        selected.bin = 12
        selected.multiplier = 0
        expect(canonical(exact)).toBe(before)
        expect(exact.selected).toEqual({ bin: 8, multiplier: 1.8 })
    })

    it('stores the captured facts, not a later mutation of the caller object', async () => {
        const auth = await freshAuthority()
        await seedWallet(auth, 100)
        const selected = { bin: 8 }
        const pending = auth.settleRound('op-alias-2', { exitKind: 'win', stake: 1, payout: 2, selected })
        selected.bin = 99
        const result = await pending
        expect(result.kind).toBe('committed')
        expect(result.value.selected).toEqual({ bin: 8 })
        expect((await auth.readFinals(`e1:round:op-alias-2`))[0].result.value.selected).toEqual({ bin: 8 })
    })
})
