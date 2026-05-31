import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchFreeProviderFeed } from './sportsbookFeed'

afterEach(() => {
    vi.restoreAllMocks()
    delete globalThis.fetch
    delete globalThis.location
})

describe('fetchFreeProviderFeed', () => {
    it('treats the local free-feed proxy as optional in static preview', async () => {
        globalThis.fetch = vi.fn(async () => ({
            ok: false,
            status: 404,
        }))

        const result = await fetchFreeProviderFeed()

        expect(result.events).toEqual([])
        expect(result.errors).toEqual([])
    })

    it('keeps non-404 proxy failures visible', async () => {
        globalThis.fetch = vi.fn(async () => ({
            ok: false,
            status: 500,
        }))

        const result = await fetchFreeProviderFeed()

        expect(result.events).toEqual([])
        expect(result.errors).toEqual(['free feed proxy 500'])
    })

    it('skips the optional proxy request under Vite static preview', async () => {
        globalThis.location = { hostname: '127.0.0.1', port: '4173' }
        globalThis.fetch = vi.fn()

        const result = await fetchFreeProviderFeed()

        expect(result.events).toEqual([])
        expect(result.errors).toEqual([])
        expect(globalThis.fetch).not.toHaveBeenCalled()
    })
})
