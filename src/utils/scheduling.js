// useCancellableTimeouts — small ref-based scheduler so games can queue
// `setTimeout` callbacks (phase resets, deferred settles) and have them
// reliably cancelled on unmount or when a new round starts.
//
// Usage:
//   const { schedule, cancelAll } = useCancellableTimeouts()
//   schedule(() => setPhase('idle'), 1100)
//   // on round restart:
//   cancelAll()

import { useCallback, useEffect, useRef } from 'react'

export function useCancellableTimeouts() {
    const timersRef = useRef(new Set())

    const schedule = useCallback((fn, delay) => {
        const id = window.setTimeout(() => {
            timersRef.current.delete(id)
            try { fn() } catch (err) {
                // eslint-disable-next-line no-console
                console.warn('cancellable timeout threw:', err)
            }
        }, delay)
        timersRef.current.add(id)
        return id
    }, [])

    const cancel = useCallback((id) => {
        if (timersRef.current.has(id)) {
            window.clearTimeout(id)
            timersRef.current.delete(id)
        }
    }, [])

    const cancelAll = useCallback(() => {
        for (const id of timersRef.current) window.clearTimeout(id)
        timersRef.current.clear()
    }, [])

    useEffect(() => () => {
        for (const id of timersRef.current) window.clearTimeout(id)
        timersRef.current.clear()
    }, [])

    return { schedule, cancel, cancelAll }
}

// Race a promise against a timeout. Resolves with `{ timedOut: false, value }`
// if the promise resolves first, or `{ timedOut: true }` if the timeout wins.
// Used by BetPanel's autoplay loop so a stuck game can't hang the loop.
export function withTimeout(promise, ms) {
    return new Promise((resolve) => {
        let settled = false
        const timer = setTimeout(() => {
            if (settled) return
            settled = true
            resolve({ timedOut: true })
        }, ms)
        Promise.resolve(promise).then(
            (value) => {
                if (settled) return
                settled = true
                clearTimeout(timer)
                resolve({ timedOut: false, value })
            },
            (err) => {
                if (settled) return
                settled = true
                clearTimeout(timer)
                resolve({ timedOut: false, value: { profit: 0, error: err } })
            },
        )
    })
}
