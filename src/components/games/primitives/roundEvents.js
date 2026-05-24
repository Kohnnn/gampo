// Round event helpers + state machine for Stake/Rainbet-style originals.
//
// Pattern from `combined-stake-rainbet-implementation-guide-2026-05-24.md`:
//   Idle -> Configuring -> Running -> Resolving -> Result -> Idle
//
// Games emit ordered events from a deterministic round generator. The React
// UI plays those events in order. The frontend should not silently
// recalculate visible outcomes while animating.
//
// Public API:
//   makeRoundEvent(index, type, payload?, at?)
//   ROUND_STATES, ROUND_EVENTS
//   useRoundMachine({ onEvent }) -> { state, events, start, finish, reset }
//
// `start(eventList, opts?)` accepts a pre-baked event list and walks it,
// firing onEvent per event scheduled at its `at` ms offset. The machine
// transitions:
//   start()   -> running
//   final     -> resolving
//   onEvent ROUND_RESULT -> result
//   reset()   -> idle
//
// `finish()` resolves immediately when called by the game (e.g. user clicks
// cash out and the engine flushes). It marks the run as ended and lets the
// machine settle to result.

import { useCallback, useEffect, useRef, useState } from 'react'

export const ROUND_STATES = Object.freeze({
    IDLE: 'idle',
    CONFIGURING: 'configuring',
    RUNNING: 'running',
    RESOLVING: 'resolving',
    RESULT: 'result',
})

export const ROUND_EVENTS = Object.freeze({
    ROUND_START: 'round:start',
    INPUT_LOCK: 'input:lock',
    BET_ACCEPTED: 'bet:accepted',
    STAGE_SELECT: 'stage:select',
    RNG_REVEAL: 'rng:reveal',
    MULTIPLIER_UPDATE: 'multiplier:update',
    ANIMATION_CHECKPOINT: 'animation:checkpoint',
    ROUND_RESULT: 'round:result',
    PAYOUT_PREVIEW: 'payout:preview',
    BALANCE_UPDATE: 'balance:update',
    INPUT_UNLOCK: 'input:unlock',
})

export function makeRoundEvent(index, type, payload = {}, at = 0) {
    return { index, type, payload, at }
}

// Build a complete event list from incremental pushes. Convenience for game
// engines that want to construct events imperatively.
export function buildEvents(builder) {
    const events = []
    let nextIndex = 0
    const api = {
        push(type, payload = {}, at = 0) {
            const ev = makeRoundEvent(nextIndex++, type, payload, at)
            events.push(ev)
            return ev
        },
        list: events,
    }
    builder(api)
    // Stable order by `at` then index, so engines can push out-of-order.
    events.sort((a, b) => a.at - b.at || a.index - b.index)
    return events
}

export function useRoundMachine({ onEvent } = {}) {
    const [state, setState] = useState(ROUND_STATES.IDLE)
    const [events, setEvents] = useState([])
    const timersRef = useRef([])
    const cancelledRef = useRef(false)

    const clearTimers = useCallback(() => {
        timersRef.current.forEach(t => clearTimeout(t))
        timersRef.current = []
    }, [])

    const reset = useCallback(() => {
        cancelledRef.current = true
        clearTimers()
        setEvents([])
        setState(ROUND_STATES.IDLE)
    }, [clearTimers])

    const finish = useCallback((finalPayload = {}) => {
        clearTimers()
        setState(ROUND_STATES.RESOLVING)
        const ev = makeRoundEvent(Number.MAX_SAFE_INTEGER, ROUND_EVENTS.ROUND_RESULT, finalPayload, 0)
        setEvents(prev => [...prev, ev])
        if (onEvent) {
            try { onEvent(ev) } catch (e) { /* ignore */ }
        }
        setState(ROUND_STATES.RESULT)
    }, [clearTimers, onEvent])

    const start = useCallback((eventList = [], { autoFinish = true } = {}) => {
        clearTimers()
        cancelledRef.current = false
        setEvents(eventList)
        setState(ROUND_STATES.RUNNING)
        eventList.forEach(ev => {
            const t = setTimeout(() => {
                if (cancelledRef.current) return
                if (onEvent) {
                    try { onEvent(ev) } catch (e) { /* ignore */ }
                }
                if (ev.type === ROUND_EVENTS.ROUND_RESULT) {
                    setState(ROUND_STATES.RESULT)
                }
            }, Math.max(0, ev.at | 0))
            timersRef.current.push(t)
        })
        if (autoFinish) {
            const last = eventList[eventList.length - 1]
            const finalAt = last ? Math.max(0, last.at | 0) : 0
            const t = setTimeout(() => {
                if (cancelledRef.current) return
                setState(prev => prev === ROUND_STATES.RUNNING ? ROUND_STATES.RESOLVING : prev)
                setState(prev => prev === ROUND_STATES.RESOLVING ? ROUND_STATES.RESULT : prev)
            }, finalAt + 16)
            timersRef.current.push(t)
        }
    }, [clearTimers, onEvent])

    useEffect(() => () => {
        cancelledRef.current = true
        clearTimers()
    }, [clearTimers])

    return { state, events, start, finish, reset }
}
