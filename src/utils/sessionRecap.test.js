import { describe, expect, it } from 'vitest'
import { deriveSessionRecap } from './sessionRecap'

const completeMissionSummary = {
    daily: { complete: 1, total: 1, claimed: 1 },
}

function recapFor({ progressStats = {}, missionSummary = completeMissionSummary, challenge = { name: 'Daily challenge', complete: true }, xp = {} } = {}) {
    return deriveSessionRecap({ progressStats: { totalRounds: 1, uniqueGames: ['dice', 'limbo', 'wheel'], ...progressStats }, missionSummary, challenge, xp })
}

describe('deriveSessionRecap', () => {
    it('returns safe zero defaults and cumulative progress wording before play', () => {
        const recap = deriveSessionRecap()

        expect(recap).toMatchObject({
            rounds: 0,
            wins: 0,
            losses: 0,
            winRate: 0,
            profit: 0,
            wagered: 0,
            rtp: null,
            level: 1,
            rankLabel: 'Rookie',
            mood: 'Ready to warm up',
            nextAction: 'Play one Original or slot to start your cumulative local progress snapshot.',
        })
    })

    it('preserves aggregated totals, ratios, challenge, and xp state', () => {
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

        expect(recap).toMatchObject({
            winRate: 0.6,
            rtp: 1.24,
            missionsComplete: 7,
            missionsTotal: 19,
            missionsClaimed: 4,
            challengeName: 'Sampler',
            challengeProgress: 0.6,
            level: 7,
            rankLabel: 'Analyst',
        })
        expect(recap.nextAction).toBe("Continue today's challenge: Sampler.")
    })

    it('keeps claimable challenges ahead of every other next action', () => {
        expect(recapFor({
            progressStats: { totalProfit: -20, uniqueGames: ['dice'] },
            challenge: { name: 'Dozen wins', claimable: true, complete: true, ratio: 1 },
        }).nextAction).toBe("Claim today's challenge in Progress Snapshot.")
    })

    it('directs incomplete missions before variety and profit branches', () => {
        expect(recapFor({
            missionSummary: { daily: { complete: 0, total: 1, claimed: 0 } },
            progressStats: { totalProfit: -20, uniqueGames: ['dice'] },
        }).nextAction).toBe('Choose an open mission before switching games.')
    })

    it('directs low variety before negative-profit guidance', () => {
        expect(recapFor({
            progressStats: { totalProfit: -20, uniqueGames: ['dice', 'limbo'] },
        }).nextAction).toBe('Try more game types to build variety progress.')
    })

    it('uses the frozen negative-profit and default guidance', () => {
        expect(recapFor({ progressStats: { totalProfit: -20 } }).nextAction).toBe('Try a lower-volatility game and compare its math panel.')
        expect(recapFor({ progressStats: { totalProfit: 20 } }).nextAction).toBe('Pause here or try a new personal best with practice credits.')
    })

    it('uses neutral mood and hot-RTP education wording without changing thresholds', () => {
        const neutral = recapFor({ progressStats: { totalProfit: 0 } })
        const hot = recapFor({ challenge: null, progressStats: { totalProfit: 20, totalWagered: 100 } })

        expect(neutral.mood).toBe('Even so far')
        expect(hot.rtp).toBe(1.2)
        expect(hot.educationNote).toBe('Small samples can run hot; long-run RTP still follows each game paytable.')
    })
})
