import { describe, expect, it, vi } from 'vitest'
import { createFreeFeedHandler } from '../../api/sportsbook/free-feed.js'

describe('Vercel free-feed handler', () => {
    it('returns feed data while omitting internal errors and quotas for GET', async () => {
        const secret = 'https://provider.test/feed?apiKey=fake-secret'
        const loadFeed = vi.fn(async () => ({
            generatedAt: '2026-07-14T00:00:00.000Z',
            sources: { provider: { configured: true } },
            marquee: { shownCount: 1 },
            sportsGameOdds: { events: [{ id: 'event-1', home: 'Home', away: 'Away' }] },
            errors: [`provider returned 401: ${secret}`],
            quotas: { provider: { limit: 100, remaining: 37 } },
        }))
        const response = await createFreeFeedHandler({ loadFeed, env: { FIXTURE: 'fake-value' } })(new Request('https://example.test/api/sportsbook/free-feed'))
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
        expect(response.headers.get('cache-control')).toBe('no-store')
        expect(body).toMatchObject({
            generatedAt: '2026-07-14T00:00:00.000Z',
            sources: { provider: { configured: true } },
            marquee: { shownCount: 1 },
            sportsGameOdds: { events: [{ id: 'event-1', home: 'Home', away: 'Away' }] },
            errors: [],
            quotas: {},
        })
        expect(JSON.stringify(body)).not.toContain(secret)
        expect(JSON.stringify(body)).not.toContain('provider returned 401')
        expect(JSON.stringify(body)).not.toContain('100')
        expect(JSON.stringify(body)).not.toContain('37')
        expect(loadFeed).toHaveBeenCalledWith({ FIXTURE: 'fake-value' })
    })

    it('sanitizes non-object loader output', async () => {
        const response = await createFreeFeedHandler({ loadFeed: async () => 'upstream detail' })(new Request('https://example.test/api/sportsbook/free-feed'))

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ errors: [], quotas: {} })
    })

    it('rejects non-GET methods as JSON', async () => {
        const response = await createFreeFeedHandler()(
            new Request('https://example.test/api/sportsbook/free-feed', { method: 'POST' }),
        )

        expect(response.status).toBe(405)
        expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
        expect(response.headers.get('allow')).toBe('GET')
        expect(await response.json()).toEqual({ errors: ['method not allowed'] })
    })

    it('returns a generic JSON failure when the provider loader rejects', async () => {
        const response = await createFreeFeedHandler({
            loadFeed: async () => Promise.reject(new Error('provider request failed')),
            env: { FIXTURE: 'fake-value' },
        })(new Request('https://example.test/api/sportsbook/free-feed'))

        expect(response.status).toBe(502)
        expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
        expect(response.headers.get('cache-control')).toBe('no-store')
        expect(await response.json()).toEqual({ errors: ['sportsbook provider proxy failed'] })
    })
})
