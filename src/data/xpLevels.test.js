import { describe, expect, it } from 'vitest'
import {
    MAX_LEVEL,
    levelForXp,
    rankForLevel,
    xpForLevel,
    xpForRound,
} from './xpLevels'

describe('xpLevels curve', () => {
    it('level 1 starts at 0 cumulative xp and increases monotonically', () => {
        expect(xpForLevel(1)).toBe(0)
        let prev = -1
        for (let l = 1; l <= 20; l += 1) {
            const need = xpForLevel(l)
            expect(need).toBeGreaterThan(prev)
            prev = need
        }
    })

    it('resolves total xp into the correct level and progress', () => {
        expect(levelForXp(0).level).toBe(1)
        const l2 = xpForLevel(2)
        expect(levelForXp(l2).level).toBe(2)
        expect(levelForXp(l2 - 1).level).toBe(1)
        const mid = l2 + Math.floor((xpForLevel(3) - l2) / 2)
        const res = levelForXp(mid)
        expect(res.level).toBe(2)
        expect(res.progress).toBeGreaterThan(0)
        expect(res.progress).toBeLessThan(1)
    })

    it('caps at MAX_LEVEL with full progress', () => {
        const huge = xpForLevel(MAX_LEVEL) + 1_000_000
        const res = levelForXp(huge)
        expect(res.level).toBe(MAX_LEVEL)
        expect(res.atMax).toBe(true)
        expect(res.progress).toBe(1)
        expect(res.toNext).toBe(0)
    })
})

describe('rankForLevel', () => {
    it('maps low levels to Rookie and high levels to top tiers', () => {
        expect(rankForLevel(1).current.id).toBe('rookie')
        expect(rankForLevel(1).next.id).toBe('apprentice')
        expect(rankForLevel(10).current.id).toBe('dealer')
        expect(rankForLevel(90).current.id).toBe('mythic')
        expect(rankForLevel(95).next).toBeNull()
    })
})

describe('xpForRound', () => {
    it('awards the base for a minimal losing round', () => {
        expect(xpForRound({ profit: -5, betAmount: 5, multiplier: 0 })).toBeGreaterThanOrEqual(6)
    })

    it('adds win and multiplier bonuses, capped', () => {
        const small = xpForRound({ profit: 5, betAmount: 5, multiplier: 2 })
        const big = xpForRound({ profit: 5000, betAmount: 5, multiplier: 1000 })
        expect(big).toBeGreaterThan(small)
        // multiplier bonus capped, so even a 1000x can't exceed base+win+caps+wager
        expect(big).toBeLessThanOrEqual(6 + 8 + 80 + 60 + 40 + 25)
    })

    it('adds one-time new-game and daily-first bonuses only when flagged', () => {
        const plain = xpForRound({ profit: 0, betAmount: 10 }, {})
        const bonus = xpForRound({ profit: 0, betAmount: 10 }, { newGame: true, dailyFirstRound: true })
        expect(bonus - plain).toBe(40 + 25)
    })

    it('caps wager contribution', () => {
        const capped = xpForRound({ profit: 0, betAmount: 100000, multiplier: 0 }, {})
        expect(capped).toBe(6 + 60)
    })
})
