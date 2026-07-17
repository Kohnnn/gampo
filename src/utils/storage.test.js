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

function installStorage(initial = {}, controls = {}) {
    const store = new Map(Object.entries(initial))
    const calls = []
    globalThis.localStorage = {
        get length() {
            calls.push(['length'])
            if (controls.length?.(calls)) throw new Error('length failed')
            return store.size
        },
        key(i) {
            calls.push(['key', i])
            if (controls.key?.(i, calls)) throw new Error(`key ${i} failed`)
            return Array.from(store.keys())[i] ?? null
        },
        getItem(key) {
            calls.push(['getItem', key])
            if (controls.getItem?.(key, calls)) throw new Error(`get ${key} failed`)
            return store.has(key) ? store.get(key) : null
        },
        setItem(key, value) {
            calls.push(['setItem', key])
            if (controls.setItem?.(key, String(value), calls)) throw new Error(`set ${key} failed`)
            store.set(key, String(value))
        },
        removeItem(key) {
            calls.push(['removeItem', key])
            if (controls.removeItem?.(key, calls)) throw new Error(`remove ${key} failed`)
            store.delete(key)
        },
        clear() {
            calls.push(['clear'])
            store.clear()
        },
    }
    return { calls, snapshot: () => Object.fromEntries(store) }
}

function managedSnapshot() {
    return Object.fromEntries(Object.entries(snapshotGampoState()).sort(([a], [b]) => a.localeCompare(b)))
}

function thrown(action) {
    try {
        action()
    } catch (error) {
        return error
    }
    throw new Error('Expected action to throw.')
}

