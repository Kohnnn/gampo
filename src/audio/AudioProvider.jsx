import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

const AudioContext_ = createContext(null)

const STORAGE_KEY = 'gampo_audio_muted'

// 16-bit-style synth SFX pack. All synthesized with Web Audio.
// Each sound is a small composition (1-3 oscillators + envelope) tuned
// to feel like a SNES/Mega Drive era arcade casino.

const SOUNDS = {
    click: [{ osc: 'square', freq: 880, dur: 0.04, vol: 0.05 }],
    tick: [{ osc: 'square', freq: 1320, dur: 0.025, vol: 0.04 }],
    deal: [
        { osc: 'sawtooth', freq: 220, dur: 0.05, vol: 0.06 },
        { osc: 'square', freq: 660, dur: 0.06, vol: 0.04, delay: 0.02 },
    ],
    flip: [
        { osc: 'triangle', freq: 720, dur: 0.05, vol: 0.05 },
        { osc: 'square', freq: 1080, dur: 0.04, vol: 0.04, delay: 0.03 },
    ],
    win: [
        { osc: 'square', freq: 660, dur: 0.08, vol: 0.06 },
        { osc: 'square', freq: 880, dur: 0.08, vol: 0.06, delay: 0.07 },
        { osc: 'square', freq: 1320, dur: 0.16, vol: 0.05, delay: 0.14, glide: 1.5 },
    ],
    bigwin: [
        { osc: 'square', freq: 523, dur: 0.1, vol: 0.07 },
        { osc: 'square', freq: 659, dur: 0.1, vol: 0.07, delay: 0.09 },
        { osc: 'square', freq: 784, dur: 0.1, vol: 0.07, delay: 0.18 },
        { osc: 'square', freq: 1046, dur: 0.2, vol: 0.07, delay: 0.27 },
        { osc: 'triangle', freq: 1320, dur: 0.4, vol: 0.06, delay: 0.5, glide: 1.2 },
    ],
    loss: [
        { osc: 'sawtooth', freq: 320, dur: 0.16, vol: 0.06, glide: 0.5 },
        { osc: 'sawtooth', freq: 240, dur: 0.16, vol: 0.05, delay: 0.12, glide: 0.4 },
    ],
    explode: [
        { osc: 'sawtooth', freq: 90, dur: 0.32, vol: 0.1, glide: 0.3 },
        { osc: 'square', freq: 240, dur: 0.18, vol: 0.05, delay: 0.04, glide: 0.4 },
    ],
    cardSlap: [
        { osc: 'square', freq: 140, dur: 0.04, vol: 0.06 },
    ],
    chip: [
        { osc: 'square', freq: 1660, dur: 0.03, vol: 0.045 },
        { osc: 'square', freq: 2200, dur: 0.03, vol: 0.04, delay: 0.02 },
    ],
}

export function AudioProvider({ children }) {
    const ctxRef = useRef(null)
    const [muted, setMuted] = useState(() => {
        try { return localStorage.getItem(STORAGE_KEY) !== '0' } catch { return true }
    })

    useEffect(() => {
        try { localStorage.setItem(STORAGE_KEY, muted ? '1' : '0') } catch { /* ignore */ }
    }, [muted])

    const ensureCtx = useCallback(() => {
        if (typeof window === 'undefined') return null
        if (!ctxRef.current) {
            const Ctor = window.AudioContext || window.webkitAudioContext
            if (!Ctor) return null
            ctxRef.current = new Ctor()
        }
        return ctxRef.current
    }, [])

    const playOne = (ctx, def, t0Override) => {
        const t0 = t0Override !== undefined ? t0Override : ctx.currentTime
        const start = t0 + (def.delay || 0)
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = def.osc
        osc.frequency.setValueAtTime(def.freq, start)
        if (def.glide) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(40, def.freq * def.glide), start + def.dur)
        }
        gain.gain.setValueAtTime(0.0001, start)
        gain.gain.exponentialRampToValueAtTime(def.vol, start + 0.005)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + def.dur)
        osc.connect(gain).connect(ctx.destination)
        osc.start(start)
        osc.stop(start + def.dur + 0.02)
    }

    const play = useCallback((name) => {
        if (muted) return
        const ctx = ensureCtx()
        if (!ctx) return
        const seq = SOUNDS[name]
        if (!seq) return
        const t0 = ctx.currentTime
        for (const def of seq) playOne(ctx, def, t0)
    }, [muted, ensureCtx])

    const value = { muted, setMuted, play, toggle: () => setMuted(m => !m) }
    return <AudioContext_.Provider value={value}>{children}</AudioContext_.Provider>
}

export function useAudio() {
    const ctx = useContext(AudioContext_)
    if (!ctx) throw new Error('useAudio must be used inside AudioProvider')
    return ctx
}
