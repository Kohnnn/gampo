import { buildSyntheticSportsbookData, LEAGUES, SPORTS } from './sportsbookData'
import { normalizeFreeProviderPayload } from './freeFeedAdapters'
import { curateTopSportsbookItems, scoreMarqueeItem } from './sportsbookMarquee'

const SPORT_ALIASES = [
    ['soccer', ['soccer', 'football']],
    ['tennis', ['tennis']],
    ['basketball', ['basketball', 'nba', 'ncaab']],
    ['football', ['american football', 'nfl', 'ncaaf']],
    ['ice-hockey', ['hockey', 'nhl']],
    ['baseball', ['baseball', 'mlb']],
    ['handball', ['handball']],
    ['rugby', ['rugby']],
    ['volleyball', ['volleyball']],
    ['formula-1', ['formula', 'f1']],
    ['mma', ['mma', 'ufc']],
    ['cricket', ['cricket']],
    ['dota-2', ['dota']],
    ['cs2', ['counter', 'cs2', 'csgo']],
    ['valorant', ['valorant']],
    ['league-of-legends', ['league of legends', 'lol']],
]

export function sportIdFromTitle(title = '') {
    const text = String(title).toLowerCase()
    const found = SPORT_ALIASES.find(([ tokens]) => tokens.some(token => text.includes(token)))
    return found?.[0] || 'soccer'
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
        const marqueeDelta = (scoreMarqueeItem(b).score || 0) - (scoreMarqueeItem(a).score || 0)
        if (marqueeDelta) return marqueeDelta
        const realOddsDelta = (a.oddsMode === 'estimated' ? 1 : 0) - (b.oddsMode === 'estimated' ? 1 : 0)
        if (realOddsDelta) return realOddsDelta
        const liveDelta = (b.status === 'live' ? 1 : 0) - (a.status === 'live' ? 1 : 0)
        if (liveDelta) return liveDelta
        return (b.popularity || 0) - (a.popularity || 0)
    })
    return ranked.map((event, index) => {
        const tags = new Set(event.tags || [])
        if (event.status === 'live') tags.add('live')
        if ((scoreMarqueeItem(event).score || 0) >= 60) tags.add('marquee')
        if (event.oddsMode === 'estimated') tags.add('estimated-odds')
        if (index < 6) tags.add('top')
        if (index < 30) tags.add('popular')
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
    let marquee = null

    try {
        // All providers (including The Odds API) are fetched server-side by the
        // free-feed proxy so no API keys are exposed to the client bundle.
        const freeFeed = await fetchFreeProviderFeed()
        errors.push(...(freeFeed.errors || []))
        providerQuotas = freeFeed.quotas || {}
        providerSources = freeFeed.sources || {}
        marquee = freeFeed.marquee || null
        inSeason = freeFeed.inSeason || []
        const filtered = curateTopSportsbookItems(uniqueEvents(freeFeed.events || []), { perSport: 30, minimumVisible: 120, maximumVisible: 260 })
        feedEvents = filtered.items.slice(0, 260)
        marquee = marquee || filtered.metrics
    } catch (error) {
        errors.push(error?.message || String(error))
    }

    // When provider fixtures are available, show real-world events only. Events
    // without bookmaker prices carry clearly marked estimated odds. Synthetic
    // Gampo teams remain a pure offline fallback.
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
        feedSource: hasLiveFeed ? 'blended' : 'fallback',
        inSeason,
        errors: errors.filter(Boolean),
        quotas: providerQuotas,
        providerSources,
        marquee,
    }
}
