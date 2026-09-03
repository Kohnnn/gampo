import { describe, expect, it } from 'vitest'
import {
    normalizeApiFootballFixture,
    normalizeApiSportsMultiSportEvent,
    normalizeFreeProviderPayload,
    normalizeOddsApiIoEvent,
    normalizePandaScoreMatch,
    normalizeSportsGameOddsEvent,
    normalizeTheOddsApiEvent,
} from './freeFeedAdapters'
import { driftSyntheticEvents } from './sportsbookData'

describe('free provider sportsbook adapters', () => {
    it('normalizes PandaScore esports matches without external odds', () => {
        const event = normalizePandaScoreMatch({
            id: 123,
            status: 'not_started',
            begin_at: '2026-05-26T12:00:00Z',
            videogame: { slug: 'valorant', name: 'Valorant' },
            league: { name: 'VCT Practice' },
            opponents: [
                { opponent: { name: 'Alpha Five', image_url: 'https://cdn.example.test/alpha.png' } },
                { opponent: { name: 'Beta Core', image_url: 'https://cdn.example.test/beta.png' } },
            ],
        })

        expect(event.sportId).toBe('valorant')
        expect(event.status).toBe('prematch')
        expect(event.marketGroups[0].selections).toHaveLength(2)
        expect(event.marketGroups[0].selections[0].decimalOdds).toBeGreaterThan(1)
        expect(event.tags).toContain('estimated-odds')
        expect(event.marketGroups[0].selections[0].source).toBe('synthetic-estimate')
        expect(event.bookmakerTitle).toBe('Estimated odds')
        expect(event.homeLogo).toBe('https://cdn.example.test/alpha.png')
        expect(event.awayLogo).toBe('https://cdn.example.test/beta.png')
    })

    it('normalizes odds-api.io events and uses supplied market prices', () => {
        const event = normalizeOddsApiIoEvent(
            {
                id: 'event-1',
                sport: 'football',
                league: 'Demo League',
                home: 'Harbor United',
                away: 'River City FC',
                homeLogo: 'https://cdn.example.test/home.svg',
                awayLogo: 'https://cdn.example.test/away.svg',
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
        expect(event.homeLogo).toBe('https://cdn.example.test/home.svg')
        expect(event.awayLogo).toBe('https://cdn.example.test/away.svg')
    })

    it('normalizes API-Football fixtures with match-winner odds', () => {
        const payload = normalizeFreeProviderPayload({
            apiFootball: {
                fixtures: [
                    {
                        fixture: { id: 77, date: '2026-05-26T18:00:00Z', status: { short: 'NS' } },
                        league: { name: 'Practice League', country: 'England' },
                        teams: {
                            home: { name: 'Capital Albion', logo: 'https://cdn.example.test/capital.png' },
                            away: { name: 'Westport SC', logo: 'https://cdn.example.test/westport.png' },
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
        expect(payload.events[0].oddsMode).toBe('real')
        expect(payload.events[0].homeLogo).toBe('https://cdn.example.test/capital.png')
        expect(payload.events[0].awayLogo).toBe('https://cdn.example.test/westport.png')
    })

    it('normalizes API-SPORTS multi-sport games without dropping estimated odds', () => {
        const event = normalizeApiSportsMultiSportEvent({
            id: 8801,
            _gampoApiSport: 'volleyball',
            date: '2026-05-27T18:30:00Z',
            status: { long: 'Not Started' },
            league: { name: 'Nations League', country: 'World' },
            country: { name: 'World' },
            teams: {
                home: { name: 'Italy', logo: 'https://cdn.example.test/italy.png' },
                away: { name: 'Brazil', logo: 'https://cdn.example.test/brazil.png' },
            },
        })

        expect(event.sportId).toBe('volleyball')
        expect(event.source).toBe('api-sports-volleyball')
        expect(event.home).toBe('Italy')
        expect(event.away).toBe('Brazil')
        expect(event.tags).toContain('estimated-odds')
        expect(event.marketGroups[0].selections[0].source).toBe('synthetic-estimate')
        expect(event.homeLogo).toBe('https://cdn.example.test/italy.png')
        expect(event.awayLogo).toBe('https://cdn.example.test/brazil.png')
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
        expect(event.canonicalEventId).toBe(event.id)
        expect(event.offers.every(offer => offer.canonicalEventId === event.id)).toBe(true)
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
        expect(event.tags).toContain('estimated-odds')
        expect(event.marketGroups[0].selections[0].source).toBe('synthetic-estimate')
    })

    it('aggregates equivalent cross-provider fixtures with stable identity and attributable offers', () => {
        const payload = normalizeFreeProviderPayload({
            generatedAt: '2026-05-26T19:59:00.000Z',
            sportsGameOdds: {
                events: [{
                    eventID: 'sgo-7',
                    sportID: 'BASKETBALL',
                    leagueID: 'NBA',
                    teams: { home: { names: { long: 'Denver Peaks' } }, away: { names: { long: 'Miami Tides' } } },
                    status: { startsAt: '2026-05-26T20:00:00.000Z' },
                    odds: {
                        'points-home-game-ml-home': { byBookmaker: { fanduel: { odds: '-120', available: true, lastUpdated: '2026-05-26T19:58:00.000Z' } } },
                        'points-away-game-ml-away': { byBookmaker: { fanduel: { odds: '+110', available: true, lastUpdated: '2026-05-26T19:58:00.000Z' } } },
                    },
                }],
            },
            oddsApiIo: {
                events: [{ id: 'io-8', sport: 'basketball', league: 'NBA', home: 'Miami Tides', away: 'Denver Peaks', startTime: '2026-05-26T20:07:00.000Z' }],
                odds: [{
                    eventId: 'io-8',
                    bookmakers: [{ name: 'Bet365', updatedAt: '2026-05-26T19:57:00.000Z', markets: [{ name: 'Moneyline', outcomes: [{ name: 'Miami Tides', price: 2.12 }, { name: 'Denver Peaks', price: 1.84 }] }] }],
                }],
            },
        })

        expect(payload.events).toHaveLength(1)
        expect(payload.events[0].canonicalEventId).toBe(payload.events[0].id)
        expect(payload.events[0].sourceRefs).toEqual(expect.arrayContaining([
            { provider: 'sportsgameodds', eventId: 'sgo-7' },
            { provider: 'odds-api-io', eventId: 'io-8' },
        ]))
        expect(payload.events[0].offers).toHaveLength(4)
        expect(payload.events[0].offers.every(offer => offer.canonicalEventId === payload.events[0].id)).toBe(true)
        expect(new Set(payload.events[0].offers.map(offer => offer.id)).size).toBe(4)
        expect(payload.events[0].facts.scheduleMetadataObservations).toHaveLength(2)
        expect(payload.events[0].facts.scoreStatusObservations).toHaveLength(2)
        expect(payload.events[0].offers.map(offer => offer.bookmaker)).toEqual(expect.arrayContaining(['fanduel', 'Bet365']))
        expect(payload.events[0].offers.every(offer => offer.observedAt && offer.sourceContext && offer.freshness === 'current')).toBe(true)

        const refreshed = normalizeSportsGameOddsEvent({
            eventID: 'refreshed-id',
            sportID: 'BASKETBALL',
            leagueID: 'NBA',
            teams: { home: { names: { long: 'Denver Peaks' } }, away: { names: { long: 'Miami Tides' } } },
            status: { startsAt: '2026-05-26T20:00:00.000Z' },
            odds: {},
        })
        expect(payload.events[0].id).toMatch(/^event-/)
        expect(payload.events[0].canonicalKey).toBeTruthy()
        expect(refreshed.id).toBe(payload.events[0].id)
        expect(refreshed.canonicalEventId).toBe(refreshed.id)
        expect(refreshed.sourceRefs).toEqual([{ provider: 'sportsgameodds', eventId: 'refreshed-id' }])
    })

    it('keeps ambiguous, invalid-start, different-bucket, and conflicting-competition fixtures separate', () => {
        const base = id => ({
            id,
            sport: 'basketball',
            league: 'NBA',
            home: 'Alpha Club',
            away: 'Beta Club',
            startTime: '2026-05-26T20:00:00.000Z',
        })
        const payload = normalizeFreeProviderPayload({
            oddsApiIo: {
                events: [
                    base('base'),
                    { ...base('outside'), startTime: '2026-05-26T20:16:00.000Z' },
                    { ...base('competition'), league: 'WNBA' },
                    { ...base('missing'), startTime: null },
                    { ...base('ambiguous'), home: 'Alpha Club', away: 'Alpha-Club' },
                ],
            },
        })

        expect(payload.events).toHaveLength(5)
        expect(new Set(payload.events.map(event => event.id)).size).toBe(5)
        expect(payload.events.every(event => event.canonicalEventId === event.id)).toBe(true)
        expect(payload.events.map(event => event.sourceRefs[0].eventId).sort()).toEqual(['ambiguous', 'base', 'competition', 'missing', 'outside'])
        expect(payload.events.find(event => event.sourceRefs[0].eventId === 'missing').startsAt).toBeNull()
    })

    it('keeps missing API-SPORTS and The Odds API starts unknown and provider-isolated', () => {
        const fixture = {
            generatedAt: '2026-05-26T20:00:00.000Z',
            apiFootball: {
                multiSport: [{
                    id: 'apisports-missing-start',
                    _gampoApiSport: 'basketball',
                    league: { name: 'NBA' },
                    teams: { home: { name: 'Alpha' }, away: { name: 'Beta' } },
                }],
            },
            theOddsApi: {
                events: [{
                    id: 'theoddsapi-missing-start',
                    sport_key: 'basketball_nba',
                    sport_title: 'NBA',
                    home_team: 'Alpha',
                    away_team: 'Beta',
                    bookmakers: [{
                        key: 'draftkings',
                        title: 'DraftKings',
                        last_update: '2026-05-26T19:58:00.000Z',
                        markets: [{ key: 'h2h', outcomes: [{ name: 'Alpha', price: 1.91 }, { name: 'Beta', price: 2.09 }] }],
                    }],
                }],
            },
        }

        const first = normalizeFreeProviderPayload(fixture).events
        const second = normalizeFreeProviderPayload(fixture).events

        expect(first).toHaveLength(2)
        expect(first.map(event => event.startsAt)).toEqual([null, null])
        expect(first.every(event => event.canonicalEventId === event.id)).toBe(true)
        expect(first.map(event => event.id)).toEqual(second.map(event => event.id))
        expect(new Set(first.map(event => event.id)).size).toBe(2)
        expect(first.map(event => event.sourceRefs[0])).toEqual(expect.arrayContaining([
            { provider: 'api-sports-basketball', eventId: 'apisports-basketball-apisports-missing-start' },
            { provider: 'the-odds-api', eventId: 'theoddsapi-missing-start' },
        ]))
    })

    it('extracts bookmaker roles and keeps unknown or stale observations non-submittable', () => {
        const event = normalizeSportsGameOddsEvent({
            eventID: 'sgo-role',
            sportID: 'BASKETBALL',
            leagueID: 'NBA',
            teams: { home: { names: { long: 'Alpha' } }, away: { names: { long: 'Beta' } } },
            status: { startsAt: '2026-05-26T20:00:00.000Z', started: true },
            score: { home: 12, away: 10 },
            odds: {
                'points-home-game-ml-home': { byBookmaker: { betmgm: { odds: '-110', available: true, lastUpdated: '2026-05-26T19:40:00.000Z' } } },
            },
        }, { generatedAt: '2026-05-26T20:00:00.000Z' })

        expect(event.facts.scheduleMetadata.role).toBe('schedule-metadata')
        expect(event.facts.scoreStatus).toMatchObject({ role: 'score-status', score: { home: 12, away: 10 }, status: 'live' })
        expect(event.offers[0]).toMatchObject({ bookmaker: 'betmgm', freshness: 'stale', submittable: false, ineligibilityReason: 'stale-offer' })
        expect(event.liveStats).toBeUndefined()
        expect(event.popularity).toBeUndefined()
        expect(event.clock).toBeNull()
        expect(event.period).toBeNull()
    })

    it('preserves API-Football and The Odds API bookmaker names', () => {
        const apiFootball = normalizeFreeProviderPayload({
            generatedAt: '2026-05-26T20:00:00.000Z',
            apiFootball: {
                fixtures: [{
                    fixture: { id: 81, date: '2026-05-27T20:00:00.000Z', status: { short: 'NS' } },
                    league: { name: 'Premier League' },
                    teams: { home: { name: 'Alpha' }, away: { name: 'Beta' } },
                    goals: { home: null, away: null },
                }],
                odds: [{
                    fixture: { id: 81 },
                    update: '2026-05-26T19:58:00.000Z',
                    bookmakers: [{ name: 'Pinnacle', bets: [{ id: 1, values: [{ value: 'Home', odd: '1.90' }, { value: 'Away', odd: '2.10' }] }] }],
                }],
            },
        }).events[0]
        const theOddsApi = normalizeTheOddsApiEvent({
            id: 'toa-1',
            sport_key: 'basketball_nba',
            sport_title: 'NBA',
            commence_time: '2026-05-27T20:00:00.000Z',
            home_team: 'Alpha',
            away_team: 'Beta',
            bookmakers: [{ key: 'draftkings', title: 'DraftKings', markets: [{ key: 'h2h', outcomes: [{ name: 'Alpha', price: 1.91 }, { name: 'Beta', price: 2.09 }] }] }],
        }, 'us', { generatedAt: '2026-05-26T20:00:00.000Z' })

        expect(apiFootball.offers.map(offer => offer.bookmaker)).toEqual(['Pinnacle', 'Pinnacle'])
        expect(theOddsApi.offers.map(offer => offer.bookmaker)).toEqual(['DraftKings', 'DraftKings'])
        expect([...apiFootball.offers, ...theOddsApi.offers].every(offer => offer.freshness === 'current' && offer.submittable)).toBe(true)
    })

    it('keeps model estimates separate and prevents synthetic drift from changing provider facts', () => {
        const providerEvent = normalizePandaScoreMatch({
            id: 'model-only',
            begin_at: '2026-05-26T20:00:00.000Z',
            videogame: { slug: 'valorant' },
            opponents: [{ opponent: { name: 'Alpha' } }, { opponent: { name: 'Beta' } }],
        })
        const before = structuredClone(providerEvent)
        const drifted = driftSyntheticEvents([providerEvent], 4)[0]

        expect(providerEvent.offers).toEqual([])
        expect(providerEvent.modelEstimates.length).toBeGreaterThan(0)
        expect(providerEvent.modelEstimates.every(estimate => estimate.provider === 'gampo-model' && estimate.bookmaker === null && estimate.submittable === false && estimate.ineligibilityReason === 'model-estimate')).toBe(true)
        expect(drifted).toEqual(before)
    })
})
