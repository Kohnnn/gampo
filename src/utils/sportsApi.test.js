import { describe, it, expect } from 'vitest'
import { impliedFromDecimal, bestBookmakerPrice, fixtureFromOddsApi } from '../services/sportsApi.js'

// sportsApi.js is now pure + keyless (network + key rotation moved server-side
// to server/sportsbookProviderProxy.js so no API key reaches the client bundle).
// These tests cover the remaining normalization helpers.

describe('sportsApi pure helpers', () => {
    it('reads NO VITE_ env (no key can be inlined into the client bundle)', async () => {
        const source = (await import('node:fs')).readFileSync(
            new URL('../services/sportsApi.js', import.meta.url), 'utf8')
        expect(source).not.toMatch(/import\.meta\.env/)
        expect(source).not.toMatch(/VITE_ODDS_API_KEYS/)
        expect(source).not.toMatch(/\bfetch\s*\(/)
    })

    it('impliedFromDecimal computes correctly', () => {
        expect(impliedFromDecimal(2)).toBeCloseTo(0.5, 5)
        expect(impliedFromDecimal(1.5)).toBeCloseTo(0.6667, 3)
        expect(impliedFromDecimal(1)).toBe(0)
    })

    it('bestBookmakerPrice picks the highest decimal odds', () => {
        const bms = [
            { key: 'a', title: 'A', markets: [{ key: 'h2h', outcomes: [{ name: 'Home', price: 1.8 }] }] },
            { key: 'b', title: 'B', markets: [{ key: 'h2h', outcomes: [{ name: 'Home', price: 2.05 }] }] },
        ]
        const best = bestBookmakerPrice(bms, 'h2h', 'Home')
        expect(best.bookmaker).toBe('b')
        expect(best.price).toBe(2.05)
    })

    it('fixtureFromOddsApi normalizes shape and de-vigs probabilities', () => {
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
        const fx = fixtureFromOddsApi(event)
        expect(fx.markets.length).toBe(3)
        const totalTrue = fx.markets.reduce((s, m) => s + m.trueProbability, 0)
        expect(totalTrue).toBeCloseTo(1, 3)
        expect(fx.bookmaker).toBe('a')
    })
})
