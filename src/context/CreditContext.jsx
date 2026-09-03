import { createContext, useCallback, useContext, useRef, useState } from 'react'

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

function persistCredits(value) {
    try {
        localStorage.setItem(CREDIT_STORAGE_KEY, String(value))
    } catch {
        /* local persistence is optional */
    }
}

function persistHistory(history) {
    try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history))
    } catch {
        /* local persistence is optional */
    }
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
    const toastIdRef = useRef(0)

    const recordTransaction = useCallback((entry) => {
        setTransactions(prev => {
            const next = [{
                id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
                timestamp: new Date(),
                ...entry,
            }, ...prev].slice(0, 100)
            persistHistory(next)
            return next
        })
    }, [])

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

    const updateBalance = useCallback((newBalance, reason = 'adjustment') => {
        const rounded = roundCredits(Number(newBalance) || 0)
        setBalance(rounded)
        persistCredits(rounded)
        recordTransaction({ type: reason, amount: 0, balance: rounded })
    }, [recordTransaction])

    const placeBet = useCallback((amount, label = 'Practice bet') => {
        const amt = Number(amount)
        if (!Number.isFinite(amt) || amt <= 0 || amt > balance) {
            return false
        }

        const nextBalance = roundCredits(balance - amt)
        setBalance(nextBalance)
        persistCredits(nextBalance)
        recordTransaction({
            type: 'bet',
            label,
            amount: -roundCredits(amt),
            balance: nextBalance,
        })
        return true
    }, [balance, recordTransaction])

    const addWinnings = useCallback((amount, label = 'Simulation return') => {
        const amt = Number(amount)
        if (!Number.isFinite(amt) || amt <= 0) return

        setBalance(prev => {
            const nextBalance = roundCredits(prev + amt)
            persistCredits(nextBalance)
            recordTransaction({
                type: 'win',
                label,
                amount: roundCredits(amt),
                balance: nextBalance,
            })
            return nextBalance
        })
    }, [recordTransaction])

    const runCreditTransactionsTransactional = useCallback((entries, commit) => {
        const prepared = prepareCreditTransactions(balance, transactions, entries)
        return commitPreparedCreditTransactions(prepared, commit, (nextBalance, nextTransactions) => {
            setBalance(nextBalance)
            setTransactions(nextTransactions)
        })
    }, [balance, transactions])

    const placeBetTransactional = useCallback((amount, label, transactionId, commit) => (
        runCreditTransactionsTransactional([{ type: 'bet', label, amount, transactionId }], commit)
    ), [runCreditTransactionsTransactional])

    const addWinningsTransactional = useCallback((amount, label, transactionId, commit) => (
        runCreditTransactionsTransactional([{ type: 'win', label, amount, transactionId }], commit)
    ), [runCreditTransactionsTransactional])

    const grantPracticeCredits = useCallback((amount) => {
        const amt = Number(amount)
        if (!Number.isFinite(amt) || amt <= 0) return

        setBalance(prev => {
            const nextBalance = roundCredits(prev + amt)
            persistCredits(nextBalance)
            recordTransaction({
                type: 'grant',
                label: 'Practice credit top-up',
                amount: roundCredits(amt),
                balance: nextBalance,
            })
            return nextBalance
        })
    }, [recordTransaction])

    const resetBalance = useCallback(() => {
        setBalance(INITIAL_CREDITS)
        persistCredits(INITIAL_CREDITS)
        const entry = {
            id: `${Date.now()}-reset`,
            type: 'reset',
            label: 'Practice credits reset',
            amount: INITIAL_CREDITS,
            balance: INITIAL_CREDITS,
            timestamp: new Date(),
        }
        setTransactions([entry])
        persistHistory([entry])
    }, [])

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
