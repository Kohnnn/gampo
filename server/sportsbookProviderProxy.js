import { curateTopSportsbookItems, mergeMarqueeMetrics } from '../src/sportsbook/sportsbookMarquee.js'

const CACHE_TTL_MS = 5 * 60 * 1000
const PROVIDER_TIMEOUT_MS = 7000

const SPORTSGAMEODDS_FREE_TIER_LEAGUES = [
    'NBA',
    'NFL',
    'MLB',
    'NHL',
    'NCAAB',
    'NCAAF',
].join(',')
const SPORTSGAMEODDS_MAIN_MARKETS = [
    'points-home-game-ml-home',
    'points-away-game-ml-away',
    'points-home-game-sp-home',
    'points-away-game-sp-away',
    'points-all-game-ou-over',
    'points-all-game-ou-under',
].join(',')
const ODDS_API_IO_SPORTS = ['football', 'basketball', 'tennis', 'esports']
const ODDS_API_IO_BOOKMAKERS = ['Bet365', 'Unibet'].join(',')
const API_SPORTS_MULTI_SPORTS = [
    { key: 'baseball', host: 'v1.baseball.api-sports.io', path: '/games' },
    { key: 'basketball', host: 'v1.basketball.api-sports.io', path: '/games' },
    { key: 'handball', host: 'v1.handball.api-sports.io', path: '/games' },
    { key: 'hockey', host: 'v1.hockey.api-sports.io', path: '/games' },
    { key: 'nfl', host: 'v1.american-football.api-sports.io', path: '/games' },
    { key: 'rugby', host: 'v1.rugby.api-sports.io', path: '/games' },
    { key: 'volleyball', host: 'v1.volleyball.api-sports.io', path: '/games' },
    { key: 'formula-1', host: 'v1.formula-1.api-sports.io', path: '/races' },
    { key: 'mma', host: 'v1.mma.api-sports.io', path: '/fights' },
]

let cachedFeed = null
const PROVIDER_KEY_COOLDOWN = new Map()

function envValue(env, names) {
    for (const name of names) {
        const value = env?.[name] || process.env[name]
        if (value) return value
    }
    return ''
}

function envValues(env, names) {
    const raw = envValue(env, names)
    return String(raw || '').split(',').map(part => part.trim()).filter(Boolean)
}

function quotaFromHeaders(headers, prefix) {
    const quota = {}
    const limit = headers.get('x-ratelimit-limit') || headers.get('x-rate-limit-limit')
    const remaining = headers.get('x-ratelimit-remaining') || headers.get('x-rate-limit-remaining') || headers.get('x-ratelimit-requests-remaining')
    const reset = headers.get('x-ratelimit-reset') || headers.get('x-rate-limit-reset')
    if (limit) quota.limit = Number(limit) || limit
    if (remaining) quota.remaining = Number(remaining) || remaining
    if (reset) quota.reset = reset
    return Object.keys(quota).length ? { [prefix]: quota } : {}
}

function compactProviderError(value) {
    if (!value) return ''
    return String(value).replace(/\s+/g, ' ').trim().slice(0, 180)
}

async function fetchJson(url, { headers = {}, label }) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS)
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                accept: 'application/json',
                ...headers,
            },
            signal: controller.signal,
        })

        if (response.status === 401 || response.status === 403) {
            return { ok: false, error: `${label} auth rejected (${response.status})`, quotas: quotaFromHeaders(response.headers, label) }
        }

        if (response.status === 429) {
            return { ok: false, error: `${label} rate limited`, quotas: quotaFromHeaders(response.headers, label) }
        }

        if (!response.ok) {
            let detail = ''
            try {
                const body = await response.json()
                detail = compactProviderError(body?.error || body?.message)
            } catch {
                detail = ''
            }
            return {
                ok: false,
                error: `${label} returned ${response.status}${detail ? `: ${detail}` : ''}`,
                quotas: quotaFromHeaders(response.headers, label),
            }
        }

        return {
            ok: true,
            data: await response.json(),
            quotas: quotaFromHeaders(response.headers, label),
        }
    } catch (error) {
        const message = error?.name === 'AbortError' ? `${label} timed out` : `${label} fetch failed`
        return { ok: false, error: message, quotas: {} }
    } finally {
        clearTimeout(timeout)
    }
}

