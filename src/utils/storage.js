// Shared localStorage helpers. The app persists all state under `gampo_*`
// keys using a module-scope singleton + listener pattern (see useSidebarPins,
// useProgress, etc). These helpers centralise the read/write/remove try-catch
// boilerplate that each hook previously reimplemented, and expose the canonical
// `gampo_` key prefix + key enumeration used by the local save/restore feature.
//
// SSR/safety: every call guards against a missing localStorage (e.g. tests that
// have not stubbed it, or non-browser environments) and never throws.

export const STORAGE_PREFIX = 'gampo_'

// Quota-exceeded signalling. Writes that fail because storage is full notify
// these listeners so the UI can surface a one-time "storage full" notice
// instead of silently dropping the player's progress.
const quotaListeners = new Set()
let lastQuotaError = 0

export function onStorageQuotaError(fn) {
    quotaListeners.add(fn)
    return () => quotaListeners.delete(fn)
}

export function getLastQuotaError() {
    return lastQuotaError
}

function isQuotaError(err) {
    if (!err) return false
    // Browsers report quota via name or legacy code 22 / 1014 (Firefox).
    return (
        err.name === 'QuotaExceededError' ||
        err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        err.code === 22 ||
        err.code === 1014
    )
}

function signalQuota(err, key) {
    if (!isQuotaError(err)) return
    lastQuotaError = Date.now()
    for (const fn of quotaListeners) {
        try { fn({ key, ts: lastQuotaError }) } catch { /* ignore */ }
    }
}

function getStore() {
    try {
        if (typeof localStorage !== 'undefined') return localStorage
    } catch {
        /* access can throw in sandboxed iframes */
    }
    return null
}

/** Read + JSON.parse a key, returning `fallback` on any failure. */
export function readJson(key, fallback = null) {
    const store = getStore()
    if (!store) return fallback
    try {
        const raw = store.getItem(key)
        if (raw == null) return fallback
        const parsed = JSON.parse(raw)
        return parsed == null ? fallback : parsed
    } catch {
        return fallback
    }
}

/** JSON.stringify + write a key. Returns true on success. */
export function writeJson(key, value) {
    const store = getStore()
    if (!store) return false
    try {
        store.setItem(key, JSON.stringify(value))
        return true
    } catch (err) {
        signalQuota(err, key)
        return false
    }
}

/** Read a raw string value. */
export function readRaw(key, fallback = null) {
    const store = getStore()
    if (!store) return fallback
    try {
        const raw = store.getItem(key)
        return raw == null ? fallback : raw
    } catch {
        return fallback
    }
}

/** Write a raw string value. Returns true on success. */
export function writeRaw(key, value) {
    const store = getStore()
    if (!store) return false
    try {
        store.setItem(key, String(value))
        return true
    } catch (err) {
        signalQuota(err, key)
        return false
    }
}

/** Remove one key. */
export function removeKey(key) {
    const store = getStore()
    if (!store) return false
    try {
        store.removeItem(key)
        return true
    } catch {
        return false
    }
}

/** Enumerate all persisted keys under the `gampo_` prefix. */
export function listGampoKeys() {
    const store = getStore()
    if (!store) return []
    const keys = []
    try {
        for (let i = 0; i < store.length; i += 1) {
            const key = store.key(i)
            if (key && key.startsWith(STORAGE_PREFIX)) keys.push(key)
        }
    } catch {
        /* ignore */
    }
    return keys
}

/**
 * Snapshot every `gampo_*` key into a plain object. Values are kept as their
 * raw stored strings so the snapshot round-trips losslessly regardless of
 * whether a given key stored JSON or a primitive.
 */
export function snapshotGampoState() {
    const store = getStore()
    const data = {}
    if (!store) return data
    for (const key of listGampoKeys()) {
        const raw = readRaw(key)
        if (raw != null) data[key] = raw
    }
    return data
}

/**
 * Restore a snapshot produced by `snapshotGampoState`. By default this clears
 * existing `gampo_*` keys first so the restore is exact. Only keys under the
 * `gampo_` prefix are written, so a malformed/foreign file can't inject
 * arbitrary keys.
 */
export function restoreGampoState(data, { clearExisting = true } = {}) {
    const store = getStore()
    if (!store || !data || typeof data !== 'object') return { restored: 0, skipped: 0 }
    if (clearExisting) {
        for (const key of listGampoKeys()) removeKey(key)
    }
    let restored = 0
    let skipped = 0
    for (const [key, value] of Object.entries(data)) {
        if (typeof key === 'string' && key.startsWith(STORAGE_PREFIX) && typeof value === 'string') {
            if (writeRaw(key, value)) restored += 1
            else skipped += 1
        } else {
            skipped += 1
        }
    }
    return { restored, skipped }
}
