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

const START_BUCKET_MS = 15 * 60 * 1000
const CURRENT_AGE_MS = 5 * 60 * 1000

function normalizeIdentity(value) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
}

function canonicalIdentity({ sportId, home, away, leagueName, startsAt, source, providerEventId }) {
    const participants = [normalizeIdentity(home), normalizeIdentity(away)].sort()
    const startMs = Date.parse(startsAt)
    const competition = normalizeIdentity(leagueName)
    if (!participants[0] || participants[0] === participants[1] || !Number.isFinite(startMs)) {
        const key = `isolated:${source}:${providerEventId || hashString(`${home}:${away}:${startsAt}`)}`
        return { canonicalKey: key, id: `event-${hashString(key).toString(36)}`, startsAt: Number.isFinite(startMs) ? new Date(startMs).toISOString() : null }
    }
    const bucket = Math.floor(startMs / START_BUCKET_MS)
    const key = [normalizeIdentity(sportId), participants.join('|'), competition, bucket].join(':')
    return { canonicalKey: key, id: `event-${hashString(key).toString(36)}`, startsAt: new Date(startMs).toISOString() }
}

function freshnessFor(observedAt, referenceAt) {
    const observedMs = Date.parse(observedAt)
    const referenceMs = Date.parse(referenceAt)
    if (!Number.isFinite(observedMs) || !Number.isFinite(referenceMs) || observedMs > referenceMs) return 'unknown'
    return referenceMs - observedMs <= CURRENT_AGE_MS ? 'current' : 'stale'
}

function eligibilityFor({ bookmaker, decimalOdds, freshness, model = false }) {
    if (model) return { submittable: false, ineligibilityReason: 'model-estimate' }
    if (!bookmaker) return { submittable: false, ineligibilityReason: 'missing-bookmaker' }
    if (!Number.isFinite(Number(decimalOdds)) || Number(decimalOdds) <= 1) return { submittable: false, ineligibilityReason: 'invalid-odds' }
    if (freshness === 'stale') return { submittable: false, ineligibilityReason: 'stale-offer' }
    if (freshness !== 'current') return { submittable: false, ineligibilityReason: 'unknown-freshness' }
    return { submittable: true, ineligibilityReason: null }
}

const FAMOUS_NAME_TOKENS = [
    'argentina', 'brazil', 'france', 'germany', 'spain', 'england', 'portugal', 'netherlands', 'italy', 'belgium',
    'manchester', 'arsenal', 'liverpool', 'chelsea', 'real madrid', 'barcelona', 'bayern', 'psg', 'inter', 'milan',
    'lakers', 'celtics', 'warriors', 'knicks', 'chiefs', 'eagles', 'cowboys', '49ers', 'yankees', 'dodgers', 'red sox',
    'ufc', 'ferrari', 'mercedes', 'red bull', 'mclaren',
]

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
    if (text.includes('handball')) return 'handball'
    if (text.includes('rugby')) return 'rugby'
    if (text.includes('volleyball')) return 'volleyball'
    if (text.includes('formula') || text.includes('f1')) return 'formula-1'
    if (text.includes('mma') || text.includes('ufc')) return 'mma'
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

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value))
}

function nameStrength(name = '') {
    const text = String(name).toLowerCase()
    let score = 0
    for (const token of FAMOUS_NAME_TOKENS) {
        if (text.includes(token)) score += 0.08
    }
    score += (hashString(text) % 1000) / 1000 * 0.18
    return clamp(score, 0, 0.34)
}

function sportProfile(sportId) {
    if (sportId === 'soccer') return { margin: 1.07, draw: 0.26, home: 0.04, min: 0.08, max: 0.72 }
    if (sportId === 'ice-hockey') return { margin: 1.06, draw: 0.08, home: 0.035, min: 0.12, max: 0.78 }
    if (sportId === 'baseball') return { margin: 1.055, draw: 0, home: 0.025, min: 0.16, max: 0.82 }
    if (sportId === 'basketball' || sportId === 'football') return { margin: 1.055, draw: 0, home: 0.04, min: 0.12, max: 0.85 }
    if (sportId === 'formula-1' || sportId === 'mma') return { margin: 1.08, draw: 0, home: 0.015, min: 0.1, max: 0.88 }
    return { margin: 1.065, draw: 0, home: 0.03, min: 0.14, max: 0.84 }
}

