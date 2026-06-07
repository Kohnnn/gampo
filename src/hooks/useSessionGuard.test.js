import { describe, it, expect, beforeEach } from 'vitest'
import {
    setSessionLimits,
    clearSessionLimits,
    recordGuardRound,
    resetSessionGuard,
    evaluateGuard,
    useSessionGuard,
} from './useSessionGuard'

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
    clearSessionLimits()
    resetSessionGuard()
})

describe('useSessionGuard', () => {
    it('stays ok with no limits and no tilt', () => {
        recordGuardRound({ profit: -5, betAmount: 5 })
        expect(evaluateGuard().level).toBe('ok')
    })

    it('warns then exceeds a loss limit', () => {
        setSessionLimits({ enabled: true, lossLimit: 100 })
        recordGuardRound({ profit: -85, betAmount: 85 }) // 85% of limit → warn
        expect(evaluateGuard().level).toBe('warn')
        recordGuardRound({ profit: -20, betAmount: 20 }) // total 105 loss → exceeded
        expect(evaluateGuard().level).toBe('exceeded')
    })

    it('exceeds a round limit', () => {
        setSessionLimits({ enabled: true, roundLimit: 2 })
        recordGuardRound({ profit: 1, betAmount: 1 })
        recordGuardRound({ profit: 1, betAmount: 1 })
        expect(evaluateGuard().level).toBe('exceeded')
    })

    it('exceeds a wager budget', () => {
        setSessionLimits({ enabled: true, wagerLimit: 50 })
        recordGuardRound({ profit: 0, betAmount: 30 })
        recordGuardRound({ profit: 0, betAmount: 30 })
        const s = evaluateGuard()
        expect(s.level).toBe('exceeded')
        expect(s.reasons.join(' ')).toMatch(/wager budget/)
    })

    it('detects tilt: rising bets after losses', () => {
        recordGuardRound({ profit: -5, betAmount: 5 })
        recordGuardRound({ profit: -10, betAmount: 10 }) // up after loss
        recordGuardRound({ profit: -20, betAmount: 20 }) // up after loss
        recordGuardRound({ profit: -40, betAmount: 40 }) // up after loss → 3 betUps
        const s = evaluateGuard()
        expect(s.tilt).toBe(true)
        expect(s.level).toBe('warn')
    })

    it('time limit exceeded uses injected now', () => {
        setSessionLimits({ enabled: true, minutesLimit: 10 })
        const future = Date.now() + 11 * 60000
        expect(evaluateGuard(future).level).toBe('exceeded')
    })

    it('reset clears live session counters', () => {
        recordGuardRound({ profit: -50, betAmount: 50 })
        resetSessionGuard()
        expect(evaluateGuard().session.rounds).toBe(0)
        expect(evaluateGuard().session.wagered).toBe(0)
    })

    it('persists limits and exposes a hook', () => {
        setSessionLimits({ enabled: true, lossLimit: 200 })
        expect(JSON.parse(globalThis.localStorage.getItem('gampo_session_guard_v1')).lossLimit).toBe(200)
        expect(typeof useSessionGuard).toBe('function')
    })
})
