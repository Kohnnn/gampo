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

describe('fail-loud save reads', () => {
    it('snapshotM1: unavailable storage is not an empty profile', () => {
        globalThis.localStorage = undefined
        expect(() => snapshotGampoState()).toThrow()
        expect(() => listGampoKeys()).toThrow()
        expect(readRaw('gampo_missing', 'fallback')).toBe('fallback')
        expect(readJson('gampo_missing', 'fallback')).toBe('fallback')
        expect(() => readRaw('gampo_missing', null, { strict: true })).toThrow()
    })

    it.each([
        ['enumerationKeyFailure', { key: (index) => index === 1 }, 'key 1 failed'],
        ['enumerationLengthFailure', { length: (calls) => calls.filter(([op]) => op === 'length').length > 1 }, 'length failed'],
    ])('%s: no partial key list or snapshot', (_name, controls, message) => {
        const initial = { gampo_a: '1', gampo_b: '2', foreign: 'keep' }
        for (const read of [listGampoKeys, snapshotGampoState]) {
            const fixture = installStorage(initial, controls)
            expect(read).toThrow(message)
            expect(fixture.snapshot()).toEqual(initial)
            expect(fixture.calls.filter(([op]) => ['setItem', 'removeItem', 'clear'].includes(op))).toEqual([])
        }
    })

    it('snapshotM3: one failed getItem cannot emit a partial map', () => {
        const initial = { gampo_a: '1', gampo_b: '2', foreign: 'keep' }
        const fixture = installStorage(initial, { getItem: (key) => key === 'gampo_b' })
        expect(() => snapshotGampoState()).toThrow('get gampo_b failed')
        expect(readRaw('gampo_b', 'fallback')).toBe('fallback')
        expect(readJson('gampo_b', 'fallback')).toBe('fallback')
        expect(() => readRaw('gampo_b', null, { strict: true })).toThrow('get gampo_b failed')
        expect(() => readJson('gampo_b', null, { strict: true })).toThrow('get gampo_b failed')
        expect(fixture.snapshot()).toEqual(initial)
    })

    it('enumeratedNull: actual null is a read failure, unlike absentKey', () => {
        const fixture = installStorage({ gampo_a: 'backing bytes', foreign: 'keep' })
        globalThis.localStorage.getItem = () => null
        expect(() => snapshotGampoState()).toThrow('getItem gampo_a failed')
        expect(fixture.snapshot()).toEqual({ gampo_a: 'backing bytes', foreign: 'keep' })
        installStorage({ foreign: 'keep' })
        expect(snapshotGampoState()).toEqual({})
        expect(readRaw('gampo_absent', 'absent')).toBe('absent')
    })

    it('emptySnapshot and rawNullRoundTrip preserve legitimate bytes', () => {
        expect(snapshotGampoState()).toEqual({})
        const fixture = installStorage({ gampo_null: 'null', foreign: 'keep' })
        expect(snapshotGampoState()).toEqual({ gampo_null: 'null' })
        expect(readRaw('gampo_null', 'fallback', { strict: true })).toBe('null')
        expect(readJson('gampo_null', 'fallback', { strict: true })).toBe('fallback')
        expect(fixture.snapshot()).toEqual({ gampo_null: 'null', foreign: 'keep' })
    })
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
        const result = restoreGampoState(snap, { confirmRemoval: () => true })
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
        expect(restoreGampoState({ gampo_credits: '2000', gampo_new: 'fresh' }, { confirmRemoval: () => true })).toEqual({ restored: 2, skipped: 0 })
        expect(managedSnapshot()).toEqual({ gampo_credits: '2000', gampo_new: 'fresh' })
        expect(readRaw('foreign')).toBe('keep')
    })

    it('emptyReplacementNeedsConsent: empty replacement cannot silently clear managed state', () => {
        const initial = { gampo_credits: '1000', gampo_stale: 'old', foreign: 'keep' }
        const fixture = installStorage(initial)
        expect(restoreGampoState({})).toEqual({ restored: 0, skipped: 0, declined: true })
        expect(fixture.snapshot()).toEqual(initial)
        expect(fixture.calls.filter(([op]) => ['removeItem', 'setItem', 'clear'].includes(op))).toEqual([])
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
        expect(thrown(() => restoreGampoState({ gampo_new: 'new' }, { confirmRemoval: () => true }))).toMatchObject({
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
        expect(thrown(() => restoreGampoState({ gampo_a: 'new-a', gampo_b: 'new-b' }, { confirmRemoval: () => true }))).toMatchObject({
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
        expect(thrown(() => restoreGampoState({ gampo_new: 'new' }, { confirmRemoval: () => true }))).toMatchObject({
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

describe('direct restore admission', () => {
    it('invalidRawMap original accessors/symbols/custom prototypes never reach storage', () => {
        let invoked = 0
        const accessor = {}
        Object.defineProperty(accessor, 'gampo_x', { enumerable: true, get() { invoked += 1; return '1' } })
        const hidden = {}
        Object.defineProperty(hidden, 'gampo_hidden', { value: 'bytes' })
        const symbol = { gampo_x: '1', [Symbol('extra')]: 'bad' }
        for (const data of [accessor, hidden, symbol, { gampo_x: '1', toJSON() { invoked += 1; return {} } }, 42, 'text']) {
            const fixture = installStorage({ gampo_old: 'old', foreign: 'keep' })
            expect(thrown(() => restoreGampoState(data))).toMatchObject({ validationFailed: true })
            expect(fixture.calls).toEqual([])
            expect(fixture.snapshot()).toEqual({ gampo_old: 'old', foreign: 'keep' })
        }
        expect(invoked).toBe(0)
    })

    it('directObjectSize raw-map canonical exact max is size-admitted and +1 rejects before access', () => {
        const overhead = new TextEncoder().encode(JSON.stringify({ gampo_padding: '' })).length
        const data = { gampo_padding: 'x'.repeat(33554432 - overhead) }
        globalThis.localStorage = undefined
        expect(thrown(() => restoreGampoState(data))).toMatchObject({ applyFailed: true })
        const fixture = installStorage({ gampo_old: 'old', foreign: 'keep' })
        expect(thrown(() => restoreGampoState({ gampo_padding: data.gampo_padding + 'x' }))).toMatchObject({ validationFailed: true, code: 'saveTooLarge' })
        expect(fixture.calls).toEqual([])
        expect(fixture.snapshot()).toEqual({ gampo_old: 'old', foreign: 'keep' })
    })
})

describe('restore consent', () => {
    const mutationCalls = calls => calls.filter(([op]) => ['setItem', 'removeItem', 'clear'].includes(op))

    it.each([false, undefined, null, 1, 'yes', {}, Promise.resolve(true), { then() { throw new Error('must not await') } }])('nonAffirmativeConsent %j never writes', value => {
        const initial = { gampo_a: 'old', foreign: 'keep' }
        const fixture = installStorage(initial)
        expect(restoreGampoState({}, { confirmRemoval: () => value })).toEqual({ restored: 0, skipped: 0, declined: true })
        expect(fixture.snapshot()).toEqual(initial)
        expect(mutationCalls(fixture.calls)).toEqual([])
    })

    it('throwing consent propagates with zero writes', () => {
        const fixture = installStorage({ gampo_a: 'old', foreign: 'keep' })
        expect(() => restoreGampoState({}, { confirmRemoval() { throw new Error('consent error') } })).toThrow('consent error')
        expect(fixture.snapshot()).toEqual({ gampo_a: 'old', foreign: 'keep' })
        expect(mutationCalls(fixture.calls)).toEqual([])
    })

    it.each([
        ['confirmEmpty', { gampo_a: 'old' }, {}, ['gampo_a'], []],
        ['removed-only', { gampo_a: 'old', gampo_b: 'keep' }, { gampo_b: 'new' }, ['gampo_a'], []],
        ['added-only', { gampo_a: 'old' }, { gampo_a: 'new', gampo_b: 'added' }, [], ['gampo_b']],
        ['equal-size-different', { gampo_a: 'old' }, { gampo_b: 'new' }, ['gampo_a'], ['gampo_b']],
        ['overlap', { gampo_a: 'old', gampo_b: 'old' }, { gampo_b: 'new', gampo_c: 'new' }, ['gampo_a'], ['gampo_c']],
        ['empty-live', {}, { gampo_b: 'new' }, [], ['gampo_b']],
    ])('confirmAffectedKeys %s exact names for decline and literal true', (_name, before, incoming, removed, added) => {
        for (const consent of [false, true]) {
            const fixture = installStorage({ ...before, foreign: 'keep' })
            const seen = []
            const result = restoreGampoState(incoming, { confirmRemoval: (r, a) => { seen.push([r, a]); return consent } })
            expect(seen).toEqual([[removed, added]])
            expect(fixture.snapshot()).toEqual({ ...(consent ? incoming : before), foreign: 'keep' })
            if (consent) expect(result).toEqual({ restored: Object.keys(incoming).length, skipped: 0 })
            else { expect(result.declined).toBe(true); expect(mutationCalls(fixture.calls)).toEqual([]) }
        }
    })

    it.each(['add', 'remove', 'value', 'equal-size-set'])('beforeimageConflict %s retains callback changes without restore/rollback writes', change => {
        const fixture = installStorage({ gampo_a: 'old-a', gampo_b: 'old-b', foreign: 'keep' })
        let expected
        expect(thrown(() => restoreGampoState({ gampo_new: 'new' }, { confirmRemoval() {
            if (change === 'add') localStorage.setItem('gampo_concurrent', 'fresh')
            if (change === 'remove') localStorage.removeItem('gampo_a')
            if (change === 'value') localStorage.setItem('gampo_a', 'concurrent')
            if (change === 'equal-size-set') { localStorage.removeItem('gampo_a'); localStorage.setItem('gampo_c', 'concurrent') }
            expected = fixture.snapshot()
            fixture.calls.length = 0 // callback fixture writes are not restore writes
            return true
        } }))).toMatchObject({ conflict: true })
        expect(fixture.snapshot()).toEqual(expected)
        expect(mutationCalls(fixture.calls)).toEqual([])
    })

    it('captures incoming approved entries before a mutable callback', () => {
        const fixture = installStorage({ gampo_old: 'old', foreign: 'keep' })
        const incoming = { gampo_new: 'approved' }
        expect(restoreGampoState(incoming, { confirmRemoval(removed, added) {
            incoming.gampo_new = 'substituted'
            incoming.gampo_extra = 'unapproved'
            removed.push('not-real')
            added.length = 0
            return true
        } })).toEqual({ restored: 1, skipped: 0 })
        expect(fixture.snapshot()).toEqual({ gampo_new: 'approved', foreign: 'keep' })
    })

    it('identical key sets and non-deleting merge do not request removal consent', () => {
        const fixture = installStorage({ gampo_a: 'old', foreign: 'keep' })
        const confirmRemoval = () => { throw new Error('unneeded consent') }
        expect(restoreGampoState({ gampo_a: 'new' }, { confirmRemoval }).restored).toBe(1)
        expect(restoreGampoState({ gampo_b: 'added' }, { clearExisting: false, confirmRemoval }).restored).toBe(1)
        expect(fixture.snapshot()).toEqual({ gampo_a: 'new', gampo_b: 'added', foreign: 'keep' })
    })
})

describe('consent boundary controls', () => {
    it('missing callback declines added-only even from an empty live map', () => {
        const fixture = installStorage({ foreign: 'keep' })
        expect(restoreGampoState({ gampo_new: 'new' })).toEqual({ restored: 0, skipped: 0, declined: true })
        expect(fixture.snapshot()).toEqual({ foreign: 'keep' })
        expect(fixture.calls.filter(([op]) => ['setItem', 'removeItem', 'clear'].includes(op))).toEqual([])
    })

    it('a throwing then getter is never inspected or awaited', () => {
        const fixture = installStorage({ gampo_old: 'old', foreign: 'keep' })
        const result = Object.defineProperty({}, 'then', { get() { throw new Error('must not inspect then') } })
        expect(restoreGampoState({}, { confirmRemoval: () => result })).toEqual({ restored: 0, skipped: 0, declined: true })
        expect(fixture.snapshot()).toEqual({ gampo_old: 'old', foreign: 'keep' })
    })
})
