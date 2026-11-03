import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { readRaw, writeJson, writeRaw } from '../utils/storage'

export const INITIAL_CREDITS = 1000
export const CREDIT_STORAGE_KEY = 'gampo_credits'
export const HISTORY_STORAGE_KEY = 'gampo_history'

const CreditContext = createContext(null)

export function readNumber(key, fallback) {
    try {
        const stored = localStorage.getItem(key)
        if (stored == null || stored === '') return fallback
        const parsed = Number(stored)
        return Number.isFinite(parsed) ? parsed : fallback
    } catch {
        return fallback
    }
}

function readHistory() {
    try {
        const stored = localStorage.getItem(HISTORY_STORAGE_KEY)
        if (!stored) return []
        return JSON.parse(stored).map(item => ({
            ...item,
            timestamp: new Date(item.timestamp),
        }))
    } catch {
        return []
    }
}

// Routed through the shared storage helpers so a quota refusal signals the
// session-guard banner. Writing `localStorage.setItem` directly here swallowed
// a full disk with no notice to the player, which is how a committed round
// could be shown as saved while its balance was never written.
function persistCredits(value) {
    writeRaw(CREDIT_STORAGE_KEY, value)
}

function persistHistory(history) {
    writeJson(HISTORY_STORAGE_KEY, history)
}


function roundCredits(value) {
    return Math.max(0, Number(value.toFixed(2)))
}

export function prepareCreditTransactions(balance, transactions, entries, timestamp = new Date()) {
    if (!Array.isArray(entries) || entries.length === 0 || !Array.isArray(transactions)) return { ok: false, code: 'commit-rejected' }
    const knownIds = new Set(transactions.map(transaction => transaction.id))
    const batchIds = new Set()
    let nextBalance = balance
    const prepared = []
    for (const entry of entries) {
        const amount = Number(entry?.amount)
        if (!entry || !['bet', 'win'].includes(entry.type) || !String(entry.label || '').trim() || !String(entry.transactionId || '').trim()) return { ok: false, code: entry?.type === 'win' ? 'invalid-payout' : 'invalid-debit' }
        if (knownIds.has(entry.transactionId) || batchIds.has(entry.transactionId)) return { ok: false, code: 'duplicate-transaction' }
        if (!Number.isFinite(amount) || amount <= 0) return { ok: false, code: entry.type === 'win' ? 'invalid-payout' : 'invalid-debit' }
        if (entry.type === 'bet' && amount > nextBalance) return { ok: false, code: 'balance-insufficient' }
        batchIds.add(entry.transactionId)
        nextBalance = roundCredits(nextBalance + (entry.type === 'win' ? amount : -amount))
        prepared.push({
            id: entry.transactionId,
            timestamp,
            type: entry.type,
            label: entry.label,
            amount: entry.type === 'win' ? roundCredits(amount) : -roundCredits(amount),
            balance: nextBalance,
        })
    }
    return { ok: true, code: null, nextBalance, nextTransactions: [...prepared, ...transactions].slice(0, 100) }
}

export function commitPreparedCreditTransactions(prepared, commit, publish) {
    if (!prepared?.ok) return { ok: false, code: prepared?.code || 'commit-rejected' }
    let committed
    try {
        committed = commit({ nextBalance: prepared.nextBalance, nextTransactions: prepared.nextTransactions })
    } catch {
        return { ok: false, code: 'commit-threw' }
    }
    if (!committed || typeof committed.then === 'function' || committed.ok !== true) return { ok: false, code: committed?.code || 'commit-rejected' }
    publish(prepared.nextBalance, prepared.nextTransactions)
    return { ok: true, code: null }
}

