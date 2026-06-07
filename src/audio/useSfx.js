// React hook for per-game sound effects.
//
// Usage:
//   const sfx = useSfx('dice')
//   sfx.play('roll')
//   sfx.play('win', { volume: 0.6 })
//
// Behavior:
//   - Plays real samples through the unified SFX bus (audioContext.js).
//   - First call to `play` triggers `unlockAudio()` (Chrome autoplay policy).
//   - When the manifest has no path for a role, `play` is a no-op.
//   - Buffers are cached per URL (shared cache in audioContext).
//   - Master + SFX mute are honored via the gain buses inside playSample.
//   - Outcome roles (win/lose/bigwin/cashout) share a de-dupe gate with
//     AudioProvider.play so one game event only ever makes one sound.

import { useCallback, useMemo, useRef } from 'react'
import { loadBuffer, playSample, unlockAudio } from './audioContext'
import { resolveSfx } from './sfxManifest'

// Roles that represent a round outcome. These collapse with the legacy
// `playSound('win'|'loss'|'bigwin')` calls via the shared 'outcome' key.
const OUTCOME_ROLES = new Set(['win', 'lose', 'loss', 'bigwin', 'cashout'])

export function useSfx(slug) {
    const slugRef = useRef(slug)
    slugRef.current = slug

    const play = useCallback(async (role, opts = {}) => {
        const url = resolveSfx(slugRef.current, role)
        if (!url) return false
        const dedupeKey = OUTCOME_ROLES.has(role) ? 'outcome' : undefined
        return playSample(url, { volume: opts.volume, dedupeKey })
    }, [])

    const preload = useCallback(async (roles = []) => {
        const list = Array.isArray(roles) ? roles : [roles]
        await unlockAudio()
        await Promise.all(list.map(r => loadBuffer(resolveSfx(slugRef.current, r))))
    }, [])

    return useMemo(() => ({ play, preload }), [play, preload])
}
