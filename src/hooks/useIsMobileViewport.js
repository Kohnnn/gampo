// Tracks whether the viewport is in the mobile breakpoint (≤768px).
//
// The mobile drawer and the mobile game sheets share this breakpoint, but the
// sheets are hidden by CSS alone while their React state stays true. That
// matters because their Escape handlers and Escape claims live in React: after
// resizing from phone to desktop an invisible sheet kept both, so the first
// Escape was consumed by a sheet the user could not see.
//
// Reading the same breakpoint here lets those layers tie their behaviour to
// actual visibility rather than to CSS.

import { useEffect, useState } from 'react'

const QUERY = '(max-width: 768px)'

export function useIsMobileViewport() {
    const [isMobile, setIsMobile] = useState(() => (
        typeof window !== 'undefined' && typeof window.matchMedia === 'function'
            ? window.matchMedia(QUERY).matches
            : false
    ))

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
        const mql = window.matchMedia(QUERY)
        const onChange = (event) => setIsMobile(event.matches)
        // Re-read on subscribe: the viewport can change between the initial
        // render and this effect running.
        setIsMobile(mql.matches)
        mql.addEventListener('change', onChange)
        return () => mql.removeEventListener('change', onChange)
    }, [])

    return isMobile
}

export default useIsMobileViewport