async function fetchJsonWithRotatingKeys(keys, { label, makeUrl, makeHeaders }) {
    if (!keys.length) return { ok: false, error: `${label} not configured`, data: null, quotas: {} }
    const now = Date.now()
    let lastError = `${label} unavailable`
    for (const key of keys) {
        const cooldownKey = `${label}:${key}`
        if ((PROVIDER_KEY_COOLDOWN.get(cooldownKey) || 0) > now) continue
        const result = await fetchJson(makeUrl(key), { label, headers: makeHeaders(key) })
        if (result.ok) return result
        lastError = result.error || lastError
        if (/auth rejected|rate limited|401|403|429/i.test(result.error || '')) {
            PROVIDER_KEY_COOLDOWN.set(cooldownKey, now + 30 * 60 * 1000)
        }
    }
    return { ok: false, error: lastError, data: null, quotas: {} }
}

async function loadPandaScore(keys) {
    if (!keys.length) return { matches: [], errors: [], quotas: {}, configured: false }

    const url = new URL('https://api.pandascore.co/matches/upcoming')
    url.searchParams.set('per_page', '100')
    url.searchParams.set('sort', 'begin_at')

    const result = await fetchJsonWithRotatingKeys(keys, {
        label: 'pandascore',
        makeUrl: () => url,
        makeHeaders: key => ({ authorization: `Bearer ${key}` }),
    })

    const matches = Array.isArray(result.data) ? result.data : []
    const filtered = curateTopSportsbookItems(matches, { perSport: 20, minimumVisible: 50, maximumVisible: 100 })

    return {
        matches: filtered.items,
        errors: result.ok ? [] : [result.error],
        quotas: result.quotas || {},
        configured: true,
        marquee: filtered.metrics,
    }
}

async function loadSportsGameOdds(token) {
    if (!token) return { events: [], errors: [], quotas: {}, configured: false }

    const url = new URL('https://api.sportsgameodds.com/v2/events')
    url.searchParams.set('oddsAvailable', 'true')
    url.searchParams.set('leagueID', SPORTSGAMEODDS_FREE_TIER_LEAGUES)
    url.searchParams.set('oddID', SPORTSGAMEODDS_MAIN_MARKETS)
    url.searchParams.set('includeOpposingOdds', 'true')
    url.searchParams.set('includeAltLines', 'false')
    url.searchParams.set('limit', '100')

    const result = await fetchJson(url, {
        label: 'sportsGameOdds',
        headers: { 'x-api-key': token },
    })

    const data = Array.isArray(result.data?.data)
        ? result.data.data
        : Array.isArray(result.data)
            ? result.data
            : []

    const filtered = curateTopSportsbookItems(data, { perSport: 20, minimumVisible: 50, maximumVisible: 100 })

    return {
        events: filtered.items,
        errors: result.ok ? [] : [result.error],
        quotas: result.quotas || {},
        configured: true,
        marquee: filtered.metrics,
    }
}

