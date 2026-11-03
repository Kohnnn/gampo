import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, beforeEach } from 'vitest'
import { CreditProvider, CREDIT_STORAGE_KEY, HISTORY_STORAGE_KEY, INITIAL_CREDITS, commitPreparedCreditTransactions, prepareCreditTransactions, readNumber, useCredits } from './CreditContext'

beforeEach(() => {
    const store = new Map()
    globalThis.localStorage = {
        getItem: (key) => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => { store.set(key, String(value)) },
        removeItem: (key) => { store.delete(key) },
    }
})

function creditConsumer(initialBalance) {
    localStorage.setItem(CREDIT_STORAGE_KEY, initialBalance)
    let credits
    function Consumer() {
        credits = useCredits()
        return null
    }
    renderToStaticMarkup(createElement(CreditProvider, null, createElement(Consumer)))
    return credits
}

// Mounts a provider against whatever localStorage currently holds, without
// seeding. Two calls model two documents that both mounted before either wrote.
function mountConsumer() {
    let credits
    function Consumer() {
        credits = useCredits()
        return null
    }
    renderToStaticMarkup(createElement(CreditProvider, null, createElement(Consumer)))
    return credits
}


const storedBalance = () => Number(localStorage.getItem(CREDIT_STORAGE_KEY))
const storedHistory = () => JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]')

describe('CreditProvider retained consumer callbacks', () => {
    it('charges one five-credit drop and every quick drop around interleaved returns', () => {
        const { placeBet, addWinnings } = creditConsumer(1165.65)
        expect(placeBet(5, 'Plinko')).toBe(true)
        expect(placeBet(1, 'Plinko')).toBe(true)
        expect(placeBet(1, 'Plinko')).toBe(true)
        addWinnings(3, 'Plinko return')
        expect(placeBet(1, 'Plinko')).toBe(true)
        addWinnings(4, 'Plinko return')
        expect(placeBet(1, 'Plinko')).toBe(true)
        expect(placeBet(1, 'Plinko')).toBe(true)
        addWinnings(2, 'Plinko return')

        expect(storedBalance()).toBe(1164.65)
        const history = storedHistory()
        expect(history.filter(entry => entry.type === 'bet').map(entry => entry.amount)).toEqual([-1, -1, -1, -1, -1, -5])
        expect(history.filter(entry => entry.type === 'win').map(entry => entry.amount)).toEqual([2, 4, 3])
        expect(history.map(entry => entry.balance)).toEqual([1164.65, 1162.65, 1163.65, 1164.65, 1160.65, 1161.65, 1158.65, 1159.65, 1160.65])
    })

    it('declines a later retained debit after earlier accepted stakes consume the balance', () => {
        const { placeBet } = creditConsumer(6)
        expect(placeBet(5, 'Plinko')).toBe(true)
        expect(placeBet(1, 'Plinko')).toBe(true)
        const before = localStorage.getItem(HISTORY_STORAGE_KEY)
        expect(placeBet(1, 'Plinko')).toBe(false)
        expect(storedBalance()).toBe(0)
        expect(localStorage.getItem(HISTORY_STORAGE_KEY)).toBe(before)
    })

    it('shares latest adjustments, grants, resets, wins and committed transaction state', () => {
        const credits = creditConsumer(10)
        credits.updateBalance(4.5)
        expect(credits.placeBet(5)).toBe(false)
        credits.grantPracticeCredits(0.5)
        expect(credits.placeBet(5)).toBe(true)
        credits.addWinnings(2)
        const commits = []
        const commit = next => {
            commits.push(next)
            expect(storedBalance()).toBe(2)
            localStorage.setItem(CREDIT_STORAGE_KEY, next.nextBalance)
            localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next.nextTransactions))
            return { ok: true }
        }
        expect(credits.placeBetTransactional(1, 'Ticket', 'ticket:debit', commit)).toEqual({ ok: true, code: null })
        expect(commits[0].nextBalance).toBe(1)
        expect(commits[0].nextTransactions.map(entry => entry.type)).toEqual(['bet', 'win', 'bet', 'grant', 'adjustment'])
        expect(credits.placeBet(2)).toBe(false)
        expect(credits.addWinningsTransactional(3, 'Ticket return', 'ticket:credit', next => {
            expect(next.nextBalance).toBe(4)
            return { ok: true }
        })).toEqual({ ok: true, code: null })
        expect(credits.placeBet(4)).toBe(true)
        expect(storedBalance()).toBe(0)
        expect(credits.addWinningsTransactional(3, 'Ticket return', 'ticket:credit', () => ({ ok: true })).code).toBe('duplicate-transaction')
        credits.resetBalance()
        expect(credits.placeBet(INITIAL_CREDITS)).toBe(true)
        expect(storedBalance()).toBe(0)
        expect(storedHistory().map(entry => entry.type)).toEqual(['bet', 'reset'])
    })

    it('leaves authoritative state unchanged until a synchronous transaction commit succeeds', () => {
        const credits = creditConsumer(5)
        const before = localStorage.getItem(HISTORY_STORAGE_KEY)
        expect(credits.placeBetTransactional(4, 'Ticket', 'failed:debit', next => {
            expect(next.nextBalance).toBe(1)
            expect(storedBalance()).toBe(5)
            expect(localStorage.getItem(HISTORY_STORAGE_KEY)).toBe(before)
            return { ok: false, code: 'rolled-back' }
        })).toEqual({ ok: false, code: 'rolled-back' })
        expect(credits.placeBet(5)).toBe(true)
        expect(storedBalance()).toBe(0)
        expect(storedHistory().map(entry => entry.type)).toEqual(['bet'])
    })
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

