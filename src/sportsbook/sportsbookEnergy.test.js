import { describe, expect, it } from 'vitest'
import { deriveSportsbookEnergy } from './sportsbookEnergy'

describe('deriveSportsbookEnergy', () => {
    it('uses fallback copy for synthetic quiet boards', () => {
        const energy = deriveSportsbookEnergy({ events: [], feedSource: 'fallback' })

        expect(energy.label).toBe('Practice board')
        expect(energy.feedLive).toBe(false)
        expect(energy.note).toContain('Synthetic fallback')
    })

    it('scores live marquee moving markets as big-match night', () => {
        const energy = deriveSportsbookEnergy({
            feedSource: 'blended',
            marquee: { skippedCount: 20, shownCount: 6, marqueeCount: 2 },
            events: [
                {
                    status: 'live',
                    tags: ['marquee'],
                    marketGroups: [{ selections: [{ trend: 'up' }, { trend: 'down' }, {}] }],
                },
                { status: 'live', marquee: { score: 80 }, marketGroups: [{ selections: [{ movement: 'drifting' }] }] },
                { status: 'prematch', tags: ['estimated-odds'], oddsMode: 'estimated', marketGroups: [] },
            ],
        })

        expect(energy.label).toBe('Big-match night')
        expect(energy.liveCount).toBe(2)
        expect(energy.marqueeCount).toBe(2)
        expect(energy.estimatedCount).toBe(1)
        expect(energy.movingSelections).toBe(3)
    })
})
