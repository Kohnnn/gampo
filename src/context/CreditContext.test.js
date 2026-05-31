import { describe, expect, it, beforeEach } from 'vitest'
import { INITIAL_CREDITS, readNumber } from './CreditContext'

beforeEach(() => {
    const store = new Map()
    globalThis.localStorage = {
        getItem: (key) => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => { store.set(key, String(value)) },
        removeItem: (key) => { store.delete(key) },
    }
})

describe('CreditContext storage reads', () => {
    it('uses initial credits when no stored balance exists', () => {
        expect(readNumber('missing-balance', INITIAL_CREDITS)).toBe(INITIAL_CREDITS)
    })

    it('preserves a stored zero balance', () => {
        globalThis.localStorage.setItem('stored-zero', '0')
        expect(readNumber('stored-zero', INITIAL_CREDITS)).toBe(0)
    })
})
