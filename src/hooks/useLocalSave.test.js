import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
    SAVE_VERSION,
    buildSavePayload,
    validateSavePayload,
    applySavePayload,
    migrateSaveData,
    importSaveText,
    useLocalSave,
} from './useLocalSave'
import { writeJson, writeRaw, readJson, readRaw } from '../utils/storage'

function installStorage(initial = {}, controls = {}) {
    const store = new Map(Object.entries(initial))
    globalThis.localStorage = {
        get length() { return store.size },
        key: (i) => Array.from(store.keys())[i] ?? null,
        getItem: (key) => (store.has(key) ? store.get(key) : null),
        setItem(key, value) {
            if (controls.setItem?.(key, String(value))) throw new Error(`set ${key} failed`)
            store.set(key, String(value))
        },
        removeItem(key) {
            if (controls.removeItem?.(key)) throw new Error(`remove ${key} failed`)
            store.delete(key)
        },
        clear: () => store.clear(),
    }
}

function saveText(data) {
    return JSON.stringify({ app: 'gampo', kind: 'save', version: SAVE_VERSION, data })
}

beforeEach(() => {
    installStorage()
    globalThis.window = { location: { reload: vi.fn() } }
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

    it('reloads once after a successful import', async () => {
        await expect(importSaveText(saveText({ gampo_credits: '2000' }))).resolves.toEqual({ restored: 1, skipped: 0 })
        expect(window.location.reload).toHaveBeenCalledTimes(1)
    })

    it('does not reload when reload is disabled', async () => {
        await expect(importSaveText(saveText({ gampo_credits: '2000' }), { reload: false })).resolves.toEqual({ restored: 1, skipped: 0 })
        expect(window.location.reload).not.toHaveBeenCalled()
    })

    it('keeps JSON and envelope errors friendly without reloading', async () => {
        await expect(importSaveText('{bad json')).rejects.toThrow('Could not read save file (invalid JSON).')
        await expect(importSaveText(JSON.stringify({ app: 'other' }))).rejects.toThrow('This file is not a GamPo save.')
        expect(window.location.reload).not.toHaveBeenCalled()
    })

    it('does not reload after validation failure', async () => {
        await expect(importSaveText(saveText({ gampo_credits: 2000 }))).rejects.toMatchObject({
            message: 'Invalid GamPo save data.',
            validationFailed: true,
        })
        expect(window.location.reload).not.toHaveBeenCalled()
    })

    it('does not reload after an apply failure with successful rollback', async () => {
        let failed = false
        installStorage(
            { gampo_old: 'old' },
            { setItem: (key) => key === 'gampo_new' && !failed && (failed = true) },
        )
        await expect(importSaveText(saveText({ gampo_new: 'new' }))).rejects.toMatchObject({
            rolledBack: true,
            rollbackFailed: false,
        })
        expect(window.location.reload).not.toHaveBeenCalled()
    })

    it('does not reload after rollback failure', async () => {
        let applyFailed = false
        installStorage(
            { gampo_old: 'old' },
            {
                setItem: (key) => {
                    if (key === 'gampo_new' && !applyFailed) {
                        applyFailed = true
                        return true
                    }
                    return key === 'gampo_old'
                },
            },
        )
        await expect(importSaveText(saveText({ gampo_new: 'new' }))).rejects.toMatchObject({
            rollbackFailed: true,
        })
        expect(window.location.reload).not.toHaveBeenCalled()
    })

    it('exposes a hook function', () => {
        expect(typeof useLocalSave).toBe('function')
    })

    it('migrateSaveData is a no-op at the current version', () => {
        const data = { gampo_credits: '100' }
        expect(migrateSaveData(data, SAVE_VERSION)).toEqual(data)
    })

    it('migrateSaveData tolerates missing/old version without throwing', () => {
        expect(migrateSaveData({ gampo_x: '1' }, 0)).toEqual({ gampo_x: '1' })
        expect(migrateSaveData(null, undefined)).toEqual({})
    })
})