function scoreLean(score) {
    if (!score) return 0
    const home = Number(score.home)
    const away = Number(score.away)
    if (!Number.isFinite(home) || !Number.isFinite(away) || home === away) return 0
    return clamp((home - away) * 0.11, -0.28, 0.28)
}

function estimatedProbabilities(seed, { sportId, home, away, startsAt, score }) {
    const profile = sportProfile(sportId)
    const hoursUntilStart = (new Date(startsAt).getTime() - Date.now()) / 3600000
    const timeLean = Number.isFinite(hoursUntilStart) && hoursUntilStart < 3 ? 0.015 : 0
    const strengthLean = nameStrength(home) - nameStrength(away)
    const seededLean = (unitFromSeed(seed, 'lean') - 0.5) * 0.16
    const homeProbability = clamp(0.5 + profile.home + strengthLean + seededLean + scoreLean(score) + timeLean, profile.min, profile.max)

    if (!profile.draw) return { home: homeProbability, away: 1 - homeProbability }

    const draw = clamp(profile.draw + (unitFromSeed(seed, 'draw') - 0.5) * 0.06 - Math.abs(homeProbability - 0.5) * 0.12, 0.16, 0.34)
    const remaining = 1 - draw
    const homeShare = clamp(homeProbability, 0.18, 0.72)
    return {
        home: remaining * homeShare,
        draw,
        away: remaining * (1 - homeShare),
    }
}

function fallbackOdds(seed, { hasDraw, sportId, home, away, startsAt, score }) {
    const probabilities = estimatedProbabilities(seed, { sportId, home, away, startsAt, score })
    const margin = sportProfile(sportId).margin
    const odds = {
        home: roundCurrency(1 / clamp(probabilities.home * margin, 0.03, 0.98)),
        away: roundCurrency(1 / clamp(probabilities.away * margin, 0.03, 0.98)),
    }
    if (hasDraw) odds.draw = roundCurrency(1 / clamp((probabilities.draw || 0.24) * margin, 0.03, 0.98))
    return odds
}

function selectionStatus(decimalOdds, previousOdds) {
    if (decimalOdds <= 1) return 'suspended'
    const diff = decimalOdds - previousOdds
    if (diff > 0.015) return 'odds-up'
    if (diff < -0.015) return 'odds-down'
    return 'available'
}

function makeWinnerMarket({ eventId, sportId, home, away, source, prices, estimated = false, startsAt, score, bookmaker = null, observedAt = null }) {
    const hasDraw = sportId === 'soccer' || Boolean(prices?.draw)
    const resolved = {
        ...fallbackOdds(eventId, { hasDraw, sportId, home, away, startsAt, score }),
        ...Object.fromEntries(Object.entries(prices || {}).filter(([, value]) => Number(value) > 1)),
    }
    const selectionSource = estimated ? 'synthetic-estimate' : source

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
                source: selectionSource,
                bookmaker,
                observedAt,
                estimated,
                status: selectionStatus(decimalOdds, previousOdds),
            }
        }),
    }
}

