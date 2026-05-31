import { describe, expect, it } from 'vitest'
import {
    canDoubleHand,
    canSplitHand,
    makeBlackjackHand,
    settleBlackjackHands,
    splitBlackjackHand,
} from './blackjackRules'

const c = (rank, suit = 'S') => ({ rank, suit })

describe('blackjack split rules', () => {
    it('allows equal-value two-card splits up to four hands', () => {
        const hand = makeBlackjackHand({ cards: [c('10'), c('K')], wager: 5, id: 'h' })

        expect(canSplitHand(hand, [hand])).toBe(true)
        expect(canSplitHand(hand, [hand, hand, hand, hand])).toBe(false)
    })

    it('auto-stands split aces and blocks double after split aces', () => {
        const hand = makeBlackjackHand({ cards: [c('A'), c('A', 'H')], wager: 5, id: 'aces' })
        const split = splitBlackjackHand(hand, c('9'), c('K'))

        expect(split).toHaveLength(2)
        expect(split.every(h => h.isSplitAces && h.status === 'standing')).toBe(true)
        expect(split.every(h => canDoubleHand(h) === false)).toBe(true)
    })

    it('allows double after split except split aces', () => {
        const hand = makeBlackjackHand({ cards: [c('8'), c('8', 'H')], wager: 5, id: 'eights' })
        const split = splitBlackjackHand(hand, c('3'), c('2'))

        expect(split.every(h => h.fromSplit)).toBe(true)
        expect(split.every(h => canDoubleHand(h))).toBe(true)
    })

    it('pays original natural blackjack 3:2 but split 21 only 1:1', () => {
        const original = makeBlackjackHand({ cards: [c('A'), c('K')], wager: 10, id: 'natural' })
        const splitTwentyOne = makeBlackjackHand({ cards: [c('A'), c('K')], wager: 10, id: 'split', fromSplit: true, status: 'standing' })
        const dealer = [c('9'), c('7')]

        const naturalResult = settleBlackjackHands([original], dealer)
        const splitResult = settleBlackjackHands([splitTwentyOne], dealer)

        expect(naturalResult.hands[0].result.multiplier).toBe(2.5)
        expect(naturalResult.profit).toBe(15)
        expect(splitResult.hands[0].result.multiplier).toBe(2)
        expect(splitResult.profit).toBe(10)
    })
})
