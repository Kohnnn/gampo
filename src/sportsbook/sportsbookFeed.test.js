import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchFreeProviderFeed, loadSportsbookFeed } from './sportsbookFeed'

const shellSource = readFileSync(new URL('./SportsbookShell.jsx', import.meta.url), 'utf8')
const netlifyToml = readFileSync(new URL('../../netlify.toml', import.meta.url), 'utf8')
const netlifyFunction = readFileSync(new URL('../../netlify/functions/sportsbook-free-feed.mjs', import.meta.url), 'utf8')
const sportsHomeSource = readFileSync(new URL('./components/SportsHome.jsx', import.meta.url), 'utf8')

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

    it('uses only live feed events (no synthetic Practice teams) when a feed is available', async () => {
        const payload = {
            generatedAt: new Date().toISOString(),
            sources: { pandascore: { configured: true, eventCount: 2 } },
            quotas: {},
            marquee: { candidateCount: 2, shownCount: 1, skippedCount: 1, marqueeCount: 1, bigMatchOnly: true },
            errors: [],
            pandascore: {
                matches: [
                    {
                        id: 9001,
                        status: 'running',
                        begin_at: new Date().toISOString(),
                        videogame: { slug: 'cs-go', name: 'CS2' },
                        league: { name: 'Real Major League' },
                        opponents: [
                            { opponent: { name: 'Team Falcon' } },
                            { opponent: { name: 'Team Spirit Real' } },
                        ],
                    },
                    {
                        id: 9002,
                        status: 'not_started',
                        begin_at: new Date(Date.now() + 3600_000).toISOString(),
                        videogame: { slug: 'dota2', name: 'Dota 2' },
                        league: { name: 'Real Arena' },
                        opponents: [
                            { opponent: { name: 'Squad Alpha' } },
                            { opponent: { name: 'Squad Omega' } },
                        ],
                    },
                ],
            },
        }
        globalThis.fetch = vi.fn(async (url) => {
            if (String(url).includes('/api/sportsbook/free-feed')) {
                return { ok: true, status: 200, json: async () => payload }
            }
            // odds-api + in-season calls return empty.
            return { ok: true, status: 200, json: async () => [] }
        })

        const feed = await loadSportsbookFeed()

        expect(feed.feedSource).toBe('live')
        expect(feed.events.length).toBeGreaterThan(0)
        // No synthetic source and no "Practice" teams should survive.
        expect(feed.events.every(event => event.source !== 'synthetic')).toBe(true)
        const blob = feed.events.map(e => `${e.home} ${e.away}`).join(' ')
        expect(blob).not.toMatch(/Practice|Harbor United|River City/i)
        // Live events get curation tags so the home shelves render real teams.
        expect(feed.events.some(event => event.tags?.includes('top'))).toBe(true)
        expect(feed.events.some(event => event.tags?.includes('popular'))).toBe(true)
        expect(feed.marquee).toMatchObject({ candidateCount: 2, shownCount: 1, skippedCount: 1, marqueeCount: 1 })
        expect(sportsHomeSource).toContain('Big-match feed guard active')
        expect(sportsHomeSource).toContain('Big Match Only')
    })
})
