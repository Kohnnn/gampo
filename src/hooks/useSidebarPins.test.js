// useSidebarPins tests — verify pin toggle, max cap, and persistence.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { togglePin, isPinned, clearPins, useSidebarPins } from './useSidebarPins'

// Load-time normalization needs a fresh module graph, because the hook reads
// storage once at module scope. These cases seed localStorage and then import a
// new copy, which is exactly the reload path a returning user hits.
async function loadFresh() {
    vi.resetModules()
    return import('./useSidebarPins')
}

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
    it('collapses a persisted duplicate array on load and rewrites storage', async () => {
        globalThis.localStorage.setItem('gampo_pinned_games', JSON.stringify(['/dice', '/dice', '/limbo', '/dice']))
        await loadFresh()
        // Duplicates are consumer-visible: the sidebar would render the same game
        // several times under "Pinned".
        expect(readPins()).toEqual(['/dice', '/limbo'])
    })

    it('truncates an over-cap persisted array to the newest 12 on load', async () => {
        const overCap = Array.from({ length: 15 }, (_, i) => `/game-${i}`)
        globalThis.localStorage.setItem('gampo_pinned_games', JSON.stringify(overCap))
        await loadFresh()
        expect(readPins()).toEqual(overCap.slice(-12))
    })

    it('leaves a well-formed persisted array untouched on load', async () => {
        globalThis.localStorage.setItem('gampo_pinned_games', JSON.stringify(['/dice', '/crash']))
        await loadFresh()
        expect(readPins()).toEqual(['/dice', '/crash'])
    })

    it('leaves state untouched when the pin write fails', async () => {
        // Use the fresh module's own exports: the static import above is a
        // different module instance once resetModules has run.
        const fresh = await loadFresh()
        fresh.togglePin('/dice')
        expect(fresh.isPinned('/dice')).toBe(true)
        // A rejected write must not advance module state: otherwise the sidebar
        // renders a pin that storage does not have (a phantom pin until reload).
        const realSet = globalThis.localStorage.setItem
        globalThis.localStorage.setItem = () => { throw new Error('quota') }
        try {
            fresh.togglePin('/crash')
        } finally {
            globalThis.localStorage.setItem = realSet
        }
        expect(fresh.isPinned('/crash')).toBe(false)
        expect(readPins()).toEqual(['/dice'])
    })
    it('ignores malformed stored JSON', async () => {
        globalThis.localStorage.setItem('gampo_pinned_games', '{not json')
        const fresh = await loadFresh()
        // Corrupt storage must not throw or surface a phantom pin.
        expect(fresh.isPinned('/dice')).toBe(false)
        expect(readPins()).toEqual([])
    })
    it('ignores a stored value of the wrong type', async () => {
        globalThis.localStorage.setItem('gampo_pinned_games', JSON.stringify({ dice: true }))
        const fresh = await loadFresh()
        expect(fresh.isPinned('/dice')).toBe(false)
        expect(readPins()).toEqual([])
    })
    it('commits a toggle once a failed writer is restored', async () => {
        const fresh = await loadFresh()
        const realSet = globalThis.localStorage.setItem
        globalThis.localStorage.setItem = () => { throw new Error('quota') }
        try {
            fresh.togglePin('/dice')
        } finally {
            globalThis.localStorage.setItem = realSet
        }
        // The rejected write left both memory and storage unchanged...
        expect(fresh.isPinned('/dice')).toBe(false)
        expect(readPins()).toEqual([])
        // ...so a later successful write must still commit.
        fresh.togglePin('/dice')
        expect(fresh.isPinned('/dice')).toBe(true)
        expect(readPins()).toEqual(['/dice'])
    })
})
