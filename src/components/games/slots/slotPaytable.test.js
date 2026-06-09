import { describe, it, expect } from 'vitest'
import { buildPaytable, PAYTABLE_MODE_LABELS } from './slotPaytable'
import { getSlotTemplate, SLOT_TEMPLATES } from './slotFactory'

describe('buildPaytable', () => {
    it('builds a 3/4/5 ladder for line games matching the engine ladder', () => {
        // Synthetic line config: payout 10 symbol → 5,14,32 at 3/4/5.
        const config = {
            evaluation: 'lines',
            layout: { rows: 4, cols: 5 },
            symbols: [
                { id: 'a', label: 'A', payout: 10 },
                { id: 'w', label: 'WILD', type: 'wild' },
                { id: 'sc', label: 'BONUS', type: 'scatter' },
            ],
            features: { scatter: { trigger: 3, awardFreeSpins: 8 } },
        }
        const pt = buildPaytable(config)
        expect(pt.mode).toBe('lines')
        expect(pt.rungs).toEqual([3, 4, 5])
        const a = pt.rows.find(r => r.id === 'a')
        expect(a.pays.map(p => p.multiplier)).toEqual([5, 14, 32])
        expect(pt.wild.label).toBe('WILD')
        expect(pt.scatter.trigger).toBe(3)
        expect(pt.scatter.awardFreeSpins).toBe(8)
    })

    it('excludes wild/scatter/coin/money/mystery from pay rows', () => {
        const config = {
            evaluation: 'ways',
            layout: { rows: 4, cols: 5 },
            symbols: [
                { id: 'a', label: 'A', payout: 8 },
                { id: 'w', label: 'WILD', type: 'wild' },
                { id: 'c', label: 'COIN', type: 'coin' },
            ],
        }
        const pt = buildPaytable(config)
        expect(pt.rows.map(r => r.id)).toEqual(['a'])
    })

    it('sorts rows by payout descending', () => {
        const config = {
            evaluation: 'lines',
            layout: { rows: 3, cols: 5 },
            symbols: [
                { id: 'low', label: 'LOW', payout: 2 },
                { id: 'high', label: 'HIGH', payout: 20 },
            ],
        }
        const pt = buildPaytable(config)
        expect(pt.rows[0].id).toBe('high')
    })

    it('uses cluster-min rungs for cluster games', () => {
        const config = {
            evaluation: 'cluster',
            layout: { rows: 6, cols: 6 },
            symbols: [{ id: 'a', label: 'A', payout: 4 }],
            features: { clusterMin: 5 },
        }
        const pt = buildPaytable(config)
        expect(pt.rungs[0]).toBe(5)
    })

    it('surfaces the engine max-win cap when present', () => {
        const config = {
            evaluation: 'cluster',
            layout: { rows: 8, cols: 8 },
            symbols: [{ id: 'a', label: 'A', payout: 4 }],
            maxWinMultiplier: 5000,
        }
        expect(buildPaytable(config).maxWin).toBe(5000)
    })

    it('produces a valid paytable for every real template', () => {
        for (const t of SLOT_TEMPLATES) {
            const pt = buildPaytable(getSlotTemplate(t.id))
            expect(pt.rows.length).toBeGreaterThan(0)
            expect(pt.rungs.length).toBeGreaterThan(0)
            for (const row of pt.rows) {
                expect(row.pays.every(p => Number.isFinite(p.multiplier))).toBe(true)
            }
        }
    })

    it('renders the real evaluation mode (layout.evaluation) for all 20 templates', () => {
        expect(SLOT_TEMPLATES.length).toBe(20)
        for (const t of SLOT_TEMPLATES) {
            const tpl = getSlotTemplate(t.id)
            const pt = buildPaytable(tpl)
            expect(pt.mode).toBe(tpl.layout.evaluation)
        }
    })

    it('surfaces gummy-drops max-win cap from features.maxWinMultiplier', () => {
        const tpl = getSlotTemplate('gummy-drops')
        const pt = buildPaytable(tpl)
        expect(Number.isFinite(pt.maxWin)).toBe(true)
        expect(pt.maxWin).toBe(tpl.features.maxWinMultiplier)
    })

    it('reads max-win from features before the top-level field', () => {
        const pt = buildPaytable({
            layout: { rows: 4, cols: 5, evaluation: 'lines' },
            symbols: [{ id: 'a', label: 'A', payout: 5 }],
            features: { maxWinMultiplier: 3000 },
        })
        expect(pt.maxWin).toBe(3000)
    })

    it('exposes mode labels', () => {
        expect(PAYTABLE_MODE_LABELS.lines).toBeTruthy()
        expect(PAYTABLE_MODE_LABELS.cluster).toBeTruthy()
    })
})
