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

    it('states the true fixed ways count for megaways templates', () => {
        const d = describePaylines({ evaluation: 'megaways', layout: { rows: 7, cols: 6, columnRows: [4, 5, 6, 6, 5, 4] } })
        expect(d.explain).toMatch(/14,400 ways/)
    })

    // columnRows is a static config literal — never reassigned at runtime (see
    // slotFactory getColumnRows). Copy must not imply the ways count varies
    // per spin, which would misdescribe the odds to the player.
    it('never claims megaways ways counts change between spins', () => {
        const megaways = SLOT_TEMPLATES
            .map((t) => getSlotTemplate(t.id))
            .filter((c) => c.layout?.evaluation === 'megaways')
        expect(megaways.length).toBeGreaterThan(0)
        for (const config of megaways) {
            const { explain } = describePaylines(config)
            expect(explain).not.toMatch(/every spin|each spin|changes every|shifts/i)
            const ways = config.layout.columnRows.reduce((m, v) => m * v, 1)
            expect(explain).toContain(ways.toLocaleString())
        }
    })

    it('produces a non-empty explanation for every real template', () => {
        for (const t of SLOT_TEMPLATES) {
            const d = describePaylines(getSlotTemplate(t.id))
            expect(typeof d.explain).toBe('string')
            expect(d.explain.length).toBeGreaterThan(10)
        }
    })
})
