import { createContext, useCallback, useContext, useRef, useState } from 'react'

export const INITIAL_CREDITS = 1000
export const CREDIT_STORAGE_KEY = 'gampo_credits'
export const HISTORY_STORAGE_KEY = 'gampo_history'

const CreditContext = createContext(null)

function readNumber(key, fallback) {
    try {
        const stored = localStorage.getItem(key)
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
        setToasts(prev => [...prev, { id, type, title, description }])
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