describe('D-1 credit lost update', () => {
    it('rejects a stake that exceeds the stored balance even when the tab-local ref is stale', () => {
        // Both documents mount while storage says 1000, so each holds its own
        // balanceRef of 1000. Tab A commits 600. Tab B's ref is now stale; an
        // affordability check against the ref would accept a second 600 and
        // publish 400 over the correct 400 -> 1200 staked against 1000 funded.
        localStorage.setItem(CREDIT_STORAGE_KEY, '1000')
        const tabB = mountConsumer()
        const tabA = mountConsumer()

        expect(tabA.placeBet(600, 'Plinko')).toBe(true)
        expect(storedBalance()).toBe(400)

        expect(tabB.placeBet(600, 'Plinko')).toBe(false)
        expect(storedBalance()).toBe(400)
    })

    it('applies a win against the stored balance, not a stale tab-local ref', () => {
        localStorage.setItem(CREDIT_STORAGE_KEY, '1000')
        const tabB = mountConsumer()
        const tabA = mountConsumer()

        expect(tabA.placeBet(600, 'Plinko')).toBe(true)
        tabB.addWinnings(50, 'Plinko')
        expect(storedBalance()).toBe(450)
    })

    it('keeps repeated same-tab stakes correct without a second document', () => {
        localStorage.setItem(CREDIT_STORAGE_KEY, '1000')
        const tab = mountConsumer()
        expect(tab.placeBet(600, 'Plinko')).toBe(true)
        expect(tab.placeBet(600, 'Plinko')).toBe(false)
        expect(tab.placeBet(400, 'Plinko')).toBe(true)
        expect(storedBalance()).toBe(0)
    })
})

describe('D-1 cross-document history', () => {
    it('keeps a peer document committed entry in the stored ledger', () => {
        // Both documents mount with an empty history. Tab A commits a debit and
        // its entry reaches storage. Tab B then commits its own debit. Building
        // the stored list from B's ref would overwrite A's committed entry, so
        // the ledger no longer accounts for the balance beside it.
        localStorage.setItem(CREDIT_STORAGE_KEY, '1000')
        const tabB = mountConsumer()
        const tabA = mountConsumer()

        expect(tabA.placeBet(600, 'Plinko')).toBe(true)
        expect(tabB.placeBet(400, 'Plinko')).toBe(true)

        const ledger = storedHistory()
        expect(storedBalance()).toBe(0)
        expect(ledger.reduce((sum, entry) => sum + entry.amount, 0)).toBe(-1000)
        expect(ledger.map(entry => entry.amount).sort((a, b) => a - b)).toEqual([-600, -400])
    })
})

describe('D-1 storage write failure', () => {
    it('does not resurrect a debit whose credits write was refused', () => {
        // Storage is full: the credits write is refused, so the stored value
        // cannot advance. Reading it back on the next stake would re-offer the
        // balance already spent and charge the stake twice, so a refused write
        // must fall back to the in-memory ref for the rest of the session.
        localStorage.setItem(CREDIT_STORAGE_KEY, '1000')
        const tab = mountConsumer()
        localStorage.setItem = () => { throw new Error('quota exceeded') }

        expect(tab.placeBet(600, 'Plinko')).toBe(true)
        expect(tab.placeBet(600, 'Plinko')).toBe(false)
        expect(tab.placeBet(400, 'Plinko')).toBe(true)
    })
})
