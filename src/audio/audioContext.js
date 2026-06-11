// Lazy WebAudio context shared across all games. (Option 3 unification)
//
// Single AudioContext for the whole app. Three gain buses hang off the
// master gain so the global mute still governs everything:
//
//   master ── destination
//     ├── bgm   (looping background music, via useBgm)
//     └── sfx   (one-shot effects, via useSfx + AudioProvider.play)
//
// Mute model (per the product spec):
//   - master mute  -> the global toolbar/header toggle. Default: ON (audible).
//   - bgm mute     -> background music. Default: MUTED.
//   - sfx mute     -> effects. Default: ON (audible).
//
// Each bus also has an independent volume that persists to localStorage.
// BGM volume defaults low so music sits under the effects when enabled.
//
// Audio format target: 16-bit PCM mono .wav 44.1 kHz, but decodeAudioData
// handles wav/ogg/mp3 transparently.

let ctx = null
let masterGain = null
let bgmGain = null
let sfxGain = null

let masterMuted = false
let bgmMuted = true
let sfxMuted = false

let unlockingPromise = null
let masterVolume = 1
let bgmVolume = 0.3
let sfxVolume = 0.7

const MUTE_STORAGE_KEY = 'gampo:audio:muted'
const BGM_MUTE_STORAGE_KEY = 'gampo:audio:bgmMuted'
const SFX_MUTE_STORAGE_KEY = 'gampo:audio:sfxMuted'
const VOLUME_STORAGE_KEY = 'gampo:audio:volumes'
export const AUDIO_RESUME_TIMEOUT_MS = 250

export function resumeWithTimeout(resumePromise, timeoutMs = AUDIO_RESUME_TIMEOUT_MS) {
    return Promise.race([
        resumePromise,
        new Promise(resolve => setTimeout(resolve, timeoutMs)),
    ])
}

function readBool(key, fallback) {
    try {
        const v = localStorage.getItem(key)
        if (v === null) return fallback
        return v === '1'
    } catch (e) {
        return fallback
    }
}

function writeBool(key, value) {
    try {
        localStorage.setItem(key, value ? '1' : '0')
    } catch (e) {
        // ignore
    }
}

function readVolumes() {
    try {
        const raw = localStorage.getItem(VOLUME_STORAGE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object') return null
        return {
            master: typeof parsed.master === 'number' ? parsed.master : 1,
            bgm: typeof parsed.bgm === 'number' ? parsed.bgm : 0.3,
            sfx: typeof parsed.sfx === 'number' ? parsed.sfx : 0.7,
        }
    } catch (e) {
        return null
    }
}

function writeVolumes() {
    try {
        localStorage.setItem(VOLUME_STORAGE_KEY, JSON.stringify({ master: masterVolume, bgm: bgmVolume, sfx: sfxVolume }))
    } catch (e) {
        // ignore
    }
}

if (typeof window !== 'undefined') {
    masterMuted = readBool(MUTE_STORAGE_KEY, false)
    bgmMuted = readBool(BGM_MUTE_STORAGE_KEY, true)
    sfxMuted = readBool(SFX_MUTE_STORAGE_KEY, false)
    const v = readVolumes()
    if (v) {
        masterVolume = v.master
        bgmVolume = v.bgm
        sfxVolume = v.sfx
    }
}

export function getAudioCtx() {
    return ctx
}

export function getMasterGain() {
    return masterGain
}

export function getBgmGain() {
    return bgmGain
}

export function getSfxGain() {
    return sfxGain
}

// ---- Change notification so every UI control (header, mixer, settings)
// stays in sync no matter which one toggled the state. ----
const listeners = new Set()

export function subscribeAudio(listener) {
    if (typeof listener !== 'function') return () => {}
    listeners.add(listener)
    return () => listeners.delete(listener)
}

function notify() {
    listeners.forEach(fn => {
        try { fn() } catch (e) { /* ignore */ }
    })
}

// Re-apply every gain node from current mute+volume state.
function applyGains() {
    try {
        if (masterGain) masterGain.gain.value = masterMuted ? 0 : masterVolume
        if (bgmGain) bgmGain.gain.value = bgmMuted ? 0 : bgmVolume
        if (sfxGain) sfxGain.gain.value = sfxMuted ? 0 : sfxVolume
    } catch (e) {
        // ignore
    }
}

// True when BGM should actually be audible (master on AND bgm on). Used by
// useBgm to gate playback at start time, not just via gain.
export function isBgmAudible() {
    return !masterMuted && !bgmMuted
}

// ---- Master mute (the global toggle) ----
export function isMuted() {
    return masterMuted
}

export function setMuted(value) {
    masterMuted = !!value
    writeBool(MUTE_STORAGE_KEY, masterMuted)
    applyGains()
    notify()
}

// ---- Per-bus mute ----
export function isBgmMuted() {
    return bgmMuted
}

export function setBgmMuted(value) {
    bgmMuted = !!value
    writeBool(BGM_MUTE_STORAGE_KEY, bgmMuted)
    applyGains()
    notify()
}

export function isSfxMuted() {
    return sfxMuted
}

export function setSfxMuted(value) {
    sfxMuted = !!value
    writeBool(SFX_MUTE_STORAGE_KEY, sfxMuted)
    applyGains()
    notify()
}

export function getVolumes() {
    return { master: masterVolume, bgm: bgmVolume, sfx: sfxVolume }
}

export function setVolume(bus, value) {
    const v = Math.max(0, Math.min(1, Number(value) || 0))
    if (bus === 'master') {
        masterVolume = v
    } else if (bus === 'bgm') {
        bgmVolume = v
    } else if (bus === 'sfx') {
        sfxVolume = v
    }
    applyGains()
    writeVolumes()
    notify()
}

export async function unlockAudio() {
    if (ctx && ctx.state === 'running') return ctx
    if (unlockingPromise) return unlockingPromise
    unlockingPromise = (async () => {
        try {
            const Ctor = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext)
            if (!Ctor) return null
            if (!ctx) {
                ctx = new Ctor({ sampleRate: 44100 })
                masterGain = ctx.createGain()
                masterGain.connect(ctx.destination)
                bgmGain = ctx.createGain()
                bgmGain.connect(masterGain)
                sfxGain = ctx.createGain()
                sfxGain.connect(masterGain)
                applyGains()
            }
            if (ctx.state !== 'running') {
                await resumeWithTimeout(ctx.resume())
            }
            return ctx
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('[audio] unlock failed', e)
            return null
        } finally {
            unlockingPromise = null
        }
    })()
    return unlockingPromise
}

