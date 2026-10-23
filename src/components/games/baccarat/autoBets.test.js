import { describe, expect, it } from 'vitest'
import { deriveBaccaratAutoBets, latestNonTieSide, resolveBaccaratTicket } from './autoBets'

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

describe('baccarat charged ticket', () => {
    it('keeps accumulated chips ahead of the selection amount in every mode', () => {
        const currentBets = { banker: 5, tie: 25 }
        for (const mode of ['manual', 'auto', 'strategy']) {
            expect(resolveBaccaratTicket({ currentBets, mode, betAmount: 100 })).toEqual({ bets: currentBets, stake: 30, source: 'manual' })
        }
    })

    it('quotes the complete manual repeat ticket', () => {
        const lastChips = { banker: 5, tie: 10 }
        for (const mode of ['manual', 'strategy']) {
            expect(resolveBaccaratTicket({ lastChips, mode, betAmount: 100 })).toEqual({ bets: lastChips, stake: 15, source: 'last-manual' })
        }
    })

    it('quotes the actual Auto side amount instead of the manual repeat ticket', () => {
        expect(resolveBaccaratTicket({
            lastChips: { banker: 5, tie: 10 }, outcomes: ['B', 'P'], mode: 'auto', betAmount: 25,
        })).toEqual({ bets: { player: 25 }, stake: 25, source: 'latest-road' })
        expect(resolveBaccaratTicket({ mode: 'auto', betAmount: 25 })).toEqual({ bets: {}, stake: 0, source: 'manual' })
        expect(resolveBaccaratTicket({ mode: 'manual', betAmount: 25 })).toEqual({ bets: {}, stake: 0, source: 'manual' })
    })
})