function normalizedEvent({ id, providerEventId: suppliedProviderEventId, sportId, source, leagueName, region, startsAt, status, home, away, homeLogo = null, awayLogo = null, score = null, prices = {}, marketGroups = null, tags = [], observedAt = null, referenceAt = null, sourceContext = null }) {
    if (!home || !away) return null
    const providerEventId = String(suppliedProviderEventId ?? id ?? '')
    const identity = canonicalIdentity({ sportId, home, away, leagueName, startsAt, source, providerEventId })
    const league = feedLeagueMeta({ sportId, source, leagueName, region })
    const hasRealPrices = Object.values(prices || {}).some(value => Number(value) > 1)
    const estimated = !marketGroups?.length && !hasRealPrices
    const resolvedTags = ['feed', source, ...tags]
    if (estimated) resolvedTags.push('estimated-odds')
    const compatibilityGroups = marketGroups?.length ? marketGroups : [makeWinnerMarket({ eventId: id, sportId, home, away, source, prices, estimated, startsAt, score })]
    const offers = []
    const modelEstimates = []
    const projectedGroups = compatibilityGroups.map(group => ({
        ...group,
        selections: group.selections.map(selection => {
            const bookmaker = selection.bookmaker || null
            const observation = selection.observedAt || observedAt || referenceAt
            const freshness = freshnessFor(observation, referenceAt)
            const model = estimated || selection.estimated || selection.source === 'synthetic-estimate'
            const eligibility = eligibilityFor({ bookmaker, decimalOdds: selection.decimalOdds, freshness, model })
            const canonicalOutcome = ['home', 'away'].includes(selection.side)
                ? normalizeIdentity(selection.side === 'home' ? home : away)
                : normalizeIdentity(selection.side)
            const common = {
                ...selection,
                id: `${identity.id}-${slugify(source)}-${slugify(providerEventId)}-${group.id}-${slugify(canonicalOutcome)}-${slugify(selection.line ?? 'no-line')}-${slugify(bookmaker || 'unknown-bookmaker')}`,
                eventId: identity.id,
                canonicalEventId: identity.id,
                provider: model ? 'gampo-model' : source,
                providerEventId,
                bookmaker: model ? null : bookmaker,
                marketId: group.id,
                marketLabel: group.label,
                outcome: canonicalOutcome,
                observedAt: observation || null,
                freshness,
                sourceContext: { payloadGroup: sourceContext || source, observationSource: selection.observedAt ? 'bookmaker' : observedAt ? 'provider-event' : referenceAt ? 'payload-generated-at' : 'unknown' },
                ...eligibility,
                suspended: !eligibility.submittable,
            }
            if (model) modelEstimates.push(common)
            else offers.push(common)
            return common
        }),
    }))
    return {
        id: identity.id,
        canonicalEventId: identity.id,
        canonicalKey: identity.canonicalKey,
        sportId,
        leagueId: league.leagueId,
        region: league.region,
        startsAt: identity.startsAt,
        status,
        clock: null,
        period: null,
        home,
        away,
        homeLogo,
        awayLogo,
        participants: [home, away],
        score,
        sourceRefs: [{ provider: source, eventId: providerEventId }],
        facts: {
            scheduleMetadata: { role: 'schedule-metadata', provider: source, observedAt: observedAt || referenceAt || null, startsAt: identity.startsAt, competition: leagueName || null },
            scoreStatus: { role: 'score-status', provider: source, observedAt: observedAt || referenceAt || null, score, status: status || null },
            scheduleMetadataObservations: [{ role: 'schedule-metadata', provider: source, observedAt: observedAt || referenceAt || null, startsAt: identity.startsAt, competition: leagueName || null }],
            scoreStatusObservations: [{ role: 'score-status', provider: source, observedAt: observedAt || referenceAt || null, score, status: status || null }],
        },
        offers,
        modelEstimates,
        feedState: { status: offers.some(offer => offer.freshness === 'current') ? 'current' : offers.length ? 'stale' : 'empty' },
        tags: resolvedTags,
        marketGroups: projectedGroups,
        bookmakerTitle: estimated ? 'Estimated odds' : [...new Set(offers.map(offer => offer.bookmaker).filter(Boolean))].join(', ') || null,
        source,
        oddsMode: estimated ? 'estimated' : 'real',
    }
}

function americanToDecimal(value) {
    const raw = Number(String(value ?? '').replace(/[^0-9.+-]/g, ''))
    if (!Number.isFinite(raw) || raw === 0) return 0
    if (raw > 1 && raw < 100) return roundCurrency(raw)
    if (raw > 0) return roundCurrency(1 + raw / 100)
    return roundCurrency(1 + 100 / Math.abs(raw))
}

