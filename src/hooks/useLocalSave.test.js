import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
    SAVE_VERSION,
    buildSavePayload,
    validateSavePayload,
    applySavePayload,
    migrateSaveData,
    importSaveText,
} from './useLocalSave'
import { writeJson, writeRaw, readJson, readRaw } from '../utils/storage'
import { restoreSportsbookTickets } from '../sportsbook/sportsbookPersistence'
import { createPracticeTicket, makeBetSlipSelection } from '../sportsbook/sportsbookState'

function installStorage(initial = {}, controls = {}) {
    const store = new Map(Object.entries(initial))
    const calls = []
    globalThis.localStorage = {
        get length() { calls.push(['length']); return store.size },
        key(i) { calls.push(['key', i]); return Array.from(store.keys())[i] ?? null },
        getItem(key) { calls.push(['getItem', key]); return store.has(key) ? store.get(key) : null },
        setItem(key, value) {
            calls.push(['setItem', key, value])
            if (controls.setItem?.(key, String(value))) throw new Error(`set ${key} failed`)
            store.set(key, String(value))
        },
        removeItem(key) {
            calls.push(['removeItem', key])
            if (controls.removeItem?.(key)) throw new Error(`remove ${key} failed`)
            store.delete(key)
        },
        clear() { calls.push(['clear']); store.clear() },
    }
    return { calls, snapshot: () => Object.fromEntries(store) }
}

function saveText(data) {
    return JSON.stringify({ app: 'gampo', kind: 'save', version: SAVE_VERSION, data })
}

beforeEach(() => {
    installStorage()
    globalThis.window = { location: { reload: vi.fn() } }
})

