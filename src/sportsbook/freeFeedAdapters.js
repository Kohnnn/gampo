import { LEAGUES } from './sportsbookData'
import { deVigProbabilities, roundCurrency } from './sportsbookMath'
import { fixtureFromOddsApi } from '../services/sportsApi'

function slugify(value) {
    return String(value || 'feed').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'feed'
}

function hashString(value) {
    let hash = 2166136261
    for (let i = 0; i < String(value).length; i++) {
        hash ^= String(value).charCodeAt(i)
        hash = Math.imul(hash, 16777619)
    }
    return hash >>> 0
}

function unitFromSeed(seed, offset = '') {
    return (hashString(`${seed}:${offset}`) % 10000) / 10000
}

function sportIdFromText(value = '') {
    const text = String(value).toLowerCase()
    if (text === 'football' || text === 'nfl' || text.includes('american football') || text.includes('ncaaf')) return 'football'
    if (text.includes('counter') || text.includes('cs-go') || text.includes('csgo') || text.includes('cs2')) return 'cs2'
    if (text.includes('league of legends') || text === 'lol' || text.includes('lol ')) return 'league-of-legends'
    if (text.includes('dota')) return 'dota-2'
    if (text.includes('valorant')) return 'valorant'
    if (text.includes('basket')) return 'basketball'
    if (text.includes('baseball') || text.includes('mlb')) return 'baseball'
    if (text.includes('hockey') || text.includes('nhl')) return 'ice-hockey'
    if (text.includes('tennis')) return 'tennis'
    if (text.includes('cricket')) return 'cricket'
    if (text.includes('soccer') || text.includes('epl') || text.includes('uefa')) return 'soccer'
    return 'soccer'
}

function leagueIdFor({ sportId, source, leagueName }) {
    const existing = LEAGUES.find(league => league.sportId === sportId && league.label.toLowerCase() === String(leagueName || '').toLowerCase())
    if (existing) return existing.id
    return `${sportId}-${source}-${slugify(leagueName)}`
}

function feedLeagueMeta({ sportId, source, leagueName, region = 'Live Feed' }) {
    return {
        leagueId: leagueIdFor({ sportId, source, leagueName }),
        region,
        leagueLabel: leagueName || `${source} Feed`,
    }
}

function fallbackOdds(seed, { hasDraw }) {
    const home = roundCurrency(1.55 + unitFromSeed(seed, 'home') * 2.35)
    const away = roundCurrency(1.65 + unitFromSeed(seed, 'away') * 2.55)
    if (!hasDraw) return { home, away }
    return {
        home,
        draw: roundCurrency(2.85 + unitFromSeed(seed, 'draw') * 1.8),
        away,
    }
}

function selectionStatus(decimalOdds, previousOdds) {
    if (decimalOdds <= 1) return 'suspended'
    const diff = decimalOdds - previousOdds
    if (diff > 0.015) return 'odds-up'
    if (diff < -0.015) return 'odds-down'
    return 'available'
}

function makeWinnerMarket({ eventId, sportId, home, away, source, prices }) {
    const hasDraw = sportId === 'soccer' || Boolean(prices?.draw)
    const resolved = {
        ...fallbackOdds(eventId, { hasDraw }),
        ...Object.fromEntries(Object.entries(prices || {}).filter(([, value]) => Number(value) > 1)),
    }

    const labels = hasDraw ? [
        ['home', home, resolved.home],
        ['draw', 'Draw', resolved.draw],
        ['away', away, resolved.away],
    ] : [
        ['home', home, resolved.home],
        ['away', away, resolved.away],
    ]
    const probabilities = deVigProbabilities(labels.map(([, , odds]) => odds))

    return {
        id: 'winner',
        label: hasDraw ? '1x2' : 'Winner',
        displayMode: 'compact',
        collapsed: false,
        selections: labels.map(([side, label, odds], index) => {
            const decimalOdds = roundCurrency(odds)
            const previousOdds = roundCurrency(decimalOdds * (0.985 + unitFromSeed(eventId, `${side}-previous`) * 0.035))
            return {
                id: `${eventId}-winner-${side}`,
                eventId,
                marketId: 'winner',
                label,
                side,
                decimalOdds,
                previousOdds,
                suspended: decimalOdds <= 1,
                boosted: false,
                trueProbability: probabilities[index] || 0,
                source,
                status: selectionStatus(decimalOdds, previousOdds),
            }
        }),
    }
}

