import { describe, it, expect } from 'vitest'
import { describePaylines } from './slotPaylines'
import { getSlotTemplate, SLOT_TEMPLATES } from './slotFactory'

describe('describePaylines', () => {
    it('returns one group per row for line games', () => {
        const d = describePaylines({ evaluation: 'lines', layout: { rows: 4, cols: 5 } })
        expect(d.mode).toBe('lines')
        expect(d.groups.length).toBe(4)
        expect(d.groups[0]).toEqual([0, 1, 2, 3, 4])
        expect(d.groups[3]).toEqual([15, 16, 17, 18, 19])
        expect(d.explain).toMatch(/pay lines/i)
    })

    it('explains ways without highlight groups', () => {
        const d = describePaylines({ evaluation: 'ways', layout: { rows: 4, cols: 5 } })
        expect(d.groups).toEqual([])
        expect(d.explain).toMatch(/ways/i)
    })

    it('explains cluster with the cluster minimum', () => {
        const d = describePaylines({ evaluation: 'cluster', layout: { rows: 6, cols: 6 }, features: { clusterMin: 5 } })
        expect(d.explain).toMatch(/5\+/)
    })

    it('explains megaways and pay-anywhere', () => {
        expect(describePaylines({ evaluation: 'megaways', layout: { rows: 6, cols: 6 } }).explain).toMatch(/megaways/i)
        expect(describePaylines({ evaluation: 'pay-anywhere', layout: { rows: 6, cols: 6 }, features: { payAnywhereMin: 8 } }).explain).toMatch(/8\+/)
    })

    it('produces a non-empty explanation for every real template', () => {
        for (const t of SLOT_TEMPLATES) {
            const d = describePaylines(getSlotTemplate(t.id))
            expect(typeof d.explain).toBe('string')
            expect(d.explain.length).toBeGreaterThan(10)
        }
    })
})