async function loadOddsApiIo(token) {
    if (!token) return { events: [], odds: [], errors: [], quotas: {}, configured: false }

    const errors = []
    const quotas = {}
    const events = []

    for (const sport of ODDS_API_IO_SPORTS) {
        const url = new URL('https://api.odds-api.io/v3/events')
        url.searchParams.set('apiKey', token)
        url.searchParams.set('sport', sport)
        url.searchParams.set('status', 'pending,live')
        url.searchParams.set('limit', sport === 'football' ? '30' : '20')

        const result = await fetchJson(url, { label: 'oddsApiIo' })
        Object.assign(quotas, result.quotas)
        if (result.ok && Array.isArray(result.data)) {
            events.push(...result.data)
        } else if (!result.ok) {
            errors.push(result.error)
        }
    }

    const filtered = curateTopSportsbookItems(events, { perSport: 20, minimumVisible: 50, maximumVisible: 100 })
    const eventIds = filtered.items.map(event => event?.id).filter(Boolean).slice(0, 24)
    let odds = []
    if (eventIds.length) {
        const oddsUrl = new URL('https://api.odds-api.io/v3/odds/multi')
        oddsUrl.searchParams.set('apiKey', token)
        oddsUrl.searchParams.set('eventIds', eventIds.join(','))
        oddsUrl.searchParams.set('bookmakers', ODDS_API_IO_BOOKMAKERS)
        const result = await fetchJson(oddsUrl, { label: 'oddsApiIo' })
        Object.assign(quotas, result.quotas)
        if (result.ok) {
            odds = Array.isArray(result.data) ? result.data : [result.data].filter(Boolean)
        } else {
            errors.push(result.error)
        }
    }

    return { events: filtered.items, odds, errors, quotas, configured: true, marquee: filtered.metrics }
}

// === The Odds API (server-side; keys never reach the client bundle) ===
//
// Previously this provider was called from the browser via
// `import.meta.env.VITE_ODDS_API_KEYS`, which Vite inlines into the shipped JS
// — leaking the real keys to anyone who views source. It now runs here, behind
// the proxy, reading server-only env (`ODDS_API_KEYS`). Key rotation skips a
// key for the rest of this process once it returns 401/403/429.
const ODDS_API_COOLDOWN = new Map()

function oddsApiKeys(env) {
    const raw = envValue(env, ['ODDS_API_KEYS', 'VITE_ODDS_API_KEYS', 'odds_api_keys'])
    return String(raw || '').split(',').map(part => part.trim()).filter(Boolean)
}

async function oddsApiFetch(env, pathAndQuery, label) {
    const keys = oddsApiKeys(env)
    if (!keys.length) return { ok: false, error: `${label} not configured`, data: null, quotas: {} }

    const now = Date.now()
    let lastError = `${label} unavailable`
    for (const key of keys) {
        const cooldownUntil = ODDS_API_COOLDOWN.get(key) || 0
        if (cooldownUntil > now) continue
        const sep = pathAndQuery.includes('?') ? '&' : '?'
        const url = `https://api.the-odds-api.com${pathAndQuery}${sep}apiKey=${encodeURIComponent(key)}`
        const result = await fetchJson(url, { label })
        const remaining = Number(result.quotas?.[label]?.remaining)
        const quotas = Number.isFinite(remaining) ? { [label]: { remaining } } : {}
        if (result.ok) return { ok: true, data: result.data, quotas }
        lastError = result.error || lastError
        if (/auth rejected|rate limited|401|403|429/i.test(result.error || '')) {
            ODDS_API_COOLDOWN.set(key, now + 30 * 60 * 1000)
        }
    }
    return { ok: false, error: lastError, data: null, quotas: {} }
}

async function loadTheOddsApi(env) {
    if (!oddsApiKeys(env).length) return { events: [], inSeason: [], errors: [], quotas: {}, configured: false }

    const errors = []
    const quotas = {}
    const [us, uk, sports] = await Promise.all([
        oddsApiFetch(env, '/v4/sports/upcoming/odds/?regions=us&markets=h2h&oddsFormat=decimal', 'theOddsApi'),
        oddsApiFetch(env, '/v4/sports/upcoming/odds/?regions=uk&markets=h2h&oddsFormat=decimal', 'theOddsApi'),
        oddsApiFetch(env, '/v4/sports', 'theOddsApi'),
    ])

    const events = []
    for (const [region, result] of [['us', us], ['uk', uk]]) {
        Object.assign(quotas, result.quotas)
        if (result.ok && Array.isArray(result.data)) {
            for (const event of result.data) events.push({ ...event, _gampoRegion: region })
        } else if (!result.ok) {
            errors.push(result.error)
        }
    }
    Object.assign(quotas, sports.quotas)
    if (!sports.ok && sports.error) errors.push(sports.error)

    const filtered = curateTopSportsbookItems(events, { perSport: 20, minimumVisible: 50, maximumVisible: 100 })

    return {
        events: filtered.items.slice(0, 100),
        inSeason: Array.isArray(sports.data) ? sports.data : [],
        errors,
        quotas,
        configured: true,
        marquee: filtered.metrics,
    }
}