function normalizedEvent({ id, sportId, source, leagueName, region, startsAt, status, home, away, score = null, prices = {}, marketGroups = null, tags = [] }) {
    if (!home || !away) return null
    const league = feedLeagueMeta({ sportId, source, leagueName, region })
    return {
        id,
        sportId,
        leagueId: league.leagueId,
        region: league.region,
        startsAt: startsAt || new Date().toISOString(),
        status,
        clock: status === 'live' ? 'Live' : '',
        period: '',
        home,
        away,
        participants: [home, away],
        score,
        liveStats: {
            tickets: 1400 + (hashString(id) % 12000),
            possession: 45 + (hashString(`${id}:possession`) % 14),
            attack: 42 + (hashString(`${id}:attack`) % 22),
        },
        popularity: 2600 + (hashString(`${id}:popularity`) % 9000),
        tags: ['feed', source, ...tags],
        marketGroups: marketGroups?.length ? marketGroups : [makeWinnerMarket({ eventId: id, sportId, home, away, source, prices })],
        bookmakerTitle: source,
        source,
    }
}

function americanToDecimal(value) {
    const raw = Number(String(value ?? '').replace(/[^0-9.+-]/g, ''))
    if (!Number.isFinite(raw) || raw === 0) return 0
    if (raw > 1 && raw < 100) return roundCurrency(raw)
    if (raw > 0) return roundCurrency(1 + raw / 100)
    return roundCurrency(1 + 100 / Math.abs(raw))
}

function bestSportsGameOddsPrice(odd) {
    let best = null
    for (const [bookmakerId, entry] of Object.entries(odd?.byBookmaker || {})) {
        if (entry?.available === false) continue
        const decimalOdds = americanToDecimal(entry?.odds)
        if (decimalOdds <= 1) continue
        if (!best || decimalOdds > best.decimalOdds) {
            best = {
                bookmakerId,
                decimalOdds,
                spread: entry?.spread,
                overUnder: entry?.overUnder,
            }
        }
    }
    return best
}

function parseSportsGameOddId(oddId) {
    const parts = String(oddId || '').split('-')
    if (parts.length < 5) return null
    const sideID = parts.at(-1)
    const betTypeID = parts.at(-2)
    const periodID = parts.at(-3)
    const statEntityID = parts.slice(1, -3).join('-')
    const statID = parts[0]
    return { statID, statEntityID, periodID, betTypeID, sideID }
}

function providerMarketGroup({ eventId, id, label, source, outcomes }) {
    const available = outcomes.filter(outcome => Number(outcome.decimalOdds) > 1)
    if (!available.length) return null
    const probabilities = deVigProbabilities(available.map(outcome => outcome.decimalOdds))
    return {
        id,
        label,
        displayMode: 'compact',
        collapsed: id !== 'winner',
        selections: available.map((outcome, index) => {
            const decimalOdds = roundCurrency(outcome.decimalOdds)
            const previousOdds = roundCurrency(decimalOdds * (0.985 + unitFromSeed(`${eventId}:${id}:${outcome.side}`, 'previous') * 0.035))
            return {
                id: `${eventId}-${id}-${slugify(outcome.side)}`,
                eventId,
                marketId: id,
                label: outcome.label,
                side: outcome.side,
                line: outcome.line,
                decimalOdds,
                previousOdds,
                suspended: false,
                boosted: false,
                trueProbability: probabilities[index] || 0,
                source,
                status: selectionStatus(decimalOdds, previousOdds),
            }
        }),
    }
}

function teamName(team, fallback) {
    return team?.names?.long
        || team?.names?.medium
        || team?.displayName
        || team?.name
        || team?.teamName
        || team?.teamID
        || fallback
}

function lineLabel(label, line) {
    if (line === undefined || line === null || line === '') return label
    return `${label} ${line}`
}

