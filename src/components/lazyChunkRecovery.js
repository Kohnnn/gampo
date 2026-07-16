export const LAZY_CHUNK_RECOVERY_SESSION_KEY = 'gampo:lazy-chunk-recovery'

export function isLazyChunkError(error) {
    const message = typeof error === 'string'
        ? error
        : error?.message || error?.name || ''
    return /unable to preload css|failed to (fetch )?dynamically imported module|chunkloaderror|loading chunk/i.test(message)
}

export function recoverLazyChunk(error, browser = globalThis.window) {
    if (!isLazyChunkError(error)) return false
    try {
        const storage = browser?.sessionStorage
        if (!storage || storage.getItem(LAZY_CHUNK_RECOVERY_SESSION_KEY)) return false
        if (typeof browser.location?.reload !== 'function') return false
        storage.setItem(LAZY_CHUNK_RECOVERY_SESSION_KEY, '1')
        browser.location.reload()
        return true
    } catch {
        return false
    }
}

export function installLazyChunkRecoveryListener(browser = globalThis.window) {
    if (!browser?.addEventListener || !browser?.removeEventListener) return () => {}
    const listener = event => {
        if (recoverLazyChunk(event?.payload, browser)) event.preventDefault?.()
    }
    browser.addEventListener('vite:preloadError', listener)
    return () => browser.removeEventListener('vite:preloadError', listener)
}
