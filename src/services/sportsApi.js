// The Odds API + TheSportsDB integration with key rotation and aggressive caching.
// Educational use only. Settlement is local and simulated.
//
// Env (Vite): VITE_ODDS_API_KEYS = "key1,key2,key3"

const STORAGE_PREFIX = 'gampo_odds_'
const COOLDOWN_KEY = `${STORAGE_PREFIX}cooldown`
const KEY_INDEX_KEY = `${STORAGE_PREFIX}key_index`

const DEFAULT_TTL_MS = 10 * 60 * 1000 // 10 minutes
const SPORTS_TTL_MS = 24 * 60 * 60 * 1000 // 24h
const SDB_TTL_MS = 24 * 60 * 60 * 1000 // 24h

function readEnvKeys() {
    try {
        const raw = import.meta.env?.VITE_ODDS_API_KEYS
        if (!raw) return null
        const parts = String(raw).split(',').map(s => s.trim()).filter(Boolean)
        return parts.length ? parts : null
    } catch {
        return null
    }
}

function getKeys() {
    return readEnvKeys() || []
}

function readStorage(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null }
}
function writeStorage(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore */ }
}

function cooldownMap() {
    return readStorage(COOLDOWN_KEY) || {}
}

function setCooldown(keyStr, untilTs) {
    const map = cooldownMap()
    map[keyStr] = untilTs
    writeStorage(COOLDOWN_KEY, map)
}

function isCooldown(keyStr) {
    const map = cooldownMap()
    const until = map[keyStr]
    return until && until > Date.now()
}

function nextKey() {
    const keys = getKeys()
    const idxRaw = readStorage(KEY_INDEX_KEY)
    let idx = typeof idxRaw === 'number' ? idxRaw : 0
    for (let attempt = 0; attempt < keys.length; attempt++) {
        const candidate = keys[(idx + attempt) % keys.length]
        if (!isCooldown(candidate)) {
            const newIndex = (idx + attempt + 1) % keys.length
            writeStorage(KEY_INDEX_KEY, newIndex)
            return candidate
        }
    }
    return null // all in cooldown
}

function cacheGet(key, ttl) {
    const entry = readStorage(`${STORAGE_PREFIX}${key}`)
    if (!entry) return null
    if (Date.now() - entry.ts > ttl) return null
    return entry.value
}

function cacheSet(key, value) {
    writeStorage(`${STORAGE_PREFIX}${key}`, { ts: Date.now(), value })
}

function quotaInfo(headers) {
    return {
        used: Number(headers.get?.('x-requests-used')) || null,
        remaining: Number(headers.get?.('x-requests-remaining')) || null,
        last: Number(headers.get?.('x-requests-last')) || null,
    }
}

const QUOTA_KEY = `${STORAGE_PREFIX}quota`
function recordQuota(keyStr, info) {
    const all = readStorage(QUOTA_KEY) || {}
    all[keyStr] = { ...info, ts: Date.now() }
    writeStorage(QUOTA_KEY, all)
}

export function getQuotaSnapshot() {
    return readStorage(QUOTA_KEY) || {}
}

async function oddsFetch(pathAndQuery, { ttl = DEFAULT_TTL_MS } = {}) {
    const cached = cacheGet(`oddsapi:${pathAndQuery}`, ttl)
    if (cached) return { data: cached, cached: true }

    const errors = []
    const tried = new Set()
    while (true) {
        const key = nextKey()
        if (!key || tried.has(key)) break
        tried.add(key)
        const sep = pathAndQuery.includes('?') ? '&' : '?'
        const url = `https://api.the-odds-api.com${pathAndQuery}${sep}apiKey=${encodeURIComponent(key)}`
        try {
            const r = await fetch(url, { method: 'GET' })
            recordQuota(key, quotaInfo(r.headers))
            if (r.status === 401 || r.status === 403) {
                setCooldown(key, Date.now() + 60 * 60 * 1000)
                errors.push(`auth fail (${r.status})`)
                continue
            }
            if (r.status === 429) {
                setCooldown(key, Date.now() + 30 * 60 * 1000)
                errors.push('rate limited (429)')
                continue
            }
            if (!r.ok) {
                errors.push(`status ${r.status}`)
                continue
            }
            const data = await r.json()
            cacheSet(`oddsapi:${pathAndQuery}`, data)
            return { data, cached: false }
        } catch (err) {
            errors.push(err?.message || String(err))
        }
    }
    return { data: null, cached: false, errors }
}

