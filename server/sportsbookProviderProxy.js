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

let cachedFeed = null

function envValue(env, names) {
    for (const name of names) {
        const value = env?.[name] || process.env[name]
        if (value) return value
    }
    return ''
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

async function loadPandaScore(token) {
    if (!token) return { matches: [], errors: [], quotas: {}, configured: false }

    const url = new URL('https://api.pandascore.co/matches/upcoming')
    url.searchParams.set('per_page', '30')
    url.searchParams.set('sort', 'begin_at')

    const result = await fetchJson(url, {
        label: 'pandascore',
        headers: { authorization: `Bearer ${token}` },
    })

    return {
        matches: Array.isArray(result.data) ? result.data : [],
        errors: result.ok ? [] : [result.error],
        quotas: result.quotas || {},
        configured: true,
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
    url.searchParams.set('limit', '30')

    const result = await fetchJson(url, {
        label: 'sportsGameOdds',
        headers: { 'x-api-key': token },
    })

    const data = Array.isArray(result.data?.data)
        ? result.data.data
        : Array.isArray(result.data)
            ? result.data
            : []

    return {
        events: data,
        errors: result.ok ? [] : [result.error],
        quotas: result.quotas || {},
        configured: true,
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
        url.searchParams.set('limit', sport === 'football' ? '8' : '5')

        const result = await fetchJson(url, { label: 'oddsApiIo' })
        Object.assign(quotas, result.quotas)
        if (result.ok && Array.isArray(result.data)) {
            events.push(...result.data)
        } else if (!result.ok) {
            errors.push(result.error)
        }
    }

    const eventIds = events.map(event => event?.id).filter(Boolean).slice(0, 10)
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

    return { events, odds, errors, quotas, configured: true }
}

function todayIsoDate() {
    return new Date().toISOString().slice(0, 10)
}

async function loadApiFootball(token) {
    if (!token) return { fixtures: [], odds: [], errors: [], quotas: {}, configured: false }

    const headers = { 'x-apisports-key': token }
    const errors = []
    const quotas = {}
    const date = todayIsoDate()

    const oddsUrl = new URL('https://v3.football.api-sports.io/odds')
    oddsUrl.searchParams.set('date', date)
    oddsUrl.searchParams.set('bet', '1')
    const oddsResult = await fetchJson(oddsUrl, {
        label: 'apiFootball',
        headers,
    })
    Object.assign(quotas, oddsResult.quotas)
    if (!oddsResult.ok) errors.push(oddsResult.error)

    const odds = Array.isArray(oddsResult.data?.response) ? oddsResult.data.response : []
    const oddsFixtureIds = new Set(odds.map(entry => String(entry?.fixture?.id || '')).filter(Boolean))

    const fixturesUrl = new URL('https://v3.football.api-sports.io/fixtures')
    fixturesUrl.searchParams.set('date', date)
    const fixturesResult = await fetchJson(fixturesUrl, {
        label: 'apiFootball',
        headers,
    })
    Object.assign(quotas, fixturesResult.quotas)
    if (!fixturesResult.ok) errors.push(fixturesResult.error)

    const fixtures = Array.isArray(fixturesResult.data?.response)
        ? fixturesResult.data.response.filter(item => {
            if (!oddsFixtureIds.size) return true
            return oddsFixtureIds.has(String(item?.fixture?.id || ''))
        }).slice(0, 30)
        : []

    return {
        fixtures,
        odds,
        errors,
        quotas,
        configured: true,
    }
}

async function loadProviderFeed(env) {
    const now = Date.now()
    if (cachedFeed && now - cachedFeed.ts < CACHE_TTL_MS) return { ...cachedFeed.value, cached: true }

    const tokens = {
        sportsGameOdds: envValue(env, ['SPORTSGAMEODDS_TOKEN', 'SportsGameOdds_token', 'sportsGameOdds_token']),
        pandascore: envValue(env, ['PANDASCORE_TOKEN', 'pandascore_token']),
        oddsApiIo: envValue(env, ['ODDS_API_IO_TOKEN', 'odds-api_token', 'ODDS_API_TOKEN']),
        apiFootball: envValue(env, ['API_FOOTBALL_TOKEN', 'api-football_token']),
    }

    const [sportsGameOdds, pandascore, oddsApiIo, apiFootball] = await Promise.all([
        loadSportsGameOdds(tokens.sportsGameOdds),
        loadPandaScore(tokens.pandascore),
        loadOddsApiIo(tokens.oddsApiIo),
        loadApiFootball(tokens.apiFootball),
    ])

    const value = {
        generatedAt: new Date().toISOString(),
        cached: false,
        sources: {
            sportsGameOdds: {
                configured: sportsGameOdds.configured,
                eventCount: sportsGameOdds.events.length,
                primary: true,
            },
            pandascore: {
                configured: pandascore.configured,
                eventCount: pandascore.matches.length,
            },
            oddsApiIo: {
                configured: oddsApiIo.configured,
                eventCount: oddsApiIo.events.length,
                oddsCount: oddsApiIo.odds.length,
            },
            apiFootball: {
                configured: apiFootball.configured,
                eventCount: apiFootball.fixtures.length,
                oddsCount: apiFootball.odds.length,
            },
        },
        sportsGameOdds: { events: sportsGameOdds.events },
        pandascore: { matches: pandascore.matches },
        oddsApiIo: { events: oddsApiIo.events, odds: oddsApiIo.odds },
        apiFootball: { fixtures: apiFootball.fixtures, odds: apiFootball.odds },
        quotas: {
            ...sportsGameOdds.quotas,
            ...pandascore.quotas,
            ...oddsApiIo.quotas,
            ...apiFootball.quotas,
        },
        errors: [
            ...sportsGameOdds.errors,
            ...pandascore.errors,
            ...oddsApiIo.errors,
            ...apiFootball.errors,
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
