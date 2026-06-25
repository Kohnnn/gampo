// haptics — thin, safe wrapper around navigator.vibrate for tactile feedback.
//
// Design constraints (see cases unbox C7):
//   - No-op when the API is unavailable (desktop, unsupported browsers, SSR).
//   - Setting-gated: the caller passes the current `haptics` preference; we also
//     read it lazily so callers that don't have the hook can still respect it.
//   - Reduced-motion off: vibration is motion, so honour the reduce-motion flag.
//   - Throttled: a minimum gap between pulses so a burst of events (e.g. reel
//     ticks) can't machine-gun the motor.
//
// Patterns are short by design — tactile punctuation, not buzzers.

import { readJson } from './storage'

const SETTINGS_KEY = 'gampo_settings_v1'
const MIN_GAP_MS = 60

let lastFiredAt = 0

export const HAPTIC_PATTERNS = {
    tick: 8,
    select: 12,
    land: [0, 18, 40, 28],
    rare: [0, 30, 50, 30, 50, 45],
    win: [0, 22, 40, 22],
    error: [0, 14, 30, 14],
}

function supported() {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

function reduceMotionActive() {
    if (typeof document !== 'undefined'
        && document.documentElement?.classList.contains('gampo-reduce-motion')) {
        return true
    }
    if (typeof window !== 'undefined' && window.matchMedia) {
        return Boolean(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    }
    return false
}

// Lazy settings read so call sites without the hook still respect the toggle.
// Defaults to enabled when the key/flag is absent (matches useSettings DEFAULTS).
function hapticsEnabledFromSettings() {
    const parsed = readJson(SETTINGS_KEY, null)
    if (!parsed || typeof parsed !== 'object') return true
    return parsed.haptics === undefined ? true : Boolean(parsed.haptics)
}

// Fire a haptic pulse.
//   pattern: a key of HAPTIC_PATTERNS, a number (ms), or a number[] (vibrate spec)
//   options.enabled: explicit gate from the caller's settings (preferred). When
//     omitted, we read the persisted setting.
//   options.force: bypass the throttle (use sparingly, e.g. a single big win).
export function haptic(pattern = 'tick', { enabled, force = false } = {}) {
    if (!supported()) return false
    const allowed = enabled === undefined ? hapticsEnabledFromSettings() : Boolean(enabled)
    if (!allowed) return false
    if (reduceMotionActive()) return false

    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now())
    if (!force && now - lastFiredAt < MIN_GAP_MS) return false

    const spec = typeof pattern === 'string' ? HAPTIC_PATTERNS[pattern] : pattern
    if (spec == null) return false
    // Chromium blocks vibrate without user activation.
    // When userActivation is absent (Safari/Firefox) fall through to the call.
    if (typeof navigator.userActivation !== 'undefined' && !navigator.userActivation.hasBeenActive) return false
    try {
        const ok = navigator.vibrate(spec)
        if (ok) lastFiredAt = now
        return ok
    } catch {
        return false
    }
}

// Cancel any ongoing vibration (e.g. on skip / unmount).
export function cancelHaptics() {
    if (!supported()) return
    // Chromium blocks vibrate without user activation, including cancellation.
    if (typeof navigator.userActivation !== 'undefined' && !navigator.userActivation.hasBeenActive) return
    try { navigator.vibrate(0) } catch { /* ignore */ }
}
