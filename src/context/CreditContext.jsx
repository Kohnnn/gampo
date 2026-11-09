import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { readRaw, writeJson, writeRaw } from '../utils/storage'

export const INITIAL_CREDITS = 1000
export const CREDIT_STORAGE_KEY = 'gampo_credits'
export const HISTORY_STORAGE_KEY = 'gampo_history'

const CreditContext = createContext(null)
const HISTORY_WARNING = 'history-write-failure'

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
        if (stored === null) return []
        return JSON.parse(stored).map(item => ({
            ...item,
            timestamp: new Date(item.timestamp),
        }))
    } catch {
        return null
    }
}

// Routed through the shared storage helpers so a quota refusal signals the
// session-guard banner. Writing `localStorage.setItem` directly here swallowed
// a full disk with no notice to the player, which is how a committed round
// could be shown as saved while its balance was never written.
function persistCredits(value) {
    return writeRaw(CREDIT_STORAGE_KEY, value)
}

function persistHistory(history) {
    return writeJson(HISTORY_STORAGE_KEY, history)
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
    const [initialHistory] = useState(readHistory)
    const [transactions, setTransactions] = useState(initialHistory ?? [])
    const [toasts, setToasts] = useState([])
    // Accepted mutations advance immediately, even when a timer retains an
    // earlier consumer callback and React has not rendered the next balance.
    const balanceRef = useRef(balance)
    const transactionsRef = useRef(transactions)
    const toastIdRef = useRef(0)

    // Read storage on each operation to include sequential peer writes, but do
    // not merge the local ref: a reset or import can replace history wholesale.
    // ponytail: a refused history write leaves its receipt unsaved; recovering it
    // safely requires a replacement generation shared with reset and import.
    const readStoredHistory = useCallback(() => readHistory(), [])


    const showToast = useCallback((type, title, description, duration = 3000) => {
        const id = ++toastIdRef.current
        // Keep a session warning ahead of ordinary toasts, without allowing it
        // to consume the remaining two places when rapid game toasts arrive.
        setToasts(prev => {
            const warning = prev.find(toast => toast.id === HISTORY_WARNING)
            const sameKey = `${type}|${title}`
            const filtered = prev.filter(toast => toast.id !== HISTORY_WARNING && `${toast.type}|${toast.title}` !== sameKey).slice(warning ? -1 : -2)
            return [...(warning ? [warning] : []), ...filtered, { id, type, title, description }]
        })
        window.setTimeout(() => {
            setToasts(prev => prev.filter(toast => toast.id !== id))
        }, duration)
    }, [])

    useEffect(() => {
        if (initialHistory === null) {
            showToast('error', 'Saved credit history unavailable', 'Saved credit history could not be read; it has not been changed.')
        }
    }, [initialHistory, showToast])

    const recordTransaction = useCallback((entry) => {
        const history = readStoredHistory()
        if (history === null) {
            showToast('error', 'Credit history not saved', 'The balance change was applied, but its history entry was not saved.')
            return
        }
        const next = [{
            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            timestamp: new Date(),
            ...entry,
        }, ...history].slice(0, 100)
        transactionsRef.current = next
        setTransactions(next)
        if (!persistHistory(next)) {
            setToasts(prev => prev.some(toast => toast.id === HISTORY_WARNING) ? prev : [
                { id: HISTORY_WARNING, type: 'error', title: 'History may be incomplete', description: 'Some activity was not saved.' },
                ...prev.slice(-2),
            ])
        }
    }, [readStoredHistory, showToast])

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
        const history = readStoredHistory()
        if (history === null) {
            showToast('error', 'Credit history unavailable', 'The transaction was not saved because saved credit history could not be read.')
            return { ok: false, code: 'history-unavailable' }
        }
        const prepared = prepareCreditTransactions(currentBalance(), history, entries)
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
    }, [commitBalance, currentBalance, readStoredHistory, showToast])

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
