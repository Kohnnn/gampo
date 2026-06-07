// useLocalSave — export/import a full snapshot of the player's local progress.
//
// No backend: this serialises every `gampo_*` localStorage key into a JSON
// file the user can download, and restores from an uploaded file. This is the
// "cloud save" alternative for a single-player, server-less simulator — the
// player owns their save file and can move it between devices/browsers.
//
// Snapshot envelope:
//   { app: 'gampo', kind: 'save', version: 1, exportedAt, keyCount, data: {...} }
// `data` maps each gampo_ key to its raw stored string (lossless round-trip).

import { useCallback } from 'react'
import { snapshotGampoState, restoreGampoState, listGampoKeys } from '../utils/storage'

export const SAVE_VERSION = 1
export const SAVE_APP = 'gampo'
export const SAVE_KIND = 'save'

// Migration registry. When the save schema changes, bump SAVE_VERSION and add
// a migrator keyed by the version it upgrades FROM. Each migrator receives the
// payload's `data` map and returns the upgraded map. Migrators run in sequence
// from the file's version up to SAVE_VERSION, so a v1 file passes through
// MIGRATIONS[1], MIGRATIONS[2], ... as needed.
const MIGRATIONS = {
    // Example shape (no-op today; v1 is current):
    // 1: (data) => ({ ...data, gampo_new_key: data.gampo_old_key }),
}

/** Upgrade a save payload's data from its version to the current SAVE_VERSION. */
export function migrateSaveData(data, fromVersion) {
    let result = data && typeof data === 'object' ? { ...data } : {}
    let v = Number.isFinite(fromVersion) ? fromVersion : SAVE_VERSION
    while (v < SAVE_VERSION) {
        const migrator = MIGRATIONS[v]
        if (typeof migrator === 'function') {
            result = migrator(result) || result
        }
        v += 1
    }
    return result
}

/** Build the JSON-serialisable save envelope. */
export function buildSavePayload() {
    const data = snapshotGampoState()
    return {
        app: SAVE_APP,
        kind: SAVE_KIND,
        version: SAVE_VERSION,
        exportedAt: new Date().toISOString(),
        keyCount: Object.keys(data).length,
        data,
    }
}

/** Validate a parsed payload before applying it. Returns { ok, error }. */
export function validateSavePayload(payload) {
    if (!payload || typeof payload !== 'object') return { ok: false, error: 'Not a valid save file.' }
    if (payload.app !== SAVE_APP || payload.kind !== SAVE_KIND) {
        return { ok: false, error: 'This file is not a GamPo save.' }
    }
    if (!payload.data || typeof payload.data !== 'object') {
        return { ok: false, error: 'Save file has no data.' }
    }
    if (typeof payload.version === 'number' && payload.version > SAVE_VERSION) {
        return { ok: false, error: 'Save file is from a newer version of GamPo.' }
    }
    return { ok: true }
}

/** Apply a validated payload to localStorage. Returns { restored, skipped } or throws. */
export function applySavePayload(payload, options) {
    const check = validateSavePayload(payload)
    if (!check.ok) throw new Error(check.error)
    const fromVersion = Number.isFinite(payload.version) ? payload.version : SAVE_VERSION
    const data = migrateSaveData(payload.data, fromVersion)
    return restoreGampoState(data, options)
}

export function useLocalSave() {
    const exportSave = useCallback((filename) => {
        const payload = buildSavePayload()
        const json = JSON.stringify(payload, null, 2)
        if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
            return json // non-browser (tests): just return the serialised string
        }
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename || `gampo-save-${stamp}.json`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
        return json
    }, [])

    const importSave = useCallback(async (file, options) => {
        const text = typeof file === 'string' ? file : await file.text()
        let parsed
        try {
            parsed = JSON.parse(text)
        } catch {
            throw new Error('Could not read save file (invalid JSON).')
        }
        const result = applySavePayload(parsed, options)
        // A reload is the simplest way to re-hydrate every module-scope hook
        // singleton from the freshly restored localStorage.
        if (typeof window !== 'undefined' && window.location && options?.reload !== false) {
            window.location.reload()
        }
        return result
    }, [])

    return {
        exportSave,
        importSave,
        keyCount: listGampoKeys().length,
        buildSavePayload,
        validateSavePayload,
    }
}
