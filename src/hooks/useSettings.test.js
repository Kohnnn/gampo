import { afterEach, describe, expect, it, vi } from 'vitest'

const SETTINGS_KEY = 'gampo_settings_v1'
const LEGACY_KEY = 'gampo_reduce_motion'

function installEnvironment(entries = {}, { failCanonicalWrite = false } = {}) {
    const store = new Map(Object.entries(entries))
    const calls = { remove: 0, set: 0, toggle: 0 }
    globalThis.localStorage = {
        get length() { return store.size },
        key: (index) => Array.from(store.keys())[index] ?? null,
        getItem: (key) => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => {
            calls.set += 1
            if (failCanonicalWrite && key === SETTINGS_KEY) throw new Error('write failed')
            store.set(key, String(value))
        },
        removeItem: (key) => {
            calls.remove += 1
            store.delete(key)
        },
        clear: () => store.clear(),
    }
    globalThis.document = {
        documentElement: {
            dataset: {},
            style: { setProperty() {}, removeProperty() {} },
            classList: { toggle() { calls.toggle += 1 } },
        },
    }
    return { calls, store }
}

async function loadSettings(entries, options) {
    const environment = installEnvironment(entries, options)
    vi.resetModules()
    return { ...environment, settings: await import('./useSettings') }
}

afterEach(() => {
    vi.doUnmock('react')
    vi.resetModules()
    delete globalThis.document
    delete globalThis.localStorage
})