beforeEach(() => {
    installStorage()
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
        expect(result).toEqual({ restored: 2, skipped: 0 })
        expect(readJson('gampo_credits')).toBe(1234)
        expect(readRaw('gampo_reduce_motion')).toBe('1')
    })

    it.each([
        [{ gampo_ok: '1', foreign: 'bad' }],
        [{ gampo_ok: 1 }],
        [[]],
        [null],
        [new Date()],
        [new (class Save {})()],
    ])('rejects invalid incoming data before storage access', (data) => {
        const { calls, snapshot } = installStorage({ gampo_credits: '1000', foreign: 'keep' })
        expect(thrown(() => restoreGampoState(data))).toMatchObject({
            message: 'Invalid GamPo save data.',
            validationFailed: true,
        })
        expect(calls).toEqual([])
        expect(snapshot()).toEqual({ gampo_credits: '1000', foreign: 'keep' })
    })

    it('fails before mutation when managed-key enumeration fails', () => {
        const { calls, snapshot } = installStorage(
            { gampo_credits: '1000', gampo_stale: 'old', foreign: 'keep' },
            { key: () => true },
        )

        expect(thrown(() => restoreGampoState({ gampo_new: 'new' }))).toMatchObject({
            message: 'GamPo save restore failed.',
            applyFailed: true,
            rolledBack: false,
        })
        expect(calls.filter(([operation]) => operation === 'removeItem' || operation === 'setItem')).toEqual([])
        expect(snapshot()).toEqual({ gampo_credits: '1000', gampo_stale: 'old', foreign: 'keep' })
    })

    it('fails before mutation when reading an existing managed key fails', () => {
        const { calls, snapshot } = installStorage(
            { gampo_credits: '1000', foreign: 'keep' },
            { getItem: (key) => key === 'gampo_credits' },
        )

        expect(thrown(() => restoreGampoState({ gampo_new: 'new' }))).toMatchObject({
            message: 'GamPo save restore failed.',
            applyFailed: true,
            rolledBack: false,
        })
        expect(calls.filter(([operation]) => operation === 'removeItem' || operation === 'setItem')).toEqual([])
        expect(snapshot()).toEqual({ gampo_credits: '1000', foreign: 'keep' })
    })

    it('fails before mutation when localStorage is unavailable', () => {
        const { calls, snapshot } = installStorage({ gampo_credits: '1000', foreign: 'keep' })
        const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

        try {
            Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: undefined })
            expect(thrown(() => restoreGampoState({ gampo_new: 'new' }))).toMatchObject({
                message: 'GamPo save restore failed.',
                applyFailed: true,
                rolledBack: false,
            })
            expect(calls).toEqual([])
            expect(snapshot()).toEqual({ gampo_credits: '1000', foreign: 'keep' })
        } finally {
            if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor)
            else delete globalThis.localStorage
        }
    })

    it('exactly replaces managed state and preserves foreign keys', () => {
        installStorage({ gampo_credits: '1000', gampo_stale: 'old', foreign: 'keep' })
        expect(restoreGampoState({ gampo_credits: '2000', gampo_new: 'fresh' })).toEqual({ restored: 2, skipped: 0 })
        expect(managedSnapshot()).toEqual({ gampo_credits: '2000', gampo_new: 'fresh' })
        expect(readRaw('foreign')).toBe('keep')
    })

    it('allows an empty exact replacement to clear managed state', () => {
        installStorage({ gampo_credits: '1000', gampo_stale: 'old', foreign: 'keep' })
        expect(restoreGampoState({})).toEqual({ restored: 0, skipped: 0 })
        expect(managedSnapshot()).toEqual({})
        expect(readRaw('foreign')).toBe('keep')
    })

    it('merges incoming managed state without deleting omitted keys', () => {
        installStorage({ gampo_credits: '1000', gampo_stale: 'old', foreign: 'keep' })
        expect(restoreGampoState({ gampo_credits: '2000', gampo_new: 'fresh' }, { clearExisting: false })).toEqual({ restored: 2, skipped: 0 })
        expect(managedSnapshot()).toEqual({ gampo_credits: '2000', gampo_new: 'fresh', gampo_stale: 'old' })
        expect(readRaw('foreign')).toBe('keep')
    })

    it('restores the exact prior managed map after a remove failure', () => {
        let failed = false
        installStorage(
            { gampo_a: 'old-a', gampo_b: 'old-b', foreign: 'keep' },
            { removeItem: (key) => key === 'gampo_b' && !failed && (failed = true) },
        )
        expect(thrown(() => restoreGampoState({ gampo_new: 'new' }))).toMatchObject({
            message: 'GamPo save restore failed; previous save was restored.',
            applyFailed: true,
            rolledBack: true,
            rollbackFailed: false,
        })
        expect(managedSnapshot()).toEqual({ gampo_a: 'old-a', gampo_b: 'old-b' })
        expect(readRaw('foreign')).toBe('keep')
    })

    it('removes partial incoming state and restores the exact prior map after a write failure', () => {
        let failed = false
        installStorage(
            { gampo_a: 'old-a', gampo_stale: 'old-stale', foreign: 'keep' },
            { setItem: (key) => key === 'gampo_b' && !failed && (failed = true) },
        )
        expect(thrown(() => restoreGampoState({ gampo_a: 'new-a', gampo_b: 'new-b' }))).toMatchObject({
            message: 'GamPo save restore failed; previous save was restored.',
            rolledBack: true,
            rollbackFailed: false,
        })
        expect(managedSnapshot()).toEqual({ gampo_a: 'old-a', gampo_stale: 'old-stale' })
        expect(readRaw('foreign')).toBe('keep')
    })

    it('reports a rollback write failure distinctly', () => {
        let applyFailed = false
        installStorage(
            { gampo_a: 'old-a' },
            {
                setItem: (key) => {
                    if (key === 'gampo_new' && !applyFailed) {
                        applyFailed = true
                        return true
                    }
                    return key === 'gampo_a'
                },
            },
        )
        expect(thrown(() => restoreGampoState({ gampo_new: 'new' }))).toMatchObject({
            message: 'GamPo save restore failed and rollback failed.',
            applyFailed: true,
            rolledBack: false,
            rollbackFailed: true,
            cause: expect.any(Error),
            rollbackCause: expect.any(Error),
        })
    })

    it('reports a rollback removal failure distinctly', () => {
        installStorage(
            { gampo_a: 'old-a' },
            {
                setItem: (key) => key === 'gampo_bad',
                removeItem: (key) => key === 'gampo_a',
            },
        )
        expect(thrown(() => restoreGampoState({ gampo_new: 'new', gampo_bad: 'bad' }, { clearExisting: false }))).toMatchObject({
            message: 'GamPo save restore failed and rollback failed.',
            rollbackFailed: true,
            cause: expect.any(Error),
            rollbackCause: expect.any(Error),
        })
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
