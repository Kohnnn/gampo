import { describe, expect, it } from 'vitest'
import { deriveSessionRecap } from './sessionRecap'

describe('deriveSessionRecap', () => {
    it('returns a warmup recap before any play', () => {
        const recap = deriveSessionRecap()

        expect(recap.rounds).toBe(0)
        expect(recap.mood).toBe('Ready to warm up')
        expect(recap.nextAction).toContain('start')
        expect(recap.educationNote).toContain('fake-credit')
    })

    it('summarizes profit, missions, challenge, and xp state', () => {
        const recap = deriveSessionRecap({
            progressStats: {
                totalRounds: 10,
                totalWins: 6,
                totalLosses: 4,
                totalProfit: 120,
                totalWagered: 500,
                bestMultiplier: 12,
                biggestSingleWin: 180,
                currentDayStreak: 3,
                uniqueGames: ['crash', 'plinko', 'slots'],
            },
            missionSummary: {
                daily: { complete: 2, total: 6, claimed: 1 },
                weekly: { complete: 1, total: 6, claimed: 0 },
                lifetime: { complete: 4, total: 7, claimed: 3 },
            },
            challenge: { name: 'Sampler', ratio: 0.6, complete: false },
            xp: { level: 7, progress: 0.4, rank: { current: { label: 'Analyst' } } },
        })

        expect(recap.winRate).toBe(0.6)
        expect(recap.rtp).toBe(1.24)
        expect(recap.missionsComplete).toBe(7)
        expect(recap.missionsClaimed).toBe(4)
        expect(recap.challengeName).toBe('Sampler')
        expect(recap.level).toBe(7)
        expect(recap.rankLabel).toBe('Analyst')
    })

    it('prioritizes claimable challenge rewards', () => {
        const recap = deriveSessionRecap({
            progressStats: { totalRounds: 5, totalProfit: -20, uniqueGames: ['dice'] },
            challenge: { name: 'Dozen wins', claimable: true, complete: true, ratio: 1 },
        })

        expect(recap.nextAction).toContain('Claim')
        expect(recap.educationNote).toContain('practice-only')
    })
})
