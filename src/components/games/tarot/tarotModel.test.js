import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    contributionFor,
    DECK,
    drawSpread,
    expectedMultiplierForSuit,
    MATCH_BONUS,
    OFF_SUIT_FACTOR,
    rawCardValue,
    readingFor,
    TAROT_BACK_IMAGE,
    tarotCardImage,
} from './tarotModel'

const ROOT = process.cwd()

describe('tarot model', () => {
    it('maps all 78 Plateau cards with local fronts and the monochrome back', () => {
        expect(DECK).toHaveLength(78)
        expect(DECK.filter(card => card.arcana === 'major')).toHaveLength(22)
        expect(DECK.filter(card => card.arcana === 'minor')).toHaveLength(56)
        expect(TAROT_BACK_IMAGE).toBe('/assets/tarot/monochrome/back.png')
        expect(existsSync(join(ROOT, 'public', TAROT_BACK_IMAGE))).toBe(true)

        for (const card of DECK) {
            expect(card.symbols).toBeTruthy()
            expect(card.description).toBeTruthy()
            expect(tarotCardImage(card)).toMatch(/^\/assets\/tarot\/plateau\/.+\.jpg$/)
            expect(existsSync(join(ROOT, 'public', card.image))).toBe(true)
            expect(card.backImage).toBe(TAROT_BACK_IMAGE)
        }
    })

    it('persists the generated public deck json for static deployment', () => {
        const payload = JSON.parse(readFileSync(join(ROOT, 'public/data/tarot-deck.json'), 'utf8'))
        expect(payload.cards).toHaveLength(78)
        expect(payload.cardBack).toBe(TAROT_BACK_IMAGE)
        expect(payload.source.repository).toMatch(/plateau-tarot-api/)
    })

    it('draws a three-card spread without replacement', () => {
        const spread = drawSpread(() => 0)
        expect(spread).toHaveLength(3)
        expect(new Set(spread.map(card => card.id)).size).toBe(3)
    })

    it('normalizes every suit pick to the target return', () => {
        for (const suit of ['wands', 'cups', 'swords', 'pentacles']) {
            expect(expectedMultiplierForSuit(suit)).toBeCloseTo(0.96, 6)
        }
    })

    it('uses the requested minor suit-match math', () => {
        const aceWands = DECK.find(card => card.name === 'Ace of Wands')
        expect(rawCardValue(aceWands, 'wands')).toBeCloseTo(1.4 * MATCH_BONUS)
        expect(rawCardValue(aceWands, 'cups')).toBeCloseTo(1.4 * OFF_SUIT_FACTOR)
        expect(contributionFor(aceWands, 'wands')).toBeGreaterThan(contributionFor(aceWands, 'cups'))
    })

    it('uses the requested Major Arcana raw multipliers', () => {
        const sun = DECK.find(card => card.name === 'The Sun')
        const world = DECK.find(card => card.name === 'The World')
        const tower = DECK.find(card => card.name === 'The Tower')

        expect(rawCardValue(sun, 'cups')).toBe(8)
        expect(rawCardValue(world, 'wands')).toBe(10)
        expect(rawCardValue(tower, 'pentacles')).toBe(0)
    })

    it('builds interactive reading payloads with symbols and descriptions', () => {
        const card = DECK.find(item => item.name === 'The Magician')
        const reading = readingFor({ card, contribution: 1.23 }, 'Past', 'wands')

        expect(reading.title).toBe('Past: The Magician')
        expect(reading.symbols).toBe(card.symbols)
        expect(reading.description).toBe(card.description)
        expect(reading.omen).toContain('Major Arcana')
        expect(reading.contribution).toBe(1.23)
    })
})
