import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchFreeProviderFeed, loadSportsbookFeed } from './sportsbookFeed'

const shellSource = readFileSync(new URL('./SportsbookShell.jsx', import.meta.url), 'utf8')
const netlifyToml = readFileSync(new URL('../../netlify.toml', import.meta.url), 'utf8')
const netlifyFunction = readFileSync(new URL('../../netlify/functions/sportsbook-free-feed.mjs', import.meta.url), 'utf8')

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

    it('labels synthetic fallback and exposes the Netlify free-feed endpoint', async () => {
        globalThis.fetch = vi.fn(async () => ({ ok: false, status: 404 }))

        const feed = await loadSportsbookFeed()

        expect(feed.feedSource).toBe('fallback')
        expect(shellSource).toContain('data-sportsbook-feed-source')
        expect(shellSource).toContain('synthetic practice fallback')
        expect(netlifyToml).toContain('from = "/api/sportsbook/free-feed"')
        expect(netlifyFunction).toContain('loadProviderFeed(process.env)')
    })
})
