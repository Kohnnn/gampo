// useCaseCollection tests — Wave 31 schema (skinId + wear + statTrak variants).

import { describe, it, expect, beforeEach } from 'vitest'
import { recordDrop, resetCases, variantKey } from './useCaseCollection'

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
}

describe('useCaseCollection v2', () => {
    it('records a drop and bumps the pokedex variant count', () => {
        recordDrop(baseSkin, { caseId: 'case-a', caseName: 'Case A' })
        const dropsAfter = readDrops()
        expect(dropsAfter.length).toBe(1)
        expect(dropsAfter[0].skinId).toBe('sk1')
        expect(dropsAfter[0].caseId).toBe('case-a')

        const pokedex = readPokedex()
        const key = variantKey(baseSkin)
        expect(pokedex[key].count).toBe(1)
        expect(pokedex[key].multiplier).toBe(4.2)
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

    it('reset clears history and pokedex', () => {
        recordDrop(baseSkin)
        resetCases()
        expect(readDrops().length).toBe(0)
        expect(Object.keys(readPokedex()).length).toBe(0)
    })

    it('variantKey is stable for identical attributes', () => {
        const a = variantKey({ skinId: 'x', wear: 'FN', statTrak: false, souvenir: false })
        const b = variantKey({ skinId: 'x', wear: 'FN', statTrak: false, souvenir: false })
        expect(a).toBe(b)
    })
})
