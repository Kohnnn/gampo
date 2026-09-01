// useCaseCollection tests — Wave 31 schema (skinId + wear + statTrak variants).

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, beforeEach } from 'vitest'
import {
    archiveDrop,
    caseStatsFor,
    exportInventory,
    importInventory,
    recordDrop,
    removeJunk,
    resetCases,
    restoreDrop,
    toggleFavorite,
    useCaseCollection,
    variantKey,
} from './useCaseCollection'

beforeEach(() => {
    const store = new Map()
    globalThis.localStorage = {
        getItem: (k) => store.has(k) ? store.get(k) : null,
        setItem: (k, v) => { store.set(k, String(v)) },
        removeItem: (k) => { store.delete(k) },
        clear: () => store.clear(),
    }
    resetCases()
})

function readDrops() {
    return JSON.parse(globalThis.localStorage.getItem('gampo_cases_drops_v2') || '[]')
}

function readPokedex() {
    return JSON.parse(globalThis.localStorage.getItem('gampo_cases_pokedex') || '{}')
}

function readCaseStats() {
    return JSON.parse(globalThis.localStorage.getItem('gampo_cases_stats_v1') || '{}')
}

const baseSkin = {
    skinId: 'sk1',
    name: 'AK-47 | Test',
    image: '/img.png',
    color: '#fff',
    rarity: 'Covert',
    wear: 'Field-Tested',
    wearShort: 'FT',
    float: 0.22,
    multiplier: 4.2,
    valueGc: 12.5,
}

describe('useCaseCollection v2', () => {
    it('records a drop and bumps the pokedex variant count', () => {
        recordDrop(baseSkin, { caseId: 'case-a', caseName: 'Case A' })
        const dropsAfter = readDrops()
        expect(dropsAfter.length).toBe(1)
        expect(dropsAfter[0].dropId).toBeTruthy()
        expect(dropsAfter[0].favorite).toBe(false)
        expect(dropsAfter[0].archived).toBe(false)
        expect(dropsAfter[0].skinId).toBe('sk1')
        expect(dropsAfter[0].caseId).toBe('case-a')

        const pokedex = readPokedex()
        const key = variantKey(baseSkin)
        expect(pokedex[key].count).toBe(1)
        expect(pokedex[key].multiplier).toBe(4.2)
        expect(pokedex[key].valueGc).toBe(12.5)
        expect(pokedex[key].totalValueGc).toBe(12.5)
    })

    it('treats StatTrak and souvenir as separate pokedex variants', () => {
        recordDrop(baseSkin)
        recordDrop({ ...baseSkin, statTrak: true })
        recordDrop({ ...baseSkin, souvenir: true })
        const pokedex = readPokedex()
        expect(Object.keys(pokedex).length).toBe(3)
    })

    it('treats different wear conditions as separate variants', () => {
        recordDrop(baseSkin)
        recordDrop({ ...baseSkin, wear: 'Factory New', wearShort: 'FN', float: 0.03 })
        const pokedex = readPokedex()
        expect(Object.keys(pokedex).length).toBe(2)
    })

    it('caps drop history to 400 entries', () => {
        for (let i = 0; i < 500; i += 1) {
            recordDrop({ ...baseSkin, skinId: `s${i}` }, { caseId: 'c1' })
        }
        expect(readDrops().length).toBe(400)
    })

    it('keeps best multiplier per variant', () => {
        recordDrop({ ...baseSkin, multiplier: 1.2 })
        recordDrop({ ...baseSkin, multiplier: 9.1 })
        recordDrop({ ...baseSkin, multiplier: 3.0 })
        const pokedex = readPokedex()
        const key = variantKey(baseSkin)
        expect(pokedex[key].count).toBe(3)
        expect(pokedex[key].multiplier).toBe(9.1)
    })

    it('keeps best value and cumulative value per variant', () => {
        recordDrop({ ...baseSkin, valueGc: 8 })
        recordDrop({ ...baseSkin, valueGc: 22 })
        recordDrop({ ...baseSkin, valueGc: 10 })
        const pokedex = readPokedex()
        const key = variantKey(baseSkin)
        expect(pokedex[key].valueGc).toBe(22)
        expect(pokedex[key].totalValueGc).toBe(40)
    })

    it('reset clears history and pokedex', () => {
        recordDrop(baseSkin)
        resetCases()
        expect(readDrops().length).toBe(0)
        expect(Object.keys(readPokedex()).length).toBe(0)
    })

    it('favorites and archives drops without deleting them', () => {
        recordDrop(baseSkin)
        const [drop] = readDrops()
        expect(toggleFavorite(drop.dropId)).toBe(true)
        expect(readDrops()[0].favorite).toBe(true)

        expect(archiveDrop(drop.dropId)).toBe(true)
        expect(readDrops()[0].archived).toBe(true)
        expect(readDrops()).toHaveLength(1)

        expect(restoreDrop(drop.dropId)).toBe(true)
        expect(readDrops()[0].archived).toBe(false)
    })

    it('archives only duplicate low-value junk and preserves the first copy', () => {
        const cheap = { ...baseSkin, skinId: 'cheap', rarity: 'Mil-Spec Grade', valueGc: 0.45 }
        recordDrop(cheap)
        recordDrop(cheap)
        recordDrop({ ...baseSkin, skinId: 'rare', valueGc: 18 })

        expect(removeJunk({ maxValueGc: 1.5, keepPerVariant: 1 })).toBe(1)
        const archived = readDrops().filter(drop => drop.archived)
        expect(archived).toHaveLength(1)
        expect(archived[0].skinId).toBe('cheap')
        expect(readDrops().filter(drop => !drop.archived)).toHaveLength(2)
    })

    it('exports and imports inventory json with drops and pokedex', () => {
        recordDrop(baseSkin)
        const exported = exportInventory()
        resetCases()
        expect(readDrops()).toHaveLength(0)

        const result = importInventory(exported)
        expect(result.drops).toBe(1)
        expect(result.variants).toBe(1)
        expect(readDrops()[0].dropId).toBeTruthy()
        expect(Object.keys(readPokedex())).toHaveLength(1)
    })

    it('variantKey is stable for identical attributes', () => {
        const a = variantKey({ skinId: 'x', wear: 'FN', statTrak: false, souvenir: false })
        const b = variantKey({ skinId: 'x', wear: 'FN', statTrak: false, souvenir: false })
        expect(a).toBe(b)
    })

    it('preserves the used summary fields without completionPct', () => {
        recordDrop(baseSkin)
        let summary
        function Probe() {
            summary = useCaseCollection({ catalogTotal: 12 }).summary
            return null
        }

        renderToStaticMarkup(createElement(Probe))

        expect(summary).toEqual({
            totalDrops: 1,
            activeDrops: 1,
            archivedDrops: 0,
            favoriteDrops: 0,
            uniqueVariants: 1,
            catalogTotal: 12,
            bestMultiplier: 4.2,
            bestValueGc: 12.5,
            totalValueGc: 12.5,
            bestSkin: expect.objectContaining({ skinId: 'sk1' }),
        })
        expect(summary).not.toHaveProperty('completionPct')
    })
})