describe('useSettings', () => {
    it('exposes accent and density catalogs', async () => {
        const { settings } = await loadSettings()
        expect(settings.ACCENT_THEMES.length).toBeGreaterThanOrEqual(6)
        expect(settings.DENSITIES.map(d => d.id)).toEqual(['cozy', 'compact'])
    })

    it('persists preference changes', async () => {
        const { settings } = await loadSettings()
        settings.setAccent('violet')
        settings.setDensity('compact')
        settings.setHaptics(false)
        settings.setQuickSpin(true)
        settings.setAnimations(false)
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY))
        expect(saved).toMatchObject({ accent: 'violet', density: 'compact', haptics: false, quickSpin: true, animations: false })
    })

    it('normalises invalid density to cozy', async () => {
        const { settings } = await loadSettings()
        settings.setDensity('nonsense')
        expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)).density).toBe('cozy')
    })

    it('applies settings to the document element', async () => {
        const { settings } = await loadSettings()
        const toggles = []
        let property = null
        document.documentElement.classList.toggle = (name, value) => toggles.push([name, value])
        document.documentElement.style.setProperty = (name, value) => { property = [name, value] }
        settings.applySettingsToDom({ accent: 'azure', density: 'compact', reduceMotion: true, animations: true, quickSpin: true })
        expect(document.documentElement.dataset.density).toBe('compact')
        expect(toggles).toContainEqual(['gampo-reduce-motion', true])
        expect(toggles).toContainEqual(['gampo-no-animations', false])
        expect(document.documentElement.dataset.quickSpin).toBe('on')
        expect(property).toEqual(['--app-accent', '#2bb3ff'])
    })

    it('keeps an own canonical false reduceMotion value over legacy raw 1', async () => {
        const { settings } = await loadSettings({ [SETTINGS_KEY]: JSON.stringify({ reduceMotion: false }), [LEGACY_KEY]: '1' })
        settings.setReduceMotion(value => value)
        expect(localStorage.getItem(SETTINGS_KEY)).toBe(JSON.stringify({ reduceMotion: false }))
        expect(localStorage.getItem(LEGACY_KEY)).toBe('1')
    })

    it('merges raw legacy 1 into a valid partial canonical object without losing normalized fields', async () => {
        const canonical = { accent: 'azure', density: 'compact', haptics: false, quickSpin: true, animations: false }
        await loadSettings({ [SETTINGS_KEY]: JSON.stringify(canonical), [LEGACY_KEY]: '1' })
        expect(JSON.parse(localStorage.getItem(SETTINGS_KEY))).toEqual({ ...canonical, reduceMotion: true })
        expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
    })

    it('merges raw legacy 0 into a valid partial canonical object', async () => {
        await loadSettings({ [SETTINGS_KEY]: JSON.stringify({ accent: 'violet' }), [LEGACY_KEY]: '0' })
        expect(JSON.parse(localStorage.getItem(SETTINGS_KEY))).toEqual({ accent: 'violet', density: 'cozy', reduceMotion: false, haptics: true, quickSpin: false, animations: true })
        expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
    })

    it('migrates absent canonical state from raw legacy 1', async () => {
        await loadSettings({ [LEGACY_KEY]: '1' })
        expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)).reduceMotion).toBe(true)
        expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
    })

    it('migrates absent canonical state from raw legacy 0', async () => {
        await loadSettings({ [LEGACY_KEY]: '0' })
        expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)).reduceMotion).toBe(false)
        expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
    })

    it('does not eagerly write canonical state for missing or invalid legacy data', async () => {
        const missing = await loadSettings()
        expect(missing.store.has(SETTINGS_KEY)).toBe(false)
        const invalid = await loadSettings({ [LEGACY_KEY]: 'yes' })
        expect(invalid.store.has(SETTINGS_KEY)).toBe(false)
        expect(localStorage.getItem(LEGACY_KEY)).toBe('yes')
    })

    it.each(['{', 'null', '[]'])('keeps malformed present canonical %j at defaults without consuming legacy', async (canonical) => {
        const { settings, store } = await loadSettings({ [SETTINGS_KEY]: canonical, [LEGACY_KEY]: '1' })
        settings.setReduceMotion(value => value)
        expect(store.get(SETTINGS_KEY)).toBe(canonical)
        expect(store.get(LEGACY_KEY)).toBe('1')
        settings.resetSettings()
        expect(store.has(SETTINGS_KEY)).toBe(false)
        expect(store.has(LEGACY_KEY)).toBe(false)
    })

    it('retains legacy state when absent canonical migration cannot persist', async () => {
        const { store } = await loadSettings({ [LEGACY_KEY]: '1' }, { failCanonicalWrite: true })
        expect(store.has(SETTINGS_KEY)).toBe(false)
        expect(store.get(LEGACY_KEY)).toBe('1')
    })

    it('retains legacy state when partial canonical migration cannot persist', async () => {
        const { store } = await loadSettings({ [SETTINGS_KEY]: JSON.stringify({ accent: 'gold' }), [LEGACY_KEY]: '0' }, { failCanonicalWrite: true })
        expect(store.get(SETTINGS_KEY)).toBe(JSON.stringify({ accent: 'gold' }))
        expect(store.get(LEGACY_KEY)).toBe('0')
    })

    it('removes both settings keys on reset without legacy resurrection', async () => {
        const { settings, store } = await loadSettings({ [SETTINGS_KEY]: JSON.stringify({ reduceMotion: false }), [LEGACY_KEY]: '1' })
        settings.resetSettings()
        expect(store.has(SETTINGS_KEY)).toBe(false)
        expect(store.has(LEGACY_KEY)).toBe(false)
        vi.resetModules()
        const reloaded = await import('./useSettings')
        reloaded.setReduceMotion(value => value)
        expect(store.has(SETTINGS_KEY)).toBe(false)
    })

    it('resolves literal and functional reduce-motion updates against the current boolean', async () => {
        const { settings } = await loadSettings()
        settings.setReduceMotion(1)
        expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)).reduceMotion).toBe(true)
        settings.setReduceMotion(value => !value)
        expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)).reduceMotion).toBe(false)
    })

    it('does nothing for equal reduce-motion values and releases listeners after cleanup', async () => {
        const { calls } = installEnvironment({ [SETTINGS_KEY]: JSON.stringify({ reduceMotion: false }) })
        let cleanup
        const force = vi.fn()
        vi.resetModules()
        vi.doMock('react', async () => {
            const actual = await vi.importActual('react')
            return { ...actual, useState: () => [0, force], useEffect: (effect) => { cleanup = effect() } }
        })
        const settings = await import('./useSettings')
        settings.useSettings()
        calls.set = 0
        calls.toggle = 0
        settings.setReduceMotion(false)
        expect(calls.set).toBe(0)
        expect(calls.toggle).toBe(0)
        expect(force).not.toHaveBeenCalled()
        settings.setReduceMotion(true)
        expect(force).toHaveBeenCalledTimes(1)
        cleanup()
        settings.setReduceMotion(false)
        expect(force).toHaveBeenCalledTimes(1)
    })
})
