export const MARQUEE_SNAPSHOT = {
    generatedAt: '2026-06-16T00:00:00.000Z',
    source: 'manual-crawl-seed',
    competitions: [
        { label: 'FIFA World Cup', sportId: 'soccer', priority: 100, keywords: ['fifa', 'world cup', 'copa mundial'] },
        { label: 'UEFA Champions League', sportId: 'soccer', priority: 92, keywords: ['champions league', 'uefa'] },
        { label: 'UEFA Euro', sportId: 'soccer', priority: 90, keywords: ['euro 202', 'uefa euro'] },
        { label: 'Copa America', sportId: 'soccer', priority: 88, keywords: ['copa america'] },
        { label: 'Premier League', sportId: 'soccer', priority: 82, keywords: ['premier league', 'epl'] },
        { label: 'La Liga', sportId: 'soccer', priority: 80, keywords: ['la liga'] },
        { label: 'Serie A', sportId: 'soccer', priority: 78, keywords: ['serie a'] },
        { label: 'Bundesliga', sportId: 'soccer', priority: 78, keywords: ['bundesliga'] },
        { label: 'NBA Finals', sportId: 'basketball', priority: 86, keywords: ['nba finals', 'nba playoff', 'nba'] },
        { label: 'NFL Playoffs', sportId: 'football', priority: 84, keywords: ['nfl playoff', 'super bowl', 'nfl'] },
        { label: 'UFC Main Card', sportId: 'mma', priority: 76, keywords: ['ufc', 'main card'] },
        { label: 'Grand Slam Tennis', sportId: 'tennis', priority: 74, keywords: ['wimbledon', 'us open', 'roland garros', 'australian open', 'grand slam'] },
    ],
    teams: [
        'Argentina', 'Brazil', 'France', 'Germany', 'Spain', 'England', 'Portugal', 'Netherlands', 'Italy', 'Belgium',
        'Manchester City', 'Arsenal', 'Liverpool', 'Chelsea', 'Real Madrid', 'Barcelona', 'Bayern Munich', 'PSG',
        'Lakers', 'Celtics', 'Warriors', 'Knicks', 'Chiefs', 'Eagles', '49ers', 'Cowboys',
    ],
}

function textBlob(value) {
    if (!value) return ''
    if (typeof value === 'string' || typeof value === 'number') return String(value)
    if (Array.isArray(value)) return value.map(textBlob).join(' ')
    if (typeof value === 'object') {
        const picked = [
            value.label,
            value.name,
            value.title,
            value.region,
            value.country,
            value.league,
            value.leagueName,
            value.sport,
            value.sportId,
            value.sport_key,
            value.leagueID,
            value.sportID,
            value.home,
            value.away,
            value.home_team,
            value.away_team,
            value.homeTeam,
            value.awayTeam,
            value.teams?.home?.names?.long,
            value.teams?.away?.names?.long,
            value.teams?.home?.name,
            value.teams?.away?.name,
            value.league?.name,
            value.league?.country,
            value.competition,
            value.name,
            value.opponents,
            value.opponent?.name,
            value.participants,
        ]
        return picked.map(textBlob).join(' ')
    }
    return ''
}

function includesAny(text, values = []) {
    const lower = text.toLowerCase()
    return values.some(value => lower.includes(String(value).toLowerCase()))
}

export function scoreMarqueeItem(item, snapshot = MARQUEE_SNAPSHOT) {
    const text = textBlob(item)
    if (!text.trim()) return { score: 0, matched: null, reason: 'empty' }

    let best = { score: 0, matched: null, reason: 'none' }
    for (const competition of snapshot.competitions || []) {
        if (includesAny(text, competition.keywords)) {
            const score = Number(competition.priority) || 0
            if (score > best.score) best = { score, matched: competition.label, reason: 'competition' }
        }
    }

    if (includesAny(text, snapshot.teams || [])) {
        best = {
            score: Math.max(best.score, 64),
            matched: best.matched || 'Famous Team',
            reason: best.reason === 'none' ? 'team' : best.reason,
        }
    }

    return best
}

export function filterMarqueeItems(items = [], { snapshot = MARQUEE_SNAPSHOT, minimumScore = 60, fallbackLimit = 12 } = {}) {
    const annotated = items.map(item => ({ item, marquee: scoreMarqueeItem(item, snapshot) }))
    const matches = annotated
        .filter(row => row.marquee.score >= minimumScore)
        .sort((a, b) => b.marquee.score - a.marquee.score)

    const selected = matches.length ? matches : annotated.slice(0, fallbackLimit)
    return {
        items: selected.map(row => ({ ...row.item, marquee: row.marquee })),
        metrics: {
            candidateCount: items.length,
            shownCount: selected.length,
            skippedCount: Math.max(0, items.length - selected.length),
            marqueeCount: matches.length,
            bigMatchOnly: matches.length > 0,
            snapshotGeneratedAt: snapshot.generatedAt,
        },
    }
}

export function mergeMarqueeMetrics(...metrics) {
    const totals = metrics.filter(Boolean).reduce((next, metric) => ({
        candidateCount: next.candidateCount + (Number(metric.candidateCount) || 0),
        shownCount: next.shownCount + (Number(metric.shownCount) || 0),
        skippedCount: next.skippedCount + (Number(metric.skippedCount) || 0),
        marqueeCount: next.marqueeCount + (Number(metric.marqueeCount) || 0),
        bigMatchOnly: next.bigMatchOnly || Boolean(metric.bigMatchOnly),
        snapshotGeneratedAt: next.snapshotGeneratedAt || metric.snapshotGeneratedAt || null,
    }), {
        candidateCount: 0,
        shownCount: 0,
        skippedCount: 0,
        marqueeCount: 0,
        bigMatchOnly: false,
        snapshotGeneratedAt: null,
    })
    return totals
}
