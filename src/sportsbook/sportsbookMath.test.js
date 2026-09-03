import { describe, expect, it } from 'vitest'
import {
    BET_MODES,
    ODDS_POLICIES,
    deVigProbabilities,
    evaluateOddsPolicy,
    quoteTicket,
    settleTicketDeterministic,
    resolveSelectionFromScore,
    settleTicketByEventResults,
    formatOdds,
    SIMULATED_CASHOUT_HAIRCUT,
    valueSimulatedCashout,
} from './sportsbookMath'
import { buildSyntheticSportsbookData } from './sportsbookData'
import { normalizeSportsGameOddsEvent } from './freeFeedAdapters'
import { cashOutTicket, createPracticeTicket, makeBetSlipSelection } from './sportsbookState'

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

    it('quotes singles, multi, and system-2 from deterministic shared combinations', () => {
        const singles = quoteTicket({ selections: selections.slice(0, 2), stake: 20, mode: BET_MODES.SINGLES })
        expect(singles.estimatedPayout).toBe(38)
        expect(singles.combinations).toBe(2)
        expect(singles.combinationDetails.map(({ id, selectionIds }) => ({ id, selectionIds }))).toEqual([
            { id: 'singles:a', selectionIds: ['a'] },
            { id: 'singles:b', selectionIds: ['b'] },
        ])

        const multi = quoteTicket({ selections: selections.slice(0, 2), stake: 20, mode: BET_MODES.MULTI })
        expect(multi.totalOdds).toBe(3.6)
        expect(multi.estimatedPayout).toBe(72)
        expect(multi.combinations).toBe(1)
        expect(multi.combinationDetails[0]).toMatchObject({
            id: 'multi:a+b',
            selectionIds: ['a', 'b'],
            rawStake: 20,
            rawOddsProduct: 3.6,
            rawEstimatedReturn: 72,
        })

        const system = quoteTicket({ selections, stake: 30, mode: BET_MODES.SYSTEM_2 })
        expect(system.combinations).toBe(3)
        expect(system.combinations).toBe(system.combinationDetails.length)
        expect(system.combinationDetails.map(detail => detail.id)).toEqual([
            'system-2:a+b',
            'system-2:a+c',
            'system-2:b+c',
        ])
        expect(system.estimatedPayout).toBe(127.2)
    })

    it('proves the literal four-leg system-2 oracle and lexical detail order', () => {
        const fourLegs = [
            { selectionId: 'a', acceptedOdds: 2, status: 'won' },
            { selectionId: 'b', acceptedOdds: 3, status: 'won' },
            { selectionId: 'c', acceptedOdds: 4, status: 'won' },
            { selectionId: 'd', acceptedOdds: 5, status: 'won' },
        ]
        const quote = quoteTicket({ selections: fourLegs, stake: 60, mode: BET_MODES.SYSTEM_2 })
        const settlement = settleTicketByEventResults({ selections: fourLegs, stake: 60, mode: BET_MODES.SYSTEM_2 })
        const expectedIds = [
            'system-2:a+b',
            'system-2:a+c',
            'system-2:a+d',
            'system-2:b+c',
            'system-2:b+d',
            'system-2:c+d',
        ]
        expect(quote.combinations).toBe(6)
        expect(quote.combinationDetails.map(detail => detail.id)).toEqual(expectedIds)
        expect(quote.combinationDetails.map(detail => detail.selectionIds)).toEqual([
            ['a', 'b'], ['a', 'c'], ['a', 'd'], ['b', 'c'], ['b', 'd'], ['c', 'd'],
        ])
        expect(quote.combinationDetails.map(detail => detail.rawStake)).toEqual([10, 10, 10, 10, 10, 10])
        expect(quote.combinationDetails.map(detail => detail.rawEstimatedReturn)).toEqual([60, 80, 100, 120, 150, 200])
        expect(quote.estimatedPayout).toBe(710)
        expect(settlement.combinations).toBe(6)
        expect(settlement.combinationDetails.map(detail => detail.id)).toEqual(expectedIds)
        expect(settlement.combinationDetails.map(detail => detail.rawSettledReturn)).toEqual([60, 80, 100, 120, 150, 200])
        expect(settlement).toMatchObject({ payout: 710, profit: 650, result: 'win', status: 'settled' })
    })

    it('sums raw returns before final currency rounding and uses accepted odds after acceptance', () => {
        const roundingSelections = [
            { selectionId: 'a', acceptedOdds: 1.005, currentOdds: 9, status: 'won' },
            { selectionId: 'b', acceptedOdds: 1.005, currentOdds: 9, status: 'won' },
            { selectionId: 'c', acceptedOdds: 1.005, currentOdds: 9, status: 'won' },
        ]
        const quote = quoteTicket({ selections: roundingSelections, stake: 1, mode: BET_MODES.SINGLES })
        const settlement = settleTicketByEventResults({ selections: roundingSelections, stake: 1, mode: BET_MODES.SINGLES })
        expect(quote.combinationDetails.map(detail => detail.estimatedReturn)).toEqual([0.34, 0.34, 0.34])
        expect(quote.estimatedPayout).toBe(1.01)
        expect(quote.combinationDetails.reduce((sum, detail) => sum + detail.rawEstimatedReturn, 0)).toBeCloseTo(1.005)
        expect(settlement.combinationDetails.map(detail => detail.settledReturn)).toEqual([0.34, 0.34, 0.34])
        expect(settlement.combinationDetails.reduce((sum, detail) => sum + detail.rawSettledReturn, 0)).toBeCloseTo(1.005)
        expect(settlement).toMatchObject({ payout: 1.01, profit: 0.01, result: 'win' })
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

    describe('score/status settlement contract', () => {
        describe('resolveSelectionFromScore', () => {
            it('resolves winner home selection as won when home score exceeds away score', () => {
                const result = resolveSelectionFromScore({
                    marketType: 'winner',
                    selectionLabel: 'Home',
                    homeScore: 3,
                    awayScore: 1,
                    eventStatus: 'settled',
                })
                expect(result.status).toBe('won')
            })

            it('resolves winner away selection as lost when home score exceeds away score', () => {
                const result = resolveSelectionFromScore({
                    marketType: 'winner',
                    selectionLabel: 'Away',
                    homeScore: 3,
                    awayScore: 1,
                    eventStatus: 'settled',
                })
                expect(result.status).toBe('lost')
            })

            it('resolves winner away as won when away score exceeds home score', () => {
                const result = resolveSelectionFromScore({
                    marketType: 'winner',
                    selectionLabel: 'Away',
                    homeScore: 1,
                    awayScore: 4,
                    eventStatus: 'settled',
                })
                expect(result.status).toBe('won')
            })

            it('resolves total over as won when combined score exceeds the line', () => {
                const result = resolveSelectionFromScore({
                    marketType: 'total',
                    selectionLabel: 'Over',
                    homeScore: 3,
                    awayScore: 2,
                    marketLine: 4.5,
                    eventStatus: 'settled',
                })
                expect(result.status).toBe('won')
            })

            it('resolves total under as won when combined score stays below the line', () => {
                const result = resolveSelectionFromScore({
                    marketType: 'total',
                    selectionLabel: 'Under',
                    homeScore: 1,
                    awayScore: 1,
                    marketLine: 4.5,
                    eventStatus: 'settled',
                })
                expect(result.status).toBe('won')
            })

            it('resolves total over as lost when combined score is below the line', () => {
                const result = resolveSelectionFromScore({
                    marketType: 'total',
                    selectionLabel: 'Over',
                    homeScore: 1,
                    awayScore: 1,
                    marketLine: 4.5,
                    eventStatus: 'settled',
                })
                expect(result.status).toBe('lost')
            })

            it('resolves spread home as won when adjusted home score exceeds away score', () => {
                const result = resolveSelectionFromScore({
                    marketType: 'spread',
                    selectionLabel: 'Home',
                    homeScore: 2,
                    awayScore: 4,
                    marketLine: -2.5,
                    eventStatus: 'settled',
                })
                expect(result.status).toBe('won')
            })

            it('resolves spread home as lost when adjusted home score stays below away score', () => {
                const result = resolveSelectionFromScore({
                    marketType: 'spread',
                    selectionLabel: 'Home',
                    homeScore: 2,
                    awayScore: 4,
                    marketLine: -1.5,
                    eventStatus: 'settled',
                })
                expect(result.status).toBe('lost')
            })

            it('voids an unsupported market type', () => {
                const result = resolveSelectionFromScore({
                    marketType: 'next-goal',
                    selectionLabel: 'Home',
                    homeScore: 2,
                    awayScore: 1,
                    eventStatus: 'settled',
                })
                expect(result.status).toBe('void')
            })

            it('voids a cancelled event regardless of score', () => {
                const result = resolveSelectionFromScore({
                    marketType: 'winner',
                    selectionLabel: 'Home',
                    homeScore: 3,
                    awayScore: 0,
                    eventStatus: 'cancelled',
                })
                expect(result.status).toBe('void')
            })

            it('returns pending when event status is pending', () => {
                const result = resolveSelectionFromScore({
                    marketType: 'winner',
                    selectionLabel: 'Home',
                    homeScore: 0,
                    awayScore: 0,
                    eventStatus: 'pending',
                })
                expect(result.status).toBe('pending')
            })

            it('returns pending when event status is live', () => {
                const result = resolveSelectionFromScore({
                    marketType: 'winner',
                    selectionLabel: 'Home',
                    homeScore: 2,
                    awayScore: 1,
                    eventStatus: 'live',
                })
                expect(result.status).toBe('pending')
            })

            it('returns pending when score is missing (no RNG fallback)', () => {
                const result = resolveSelectionFromScore({
                    marketType: 'winner',
                    selectionLabel: 'Home',
                    homeScore: null,
                    awayScore: null,
                    eventStatus: 'settled',
                })
                expect(result.status).toBe('pending')
            })

            describe('extended score-derivable markets', () => {
                it('resolves BTTS Yes as won when both teams score', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'both-teams-to-score',
                        selectionLabel: 'Yes',
                        homeScore: 2,
                        awayScore: 1,
                        eventStatus: 'settled',
                    }).status).toBe('won')
                })

                it('resolves BTTS Yes as lost when one team is blanked', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'btts',
                        selectionLabel: 'Yes',
                        homeScore: 3,
                        awayScore: 0,
                        eventStatus: 'settled',
                    }).status).toBe('lost')
                })

                it('resolves BTTS No as won when a team is blanked', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'both-teams-to-score',
                        selectionLabel: 'No',
                        homeScore: 0,
                        awayScore: 2,
                        eventStatus: 'settled',
                    }).status).toBe('won')
                })

                it('resolves BTTS No as lost when both teams score', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'both-teams-to-score',
                        selectionLabel: 'No',
                        homeScore: 1,
                        awayScore: 1,
                        eventStatus: 'settled',
                    }).status).toBe('lost')
                })

                it('resolves Correct Score as won when the exact line matches', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'correct-score',
                        selectionLabel: '2-1',
                        homeScore: 2,
                        awayScore: 1,
                        eventStatus: 'settled',
                    }).status).toBe('won')
                })

                it('resolves Correct Score as lost when the line does not match', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'correct-score',
                        selectionLabel: '2-1',
                        homeScore: 1,
                        awayScore: 1,
                        eventStatus: 'settled',
                    }).status).toBe('lost')
                })

                it('returns pending for Correct Score when the label has no parsable line', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'correct-score',
                        selectionLabel: 'Any Other',
                        homeScore: 1,
                        awayScore: 1,
                        eventStatus: 'settled',
                    }).status).toBe('pending')
                })

                it('resolves Double Chance 1X as won when home wins', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'double-chance',
                        selectionLabel: '1X',
                        homeScore: 2,
                        awayScore: 0,
                        eventStatus: 'settled',
                    }).status).toBe('won')
                })

                it('resolves Double Chance 1X as won when the match is drawn', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'double-chance',
                        selectionLabel: '1X',
                        homeScore: 1,
                        awayScore: 1,
                        eventStatus: 'settled',
                    }).status).toBe('won')
                })

                it('resolves Double Chance 1X as lost when away wins', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'double-chance',
                        selectionLabel: '1X',
                        homeScore: 0,
                        awayScore: 2,
                        eventStatus: 'settled',
                    }).status).toBe('lost')
                })

                it('resolves Double Chance X2 as won when away wins', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'double-chance',
                        selectionLabel: 'X2',
                        homeScore: 0,
                        awayScore: 2,
                        eventStatus: 'settled',
                    }).status).toBe('won')
                })

                it('resolves Double Chance 12 as lost when the match is drawn', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'double-chance',
                        selectionLabel: '12',
                        homeScore: 1,
                        awayScore: 1,
                        eventStatus: 'settled',
                    }).status).toBe('lost')
                })

                it('resolves Double Chance textual "Home or Draw" as won when the match is drawn', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'double-chance',
                        selectionLabel: 'Home or Draw',
                        homeScore: 0,
                        awayScore: 0,
                        eventStatus: 'settled',
                    }).status).toBe('won')
                })

                it('resolves Double Chance textual "Draw or Away" as won when away wins', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'double-chance',
                        selectionLabel: 'Draw or Away',
                        homeScore: 1,
                        awayScore: 3,
                        eventStatus: 'settled',
                    }).status).toBe('won')
                })

                it('resolves Double Chance textual "Home or Away" as lost when the match is drawn', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'double-chance',
                        selectionLabel: 'Home or Away',
                        homeScore: 2,
                        awayScore: 2,
                        eventStatus: 'settled',
                    }).status).toBe('lost')
                })

                it('voids Draw No Bet when the match is drawn', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'draw-no-bet',
                        selectionLabel: 'Home',
                        homeScore: 1,
                        awayScore: 1,
                        eventStatus: 'settled',
                    }).status).toBe('void')
                })

                it('resolves Draw No Bet home as won when home wins', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'draw-no-bet',
                        selectionLabel: 'Home',
                        homeScore: 3,
                        awayScore: 1,
                        eventStatus: 'settled',
                    }).status).toBe('won')
                })

                it('resolves Draw No Bet home as lost when away wins', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'draw-no-bet',
                        selectionLabel: 'Home',
                        homeScore: 1,
                        awayScore: 2,
                        eventStatus: 'settled',
                    }).status).toBe('lost')
                })

                it('resolves Odd/Even Odd as won when the combined total is odd', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'odd-even',
                        selectionLabel: 'Odd',
                        homeScore: 2,
                        awayScore: 1,
                        eventStatus: 'settled',
                    }).status).toBe('won')
                })

                it('resolves Odd/Even Even as won when the combined total is even', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'odd-even',
                        selectionLabel: 'Even',
                        homeScore: 2,
                        awayScore: 2,
                        eventStatus: 'settled',
                    }).status).toBe('won')
                })

                it('resolves Odd/Even Odd as lost when the combined total is even', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'odd-even',
                        selectionLabel: 'Odd',
                        homeScore: 1,
                        awayScore: 1,
                        eventStatus: 'settled',
                    }).status).toBe('lost')
                })

                it('treats an Odd/Even label prefixed with Total Goals without misrouting to totals', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'total goals odd/even',
                        selectionLabel: 'Even',
                        homeScore: 1,
                        awayScore: 1,
                        eventStatus: 'settled',
                    }).status).toBe('won')
                })

                it('resolves Home Clean Sheet as won when the away team fails to score', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'clean-sheet',
                        selectionLabel: 'Home',
                        homeScore: 2,
                        awayScore: 0,
                        eventStatus: 'settled',
                    }).status).toBe('won')
                })

                it('resolves Home Clean Sheet as lost when the away team scores', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'clean-sheet',
                        selectionLabel: 'Home',
                        homeScore: 2,
                        awayScore: 1,
                        eventStatus: 'settled',
                    }).status).toBe('lost')
                })

                it('resolves Away Clean Sheet as won when the home team is blanked', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'clean-sheet',
                        selectionLabel: 'Away',
                        homeScore: 0,
                        awayScore: 1,
                        eventStatus: 'settled',
                    }).status).toBe('won')
                })

                it('resolves Clean Sheet No as won when the team concedes', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'clean-sheet',
                        selectionLabel: 'Home No',
                        homeScore: 1,
                        awayScore: 2,
                        eventStatus: 'settled',
                    }).status).toBe('won')
                })

                it('resolves Home Win to Nil as won when home wins without conceding', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'win-to-nil',
                        selectionLabel: 'Home',
                        homeScore: 2,
                        awayScore: 0,
                        eventStatus: 'settled',
                    }).status).toBe('won')
                })

                it('resolves Home Win to Nil as lost when home wins but concedes', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'win-to-nil',
                        selectionLabel: 'Home',
                        homeScore: 2,
                        awayScore: 1,
                        eventStatus: 'settled',
                    }).status).toBe('lost')
                })

                it('resolves Home Win to Nil as lost when home does not win', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'win-to-nil',
                        selectionLabel: 'Home',
                        homeScore: 0,
                        awayScore: 1,
                        eventStatus: 'settled',
                    }).status).toBe('lost')
                })

                it('resolves Away Win to Nil as won when away wins without conceding', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'win-to-nil',
                        selectionLabel: 'Away',
                        homeScore: 0,
                        awayScore: 3,
                        eventStatus: 'settled',
                    }).status).toBe('won')
                })

                it('resolves Home Team Total Over as won when the home team beats the line', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'home-total-goals',
                        selectionLabel: 'Home Over 1.5',
                        homeScore: 2,
                        awayScore: 1,
                        eventStatus: 'settled',
                    }).status).toBe('won')
                })

                it('resolves Home Team Total Over as lost when the home team misses the line', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'home-total-goals',
                        selectionLabel: 'Home Over 1.5',
                        homeScore: 1,
                        awayScore: 3,
                        eventStatus: 'settled',
                    }).status).toBe('lost')
                })

                it('resolves Away Team Total Under as won when the away team stays below the line', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'away-total-goals',
                        selectionLabel: 'Away Under 1.5',
                        homeScore: 3,
                        awayScore: 1,
                        eventStatus: 'settled',
                    }).status).toBe('won')
                })

                it('voids a Team Total as a push when the team total equals an integer line', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'home-total-goals',
                        selectionLabel: 'Home Over 2',
                        homeScore: 2,
                        awayScore: 0,
                        eventStatus: 'settled',
                    }).status).toBe('void')
                })

                it('uses only the named team score, not the combined total, for a Team Total', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'away-total-goals',
                        selectionLabel: 'Away Over 2.5',
                        homeScore: 5,
                        awayScore: 1,
                        eventStatus: 'settled',
                    }).status).toBe('lost')
                })

                it('resolves Result & BTTS "Home & Yes" as won when home wins and both teams score', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'result-both-teams-to-score',
                        marketLabel: 'Result & Both Teams To Score',
                        selectionLabel: 'Home & Yes',
                        homeScore: 2,
                        awayScore: 1,
                        eventStatus: 'settled',
                    }).status).toBe('won')
                })

                it('resolves Result & BTTS "Home & Yes" as lost when home wins but the away team is blanked', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'result-both-teams-to-score',
                        marketLabel: 'Result & Both Teams To Score',
                        selectionLabel: 'Home & Yes',
                        homeScore: 2,
                        awayScore: 0,
                        eventStatus: 'settled',
                    }).status).toBe('lost')
                })

                it('resolves Result & BTTS "Home & No" as won when home wins to nil', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'result-both-teams-to-score',
                        marketLabel: 'Result & Both Teams To Score',
                        selectionLabel: 'Home & No',
                        homeScore: 2,
                        awayScore: 0,
                        eventStatus: 'settled',
                    }).status).toBe('won')
                })

                it('resolves Result & BTTS "Draw & Yes" as won when the match is a scoring draw', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'result-both-teams-to-score',
                        marketLabel: 'Result & Both Teams To Score',
                        selectionLabel: 'Draw & Yes',
                        homeScore: 1,
                        awayScore: 1,
                        eventStatus: 'settled',
                    }).status).toBe('won')
                })

                it('resolves Result & BTTS "Draw & No" as won on a goalless draw', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'result-both-teams-to-score',
                        marketLabel: 'Result & Both Teams To Score',
                        selectionLabel: 'Draw & No',
                        homeScore: 0,
                        awayScore: 0,
                        eventStatus: 'settled',
                    }).status).toBe('won')
                })

                it('resolves Result & BTTS "Away & Yes" as won when away wins and both teams score', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'result-both-teams-to-score',
                        marketLabel: 'Result & Both Teams To Score',
                        selectionLabel: 'Away & Yes',
                        homeScore: 1,
                        awayScore: 3,
                        eventStatus: 'settled',
                    }).status).toBe('won')
                })

                it('resolves Result & BTTS "Away & Yes" as lost when the result side is wrong', () => {
                    expect(resolveSelectionFromScore({
                        marketType: 'result-both-teams-to-score',
                        marketLabel: 'Result & Both Teams To Score',
                        selectionLabel: 'Away & Yes',
                        homeScore: 2,
                        awayScore: 1,
                        eventStatus: 'settled',
                    }).status).toBe('lost')
                })
            })
        })

        describe('settleTicketByEventResults', () => {
            it('pays singles by splitting stake per leg and multiplying winning legs by odds', () => {
                const result = settleTicketByEventResults({
                    selections: [
                        { selectionId: 'a', odds: 2, status: 'won' },
                        { selectionId: 'b', odds: 3, status: 'lost' },
                    ],
                    stake: 20,
                    mode: BET_MODES.SINGLES,
                })
                expect(result.payout).toBe(20)
                expect(result.profit).toBe(0)
                expect(result.result).toBe('push')
            })

            it('pays singles with two winners at full stake-per-leg rate', () => {
                const result = settleTicketByEventResults({
                    selections: [
                        { selectionId: 'a', odds: 2, status: 'won' },
                        { selectionId: 'b', odds: 3, status: 'won' },
                    ],
                    stake: 20,
                    mode: BET_MODES.SINGLES,
                })
                expect(result.payout).toBe(50)
                expect(result.profit).toBe(30)
                expect(result.result).toBe('win')
            })

            it('treats void legs as odds 1 in a multi bet', () => {
                const result = settleTicketByEventResults({
                    selections: [
                        { selectionId: 'a', odds: 2, status: 'won' },
                        { selectionId: 'b', odds: 3, status: 'void' },
                    ],
                    stake: 10,
                    mode: BET_MODES.MULTI,
                })
                expect(result.payout).toBe(20)
                expect(result.profit).toBe(10)
                expect(result.result).toBe('win')
            })

            it('returns zero payout when a multi leg is lost', () => {
                const result = settleTicketByEventResults({
                    selections: [
                        { selectionId: 'a', odds: 2, status: 'won' },
                        { selectionId: 'b', odds: 3, status: 'lost' },
                    ],
                    stake: 10,
                    mode: BET_MODES.MULTI,
                })
                expect(result.payout).toBe(0)
                expect(result.profit).toBe(-10)
                expect(result.result).toBe('loss')
            })

            it('pays system-2 combos only where both legs are non-lost without a winner divisor', () => {
                const result = settleTicketByEventResults({
                    selections: [
                        { selectionId: 'a', acceptedOdds: 2, currentOdds: 20, status: 'won' },
                        { selectionId: 'b', acceptedOdds: 3, currentOdds: 30, status: 'lost' },
                        { selectionId: 'c', acceptedOdds: 4, currentOdds: 40, status: 'won' },
                    ],
                    stake: 30,
                    mode: BET_MODES.SYSTEM_2,
                })
                expect(result.payout).toBe(80)
                expect(result.profit).toBe(50)
                expect(result.result).toBe('win')
                expect(result.combinationDetails.map(detail => detail.id)).toEqual([
                    'system-2:a+b',
                    'system-2:a+c',
                    'system-2:b+c',
                ])
                expect(result.combinationDetails[1]).toMatchObject({
                    rawStake: 10,
                    rawSettledReturn: 80,
                    settledReturn: 80,
                    status: 'settled',
                })
            })

            it('returns loss when no system-2 combo has two non-lost legs', () => {
                const result = settleTicketByEventResults({
                    selections: [
                        { selectionId: 'a', odds: 2, status: 'lost' },
                        { selectionId: 'b', odds: 3, status: 'lost' },
                        { selectionId: 'c', odds: 4, status: 'won' },
                    ],
                    stake: 30,
                    mode: BET_MODES.SYSTEM_2,
                })
                expect(result.payout).toBe(0)
                expect(result.profit).toBe(-30)
                expect(result.result).toBe('loss')
            })

            it('applies pending, full-void, push, win, and partial precedence', () => {
                const pending = settleTicketByEventResults({
                    selections: [
                        { selectionId: 'a', acceptedOdds: 2, status: 'pending' },
                        { selectionId: 'b', acceptedOdds: 3, status: 'won' },
                        { selectionId: 'c', acceptedOdds: 4, status: 'lost' },
                    ],
                    stake: 30,
                    mode: BET_MODES.SYSTEM_2,
                })
                expect(pending.result).toBe('pending')

                const fullVoid = settleTicketByEventResults({
                    selections: [
                        { selectionId: 'a', acceptedOdds: 2, status: 'void' },
                        { selectionId: 'b', acceptedOdds: 3, status: 'void' },
                    ],
                    stake: 10,
                    mode: BET_MODES.MULTI,
                })
                expect(fullVoid).toMatchObject({ payout: 10, result: 'full-void' })

                const push = settleTicketByEventResults({
                    selections: [
                        { selectionId: 'a', acceptedOdds: 2, status: 'won' },
                        { selectionId: 'b', acceptedOdds: 3, status: 'lost' },
                    ],
                    stake: 20,
                    mode: BET_MODES.SINGLES,
                })
                expect(push.result).toBe('push')

                const partial = settleTicketByEventResults({
                    selections: [
                        { selectionId: 'a', acceptedOdds: 1.5, status: 'won' },
                        { selectionId: 'b', acceptedOdds: 3, status: 'lost' },
                    ],
                    stake: 20,
                    mode: BET_MODES.SINGLES,
                })
                expect(partial).toMatchObject({ payout: 15, result: 'partial' })
            })

            it('keeps unsupported markets and canonical lookup misses pending', () => {
                const unsupported = settleTicketByEventResults({
                    selections: [{
                        selectionId: 'a',
                        canonicalEventId: 'canonical-a',
                        eventId: 'legacy-a',
                        marketId: 'correct-score',
                        label: '1-0',
                        acceptedOdds: 4,
                    }],
                    stake: 10,
                    mode: BET_MODES.SINGLES,
                    eventResults: {
                        'legacy-a': { eventId: 'legacy-a', status: 'settled', homeScore: 1, awayScore: 0 },
                    },
                })
                expect(unsupported).toMatchObject({ status: 'pending', result: 'pending' })
                expect(unsupported.legs[0].reason).toBe('unsupported-market')
            })
        })
    })

    describe('formatOdds', () => {
        it('returns decimal odds rounded to two places by default', () => {
            expect(formatOdds(2.5)).toBe('2.50')
            expect(formatOdds(1.9, 'decimal')).toBe('1.90')
        })

        it('converts decimal odds at/above evens to positive american odds', () => {
            expect(formatOdds(2, 'american')).toBe('+100')
            expect(formatOdds(2.5, 'american')).toBe('+150')
            expect(formatOdds(3.4, 'american')).toBe('+240')
        })

        it('converts decimal odds below evens to negative american odds', () => {
            expect(formatOdds(1.5, 'american')).toBe('-200')
            expect(formatOdds(1.8, 'american')).toBe('-125')
        })

        it('converts decimal odds to reduced fractional odds', () => {
            expect(formatOdds(2.5, 'fractional')).toBe('3/2')
            expect(formatOdds(2, 'fractional')).toBe('1/1')
            expect(formatOdds(1.5, 'fractional')).toBe('1/2')
        })

        it('returns a safe dash for invalid odds', () => {
            expect(formatOdds(1, 'american')).toBe('—')
            expect(formatOdds(0, 'decimal')).toBe('—')
            expect(formatOdds(Number.NaN, 'fractional')).toBe('—')
        })
    })

    describe('valueSimulatedCashout', () => {
        it('cashes out a real adapter ticket with canonical identity invariant to provider event IDs', () => {
            const adapterFixture = providerEventId => normalizeSportsGameOddsEvent({
                eventID: providerEventId,
                sportID: 'BASKETBALL',
                leagueID: 'Journey League',
                teams: { home: { names: { long: 'Home' } }, away: { names: { long: 'Away' } } },
                status: { startsAt: '2026-09-04T17:00:00.000Z', started: false, ended: false },
                odds: {
                    'points-home-game-ml-home': { byBookmaker: { 'Journey Book': { odds: '2', available: true, lastUpdated: '2026-09-03T12:00:00.000Z' } } },
                    'points-away-game-ml-away': { byBookmaker: { 'Journey Book': { odds: '2', available: true, lastUpdated: '2026-09-03T12:00:00.000Z' } } },
                },
            }, { generatedAt: '2026-09-03T12:01:00.000Z' })
            const event = adapterFixture('adapter-original')
            const offer = event.offers.find(candidate => candidate.outcome === 'home')
            const selection = makeBetSlipSelection({ event, selection: offer })
            const ticket = createPracticeTicket({ selections: [selection], stake: 10, seed: 7 })
            const valuation = valueSimulatedCashout({ ticket, events: [event] })
            const cashed = cashOutTicket(ticket, valuation, 8)

            expect(event.canonicalEventId).toBe(event.id)
            expect(offer.canonicalEventId).toBe(event.id)
            expect(selection.canonicalEventId).toBe(event.id)
            expect(valuation).toMatchObject({ available: true, amount: 7.8 })
            expect(valuation.observationFingerprint).toContain('cashout-observation-v1')
            expect(valuation.valuationFingerprint).toContain('cashout-valuation-v1')
            expect(cashed).toMatchObject({ status: 'cashed_out', result: 'cashed_out' })
            expect(cashed.settlementKey).toContain(valuation.valuationFingerprint)

            const refreshed = adapterFixture('refreshed-id')
            const refreshedValuation = valueSimulatedCashout({ ticket, events: [refreshed] })
            expect(refreshed.canonicalEventId).toBe(event.id)
            expect(refreshed.sourceRefs).toEqual([{ provider: 'sportsgameodds', eventId: 'refreshed-id' }])
            expect(refreshedValuation.amount).toBe(valuation.amount)
            expect(refreshedValuation.observationFingerprint).toBe(valuation.observationFingerprint)
            expect(refreshedValuation.valuationFingerprint).toBe(valuation.valuationFingerprint)
            expect(cashOutTicket(ticket, refreshedValuation, 8)).toMatchObject({ status: 'cashed_out', result: 'cashed_out' })
        })

        function cashoutFixture(overrides = {}) {
            const selection = {
                id: 'home', selectionId: 'home', canonicalEventId: 'event', eventId: 'provider-event', marketId: 'winner',
                outcome: 'home', side: 'home', acceptedOdds: 2, bookmaker: 'Book', provider: 'Provider',
                providerEventId: 'provider-event', sourceContext: { group: 'odds', nested: { b: 2, a: 1 } },
            }
            const combination = { id: 'singles:home', mode: 'singles', selectionIds: ['home'], rawStake: 10 }
            const ticket = {
                id: 'ticket', status: 'active', mode: 'singles', stake: 10, acceptedAt: 1,
                selections: [selection], legs: [{ selectionId: 'home', canonicalEventId: 'event', marketId: 'winner', status: 'pending', reason: 'pending' }],
                combinationDetails: [combination], quote: { combinationDetails: [structuredClone(combination)] },
                ...overrides,
            }
            const offer = (outcome, decimalOdds, extra = {}) => ({
                id: outcome, canonicalEventId: 'event', marketId: 'winner', outcome, decimalOdds,
                bookmaker: 'Book', provider: 'Provider', providerEventId: 'provider-event',
                sourceContext: { nested: { a: 1, b: 2 }, group: 'odds' }, observedAt: '2026-09-03T12:00:00.000Z',
                freshness: 'current', submittable: true, ineligibilityReason: null, suspended: false, ...extra,
            })
            return { ticket, events: [{ canonicalEventId: 'event', clock: '10:00', offers: [offer('home', 2), offer('away', 2)] }], offer }
        }

        it('uses complete same-bookmaker de-vig probability and the literal haircut once', () => {
            const { ticket, events } = cashoutFixture()
            const result = valueSimulatedCashout({ ticket, events })
            expect(SIMULATED_CASHOUT_HAIRCUT).toBe(0.78)
            expect(result).toMatchObject({ available: true, fairCurrentValue: 10, amount: 7.8, currency: 'GC', label: 'Simulated cash-out', reason: null })
            expect(result.legProbabilities).toEqual([{ selectionId: 'home', probability: 0.5, bookmaker: 'Book', provider: 'Provider', observedAt: '2026-09-03T12:00:00.000Z' }])
            expect(result.combinationValues).toEqual([{ id: 'singles:home', rawStake: 10, rawCurrentValue: 10 }])
            expect(result.observationFingerprint).toContain('cashout-observation-v1')
            expect(result.valuationFingerprint).toContain('cashout-valuation-v1')
        })

        it('responds monotonically to current probability and ignores age, clocks, key order, and unmatched offers', () => {
            const base = cashoutFixture()
            const first = valueSimulatedCashout(base)
            const changed = cashoutFixture({ acceptedAt: 999999 })
            changed.events[0].clock = '89:59'
            changed.events[0].offers.push(changed.offer('home', 9, { bookmaker: 'Other' }))
            expect(valueSimulatedCashout(changed)).toEqual(first)
            const rising = cashoutFixture()
            rising.events[0].offers[0].decimalOdds = 1.5
            rising.events[0].offers[1].decimalOdds = 3
            expect(valueSimulatedCashout(rising)).toMatchObject({ fairCurrentValue: 13.333333333333332, amount: 10.4 })
        })

        it('ignores provider event ID drift in cohort matching and fingerprints', () => {
            const base = cashoutFixture()
            const expected = valueSimulatedCashout(base)
            base.events[0].offers.forEach(offer => { offer.providerEventId = `changed-${offer.providerEventId}` })
            base.ticket.selections[0].providerEventId = 'changed-selection-provider-event'
            expect(valueSimulatedCashout(base)).toEqual(expected)
        })

        it('canonicalizes only pending leg reasons in valuation fingerprints', () => {
            const base = cashoutFixture()
            const pendingFingerprint = valueSimulatedCashout(base).valuationFingerprint
            base.ticket.legs[0].reason = 'event-not-settled'
            expect(valueSimulatedCashout(base).valuationFingerprint).toBe(pendingFingerprint)

            const changedStatus = cashoutFixture()
            changedStatus.ticket.legs[0] = { ...changedStatus.ticket.legs[0], status: 'won', reason: 'winner' }
            const wonFingerprint = valueSimulatedCashout(changedStatus).valuationFingerprint
            expect(wonFingerprint).not.toBe(pendingFingerprint)
            changedStatus.ticket.legs[0].reason = 'total'
            expect(valueSimulatedCashout(changedStatus).valuationFingerprint).not.toBe(wonFingerprint)

            for (const mutate of [
                value => { value.ticket.selections[0].acceptedOdds = 3 },
                value => {
                    value.ticket.selections[0].canonicalEventId = 'changed-event'
                    value.ticket.legs[0].canonicalEventId = 'changed-event'
                    value.events[0].canonicalEventId = 'changed-event'
                    value.events[0].offers.forEach(offer => { offer.canonicalEventId = 'changed-event' })
                },
                value => {
                    value.ticket.combinationDetails[0].id = 'changed-combination'
                    value.ticket.quote.combinationDetails[0].id = 'changed-combination'
                },
                value => { value.ticket.selections[0].sourceContext = { group: 'changed' }; value.events[0].offers.forEach(offer => { offer.sourceContext = { group: 'changed' } }) },
                value => { value.events[0].offers[0].decimalOdds = 1.5; value.events[0].offers[1].decimalOdds = 3 },
            ]) {
                const changed = cashoutFixture()
                mutate(changed)
                const valuation = valueSimulatedCashout(changed)
                expect(valuation.valuationFingerprint).not.toBe(pendingFingerprint)
            }

            const valueChange = cashoutFixture()
            valueChange.events[0].offers[0].decimalOdds = 1.5
            valueChange.events[0].offers[1].decimalOdds = 3
            const changedValue = valueSimulatedCashout(valueChange)
            expect(changedValue.observationFingerprint).not.toBe(valueSimulatedCashout(cashoutFixture()).observationFingerprint)
            expect(changedValue.fairCurrentValue).not.toBe(10)
            expect(changedValue.amount).not.toBe(7.8)
        })

        it('values multi settled factors and authoritative system combinations without intermediate rounding', () => {
            const first = cashoutFixture()
            const second = cashoutFixture()
            second.ticket.selections[0] = { ...second.ticket.selections[0], id: 'away-2', selectionId: 'away-2', canonicalEventId: 'event-2', eventId: 'provider-event-2', providerEventId: 'provider-event-2', acceptedOdds: 3, outcome: 'home', side: 'home' }
            second.ticket.legs[0] = { selectionId: 'away-2', canonicalEventId: 'event-2', marketId: 'winner', status: 'pending', reason: 'pending' }
            second.events[0] = { canonicalEventId: 'event-2', offers: [second.offer('home', 2.5, { canonicalEventId: 'event-2', providerEventId: 'provider-event-2' }), second.offer('away', 1.6666666666666667, { canonicalEventId: 'event-2', providerEventId: 'provider-event-2' })] }
            const ticket = { ...first.ticket, mode: 'multi', selections: [...first.ticket.selections, ...second.ticket.selections], legs: [...first.ticket.legs, ...second.ticket.legs] }
            ticket.combinationDetails = [{ id: 'multi:home+away-2', mode: 'multi', selectionIds: ['home', 'away-2'], rawStake: 10 }]
            ticket.quote = { combinationDetails: structuredClone(ticket.combinationDetails) }
            const pending = valueSimulatedCashout({ ticket, events: [...first.events, ...second.events] })
            expect(pending.fairCurrentValue).toBeCloseTo(12)
            expect(pending.amount).toBe(9.36)
            ticket.legs[0] = { ...ticket.legs[0], status: 'won', reason: 'winner' }
            const won = valueSimulatedCashout({ ticket, events: second.events })
            expect(won.fairCurrentValue).toBeCloseTo(24)
            expect(won.amount).toBe(18.72)
            ticket.legs[0] = { ...ticket.legs[0], status: 'void', reason: 'push' }
            const voided = valueSimulatedCashout({ ticket, events: second.events })
            expect(voided.fairCurrentValue).toBeCloseTo(12)
            expect(voided.amount).toBe(9.36)
        })

        it.each([
            [null, 'ticket-ineligible'],
            [{ status: 'settled' }, 'ticket-terminal'],
            [{ legs: [{ selectionId: 'home', canonicalEventId: 'event', marketId: 'winner', status: 'lost', reason: 'winner' }] }, 'leg-lost'],
            [{ legs: [{ selectionId: 'home', canonicalEventId: 'event', marketId: 'winner', status: 'banana', reason: 'banana' }] }, 'unsupported-leg'],
        ])('returns exact unavailable reason precedence for ticket mutation %#', (mutation, reason) => {
            const { ticket, events } = cashoutFixture()
            const target = mutation === null ? null : { ...ticket, ...mutation }
            expect(valueSimulatedCashout({ ticket: target, events })).toMatchObject({ available: false, amount: null, reason, fairCurrentValue: null, legProbabilities: [], combinationValues: [], observationFingerprint: null, valuationFingerprint: null })
        })

        it('values the literal three-pending system-2 worked vector', () => {
            const first = cashoutFixture()
            const second = cashoutFixture()
            const third = cashoutFixture()
            const selections = [
                { ...first.ticket.selections[0], selectionId: 'a', id: 'a', acceptedOdds: 2 },
                { ...second.ticket.selections[0], selectionId: 'b', id: 'b', canonicalEventId: 'event-b', eventId: 'event-b', acceptedOdds: 2 },
                { ...third.ticket.selections[0], selectionId: 'c', id: 'c', canonicalEventId: 'event-c', eventId: 'event-c', acceptedOdds: 2 },
            ]
            const legs = [
                { selectionId: 'a', canonicalEventId: 'event', marketId: 'winner', status: 'pending', reason: 'pending' },
                { selectionId: 'b', canonicalEventId: 'event-b', marketId: 'winner', status: 'pending', reason: 'pending' },
                { selectionId: 'c', canonicalEventId: 'event-c', marketId: 'winner', status: 'pending', reason: 'pending' },
            ]
            const combinationDetails = [
                { id: 'system-2:a+b', mode: 'system-2', selectionIds: ['a', 'b'], rawStake: 10 },
                { id: 'system-2:a+c', mode: 'system-2', selectionIds: ['a', 'c'], rawStake: 10 },
                { id: 'system-2:b+c', mode: 'system-2', selectionIds: ['b', 'c'], rawStake: 10 },
            ]
            const ticket = { ...first.ticket, mode: 'system-2', stake: 30, selections, legs, combinationDetails, quote: { combinationDetails: structuredClone(combinationDetails) } }
            const events = [
                first.events[0],
                { canonicalEventId: 'event-b', offers: [second.offer('home', 2, { canonicalEventId: 'event-b' }), second.offer('away', 4 / 3, { canonicalEventId: 'event-b' })] },
                { canonicalEventId: 'event-c', offers: [third.offer('home', 4, { canonicalEventId: 'event-c' }), third.offer('away', 4 / 3, { canonicalEventId: 'event-c' })] },
            ]
            const result = valueSimulatedCashout({ ticket, events })
            expect(result.legProbabilities.map(({ probability }) => probability)).toEqual([0.5, 0.4, 0.25])
            expect(result.combinationValues.map(({ rawCurrentValue }) => rawCurrentValue)).toEqual([8, 5, 4])
            expect(result.fairCurrentValue).toBe(17)
            expect(SIMULATED_CASHOUT_HAIRCUT).toBe(0.78)
            expect(result.amount).toBe(13.26)
        })

        it('values the independent system-2 worked vector with won, void, and pending legs', () => {
            const first = cashoutFixture()
            const second = cashoutFixture()
            const third = cashoutFixture()
            const selections = [
                { ...first.ticket.selections[0], selectionId: 'a', id: 'a', acceptedOdds: 2 },
                { ...second.ticket.selections[0], selectionId: 'b', id: 'b', canonicalEventId: 'event-b', eventId: 'event-b', acceptedOdds: 2 },
                { ...third.ticket.selections[0], selectionId: 'c', id: 'c', canonicalEventId: 'event-c', eventId: 'event-c', acceptedOdds: 2 },
            ]
            const legs = [
                { selectionId: 'a', status: 'won', reason: 'winner' },
                { selectionId: 'b', status: 'void', reason: 'push' },
                { selectionId: 'c', status: 'pending', reason: 'pending' },
            ]
            const combinationDetails = [
                { id: 'system-2:a+b', mode: 'system-2', selectionIds: ['a', 'b'], rawStake: 10 },
                { id: 'system-2:a+c', mode: 'system-2', selectionIds: ['a', 'c'], rawStake: 10 },
                { id: 'system-2:b+c', mode: 'system-2', selectionIds: ['b', 'c'], rawStake: 10 },
            ]
            const ticket = { ...first.ticket, mode: 'system-2', stake: 30, selections, legs, combinationDetails, quote: { combinationDetails: structuredClone(combinationDetails) } }
            const events = [{ canonicalEventId: 'event-c', offers: [third.offer('home', 3, { canonicalEventId: 'event-c' }), third.offer('away', 1.5, { canonicalEventId: 'event-c' })] }]
            const result = valueSimulatedCashout({ ticket, events })
            expect(result.fairCurrentValue).toBeCloseTo(40)
            expect(result.amount).toBe(31.2)
            expect(result.combinationValues[0]).toEqual({ id: 'system-2:a+b', rawStake: 10, rawCurrentValue: 20 })
            expect(result.combinationValues[1].rawCurrentValue).toBeCloseTo(40 / 3)
            expect(result.combinationValues[2].rawCurrentValue).toBeCloseTo(20 / 3)
            ticket.legs[1] = { ...ticket.legs[1], status: 'lost', reason: 'winner' }
            expect(valueSimulatedCashout({ ticket, events })).toMatchObject({ available: false, amount: null, reason: 'leg-lost' })
        })

        it('applies full unavailable precedence for conflicting probability defects', () => {
            const { ticket, events, offer } = cashoutFixture()
            events[0].offers.push(offer('home', 1, { freshness: 'stale', suspended: true }))
            expect(valueSimulatedCashout({ ticket, events }).reason).toBe('probability-conflict')
            ticket.legs[0] = { ...ticket.legs[0], status: 'lost', reason: 'winner' }
            expect(valueSimulatedCashout({ ticket, events }).reason).toBe('leg-lost')
        })

        it('returns non-positive-value when coherent arithmetic underflows the currency boundary', () => {
            const { ticket, events } = cashoutFixture()
            ticket.stake = Number.MIN_VALUE
            ticket.combinationDetails[0].rawStake = Number.MIN_VALUE
            ticket.quote.combinationDetails[0].rawStake = Number.MIN_VALUE
            expect(valueSimulatedCashout({ ticket, events })).toMatchObject({ available: false, amount: null, reason: 'non-positive-value' })
        })

        it.each([
            ['probability-unmatched', events => { events[0].offers.forEach(item => { item.bookmaker = 'Other' }) }],
            ['probability-conflict', (events, offer) => { events[0].offers.push(offer('home', 2)) }],
            ['probability-stale', events => { events[0].offers[0].freshness = 'stale' }],
            ['probability-stale', events => { events[0].offers[0].freshness = 'unknown' }],
            ['probability-malformed', events => { events[0].offers[0].decimalOdds = 1 }],
            ['probability-malformed', events => { events[0].offers[0].suspended = true }],
            ['probability-malformed', events => { events[0].offers[0].bookmaker = null; events[0].offers[0].ineligibilityReason = 'model-estimate' }],
            ['probability-malformed', events => { Object.defineProperty(events[0].offers[0].sourceContext, 'group', { get: () => 'odds', configurable: true }) }],
            ['probability-incomplete', events => { events[0].offers.pop() }],
        ])('fails closed with %s', (reason, mutate) => {
            const { ticket, events, offer } = cashoutFixture()
            mutate(events, offer)
            expect(valueSimulatedCashout({ ticket, events }).reason).toBe(reason)
        })
    })

    describe('synthetic soccer fixtures settle every offered market deterministically', () => {
        const { events } = buildSyntheticSportsbookData('settlement-coverage')
        const soccer = events.find(event => event.sportId === 'soccer')

        it('offers the extended Stake-style soccer markets', () => {
            const marketIds = soccer.marketGroups.map(group => group.id)
            expect(marketIds).toEqual(expect.arrayContaining([
                'winner',
                'both-teams-to-score',
                'double-chance',
                'draw-no-bet',
                'clean-sheet',
                'win-to-nil',
                'home-total-goals',
                'away-total-goals',
                'result-both-teams-to-score',
                'correct-score',
                'odd-even',
            ]))
        })

        it('resolves a concrete won/lost/void status for every offered selection given a final score', () => {
            const eventResult = { id: soccer.id, status: 'settled', homeScore: 2, awayScore: 1 }
            const unresolved = []
            for (const group of soccer.marketGroups) {
                for (const selection of group.selections) {
                    const result = resolveSelectionFromScore({
                        marketType: group.id,
                        marketLabel: group.label,
                        selectionLabel: selection.label,
                        side: selection.side,
                        homeScore: eventResult.homeScore,
                        awayScore: eventResult.awayScore,
                        eventStatus: 'settled',
                    })
                    if (!['won', 'lost', 'void'].includes(result.status)) {
                        unresolved.push(`${group.id}:${selection.label}=${result.status}/${result.reason}`)
                    }
                }
            }
            expect(unresolved).toEqual([])
        })
    })
})
