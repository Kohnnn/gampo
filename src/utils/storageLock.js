// Cross-document mutual exclusion for localStorage writers.
//
// localStorage has no transaction and no compare-and-swap, and a document's
// `getItem` can return a stale value after another document writes. Wrapping
// writes in a lock is not enough: a caller that computed its next value from a
// tab-local ref would still publish a stale value once it acquired the lock.
//
// Every mutation therefore runs read-validate-mutate-publish *inside* the
// critical section, and no writer may hold a computed value across the
// boundary. `withStorageLock` is the single entry point.
//
// Degraded mode: when `navigator.locks` is unavailable the caller is told, so
// the mutation can refuse rather than silently run unprotected.

export const STORAGE_LOCK_NAME = 'gampo-localstorage'
export const STORAGE_REPLACED_CHANNEL = 'gampo-storage-replaced'

export function storageLocksAvailable() {
    try {
        return typeof navigator !== 'undefined' && typeof navigator.locks?.request === 'function'
    } catch {
        return false
    }
}

function unsupported() {
    return Object.assign(new Error('Cross-tab storage locking is unavailable in this browser.'), { lockUnavailable: true })
}

/**
 * Run `fn` while holding the exclusive storage lock.
 *
 * `fn` MUST perform its own reads and must not rely on state captured before
 * the call. Its return value is passed through. Rejects with
 * `{ lockUnavailable: true }` when Web Locks is missing rather than running
 * unprotected.
 */
export async function withStorageLock(fn, { timeoutMs = 10000 } = {}) {
    if (!storageLocksAvailable()) throw unsupported()
    const controller = typeof AbortController === 'function' ? new AbortController() : null
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined
    try {
        return await navigator.locks.request(
            STORAGE_LOCK_NAME,
            controller ? { signal: controller.signal } : {},
            () => fn(),
        )
    } catch (error) {
        if (error?.name === 'AbortError') {
            throw Object.assign(new Error('Timed out waiting for the cross-tab storage lock.'), { lockTimeout: true, cause: error })
        }
        throw error
    } finally {
        clearTimeout(timer)
    }
}

/**
 * Run a read-modify-write of one key under the lock. The read happens inside
 * the critical section so a value captured before the call can never be
 * published over a concurrent change.
 */
export function updateStorageUnderLock(read, mutate) {
    return withStorageLock(async () => {
        const current = read()
        return mutate(current)
    })
}

// Cache invalidation is a separate concern from correctness. The lock makes
// mutations safe; the replacement channel tells peer documents to drop values
// they cached earlier. `window.dispatchEvent` reaches only the current window,
// so BroadcastChannel is used for cross-document notification.

function channel() {
    try {
        if (typeof BroadcastChannel !== 'function') return null
        return new BroadcastChannel(STORAGE_REPLACED_CHANNEL)
    } catch {
        return null
    }
}

/**
 * Tell peer documents that storage was replaced wholesale, so cached values
 * must be discarded. Best-effort: a peer that misses the message still cannot
 * corrupt storage, because every write re-reads under the lock. Correctness
 * does not depend on delivery; only cache freshness does.
 */
export function broadcastStorageReplaced(detail = {}) {
    const bus = channel()
    if (!bus) return false
    try {
        bus.postMessage(detail)
        return true
    } catch {
        return false
    } finally {
        bus.close()
    }
}

/**
 * Observe replacement from peer documents. A document that was suspended when
 * the message was sent may miss it, so callers should also re-read on
 * `visibilitychange`; this subscription is an accelerator, not a guarantee.
 * Returns an unsubscribe function.
 */
export function onStorageReplaced(listener) {
    const bus = channel()
    if (!bus) return () => {}
    const handler = event => listener(event.data || {})
    bus.addEventListener('message', handler)
    return () => {
        bus.removeEventListener('message', handler)
        bus.close()
    }
}
