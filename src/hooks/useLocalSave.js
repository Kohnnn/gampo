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
import { snapshotGampoState, restoreGampoState, validateRestoreData, MAX_SAVE_BYTES } from '../utils/storage'
import { restoreSportsbookTickets } from '../sportsbook/sportsbookPersistence'

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

// Inspect descriptors before serializing: never invoke accessors or toJSON.
function plainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value))
}

function jsonSafe(value, ancestors = new Set()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return
    if (typeof value === 'number' && Number.isFinite(value)) return
    if (typeof value !== 'object' || (!Array.isArray(value) && !plainObject(value)) || ancestors.has(value)) throw new Error('Invalid save descriptors.')
    if (Array.isArray(value) && Object.getPrototypeOf(value) !== Array.prototype) throw new Error('Custom array prototype.')
    ancestors.add(value)
    const keys = Reflect.ownKeys(value)
    if (Array.isArray(value) && keys.length !== value.length + 1) throw new Error('Sparse/custom array.')
    for (const key of keys) {
        if (Array.isArray(value) && key === 'length') continue
        if (Array.isArray(value) && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) throw new Error('Custom array property.')
        const descriptor = Object.getOwnPropertyDescriptor(value, key)
        if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype', 'toJSON'].includes(key) || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error('Invalid save descriptors.')
        jsonSafe(descriptor.value, ancestors)
    }
    ancestors.delete(value)
}

function saveError(code, message) {
    return Object.assign(new Error(message), { validationFailed: true, code })
}

/** Shared envelope/domain validation. `textAdmitted` is private: importSaveText
 *  has already measured the original decoded text, so it must not re-measure the
 *  canonical reserialization. Public entrypoints never pass it — direct objects
 *  and raw maps always take the canonical JSON.stringify byte rule. */
function checkSavePayload(payload, textAdmitted) {
    const fail = (code, error) => ({ ok: false, code, error })
    try {
        if (!plainObject(payload)) return fail('invalidEnvelope', 'Not a valid save file.')
        jsonSafe(payload)
    } catch {
        return fail('invalidEnvelope', 'Not a valid save file.')
    }
    if (payload.app !== SAVE_APP || payload.kind !== SAVE_KIND) return fail('invalidEnvelope', 'This file is not a GamPo save.')
    if (Object.hasOwn(payload, 'version') && (!Number.isSafeInteger(payload.version) || payload.version < 0 || payload.version > SAVE_VERSION)) return fail('unsupportedVersion', 'Save file is from an unsupported or newer version of GamPo.')
    if ((Object.hasOwn(payload, 'complete') && (typeof payload.complete !== 'boolean' || !payload.complete)) || (Object.hasOwn(payload, 'readErrors') && (!Array.isArray(payload.readErrors) || payload.readErrors.length > 0))) return fail('incompleteEnvelope', 'This save declares incomplete data and cannot be restored.')
    try {
        if (!textAdmitted && new TextEncoder().encode(JSON.stringify(payload)).length > MAX_SAVE_BYTES) return fail('saveTooLarge', 'GamPo save exceeds the 32 MiB limit.')
        validateRestoreData(payload.data)
    } catch (error) {
        return fail(error.code || 'invalidRestoreData', error.message || 'Invalid GamPo save data.')
    }
    const data = payload.data
    if (Object.hasOwn(data, 'gampo_credits')) {
        const raw = data.gampo_credits
        if (!raw.trim() || !Number.isFinite(Number(raw)) || Number(raw) < 0) return fail('invalidCredits', 'Save has invalid credits.')
    }
    if (Object.hasOwn(data, 'gampo_pf_state')) {
        try {
            const state = JSON.parse(data.gampo_pf_state)
            const hex = value => typeof value === 'string' && /^[0-9a-f]{32}$/.test(value)
            if (!plainObject(state) || Object.keys(state).sort().join(',') !== 'clientSeed,nonce,previousServerSeed,serverSeed' || !hex(state.serverSeed) || (state.previousServerSeed !== null && !hex(state.previousServerSeed)) || typeof state.clientSeed !== 'string' || !state.clientSeed.trim() || state.clientSeed !== state.clientSeed.trim() || !Number.isSafeInteger(state.nonce) || state.nonce < 0 || state.nonce >= Number.MAX_SAFE_INTEGER) throw new Error('Invalid RNG state.')
        } catch {
            return fail('invalidRng', 'Save has invalid RNG state.')
        }
    }
    if (Object.hasOwn(data, 'gampo_sportsbook_tickets_v2') || Object.hasOwn(data, 'gampo_sportsbook_tickets_v1')) {
        // The sportsbook parser predates this lane and can throw on nested records
        // (e.g. selections:{}) before its own container guards. Contain that here so
        // this boundary keeps its stable failure code instead of leaking a TypeError.
        try {
            const result = restoreSportsbookTickets(data.gampo_sportsbook_tickets_v2 ?? null, data.gampo_sportsbook_tickets_v1 ?? null)
            if (!result.ok || result.quarantine.length > 0) return fail('invalidSportsbook', 'Save has invalid or quarantined sportsbook tickets.')
        } catch {
            return fail('invalidSportsbook', 'Save has invalid or quarantined sportsbook tickets.')
        }
    }
    // Container checks only: no per-record/lifetime-completeness claim.
    for (const key of ['gampo_cases_drops_v2', 'gampo_cases_pokedex', 'gampo_cases_stats_v1']) {
        if (!Object.hasOwn(data, key)) continue
        try {
            const value = JSON.parse(data[key])
            if (key === 'gampo_cases_drops_v2' ? !Array.isArray(value) : !plainObject(value)) throw new Error('Invalid Cases container.')
        } catch {
            return fail('invalidCasesShape', 'Save has invalid Cases containers.')
        }
    }
    return { ok: true }
}

