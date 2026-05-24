import { fetchInSeasonSports, fetchUpcomingOdds, fixtureFromOddsApi, getQuotaSnapshot } from '../services/sportsApi'
import { buildSyntheticSportsbookData, LEAGUES, SPORTS } from './sportsbookData'
import { normalizeFreeProviderPayload } from './freeFeedAdapters'
import { deVigProbabilities, roundCurrency } from './sportsbookMath'

const SPORT_ALIASES = [
    ['soccer', ['soccer', 'football']],
    ['tennis', ['tennis']],
    ['basketball', ['basketball', 'nba', 'ncaab']],
    ['football', ['american football', 'nfl', 'ncaaf']],
    ['ice-hockey', ['hockey', 'nhl']],
    ['baseball', ['baseball', 'mlb']],
    ['cricket', ['cricket']],
    ['dota-2', ['dota']],
    ['cs2', ['counter', 'cs2', 'csgo']],
    ['valorant', ['valorant']],
    ['league-of-legends', ['league of legends', 'lol']],
]

export function sportIdFromTitle(title = '') {
    const text = String(title).toLowerCase()
    const found = SPORT_ALIASES.find(([, tokens]) => tokens.some(token => text.includes(token)))
    return found?.[0] || 'soccer'
}

function leagueForSport(sportId, title = '') {
    const existing = LEAGUES.find(league => league.sportId === sportId)
    return existing || {
        id: `${sportId}-feed`,
        sportId,
        region: 'Live Feed',
        country: 'Feed',
        label: title || 'Live Feed',
        liveCount: 0,
        eventCount: 0,
    }
}

function marketGroupFromFixture(fixture) {
    const probabilities = deVigProbabilities(fixture.markets.map(market => market.decimalOdds))
    return {
        id: 'winner',
        label: fixture.markets.length > 2 ? '1x2' : 'Winner',
        displayMode: 'compact',
        collapsed: false,
        selections: fixture.markets.map((market, index) => ({
            id: `${fixture.id}-winner-${market.outcome}-${index}`,
            eventId: fixture.id,
            marketId: 'winner',
            label: market.label,
            side: market.outcome,
            decimalOdds: roundCurrency(market.decimalOdds),
            previousOdds: roundCurrency(market.openingOdds || market.decimalOdds),
            suspended: market.decimalOdds <= 1,
            boosted: false,
            trueProbability: probabilities[index] || market.trueProbability || 0,
            source: 'odds-api',
            status: market.decimalOdds <= 1 ? 'suspended' : 'available',
        })),
    }
}

export function normalizeOddsApiEvent(event, region = 'us') {
    const fixture = fixtureFromOddsApi(event, null, region)
    if (!fixture?.markets?.length) return null
    const sportId = sportIdFromTitle(`${fixture.sport} ${event.sport_key || ''}`)
    const league = leagueForSport(sportId, fixture.league)
    return {
        id: `feed-${fixture.id}`,
        sportId,
        leagueId: league.id,
        region: region.toUpperCase(),
        startsAt: event.commence_time || new Date().toISOString(),
        status: 'prematch',
        clock: '',
        period: '',
        home: fixture.home,
        away: fixture.away,
        participants: [fixture.home, fixture.away].filter(Boolean),
        score: null,
        liveStats: {
            tickets: 0,
            possession: 50,
            attack: 50,
        },
        popularity: 3200,
        tags: ['feed'],
        marketGroups: [marketGroupFromFixture({ ...fixture, id: `feed-${fixture.id}` })],
        bookmakerTitle: fixture.bookmakerTitle,
        source: 'odds-api',
    }
}

function mergeSports(baseSports, events) {
    return baseSports.map(sport => {
        const sportEvents = events.filter(event => event.sportId === sport.id)
        return {
            ...sport,
            liveCount: sportEvents.filter(event => event.status === 'live').length,
            eventCount: sportEvents.length,
        }
    }).sort((a, b) => a.sortOrder - b.sortOrder)
}

function mergeLeagues(baseLeagues, events) {
    const feedLeagues = []
    for (const event of events) {
        if (baseLeagues.some(league => league.id === event.leagueId) || feedLeagues.some(league => league.id === event.leagueId)) continue
        const sport = SPORTS.find(item => item.id === event.sportId)
        feedLeagues.push({
            id: event.leagueId,
            sportId: event.sportId,
            region: event.region || 'Live Feed',
            country: event.region || 'Feed',
            label: sport ? `${sport.label} Feed` : 'Live Feed',
        })
    }
    return [...baseLeagues, ...feedLeagues].map(league => {
        const leagueEvents = events.filter(event => event.leagueId === league.id)
        return {
            ...league,
            liveCount: leagueEvents.filter(event => event.status === 'live').length,
            eventCount: leagueEvents.length,
        }
    })
}

async function fetchFreeProviderFeed() {
    try {
        const response = await fetch('/api/sportsbook/free-feed', {
            method: 'GET',
            headers: { accept: 'application/json' },
        })
        if (!response.ok) return { events: [], errors: [`free feed proxy ${response.status}`], quotas: {} }
        const payload = await response.json()
        return normalizeFreeProviderPayload(payload)
    } catch {
        return { events: [], errors: [], quotas: {} }
    }
}

function uniqueEvents(events) {
    const seen = new Set()
    return events.filter(event => {
        const key = `${event.source || 'feed'}:${event.home}:${event.away}:${event.startsAt}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })
}

export async function loadSportsbookFeed() {
    const synthetic = buildSyntheticSportsbookData()
    const errors = []
    let feedEvents = []
    let inSeason = []
    let providerQuotas = {}
    let providerSources = {}

    try {
        const [freeFeed, us, uk, sports] = await Promise.all([
            fetchFreeProviderFeed(),
            fetchUpcomingOdds('us'),
            fetchUpcomingOdds('uk'),
            fetchInSeasonSports(),
        ])
        errors.push(...(freeFeed.errors || []))
        providerQuotas = freeFeed.quotas || {}
        providerSources = freeFeed.sources || {}
        errors.push(...(us.errors || []), ...(uk.errors || []), ...(sports.errors || []))
        inSeason = sports.data || []
        const events = [
            ...(freeFeed.events || []),
            ...(us.data || []).map(event => normalizeOddsApiEvent(event, 'us')),
            ...(uk.data || []).map(event => normalizeOddsApiEvent(event, 'uk')),
        ].filter(Boolean)
        feedEvents = uniqueEvents(events).slice(0, 40)
    } catch (error) {
        errors.push(error?.message || String(error))
    }

    const events = [...feedEvents, ...synthetic.events]
    return {
        sports: mergeSports(synthetic.sports, events),
        leagues: mergeLeagues(synthetic.leagues, events),
        events,
        feedEvents,
        inSeason,
        errors: errors.filter(Boolean),
        quotas: { ...providerQuotas, ...getQuotaSnapshot() },
        providerSources,
    }
}