function isoDateOffset(days = 0) {
    const date = new Date()
    date.setDate(date.getDate() + days)
    return date.toISOString().slice(0, 10)
}

async function loadApiFootball(keys) {
    if (!keys.length) return { fixtures: [], odds: [], multiSport: [], errors: [], quotas: {}, configured: false }

    const errors = []
    const quotas = {}
    const dates = Array.from({ length: 7 }, (_, index) => isoDateOffset(index))
    const fixtures = []
    const odds = []
    const multiSport = []

    for (const date of dates) {
        const fixturesUrl = new URL('https://v3.football.api-sports.io/fixtures')
        fixturesUrl.searchParams.set('date', date)
        const fixturesResult = await fetchJsonWithRotatingKeys(keys, {
            label: 'apiFootball',
            makeUrl: () => fixturesUrl,
            makeHeaders: key => ({ 'x-apisports-key': key }),
        })
        Object.assign(quotas, fixturesResult.quotas)
        if (fixturesResult.ok && Array.isArray(fixturesResult.data?.response)) fixtures.push(...fixturesResult.data.response)
        else if (!fixturesResult.ok) errors.push(fixturesResult.error)

        const oddsUrl = new URL('https://v3.football.api-sports.io/odds')
        oddsUrl.searchParams.set('date', date)
        oddsUrl.searchParams.set('bet', '1')
        const oddsResult = await fetchJsonWithRotatingKeys(keys, {
            label: 'apiFootball',
            makeUrl: () => oddsUrl,
            makeHeaders: key => ({ 'x-apisports-key': key }),
        })
        Object.assign(quotas, oddsResult.quotas)
        if (oddsResult.ok && Array.isArray(oddsResult.data?.response)) odds.push(...oddsResult.data.response)
        else if (!oddsResult.ok && !/returned 4(00|04|22)/.test(oddsResult.error || '')) errors.push(oddsResult.error)
    }

    const multiSportDates = dates.slice(0, 3)
    const multiSportRequests = API_SPORTS_MULTI_SPORTS.flatMap(sport => {
        const scanDates = sport.key === 'formula-1' ? [isoDateOffset(0)] : multiSportDates
        return scanDates.map(date => ({ sport, date }))
    })
    await Promise.all(multiSportRequests.map(async ({ sport, date }) => {
        const url = new URL(`https://${sport.host}${sport.path}`)
        if (sport.key === 'formula-1') url.searchParams.set('season', String(new Date().getFullYear()))
        else url.searchParams.set('date', date)
        const result = await fetchJsonWithRotatingKeys(keys, {
            label: `apiSports-${sport.key}`,
            makeUrl: () => url,
            makeHeaders: key => ({ 'x-apisports-key': key }),
        })
        Object.assign(quotas, result.quotas)
        if (result.ok && Array.isArray(result.data?.response)) {
            multiSport.push(...result.data.response.map(item => ({ ...item, _gampoApiSport: sport.key })))
        } else if (!result.ok && !/returned 4(00|04|22)/.test(result.error || '')) {
            errors.push(result.error)
        }
    }))

    const filtered = curateTopSportsbookItems(fixtures, { perSport: 60, minimumVisible: 80, maximumVisible: 180 })
    const multiSportFiltered = curateTopSportsbookItems(multiSport, { perSport: 30, minimumVisible: 80, maximumVisible: 220 })

    return {
        fixtures: filtered.items.slice(0, 180),
        odds,
        multiSport: multiSportFiltered.items.slice(0, 220),
        errors,
        quotas,
        configured: true,
        marquee: mergeMarqueeMetrics(filtered.metrics, multiSportFiltered.metrics),
    }
}