describe('useCaseCollection per-case stats (C-P2-3)', () => {
    it('aggregates opens, wagered, return and net P/L per case', () => {
        recordDrop({ ...baseSkin, valueGc: 12, multiplier: 2.4 }, { caseId: 'case-a', caseName: 'Case A', openPriceGc: 5 })
        recordDrop({ ...baseSkin, valueGc: 3, multiplier: 0.6 }, { caseId: 'case-a', caseName: 'Case A', openPriceGc: 5 })

        const stats = readCaseStats()['case-a']
        expect(stats.opens).toBe(2)
        expect(stats.caseName).toBe('Case A')
        expect(stats.totalWageredGc).toBe(10)
        expect(stats.totalReturnGc).toBe(15)
        expect(stats.netGc).toBe(5)
    })

    it('tracks the luckiest drop by value, breaking ties on multiplier', () => {
        recordDrop({ ...baseSkin, skinId: 'lo', valueGc: 8, multiplier: 1.6 }, { caseId: 'case-b', openPriceGc: 5 })
        recordDrop({ ...baseSkin, skinId: 'hi', valueGc: 40, multiplier: 8 }, { caseId: 'case-b', openPriceGc: 5 })
        recordDrop({ ...baseSkin, skinId: 'mid', valueGc: 12, multiplier: 2.4 }, { caseId: 'case-b', openPriceGc: 5 })

        const stats = readCaseStats()['case-b']
        expect(stats.luckiest.skinId).toBe('hi')
        expect(stats.luckiest.valueGc).toBe(40)
        expect(stats.luckiest.multiplier).toBe(8)
    })

    it('keeps per-case stats isolated and falls back to open price when ctx omits it', () => {
        recordDrop({ ...baseSkin, valueGc: 6, openPriceGc: 4 }, { caseId: 'case-c', caseName: 'Case C' })
        recordDrop({ ...baseSkin, valueGc: 9 }, { caseId: 'case-d', caseName: 'Case D', openPriceGc: 7 })

        const stats = readCaseStats()
        expect(stats['case-c'].totalWageredGc).toBe(4)
        expect(stats['case-d'].totalWageredGc).toBe(7)
        expect(Object.keys(stats)).toHaveLength(2)
    })

    it('exposes caseStatsFor and survives the 400-drop history cap', () => {
        for (let i = 0; i < 450; i += 1) {
            recordDrop({ ...baseSkin, skinId: `s${i}`, valueGc: 2 }, { caseId: 'case-cap', openPriceGc: 5 })
        }
        expect(readDrops().length).toBe(400)
        const stats = caseStatsFor('case-cap')
        expect(stats.opens).toBe(450)
        expect(stats.totalWageredGc).toBe(2250)
    })

    it('reset and import/export round-trip per-case stats', () => {
        recordDrop({ ...baseSkin, valueGc: 12 }, { caseId: 'case-e', caseName: 'Case E', openPriceGc: 5 })
        const exported = exportInventory()
        resetCases()
        expect(caseStatsFor('case-e')).toBe(null)

        importInventory(exported)
        const stats = caseStatsFor('case-e')
        expect(stats.opens).toBe(1)
        expect(stats.totalWageredGc).toBe(5)
    })
})
