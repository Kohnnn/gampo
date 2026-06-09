// useScrollActionIntoView - brings a primary game action/animation into view.
//
// Several games render their primary action or result/animation below the fold
// on mobile (Cases reel, Poker action bar). Tapping the action then appears to
// "do nothing" because the visible change is off-screen. This hook scrolls a
// target ref into view whenever a trigger value changes (e.g. a spin starts or
// it becomes the player's turn), honoring reduced-motion.
//
// Usage:
//   const ref = useRef(null)
//   useScrollActionIntoView(ref, shouldScroll, [dep])
//   <div ref={ref}>...</div>

import { useEffect } from 'react'

export function prefersReducedMotion() {
    if (typeof window === 'undefined') return false
    return Boolean(
        window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
        || document.documentElement?.classList?.contains('gampo-reduce-motion'),
    )
}

// Pure helper (unit-testable): decides whether and how to scroll given the
// active flag, the element, and the reduced-motion preference. Returns the
// scrollIntoView options to use, or null when no scroll should happen.
export function resolveScrollPlan({ active, hasElement, reducedMotion, block = 'center' }) {
    if (!active || !hasElement) return null
    return { behavior: reducedMotion ? 'auto' : 'smooth', block }
}

export function useScrollActionIntoView(ref, active, deps = [], options = {}) {
    const { block = 'center' } = options
    useEffect(() => {
        const plan = resolveScrollPlan({
            active,
            hasElement: Boolean(ref?.current),
            reducedMotion: prefersReducedMotion(),
            block,
        })
        if (!plan) return undefined
        const raf = requestAnimationFrame(() => {
            ref.current?.scrollIntoView(plan)
        })
        return () => cancelAnimationFrame(raf)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps)
}

export default useScrollActionIntoView
