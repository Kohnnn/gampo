import { describe, expect, it } from 'vitest'
import { evaluateMissions } from './missions'

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
