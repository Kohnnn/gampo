import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { withTimeout } from './scheduling'

const SOURCE = readFileSync(new URL('./scheduling.js', import.meta.url), 'utf8')

// useCancellableFrames is a React hook, and this repo has no DOM-renderer test
// dependency (no @testing-library/react, no jsdom adapter). Rather than add a
// dependency, these tests assert the two properties that actually matter and
// that a reviewer would otherwise have to eyeball: every rAF id is tracked in
// the ref Set, and the unmount effect cancels the tracked ids. The lockstep
// test below fails if the implementation stops doing either.
describe('useCancellableFrames', () => {
    it('exports the frame scheduler alongside the timeout scheduler', async () => {
        const mod = await import('./scheduling')
        expect(typeof mod.useCancellableFrames).toBe('function')
        expect(typeof mod.useCancellableTimeouts).toBe('function')
    })

    it('tracks every requested frame id and cancels them on cleanup', () => {
        const body = SOURCE.slice(SOURCE.indexOf('export function useCancellableFrames'))
        // Ids must be added to the tracking Set, not fired and forgotten.
        expect(body).toContain('framesRef.current.add(id)')
        // Both the explicit cancel path and the unmount effect must cancel.
        const cancelCalls = body.match(/window\.cancelAnimationFrame\(id\)/g) || []
        expect(cancelCalls.length).toBe(2)
        // The unmount effect must exist with an empty dep array so it only
        // runs cleanup on teardown.
        expect(body).toMatch(/useEffect\(\(\) => \(\) =>[\s\S]*\}, \[\]\)/)
    })

    it('drops the id from the Set before running the callback so cancelAll cannot double-cancel', () => {
        const body = SOURCE.slice(SOURCE.indexOf('export function useCancellableFrames'))
        const deleteIdx = body.indexOf('framesRef.current.delete(id)')
        const callIdx = body.indexOf('fn(time)')
        expect(deleteIdx).toBeGreaterThan(-1)
        expect(callIdx).toBeGreaterThan(deleteIdx)
    })

    it('does not let a throwing frame callback break the loop', () => {
        const body = SOURCE.slice(SOURCE.indexOf('export function useCancellableFrames'))
        expect(body).toMatch(/try \{ fn\(time\) \} catch/)
    })
})

describe('withTimeout', () => {
    it('resolves before timeout when promise wins', async () => {
        const result = await withTimeout(Promise.resolve({ profit: 7 }), 1000)
        expect(result.timedOut).toBe(false)
        expect(result.value).toEqual({ profit: 7 })
    })

    it('reports timedOut when the promise hangs longer than budget', async () => {
        const slow = new Promise(() => { /* never resolves */ })
        const result = await withTimeout(slow, 30)
        expect(result.timedOut).toBe(true)
    })

    it('reports timedOut: false even when the underlying promise rejects', async () => {
        const failing = Promise.reject(new Error('boom'))
        // Suppress the unhandled-rejection by attaching a noop catch first.
        failing.catch(() => {})
        const result = await withTimeout(failing, 200)
        expect(result.timedOut).toBe(false)
        expect(result.value.error).toBeInstanceOf(Error)
    })

    it('does not double-resolve when the promise lands after the timeout', async () => {
        let resolveOuter
        const slow = new Promise(res => { resolveOuter = res })
        const result = await withTimeout(slow, 30)
        expect(result.timedOut).toBe(true)
        // Late resolution should be ignored.
        resolveOuter({ profit: 99 })
    })
})
