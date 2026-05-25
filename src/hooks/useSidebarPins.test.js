// useSidebarPins tests — verify pin toggle, max cap, and persistence.

import { describe, it, expect, beforeEach } from 'vitest'
import { togglePin, isPinned, clearPins, useSidebarPins } from './useSidebarPins'

beforeEach(() => {
    const store = new Map()
    globalThis.localStorage = {
        getItem: (k) => store.has(k) ? store.get(k) : null,
        setItem: (k, v) => { store.set(k, String(v)) },
        removeItem: (k) => { store.delete(k) },
        clear: () => store.clear(),
    }
    clearPins()
})

function readPins() {
    return JSON.parse(globalThis.localStorage.getItem('gampo_pinned_games') || '[]')
}

describe('useSidebarPins', () => {
    it('pins a path and persists it', () => {
        togglePin('/dice')
        expect(isPinned('/dice')).toBe(true)
        expect(readPins()).toEqual(['/dice'])
    })

    it('toggles a pinned path off', () => {
        togglePin('/dice')
        togglePin('/dice')
        expect(isPinned('/dice')).toBe(false)
        expect(readPins()).toEqual([])
    })

    it('caps pins at 12 by dropping the oldest', () => {
        for (let i = 0; i < 15; i += 1) {
            togglePin(`/game-${i}`)
        }
        const persisted = readPins()
        expect(persisted.length).toBe(12)
        // Oldest entries dropped first.
        expect(persisted[0]).toBe('/game-3')
        expect(persisted[11]).toBe('/game-14')
    })

    it('clearPins wipes localStorage', () => {
        togglePin('/dice')
        togglePin('/crash')
        clearPins()
        expect(globalThis.localStorage.getItem('gampo_pinned_games')).toBe(null)
        expect(readPins()).toEqual([])
    })

    it('exposes the hook reference', () => {
        expect(typeof useSidebarPins).toBe('function')
    })
})