describe('pure export snapshot', () => {
    it('singleSnapshotCount: one actual build owns the count and raw bytes', () => {
        let enumerations = 0
        installStorage({ gampo_null: 'null', gampo_absent_control: 'present', foreign: 'keep' })
        const originalKey = localStorage.key
        localStorage.key = (index) => {
            if (index === 0) enumerations += 1
            return originalKey(index)
        }
        const payload = buildSavePayload()
        expect(payload.data).toEqual({ gampo_null: 'null', gampo_absent_control: 'present' })
        expect(payload.keyCount).toBe(Object.keys(payload.data).length)
        expect(payload.keyCount).toBe(2)
        expect(enumerations).toBe(1)
        expect(Object.hasOwn(payload.data, 'gampo_absent')).toBe(false)
        expect(JSON.parse(JSON.stringify(payload)).data.gampo_null).toBe('null')
    })

    it.each(['unavailable', 'key', 'length', 'getItem', 'actual-null'])('snapshot failure %s cannot build an envelope', (fault) => {
        installStorage({ gampo_first: 'one', gampo_second: 'two' })
        if (fault === 'unavailable') globalThis.localStorage = undefined
        if (fault === 'key') localStorage.key = () => { throw new Error('key failed') }
        if (fault === 'length') Object.defineProperty(localStorage, 'length', { get() { throw new Error('length failed') } })
        if (fault === 'getItem') localStorage.getItem = () => { throw new Error('read failed') }
        if (fault === 'actual-null') localStorage.getItem = () => null
        expect(() => buildSavePayload()).toThrow()
    })

    it('emptySnapshot is a legitimate export, not a certified legacy envelope', () => {
        const payload = buildSavePayload()
        expect(payload.data).toEqual({})
        expect(payload.keyCount).toBe(0)
        expect(Object.keys(payload).sort()).toEqual(['app', 'data', 'exportedAt', 'keyCount', 'kind', 'version'])
    })
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
        const result = applySavePayload(payload, { confirmRemoval: () => true })
        expect(result.restored).toBe(2)
        expect(readJson('gampo_credits')).toBe(1234)
        expect(readRaw('gampo_xp_state')).toBe(JSON.stringify({ totalXp: 42 }))
    })

    it('throws a friendly error on a foreign file', () => {
        expect(() => applySavePayload({ app: 'evil' })).toThrow(/not a GamPo save/i)
    })

    it('reloads once after a successful import', async () => {
        await expect(importSaveText(saveText({ gampo_credits: '2000' }), { confirmRemoval: () => true })).resolves.toEqual({ restored: 1, skipped: 0 })
        expect(window.location.reload).toHaveBeenCalledTimes(1)
    })

    it('does not reload when reload is disabled', async () => {
        await expect(importSaveText(saveText({ gampo_credits: '2000' }), { reload: false, confirmRemoval: () => true })).resolves.toEqual({ restored: 1, skipped: 0 })
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
        await expect(importSaveText(saveText({ gampo_new: 'new' }), { confirmRemoval: () => true })).rejects.toMatchObject({
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
        await expect(importSaveText(saveText({ gampo_new: 'new' }), { confirmRemoval: () => true })).rejects.toMatchObject({
            rollbackFailed: true,
        })
        expect(window.location.reload).not.toHaveBeenCalled()
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

const LIMIT = 33554432
const envelope = (data = {}, extra = {}) => ({ app: 'gampo', kind: 'save', version: 1, data, ...extra })
const rng = { serverSeed: '0123456789abcdef0123456789abcdef', previousServerSeed: null, clientSeed: 'my client seed', nonce: 0 }
const affirmative = { confirmRemoval: () => true }
const utf8Bytes = text => new TextEncoder().encode(text).length

describe('save admission', () => {
    function rejectBeforeRead(payload, code) {
        const initial = { gampo_old: 'old', foreign: 'keep' }
        const fixture = installStorage(initial)
        expect(validateSavePayload(payload)).toMatchObject({ ok: false, code })
        let caught
        try { applySavePayload(payload, affirmative) } catch (error) { caught = error }
        expect(caught).toMatchObject({ validationFailed: true, code })
        expect(fixture.calls).toEqual([])
        expect(fixture.snapshot()).toEqual(initial)
        expect(window.location.reload).not.toHaveBeenCalled()
    }

    it('invalidEnvelope: original descriptors never execute getters or toJSON', () => {
        let invoked = 0
        const getter = envelope()
        Object.defineProperty(getter, 'data', { enumerable: true, get() { invoked += 1; return {} } })
        const rawGetter = {}
        Object.defineProperty(rawGetter, 'gampo_x', { enumerable: true, get() { invoked += 1; return '1' } })
        const cycle = envelope(); cycle.extra = cycle
        const custom = envelope(); custom.toJSON = () => { invoked += 1; return envelope() }
        const symbol = envelope(); symbol[Symbol('hidden')] = 'bad'
        const hidden = envelope(); Object.defineProperty(hidden, 'extra', { value: 'hidden' })
        for (const payload of [getter, envelope(rawGetter), cycle, custom, symbol, hidden, [], new Date(), Object.assign(new (class Save {})(), envelope()), envelope({}, { extra: undefined }), envelope({}, { extra: NaN }), envelope({}, { extra: 1n }), envelope({}, { extra: new Date() }), JSON.parse('{"app":"gampo","kind":"save","data":{},"__proto__":{}}')]) rejectBeforeRead(payload, 'invalidEnvelope')
        expect(invoked).toBe(0)
    })

    it.each([[null], [[]], [{ foreign: 'bad' }], [{ gampo_x: 1 }]])('invalidRawMap %j before read', data => {
        rejectBeforeRead(envelope(data), 'invalidRestoreData')
    })

    it.each([-1, 1.5, '1', NaN, Infinity, Number.MAX_SAFE_INTEGER, null])('invalidEnvelope version %s', version => {
        rejectBeforeRead(envelope({}, { version }), typeof version === 'number' && !Number.isFinite(version) ? 'invalidEnvelope' : 'unsupportedVersion')
    })

    it('explicitIncomplete and wrong diagnostic types cannot apply', () => {
        for (const extra of [{ complete: false }, { readErrors: ['gampo_x'] }, { complete: 'true' }, { readErrors: {} }]) rejectBeforeRead(envelope({}, extra), 'incompleteEnvelope')
    })

    it('legacyCompletenessAbsent is unproven ordinary input; missing/older versions migrate', () => {
        for (const payload of [envelope({ gampo_x: '1' }), envelope({ gampo_x: '1' }, { complete: true, readErrors: [] }), { app: 'gampo', kind: 'save', data: { gampo_x: '1' } }, envelope({ gampo_x: '1' }, { version: 0 })]) {
            installStorage({ foreign: 'keep' })
            expect(validateSavePayload(payload)).toEqual({ ok: true })
            expect(applySavePayload(payload, affirmative)).toEqual({ restored: 1, skipped: 0 })
        }
    })

    it.each(['Infinity', 'NaN', '-1', '', '  ', '1e999'])('invalidCredits %j', raw => {
        rejectBeforeRead(envelope({ gampo_credits: raw }), 'invalidCredits')
    })

    it.each(['0', ' 12.5 ', '1e2', '0.0001'])('credits preserve accepted raw bytes %j', raw => {
        const fixture = installStorage({ foreign: 'keep' })
        expect(applySavePayload(envelope({ gampo_credits: raw }), affirmative).restored).toBe(1)
        expect(fixture.snapshot()).toEqual({ gampo_credits: raw, foreign: 'keep' })
    })

    it('invalidRng: exact producer fields, seeds, client text and next-safe nonce', () => {
        for (const value of [{ ...rng, serverSeed: 'a'.repeat(64) }, { ...rng, serverSeed: 'A'.repeat(32) }, { ...rng, previousServerSeed: 42 }, { ...rng, clientSeed: '  ' }, { ...rng, clientSeed: ' untrimmed ' }, { ...rng, nonce: -1 }, { ...rng, nonce: 0.5 }, { ...rng, nonce: Number.MAX_SAFE_INTEGER }, { ...rng, nonce: Number.MAX_SAFE_INTEGER + 1 }, { ...rng, extra: true }, { ...rng, nonce: undefined }]) rejectBeforeRead(envelope({ gampo_pf_state: JSON.stringify(value) }), 'invalidRng')
        rejectBeforeRead(envelope({ gampo_pf_state: '{bad' }), 'invalidRng')
        for (const state of [rng, { ...rng, previousServerSeed: 'f'.repeat(32), nonce: Number.MAX_SAFE_INTEGER - 1 }]) {
            const fixture = installStorage()
            const raw = JSON.stringify(state)
            expect(applySavePayload(envelope({ gampo_pf_state: raw }), affirmative).restored).toBe(1)
            expect(fixture.snapshot()).toEqual({ gampo_pf_state: raw })
        }
    })

    it('sportsbookMalformed and sportsbookQuarantine reject actual validator failures', () => {
        const malformed = '{bad'
        const quarantine = JSON.stringify({ version: 2, savedAt: 1, tickets: [{ id: 'bad-ticket' }] })
        expect(restoreSportsbookTickets(malformed, null).ok).toBe(false)
        expect(restoreSportsbookTickets(quarantine, null)).toMatchObject({ ok: true, quarantine: [expect.any(Object)] })
        for (const raw of [malformed, quarantine]) rejectBeforeRead(envelope({ gampo_sportsbook_tickets_v2: raw, gampo_sportsbook_tickets_v1: '[]' }), 'invalidSportsbook')
        rejectBeforeRead(envelope({ gampo_sportsbook_tickets_v1: '[{}]' }), 'invalidSportsbook')
    })

    it('sportsbookNestedThrow returns invalidSportsbook with zero access instead of leaking TypeError', async () => {
        const nested = JSON.stringify({ version: 2, savedAt: 1, tickets: [{ selections: 42 }] })
        expect(() => restoreSportsbookTickets(nested, null)).toThrow(TypeError)
        const fixture = installStorage({ gampo_old: 'old', foreign: 'keep' })
        expect(validateSavePayload(envelope({ gampo_sportsbook_tickets_v2: nested }))).toMatchObject({ ok: false, code: 'invalidSportsbook' })
        let caught
        try { applySavePayload(envelope({ gampo_sportsbook_tickets_v2: nested }), affirmative) } catch (error) { caught = error }
        expect(caught).toMatchObject({ validationFailed: true, code: 'invalidSportsbook' })
        await expect(importSaveText(saveText({ gampo_sportsbook_tickets_v2: nested }), { reload: false })).rejects.toMatchObject({ validationFailed: true, code: 'invalidSportsbook' })
        expect(fixture.calls).toEqual([])
        expect(fixture.snapshot()).toEqual({ gampo_old: 'old', foreign: 'keep' })
        expect(window.location.reload).not.toHaveBeenCalled()
    })

    it('sportsbookValid preserves raw V2/V1 bytes and V2 precedence', () => {
        const raw = ' {"version":2,"savedAt":1,"tickets":[]} '
        for (const data of [{}, { gampo_sportsbook_tickets_v2: raw }, { gampo_sportsbook_tickets_v1: ' [] ' }, { gampo_sportsbook_tickets_v2: raw, gampo_sportsbook_tickets_v1: 'ignored malformed legacy' }]) {
            const fixture = installStorage({ foreign: 'keep' })
            expect(applySavePayload(envelope(data), affirmative).restored).toBe(Object.keys(data).length)
            expect(fixture.snapshot()).toEqual({ ...data, foreign: 'keep' })
        }
    })

    it('invalidCasesShape and casesContainerControls prove shape, not lifetime totals', () => {
        for (const key of ['gampo_cases_drops_v2', 'gampo_cases_pokedex', 'gampo_cases_stats_v1']) {
            for (const raw of ['{bad', 'null', '42', key === 'gampo_cases_drops_v2' ? '{}' : '[]']) rejectBeforeRead(envelope({ [key]: raw }), 'invalidCasesShape')
        }
        const data = { gampo_cases_drops_v2: ' [] ', gampo_cases_pokedex: ' {"unproven":true} ', gampo_cases_stats_v1: '{}' }
        const fixture = installStorage({ foreign: 'keep' })
        expect(applySavePayload(envelope(data), affirmative).restored).toBe(3)
        expect(fixture.snapshot()).toEqual({ ...data, foreign: 'keep' })
    })

    it('sizeTextEqual / sizeTextPlusOne count entire whitespace-padded text', async () => {
        const base = JSON.stringify(envelope())
        const exact = base + ' '.repeat(LIMIT - utf8Bytes(base))
        expect(utf8Bytes(exact)).toBe(33554432)
        await expect(importSaveText(exact, { reload: false })).resolves.toEqual({ restored: 0, skipped: 0 })
        const fixture = installStorage({ gampo_old: 'old', foreign: 'keep' })
        await expect(importSaveText(exact + ' ')).rejects.toMatchObject({ validationFailed: true, code: 'saveTooLarge' })
        expect(fixture.calls).toEqual([])
        expect(fixture.snapshot()).toEqual({ gampo_old: 'old', foreign: 'keep' })
    })

    it('sizeMultibyte and escaping-heavy text use original UTF-8, not JS length/data size', async () => {
        const multibyte = JSON.stringify(envelope({}, { padding: 'é'.repeat(LIMIT / 2) }))
        expect(multibyte.length).toBeLessThan(LIMIT)
        const fixture = installStorage({ foreign: 'keep' })
        await expect(importSaveText(multibyte)).rejects.toMatchObject({ code: 'saveTooLarge', validationFailed: true })
        const escaped = JSON.stringify(envelope({}, { padding: '\\'.repeat(LIMIT / 2) }))
        await expect(importSaveText(escaped)).rejects.toMatchObject({ code: 'saveTooLarge', validationFailed: true })
        expect(fixture.calls).toEqual([])
    })

    it('directObjectSize exact/+1; sample3617294 compatibility floor', () => {
        const empty = envelope({}, { padding: '' })
        const overhead = utf8Bytes(JSON.stringify(empty))
        expect(validateSavePayload({ ...empty, padding: 'x'.repeat(LIMIT - overhead) })).toEqual({ ok: true })
        rejectBeforeRead({ ...empty, padding: 'x'.repeat(LIMIT - overhead + 1) }, 'saveTooLarge')
        const sample = envelope({ gampo_credits: '1000', gampo_pf_state: JSON.stringify(rng), gampo_cases_drops_v2: '[]', gampo_cases_pokedex: '{}', gampo_cases_stats_v1: '{}', gampo_sportsbook_tickets_v2: '{"version":2,"savedAt":1,"tickets":[]}' }, { padding: '' })
        sample.padding = 'x'.repeat(3617294 - utf8Bytes(JSON.stringify(sample)))
        expect(utf8Bytes(JSON.stringify(sample))).toBe(3617294)
        expect(validateSavePayload(sample)).toEqual({ ok: true })
    })

    it('textAdmissionUsesOriginalBytes: literal text under limit whose canonical form exceeds it still imports', async () => {
        const count = 1600000
        const text = `{"app":"gampo","kind":"save","data":{},"meta":[${'1e20,'.repeat(count - 1)}1e20]}`
        expect(utf8Bytes(text)).toBeLessThan(LIMIT)
        expect(utf8Bytes(JSON.stringify(JSON.parse(text)))).toBeGreaterThan(LIMIT)
        const fixture = installStorage({ foreign: 'keep' })
        await expect(importSaveText(text, { reload: false })).resolves.toEqual({ restored: 0, skipped: 0 })
        expect(fixture.snapshot()).toEqual({ foreign: 'keep' })
        rejectBeforeRead(JSON.parse(text), 'saveTooLarge')
    })

    it('publicAdmissionCannotBypassCanonicalSize: options cannot smuggle a text-size flag', () => {
        const count = 1600000
        const payload = JSON.parse(`{"app":"gampo","kind":"save","data":{},"meta":[${'1e20,'.repeat(count - 1)}1e20]}`)
        expect(utf8Bytes(JSON.stringify(payload))).toBeGreaterThan(LIMIT)
        const fixture = installStorage({ foreign: 'keep' })
        for (const options of [undefined, {}, { textSized: true }, { textAdmitted: true }, { textSized: true, confirmRemoval: () => true }]) {
            expect(validateSavePayload(payload, options)).toMatchObject({ ok: false, code: 'saveTooLarge' })
            let caught
            try { applySavePayload(payload, options) } catch (error) { caught = error }
            expect(caught).toMatchObject({ validationFailed: true, code: 'saveTooLarge' })
        }
        expect(fixture.calls).toEqual([])
        expect(fixture.snapshot()).toEqual({ foreign: 'keep' })
    })
})

describe('actual import decline and conflict', () => {
    it('decline makes zero writes and never reloads', async () => {
        const fixture = installStorage({ gampo_old: 'old', foreign: 'keep' })
        await expect(importSaveText(saveText({}))).resolves.toEqual({ restored: 0, skipped: 0, declined: true })
        expect(fixture.snapshot()).toEqual({ gampo_old: 'old', foreign: 'keep' })
        expect(fixture.calls.filter(([op]) => ['removeItem', 'setItem', 'clear'].includes(op))).toEqual([])
        expect(window.location.reload).not.toHaveBeenCalled()
    })

    it('beforeimageConflict keeps independently introduced bytes without reload', async () => {
        const fixture = installStorage({ gampo_old: 'old', foreign: 'keep' })
        await expect(importSaveText(saveText({ gampo_new: 'new' }), { confirmRemoval() {
            localStorage.setItem('gampo_old', 'concurrent')
            fixture.calls.length = 0
            return true
        } })).rejects.toMatchObject({ conflict: true })
        expect(fixture.snapshot()).toEqual({ gampo_old: 'concurrent', foreign: 'keep' })
        expect(fixture.calls.filter(([op]) => ['removeItem', 'setItem', 'clear'].includes(op))).toEqual([])
        expect(window.location.reload).not.toHaveBeenCalled()
    })

    it('rawNullRoundTrip preserves raw literal null through actual apply', () => {
        const fixture = installStorage({ gampo_null: 'null', foreign: 'keep' })
        const payload = buildSavePayload()
        expect(applySavePayload(payload)).toEqual({ restored: 1, skipped: 0 })
        expect(fixture.snapshot()).toEqual({ gampo_null: 'null', foreign: 'keep' })
    })
})

describe('admission descriptor and ticket controls', () => {
    it('rejects sparse/custom JSON arrays without invoking their properties', () => {
        const sparse = new Array(1)
        const custom = new Array(1); custom.extra = 'not an array element'
        for (const extra of [sparse, custom]) {
            const fixture = installStorage({ foreign: 'keep' })
            expect(validateSavePayload(envelope({}, { extra }))).toMatchObject({ ok: false, code: 'invalidEnvelope' })
            expect(fixture.calls).toEqual([])
        }
    })

    it('actual nonempty valid V2/V1 ticket controls retain every submitted byte', () => {
        const selection = makeBetSlipSelection({
            event: { id: 'event-1', canonicalEventId: 'canonical-1', home: 'Home', away: 'Away', status: 'prematch', sportId: 'soccer', leagueId: 'league' },
            selection: { id: 'selection-1', canonicalEventId: 'canonical-1', marketId: 'winner', outcome: 'home', decimalOdds: 2, bookmaker: 'Book', provider: 'provider', providerEventId: 'provider-event', sourceContext: { group: 'odds' }, observedAt: '2026-09-02T12:00:00.000Z', freshness: 'current', submittable: true, ineligibilityReason: null, suspended: false },
        })
        const ticket = createPracticeTicket({ selections: [selection], stake: 10, seed: 'save-control' })
        for (const [key, raw] of [['gampo_sportsbook_tickets_v2', JSON.stringify({ version: 2, savedAt: 1, tickets: [ticket] }, null, 2)], ['gampo_sportsbook_tickets_v1', JSON.stringify([ticket], null, 2)]]) {
            const restored = restoreSportsbookTickets(key.endsWith('v2') ? raw : null, key.endsWith('v1') ? raw : null)
            expect(restored).toMatchObject({ ok: true, quarantine: [] })
            expect(restored.tickets).toHaveLength(1)
            const fixture = installStorage({ foreign: 'keep' })
            expect(applySavePayload(envelope({ [key]: raw }), affirmative)).toEqual({ restored: 1, skipped: 0 })
            expect(fixture.snapshot()).toEqual({ [key]: raw, foreign: 'keep' })
        }
    })
})

describe('original serialization boundary', () => {
    it('never executes inherited custom array serialization hooks', () => {
        let invoked = 0
        const custom = []
        Object.setPrototypeOf(custom, { toJSON() { invoked += 1; return [] } })
        const fixture = installStorage({ foreign: 'keep' })
        expect(validateSavePayload(envelope({}, { extra: custom }))).toMatchObject({ ok: false, code: 'invalidEnvelope' })
        expect(invoked).toBe(0)
        expect(fixture.calls).toEqual([])
    })
})
