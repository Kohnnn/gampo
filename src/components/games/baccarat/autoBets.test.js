import { describe, expect, it } from 'vitest'
import { deriveBaccaratAutoBets, latestNonTieSide } from './autoBets'

describe('baccarat auto bets', () => {
    it('uses current chips before any inferred auto side', () => {
        const result = deriveBaccaratAutoBets({
            currentBets: { tie: 5, banker: 10 },
            outcomes: ['P', 'B'],
            betAmount: 25,
        })
        expect(result).toEqual({ bets: { tie: 5, banker: 10 }, source: 'manual', side: null })
    })

    it('follows the latest non-tie Banker or Player road outcome', () => {
        expect(latestNonTieSide(['P', 'T', 'B', 'T'])).toBe('banker')
        expect(deriveBaccaratAutoBets({
            outcomes: ['B', 'T', 'P', 'T'],
            betAmount: 25,
        })).toEqual({ bets: { player: 25 }, source: 'latest-road', side: 'player' })
    })

    it('falls back to the last manual Banker or Player chip only', () => {
        expect(deriveBaccaratAutoBets({
            lastChips: { tie: 5, pair_p: 5, banker: 15 },
            outcomes: [],
            betAmount: 20,
        })).toEqual({ bets: { banker: 20 }, source: 'last-manual', side: 'banker' })
    })

    it('returns no bet when Auto has no road or side seed', () => {
        expect(deriveBaccaratAutoBets({
            lastChips: { tie: 5, big: 5 },
            outcomes: ['T', 'T'],
            betAmount: 20,
        })).toEqual({ bets: {}, source: 'none', side: null })
    })
})
