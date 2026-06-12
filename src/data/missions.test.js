import { describe, expect, it } from 'vitest'
import { evaluateMissions, dailyChallengeFor, evaluateDailyChallenge } from './missions'

const emptyPeriod = {
    rounds: 0,
    wins: 0,
    wagered: 0,
    bestMultiplier: 0,
    bestStreak: 0,
    currentStreak: 0,
    uniqueGames: [],
}

describe('evaluateMissions', () => {
    it('treats uniqueGames arrays as numeric progress', () => {
        const missions = evaluateMissions({
            daily: { ...emptyPeriod, uniqueGames: ['slots', 'crash', 'cases'] },
            weekly: emptyPeriod,
            lifetime: { ...emptyPeriod, uniqueGames: ['slots', 'crash'] },
        })

        const dailySampler = missions.find(m => m.id === 'daily-3-games')
        const lifetimeGames = missions.find(m => m.id === 'lifetime-games-15')

        expect(dailySampler.value).toBe(3)
        expect(dailySampler.complete).toBe(true)
        expect(lifetimeGames.value).toBe(2)
        expect(lifetimeGames.progress).toBe(2)
    })
})

describe('daily rotating challenge', () => {
    const period = { rounds: 0, wins: 0, wagered: 0, bestMultiplier: 0, bestStreak: 0, currentStreak: 0, uniqueGames: [] }

    it('is deterministic for a given date key', () => {
        const a = dailyChallengeFor('2026-06-12')
        const b = dailyChallengeFor('2026-06-12')
        expect(a.id).toBe(b.id)
    })

    it('rotates across different dates', () => {
        const ids = new Set(['2026-06-12', '2026-06-13', '2026-06-14', '2026-06-15', '2026-06-16', '2026-06-17', '2026-06-18'].map(k => dailyChallengeFor(k).id))
        expect(ids.size).toBeGreaterThan(1)
    })

    it('evaluates completion against daily period stats', () => {
        const chal = dailyChallengeFor('2026-06-12')
        // Build a stats object that satisfies the challenge target.
        const big = { ...period, rounds: 999, wins: 999, wagered: 999999, bestMultiplier: 999, bestStreak: 999, uniqueGames: ['a', 'b', 'c', 'd', 'e', 'f'] }
        const res = evaluateDailyChallenge({ dayKey: '2026-06-12', daily: big }, '2026-06-12')
        expect(res.id).toBe(chal.id)
        expect(res.complete).toBe(true)
        expect(res.reward.credits).toBeGreaterThan(0)
    })
})
