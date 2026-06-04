import { describe, expect, it } from 'vitest'
import {
    normalizeApiFootballFixture,
    normalizeFreeProviderPayload,
    normalizeOddsApiIoEvent,
    normalizePandaScoreMatch,
    normalizeSportsGameOddsEvent,
} from './freeFeedAdapters'

describe('free provider sportsbook adapters', () => {
    it('normalizes PandaScore esports matches without external odds', () => {
        const event = normalizePandaScoreMatch({
            id: 123,
            status: 'not_started',
            begin_at: '2026-05-26T12:00:00Z',
            videogame: { slug: 'valorant', name: 'Valorant' },
            league: { name: 'VCT Practice' },
            opponents: [
                { opponent: { name: 'Alpha Five' } },
                { opponent: { name: 'Beta Core' } },
            ],
        })

        expect(event.sportId).toBe('valorant')
        expect(event.status).toBe('prematch')
        expect(event.marketGroups[0].selections).toHaveLength(2)
        expect(event.marketGroups[0].selections[0].decimalOdds).toBeGreaterThan(1)
    })

    it('normalizes odds-api.io events and uses supplied market prices', () => {
        const event = normalizeOddsApiIoEvent(
            {
                id: 'event-1',
                sport: 'football',
                league: 'Demo League',
                home: 'Harbor United',
                away: 'River City FC',
                startTime: '2026-05-26T15:00:00Z',
            },
            [
                {
                    eventId: 'event-1',
                    bookmakers: [
                        {
                            markets: [
                                {
                                    name: 'Moneyline',
                                    outcomes: [
                                        { name: 'Harbor United', price: 2.15 },
                                        { name: 'Draw', price: 3.4 },
                                        { name: 'River City FC', price: 2.95 },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        )

        const odds = event.marketGroups[0].selections.map(selection => selection.decimalOdds)
        expect(event.sportId).toBe('soccer')
        expect(odds).toEqual([2.15, 3.4, 2.95])
    })

    it('normalizes API-Football fixtures with match-winner odds', () => {
        const payload = normalizeFreeProviderPayload({
            apiFootball: {
                fixtures: [
                    {
                        fixture: { id: 77, date: '2026-05-26T18:00:00Z', status: { short: 'NS' } },
                        league: { name: 'Practice League', country: 'England' },
                        teams: {
                            home: { name: 'Capital Albion' },
                            away: { name: 'Westport SC' },
                        },
                        goals: { home: null, away: null },
                    },
                ],
                odds: [
                    {
                        fixture: { id: 77 },
                        bookmakers: [
                            {
                                bets: [
                                    {
                                        id: 1,
                                        name: 'Match Winner',
                                        values: [
                                            { value: 'Home', odd: '1.90' },
                                            { value: 'Draw', odd: '3.20' },
                                            { value: 'Away', odd: '4.10' },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        })

        expect(payload.events).toHaveLength(1)
        expect(normalizeApiFootballFixture).toBeTypeOf('function')
        expect(payload.events[0].marketGroups[0].selections.map(selection => selection.decimalOdds)).toEqual([1.9, 3.2, 4.1])
    })

    it('normalizes SportsGameOdds moneyline, spread, and totals', () => {
        const event = normalizeSportsGameOddsEvent({
            eventID: 'sgo-1',
            sportID: 'BASKETBALL',
            leagueID: 'NBA',
            teams: {
                home: { names: { long: 'Denver Peaks' } },
                away: { names: { long: 'Miami Tides' } },
            },
            status: { startsAt: '2026-05-26T20:00:00Z', started: false, ended: false },
            odds: {
                'points-home-game-ml-home': {
                    byBookmaker: { fanduel: { odds: '-120', available: true } },
                },
                'points-away-game-ml-away': {
                    byBookmaker: { fanduel: { odds: '+110', available: true } },
                },
                'points-home-game-sp-home': {
                    byBookmaker: { fanduel: { odds: '-105', spread: '-2.5', available: true } },
                },
                'points-away-game-sp-away': {
                    byBookmaker: { fanduel: { odds: '-115', spread: '+2.5', available: true } },
                },
                'points-all-game-ou-over': {
                    byBookmaker: { fanduel: { odds: '-110', overUnder: '221.5', available: true } },
                },
                'points-all-game-ou-under': {
                    byBookmaker: { fanduel: { odds: '-110', overUnder: '221.5', available: true } },
                },
            },
        })

        expect(event.source).toBe('sportsgameodds')
        expect(event.sportId).toBe('basketball')
        expect(event.marketGroups.map(group => group.id)).toEqual(['winner', 'spread', 'total'])
        expect(event.marketGroups[0].selections.map(selection => selection.decimalOdds)).toEqual([1.83, 2.1])
    })

    it('preserves provider team display names exactly while normalizing internal sport ids', () => {
        const event = normalizeSportsGameOddsEvent({
            eventID: 'sgo-display',
            sportID: 'BASKETBALL',
            leagueID: 'NBA',
            teams: {
                home: { names: { long: 'Denver PEAKS 2026' } },
                away: { names: { long: 'Miami-Tides FC' } },
            },
            status: { startsAt: '2026-05-26T20:00:00Z' },
            odds: {},
        })

        expect(event.sportId).toBe('basketball')
        expect(event.home).toBe('Denver PEAKS 2026')
        expect(event.away).toBe('Miami-Tides FC')
        expect(event.participants).toEqual(['Denver PEAKS 2026', 'Miami-Tides FC'])
        expect(event.marketGroups[0].selections.map(selection => selection.label)).toEqual(['Denver PEAKS 2026', 'Miami-Tides FC'])
    })
})
