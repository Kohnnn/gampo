import { describe, it, expect, beforeEach, vi } from 'vitest'

// Stub localStorage
beforeEach(() => {
    const store = new Map()
    globalThis.localStorage = {
        getItem: (k) => store.has(k) ? store.get(k) : null,
        setItem: (k, v) => { store.set(k, String(v)) },
        removeItem: (k) => { store.delete(k) },
        clear: () => store.clear(),
    }
    vi.restoreAllMocks()
})

async function importFresh() {
    vi.resetModules()
    return await import('../services/sportsApi.js')
}

describe('sportsApi', () => {
    it('caches successful responses for the TTL', async () => {
        const mod = await importFresh()
        const fetchMock = vi.fn(async () => new Response(JSON.stringify([{ id: 'a' }]), { status: 200, headers: { 'x-requests-remaining': '100' } }))
        globalThis.fetch = fetchMock
        const r1 = await mod.fetchInSeasonSports()
        const r2 = await mod.fetchInSeasonSports()
        expect(r1.cached).toBe(false)
        expect(r2.cached).toBe(true)
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('rotates keys on 401 and cools the bad key down', async () => {
        const mod = await importFresh()
        let call = 0
        const fetchMock = vi.fn(async () => {
            call++
            if (call === 1) return new Response('forbidden', { status: 401 })
            return new Response(JSON.stringify([{ id: 'b' }]), { status: 200, headers: {} })
        })
        globalThis.fetch = fetchMock
        const result = await mod.fetchInSeasonSports()
        expect(result.data.length).toBe(1)
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('records remaining quota from response headers', async () => {
        const mod = await importFresh()
        const fetchMock = vi.fn(async () => new Response(JSON.stringify([]), { status: 200, headers: { 'x-requests-remaining': '420', 'x-requests-used': '80' } }))
        globalThis.fetch = fetchMock
        await mod.fetchInSeasonSports()
        const snapshot = mod.getQuotaSnapshot()
        const values = Object.values(snapshot)
        expect(values[0]?.remaining).toBe(420)
    })

    it('impliedFromDecimal computes correctly', async () => {
        const mod = await importFresh()
        expect(mod.impliedFromDecimal(2)).toBeCloseTo(0.5, 5)
        expect(mod.impliedFromDecimal(1.5)).toBeCloseTo(0.6667, 3)
        expect(mod.impliedFromDecimal(1)).toBe(0)
    })

    it('bestBookmakerPrice picks the highest decimal odds', async () => {
        const mod = await importFresh()
        const bms = [
            { key: 'a', title: 'A', markets: [{ key: 'h2h', outcomes: [{ name: 'Home', price: 1.8 }] }] },
            { key: 'b', title: 'B', markets: [{ key: 'h2h', outcomes: [{ name: 'Home', price: 2.05 }] }] },
        ]
        const best = mod.bestBookmakerPrice(bms, 'h2h', 'Home')
        expect(best.bookmaker).toBe('b')
        expect(best.price).toBe(2.05)
    })

    it('fixtureFromOddsApi normalizes shape and de-vigs probabilities', async () => {
        const mod = await importFresh()
        const event = {
            id: 'evt-1',
            sport_title: 'Soccer EPL',
            home_team: 'Home',
            away_team: 'Away',
            commence_time: '2026-05-20T19:00:00Z',
            bookmakers: [
                {
                    key: 'a',
                    title: 'A',
                    markets: [{
                        key: 'h2h',
                        outcomes: [
                            { name: 'Home', price: 2.0 },
                            { name: 'Draw', price: 3.5 },
                            { name: 'Away', price: 4.0 },
                        ],
                    }],
                },
            ],
        }
        const fx = mod.fixtureFromOddsApi(event)
        expect(fx.markets.length).toBe(3)
        const totalTrue = fx.markets.reduce((s, m) => s + m.trueProbability, 0)
        expect(totalTrue).toBeCloseTo(1, 3)
        expect(fx.bookmaker).toBe('a')
    })
})
