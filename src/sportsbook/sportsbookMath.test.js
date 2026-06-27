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
    cashoutOffer,
} from './sportsbookMath'
import { buildSyntheticSportsbookData } from './sportsbookData'

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
                expect(result.result).toBe('partial')
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

            it('pays system-2 combos only where both legs are non-lost', () => {
                const result = settleTicketByEventResults({
                    selections: [
                        { selectionId: 'a', odds: 2, status: 'won' },
                        { selectionId: 'b', odds: 3, status: 'lost' },
                        { selectionId: 'c', odds: 4, status: 'won' },
                    ],
                    stake: 30,
                    mode: BET_MODES.SYSTEM_2,
                })
                expect(result.payout).toBe(40)
                expect(result.profit).toBe(10)
                expect(result.result).toBe('win')
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

    describe('cashoutOffer', () => {
        const baseTicket = {
            status: 'active',
            stake: 10,
            quote: { estimatedPayout: 100 },
            acceptedAt: 1_000,
            legs: [{ selectionId: 'a', status: 'pending' }],
        }

        it('offers a haircut value for active tickets with no settled-loss legs', () => {
            const offer = cashoutOffer(baseTicket, 1_000)
            expect(offer).toBeGreaterThan(0)
            expect(offer).toBeLessThan(baseTicket.quote.estimatedPayout)
        })

        it('also offers cash-out for accepted tickets', () => {
            const offer = cashoutOffer({ ...baseTicket, status: 'accepted' }, 1_000)
            expect(offer).toBeGreaterThan(0)
        })

        it('returns zero when any leg has already lost', () => {
            const ticket = { ...baseTicket, legs: [{ selectionId: 'a', status: 'lost' }, { selectionId: 'b', status: 'pending' }] }
            expect(cashoutOffer(ticket, 1_000)).toBe(0)
        })

        it('returns zero for settled or non-live tickets', () => {
            expect(cashoutOffer({ ...baseTicket, status: 'settled' }, 1_000)).toBe(0)
            expect(cashoutOffer({ ...baseTicket, status: 'cashed_out' }, 1_000)).toBe(0)
            expect(cashoutOffer(null, 1_000)).toBe(0)
        })

        it('reduces the offer as the ticket ages toward settlement', () => {
            const fresh = cashoutOffer(baseTicket, 1_000)
            const older = cashoutOffer(baseTicket, 1_000 + 60_000)
            expect(older).toBeGreaterThan(fresh)
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