export async function fetchInSeasonSports() {
    const { data, cached, errors } = await oddsFetch('/v4/sports', { ttl: SPORTS_TTL_MS })
    return { data: data || [], cached, errors }
}

export async function fetchUpcomingOdds(region = 'us') {
    const r = await oddsFetch(`/v4/sports/upcoming/odds/?regions=${encodeURIComponent(region)}&markets=h2h&oddsFormat=decimal`, { ttl: DEFAULT_TTL_MS })
    return { data: r.data || [], cached: r.cached, errors: r.errors }
}

export async function fetchOddsForSport(sportKey, { regions = 'us,uk', markets = 'h2h' } = {}) {
    if (!sportKey) return { data: [], cached: false }
    const r = await oddsFetch(`/v4/sports/${encodeURIComponent(sportKey)}/odds/?regions=${encodeURIComponent(regions)}&markets=${encodeURIComponent(markets)}&oddsFormat=decimal`, { ttl: DEFAULT_TTL_MS })
    return { data: r.data || [], cached: r.cached, errors: r.errors }
}

// === TheSportsDB (educational historical) ===

async function sdbFetch(pathAndQuery, ttl = SDB_TTL_MS) {
    const cached = cacheGet(`sdb:${pathAndQuery}`, ttl)
    if (cached) return { data: cached, cached: true }
    try {
        const r = await fetch(`https://www.thesportsdb.com${pathAndQuery}`, { method: 'GET' })
        if (!r.ok) return { data: null, cached: false }
        const data = await r.json()
        cacheSet(`sdb:${pathAndQuery}`, data)
        return { data, cached: false }
    } catch {
        return { data: null, cached: false }
    }
}

export async function fetchEventsForDay(dateStr, sport = 'Soccer') {
    const { data, cached } = await sdbFetch(`/api/v1/json/3/eventsday.php?d=${encodeURIComponent(dateStr)}&s=${encodeURIComponent(sport)}`)
    return { data: data?.events || [], cached }
}

export async function fetchEventDetail(eventId) {
    const { data, cached } = await sdbFetch(`/api/v1/json/3/lookupevent.php?id=${encodeURIComponent(eventId)}`)
    return { data: data?.events?.[0] || null, cached }
}

// === Helpers ===

export function impliedFromDecimal(odds) {
    const o = Number(odds)
    if (!Number.isFinite(o) || o <= 1) return 0
    return 1 / o
}

export function bestBookmakerPrice(bookmakers, marketKey, outcomeName) {
    let best = null
    for (const bm of bookmakers || []) {
        const market = (bm.markets || []).find(m => m.key === marketKey)
        if (!market) continue
        const outcome = (market.outcomes || []).find(o => o.name === outcomeName)
        if (!outcome) continue
        const price = Number(outcome.price)
        if (!Number.isFinite(price)) continue
        if (!best || price > best.price) best = { price, bookmaker: bm.key, title: bm.title }
    }
    return best
}

export function fixtureFromOddsApi(event, bookmakerKey = null, region = 'us') {
    // Normalize one Odds API event into GamPo fixture shape.
    const id = event.id
    const sport = event.sport_title || event.sport_key || 'Sport'
    const league = event.sport_title || ''
    const home = event.home_team
    const away = event.away_team
    const start = event.commence_time
    const bookmakers = event.bookmakers || []
    const chosen = bookmakerKey
        ? bookmakers.find(bm => bm.key === bookmakerKey)
        : bookmakers[0]
    const market = (chosen?.markets || []).find(m => m.key === 'h2h')
    const outcomes = market?.outcomes || []
    const markets = outcomes.map(o => {
        const decimalOdds = Number(o.price) || 0
        const implied = impliedFromDecimal(decimalOdds)
        return {
            outcome: o.name === home ? 'home' : o.name === away ? 'away' : 'draw',
            label: o.name,
            decimalOdds,
            openingOdds: decimalOdds,
            trueProbability: implied, // placeholder; real model could de-vig
        }
    })
    // De-vig estimated true probabilities
    const overround = markets.reduce((s, m) => s + impliedFromDecimal(m.decimalOdds), 0) || 1
    for (const m of markets) {
        m.trueProbability = (impliedFromDecimal(m.decimalOdds) / overround) || 0
    }
    return {
        id,
        sport,
        league,
        home,
        away,
        starts: start ? new Date(start).toISOString().slice(11, 16) : '',
        live: false,
        liveSource: true,
        bookmakers: bookmakers.map(bm => ({ key: bm.key, title: bm.title })),
        bookmaker: chosen?.key || null,
        bookmakerTitle: chosen?.title || null,
        region,
        markets,
        raw: event,
    }
}
