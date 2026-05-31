// Lazy WebAudio context shared across all games.
//
// Wave 29: split master into BGM and SFX buses with independent gain.
// All buses connect through `masterGain` so the global mute toggle still
// works. Volumes persist to localStorage so user prefs survive reloads.
//
// Audio format target (Wave 1): 16-bit PCM mono .wav, 44.1 kHz. Loader
// uses decodeAudioData which handles wav/ogg/mp3 transparently. The
// procedural chiptune generator (`scripts/genSfx.mjs`) outputs 16-bit
// PCM mono .wav files directly.

let ctx = null
let masterGain = null
let bgmGain = null
let sfxGain = null
let muted = false
let unlockingPromise = null
let masterVolume = 1
let bgmVolume = 0.6
let sfxVolume = 0.85

const MUTE_STORAGE_KEY = 'gampo:audio:muted'
const VOLUME_STORAGE_KEY = 'gampo:audio:volumes'
export const AUDIO_RESUME_TIMEOUT_MS = 250

export function resumeWithTimeout(resumePromise, timeoutMs = AUDIO_RESUME_TIMEOUT_MS) {
    return Promise.race([
        resumePromise,
        new Promise(resolve => setTimeout(resolve, timeoutMs)),
    ])
}

function readMuteFromStorage() {
    try {
        return localStorage.getItem(MUTE_STORAGE_KEY) === '1'
    } catch (e) {
        return false
    }
}

function writeMuteToStorage(value) {
    try {
        localStorage.setItem(MUTE_STORAGE_KEY, value ? '1' : '0')
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
            bgm: typeof parsed.bgm === 'number' ? parsed.bgm : 0.6,
            sfx: typeof parsed.sfx === 'number' ? parsed.sfx : 0.85,
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
    muted = readMuteFromStorage()
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

export function isMuted() {
    return muted
}

export function setMuted(value) {
    muted = !!value
    writeMuteToStorage(muted)
    if (masterGain) {
        try {
            masterGain.gain.value = muted ? 0 : masterVolume
        } catch (e) {
            // ignore
        }
    }
}

export function getVolumes() {
    return { master: masterVolume, bgm: bgmVolume, sfx: sfxVolume }
}

export function setVolume(bus, value) {
    const v = Math.max(0, Math.min(1, Number(value) || 0))
    if (bus === 'master') {
        masterVolume = v
        if (masterGain) masterGain.gain.value = muted ? 0 : v
    } else if (bus === 'bgm') {
        bgmVolume = v
        if (bgmGain) bgmGain.gain.value = v
    } else if (bus === 'sfx') {
        sfxVolume = v
        if (sfxGain) sfxGain.gain.value = v
    }
    writeVolumes()
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
                masterGain.gain.value = muted ? 0 : masterVolume
                masterGain.connect(ctx.destination)
                bgmGain = ctx.createGain()
                bgmGain.gain.value = bgmVolume
                bgmGain.connect(masterGain)
                sfxGain = ctx.createGain()
                sfxGain.gain.value = sfxVolume
                sfxGain.connect(masterGain)
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
