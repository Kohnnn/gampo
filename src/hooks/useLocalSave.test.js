import { describe, it, expect, beforeEach } from 'vitest'
import {
    SAVE_VERSION,
    buildSavePayload,
    validateSavePayload,
    applySavePayload,
    useLocalSave,
} from './useLocalSave'
import { writeJson, writeRaw, readJson, readRaw } from '../utils/storage'

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

describe('useLocalSave', () => {
    it('builds an envelope with app/kind/version and gampo_ data only', () => {
        writeJson('gampo_credits', 5000)
        writeRaw('foreign', 'nope')
        const payload = buildSavePayload()
        expect(payload.app).toBe('gampo')
        expect(payload.kind).toBe('save')
        expect(payload.version).toBe(SAVE_VERSION)
        expect(payload.keyCount).toBe(1)
        expect(Object.keys(payload.data)).toEqual(['gampo_credits'])
    })

    it('validates a correct payload', () => {
        expect(validateSavePayload(buildSavePayload()).ok).toBe(true)
    })

    it('rejects non-gampo and newer-version files', () => {
        expect(validateSavePayload(null).ok).toBe(false)
        expect(validateSavePayload({ app: 'other', kind: 'save', data: {} }).ok).toBe(false)
        expect(validateSavePayload({ app: 'gampo', kind: 'save', version: 999, data: {} }).ok).toBe(false)
    })

    it('round-trips a full save through apply', () => {
        writeJson('gampo_credits', 1234)
        writeRaw('gampo_xp_state', JSON.stringify({ totalXp: 42 }))
        const payload = buildSavePayload()

        globalThis.localStorage.clear()
        const result = applySavePayload(payload)
        expect(result.restored).toBe(2)
        expect(readJson('gampo_credits')).toBe(1234)
        expect(readRaw('gampo_xp_state')).toBe(JSON.stringify({ totalXp: 42 }))
    })

    it('throws a friendly error on a foreign file', () => {
        expect(() => applySavePayload({ app: 'evil' })).toThrow(/not a GamPo save/i)
    })

    it('exposes a hook function', () => {
        expect(typeof useLocalSave).toBe('function')
    })
})
