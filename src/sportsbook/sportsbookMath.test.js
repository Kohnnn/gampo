import { describe, expect, it } from 'vitest'
import {
    BET_MODES,
    ODDS_POLICIES,
    deVigProbabilities,
    evaluateOddsPolicy,
    quoteTicket,
    settleTicketDeterministic,
} from './sportsbookMath'

const selections = [
    { selectionId: 'a', currentOdds: 2, acceptedOdds: 2, trueProbability: 0.52, oddsChanged: false, label: 'Home' },
    { selectionId: 'b', currentOdds: 1.8, acceptedOdds: 1.8, trueProbability: 0.55, oddsChanged: false, label: 'Away' },
    { selectionId: 'c', currentOdds: 2.4, acceptedOdds: 2.4, trueProbability: 0.4, oddsChanged: false, label: 'Over' },
]

describe('sportsbookMath', () => {
    it('de-vigs probabilities so the normalized market sums to one', () => {
        const probabilities = deVigProbabilities([1.9, 1.9, 4.2])
        expect(probabilities.reduce((sum, p) => sum + p, 0)).toBeCloseTo(1)
        expect(probabilities[0]).toBeGreaterThan(probabilities[2])
    })

    it('quotes singles, multi, and 2-of-N system tickets', () => {
        const singles = quoteTicket({ selections: selections.slice(0, 2), stake: 20, mode: BET_MODES.SINGLES })
        expect(singles.estimatedPayout).toBe(38)
        expect(singles.combinations).toBe(2)

        const multi = quoteTicket({ selections: selections.slice(0, 2), stake: 20, mode: BET_MODES.MULTI })
        expect(multi.totalOdds).toBe(3.6)
        expect(multi.estimatedPayout).toBe(72)

        const system = quoteTicket({ selections, stake: 30, mode: BET_MODES.SYSTEM_2 })
        expect(system.combinations).toBe(3)
        expect(system.estimatedPayout).toBeGreaterThan(100)
    })

    it('enforces the default accept-only-higher odds policy', () => {
        expect(evaluateOddsPolicy([
            { acceptedOdds: 2, currentOdds: 2.2, oddsChanged: true },
        ], ODDS_POLICIES.ACCEPT_HIGHER).allowed).toBe(true)

        const worse = evaluateOddsPolicy([
            { acceptedOdds: 2, currentOdds: 1.9, oddsChanged: true },
        ], ODDS_POLICIES.ACCEPT_HIGHER)
        expect(worse.allowed).toBe(false)
        expect(worse.needsManualAccept).toBe(true)
    })

    it('settles deterministically for the same ticket seed', () => {
        const first = settleTicketDeterministic({
            ticketId: 'ticket-1',
            selections,
            stake: 25,
            mode: BET_MODES.MULTI,
            seed: 'fixed-seed',
        })
        const second = settleTicketDeterministic({
            ticketId: 'ticket-1',
            selections,
            stake: 25,
            mode: BET_MODES.MULTI,
            seed: 'fixed-seed',
        })
        expect(second).toEqual(first)
    })
})
