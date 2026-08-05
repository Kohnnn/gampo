import { describe, expect, it } from 'vitest'
import {
    BLACKJACK_STRATEGY_PROVENANCE,
    BLACKJACK_STRATEGY_VERSION,
    HI_LO_DEVIATION_PROVENANCE,
    basicStrategyHint,
    dealerUpValue,
    isSoftHand,
    recommendBlackjackAction,
    recommendHiLoDeviation,
    scoreHand,
} from './blackjackStrategy'

const c = (rank, suit = 'S') => ({ rank, suit })

describe('blackjackStrategy', () => {
    it('isSoftHand detects ace-bearing playable hands', () => {
        expect(isSoftHand([c('A'), c('5')])).toBe(true)
        expect(isSoftHand([c('A'), c('A'), c('5')])).toBe(true)
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

    it('returns versioned baseline provenance and source-profile actions', () => {
        expect(BLACKJACK_STRATEGY_VERSION).toBe('gampo-blackjack-basic-v1')
        expect(BLACKJACK_STRATEGY_PROVENANCE.retrieved).toBe('2026-07-29')
        expect(recommendBlackjackAction({ player: [c('5'), c('4')], dealerCard: c('2'), decks: 4 })).toMatchObject({ action: 'hit', baselineAction: 'H', profileId: 'S17_2' })
        expect(recommendBlackjackAction({ player: [c('5'), c('4')], dealerCard: c('2'), decks: 1 })).toMatchObject({ action: 'double', baselineAction: 'DH', profileId: 'S17_0' })
        expect(recommendBlackjackAction({ player: [c('A'), c('7')], dealerCard: c('2'), decks: 2, hitsSoft17: true })).toMatchObject({ action: 'double', baselineAction: 'DS', profileId: 'H17_1' })
        expect(recommendBlackjackAction({ player: [c('8'), c('8', 'H')], dealerCard: c('A'), decks: 4 })).toMatchObject({ action: 'surrender', baselineAction: 'RH' })
        expect(recommendBlackjackAction({ player: [c('10'), c('K', 'H')], dealerCard: c('6'), decks: 4 })).toMatchObject({ action: 'stand', baselineAction: 'S' })
    })

    it('uses ordered source candidates with availability fallback or an unavailable result', () => {
        const player = [c('5'), c('5', 'H')]
        expect(recommendBlackjackAction({ player, dealerCard: c('6'), available: { double: false } })).toMatchObject({ action: 'hit', baselineAction: 'DH', fallbackAction: 'hit' })
        expect(recommendBlackjackAction({ player, dealerCard: c('6'), available: { double: false, hit: false } })).toMatchObject({ status: 'unavailable', action: null })
        expect(recommendBlackjackAction({ player: [], dealerCard: c('6') })).toMatchObject({ status: 'unavailable', action: null })
    })

    it('applies only verified six-deck S17 I18/Fab 4 non-insurance deviations at their index', () => {
        expect(HI_LO_DEVIATION_PROVENANCE).toMatchObject({
            source: 'Wizard of Odds High-Low',
            retrieved: '2026-07-29',
        })
        const vectors = [
            [[c('7'), c('9')], '10', 0, 'stand'], [[c('10'), c('K', 'H')], '5', 5, 'split'], [[c('10'), c('K', 'H')], '6', 4, 'split'],
            [[c('4'), c('6')], '10', 4, 'double'], [[c('5'), c('7')], '3', 2, 'stand'], [[c('5'), c('7')], '2', 3, 'stand'], [[c('5'), c('6')], 'A', 1, 'double'],
            [[c('4'), c('5')], '2', 1, 'double'], [[c('4'), c('6')], 'A', 4, 'double'], [[c('4'), c('5')], '7', 3, 'double'], [[c('7'), c('9')], '9', 5, 'stand'],
            [[c('6'), c('7')], '2', -1, 'stand'], [[c('5'), c('7')], '4', 0, 'stand'], [[c('5'), c('7')], '5', -2, 'stand'], [[c('5'), c('7')], '6', -1, 'stand'],
            [[c('6'), c('7')], '3', -2, 'stand'], [[c('6'), c('8')], '10', 3, 'surrender'], [[c('7'), c('8')], '10', 0, 'surrender'],
            [[c('7'), c('8')], '9', 2, 'surrender'], [[c('7'), c('8')], 'A', 1, 'surrender'],
        ]
        expect(recommendHiLoDeviation({ decks: 1 })).toMatchObject({ status: 'not-applicable', action: null })
        expect(recommendHiLoDeviation({ decks: 6, hitsSoft17: true })).toMatchObject({ status: 'not-applicable', action: null })
        for (const [player, dealerRank, index, action] of vectors) {
            const options = { player, dealerCard: c(dealerRank), decks: 6, hitsSoft17: false, trueCount: index }
            expect(recommendHiLoDeviation({ ...options, trueCount: index - 1 })).toMatchObject({ status: 'not-applicable', action: null })
            expect(recommendHiLoDeviation(options)).toMatchObject({ status: 'available', action, deviation: { index } })
            expect(recommendHiLoDeviation({ ...options, trueCount: index + 1 })).toMatchObject({ status: 'available', action, deviation: { index } })
        }
    })

    it('verifies every transcribed Wizard source cell for all supported profiles', () => {
        const baseRows = [
            'H H H H H H H H H RH', 'H H H H H H H H H RH', 'H H H H H H H H H RH', 'H H H H H H H H H H',
            'H DH DH DH DH H H H H H', 'DH DH DH DH DH DH DH DH H H', 'DH DH DH DH DH DH DH DH H H', 'H H S S S H H H H RH',
            'S S S S S H H H H RH', 'S S S S S H H H RH RH', 'S S S S S H H H RH RH', 'S S S S S H H RH RH RH',
            'S S S S S S S S S RS', 'S S S S S S S S S S', 'S S S S S S S S S S', 'S S S S S S S S S S', 'S S S S S S S S S S',
            'H H H DH DH H H H H H', 'H H H DH DH H H H H H', 'H H DH DH DH H H H H H', 'H H DH DH DH H H H H H',
            'H DH DH DH DH H H H H H', 'S DS DS DS DS S S H H H', 'S S S S S S S S S S', 'S S S S S S S S S S', 'S S S S S S S S S S',
            'QH QH P P P P H H H H', 'QH QH P P P P H H H RH', 'H H H QH QH H H H H H', 'DH DH DH DH DH DH DH DH H H',
            'QH P P P P H H H H RH', 'P P P P P P H H RH RH', 'P P P P P P P P RH RH', 'P P P P P S P P S S', 'S S S S S S S S S S', 'P P P P P P P P P H',
        ].map(row => row.split(' '))
        const changes = {
            H17_0: ['3:3:DH', '3:4:DH', '4:0:DH', '11:7:H', '17:2:DH', '18:2:DH', '21:0:DH', '23:4:DS', '26:1:P', '26:9:RH', '27:6:QH', '28:2:QH', '28:3:QD', '28:4:QD', '30:0:P', '30:5:QH', '31:6:QH', '31:8:RS'],
            S17_0: ['3:3:DH', '3:4:DH', '4:0:DH', '11:7:H', '17:2:DH', '18:2:DH', '21:0:DH', '22:9:S', '23:4:DS', '26:1:P', '27:6:QH', '28:2:QH', '28:3:QD', '28:4:QD', '30:0:P', '30:5:QH', '31:6:QH', '31:8:RS'],
            H17_1: ['4:0:DH', '11:7:H', '18:2:DH', '22:0:DS', '23:4:DS', '26:9:RH', '30:0:P', '30:5:QH', '31:6:QH'],
            S17_1: ['4:0:DH', '11:7:H', '30:0:P', '30:5:QH', '31:6:QH'],
            H17_2: ['22:0:DS', '23:4:DS', '26:9:RH'],
        }
        const profiles = [
            ['H17_0', 1, true], ['S17_0', 1, false], ['H17_1', 2, true],
            ['S17_1', 2, false], ['H17_2', 4, true], ['S17_2', 4, false],
        ]
        const hardHands = [[c('2'), c('3')], [c('2'), c('4')], [c('2'), c('5')], [c('2'), c('6')], [c('2'), c('7')], [c('3'), c('7')], [c('4'), c('7')], [c('5'), c('7')], [c('10'), c('3')], [c('10'), c('4')], [c('10'), c('5')], [c('10'), c('6')], [c('10'), c('7')], [c('10'), c('8')], [c('10'), c('9')], [c('K'), c('Q')], [c('K'), c('A')]]
        const softHands = [
            ...['2', '3', '4', '5', '6', '7', '8', '9'].map(rank => [c('A'), c(rank)]),
            [c('A'), c('2'), c('8')],
        ]
        const pairHands = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'].map(rank => [c(rank), c(rank, 'H')])
        const hands = [...hardHands, ...softHands, ...pairHands]
        const dealerCards = [...['2', '3', '4', '5', '6', '7', '8', '9', '10'], 'A'].map(c)
        let cases = 0

        for (const [profileId, decks, hitsSoft17] of profiles) {
            const expectedRows = baseRows.map(row => [...row])
            for (const change of changes[profileId] || []) {
                const [row, column, code] = change.split(':')
                expectedRows[Number(row)][Number(column)] = code
            }
            for (const [row, player] of hands.entries()) {
                for (const [column, dealerCard] of dealerCards.entries()) {
                    const sourceCode = expectedRows[row][column]
                    const decision = recommendBlackjackAction({ player, dealerCard, decks, hitsSoft17 })
                    expect(decision.baselineAction, `${profileId} row ${row} column ${column}`).toBe(sourceCode)
                    cases += 1
                }
            }
        }
        expect(cases).toBe(2160)
    })

    it('derives legacy display copy from the structured decision', () => {
        expect(basicStrategyHint([c('K'), c('7')], c('6'))).toMatch(/stand/)
        expect(basicStrategyHint([c('5'), c('5')], c('6'))).toMatch(/double/)
        expect(basicStrategyHint([], c('5'))).toMatch(/Deal first/)
    })
})
