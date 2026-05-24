import { describe, it, expect, beforeEach } from 'vitest'
import {
    SLOT_TEMPLATES,
    getSlotTemplate,
    getCellCount,
    getColumnRows,
    makeInitialGrid,
    resolveSlotSpin,
    getBuyTiers,
} from './slotFactory'

beforeEach(() => {
    const store = new Map()
    globalThis.localStorage = {
        getItem: (k) => store.has(k) ? store.get(k) : null,
        setItem: (k, v) => { store.set(k, String(v)) },
        removeItem: (k) => { store.delete(k) },
        clear: () => store.clear(),
    }
    if (typeof globalThis.crypto === 'undefined') {
        Object.defineProperty(globalThis, 'crypto', {
            value: {
                getRandomValues: (arr) => {
                    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256)
                    return arr
                },
            },
            configurable: true,
        })
    }
})

describe('slotFactory layout helpers', () => {
    it('returns matching cell count for non-megaways layout', () => {
        const config = getSlotTemplate('vault-rush')
        expect(getCellCount(config)).toBe(config.layout.rows * config.layout.cols)
    })

    it('makeInitialGrid sized to total cells', () => {
        SLOT_TEMPLATES.forEach(template => {
            const grid = makeInitialGrid(template)
            expect(grid.length).toBe(getCellCount(template))
            grid.forEach(item => expect(item.id).toBeTypeOf('string'))
        })
    })

    it('uses uniform rows for non-megaways layouts', () => {
        const config = getSlotTemplate('vault-rush')
        for (let col = 0; col < config.layout.cols; col += 1) {
            expect(getColumnRows(config, col)).toBe(config.layout.rows)
        }
    })

    it('honors per-column rows for megaways layouts', () => {
        const config = {
            id: 'mw-test',
            symbols: [
                { id: 'a', label: 'A', asset: '', weight: 1, payout: 1 },
            ],
            layout: { rows: 4, cols: 4, evaluation: 'megaways', columnRows: [2, 4, 6, 3] },
            features: {},
        }
        expect(getColumnRows(config, 0)).toBe(2)
        expect(getColumnRows(config, 1)).toBe(4)
        expect(getColumnRows(config, 2)).toBe(6)
        expect(getColumnRows(config, 3)).toBe(3)
        expect(getCellCount(config)).toBe(2 + 4 + 6 + 3)
    })
})

describe('resolveSlotSpin engine', () => {
    it('produces a deterministic shape for every shipped template', () => {
        SLOT_TEMPLATES.forEach(template => {
            const result = resolveSlotSpin(template)
            expect(result.cells.length).toBe(getCellCount(template))
            expect(Array.isArray(result.wins)).toBe(true)
            expect(Array.isArray(result.featureEvents)).toBe(true)
            expect(typeof result.multiplier).toBe('number')
            expect(result.multiplier).toBeGreaterThanOrEqual(0)
            expect(Number.isFinite(result.multiplier)).toBe(true)
        })
    })

    it('returns a buy tier list with at least one tier when buy is enabled', () => {
        const config = getSlotTemplate('vault-rush')
        const tiers = getBuyTiers(config)
        expect(tiers.length).toBeGreaterThanOrEqual(1)
        tiers.forEach(tier => {
            expect(tier.id).toBeTruthy()
            expect(typeof tier.costMultiplier).toBe('number')
        })
    })

    it('respects guaranteed scatters from buy tier on bonus buy', () => {
        const config = getSlotTemplate('vault-rush')
        const tiers = getBuyTiers(config)
        const tier = tiers.find(t => t.guaranteedScatters >= 3) || tiers[0]
        const result = resolveSlotSpin(config, { bonusBuy: true, buyTier: tier })
        const scatterId = config.features.scatter.symbolId
        const scatters = result.cells.filter(item => item.id === scatterId).length
        expect(scatters).toBeGreaterThanOrEqual(tier.guaranteedScatters)
    })
})