function sportsGameOddsMarkets(event, { eventId, sportId, home, away }) {
    const winner = {}
    const spread = {}
    const total = {}

    for (const [oddId, odd] of Object.entries(event?.odds || {})) {
        const parsed = parseSportsGameOddId(oddId)
        if (!parsed || parsed.periodID !== 'game') continue
        const best = bestSportsGameOddsPrice(odd)
        if (!best) continue

        if (parsed.betTypeID === 'ml' || parsed.betTypeID === 'ml3way') {
            if (parsed.sideID === 'home') winner.home = { side: 'home', label: home, decimalOdds: best.decimalOdds }
            if (parsed.sideID === 'away') winner.away = { side: 'away', label: away, decimalOdds: best.decimalOdds }
            if (parsed.sideID === 'draw') winner.draw = { side: 'draw', label: 'Draw', decimalOdds: best.decimalOdds }
        }

        if (parsed.betTypeID === 'sp') {
            if (parsed.sideID === 'home') spread.home = { side: 'home', label: lineLabel(home, best.spread), line: best.spread, decimalOdds: best.decimalOdds }
            if (parsed.sideID === 'away') spread.away = { side: 'away', label: lineLabel(away, best.spread), line: best.spread, decimalOdds: best.decimalOdds }
        }

        if (parsed.betTypeID === 'ou') {
            if (parsed.sideID === 'over') total.over = { side: 'over', label: lineLabel('Over', best.overUnder), line: best.overUnder, decimalOdds: best.decimalOdds }
            if (parsed.sideID === 'under') total.under = { side: 'under', label: lineLabel('Under', best.overUnder), line: best.overUnder, decimalOdds: best.decimalOdds }
        }
    }

    return [
        providerMarketGroup({
            eventId,
            id: 'winner',
            label: sportId === 'soccer' && winner.draw ? '1x2' : 'Winner',
            source: 'sportsgameodds',
            outcomes: [winner.home, winner.draw, winner.away].filter(Boolean),
        }),
        providerMarketGroup({
            eventId,
            id: 'spread',
            label: sportId === 'ice-hockey' ? 'Puck Line' : sportId === 'baseball' ? 'Run Line' : 'Spread',
            source: 'sportsgameodds',
            outcomes: [spread.home, spread.away].filter(Boolean),
        }),
        providerMarketGroup({
            eventId,
            id: 'total',
            label: sportId === 'soccer' || sportId === 'ice-hockey' ? 'Total Goals' : 'Total Points',
            source: 'sportsgameodds',
            outcomes: [total.over, total.under].filter(Boolean),
        }),
    ].filter(Boolean)
}

function sportsGameOddsStatus(status = {}) {
    if (status.finalized || status.ended) return 'settled'
    if (status.started) return 'live'
    return 'prematch'
}

export function normalizeSportsGameOddsEvent(event) {
    const eventId = `sportsgameodds-${event?.eventID || event?.id}`
    const sportId = sportIdFromText(`${event?.sportID || ''} ${event?.leagueID || ''}`)
    const home = teamName(event?.teams?.home || event?.homeTeam, 'Home')
    const away = teamName(event?.teams?.away || event?.awayTeam, 'Away')
    const marketGroups = sportsGameOddsMarkets(event, { eventId, sportId, home, away })

    return normalizedEvent({
        id: eventId,
        sportId,
        source: 'sportsgameodds',
        leagueName: event?.leagueID || 'SportsGameOdds Feed',
        region: event?.sportID || 'SportsGameOdds',
        startsAt: event?.status?.startsAt || event?.startsAt || event?.startTime,
        status: sportsGameOddsStatus(event?.status),
        home,
        away,
        score: event?.score || null,
        marketGroups,
        tags: ['primary-odds'],
    })
}

function statusFromPandaScore(status) {
    if (status === 'running') return 'live'
    if (status === 'finished') return 'settled'
    return 'prematch'
}

function opponentNames(match) {
    const names = (match?.opponents || [])
        .map(entry => entry?.opponent?.name || entry?.name)
        .filter(Boolean)
    if (names.length >= 2) return names.slice(0, 2)
    const raw = String(match?.name || '').split(/\s+(?:vs\.?|VS|versus)\s+/i).map(value => value.trim()).filter(Boolean)
    return raw.length >= 2 ? raw.slice(0, 2) : []
}

export function normalizePandaScoreMatch(match) {
    const [home, away] = opponentNames(match)
    const sportId = sportIdFromText(`${match?.videogame?.slug || ''} ${match?.videogame?.name || ''}`)
    const leagueName = match?.league?.name || match?.serie?.full_name || 'PandaScore Esports'
    return normalizedEvent({
        id: `pandascore-${match?.id}`,
        sportId,
        source: 'pandascore',
        leagueName,
        region: 'Esports',
        startsAt: match?.begin_at || match?.scheduled_at,
        status: statusFromPandaScore(match?.status),
        home,
        away,
        tags: ['esports'],
    })
}

function listFromUnknown(value) {
    if (Array.isArray(value)) return value
    if (Array.isArray(value?.data)) return value.data
    if (Array.isArray(value?.response)) return value.response
    if (Array.isArray(value?.odds)) return value.odds
    return []
}