export async function loadProviderFeed(env) {
    const now = Date.now()
    if (cachedFeed && now - cachedFeed.ts < CACHE_TTL_MS) return { ...cachedFeed.value, cached: true }

    const tokens = {
        sportsGameOdds: envValue(env, ['SPORTSGAMEODDS_TOKEN', 'SportsGameOdds_token', 'sportsGameOdds_token']),
        pandascore: envValues(env, ['PANDASCORE_TOKEN', 'pandascore_token']),
        oddsApiIo: envValue(env, ['ODDS_API_IO_TOKEN', 'odds-api_token', 'ODDS_API_TOKEN']),
        apiFootball: envValues(env, ['API_FOOTBALL_TOKEN', 'api-football_token']),
    }

    const [sportsGameOdds, pandascore, oddsApiIo, apiFootball, theOddsApi] = await Promise.all([
        loadSportsGameOdds(tokens.sportsGameOdds),
        loadPandaScore(tokens.pandascore),
        loadOddsApiIo(tokens.oddsApiIo),
        loadApiFootball(tokens.apiFootball),
        loadTheOddsApi(env),
    ])

    const value = {
        generatedAt: new Date().toISOString(),
        cached: false,
        sources: {
            sportsGameOdds: {
                configured: sportsGameOdds.configured,
                eventCount: sportsGameOdds.events.length,
                primary: true,
                marquee: sportsGameOdds.marquee,
            },
            pandascore: {
                configured: pandascore.configured,
                eventCount: pandascore.matches.length,
                marquee: pandascore.marquee,
            },
            oddsApiIo: {
                configured: oddsApiIo.configured,
                eventCount: oddsApiIo.events.length,
                oddsCount: oddsApiIo.odds.length,
                marquee: oddsApiIo.marquee,
            },
            apiFootball: {
                configured: apiFootball.configured,
                eventCount: apiFootball.fixtures.length,
                multiSportCount: apiFootball.multiSport.length,
                oddsCount: apiFootball.odds.length,
                marquee: apiFootball.marquee,
            },
            theOddsApi: {
                configured: theOddsApi.configured,
                eventCount: theOddsApi.events.length,
                marquee: theOddsApi.marquee,
            },
        },
        marquee: mergeMarqueeMetrics(
            sportsGameOdds.marquee,
            pandascore.marquee,
            oddsApiIo.marquee,
            apiFootball.marquee,
            theOddsApi.marquee,
        ),
        sportsGameOdds: { events: sportsGameOdds.events },
        pandascore: { matches: pandascore.matches },
        oddsApiIo: { events: oddsApiIo.events, odds: oddsApiIo.odds },
        apiFootball: { fixtures: apiFootball.fixtures, odds: apiFootball.odds, multiSport: apiFootball.multiSport },
        theOddsApi: { events: theOddsApi.events, inSeason: theOddsApi.inSeason },
        quotas: {
            ...sportsGameOdds.quotas,
            ...pandascore.quotas,
            ...oddsApiIo.quotas,
            ...apiFootball.quotas,
            ...theOddsApi.quotas,
        },
        errors: [
            ...sportsGameOdds.errors,
            ...pandascore.errors,
            ...oddsApiIo.errors,
            ...apiFootball.errors,
            ...theOddsApi.errors,
        ].filter(Boolean),
    }

    cachedFeed = { ts: now, value }
    return value
}

function sendJson(res, status, value) {
    res.statusCode = status
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(value))
}

export function sportsbookProviderProxy(env) {
    return {
        name: 'gampo-sportsbook-provider-proxy',
        configureServer(server) {
            server.middlewares.use('/api/sportsbook/free-feed', async (req, res) => {
                if (req.method !== 'GET') {
                    sendJson(res, 405, { errors: ['method not allowed'] })
                    return
                }

                try {
                    sendJson(res, 200, await loadProviderFeed(env))
                } catch {
                    sendJson(res, 502, { errors: ['sportsbook provider proxy failed'] })
                }
            })
        },
    }
}
