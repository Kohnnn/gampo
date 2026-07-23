import { describe, expect, it } from 'vitest'
import { BET_MODES, ODDS_POLICIES, cashoutOffer } from './sportsbookMath'
import { buildSyntheticSportsbookData, modelBoardWindow } from './sportsbookData'
import {
    DEFAULT_BETSLIP_SETTINGS,
    acceptSelectionOdds,
    cashOutTicket,
    createPracticeTicket,
    deriveBetSlipStatus,
    makeBetSlipSelection,
    settlePracticeTicket,
    syncSelectionsWithEvents,
    toggleSelection,
    validateTicket,
} from './sportsbookState'

const event = {
    id: 'event-1',
    sportId: 'soccer',
    leagueId: 'league-1',
    home: 'Home FC',
    away: 'Away FC',
    marketGroups: [{
        id: 'winner',
        label: '1x2',
        selections: [
            {
                id: 'sel-home',
                eventId: 'event-1',
                marketId: 'winner',
                label: 'Home FC',
                decimalOdds: 2,
                trueProbability: 0.52,
                suspended: false,
                boosted: false,
            },
            {
                id: 'sel-away',
                eventId: 'event-1',
                marketId: 'winner',
                label: 'Away FC',
                decimalOdds: 3,
                trueProbability: 0.33,
                suspended: true,
                boosted: false,
            },
        ],
    }],
}

describe('model board generation', () => {
    it('builds reproducible real-world practice fixtures with valid selections', () => {
        const window = modelBoardWindow(Date.UTC(2026, 6, 23, 14, 45))
        const first = buildSyntheticSportsbookData(window)
        const second = buildSyntheticSportsbookData(window)

        expect(window).toBe('2026-07-23T14')
        expect(first.events).toEqual(second.events)
        expect(first.events).not.toHaveLength(0)
        expect(first.events.every(event => event.home !== event.away)).toBe(true)
        expect(first.events.some(event => event.home === 'Manchester City' && event.away === 'Liverpool')).toBe(true)
        expect(first.events.every(event => event.oddsMode === 'model' && event.tags.includes('model-priced'))).toBe(true)
        expect(first.events.flatMap(event => event.marketGroups).flatMap(group => group.selections).every(selection => Number.isFinite(selection.decimalOdds) && selection.decimalOdds > 1)).toBe(true)
    })
})

