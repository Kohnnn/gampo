import { describe, expect, it, vi } from 'vitest'
import {
    LAZY_CHUNK_RECOVERY_SESSION_KEY,
    installLazyChunkRecoveryListener,
    isLazyChunkError,
    recoverLazyChunk,
} from './lazyChunkRecovery'

function createBrowser({ stored = null, storageFails = false } = {}) {
    const listeners = new Map()
    const storage = {
        getItem: vi.fn(() => {
            if (storageFails) throw new Error('storage unavailable')
            return stored
        }),
        setItem: vi.fn(() => {
            if (storageFails) throw new Error('storage unavailable')
        }),
    }
    return {
        listeners,
        sessionStorage: storage,
        location: { reload: vi.fn() },
        addEventListener: vi.fn((name, listener) => listeners.set(name, listener)),
        removeEventListener: vi.fn((name, listener) => {
            if (listeners.get(name) === listener) listeners.delete(name)
        }),
    }
}

describe('lazy chunk recovery', () => {
    it.each([
        'Unable to preload CSS for /assets/game.css',
        'Failed to fetch dynamically imported module',
        'TypeError: Failed to fetch dynamically imported module',
        'ChunkLoadError: Loading chunk 42 failed',
        'Loading chunk 42 failed',
    ])('recognizes %s', message => {
        expect(isLazyChunkError(new Error(message))).toBe(true)
    })

    it('rejects ordinary runtime errors', () => {
        expect(isLazyChunkError(new Error('game state is invalid'))).toBe(false)
        expect(isLazyChunkError(null)).toBe(false)
    })

    it('reloads once and records a session guard', () => {
        const browser = createBrowser()

        expect(recoverLazyChunk(new Error('Loading chunk 4 failed'), browser)).toBe(true)
        expect(browser.sessionStorage.setItem).toHaveBeenCalledWith(LAZY_CHUNK_RECOVERY_SESSION_KEY, '1')
        expect(browser.location.reload).toHaveBeenCalledTimes(1)
        expect(recoverLazyChunk(new Error('Loading chunk 4 failed'), createBrowser({ stored: '1' }))).toBe(false)
    })

    it('does nothing when browser support or session storage is unavailable', () => {
        expect(recoverLazyChunk(new Error('Loading chunk 4 failed'), undefined)).toBe(false)
        const browser = createBrowser({ storageFails: true })
        expect(recoverLazyChunk(new Error('Loading chunk 4 failed'), browser)).toBe(false)
        expect(browser.location.reload).not.toHaveBeenCalled()
    })

    it('handles only Vite preload failures and returns cleanup', () => {
        const browser = createBrowser()
        const cleanup = installLazyChunkRecoveryListener(browser)
        const preventDefault = vi.fn()

        browser.listeners.get('vite:preloadError')({
            payload: new Error('Unable to preload CSS'),
            preventDefault,
        })
        expect(preventDefault).toHaveBeenCalledTimes(1)
        expect(browser.location.reload).toHaveBeenCalledTimes(1)

        browser.listeners.get('vite:preloadError')({
            payload: new Error('ordinary game error'),
            preventDefault,
        })
        expect(preventDefault).toHaveBeenCalledTimes(1)
        cleanup()
        expect(browser.listeners.size).toBe(0)
    })
})
