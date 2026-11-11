// Ticket #28 — IndexedDB access layer for the single authority database.
//
// Scope caveat that governs every claim about this file: IndexedDB atomicity is
// a *browser* guarantee. Unit tests exercise ordering and rollback logic through
// `fake-indexeddb`, which proves the *shape* of the protocol and NEVER proves
// durability, crash atomicity or real quota behaviour (owner decision 11).
// Durability claims are Chromium-desktop-only (owner decision 9).
//
// There is exactly one database and no second wallet: no localStorage mirror,
// no journal beside a writable legacy store (proposal §2).
//
// The transaction helper follows the standard `idb`-style contract: a
// readwrite scope opens, the (async) body runs, and the promise resolves with
// the body's value on `complete` or rejects on `error`/`abort`. Awaiting request
// promises inside the body keeps the transaction alive because each awaited
// request re-enters the same task's microtask queue.
//
// Design source: phase-01-record-registry_DESIGN_29-10-26.md §3 and
// phase-01-authority-contract_PROPOSAL_30-10-26.md §2.

export const DB_NAME = 'gampo_authority'
export const DB_VERSION = 1

// Bounded retained-final rule, fixed in code:
//   * exactly one retained final per round per exit kind,
//   * identical repeats coalesce onto that same row,
//   * nothing silently expires.
export const RETAINED_FINAL_CAP = 64
export const RETAINED_FINAL_PER_ROUND = 1

export const EXIT_KINDS = Object.freeze(['cashout', 'bust', 'loss', 'push', 'win', 'abandon', 'cancel'])

function requestToPromise(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
}

export function txDone(tx) {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve(true)
        tx.onerror = () => reject(tx.error || new Error('transaction failed'))
        tx.onabort = () => reject(tx.error || Object.assign(new Error('transaction aborted'), { aborted: true }))
    })
}

export function isQuotaError(err) {
    if (!err) return false
    const name = err.name || ''
    return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED'
}

/** Open the authority database. Caller supplies the (shimmed or native) factory. */
export function openAuthorityDb(factory) {
    return new Promise((resolve, reject) => {
        if (!factory || typeof factory.open !== 'function') {
            reject(Object.assign(new Error('IndexedDB unavailable.'), { unavailableStorage: true }))
            return
        }
        let request
        try {
            request = factory.open(DB_NAME, DB_VERSION)
        } catch (cause) {
            reject(Object.assign(new Error('IndexedDB open threw.'), { unavailableStorage: true, cause }))
            return
        }
        request.onupgradeneeded = () => {
            const db = request.result
            if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' })
            if (!db.objectStoreNames.contains('operations')) {
                const ops = db.createObjectStore('operations', { keyPath: 'id' })
                ops.createIndex('bySequence', 'sequence', { unique: true })
                ops.createIndex('byRound', 'roundId', { unique: false })
            }
            if (!db.objectStoreNames.contains('rounds')) {
                const rounds = db.createObjectStore('rounds', { keyPath: 'id' })
                rounds.createIndex('byStatus', 'status', { unique: false })
            }
            // Uniqueness on (roundId, exitKind) makes coalescing a store
            // invariant rather than application discipline.
            if (!db.objectStoreNames.contains('finals')) {
                const finals = db.createObjectStore('finals', { keyPath: 'id' })
                finals.createIndex('byRoundExit', ['roundId', 'exitKind'], { unique: true })
                finals.createIndex('byRound', 'roundId', { unique: false })
            }
            if (!db.objectStoreNames.contains('wallet')) db.createObjectStore('wallet', { keyPath: 'id' })
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
        request.onblocked = () => reject(Object.assign(new Error('IndexedDB upgrade blocked.'), { blocked: true }))
    })
}

/** A promisified store handle bound to a live transaction. */
class Store {
    constructor(store) { this.store = store }
    get(key) { return requestToPromise(this.store.get(key)) }
    getAll() { return requestToPromise(this.store.getAll()) }
    put(value) { return requestToPromise(this.store.put(value)) }
    add(value) { return requestToPromise(this.store.add(value)) }
    delete(key) { return requestToPromise(this.store.delete(key)) }
    count() { return requestToPromise(this.store.count()) }
    indexGet(name, key) { return requestToPromise(this.store.index(name).get(key)) }
    indexAll(name, key) { return requestToPromise(this.store.index(name).getAll(key)) }
}

/** Minimal promisified view over one connection. */
export class Idb {
    constructor(db) { this.db = db }

    /** Readonly read of one key. */
    async read(store, key) {
        const tx = this.db.transaction(store, 'readonly')
        const value = await requestToPromise(tx.objectStore(store).get(key))
        await txDone(tx)
        return value
    }

    /** Readonly read of one store. */
    async all(store) {
        const tx = this.db.transaction(store, 'readonly')
        const rows = await requestToPromise(tx.objectStore(store).getAll())
        await txDone(tx)
        return rows
    }

    /**
     * Run `fn(stores, tx)` inside a readwrite transaction.
     * Resolves with fn's return value once the transaction commits; rejects if
     * fn throws (the transaction is aborted) or the transaction errors/aborts.
     * fn may `await` request promises; it must NEVER await external work
     * (timers, network) — that is what closes a live IDB transaction.
     */
    async readwrite(stores, fn) {
        const names = Array.isArray(stores) ? [...new Set(stores)] : [stores]
        const tx = this.db.transaction(names, 'readwrite')
        const map = {}
        for (const name of names) map[name] = new Store(tx.objectStore(name))
        const done = txDone(tx)
        // Swallow the unhandled-rejection on `done` while the body runs; the
        // body promise is raced against it below.
        done.catch(() => {})
        let value
        try {
            value = await Promise.race([Promise.resolve(fn(map, tx)), done.then(() => value)])
        } catch (cause) {
            try { tx.abort() } catch { /* already settled */ }
            throw cause
        }
        await done
        return value
    }
}
