// useBgm — Wave 29 background music looper.
//
// Plays a single looping audio source through the BGM gain bus. Switching
// templates fades the current loop out and the next one in. Manifest is
// keyed by skin family in `bgmManifest` (slot mode) or game id in
// `gameBgmManifest` (Wave 35: casino-game mode). When the entry is null,
// the hook is a no-op.

import { useEffect, useRef } from 'react'
import { getAudioCtx, getBgmGain, unlockAudio, decode } from './audioContext'
import { resolveBgm } from './bgmManifest'
import { resolveGameBgm } from './gameBgmManifest'

const bufferCache = new Map()
export const BGM_UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchstart']

export function addBgmUnlockRetry(target, retry) {
    if (!target?.addEventListener || !target?.removeEventListener || typeof retry !== 'function') {
        return () => {}
    }
    let done = false
    const cleanup = () => {
        BGM_UNLOCK_EVENTS.forEach(eventName => {
            target.removeEventListener(eventName, handler, true)
        })
    }
    const handler = () => {
        if (done) return
        done = true
        cleanup()
        retry()
    }
    BGM_UNLOCK_EVENTS.forEach(eventName => {
        target.addEventListener(eventName, handler, { once: true, capture: true })
    })
    return cleanup
}

async function loadBuffer(url) {
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
            console.warn('[bgm] load failed', url, e)
            return null
        }
    })()
    bufferCache.set(url, promise)
    return promise
}

function useBgmInner(url) {
    const sourceRef = useRef(null)
    const fadeRef = useRef(null)

    useEffect(() => {
        let cancelled = false
        let cleanupUnlockRetry = null

        const armUnlockRetry = () => {
            if (cleanupUnlockRetry || typeof window === 'undefined') return
            cleanupUnlockRetry = addBgmUnlockRetry(window, () => {
                cleanupUnlockRetry = null
                start()
            })
        }

        async function start() {
            if (!url) return
            await unlockAudio()
            const ctx = getAudioCtx()
            const dest = getBgmGain()
            if (!ctx || ctx.state !== 'running') {
                armUnlockRetry()
                return
            }
            if (!ctx || !dest) return
            const buf = await loadBuffer(url)
            if (cancelled || !buf) return

            // Fade out current.
            if (sourceRef.current) {
                try {
                    const old = sourceRef.current
                    const oldGain = fadeRef.current
                    if (oldGain) {
                        oldGain.gain.cancelScheduledValues(ctx.currentTime)
                        oldGain.gain.setValueAtTime(oldGain.gain.value, ctx.currentTime)
                        oldGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4)
                    }
                    setTimeout(() => { try { old.stop() } catch (_) { /* ignore */ } }, 450)
                } catch (_) { /* ignore */ }
            }

            // Start new with fade-in.
            try {
                const src = ctx.createBufferSource()
                src.buffer = buf
                src.loop = true
                const gain = ctx.createGain()
                gain.gain.setValueAtTime(0, ctx.currentTime)
                gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.6)
                src.connect(gain)
                gain.connect(dest)
                src.start(0)
                sourceRef.current = src
                fadeRef.current = gain
            } catch (e) {
                // eslint-disable-next-line no-console
                console.warn('[bgm] play failed', e)
            }
        }

        start()

        return () => {
            cancelled = true
            if (cleanupUnlockRetry) {
                cleanupUnlockRetry()
                cleanupUnlockRetry = null
            }
            if (sourceRef.current) {
                const ctx = getAudioCtx()
                try {
                    if (ctx && fadeRef.current) {
                        fadeRef.current.gain.cancelScheduledValues(ctx.currentTime)
                        fadeRef.current.gain.setValueAtTime(fadeRef.current.gain.value, ctx.currentTime)
                        fadeRef.current.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3)
                    }
                    setTimeout(() => { try { sourceRef.current?.stop() } catch (_) { /* ignore */ } }, 350)
                } catch (_) { /* ignore */ }
                sourceRef.current = null
                fadeRef.current = null
            }
        }
    }, [url])
}

// Wave 29: slot skin BGM. `skinFamily` keys into `bgmManifest`.
export function useBgm(skinFamily, mode = 'idle') {
    useBgmInner(resolveBgm(skinFamily, mode))
}

// Wave 35: per-game BGM. `gameId` keys into `gameBgmManifest`.
export function useGameBgm(gameId, mode = 'idle') {
    useBgmInner(resolveGameBgm(gameId, mode))
}

// Option 3: lobby/menu background music. Plays a single loop on menu
// surfaces. Defaults muted via the BGM bus; the volume mixer toggles it.
export function useMenuBgm(enabled = true) {
    useBgmInner(enabled ? '/audio/bgm/menu/idle.wav' : null)
}
