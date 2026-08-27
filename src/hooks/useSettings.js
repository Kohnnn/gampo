// useSettings — single source of truth for player display preferences.
//
// Centralises what used to be scattered (reduce-motion in fx/index.jsx, ad-hoc
// toggles) plus new preferences: theme accent and UI density. Follows the
// module-scope singleton + listener pattern so the Header toggle, Settings
// panel, and any consumer stay in sync without a Provider.
//
// Applied to <html> so plain CSS can react:
//   document.documentElement.dataset.density   = 'cozy' | 'compact'
//   document.documentElement.dataset.accent    = '<accent id>'
//   document.documentElement.style --app-accent = '<hex>'
//   document.documentElement.classList 'gampo-reduce-motion'
//
// Storage key: gampo_settings_v1

import { useEffect, useState } from 'react'
import { readRaw, writeJson, removeKey } from '../utils/storage'

const KEY = 'gampo_settings_v1'
const LEGACY_REDUCE_MOTION_KEY = 'gampo_reduce_motion'

export const ACCENT_THEMES = [
    { id: 'emerald', name: 'Emerald', value: '#00e701' },
    { id: 'azure', name: 'Azure', value: '#2bb3ff' },
    { id: 'violet', name: 'Violet', value: '#9b6bff' },
    { id: 'magenta', name: 'Magenta', value: '#ff4fa3' },
    { id: 'gold', name: 'Gold', value: '#ffc24b' },
    { id: 'crimson', name: 'Crimson', value: '#ff5562' },
]

export const DENSITIES = [
    { id: 'cozy', name: 'Cozy', detail: 'Default spacing.' },
    { id: 'compact', name: 'Compact', detail: 'Tighter spacing for small screens.' },
]

const DEFAULTS = {
    accent: 'emerald', // '' / 'default' means use each game's own accent
    density: 'cozy',
    reduceMotion: false,
    haptics: true, // device vibration feedback (mobile only; also gated by reduce-motion)
    quickSpin: false, // global "quick/turbo" preference; slots use it as default spin speed
    animations: true, // master cosmetic-animation switch (separate from reduceMotion)
}

function normalizeSettings(parsed) {
    return {
        accent: typeof parsed.accent === 'string' ? parsed.accent : DEFAULTS.accent,
        density: parsed.density === 'compact' ? 'compact' : 'cozy',
        reduceMotion: Boolean(parsed.reduceMotion),
        haptics: parsed.haptics === undefined ? DEFAULTS.haptics : Boolean(parsed.haptics),
        quickSpin: parsed.quickSpin === undefined ? DEFAULTS.quickSpin : Boolean(parsed.quickSpin),
        animations: parsed.animations === undefined ? DEFAULTS.animations : Boolean(parsed.animations),
    }
}

function readSettings() {
    const raw = readRaw(KEY)
    if (raw !== null) {
        try {
            const parsed = JSON.parse(raw)
            if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return { ...DEFAULTS }
            const normalized = normalizeSettings(parsed)
            if (Object.prototype.hasOwnProperty.call(parsed, 'reduceMotion')) return normalized
            const legacy = readRaw(LEGACY_REDUCE_MOTION_KEY)
            if (legacy !== '0' && legacy !== '1') return normalized
            const migrated = { ...normalized, reduceMotion: legacy === '1' }
            if (writeJson(KEY, migrated)) removeKey(LEGACY_REDUCE_MOTION_KEY)
            return migrated
        } catch {
            return { ...DEFAULTS }
        }
    }
    const legacy = readRaw(LEGACY_REDUCE_MOTION_KEY)
    if (legacy !== '0' && legacy !== '1') return { ...DEFAULTS }
    const migrated = { ...DEFAULTS, reduceMotion: legacy === '1' }
    if (writeJson(KEY, migrated)) removeKey(LEGACY_REDUCE_MOTION_KEY)
    return migrated
}

const listeners = new Set()
let settings = readSettings()

function notify() { listeners.forEach(fn => fn()) }

export function applySettingsToDom(s = settings) {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    root.dataset.density = s.density
    root.classList.toggle('gampo-reduce-motion', !!s.reduceMotion)
    // Master cosmetic-animation switch. When OFF (and not already reduce-motion)
    // we add `gampo-no-animations` so heavy decorative loops can be suppressed
    // independently of the accessibility reduce-motion flag.
    root.classList.toggle('gampo-no-animations', !s.animations)
    root.dataset.quickSpin = s.quickSpin ? 'on' : 'off'
    const theme = ACCENT_THEMES.find(t => t.id === s.accent)
    if (theme) {
        root.dataset.accent = theme.id
        root.style.setProperty('--app-accent', theme.value)
    } else {
        delete root.dataset.accent
        root.style.removeProperty('--app-accent')
    }
}

function persist() {
    writeJson(KEY, settings)
    applySettingsToDom()
    notify()
}

export function setAccent(accent) {
    settings = { ...settings, accent: typeof accent === 'string' ? accent : DEFAULTS.accent }
    persist()
}

export function setDensity(density) {
    settings = { ...settings, density: density === 'compact' ? 'compact' : 'cozy' }
    persist()
}

export function setReduceMotion(value) {
    const reduceMotion = Boolean(typeof value === 'function' ? value(settings.reduceMotion) : value)
    if (reduceMotion === settings.reduceMotion) return
    settings = { ...settings, reduceMotion }
    persist()
}

export function setHaptics(value) {
    settings = { ...settings, haptics: !!value }
    persist()
}

export function setQuickSpin(value) {
    settings = { ...settings, quickSpin: !!value }
    persist()
}

export function setAnimations(value) {
    settings = { ...settings, animations: !!value }
    persist()
}

export function resetSettings() {
    settings = { ...DEFAULTS }
    removeKey(KEY)
    removeKey(LEGACY_REDUCE_MOTION_KEY)
    applySettingsToDom()
    notify()
}

// Apply once at module load so the DOM reflects saved prefs before first paint
// of any consumer.
applySettingsToDom()

export function useSettings() {
    const [, force] = useState(0)
    useEffect(() => {
        const fn = () => force(n => n + 1)
        listeners.add(fn)
        // Re-assert DOM state on mount (covers HMR / late hydration).
        applySettingsToDom()
        return () => { listeners.delete(fn) }
    }, [])
    return {
        ...settings,
        accentThemes: ACCENT_THEMES,
        densities: DENSITIES,
        setAccent,
        setDensity,
        setReduceMotion,
        setHaptics,
        setQuickSpin,
        setAnimations,
        resetSettings,
    }
}
