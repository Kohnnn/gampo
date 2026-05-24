// useCaseCollection tests — verify drop history limits + collection counts.

import { describe, it, expect, beforeEach } from 'vitest'
import { recordDrop, resetCases } from './useCaseCollection'

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
    return JSON.parse(globalThis.localStorage.getItem('gampo_cases_drops') || '[]')
}

function readCollection() {
    return JSON.parse(globalThis.localStorage.getItem('gampo_cases_collection') || '{}')
}

describe('useCaseCollection', () => {
    it('records a drop into history and bumps the collection count', () => {
        recordDrop(
            { id: 'sk1', name: 'Test Skin', image: '/img.png', color: '#fff', rarity: 'Covert', multiplier: 4.2 },
            { caseId: 'case-a', caseName: 'Case A', tier: 'mid' },
        )
        const dropsAfter = readDrops()
        expect(dropsAfter.length).toBe(1)
        expect(dropsAfter[0].id).toBe('sk1')
        expect(dropsAfter[0].caseId).toBe('case-a')

        const colAfter = readCollection()
        expect(colAfter.sk1.count).toBe(1)
        expect(colAfter.sk1.multiplier).toBe(4.2)
    })

    it('caps drop history to 200 entries', () => {
        for (let i = 0; i < 250; i += 1) {
            recordDrop({ id: `s${i}`, name: `n${i}`, multiplier: 1 }, { caseId: 'c1' })
        }
        expect(readDrops().length).toBe(200)
    })

    it('keeps best multiplier per skin', () => {
        recordDrop({ id: 'k1', name: 'one', multiplier: 1.2 })
        recordDrop({ id: 'k1', name: 'one', multiplier: 9.1 })
        recordDrop({ id: 'k1', name: 'one', multiplier: 3.0 })
        const col = readCollection()
        expect(col.k1.count).toBe(3)
        expect(col.k1.multiplier).toBe(9.1)
    })

    it('reset clears history and collection', () => {
        recordDrop({ id: 'x1', name: 'x', multiplier: 1 })
        resetCases()
        expect(readDrops().length).toBe(0)
        expect(Object.keys(readCollection()).length).toBe(0)
    })
})
