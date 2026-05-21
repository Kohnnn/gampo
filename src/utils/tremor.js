// useTremor — global screen-shake hook. Briefly toggles a `gampo-shake`
// CSS class on a target element so any game can punch up high-multiplier
// moments without each owning its own keyframes.
//
//   const tremorRef = useTremor()
//   <div ref={tremorRef}>...</div>
//   triggerTremor(tremorRef, 'lg')

import { useRef, useEffect } from 'react'

export function useTremor() {
    const ref = useRef(null)
    useEffect(() => () => {
        if (ref.current) ref.current.classList.remove('gampo-shake', 'gampo-shake-lg')
    }, [])
    return ref
}

export function triggerTremor(ref, size = 'sm') {
    const el = ref?.current
    if (!el) return
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const cls = size === 'lg' ? 'gampo-shake-lg' : 'gampo-shake'
    el.classList.remove(cls)
    // Force reflow so re-applied class re-runs the animation.
    void el.offsetWidth // eslint-disable-line no-unused-expressions
    el.classList.add(cls)
    window.setTimeout(() => el.classList.remove(cls), size === 'lg' ? 700 : 400)
}
