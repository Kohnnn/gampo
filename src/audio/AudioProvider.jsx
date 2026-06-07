import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import {
    isMuted, setMuted as setCtxMuted,
    playSample, unlockAudio,
} from './audioContext'

const AudioContext_ = createContext(null)

// Option 3: the synth oscillator pack is gone. `play(name)` now plays real
// samples from public/audio through the unified SFX bus (audioContext.js).
// The legacy event names every game already calls map to bank files here.
// A dedupeKey collapses double-fires so one game event = one sound.
const SOUND_MAP = {
    click: { url: '/audio/common/click.wav', volume: 0.5 },
    tick: { url: '/audio/cases/tick.wav', volume: 0.5 },
    deal: { url: '/audio/kenney/casino/card-slide-1.ogg', volume: 0.7 },
    flip: { url: '/audio/kenney/casino/card-place-1.ogg', volume: 0.7 },
    win: { url: '/audio/common/win.wav', volume: 0.8, dedupe: 'outcome' },
    bigwin: { url: '/audio/common/bigwin.wav', volume: 0.9, dedupe: 'outcome' },
    loss: { url: '/audio/common/lose.wav', volume: 0.7, dedupe: 'outcome' },
    explode: { url: '/audio/cases/lid.wav', volume: 0.8 },
}

export function AudioProvider({ children }) {
    // Mute state mirrors the single shared master mute in audioContext.
    const [muted, setMutedState] = useState(() => isMuted())

    // Keep React state in sync if mute changes from elsewhere (e.g. another tab
    // or the VolumeMixer) when this provider remounts.
    useEffect(() => {
        setMutedState(isMuted())
    }, [])

    const play = useCallback((name) => {
        const def = SOUND_MAP[name]
        if (!def) return
        // `dedupe: 'outcome'` collapses win/bigwin/loss fired for the same
        // round so layered calls (old synth + sample) can't double up.
        const dedupeKey = def.dedupe ? `outcome` : undefined
        playSample(def.url, { volume: def.volume, dedupeKey })
    }, [])

    const setMuted = useCallback((next) => {
        const value = typeof next === 'function' ? next(isMuted()) : next
        setCtxMuted(value)
        setMutedState(value)
        if (!value) unlockAudio()
    }, [])

    const toggle = useCallback(() => {
        setMuted(m => !m)
    }, [setMuted])

    const value = { muted, setMuted, play, toggle }
    return <AudioContext_.Provider value={value}>{children}</AudioContext_.Provider>
}

export function useAudio() {
    const ctx = useContext(AudioContext_)
    if (!ctx) throw new Error('useAudio must be used inside AudioProvider')
    return ctx
}
