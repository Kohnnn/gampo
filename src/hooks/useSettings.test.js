import { describe, it, expect, beforeEach } from 'vitest'
import {
    ACCENT_THEMES,
    DENSITIES,
    setAccent,
    setDensity,
    setReduceMotion,
    resetSettings,
    applySettingsToDom,
    useSettings,
} from './useSettings'
import { readJson } from '../utils/storage'

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
    // jsdom-free: stub a minimal documentElement
    globalThis.document = {
        documentElement: {
            dataset: {},
            style: { setProperty() {}, removeProperty() {} },
            classList: { toggle() {} },
        },
    }
    resetSettings()
})

describe('useSettings', () => {
    it('exposes accent and density catalogs', () => {
        expect(ACCENT_THEMES.length).toBeGreaterThanOrEqual(6)
        expect(DENSITIES.map(d => d.id)).toEqual(['cozy', 'compact'])
    })

    it('persists accent changes', () => {
        setAccent('violet')
        expect(readJson('gampo_settings_v1').accent).toBe('violet')
    })

    it('persists density and reduce-motion', () => {
        setDensity('compact')
        setReduceMotion(true)
        const s = readJson('gampo_settings_v1')
        expect(s.density).toBe('compact')
        expect(s.reduceMotion).toBe(true)
    })

    it('normalises invalid density to cozy', () => {
        setDensity('nonsense')
        expect(readJson('gampo_settings_v1').density).toBe('cozy')
    })

    it('reset clears persisted settings', () => {
        setAccent('gold')
        resetSettings()
        expect(readJson('gampo_settings_v1', null)).toBeNull()
    })

    it('applies settings to the document element', () => {
        let toggled = null
        let prop = null
        globalThis.document.documentElement.classList.toggle = (cls, on) => { toggled = [cls, on] }
        globalThis.document.documentElement.style.setProperty = (k, v) => { prop = [k, v] }
        applySettingsToDom({ accent: 'azure', density: 'compact', reduceMotion: true })
        expect(globalThis.document.documentElement.dataset.density).toBe('compact')
        expect(toggled).toEqual(['gampo-reduce-motion', true])
        expect(prop[0]).toBe('--app-accent')
    })

    it('exposes a hook function', () => {
        expect(typeof useSettings).toBe('function')
    })
})
