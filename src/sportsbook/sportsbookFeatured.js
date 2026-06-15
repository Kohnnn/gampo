// Featured-competition curation for the Sports Home.
//
// The lobby previously showed one flat "popular" list, so it read as "latest
// only". This groups events by competition (leagueId) and ranks marquee
// tournaments to the top using a priority keyword list, so famous events (World
// Cup, Champions League, EPL, NBA finals, ...) surface as their own shelves
// with their full slate. Pure + deterministic for testing.

// Higher score = more prominent. Matched case-insensitively against the league
// label / region. The World Cup and continental majors outrank domestic
// leagues so they spotlight when present in the live feed.
const PRIORITY_KEYWORDS = [
    [/world cup|fifa|copa mundial/i, 100],
    [/champions league|uefa|euro\b|copa america|copa libertadores/i, 90],
    [/premier league|epl|la ?liga|serie a|bundesliga|ligue 1/i, 80],
    [/nba\b|finals|playoffs/i, 75],
    [/nfl\b|super ?bowl/i, 74],
    [/grand slam|wimbledon|us open|roland|australian open|atp|wta/i, 70],
    [/world|international|major|masters|invitational|cup\b/i, 60],
]

function competitionScore(label = '', region = '') {
    const text = `${label} ${region}`
    for (const [pattern, score] of PRIORITY_KEYWORDS) {
        if (pattern.test(text)) return score
    }
    return 0
}

// Group events by leagueId and rank the resulting competitions. Returns at most
// `limit` competitions, each { leagueId, label, region, sportId, score,
// popularity, liveCount, events } sorted by (priority, liveCount, popularity).
export function buildFeaturedCompetitions(events = [], leagues = [], { limit = 4, minEvents = 1 } = {}) {
    const leagueMap = new Map(leagues.map(league => [league.id, league]))
    const groups = new Map()

    for (const event of events) {
        const id = event.leagueId || event.sportId || 'feed'
        if (!groups.has(id)) {
            const league = leagueMap.get(id)
            groups.set(id, {
                leagueId: id,
                label: league?.label || event.region || 'Live Competition',
                region: league?.region || event.region || '',
                sportId: event.sportId || league?.sportId || null,
                events: [],
                popularity: 0,
                liveCount: 0,
            })
        }
        const group = groups.get(id)
        group.events.push(event)
        group.popularity += Number(event.popularity) || 0
        if (event.status === 'live') group.liveCount += 1
    }

    return [...groups.values()]
        .map(group => ({
            ...group,
            score: competitionScore(group.label, group.region),
        }))
        .filter(group => group.events.length >= minEvents)
        .sort((a, b) => (
            (b.score - a.score)
            || (b.liveCount - a.liveCount)
            || (b.events.length - a.events.length)
            || (b.popularity - a.popularity)
        ))
        .slice(0, limit)
}

// The single most prominent competition (or null). Used for the spotlight row.
export function spotlightCompetition(events = [], leagues = []) {
    const [top] = buildFeaturedCompetitions(events, leagues, { limit: 1, minEvents: 1 })
    // Only spotlight a genuinely marquee competition, not a random feed bucket.
    return top && top.score >= 60 ? top : null
}

// Build a "title contenders" outright board from a competition's moneyline
// favourites (shortest decimal odds across its events' winner markets).
export function contendersFromCompetition(competition, { limit = 8 } = {}) {
    if (!competition?.events?.length) return []
    const rows = []
    for (const event of competition.events) {
        const market = event.marketGroups?.[0]
        for (const selection of market?.selections || []) {
            if (selection.side === 'draw') continue
            if (!(selection.decimalOdds > 1)) continue
            rows.push({ label: selection.label, odds: selection.decimalOdds, eventId: event.id })
        }
    }
    const seen = new Set()
    return rows
        .sort((a, b) => a.odds - b.odds)
        .filter(row => (seen.has(row.label) ? false : seen.add(row.label)))
        .slice(0, limit)
}