export function CreditProvider({ children }) {
    const [balance, setBalance] = useState(() => readNumber(CREDIT_STORAGE_KEY, INITIAL_CREDITS))
    const [currency, setCurrency] = useState('GC')
    const [transactions, setTransactions] = useState(readHistory)
    const [toasts, setToasts] = useState([])
    // Accepted mutations advance immediately, even when a timer retains an
    // earlier consumer callback and React has not rendered the next balance.
    const balanceRef = useRef(balance)
    const transactionsRef = useRef(transactions)
    const toastIdRef = useRef(0)

    // The ref is this document's view and goes stale the moment a peer writes
    // (nothing subscribes to the `storage` event for these keys). Both the
    // durable history we append to and the duplicate-id guard must therefore be
    // based on what is actually stored, unioned with anything this document has
    // that storage lost to an earlier failed write. Without this, a second
    // document's committed entry is silently overwritten and the ledger no
    // longer accounts for the balance it sits next to.
    const readMergedHistory = useCallback(() => {
        const stored = readHistory()
        const seen = new Set(stored.map(entry => entry.id))
        return [...transactionsRef.current.filter(entry => !seen.has(entry.id)), ...stored].slice(0, 100)
    }, [])

    const recordTransaction = useCallback((entry) => {
        const next = [{
            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            timestamp: new Date(),
            ...entry,
        }, ...readMergedHistory()].slice(0, 100)
        transactionsRef.current = next
        setTransactions(next)
        persistHistory(next)
    }, [readMergedHistory])

    const showToast = useCallback((type, title, description, duration = 3000) => {
        const id = ++toastIdRef.current
        // Wave 13: dedupe rapid-fire same-title toasts (e.g. autoplay spin spam)
        // and cap the visible stack at 3 so the screen never fills with messages.
        setToasts(prev => {
            const sameKey = `${type}|${title}`
            const filtered = prev.filter(t => `${t.type}|${t.title}` !== sameKey).slice(-2)
            return [...filtered, { id, type, title, description }]
        })
        window.setTimeout(() => {
            setToasts(prev => prev.filter(toast => toast.id !== id))
        }, duration)
    }, [])

    // D-1: affordability and the applied delta are decided against the value
    // that is actually stored, never against a tab-local ref. A ref is seeded
    // at mount and only updated by this document's own writes, so in a second
    // tab it stays stale for the life of the session; publishing from it
    // overwrites a peer's committed balance (1200 staked against 1000 funded).
    // Reading first is the whole repair, and it keeps the API synchronous so
    // the 42 existing call sites are unchanged.
    //
    // `persistFailedRef` handles the one case where the stored value is the
    // stale one: a refused write (quota, storage unavailable) leaves storage
    // behind the ref. Continuing to trust storage there would re-offer a
    // balance already spent and charge the same stake again, so from the first
    // refused write until a write succeeds, the ref wins. That is the only
    // state in which the ref is the fresher of the two.
    const persistFailedRef = useRef(false)
    const commitBalance = useCallback((nextBalance) => {
        persistFailedRef.current = !persistCredits(nextBalance)
    }, [])
    const currentBalance = useCallback(() => {
        if (persistFailedRef.current) return balanceRef.current
        const stored = readNumber(CREDIT_STORAGE_KEY, NaN)
        return Number.isFinite(stored) ? roundCredits(stored) : balanceRef.current
    }, [])

    const updateBalance = useCallback((newBalance, reason = 'adjustment') => {
        const rounded = roundCredits(Number(newBalance) || 0)
        balanceRef.current = rounded
        setBalance(rounded)
        commitBalance(rounded)
        recordTransaction({ type: reason, amount: 0, balance: rounded })
    }, [commitBalance, recordTransaction])

    const placeBet = useCallback((amount, label = 'Practice bet') => {
        const amt = Number(amount)
        const available = currentBalance()
        if (!Number.isFinite(amt) || amt <= 0 || amt > available) {
            return false
        }

        const nextBalance = roundCredits(available - amt)
        balanceRef.current = nextBalance
        setBalance(nextBalance)
        commitBalance(nextBalance)
        recordTransaction({
            type: 'bet',
            label,
            amount: -roundCredits(amt),
            balance: nextBalance,
        })
        return true
    }, [commitBalance, currentBalance, recordTransaction])

    const addWinnings = useCallback((amount, label = 'Simulation return') => {
        const amt = Number(amount)
        if (!Number.isFinite(amt) || amt <= 0) return

        const nextBalance = roundCredits(currentBalance() + amt)
        balanceRef.current = nextBalance
        setBalance(nextBalance)
        commitBalance(nextBalance)
        recordTransaction({
            type: 'win',
            label,
            amount: roundCredits(amt),
            balance: nextBalance,
        })
    }, [commitBalance, currentBalance, recordTransaction])

    const runCreditTransactionsTransactional = useCallback((entries, commit) => {
        const prepared = prepareCreditTransactions(currentBalance(), readMergedHistory(), entries)
        return commitPreparedCreditTransactions(prepared, commit, (nextBalance, nextTransactions) => {
            // The durable commit/readback has succeeded before either the
            // authoritative refs or React consumers see the prepared state.
            balanceRef.current = nextBalance
            transactionsRef.current = nextTransactions
            setBalance(nextBalance)
            setTransactions(nextTransactions)
            // Repair storage only where it diverges from the committed state.
            // A caller whose own commit already wrote these keys (the sportsbook
            // `commitRaw` writes credits and history) would otherwise be written
            // twice here. Repairing is still needed for a caller that commits
            // elsewhere: without it `gampo_credits` lags the ref and the next
            // affordability read rejects a stake the user can afford.
            // ponytail: like every other local persist this is best-effort.
            // Making it fail loud belongs with the lock wiring, where a failed
            // write can be reported as one atomic outcome rather than leaving a
            // round shown as committed while its balance is not on disk.
            if (readNumber(CREDIT_STORAGE_KEY, NaN) !== nextBalance) commitBalance(nextBalance)
            if (readRaw(HISTORY_STORAGE_KEY, null) !== JSON.stringify(nextTransactions)) {
                persistHistory(nextTransactions)
            }
        })
    }, [commitBalance, currentBalance, readMergedHistory])

    const placeBetTransactional = useCallback((amount, label, transactionId, commit) => (
        runCreditTransactionsTransactional([{ type: 'bet', label, amount, transactionId }], commit)
    ), [runCreditTransactionsTransactional])

    const addWinningsTransactional = useCallback((amount, label, transactionId, commit) => (
        runCreditTransactionsTransactional([{ type: 'win', label, amount, transactionId }], commit)
    ), [runCreditTransactionsTransactional])

    const grantPracticeCredits = useCallback((amount) => {
        const amt = Number(amount)
        if (!Number.isFinite(amt) || amt <= 0) return

        const nextBalance = roundCredits(currentBalance() + amt)
        balanceRef.current = nextBalance
        setBalance(nextBalance)
        commitBalance(nextBalance)
        recordTransaction({
            type: 'grant',
            label: 'Practice credit top-up',
            amount: roundCredits(amt),
            balance: nextBalance,
        })
    }, [commitBalance, currentBalance, recordTransaction])

    const resetBalance = useCallback(() => {
        balanceRef.current = INITIAL_CREDITS
        setBalance(INITIAL_CREDITS)
        commitBalance(INITIAL_CREDITS)
        const entry = {
            id: `${Date.now()}-reset`,
            type: 'reset',
            label: 'Practice credits reset',
            amount: INITIAL_CREDITS,
            balance: INITIAL_CREDITS,
            timestamp: new Date(),
        }
        transactionsRef.current = [entry]
        setTransactions([entry])
        persistHistory([entry])
    }, [commitBalance])

    const value = {
        balance,
        currency,
        setCurrency,
        transactions,
        placeBet,
        addWinnings,
        runCreditTransactionsTransactional,
        placeBetTransactional,
        addWinningsTransactional,
        grantPracticeCredits,
        resetBalance,
        updateBalance,
        toasts,
        showToast,
    }

    return (
        <CreditContext.Provider value={value}>
            {children}
        </CreditContext.Provider>
    )
}

export function useCredits() {
    const context = useContext(CreditContext)
    if (!context) {
        throw new Error('useCredits must be used within a CreditProvider')
    }
    return context
}

export default CreditContext