function findOddsEntry(oddsPayload, eventId) {
    return listFromUnknown(oddsPayload).find(entry => (
        String(entry?.id || entry?.eventId || entry?.event_id || entry?.event?.id || '') === String(eventId)
    ))
}

function firstNumber(...values) {
    for (const value of values) {
        const parsed = Number(value)
        if (Number.isFinite(parsed) && parsed > 1) return parsed
    }
    return null
}

function extractOddsApiIoPrices(event, oddsPayload) {
    const entry = findOddsEntry(oddsPayload, event?.id)
    const direct = entry?.odds || entry?.prices || event?.odds || {}
    const prices = {
        home: firstNumber(direct.home, direct.home_odds, direct.h1, direct[0]),
        draw: firstNumber(direct.draw, direct.draw_odds, direct.x),
        away: firstNumber(direct.away, direct.away_odds, direct.h2, direct[1]),
    }

    const bookmakers = entry?.bookmakers || direct.bookmakers || {}
    const bookmakerValues = Array.isArray(bookmakers) ? bookmakers : Object.values(bookmakers)
    for (const bookmaker of bookmakerValues) {
        const markets = bookmaker?.markets || bookmaker?.bets || bookmaker?.odds || []
        for (const market of Array.isArray(markets) ? markets : Object.values(markets)) {
            const name = String(market?.name || market?.key || market?.market || '').toLowerCase()
            if (name && !/(moneyline|match|winner|1x2|h2h|ml)/.test(name)) continue
            const outcomes = market?.outcomes || market?.values || market?.odds || []
            if (Array.isArray(outcomes)) {
                for (const outcome of outcomes) {
                    const label = String(outcome?.name || outcome?.value || outcome?.label || '').toLowerCase()
                    const price = firstNumber(outcome?.price, outcome?.odd, outcome?.odds)
                    if (!price) continue
                    if (label.includes(String(event?.home || '').toLowerCase())) prices.home = price
                    else if (label.includes(String(event?.away || '').toLowerCase())) prices.away = price
                    else if (label.includes('draw') || label === 'x') prices.draw = price
                }
            }
        }
    }

    return prices
}

export function normalizeOddsApiIoEvent(event, oddsPayload = []) {
    const home = event?.home || event?.homeTeam || event?.home_team || event?.participants?.[0]?.name
    const away = event?.away || event?.awayTeam || event?.away_team || event?.participants?.[1]?.name
    const sportId = sportIdFromText(`${event?.sport || ''} ${event?.sportSlug || ''} ${event?.league || ''}`)
    const status = String(event?.status || '').toLowerCase().includes('live') ? 'live' : 'prematch'
    return normalizedEvent({
        id: `oddsapiio-${event?.id}`,
        sportId,
        source: 'odds-api-io',
        leagueName: event?.league?.name || event?.league || event?.competition || 'Odds API IO Feed',
        region: event?.region || event?.country || 'Odds',
        startsAt: event?.startTime || event?.start_time || event?.commence_time || event?.date,
        status,
        home,
        away,
        score: event?.score || null,
        prices: extractOddsApiIoPrices(event, oddsPayload),
    })
}

