import { describe, it, expect, beforeEach } from 'vitest'
import {
    completeOnboarding,
    resetOnboarding,
    hasSeenOnboarding,
    useOnboarding,
} from './useOnboarding'
import { readJson } from '../utils/storage'

beforeEach(() => {
    const store = new Map()
    globalThis.localStorage = {
        get length() { return store.size },
        key: (i) => Array.from(store.keys())[i] ?? null,
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)) },
        removeItem: (k) => { store.delete(k) },
        clear: () => store.clear(),
    }
    resetOnboarding()
})

describe('useOnboarding', () => {
    it('starts unseen', () => {
        expect(hasSeenOnboarding()).toBe(false)
    })

    it('marks seen and persists with a timestamp', () => {
        completeOnboarding()
        expect(hasSeenOnboarding()).toBe(true)
        const saved = readJson('gampo_onboarding_v1')
        expect(saved.seen).toBe(true)
        expect(typeof saved.seenAt).toBe('string')
    })

    it('reset clears the persisted state', () => {
        completeOnboarding()
        resetOnboarding()
        expect(hasSeenOnboarding()).toBe(false)
        expect(readJson('gampo_onboarding_v1', null)).toBeNull()
    })

    it('exposes a hook function', () => {
        expect(typeof useOnboarding).toBe('function')
    })
})