function sportsGameOddsPrices(odd) {
    return Object.entries(odd?.byBookmaker || {}).flatMap(([bookmakerId, entry]) => {
        if (entry?.available === false) return []
        const decimalOdds = americanToDecimal(entry?.odds)
        if (decimalOdds <= 1) return []
        return [{
            bookmakerId,
            decimalOdds,
            spread: entry?.spread,
            overUnder: entry?.overUnder,
            observedAt: entry?.lastUpdated || entry?.updatedAt || entry?.timestamp || null,
        }]
    })
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
                bookmaker: outcome.bookmaker || null,
                observedAt: outcome.observedAt || null,
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

function imageUrl(...values) {
    for (const value of values) {
        if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value
    }
    return null
}

function lineLabel(label, line) {
    if (line === undefined || line === null || line === '') return label
    return `${label} ${line}`
}

function sportsGameOddsMarkets(event, { eventId, sportId, home, away }) {
    const winner = []
    const spread = []
    const total = []

    for (const [oddId, odd] of Object.entries(event?.odds || {})) {
        const parsed = parseSportsGameOddId(oddId)
        if (!parsed || parsed.periodID !== 'game') continue
        for (const price of sportsGameOddsPrices(odd)) {
            if (parsed.betTypeID === 'ml' || parsed.betTypeID === 'ml3way') {
                if (parsed.sideID === 'home') winner.push({ side: 'home', label: home, decimalOdds: price.decimalOdds, bookmaker: price.bookmakerId, observedAt: price.observedAt })
                if (parsed.sideID === 'away') winner.push({ side: 'away', label: away, decimalOdds: price.decimalOdds, bookmaker: price.bookmakerId, observedAt: price.observedAt })
                if (parsed.sideID === 'draw') winner.push({ side: 'draw', label: 'Draw', decimalOdds: price.decimalOdds, bookmaker: price.bookmakerId, observedAt: price.observedAt })
            }

            if (parsed.betTypeID === 'sp') {
                if (parsed.sideID === 'home') spread.push({ side: 'home', label: lineLabel(home, price.spread), line: price.spread, decimalOdds: price.decimalOdds, bookmaker: price.bookmakerId, observedAt: price.observedAt })
                if (parsed.sideID === 'away') spread.push({ side: 'away', label: lineLabel(away, price.spread), line: price.spread, decimalOdds: price.decimalOdds, bookmaker: price.bookmakerId, observedAt: price.observedAt })
            }

            if (parsed.betTypeID === 'ou') {
                if (parsed.sideID === 'over') total.push({ side: 'over', label: lineLabel('Over', price.overUnder), line: price.overUnder, decimalOdds: price.decimalOdds, bookmaker: price.bookmakerId, observedAt: price.observedAt })
                if (parsed.sideID === 'under') total.push({ side: 'under', label: lineLabel('Under', price.overUnder), line: price.overUnder, decimalOdds: price.decimalOdds, bookmaker: price.bookmakerId, observedAt: price.observedAt })
            }
        }
    }

    return [
        providerMarketGroup({
            eventId,
            id: 'winner',
            label: sportId === 'soccer' && winner.some(outcome => outcome.side === 'draw') ? '1x2' : 'Winner',
            source: 'sportsgameodds',
            outcomes: winner,
        }),
        providerMarketGroup({
            eventId,
            id: 'spread',
            label: sportId === 'ice-hockey' ? 'Puck Line' : sportId === 'baseball' ? 'Run Line' : 'Spread',
            source: 'sportsgameodds',
            outcomes: spread,
        }),
        providerMarketGroup({
            eventId,
            id: 'total',
            label: sportId === 'soccer' || sportId === 'ice-hockey' ? 'Total Goals' : 'Total Points',
            source: 'sportsgameodds',
            outcomes: total,
        }),
    ].filter(Boolean)
}

function sportsGameOddsStatus(status = {}) {
    if (status.finalized || status.ended) return 'settled'
    if (status.started) return 'live'
    return 'prematch'
}

export function normalizeSportsGameOddsEvent(event, context = {}) {
    const eventId = `sportsgameodds-${event?.eventID || event?.id}`
    const sportId = sportIdFromText(`${event?.sportID || ''} ${event?.leagueID || ''}`)
    const home = teamName(event?.teams?.home || event?.homeTeam, 'Home')
    const away = teamName(event?.teams?.away || event?.awayTeam, 'Away')
    const marketGroups = sportsGameOddsMarkets(event, { eventId, sportId, home, away })

    return normalizedEvent({
        id: eventId,
        providerEventId: event?.eventID || event?.id,
        sportId,
        source: 'sportsgameodds',
        leagueName: event?.leagueID || 'SportsGameOdds Feed',
        region: event?.sportID || 'SportsGameOdds',
        startsAt: event?.status?.startsAt || event?.startsAt || event?.startTime,
        status: sportsGameOddsStatus(event?.status),
        home,
        away,
        homeLogo: imageUrl(event?.teams?.home?.logo, event?.teams?.home?.image, event?.homeTeam?.logo, event?.homeTeam?.image),
        awayLogo: imageUrl(event?.teams?.away?.logo, event?.teams?.away?.image, event?.awayTeam?.logo, event?.awayTeam?.image),
        score: event?.score || null,
        marketGroups,
        observedAt: event?.lastUpdated || event?.updatedAt || null,
        referenceAt: context.generatedAt || null,
        sourceContext: 'sportsGameOdds',
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
    const opponents = match?.opponents || []
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
        homeLogo: imageUrl(opponents[0]?.opponent?.image_url, opponents[0]?.opponent?.logo, opponents[0]?.image_url),
        awayLogo: imageUrl(opponents[1]?.opponent?.image_url, opponents[1]?.opponent?.logo, opponents[1]?.image_url),
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
    let bookmakerName = null
    let observedAt = entry?.updatedAt || entry?.lastUpdated || entry?.timestamp || null
    const outcomesByBookmaker = []
    for (const bookmaker of bookmakerValues) {
        const currentBookmaker = bookmaker?.title || bookmaker?.name || bookmaker?.key || bookmaker?.id || null
        const currentObservedAt = bookmaker?.updatedAt || bookmaker?.lastUpdated || bookmaker?.timestamp || observedAt
        bookmakerName ||= currentBookmaker
        observedAt ||= currentObservedAt
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
                    if (label.includes(String(event?.home || '').toLowerCase())) {
                        prices.home = price
                        outcomesByBookmaker.push({ side: 'home', label: event?.home, decimalOdds: price, bookmaker: currentBookmaker, observedAt: outcome?.updatedAt || currentObservedAt })
                    } else if (label.includes(String(event?.away || '').toLowerCase())) {
                        prices.away = price
                        outcomesByBookmaker.push({ side: 'away', label: event?.away, decimalOdds: price, bookmaker: currentBookmaker, observedAt: outcome?.updatedAt || currentObservedAt })
                    } else if (label.includes('draw') || label === 'x') {
                        prices.draw = price
                        outcomesByBookmaker.push({ side: 'draw', label: 'Draw', decimalOdds: price, bookmaker: currentBookmaker, observedAt: outcome?.updatedAt || currentObservedAt })
                    }
                }
            }
        }
    }

    return { prices, bookmaker: bookmakerName, observedAt, outcomesByBookmaker }
}

