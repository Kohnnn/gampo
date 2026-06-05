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

function isLocalVitePreview() {
    const location = globalThis.location
    if (!location) return false
    const host = location.hostname || ''
    return (host === '127.0.0.1' || host === 'localhost') && location.port === '4173'
}

export async function fetchFreeProviderFeed() {
    if (isLocalVitePreview()) return { events: [], errors: [], quotas: {} }
    try {
        const response = await fetch('/api/sportsbook/free-feed', {
            method: 'GET',
            headers: { accept: 'application/json' },
        })
        if (!response.ok) {
            return {
                events: [],
                errors: response.status === 404 ? [] : [`free feed proxy ${response.status}`],
                quotas: {},
            }
        }
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

// Assign home-screen curation tags to live feed events. Live providers don't
// carry GamPo's `top`/`popular`/`starting-soon` tags, so the Sports Home
// shelves would render empty (or fall back to synthetic). We rank real events
// by popularity + live status so the headline rows show real teams only.
function curateLiveEvents(events) {
    const now = Date.now()
    const ranked = [...events].sort((a, b) => {
        const liveDelta = (b.status === 'live' ? 1 : 0) - (a.status === 'live' ? 1 : 0)
        if (liveDelta) return liveDelta
        return (b.popularity || 0) - (a.popularity || 0)
    })
    return ranked.map((event, index) => {
        const tags = new Set(event.tags || [])
        if (event.status === 'live') tags.add('live')
        if (index < 3) tags.add('top')
        if (index < 9) tags.add('popular')
        if (event.status === 'prematch') {
            const startMs = new Date(event.startsAt).getTime()
            if (Number.isFinite(startMs) && startMs - now < 6 * 60 * 60 * 1000) tags.add('starting-soon')
        }
        return { ...event, tags: [...tags] }
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
        feedEvents = uniqueEvents(events).slice(0, 60)
    } catch (error) {
        errors.push(error?.message || String(error))
    }

    // When real provider events are available, show ONLY real events so no
    // simulated "Practice" teams or synthetic fixtures leak into the lobby.
    // Synthetic data is a pure offline fallback (no tokens / network failure).
    const hasLiveFeed = feedEvents.length > 0
    const curatedFeed = hasLiveFeed ? curateLiveEvents(feedEvents) : []
    const events = hasLiveFeed ? curatedFeed : synthetic.events
    const baseSports = hasLiveFeed ? SPORTS : synthetic.sports
    const baseLeagues = hasLiveFeed ? [] : synthetic.leagues
    return {
        sports: mergeSports(baseSports, events),
        leagues: mergeLeagues(baseLeagues, events),
        events,
        feedEvents,
        feedSource: hasLiveFeed ? 'live' : 'fallback',
        inSeason,
        errors: errors.filter(Boolean),
        quotas: { ...providerQuotas, ...getQuotaSnapshot() },
        providerSources,
    }
}
