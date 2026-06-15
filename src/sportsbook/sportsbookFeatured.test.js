import { describe, expect, it } from 'vitest'
import {
    buildFeaturedCompetitions,
    contendersFromCompetition,
    spotlightCompetition,
} from './sportsbookFeatured'

const leagues = [
    { id: 'wc', label: 'FIFA World Cup', region: 'International', sportId: 'soccer' },
    { id: 'epl', label: 'Premier League', region: 'England', sportId: 'soccer' },
    { id: 'feed1', label: 'Practice Friendly', region: 'Local', sportId: 'soccer' },
]

function ev(id, leagueId, status, popularity, selections) {
    return {
        id,
        leagueId,
        sportId: 'soccer',
        status,
        popularity,
        startsAt: '2026-06-20T18:00:00Z',
        marketGroups: [{ id: 'winner', selections }],
    }
}

const events = [
    ev('w1', 'wc', 'prematch', 9000, [
        { side: 'home', label: 'Brazil', decimalOdds: 3.2 },
        { side: 'draw', label: 'Draw', decimalOdds: 3.0 },
        { side: 'away', label: 'France', decimalOdds: 2.4 },
    ]),
    ev('w2', 'wc', 'live', 12000, [
        { side: 'home', label: 'Spain', decimalOdds: 1.9 },
        { side: 'away', label: 'Germany', decimalOdds: 4.1 },
    ]),
    ev('e1', 'epl', 'prematch', 8000, [
        { side: 'home', label: 'Arsenal', decimalOdds: 2.1 },
        { side: 'away', label: 'Chelsea', decimalOdds: 3.5 },
    ]),
    ev('f1', 'feed1', 'prematch', 500, [
        { side: 'home', label: 'Locals A', decimalOdds: 2.0 },
        { side: 'away', label: 'Locals B', decimalOdds: 2.0 },
    ]),
]

describe('buildFeaturedCompetitions', () => {
    it('groups events by competition and ranks marquee tournaments first', () => {
        const featured = buildFeaturedCompetitions(events, leagues, { limit: 4 })
        expect(featured[0].leagueId).toBe('wc')
        expect(featured[0].events).toHaveLength(2)
        expect(featured[0].liveCount).toBe(1)
        // EPL outranks the generic practice feed bucket.
        const ids = featured.map(group => group.leagueId)
        expect(ids.indexOf('epl')).toBeLessThan(ids.indexOf('feed1'))
    })

    it('respects the limit and minEvents filter', () => {
        const featured = buildFeaturedCompetitions(events, leagues, { limit: 2 })
        expect(featured).toHaveLength(2)
        const none = buildFeaturedCompetitions(events, leagues, { minEvents: 5 })
        expect(none).toHaveLength(0)
    })

    it('handles empty input', () => {
        expect(buildFeaturedCompetitions([], [])).toEqual([])
    })
})

describe('spotlightCompetition', () => {
    it('returns the marquee competition', () => {
        expect(spotlightCompetition(events, leagues)?.leagueId).toBe('wc')
    })

    it('returns null when nothing is marquee enough', () => {
        const plain = [ev('f1', 'feed1', 'prematch', 500, [
            { side: 'home', label: 'A', decimalOdds: 2 },
            { side: 'away', label: 'B', decimalOdds: 2 },
        ])]
        expect(spotlightCompetition(plain, leagues)).toBeNull()
    })
})

describe('contendersFromCompetition', () => {
    it('lists shortest-priced favourites and skips draws + duplicates', () => {
        const wc = buildFeaturedCompetitions(events, leagues, { limit: 1 })[0]
        const contenders = contendersFromCompetition(wc)
        expect(contenders[0].label).toBe('Spain') // 1.9 is shortest
        expect(contenders.some(row => row.label === 'Draw')).toBe(false)
        // odds strictly ascending
        const odds = contenders.map(row => row.odds)
        expect([...odds].sort((a, b) => a - b)).toEqual(odds)
    })

    it('returns empty for an empty competition', () => {
        expect(contendersFromCompetition(null)).toEqual([])
        expect(contendersFromCompetition({ events: [] })).toEqual([])
    })
})