export function normalizeOddsApiIoEvent(event, oddsPayload = [], context = {}) {
    const home = event?.home || event?.homeTeam || event?.home_team || event?.participants?.[0]?.name
    const away = event?.away || event?.awayTeam || event?.away_team || event?.participants?.[1]?.name
    const sportId = sportIdFromText(`${event?.sport || ''} ${event?.sportSlug || ''} ${event?.league || ''}`)
    const status = String(event?.status || '').toLowerCase().includes('live') ? 'live' : 'prematch'
    const extracted = extractOddsApiIoPrices(event, oddsPayload)
    return normalizedEvent({
        id: `oddsapiio-${event?.id}`,
        providerEventId: event?.id,
        sportId,
        source: 'odds-api-io',
        leagueName: event?.league?.name || event?.league || event?.competition || 'Odds API IO Feed',
        region: event?.region || event?.country || 'Odds',
        startsAt: event?.startTime || event?.start_time || event?.commence_time || event?.date,
        status,
        home,
        away,
        homeLogo: imageUrl(event?.homeLogo, event?.home_logo, event?.homeTeam?.logo, event?.participants?.[0]?.logo, event?.participants?.[0]?.image),
        awayLogo: imageUrl(event?.awayLogo, event?.away_logo, event?.awayTeam?.logo, event?.participants?.[1]?.logo, event?.participants?.[1]?.image),
        score: event?.score || null,
        prices: extracted.prices,
        marketGroups: extracted.outcomesByBookmaker.length
            ? [providerMarketGroup({ eventId: `oddsapiio-${event?.id}`, id: 'winner', label: extracted.prices.draw ? '1x2' : 'Winner', source: 'odds-api-io', outcomes: extracted.outcomesByBookmaker })]
            : Object.values(extracted.prices).some(value => Number(value) > 1)
                ? [makeWinnerMarket({ eventId: `oddsapiio-${event?.id}`, sportId, home, away, source: 'odds-api-io', prices: extracted.prices, startsAt: event?.startTime || event?.start_time || event?.commence_time || event?.date, score: event?.score || null, bookmaker: extracted.bookmaker, observedAt: extracted.observedAt })]
                : null,
        observedAt: event?.updatedAt || event?.lastUpdated || null,
        referenceAt: context.generatedAt || null,
        sourceContext: 'oddsApiIo',
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
        const prices = {}
        const outcomesByBookmaker = []
        for (const bookmaker of entry?.bookmakers || []) {
            const bet = bookmaker?.bets?.find(item => item?.id === 1 || /match winner|winner|1x2/i.test(item?.name || ''))
            for (const value of bet?.values || []) {
                const label = String(value?.value || '').toLowerCase()
                const odd = firstNumber(value?.odd)
                if (!odd || !['home', 'away', 'draw'].includes(label)) continue
                prices[label] = odd
                outcomesByBookmaker.push({
                    side: label,
                    label: label === 'draw' ? 'Draw' : label,
                    decimalOdds: odd,
                    bookmaker: bookmaker?.name || bookmaker?.title || bookmaker?.key || null,
                    observedAt: value?.updatedAt || entry?.update || entry?.updatedAt || bookmaker?.updatedAt || null,
                })
            }
        }
        if (Object.keys(prices).length) map.set(String(fixtureId), { prices, outcomesByBookmaker })
    }
    return map
}

export function normalizeApiFootballFixture(item, oddsByFixture = new Map(), context = {}) {
    const fixtureId = item?.fixture?.id
    const home = item?.teams?.home?.name
    const away = item?.teams?.away?.name
    const homeGoals = item?.goals?.home
    const awayGoals = item?.goals?.away
    const extracted = oddsByFixture.get(String(fixtureId)) || {}
    const prices = extracted.prices || extracted
    return normalizedEvent({
        id: `apifootball-${fixtureId}`,
        providerEventId: fixtureId,
        sportId: 'soccer',
        source: 'api-football',
        leagueName: item?.league?.name || 'API-Football Fixtures',
        region: item?.league?.country || 'Football',
        startsAt: item?.fixture?.date,
        status: apiFootballStatus(item?.fixture?.status?.short),
        home,
        away,
        homeLogo: imageUrl(item?.teams?.home?.logo),
        awayLogo: imageUrl(item?.teams?.away?.logo),
        score: Number.isFinite(homeGoals) && Number.isFinite(awayGoals) ? { home: homeGoals, away: awayGoals } : null,
        prices,
        marketGroups: extracted.outcomesByBookmaker?.length
            ? [providerMarketGroup({
                eventId: `apifootball-${fixtureId}`,
                id: 'winner',
                label: prices.draw ? '1x2' : 'Winner',
                source: 'api-football',
                outcomes: extracted.outcomesByBookmaker.map(outcome => ({ ...outcome, label: outcome.side === 'home' ? home : outcome.side === 'away' ? away : 'Draw' })),
            })]
            : null,
        observedAt: item?.fixture?.timestamp ? new Date(Number(item.fixture.timestamp) * 1000).toISOString() : null,
        referenceAt: context.generatedAt || null,
        sourceContext: 'apiFootball',
    })
}

const API_SPORT_LABELS = {
    baseball: 'Baseball',
    basketball: 'Basketball',
    handball: 'Handball',
    hockey: 'Hockey',
    nfl: 'NFL',
    rugby: 'Rugby',
    volleyball: 'Volleyball',
    'formula-1': 'Formula 1',
    mma: 'MMA',
}

const API_SPORT_IDS = {
    baseball: 'baseball',
    basketball: 'basketball',
    handball: 'handball',
    hockey: 'ice-hockey',
    nfl: 'football',
    rugby: 'rugby',
    volleyball: 'volleyball',
    'formula-1': 'formula-1',
    mma: 'mma',
}

function apiSportsName(value, fallback = '') {
    if (!value) return fallback
    if (typeof value === 'string') return value
    return value.name || value.long || value.medium || value.short || value.displayName || fallback
}

function apiSportsStatus(value) {
    const text = String(value?.short || value?.long || value?.status || value || '').toUpperCase()
    if (['1H', '2H', 'Q1', 'Q2', 'Q3', 'Q4', 'HT', 'OT', 'LIVE', 'IN PLAY', 'IN_PLAY'].some(token => text.includes(token))) return 'live'
    if (['FT', 'AET', 'ENDED', 'FINISHED', 'FINAL', 'CLOSED'].some(token => text.includes(token))) return 'settled'
    return 'prematch'
}

export function normalizeApiSportsMultiSportEvent(item) {
    const apiSport = item?._gampoApiSport || 'sport'
    const sportId = API_SPORT_IDS[apiSport] || sportIdFromText(apiSport)
    const label = API_SPORT_LABELS[apiSport] || apiSport
    const isFormula = apiSport === 'formula-1'
    const isMma = apiSport === 'mma'
    const id = item?.id || item?.game?.id || item?.race?.id || item?.fight?.id || `${apiSport}-${hashString(JSON.stringify(item).slice(0, 400))}`
    const home = isFormula
        ? apiSportsName(item?.competition, item?.race?.name || item?.type || 'Formula 1 Race')
        : isMma
            ? apiSportsName(item?.fighters?.first || item?.fighter_1 || item?.home, 'Fighter 1')
            : apiSportsName(item?.teams?.home || item?.home || item?.homeTeam, 'Home')
    const away = isFormula
        ? apiSportsName(item?.circuit, item?.circuit?.name || item?.country?.name || 'Field')
        : isMma
            ? apiSportsName(item?.fighters?.second || item?.fighter_2 || item?.away, 'Fighter 2')
            : apiSportsName(item?.teams?.away || item?.away || item?.awayTeam, 'Away')
    const homeScore = item?.scores?.home?.total ?? item?.scores?.home ?? item?.score?.home
    const awayScore = item?.scores?.away?.total ?? item?.scores?.away ?? item?.score?.away

    return normalizedEvent({
        id: `apisports-${apiSport}-${id}`,
        sportId,
        source: `api-sports-${apiSport}`,
        leagueName: item?.league?.name || item?.competition?.name || item?.championship?.name || `${label} Feed`,
        region: item?.country?.name || item?.league?.country || item?.competition?.location?.country || 'API-SPORTS',
        startsAt: item?.date || item?.game?.date?.date || item?.race?.date || item?.fight?.date,
        status: apiSportsStatus(item?.status || item?.game?.status || item?.race?.status),
        home,
        away,
        homeLogo: imageUrl(item?.teams?.home?.logo, item?.home?.logo, item?.homeTeam?.logo, item?.fighters?.first?.logo, item?.fighters?.first?.image),
        awayLogo: imageUrl(item?.teams?.away?.logo, item?.away?.logo, item?.awayTeam?.logo, item?.fighters?.second?.logo, item?.fighters?.second?.image),
        score: Number.isFinite(Number(homeScore)) && Number.isFinite(Number(awayScore)) ? { home: Number(homeScore), away: Number(awayScore) } : null,
        tags: ['api-sports', apiSport],
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

export function normalizeTheOddsApiEvent(event, region = 'us', context = {}) {
    const fixture = fixtureFromOddsApi(event, null, region)
    if (!fixture?.markets?.length) return null
    const sportId = oddsApiSportId(`${fixture.sport} ${event.sport_key || ''}`)
    const eventId = `theoddsapi-${fixture.id}`
    const outcomes = (event?.bookmakers || []).flatMap(bookmaker => {
        const market = (bookmaker?.markets || []).find(candidate => candidate?.key === 'h2h')
        return (market?.outcomes || []).flatMap(outcome => {
            const decimalOdds = Number(outcome?.price)
            if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) return []
            return [{
                side: outcome.name === fixture.home ? 'home' : outcome.name === fixture.away ? 'away' : 'draw',
                label: outcome.name,
                decimalOdds,
                bookmaker: bookmaker.title || bookmaker.key || null,
                observedAt: market?.last_update || bookmaker?.last_update || event?.last_update || event?.lastUpdate || null,
            }]
        })
    })
    const marketGroups = [providerMarketGroup({ eventId, id: 'winner', label: outcomes.some(outcome => outcome.side === 'draw') ? '1x2' : 'Winner', source: 'the-odds-api', outcomes })].filter(Boolean)
    return normalizedEvent({
        id: eventId,
        providerEventId: fixture.id,
        sportId,
        source: 'the-odds-api',
        leagueName: fixture.league || `${region.toUpperCase()} Feed`,
        region: region.toUpperCase(),
        startsAt: event.commence_time,
        status: 'prematch',
        home: fixture.home,
        away: fixture.away,
        homeLogo: imageUrl(event?.home_logo, event?.homeLogo),
        awayLogo: imageUrl(event?.away_logo, event?.awayLogo),
        marketGroups,
        observedAt: event?.last_update || event?.lastUpdate || null,
        referenceAt: context.generatedAt || null,
        sourceContext: 'theOddsApi',
        tags: ['primary-odds'],
    })
}

function aggregateCanonicalEvents(events) {
    const byKey = new Map()
    for (const event of events) {
        const existing = byKey.get(event.canonicalKey)
        if (!existing) {
            byKey.set(event.canonicalKey, event)
            continue
        }
        const sourceRefs = [...existing.sourceRefs, ...event.sourceRefs].filter((ref, index, refs) => (
            refs.findIndex(candidate => candidate.provider === ref.provider && candidate.eventId === ref.eventId) === index
        ))
        const offers = [...existing.offers, ...event.offers].filter((offer, index, list) => {
            const identity = [offer.canonicalEventId, offer.provider, offer.providerEventId, offer.bookmaker, offer.marketId, offer.outcome, offer.line, offer.decimalOdds, offer.observedAt].join('|')
            return list.findIndex(candidate => [candidate.canonicalEventId, candidate.provider, candidate.providerEventId, candidate.bookmaker, candidate.marketId, candidate.outcome, candidate.line, candidate.decimalOdds, candidate.observedAt].join('|') === identity) === index
        })
        const modelEstimates = [...existing.modelEstimates, ...event.modelEstimates]
        const groups = new Map()
        for (const group of [...existing.marketGroups, ...event.marketGroups]) {
            const current = groups.get(group.id)
            groups.set(group.id, current ? { ...current, selections: [...current.selections, ...group.selections] } : group)
        }
        byKey.set(event.canonicalKey, {
            ...existing,
            source: sourceRefs.map(ref => ref.provider).join('+'),
            sourceRefs,
            facts: {
                ...existing.facts,
                scheduleMetadataObservations: [...existing.facts.scheduleMetadataObservations, ...event.facts.scheduleMetadataObservations],
                scoreStatusObservations: [...existing.facts.scoreStatusObservations, ...event.facts.scoreStatusObservations],
            },
            offers,
            modelEstimates,
            marketGroups: [...groups.values()],
            feedState: { status: offers.some(offer => offer.freshness === 'current') ? 'current' : offers.length ? 'stale' : 'empty' },
        })
    }
    return [...byKey.values()].sort((a, b) => a.id.localeCompare(b.id))
}

function aggregateFeedState(events, errors) {
    if (!events.length) return { status: errors.length ? 'error' : 'empty' }
    if (errors.length) return { status: 'partial' }
    if (!events.some(event => event.offers.some(offer => offer.freshness === 'current'))) return { status: 'stale' }
    return { status: 'current' }
}

export function normalizeFreeProviderPayload(payload = {}) {
    const context = { generatedAt: payload?.generatedAt || null }
    const apiFootballOdds = apiFootballOddsMap(payload?.apiFootball?.odds || [])
    const normalized = [
        ...(payload?.sportsGameOdds?.events || []).map(event => normalizeSportsGameOddsEvent(event, context)),
        ...(payload?.pandascore?.matches || []).map(match => normalizePandaScoreMatch(match, context)),
        ...(payload?.oddsApiIo?.events || []).map(event => normalizeOddsApiIoEvent(event, payload?.oddsApiIo?.odds || [], context)),
        ...(payload?.apiFootball?.fixtures || []).map(item => normalizeApiFootballFixture(item, apiFootballOdds, context)),
        ...(payload?.apiFootball?.multiSport || []).map(item => normalizeApiSportsMultiSportEvent(item, context)),
        ...(payload?.theOddsApi?.events || []).map(event => normalizeTheOddsApiEvent(event, event?._gampoRegion || 'us', context)),
    ].filter(Boolean)
    const events = aggregateCanonicalEvents(normalized)
    const errors = payload?.errors || []

    return {
        events,
        errors,
        quotas: payload?.quotas || {},
        sources: payload?.sources || {},
        marquee: payload?.marquee || null,
        inSeason: payload?.theOddsApi?.inSeason || [],
        generatedAt: context.generatedAt,
        cached: Boolean(payload?.cached),
        feedState: aggregateFeedState(events, errors),
    }
}
