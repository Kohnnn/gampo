import { describe, expect, it } from 'vitest'
import { curateTopSportsbookItems, filterMarqueeItems, mergeMarqueeMetrics, scoreMarqueeItem } from './sportsbookMarquee'

describe('sportsbook marquee curation', () => {
    it('scores world cup and famous-team events above low-tier fixtures', () => {
        const worldCup = scoreMarqueeItem({ leagueName: 'FIFA World Cup', home: 'Brazil', away: 'Germany' })
        const lowTier = scoreMarqueeItem({ leagueName: 'Regional Tuesday League', home: 'Small Town A', away: 'Small Town B' })

        expect(worldCup.score).toBeGreaterThanOrEqual(100)
        expect(worldCup.matched).toBe('FIFA World Cup')
        expect(lowTier.score).toBe(0)
    })

    it('filters boring fixtures when marquee candidates exist', () => {
        const result = filterMarqueeItems([
            { id: 'boring-1', leagueName: 'Regional Tuesday League', home: 'Small Town A', away: 'Small Town B' },
            { id: 'wc-1', leagueName: 'FIFA World Cup', home: 'Argentina', away: 'France' },
            { id: 'boring-2', leagueName: 'Local Reserve Cup', home: 'Academy A', away: 'Academy B' },
        ])

        expect(result.items.map(item => item.id)).toEqual(['wc-1'])
        expect(result.metrics).toMatchObject({
            candidateCount: 3,
            shownCount: 1,
            skippedCount: 2,
            marqueeCount: 1,
            bigMatchOnly: true,
        })
    })

    it('falls back to a small slice when no marquee event exists', () => {
        const result = filterMarqueeItems([
            { id: 'a', leagueName: 'Local A' },
            { id: 'b', leagueName: 'Local B' },
            { id: 'c', leagueName: 'Local C' },
        ], { fallbackLimit: 2 })

        expect(result.items.map(item => item.id)).toEqual(['a', 'b'])
        expect(result.metrics.bigMatchOnly).toBe(false)
    })

    it('merges provider metrics for the spend guard', () => {
        expect(mergeMarqueeMetrics(
            { candidateCount: 10, shownCount: 2, skippedCount: 8, marqueeCount: 2, bigMatchOnly: true },
            { candidateCount: 4, shownCount: 4, skippedCount: 0, marqueeCount: 0, bigMatchOnly: false },
        )).toMatchObject({
            candidateCount: 14,
            shownCount: 6,
            skippedCount: 8,
            marqueeCount: 2,
            bigMatchOnly: true,
        })
    })

    it('keeps marquee first while filling up to top games per sport', () => {
        const soccer = Array.from({ length: 8 }, (_, index) => ({
            id: `soccer-${index}`,
            sportId: 'soccer',
            leagueName: index === 0 ? 'FIFA World Cup' : 'Soccer Feed',
            home: index === 0 ? 'France' : `Soccer Home ${index}`,
            away: index === 0 ? 'Brazil' : `Soccer Away ${index}`,
            popularity: 100 - index,
        }))
        const basketball = Array.from({ length: 6 }, (_, index) => ({
            id: `basketball-${index}`,
            sportId: 'basketball',
            leagueName: 'Basketball Feed',
            home: `Hoops Home ${index}`,
            away: `Hoops Away ${index}`,
            popularity: 90 - index,
        }))

        const result = curateTopSportsbookItems([...soccer, ...basketball], { perSport: 5, minimumVisible: 10 })

        expect(result.items[0].id).toBe('soccer-0')
        expect(result.items.filter(item => item.sportId === 'soccer')).toHaveLength(5)
        expect(result.items.filter(item => item.sportId === 'basketball')).toHaveLength(5)
        expect(result.metrics).toMatchObject({ shownCount: 10, fillCount: 9, perSport: 5 })
    })
})