describe('sportsbookState', () => {
    it('selects and removes available prices while ignoring suspended prices', () => {
        const selected = toggleSelection([], [event], 'sel-home')
        expect(selected).toHaveLength(1)
        expect(selected[0].acceptedOdds).toBe(2)

        expect(toggleSelection(selected, [event], 'sel-home')).toHaveLength(0)
        expect(toggleSelection([], [event], 'sel-away')).toHaveLength(0)
    })

    it('syncs selected prices when odds move and supports manual acceptance', () => {
        const selected = toggleSelection([], [event], 'sel-home')
        const movedEvent = {
            ...event,
            marketGroups: [{
                ...event.marketGroups[0],
                selections: [{ ...event.marketGroups[0].selections[0], decimalOdds: 1.9 }],
            }],
        }
        const synced = syncSelectionsWithEvents(selected, [movedEvent])
        expect(synced[0].oddsChanged).toBe(true)
        expect(synced[0].status).toBe('odds-down')

        const accepted = acceptSelectionOdds(synced)
        expect(accepted[0].acceptedOdds).toBe(1.9)
        expect(accepted[0].oddsChanged).toBe(false)
    })

    it('validates stake, balance, suspended selections, and odds policy', () => {
        const selected = toggleSelection([], [event], 'sel-home')
        expect(validateTicket({ selections: [], stake: 10, balance: 100 }).valid).toBe(false)
        expect(validateTicket({ selections: selected, stake: 0, balance: 100 }).valid).toBe(false)
        expect(validateTicket({ selections: selected, stake: 101, balance: 100 }).valid).toBe(false)
        expect(validateTicket({ selections: selected, stake: 10, balance: 100, settings: DEFAULT_BETSLIP_SETTINGS }).valid).toBe(true)

        const worseOdds = [{ ...selected[0], currentOdds: 1.8, oddsChanged: true }]
        expect(validateTicket({
            selections: worseOdds,
            stake: 10,
            balance: 100,
            settings: { order: 'singles-first', oddsPolicy: ODDS_POLICIES.ACCEPT_HIGHER },
        }).needsManualAccept).toBe(true)
    })

    it('derives betslip statuses and creates deterministic settled tickets', () => {
        const selected = toggleSelection([], [event], 'sel-home')
        expect(deriveBetSlipStatus({ selections: [], stake: 10 })).toBe('empty')
        expect(deriveBetSlipStatus({ selections: selected, stake: 0 })).toBe('needs-stake')
        expect(deriveBetSlipStatus({ selections: selected, stake: 10, settings: DEFAULT_BETSLIP_SETTINGS })).toBe('ready')

        const ticket = createPracticeTicket({
            selections: selected,
            stake: 10,
            mode: BET_MODES.SINGLES,
            settings: DEFAULT_BETSLIP_SETTINGS,
            seed: 'state-test',
        })
        const settled = settlePracticeTicket(ticket, 'state-test')
        expect(settled.status).toBe('settled')
        expect(settled.legs).toHaveLength(1)
        expect(Number.isFinite(settled.profit)).toBe(true)
    })

    it('uses the same selection identity for sportsbook home top matches', () => {
        const { events } = buildSyntheticSportsbookData('qa-v2-top-match')
        const topEvent = events.find(item => item.tags?.includes('top'))
        const selection = topEvent.marketGroups[0].selections.find(item => !item.suspended)
        const selected = toggleSelection([], events, selection.id)

        expect(selected).toHaveLength(1)
        expect(selected[0].selectionId).toBe(selection.id)
        expect(selected[0].eventId).toBe(topEvent.id)
        expect(toggleSelection(selected, events, selection.id)).toHaveLength(0)
    })

    describe('ticket lifecycle — RED (expected contract)', () => {
        const homeSelection = {
            id: 'sel-home',
            eventId: 'event-1',
            marketId: 'winner',
            label: 'Home FC',
            side: 'home',
            decimalOdds: 2,
            trueProbability: 0.52,
            suspended: false,
            boosted: false,
        }
        const awaySelection = {
            id: 'sel-away',
            eventId: 'event-1',
            marketId: 'winner',
            label: 'Away FC',
            side: 'away',
            decimalOdds: 3,
            trueProbability: 0.33,
            suspended: false,
            boosted: false,
        }
        const baseEvent = {
            id: 'event-1',
            sportId: 'soccer',
            leagueId: 'league-1',
            status: 'prematch',
            home: 'Home FC',
            away: 'Away FC',
            marketGroups: [{
                id: 'winner',
                label: '1x2',
                selections: [homeSelection, awaySelection],
            }],
        }

        it('makeBetSlipSelection snapshots side, parsed line, event labels, accepted/current odds, eventStatus, and supportedMarket', () => {
            const sel = makeBetSlipSelection({
                event: baseEvent,
                marketGroup: baseEvent.marketGroups[0],
                selection: homeSelection,
            })

            expect(sel.label).toBe('Home FC')
            expect(sel.eventLabel).toBe('Home FC - Away FC')
            expect(sel.acceptedOdds).toBe(2)
            expect(sel.currentOdds).toBe(2)
            expect(sel.marketLabel).toBe('1x2')

            expect(sel.side).toBe('home')
            expect(sel.eventStatus).toBe('prematch')
            expect(sel.supportedMarket).toBe(true)
        })

        it('makeBetSlipSelection parses line from handicap and total labels', () => {
            const spreadSelection = {
                id: 'sel-spread',
                eventId: 'event-1',
                marketId: 'spread',
                label: 'Home -0.5',
                side: 'home',
                decimalOdds: 1.9,
                trueProbability: 0.5,
                suspended: false,
                boosted: false,
            }
            const spreadEvent = {
                ...baseEvent,
                marketGroups: [{
                    id: 'spread',
                    label: 'Spread',
                    selections: [spreadSelection],
                }],
            }
            const sel = makeBetSlipSelection({
                event: spreadEvent,
                marketGroup: spreadEvent.marketGroups[0],
                selection: spreadSelection,
            })
            expect(sel.line).toBe(-0.5)
        })

        it('validateTicket rejects unsupported props/correct-score/racing-style markets', () => {
            const propsSel = {
                selectionId: 'sel-prop',
                eventId: 'event-1',
                marketId: 'props',
                acceptedOdds: 2.5,
                currentOdds: 2.5,
                label: 'Home guard 20+',
                eventLabel: 'Home FC - Away FC',
                marketLabel: 'Player Props',
                status: 'selected',
                oddsChanged: false,
                suspended: false,
            }
            const correctScoreSel = {
                selectionId: 'sel-cs',
                eventId: 'event-1',
                marketId: 'correct-score',
                acceptedOdds: 5,
                currentOdds: 5,
                label: '1-0',
                eventLabel: 'Home FC - Away FC',
                marketLabel: 'Correct Score',
                status: 'selected',
                oddsChanged: false,
                suspended: false,
            }
            const racingSel = {
                selectionId: 'sel-racing',
                eventId: 'event-2',
                marketId: 'fixed-win',
                acceptedOdds: 3,
                currentOdds: 3,
                label: 'Runner A',
                eventLabel: 'Race 1',
                marketLabel: 'Fixed Win',
                status: 'selected',
                sportId: 'horse-racing',
                oddsChanged: false,
                suspended: false,
            }

            expect(validateTicket({
                selections: [propsSel], stake: 10, balance: 100,
                settings: DEFAULT_BETSLIP_SETTINGS,
            }).valid).toBe(false)

            expect(validateTicket({
                selections: [correctScoreSel], stake: 10, balance: 100,
                settings: DEFAULT_BETSLIP_SETTINGS,
            }).valid).toBe(false)

            expect(validateTicket({
                selections: [racingSel], stake: 10, balance: 100,
                settings: DEFAULT_BETSLIP_SETTINGS,
            }).valid).toBe(false)
        })

        it('validateTicket rejects settled/cancelled/stale event selections before placement', () => {
            const settledEventSel = {
                selectionId: 'sel-settled',
                eventId: 'event-settled',
                marketId: 'winner',
                acceptedOdds: 2,
                currentOdds: 2,
                label: 'Home FC',
                eventLabel: 'Home FC - Away FC',
                status: 'selected',
                oddsChanged: false,
                suspended: false,
                eventStatus: 'settled',
            }
            const cancelledEventSel = {
                selectionId: 'sel-cancelled',
                eventId: 'event-cancelled',
                marketId: 'winner',
                acceptedOdds: 2,
                currentOdds: 2,
                label: 'Home FC',
                eventLabel: 'Home FC - Away FC',
                status: 'selected',
                oddsChanged: false,
                suspended: false,
                eventStatus: 'cancelled',
            }

            expect(validateTicket({
                selections: [settledEventSel], stake: 10, balance: 100,
                settings: DEFAULT_BETSLIP_SETTINGS,
            }).valid).toBe(false)

            expect(validateTicket({
                selections: [cancelledEventSel], stake: 10, balance: 100,
                settings: DEFAULT_BETSLIP_SETTINGS,
            }).valid).toBe(false)
        })

        it('existing insufficient balance and suspended market checks remain in effect', () => {
            const selected = toggleSelection([], [baseEvent], 'sel-home')
            expect(validateTicket({ selections: [], stake: 10, balance: 100 }).valid).toBe(false)
            expect(validateTicket({ selections: selected, stake: 0, balance: 100 }).valid).toBe(false)
            expect(validateTicket({ selections: selected, stake: 101, balance: 100 }).valid).toBe(false)
            expect(validateTicket({ selections: selected, stake: 10, balance: 100, settings: DEFAULT_BETSLIP_SETTINGS }).valid).toBe(true)

            const suspended = toggleSelection([], [{
                ...baseEvent,
                marketGroups: [{
                    ...baseEvent.marketGroups[0],
                    selections: [{ ...homeSelection, suspended: true }],
                }],
            }], 'sel-home')
            expect(suspended).toHaveLength(0)
        })

        it('createPracticeTicket returns status active with full lifecycle fields', () => {
            const selected = toggleSelection([], [baseEvent], 'sel-home')
            const ticket = createPracticeTicket({
                selections: selected,
                stake: 10,
                mode: BET_MODES.SINGLES,
                settings: DEFAULT_BETSLIP_SETTINGS,
                seed: 'lifecycle-test',
            })

            expect(ticket.status).toBe('active')
            expect(ticket.acceptedAt).toBeGreaterThan(0)
            expect(ticket.settledAt).toBeNull()
            expect(ticket.result).toBeNull()
            expect(ticket.payout).toBe(0)
            expect(ticket.profit).toBe(0)
            expect(ticket.payoutProcessed).toBe(false)
            expect(ticket.settlementKey).toBeNull()
            expect(ticket.legs).toBeDefined()
            expect(ticket.legs.length).toBeGreaterThan(0)
            ticket.legs.forEach(leg => {
                expect(leg.status).toBe('pending')
            })
        })

        it('live score updates do not settle active tickets while event status is live', () => {
            const selected = toggleSelection([], [baseEvent], 'sel-home')
            const ticket = createPracticeTicket({
                selections: selected,
                stake: 10,
                mode: BET_MODES.SINGLES,
                settings: DEFAULT_BETSLIP_SETTINGS,
                seed: 'live-event-test',
            })
            expect(ticket.status).toBe('active')

            const settled = settlePracticeTicket(ticket, 'live-seed')
            expect(settled.status).not.toBe('settled')
            expect(settled.result).toBeNull()
        })

        it('settled score updates settle the ticket with lifecycle fields', () => {
            const selected = toggleSelection([], [baseEvent], 'sel-home')
            const ticket = createPracticeTicket({
                selections: selected,
                stake: 10,
                mode: BET_MODES.SINGLES,
                settings: DEFAULT_BETSLIP_SETTINGS,
                seed: 'settled-event-test',
            })
            expect(ticket.status).toBe('active')

            const settled = settlePracticeTicket(ticket, 'settled-seed')
            expect(settled.status).toBe('settled')
            expect(settled.payoutProcessed).toBe(true)
            expect(settled.settlementKey).toBeTruthy()
            expect(settled.pending).toBeDefined()
            expect(settled.pending).toHaveLength(0)
        })

        it('rerunning settlement on the same ticket does not emit a second payout action', () => {
            const selected = toggleSelection([], [baseEvent], 'sel-home')
            const ticket = createPracticeTicket({
                selections: selected,
                stake: 10,
                mode: BET_MODES.SINGLES,
                settings: DEFAULT_BETSLIP_SETTINGS,
                seed: 'idempotent-test',
            })

            const settled1 = settlePracticeTicket(ticket, 'idem-seed')
            expect(settled1.payoutProcessed).toBe(true)

            const settled2 = settlePracticeTicket(settled1, 'idem-seed')
            expect(settled2.payout).toBe(settled1.payout)
            expect(settled2.payoutProcessed).toBe(true)
            expect(settled2.settlementKey).toBeTruthy()
        })
    })

    describe('cashOutTicket — RED (expected contract)', () => {
        const homeSelection = {
            id: 'sel-home',
            eventId: 'event-1',
            marketId: 'winner',
            label: 'Home FC',
            side: 'home',
            decimalOdds: 2,
            trueProbability: 0.52,
            suspended: false,
            boosted: false,
        }
        const baseEvent = {
            id: 'event-1',
            sportId: 'soccer',
            leagueId: 'league-1',
            status: 'live',
            home: 'Home FC',
            away: 'Away FC',
            marketGroups: [{
                id: 'winner',
                label: '1x2',
                selections: [homeSelection],
            }],
        }

        function makeActiveTicket(seed = 'cashout-test') {
            const selected = toggleSelection([], [baseEvent], 'sel-home')
            return createPracticeTicket({
                selections: selected,
                stake: 10,
                mode: BET_MODES.SINGLES,
                settings: DEFAULT_BETSLIP_SETTINGS,
                seed,
            })
        }

        it('cashes out an active ticket into status cashed_out with payout equal to the offer', () => {
            const ticket = makeActiveTicket('cashout-active')
            const now = ticket.acceptedAt + 10000
            const offer = cashoutOffer(ticket, now)
            expect(offer).toBeGreaterThan(0)

            const cashed = cashOutTicket(ticket, now)
            expect(cashed.status).toBe('cashed_out')
            expect(cashed.payout).toBe(offer)
            expect(cashed.profit).toBe(offer - ticket.stake)
            expect(cashed.settledAt).toBe(now)
            expect(cashed.payoutProcessed).toBe(true)
            expect(cashed.pending).toHaveLength(0)
        })

        it('is idempotent — cashing out an already cashed_out ticket is a no-op', () => {
            const ticket = makeActiveTicket('cashout-idem')
            const now = ticket.acceptedAt + 10000
            const cashed1 = cashOutTicket(ticket, now)
            const cashed2 = cashOutTicket(cashed1, now + 50000)
            expect(cashed2.status).toBe('cashed_out')
            expect(cashed2.payout).toBe(cashed1.payout)
            expect(cashed2.settledAt).toBe(cashed1.settledAt)
        })

        it('refuses to cash out a settled ticket and leaves it unchanged', () => {
            const ticket = makeActiveTicket('cashout-settled')
            const settled = settlePracticeTicket(ticket, 'settled-seed')
            expect(settled.status).toBe('settled')

            const result = cashOutTicket(settled, settled.settledAt + 10000)
            expect(result.status).toBe('settled')
            expect(result.payout).toBe(settled.payout)
        })

        it('refuses to cash out when the offer is zero (losing leg)', () => {
            const ticket = makeActiveTicket('cashout-zero')
            const losing = {
                ...ticket,
                legs: ticket.legs.map(leg => ({ ...leg, status: 'lost' })),
            }
            const now = ticket.acceptedAt + 10000
            expect(cashoutOffer(losing, now)).toBe(0)

            const result = cashOutTicket(losing, now)
            expect(result.status).toBe('active')
            expect(result.payout).toBe(0)
        })
    })
})
