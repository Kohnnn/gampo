import { describe, expect, it, vi } from 'vitest'
import { BGM_UNLOCK_EVENTS, addBgmUnlockRetry } from './useBgm'

function makeTarget() {
    const listeners = new Map()
    return {
        listeners,
        addEventListener: vi.fn((eventName, handler) => {
            listeners.set(eventName, handler)
        }),
        removeEventListener: vi.fn((eventName, handler) => {
            if (listeners.get(eventName) === handler) listeners.delete(eventName)
        }),
    }
}

describe('addBgmUnlockRetry', () => {
    it('retries once on the first unlock gesture and removes all listeners', () => {
        const target = makeTarget()
        const retry = vi.fn()
        addBgmUnlockRetry(target, retry)

        expect([...target.listeners.keys()]).toEqual(BGM_UNLOCK_EVENTS)
        target.listeners.get('pointerdown')()
        target.listeners.get('keydown')?.()

        expect(retry).toHaveBeenCalledTimes(1)
        expect(target.listeners.size).toBe(0)
    })

    it('returns a cleanup function that removes pending retry listeners', () => {
        const target = makeTarget()
        const retry = vi.fn()
        const cleanup = addBgmUnlockRetry(target, retry)

        cleanup()

        expect(retry).not.toHaveBeenCalled()
        expect(target.listeners.size).toBe(0)
    })
})
