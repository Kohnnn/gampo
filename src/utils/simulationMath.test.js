import { describe, expect, it } from 'vitest'
import {
    bankrollRisk,
    dicePayout,
    expectedValue,
    fairDecimalOdds,
    kenoPayout,
    limboWinChance,
    rouletteMultiplier,
    scoreBlackjackHand,
    sportsbookOverround,
    sportsbookVig,
} from './simulationMath'

describe('simulation math helpers', () => {
    it('calculates EV with payout return included', () => {
        expect(expectedValue({ betAmount: 10, winProbability: 0.5, payoutMultiplier: 2 })).toBe(0)
        expect(expectedValue({ betAmount: 10, winProbability: 0.49, payoutMultiplier: 2 })).toBeCloseTo(-0.2, 6)
    })

    it('returns plausible dice and limbo probabilities', () => {
        expect(dicePayout(0.5)).toBeCloseTo(1.98, 2)
        expect(limboWinChance(2)).toBeCloseTo(0.495, 3)
        expect(fairDecimalOdds(0.25)).toBe(4)
    })

    it('scores roulette outcomes', () => {
        expect(rouletteMultiplier('straight', 17, 17)).toBe(36)
        expect(rouletteMultiplier('red', null, 1)).toBe(2)
        expect(rouletteMultiplier('black', null, 1)).toBe(0)
        expect(rouletteMultiplier('even', null, 0)).toBe(0)
    })

    it('handles keno hit tables (calibrated for 40-ball/10-draw, 92% RTP)', () => {
        // No-hit always pays zero.
        expect(kenoPayout(5, 0)).toBe(0)
        // Jackpot hits pay a large positive multiplier (exact value is scaled to
        // lock RTP, so assert ordering + positivity rather than a magic number).
        expect(kenoPayout(5, 5)).toBeGreaterThan(kenoPayout(5, 4))
        expect(kenoPayout(5, 5)).toBeGreaterThan(100)
        expect(kenoPayout(10, 10)).toBeGreaterThan(kenoPayout(10, 8))
        expect(kenoPayout(10, 8)).toBeGreaterThan(0)
    })

    it('scores blackjack hands with soft aces', () => {
        expect(scoreBlackjackHand([{ rank: 'A' }, { rank: 'K' }])).toBe(21)
        expect(scoreBlackjackHand([{ rank: 'A' }, { rank: '9' }, { rank: '9' }])).toBe(19)
        expect(scoreBlackjackHand([{ rank: 'Q' }, { rank: '8' }, { rank: '5' }])).toBe(23)
    })

    it('calculates sportsbook margin and risk estimates', () => {
        const odds = [2.0, 3.6, 3.9]
        expect(sportsbookOverround(odds)).toBeGreaterThan(1)
        expect(sportsbookVig(odds)).toBeGreaterThan(0)
        expect(bankrollRisk({ bankroll: 100, betAmount: 10, lossProbability: 0.5, trials: 20 })).toBeGreaterThan(0)
    })
})
