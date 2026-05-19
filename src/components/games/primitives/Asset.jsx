// Lightweight asset primitive that prefers a generated PNG and falls back gracefully.
// Usage: <Asset src="/assets/games/cards/card-back.png" alt="" fallback={<div className="card-back-css" />} />

import { useEffect, useState } from 'react'

const cache = new Map() // src -> 'ok' | 'missing'

export default function Asset({ src, alt = '', fallback = null, className = '', style }) {
    const [status, setStatus] = useState(() => cache.get(src) || 'unknown')

    useEffect(() => {
        if (!src || cache.has(src)) {
            setStatus(cache.get(src) || 'unknown')
            return
        }
        let cancelled = false
        const img = new Image()
        img.onload = () => {
            if (cancelled) return
            cache.set(src, 'ok')
            setStatus('ok')
        }
        img.onerror = () => {
            if (cancelled) return
            cache.set(src, 'missing')
            setStatus('missing')
        }
        img.src = src
        return () => { cancelled = true }
    }, [src])

    if (status === 'missing') return fallback
    return <img src={src} alt={alt} className={className} style={style} loading="lazy" />
}
