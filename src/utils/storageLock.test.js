import { describe, it, expect, afterEach, vi } from 'vitest'
import {
    STORAGE_LOCK_NAME,
    onStorageReplaced,
    updateStorageUnderLock,
    storageLocksAvailable,
    withStorageLock,
} from './storageLock'

function installLocks({ grant = true } = {}) {
    const queues = new Map()
    const order = []
    if (!grant) {
        vi.stubGlobal('navigator', {})
        return { order }
    }
    vi.stubGlobal('navigator', {
        locks: {
            request(name, optionsOrCallback, maybeCallback) {
                const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback
                const previous = queues.get(name) || Promise.resolve()
                const run = previous.then(async () => {
                    order.push('enter')
                    try {
                        return await callback()
                    } finally {
                        order.push('exit')
                    }
                })
                queues.set(name, run.catch(() => {}))
                return run
            },
        },
    })
    return { order }
}

describe('storageLock', () => {
    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it('reports availability from navigator.locks', () => {
        installLocks({ grant: false })
        expect(storageLocksAvailable()).toBe(false)
        installLocks()
        expect(storageLocksAvailable()).toBe(true)
    })

    it('refuses to run unprotected when Web Locks is missing', async () => {
        installLocks({ grant: false })
        let ran = false
        await expect(withStorageLock(() => { ran = true })).rejects.toMatchObject({ lockUnavailable: true })
        expect(ran).toBe(false)
    })

    it('serialises overlapping critical sections for the same lock name', async () => {
        const { order } = installLocks()
        const events = []
        const first = withStorageLock(async () => {
            events.push('a-start')
            await Promise.resolve()
            events.push('a-end')
        })
        const second = withStorageLock(async () => {
            events.push('b-start')
            events.push('b-end')
        })
        await Promise.all([first, second])
        expect(events).toEqual(['a-start', 'a-end', 'b-start', 'b-end'])
        expect(order).toEqual(['enter', 'exit', 'enter', 'exit'])
    })

    it('passes the callback result through', async () => {
        installLocks()
        await expect(withStorageLock(() => 42)).resolves.toBe(42)
    })

    it('uses the documented lock name', async () => {
        installLocks()
        const names = []
        globalThis.navigator.locks.request = (name, _options, callback) => {
            names.push(name)
            return callback()
        }
        await withStorageLock(() => null)
        expect(names).toEqual([STORAGE_LOCK_NAME])
    })

    it('reads inside the critical section so a concurrent write is observed', async () => {
        installLocks()
        const store = { value: 'old' }
        // A concurrent writer that lands before the lock is acquired.
        const concurrent = withStorageLock(async () => { store.value = 'concurrent' })
        const mutation = updateStorageUnderLock(
            () => store.value,
            current => { store.value = `${current}+applied`; return store.value },
        )
        await Promise.all([concurrent, mutation])
        expect(store.value).toBe('concurrent+applied')
    })

    it('propagates errors and releases the lock for later waiters', async () => {
        installLocks()
        await expect(withStorageLock(() => { throw new Error('boom') })).rejects.toThrow('boom')
        await expect(withStorageLock(() => 'after')).resolves.toBe('after')
    })

    it('notifies peer documents through BroadcastChannel and unsubscribes', async () => {
        installLocks()
        const peers = new Set()
        class FakeChannel {
            constructor() {
                this.listeners = new Set()
                peers.add(this)
            }
            addEventListener(_type, handler) {
                this.listeners.add(handler)
            }
            removeEventListener(_type, handler) {
                this.listeners.delete(handler)
            }
            postMessage(data) {
                for (const peer of peers) {
                    if (peer === this) continue
                    for (const handler of peer.listeners) handler({ data })
                }
            }
            close() {
                peers.delete(this)
            }
        }
        vi.stubGlobal('BroadcastChannel', FakeChannel)
        const { broadcastStorageReplaced } = await import('./storageLock')
        const seen = []
        const stop = onStorageReplaced(detail => seen.push(detail))
        broadcastStorageReplaced({ reason: 'import' })
        expect(seen).toEqual([{ reason: 'import' }])
        stop()
        broadcastStorageReplaced({ reason: 'again' })
        expect(seen).toHaveLength(1)
    })

    it('reports false when BroadcastChannel is unavailable', async () => {
        installLocks()
        vi.stubGlobal('BroadcastChannel', undefined)
        const { broadcastStorageReplaced, onStorageReplaced: subscribe } = await import('./storageLock')
        expect(broadcastStorageReplaced({ reason: 'import' })).toBe(false)
        expect(subscribe(() => {})()).toBeUndefined()
    })
})
