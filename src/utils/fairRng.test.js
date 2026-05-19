import { describe, it, expect, beforeEach } from 'vitest'
import { hashTo32, rollFromKey, getProvablyFair, rotateSeeds, setClientSeed, nextRoll, clearRecentRolls, getRecentRolls } from './fairRng'

// Minimal localStorage stub for node test env
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

describe('fairRng', () => {
    it('hashTo32 produces stable numbers', () => {
        expect(hashTo32('abc')).toBe(hashTo32('abc'))
        expect(hashTo32('abc')).not.toBe(hashTo32('abd'))
    })

    it('rollFromKey returns a number in [0,1)', () => {
        for (let i = 0; i < 50; i++) {
            const r = rollFromKey(`seed-${i}`)
            expect(r).toBeGreaterThanOrEqual(0)
            expect(r).toBeLessThan(1)
        }
    })

    it('getProvablyFair initializes seeds', () => {
        const state = getProvablyFair()
        expect(state.serverSeed).toBeTruthy()
        expect(state.clientSeed).toBeTruthy()
        expect(state.nonce).toBe(0)
    })

    it('nextRoll increments nonce and is deterministic per nonce', () => {
        const s = setClientSeed('client-fixed')
        const a = nextRoll('dice')
        const b = nextRoll('dice')
        expect(a.nonce).toBe(1)
        expect(b.nonce).toBe(2)
        expect(a.roll).not.toBe(b.roll)
        expect(a.clientSeed).toBe(s.clientSeed)
    })

    it('rotateSeeds resets nonce and reveals previous serverSeed', () => {
        nextRoll('dice')
        const before = getProvablyFair()
        const after = rotateSeeds()
        expect(after.previousServerSeed).toBe(before.serverSeed)
        expect(after.nonce).toBe(0)
    })

    it('recent rolls log + clear', () => {
        clearRecentRolls()
        nextRoll('dice')
        nextRoll('limbo')
        const recent = getRecentRolls()
        expect(recent.length).toBe(2)
        clearRecentRolls()
        expect(getRecentRolls().length).toBe(0)
    })
})