function apiFootballStatus(shortStatus) {
    const status = String(shortStatus || '').toUpperCase()
    if (['1H', '2H', 'HT', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE'].includes(status)) return 'live'
    if (['FT', 'AET', 'PEN'].includes(status)) return 'settled'
    return 'prematch'
}

function apiFootballOddsMap(odds = []) {
    const map = new Map()
    for (const entry of odds) {
        const fixtureId = entry?.fixture?.id || entry?.fixture?.fixture?.id
        if (!fixtureId) continue
        const bookmaker = entry?.bookmakers?.[0]
        const bet = bookmaker?.bets?.find(item => item?.id === 1 || /match winner|winner|1x2/i.test(item?.name || ''))
        const values = bet?.values || []
        const prices = {}
        for (const value of values) {
            const label = String(value?.value || '').toLowerCase()
            const odd = firstNumber(value?.odd)
            if (!odd) continue
            if (label === 'home') prices.home = odd
            else if (label === 'away') prices.away = odd
            else if (label === 'draw') prices.draw = odd
        }
        if (Object.keys(prices).length) map.set(String(fixtureId), prices)
    }
    return map
}

export function normalizeApiFootballFixture(item, oddsByFixture = new Map()) {
    const fixtureId = item?.fixture?.id
    const home = item?.teams?.home?.name
    const away = item?.teams?.away?.name
    const homeGoals = item?.goals?.home
    const awayGoals = item?.goals?.away
    return normalizedEvent({
        id: `apifootball-${fixtureId}`,
        sportId: 'soccer',
        source: 'api-football',
        leagueName: item?.league?.name || 'API-Football Fixtures',
        region: item?.league?.country || 'Football',
        startsAt: item?.fixture?.date,
        status: apiFootballStatus(item?.fixture?.status?.short),
        home,
        away,
        score: Number.isFinite(homeGoals) && Number.isFinite(awayGoals) ? { home: homeGoals, away: awayGoals } : null,
        prices: oddsByFixture.get(String(fixtureId)) || {},
    })
}

// === The Odds API ===
// The proxy now fetches The Odds API server-side (keys stay off the client).
// Each event carries `_gampoRegion` ('us'|'uk'). We reuse the pure
// `fixtureFromOddsApi` helper to normalize the h2h markets, then map it into a
// GamPo feed event with a real (de-vigged) winner market group.
const ODDS_API_SPORT_ALIASES = [
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

function oddsApiSportId(title = '') {
    const text = String(title).toLowerCase()
    const found = ODDS_API_SPORT_ALIASES.find(([, tokens]) => tokens.some(token => text.includes(token)))
    return found?.[0] || 'soccer'
}

export function normalizeTheOddsApiEvent(event, region = 'us') {
    const fixture = fixtureFromOddsApi(event, null, region)
    if (!fixture?.markets?.length) return null
    const sportId = oddsApiSportId(`${fixture.sport} ${event.sport_key || ''}`)
    const eventId = `theoddsapi-${fixture.id}`
    const probabilities = deVigProbabilities(fixture.markets.map(market => market.decimalOdds))
    const marketGroups = [{
        id: 'winner',
        label: fixture.markets.length > 2 ? '1x2' : 'Winner',
        displayMode: 'compact',
        collapsed: false,
        selections: fixture.markets.map((market, index) => {
            const decimalOdds = roundCurrency(market.decimalOdds)
            return {
                id: `${eventId}-winner-${market.outcome}-${index}`,
                eventId,
                marketId: 'winner',
                label: market.label,
                side: market.outcome,
                decimalOdds,
                previousOdds: roundCurrency(market.openingOdds || market.decimalOdds),
                suspended: decimalOdds <= 1,
                boosted: false,
                trueProbability: probabilities[index] || market.trueProbability || 0,
                source: 'the-odds-api',
                status: decimalOdds <= 1 ? 'suspended' : 'available',
            }
        }),
    }]
    return normalizedEvent({
        id: eventId,
        sportId,
        source: 'the-odds-api',
        leagueName: fixture.league || `${region.toUpperCase()} Feed`,
        region: region.toUpperCase(),
        startsAt: event.commence_time || new Date().toISOString(),
        status: 'prematch',
        home: fixture.home,
        away: fixture.away,
        marketGroups,
        tags: ['primary-odds'],
    })
}

export function normalizeFreeProviderPayload(payload = {}) {
    const apiFootballOdds = apiFootballOddsMap(payload?.apiFootball?.odds || [])
    const events = [
        ...(payload?.sportsGameOdds?.events || []).map(normalizeSportsGameOddsEvent),
        ...(payload?.pandascore?.matches || []).map(normalizePandaScoreMatch),
        ...(payload?.oddsApiIo?.events || []).map(event => normalizeOddsApiIoEvent(event, payload?.oddsApiIo?.odds || [])),
        ...(payload?.apiFootball?.fixtures || []).map(item => normalizeApiFootballFixture(item, apiFootballOdds)),
        ...(payload?.theOddsApi?.events || []).map(event => normalizeTheOddsApiEvent(event, event?._gampoRegion || 'us')),
    ].filter(Boolean)

    const seen = new Set()
    return {
        events: events.filter(event => {
            const key = `${event.source}:${event.home}:${event.away}:${event.startsAt}`
            if (seen.has(key)) return false
            seen.add(key)
            return true
        }),
        errors: payload?.errors || [],
        quotas: payload?.quotas || {},
        sources: payload?.sources || {},
        inSeason: payload?.theOddsApi?.inSeason || [],
        generatedAt: payload?.generatedAt || null,
        cached: Boolean(payload?.cached),
    }
}
