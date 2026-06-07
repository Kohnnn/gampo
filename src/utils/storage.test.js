import { describe, it, expect, beforeEach } from 'vitest'
import {
    STORAGE_PREFIX,
    readJson,
    writeJson,
    readRaw,
    writeRaw,
    removeKey,
    listGampoKeys,
    snapshotGampoState,
    restoreGampoState,
    onStorageQuotaError,
} from './storage'

beforeEach(() => {
    const store = new Map()
    globalThis.localStorage = {
        get length() { return store.size },
        key: (i) => Array.from(store.keys())[i] ?? null,
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)) },
        removeItem: (k) => { store.delete(k) },
        clear: () => store.clear(),
    }
})

describe('storage util', () => {
    it('uses the gampo_ prefix', () => {
        expect(STORAGE_PREFIX).toBe('gampo_')
    })

    it('round-trips JSON values', () => {
        writeJson('gampo_test', { a: 1, b: [2, 3] })
        expect(readJson('gampo_test')).toEqual({ a: 1, b: [2, 3] })
    })

    it('returns fallback on missing or malformed JSON', () => {
        expect(readJson('gampo_missing', 'fb')).toBe('fb')
        globalThis.localStorage.setItem('gampo_bad', '{not json')
        expect(readJson('gampo_bad', null)).toBeNull()
    })

    it('round-trips raw values and removes keys', () => {
        writeRaw('gampo_raw', '1')
        expect(readRaw('gampo_raw')).toBe('1')
        removeKey('gampo_raw')
        expect(readRaw('gampo_raw', 'gone')).toBe('gone')
    })

    it('enumerates only gampo_ keys', () => {
        writeRaw('gampo_a', '1')
        writeRaw('gampo_b', '2')
        writeRaw('other_key', '3')
        expect(listGampoKeys().sort()).toEqual(['gampo_a', 'gampo_b'])
    })

    it('snapshots and restores all gampo_ state losslessly', () => {
        writeJson('gampo_credits', 1234)
        writeRaw('gampo_reduce_motion', '1')
        writeRaw('foreign', 'x')
        const snap = snapshotGampoState()
        expect(Object.keys(snap).sort()).toEqual(['gampo_credits', 'gampo_reduce_motion'])

        globalThis.localStorage.clear()
        const result = restoreGampoState(snap)
        expect(result.restored).toBe(2)
        expect(readJson('gampo_credits')).toBe(1234)
        expect(readRaw('gampo_reduce_motion')).toBe('1')
    })

    it('rejects foreign keys on restore', () => {
        const result = restoreGampoState({ evil_key: 'x', gampo_ok: '1' })
        expect(result.restored).toBe(1)
        expect(result.skipped).toBe(1)
        expect(readRaw('evil_key', null)).toBeNull()
    })

    it('clears existing gampo_ keys before restore by default', () => {
        writeRaw('gampo_stale', 'old')
        restoreGampoState({ gampo_new: 'fresh' })
        expect(readRaw('gampo_stale', null)).toBeNull()
        expect(readRaw('gampo_new')).toBe('fresh')
    })

    it('signals quota errors to listeners and returns false', () => {
        let signalled = null
        const off = onStorageQuotaError((e) => { signalled = e })
        const quotaErr = Object.assign(new Error('full'), { name: 'QuotaExceededError' })
        globalThis.localStorage.setItem = () => { throw quotaErr }
        const ok = writeJson('gampo_big', { x: 1 })
        expect(ok).toBe(false)
        expect(signalled).toBeTruthy()
        expect(signalled.key).toBe('gampo_big')
        off()
    })

    it('does not signal quota for non-quota write errors', () => {
        let signalled = false
        const off = onStorageQuotaError(() => { signalled = true })
        globalThis.localStorage.setItem = () => { throw new Error('other') }
        expect(writeRaw('gampo_x', '1')).toBe(false)
        expect(signalled).toBe(false)
        off()
    })
})
