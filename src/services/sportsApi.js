// Pure, keyless helpers for normalizing The Odds API shapes.
//
// SECURITY: this module performs no network calls and reads no API keys or
// build-time env. The Odds API (like the other providers) is fetched
// server-side in server/sportsbookProviderProxy.js, so secrets never reach the
// client bundle. A key read here would be inlined by the bundler into shipped
// JS and leak to anyone viewing source — hence these helpers stay pure.

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
