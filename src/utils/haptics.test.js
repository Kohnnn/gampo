import { describe, it, expect, beforeEach, vi } from 'vitest'
import { haptic, cancelHaptics, HAPTIC_PATTERNS } from './haptics'

let vibrateCalls = []
let clock = 1_000_000

beforeEach(() => {
    vibrateCalls = []
    clock += 10_000 // monotonic across tests so module-level throttle never bleeds over
    // Fresh settings store (haptics defaults on when absent).
    const store = new Map()
    vi.stubGlobal('localStorage', {
        get length() { return store.size },
        key: (i) => Array.from(store.keys())[i] ?? null,
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)) },
        removeItem: (k) => { store.delete(k) },
        clear: () => store.clear(),
    })
    vi.stubGlobal('navigator', { vibrate: (spec) => { vibrateCalls.push(spec); return true } })
    vi.stubGlobal('document', {
        documentElement: { classList: { contains: () => false } },
    })
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
    vi.stubGlobal('performance', { now: () => clock })
})

describe('haptics util', () => {
    it('fires a known pattern through navigator.vibrate when enabled', () => {
        const ok = haptic('select', { enabled: true })
        expect(ok).toBe(true)
        expect(vibrateCalls).toEqual([HAPTIC_PATTERNS.select])
    })

    it('no-ops when explicitly disabled', () => {
        const ok = haptic('tick', { enabled: false })
        expect(ok).toBe(false)
        expect(vibrateCalls).toHaveLength(0)
    })

    it('no-ops when navigator.vibrate is unavailable', () => {
        vi.stubGlobal('navigator', {})
        expect(haptic('tick', { enabled: true })).toBe(false)
    })

    it('respects reduce-motion (class on documentElement)', () => {
        vi.stubGlobal('document', {
            documentElement: { classList: { contains: (c) => c === 'gampo-reduce-motion' } },
        })
        expect(haptic('win', { enabled: true })).toBe(false)
        expect(vibrateCalls).toHaveLength(0)
    })

    it('throttles rapid pulses but allows force', () => {
        expect(haptic('tick', { enabled: true })).toBe(true)
        // Immediate second call is throttled.
        expect(haptic('tick', { enabled: true })).toBe(false)
        // force bypasses the throttle.
        expect(haptic('rare', { enabled: true, force: true })).toBe(true)
        expect(vibrateCalls).toHaveLength(2)
    })

    it('reads the persisted setting when enabled is omitted', () => {
        globalThis.localStorage.setItem('gampo_settings_v1', JSON.stringify({ haptics: false }))
        expect(haptic('tick')).toBe(false)
        clock += 1000
        globalThis.localStorage.setItem('gampo_settings_v1', JSON.stringify({ haptics: true }))
        expect(haptic('tick')).toBe(true)
    })

    it('cancelHaptics calls vibrate(0)', () => {
        cancelHaptics()
        expect(vibrateCalls).toContain(0)
    })

    it('ignores unknown pattern keys', () => {
        expect(haptic('does-not-exist', { enabled: true, force: true })).toBe(false)
    })

    it('no-ops when user has not activated the page (mobile Chromium policy)', () => {
        vi.stubGlobal('navigator', {
            vibrate: (spec) => { vibrateCalls.push(spec); return true },
            userActivation: { hasBeenActive: false },
        })
        expect(haptic('tick', { enabled: true })).toBe(false)
        expect(vibrateCalls).toHaveLength(0)
    })

    it('returns false when navigator.vibrate is denied (mobile policy) and does not advance throttle', () => {
        vi.stubGlobal('navigator', { vibrate: (spec) => { vibrateCalls.push(spec); return false } })
        expect(haptic('tick', { enabled: true })).toBe(false)
        expect(vibrateCalls).toEqual([HAPTIC_PATTERNS.tick])
        // Throttle was NOT advanced — immediate second call reaches vibrate again.
        expect(haptic('tick', { enabled: true })).toBe(false)
        expect(vibrateCalls).toHaveLength(2)
    })
})
