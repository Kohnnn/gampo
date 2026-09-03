import { describe, expect, it, beforeEach } from 'vitest'
import { INITIAL_CREDITS, commitPreparedCreditTransactions, prepareCreditTransactions, readNumber } from './CreditContext'

beforeEach(() => {
    const store = new Map()
    globalThis.localStorage = {
        getItem: (key) => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => { store.set(key, String(value)) },
        removeItem: (key) => { store.delete(key) },
    }
})

describe('CreditContext transactional preparation', () => {
    it('prepares ordered entries and publishes only after commit success', () => {
        const timestamp = new Date('2026-09-02T12:00:00.000Z')
        const prepared = prepareCreditTransactions(100, [], [
            { type: 'bet', label: 'Ticket', amount: 10, transactionId: 'ticket:debit' },
            { type: 'win', label: 'Return', amount: 15, transactionId: 'ticket:credit' },
        ], timestamp)
        expect(prepared).toMatchObject({ ok: true, nextBalance: 105 })
        expect(prepared.nextTransactions).toEqual([
            { id: 'ticket:debit', timestamp, type: 'bet', label: 'Ticket', amount: -10, balance: 90 },
            { id: 'ticket:credit', timestamp, type: 'win', label: 'Return', amount: 15, balance: 105 },
        ])
        const published = []
        expect(commitPreparedCreditTransactions(prepared, () => ({ ok: true }), (...args) => published.push(args))).toEqual({ ok: true, code: null })
        expect(published).toEqual([[105, prepared.nextTransactions]])
    })

    it('rejects duplicate, invalid, async, thrown, and propagated commit failures without publication', () => {
        expect(prepareCreditTransactions(10, [{ id: 'used' }], [{ type: 'bet', label: 'Ticket', amount: 1, transactionId: 'used' }]).code).toBe('duplicate-transaction')
        expect(prepareCreditTransactions(10, [], [{ type: 'bet', label: 'Ticket', amount: 11, transactionId: 'new' }]).code).toBe('balance-insufficient')
        const prepared = prepareCreditTransactions(10, [], [{ type: 'win', label: 'Return', amount: 1, transactionId: 'win' }])
        const published = []
        expect(commitPreparedCreditTransactions(prepared, () => Promise.resolve({ ok: true }), value => published.push(value)).code).toBe('commit-rejected')
        expect(commitPreparedCreditTransactions(prepared, () => { throw new Error('fail') }, value => published.push(value)).code).toBe('commit-threw')
        expect(commitPreparedCreditTransactions(prepared, () => ({ ok: false, code: 'rolled-back' }), value => published.push(value)).code).toBe('rolled-back')
        expect(published).toEqual([])
    })
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
