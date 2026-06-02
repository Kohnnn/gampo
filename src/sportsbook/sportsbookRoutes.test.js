import { describe, expect, it } from 'vitest'
import { legacySportsbookPath, parseSportsbookRoute, sportsbookPathForView } from './sportsbookRoutes'

describe('sportsbook route helpers', () => {
    it('parses canonical sportsbook views and sports from URLs', () => {
        expect(parseSportsbookRoute('/sportsbook')).toEqual({ view: 'home', sportId: null, eventId: null })
        expect(parseSportsbookRoute('/sportsbook/live')).toEqual({ view: 'live', sportId: null, eventId: null })
        expect(parseSportsbookRoute('/sportsbook/starting')).toEqual({ view: 'starting', sportId: null, eventId: null })
        expect(parseSportsbookRoute('/sportsbook/all')).toEqual({ view: 'all', sportId: null, eventId: null })
        expect(parseSportsbookRoute('/sportsbook/my-bets')).toEqual({ view: 'my-bets', sportId: null, eventId: null })
        expect(parseSportsbookRoute('/sportsbook/soccer')).toEqual({ view: 'sport', sportId: 'soccer', eventId: null })
    })

    it('serializes view state to canonical sportsbook paths', () => {
        expect(sportsbookPathForView({ view: 'home' })).toBe('/sportsbook')
        expect(sportsbookPathForView({ view: 'live' })).toBe('/sportsbook/live')
        expect(sportsbookPathForView({ view: 'sport', sportId: 'cs2' })).toBe('/sportsbook/cs2')
        expect(sportsbookPathForView({ view: 'unknown' })).toBe('/sportsbook')
    })

    it('preserves legacy sports suffixes when redirecting', () => {
        expect(legacySportsbookPath('/sports')).toBe('/sportsbook')
        expect(legacySportsbookPath('/sports/soccer')).toBe('/sportsbook/soccer')
    })
})
