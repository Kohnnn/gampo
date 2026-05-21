import { describe, it, expect, vi } from 'vitest'
import { withTimeout } from './scheduling'

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
