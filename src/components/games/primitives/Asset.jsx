// Lightweight asset primitive that prefers a generated PNG and falls back gracefully.
// Usage: <Asset src="/assets/games/cards/card-back.png" alt="" fallback={<div className="card-back-css" />} />

import { useEffect, useState } from 'react'
import { resolveImage } from '../../../utils/assetPaths'

const cache = new Map() // src -> 'ok' | 'missing'

export default function Asset({ src, alt = '', fallback = null, className = '', style }) {
    // Resolve before the cache lookup and the probe so a legacy literal and its
    // optimized sibling share one cache entry, and the fallback reflects what
    // actually ships rather than the pre-prune name.
    const resolved = resolveImage(src)
    const [status, setStatus] = useState(() => cache.get(resolved) || 'unknown')

    useEffect(() => {
        if (!resolved || cache.has(resolved)) {
            setStatus(cache.get(resolved) || 'unknown')
            return
        }
        let cancelled = false
        const img = new Image()
        img.onload = () => {
            if (cancelled) return
            cache.set(resolved, 'ok')
            setStatus('ok')
        }
        img.onerror = () => {
            if (cancelled) return
            cache.set(resolved, 'missing')
            setStatus('missing')
        }
        img.src = resolved
        return () => { cancelled = true }
    }, [resolved])

    if (status === 'missing') return fallback
    return <img src={resolved} alt={alt} className={className} style={style} loading="lazy" />
}
