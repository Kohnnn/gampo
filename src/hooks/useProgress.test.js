// useProgress tests — verify stat tracking, unlock detection, and reset.

import { describe, it, expect, beforeEach } from 'vitest'
import { recordRound, recordCaseDrop, resetProgress, useProgress, dismissUnlock } from './useProgress'

beforeEach(() => {
    const store = new Map()
    globalThis.localStorage = {
        getItem: (k) => store.has(k) ? store.get(k) : null,
        setItem: (k, v) => { store.set(k, String(v)) },
        removeItem: (k) => { store.delete(k) },
        clear: () => store.clear(),
    }
    resetProgress()
})

describe('useProgress', () => {
    it('records rounds and bumps win/loss/wagered totals', () => {
        recordRound({ gameId: 'dice', profit: 5, betAmount: 1, multiplier: 2 })
        recordRound({ gameId: 'dice', profit: -1, betAmount: 1, multiplier: 0 })
        recordRound({ gameId: 'crash', profit: 3, betAmount: 1, multiplier: 4 })
        const stats = JSON.parse(globalThis.localStorage.getItem('gampo_progress_stats'))
        expect(stats.totalRounds).toBe(3)
        expect(stats.totalWins).toBe(2)
        expect(stats.totalLosses).toBe(1)
        expect(stats.totalWagered).toBe(3)
        expect(stats.totalProfit).toBe(7)
        expect(stats.bestMultiplier).toBe(4)
        expect(stats.uniqueGames).toEqual(['dice', 'crash'])
    })

    it('tracks the best win streak across rounds', () => {
        recordRound({ gameId: 'dice', profit: 1, betAmount: 1 })
        recordRound({ gameId: 'dice', profit: 1, betAmount: 1 })
        recordRound({ gameId: 'dice', profit: 1, betAmount: 1 })
        recordRound({ gameId: 'dice', profit: -1, betAmount: 1 })
        recordRound({ gameId: 'dice', profit: 1, betAmount: 1 })
        const stats = JSON.parse(globalThis.localStorage.getItem('gampo_progress_stats'))
        expect(stats.bestWinStreak).toBe(3)
        expect(stats.currentWinStreak).toBe(1)
    })

    it('unlocks the first-spin achievement after one round', () => {
        recordRound({ gameId: 'dice', profit: 5, betAmount: 1, multiplier: 2 })
        const unlocked = JSON.parse(globalThis.localStorage.getItem('gampo_progress_unlocked'))
        expect(unlocked['first-spin']).toBeTypeOf('number')
        expect(unlocked['first-win']).toBeTypeOf('number')
    })

    it('counts case drops and flags rare drops separately', () => {
        recordCaseDrop({ rarity: 'Mil-Spec Grade' })
        recordCaseDrop({ rarity: 'Covert' })
        recordCaseDrop({ rarity: 'Extraordinary' })
        const stats = JSON.parse(globalThis.localStorage.getItem('gampo_progress_stats'))
        expect(stats.casesTotalDrops).toBe(3)
        expect(stats.casesRareDrops).toBe(2)
        const unlocked = JSON.parse(globalThis.localStorage.getItem('gampo_progress_unlocked'))
        expect(unlocked['cases-rare']).toBeTypeOf('number')
    })

    it('reset clears stats and unlocked map', () => {
        recordRound({ gameId: 'dice', profit: 1, betAmount: 1 })
        resetProgress()
        expect(globalThis.localStorage.getItem('gampo_progress_stats')).toBe(null)
        expect(globalThis.localStorage.getItem('gampo_progress_unlocked')).toBe(null)
    })

    it('exposes a hook reference for consumers', () => {
        expect(typeof useProgress).toBe('function')
        expect(typeof dismissUnlock).toBe('function')
    })

    it('unlocks the games-3 achievement after rounds across 3 games', () => {
        recordRound({ gameId: 'dice', profit: 1, betAmount: 1 })
        recordRound({ gameId: 'crash', profit: 1, betAmount: 1 })
        recordRound({ gameId: 'plinko', profit: 1, betAmount: 1 })
        const stats = JSON.parse(globalThis.localStorage.getItem('gampo_progress_stats'))
        expect(stats.uniqueGames.length).toBe(3)
        const unlocked = JSON.parse(globalThis.localStorage.getItem('gampo_progress_unlocked'))
        expect(unlocked['games-3']).toBeTypeOf('number')
    })
})