// Decode an arrayBuffer through the shared context. Returns AudioBuffer
// or null when the context isn't available yet.
export async function decode(arrayBuffer) {
    const c = ctx || await unlockAudio()
    if (!c) return null
    return new Promise((resolve, reject) => {
        try {
            const maybe = c.decodeAudioData(arrayBuffer, buf => resolve(buf), err => reject(err))
            if (maybe && typeof maybe.then === 'function') {
                maybe.then(resolve, reject)
            }
        } catch (e) {
            reject(e)
        }
    })
}

// ---- Shared sample loader + one-shot player (used by useSfx and AudioProvider) ----
const bufferCache = new Map()

export async function loadBuffer(url) {
    if (!url) return null
    if (bufferCache.has(url)) return bufferCache.get(url)
    const promise = (async () => {
        try {
            const res = await fetch(url)
            if (!res.ok) return null
            const ab = await res.arrayBuffer()
            const buf = await decode(ab)
            return buf || null
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('[audio] sample load failed', url, e)
            return null
        }
    })()
    bufferCache.set(url, promise)
    return promise
}

// De-dupe gate: collapse identical sounds fired within a short window so a
// single game event can't double-fire (e.g. synth + sample for the same win).
const lastFired = new Map()
const DEDUPE_MS = 60

export function shouldFire(key, windowMs = DEDUPE_MS) {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
    const prev = lastFired.get(key)
    if (prev !== undefined && (now - prev) < windowMs) return false
    lastFired.set(key, now)
    return true
}

// Play a one-shot sample on the SFX bus. Honors master + sfx mute.
export async function playSample(url, { volume = 1, dedupeKey } = {}) {
    if (!url) return false
    if (masterMuted || sfxMuted) return false
    if (dedupeKey && !shouldFire(dedupeKey)) return false
    // Auto per-URL dedupe: when a game fires the SAME sample twice in a very
    // short window (e.g. legacy playSound('click') + useSfx sfx.play('click')
    // now resolving to the same file after the 2026-06-11 migration), collapse
    // it to one playback. Explicit dedupeKey callers already gated above.
    if (!dedupeKey && !shouldFire(`url:${url}`, 40)) return false
    await unlockAudio()
    const c = getAudioCtx()
    const dest = getSfxGain() || getMasterGain()
    if (!c || !dest) return false
    const buffer = await loadBuffer(url)
    if (!buffer) return false
    try {
        const source = c.createBufferSource()
        source.buffer = buffer
        const gain = c.createGain()
        gain.gain.value = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 1))
        source.connect(gain)
        gain.connect(dest)
        source.start(0)
        return true
    } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[audio] sample play failed', url, e)
        return false
    }
}