/** Pure original-envelope validation. Legacy missing diagnostics prove nothing.
 *  Public entrypoint: direct objects always take the canonical byte rule. */
export function validateSavePayload(payload) {
    return checkSavePayload(payload, false)
}

function applyCheckedPayload(payload, textAdmitted, options) {
    const check = checkSavePayload(payload, textAdmitted)
    if (!check.ok) throw saveError(check.code, check.error)
    const fromVersion = Number.isFinite(payload.version) ? payload.version : SAVE_VERSION
    const data = migrateSaveData(payload.data, fromVersion)
    validateRestoreData(data)
    return restoreGampoState(data, options)
}

/** Apply a validated payload to localStorage. Returns { restored, skipped } or throws.
 *  Public entrypoint: canonical byte rule always applies. */
export function applySavePayload(payload, options) {
    return applyCheckedPayload(payload, false, options)
}

export async function importSaveText(text, options) {
    if (typeof text !== 'string') throw saveError('invalidEnvelope', 'Not a valid save file.')
    if (new TextEncoder().encode(text).length > MAX_SAVE_BYTES) throw saveError('saveTooLarge', 'GamPo save exceeds the 32 MiB limit.')
    let parsed
    try {
        parsed = JSON.parse(text)
    } catch {
        throw saveError('invalidJson', 'Could not read save file (invalid JSON).')
    }
    const result = applyCheckedPayload(parsed, true, options)
    if (!result.declined && typeof window !== 'undefined' && window.location && options?.reload !== false) {
        window.location.reload()
    }
    return result
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
        if (typeof file !== 'string' && file.size > MAX_SAVE_BYTES) throw saveError('saveTooLarge', 'GamPo save exceeds the 32 MiB limit.')
        const text = typeof file === 'string' ? file : await file.text()
        return importSaveText(text, options)
    }, [])

    return {
        exportSave,
        importSave,
        buildSavePayload,
        validateSavePayload,
    }
}
