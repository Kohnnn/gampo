// React hook for per-game sound effects.
//
// Usage:
//   const sfx = useSfx('dice')
//   sfx.play('roll')
//   sfx.play('win', { volume: 0.6 })
//
// Behavior:
//   - First call to `play` triggers `unlockAudio()` (Chrome autoplay policy).
//   - When the manifest has no path for a role, `play` is a no-op.
//   - Buffers are cached per URL. Concurrent plays are allowed.
//   - Master mute is honored via the master gain node.
//
// Wave 1 ships silent: every role in `sfxManifest` is null, so `play()`
// returns false but no errors are emitted.

import { useCallback, useMemo, useRef } from 'react'
import { getAudioCtx, getMasterGain, isMuted, unlockAudio, decode } from './audioContext'
import { resolveSfx } from './sfxManifest'

const bufferCache = new Map()

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
            console.warn('[sfx] load failed', url, e)
            return null
        }
    })()
    bufferCache.set(url, promise)
    return promise
}

export function useSfx(slug) {
    const slugRef = useRef(slug)
    slugRef.current = slug

    const play = useCallback(async (role, opts = {}) => {
        const url = resolveSfx(slugRef.current, role)
        if (!url) return false
        if (isMuted()) return false
        await unlockAudio()
        const ctx = getAudioCtx()
        const master = getMasterGain()
        if (!ctx || !master) return false
        const buffer = await loadBuffer(url)
        if (!buffer) return false
        try {
            const source = ctx.createBufferSource()
            source.buffer = buffer
            const gain = ctx.createGain()
            gain.gain.value = Number.isFinite(opts.volume) ? Math.max(0, Math.min(1, opts.volume)) : 1
            source.connect(gain)
            gain.connect(master)
            source.start(0)
            return true
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('[sfx] play failed', role, e)
            return false
        }
    }, [])

    const preload = useCallback(async (roles = []) => {
        const list = Array.isArray(roles) ? roles : [roles]
        await unlockAudio()
        await Promise.all(list.map(r => loadBuffer(resolveSfx(slugRef.current, r))))
    }, [])

    return useMemo(() => ({ play, preload }), [play, preload])
}
