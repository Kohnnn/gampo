import { describe, it, expect } from 'vitest'
import { isSoftHand, dealerUpValue, scoreHand, basicStrategyHint } from './blackjackStrategy'

const c = (rank, suit = 'S') => ({ rank, suit })

describe('blackjackStrategy', () => {
    it('isSoftHand detects ace-bearing playable hands', () => {
        expect(isSoftHand([c('A'), c('5')])).toBe(true)
        expect(isSoftHand([c('A'), c('A'), c('5')])).toBe(true) // 17 with one ace as 11
        expect(isSoftHand([c('K'), c('5')])).toBe(false)
    })

    it('scoreHand handles aces flexibly', () => {
        expect(scoreHand([c('A'), c('K')])).toBe(21)
        expect(scoreHand([c('A'), c('5'), c('Q')])).toBe(16)
        expect(scoreHand([c('K'), c('Q'), c('5')])).toBe(25)
    })

    it('dealerUpValue maps face/A correctly', () => {
        expect(dealerUpValue(c('A'))).toBe(11)
        expect(dealerUpValue(c('K'))).toBe(10)
        expect(dealerUpValue(c('10'))).toBe(10)
        expect(dealerUpValue(c('7'))).toBe(7)
    })

    it('basicStrategyHint returns sensible suggestions', () => {
        expect(basicStrategyHint([c('K'), c('7')], c('6'))).toMatch(/Stand/)
        expect(basicStrategyHint([c('5'), c('5')], c('6'))).toMatch(/Hit/)
        expect(basicStrategyHint([c('A'), c('6')], c('5'))).toMatch(/Hit|Stand/)
        expect(basicStrategyHint([], c('5'))).toMatch(/deal/)
    })
})
