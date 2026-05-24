// Lazy WebAudio context shared across all games.
//
// Pattern: do not create the AudioContext until first user gesture (Chrome
// autoplay policy). All sfx loaders queue until the context resolves.
//
// Public API:
//   getAudioCtx()       -> AudioContext or null until unlocked
//   unlockAudio()       -> async, resumes context after user gesture
//   setMuted(bool)      -> master mute toggle
//   isMuted()           -> bool
//   getMasterGain()     -> GainNode | null
//
// Audio format target (Wave 1): 16-bit PCM mono .wav, 44.1 kHz. Loader
// uses decodeAudioData which handles wav/ogg/mp3 transparently. Wave 1
// ships silent: no .wav binaries are committed yet.

let ctx = null
let masterGain = null
let muted = false
let unlockingPromise = null

const MUTE_STORAGE_KEY = 'gampo:audio:muted'

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

if (typeof window !== 'undefined') {
    muted = readMuteFromStorage()
}

export function getAudioCtx() {
    return ctx
}

export function getMasterGain() {
    return masterGain
}

export function isMuted() {
    return muted
}

export function setMuted(value) {
    muted = !!value
    writeMuteToStorage(muted)
    if (masterGain) {
        try {
            masterGain.gain.value = muted ? 0 : 1
        } catch (e) {
            // ignore
        }
    }
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
                masterGain.gain.value = muted ? 0 : 1
                masterGain.connect(ctx.destination)
            }
            if (ctx.state !== 'running') {
                await ctx.resume()
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
            // Some Safari versions need the callback form.
            const maybe = c.decodeAudioData(arrayBuffer, buf => resolve(buf), err => reject(err))
            if (maybe && typeof maybe.then === 'function') {
                maybe.then(resolve, reject)
            }
        } catch (e) {
            reject(e)
        }
    })
}
