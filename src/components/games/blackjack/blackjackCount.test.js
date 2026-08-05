import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { countMetrics, createBlackjackCount, dealCards, hiLoTag, observeCards } from './blackjackCount'

const gameSource = readFileSync(new URL('./BlackjackGame.jsx', import.meta.url), 'utf8')

const c = (rank, suit = 'S') => ({ rank, suit })

describe('blackjackCount', () => {
    it('applies Hi-Lo rank tags and ignores malformed cards', () => {
        expect(['2', '3', '4', '5', '6'].map(rank => hiLoTag(c(rank)))).toEqual([1, 1, 1, 1, 1])
        expect(['7', '8', '9'].map(rank => hiLoTag(c(rank)))).toEqual([0, 0, 0])
        expect(['10', 'J', 'Q', 'K', 'A'].map(rank => hiLoTag(c(rank)))).toEqual([-1, -1, -1, -1, -1])
        expect(hiLoTag()).toBe(0)
        expect(hiLoTag({ rank: 'X' })).toBe(0)
    })

    it('deduplicates exact card objects without treating matching multi-deck cards as one card', () => {
        const firstSix = c('6')
        const secondSix = c('6')
        const state = observeCards(createBlackjackCount(52), [firstSix, firstSix, secondSix, { rank: 'X' }])

        expect(state.runningCount).toBe(2)
        expect(state.observed.size).toBe(2)
    })

    it('tracks dealt cards separately from exposed cards so hidden and future cards do not leak', () => {
        const playerOne = c('5')
        const dealerUp = c('K')
        const dealerHole = c('2')
        const future = c('A')
        let state = createBlackjackCount(52)
        state = dealCards(state, [playerOne, dealerUp, dealerHole])
        state = observeCards(state, [playerOne, dealerUp])

        expect(state.runningCount).toBe(0)
        expect(state.dealtCards).toBe(3)
        expect(observeCards(state, [future]).runningCount).toBe(-1)
        expect(observeCards(state, [dealerHole, dealerHole]).runningCount).toBe(1)
    })

    it('resets only for active shoes and keeps the private study shoe outside count state', () => {
        expect(gameSource).toContain('const countRef = useRef(createBlackjackCount(4 * 52))')
        expect(gameSource).toContain('const resetShoe = (deckCount) => {')
        expect(gameSource).toContain('countRef.current = createBlackjackCount(deckCount * 52)')
        expect(gameSource).toContain('const ensureShoe = (source) => (source.length < decks * 13) ? resetShoe(decks) : source')
        expect(gameSource).toContain('const onDecks = (n) => { setDecks(n); setShoe(resetShoe(n)) }')
        const studyStart = gameSource.indexOf('const runStudy =')
        const study = gameSource.slice(studyStart, gameSource.indexOf('const activeHand =', studyStart))
        expect(study).toContain('let local = buildShoe(decks)')
        expect(study).not.toContain('countRef')
    })

    it('wires each exposed-card lifecycle boundary and reveals the dealer exactly once', () => {
        expect(gameSource).toContain('observeCards(countRef.current, [...initialPlayer, initialDealer[0]])')
        expect(gameSource).toContain('observeCards(dealCards(countRef.current, [card]), [card])')
        expect(gameSource).toContain('observeCards(dealCards(countRef.current, [firstCard, secondCard]), [firstCard, secondCard])')
        expect(gameSource).toContain('countRef.current = observeCards(countRef.current, finalDealer)')
        expect(gameSource).toContain('countRef.current = dealCards(countRef.current, [card])')
    })

    it('returns bounded penetration, decks remaining, and the product Math.trunc true-count convention', () => {
        let state = createBlackjackCount(104)
        state = dealCards(state, Array.from({ length: 26 }, (_, index) => c('2', String(index))))
        state = observeCards(state, [c('2'), c('2', 'H'), c('2', 'D')])

        expect(countMetrics(state)).toEqual({ penetration: 0.25, remainingDecks: 1.5, trueCount: 2 })
        expect(countMetrics({ ...state, dealtCards: 105 })).toEqual({ penetration: 1, remainingDecks: 0, trueCount: null })
        expect(countMetrics(createBlackjackCount())).toEqual({ penetration: 0, remainingDecks: 0, trueCount: null })
    })
})
