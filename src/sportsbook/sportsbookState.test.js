import { describe, expect, it } from 'vitest'
import { BET_MODES, ODDS_POLICIES } from './sportsbookMath'
import { buildSyntheticSportsbookData } from './sportsbookData'
import {
    DEFAULT_BETSLIP_SETTINGS,
    acceptSelectionOdds,
    createPracticeTicket,
    deriveBetSlipStatus,
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
})
