import { describe, expect, it } from 'vitest'
import { fullGameCatalog } from '../data/casinoCatalog'
import { searchGames } from './gameSearch'

describe('gameSearch', () => {
    it('returns simulator links from the shared catalog', () => {
        const results = searchGames(fullGameCatalog, 'blackjack')
        expect(results[0].name).toContain('Blackjack')
        expect(results[0].path).toBe('/blackjack')
    })

    it('supports game-page header queries for slots and sportsbook', () => {
        expect(searchGames(fullGameCatalog, 'scarab')[0].path).toBe('/scarab-spin')
        expect(searchGames(fullGameCatalog, 'sportsbook')[0].path).toBe('/sportsbook')
    })
})
