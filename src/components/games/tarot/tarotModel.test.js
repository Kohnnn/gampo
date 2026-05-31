import { describe, expect, it } from 'vitest'
import { contributionFor, DECK, drawSpread, expectedMultiplierForSuit, TAROT_BACK_IMAGE, tarotCardImage } from './tarotModel'

describe('tarot model', () => {
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

    it('boosts matching card contribution over a non-matching pick', () => {
        const sun = DECK.find(card => card.id === 'sun')
        expect(contributionFor(sun, 'wands')).toBeGreaterThan(contributionFor(sun, 'cups'))
    })

    it('maps all 22 Major Arcana and the back to monochrome PNG assets', () => {
        expect(DECK).toHaveLength(22)
        expect(TAROT_BACK_IMAGE).toBe('/assets/tarot/monochrome/back.png')
        DECK.forEach((card, index) => {
            expect(card.assetIndex).toBe(index)
            expect(tarotCardImage(card)).toBe(`/assets/tarot/monochrome/${String(index).padStart(2, '0')}.png`)
        })
    })
})
