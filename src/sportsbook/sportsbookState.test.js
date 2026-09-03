import { describe, expect, it } from 'vitest'
import { BET_MODES, ODDS_POLICIES, valueSimulatedCashout } from './sportsbookMath'
import { buildSyntheticSportsbookData, modelBoardWindow } from './sportsbookData'
import {
    DEFAULT_BETSLIP_SETTINGS,
    acceptSelectionOdds,
    cashOutTicket,
    createPracticeTicket,
    deriveBetSlipStatus,
    makeBetSlipSelection,
    settleActiveTicketsWithEvents,
    settlePracticeTicket,
    syncSelectionsWithEvents,
    toggleSelection as toggleCanonicalSelection,
    validateTicket,
} from './sportsbookState'

function offer(overrides = {}) {
    return {
        id: 'sel-home',
        canonicalEventId: 'canonical-1',
        marketId: 'winner',
        outcome: 'home',
        decimalOdds: 2,
        bookmaker: 'Book A',
        provider: 'provider-a',
        providerEventId: 'provider-event-1',
        sourceContext: { source: 'fixture' },
        observedAt: '2026-09-02T12:00:00.000Z',
        freshness: 'current',
        submittable: true,
        ineligibilityReason: null,
        suspended: false,
        ...overrides,
    }
}

function toggleSelection(betslipSelections, events, selectionId) {
    const canonicalEvents = events.map(item => item.offers ? item : {
        ...item,
        canonicalEventId: item.id,
        offers: item.marketGroups.flatMap(group => group.selections.map(selection => offer({
            ...selection,
            canonicalEventId: item.id,
            marketId: group.id,
            marketLabel: group.label,
            outcome: selection.side,
        }))),
    })
    return toggleCanonicalSelection(betslipSelections, canonicalEvents, selectionId)
}

function canonicalEvent(overrides = {}) {
    return {
        id: 'event-1',
        canonicalEventId: 'canonical-1',
        sportId: 'soccer',
        leagueId: 'league-1',
        status: 'prematch',
        home: 'Home FC',
        away: 'Away FC',
        offers: [offer()],
        modelEstimates: [offer({
            id: 'model-home',
            bookmaker: null,
            provider: 'model',
            providerEventId: 'model-event-1',
            submittable: false,
            ineligibilityReason: 'model-estimate',
        })],
        ...overrides,
    }
}

const event = canonicalEvent()

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
    it('selects only Phase 01 offers and snapshots provenance', () => {
        const selected = toggleSelection([], [event], 'sel-home')
        expect(selected).toHaveLength(1)
        expect(selected[0]).toMatchObject({
            selectionId: 'sel-home',
            canonicalEventId: 'canonical-1',
            acceptedOdds: 2,
            bookmaker: 'Book A',
            provider: 'provider-a',
            providerEventId: 'provider-event-1',
            freshness: 'current',
            submittable: true,
        })
        expect(toggleSelection([], [event], 'model-home')).toHaveLength(0)
        expect(toggleSelection(selected, [event], 'sel-home')).toHaveLength(0)
    })

    it('projects adapter-shaped offers to the exact accepted selection contract', () => {
        const selected = makeBetSlipSelection({
            event,
            selection: offer({
                source: 'sportsgameodds',
                previousOdds: 1.95,
                boosted: true,
                unrelatedExtra: 'drop',
            }),
            stake: 7,
        })
        expect(Object.keys(selected)).toEqual([
            'id', 'selectionId', 'canonicalEventId', 'eventId', 'marketId', 'marketType', 'outcome', 'side', 'line', 'decimalOdds', 'acceptedOdds', 'currentOdds', 'bookmaker', 'provider', 'providerEventId', 'sourceContext', 'observedAt', 'freshness', 'submittable', 'ineligibilityReason', 'suspended', 'stake', 'status', 'oddsChanged', 'label', 'eventLabel', 'marketLabel', 'eventStatus', 'eventHome', 'eventAway', 'home', 'away', 'leagueId', 'sportId', 'supportedMarket',
        ])
        expect(selected).toMatchObject({
            id: 'sel-home', selectionId: 'sel-home', canonicalEventId: 'canonical-1', eventId: 'event-1', marketId: 'winner', marketType: 'winner', outcome: 'home', side: 'home', decimalOdds: 2, acceptedOdds: 2, currentOdds: 2, bookmaker: 'Book A', provider: 'provider-a', providerEventId: 'provider-event-1', sourceContext: { source: 'fixture' }, observedAt: '2026-09-02T12:00:00.000Z', freshness: 'current', submittable: true, ineligibilityReason: null, suspended: false, stake: 7, status: 'selected', oddsChanged: false, label: 'home', eventLabel: 'Home FC - Away FC', marketLabel: 'winner', eventStatus: 'prematch', eventHome: 'Home FC', eventAway: 'Away FC', home: 'Home FC', away: 'Away FC', leagueId: 'league-1', sportId: 'soccer', supportedMarket: true,
        })
        expect(selected).not.toHaveProperty('source')
        expect(selected).not.toHaveProperty('previousOdds')
        expect(selected).not.toHaveProperty('boosted')
        expect(selected).not.toHaveProperty('unrelatedExtra')
    })

    it('syncs mutable offer metadata without overwriting accepted odds', () => {
        const selected = toggleSelection([], [event], 'sel-home')
        const synced = syncSelectionsWithEvents(selected, [canonicalEvent({
            offers: [offer({ decimalOdds: 1.9, observedAt: '2026-09-02T12:01:00.000Z' })],
        })])
        expect(synced[0]).toMatchObject({ acceptedOdds: 2, currentOdds: 1.9, oddsChanged: true, status: 'odds-down' })
        expect(synced[0].observedAt).toBe('2026-09-02T12:01:00.000Z')
        const accepted = acceptSelectionOdds(synced)
        expect(accepted[0]).toMatchObject({ acceptedOdds: 1.9, oddsChanged: false })
    })

    it('returns stable validation codes for every preflight boundary', () => {
        const selected = toggleSelection([], [event], 'sel-home')
        expect(validateTicket({ selections: [], stake: 10, balance: 100 }).code).toBe('empty')
        expect(validateTicket({ selections: selected, stake: 0, balance: 100 }).code).toBe('stake-invalid')
        expect(validateTicket({ selections: selected, stake: 101, balance: 100 }).code).toBe('balance-insufficient')
        expect(validateTicket({ selections: selected, stake: 10, balance: 100 })).toEqual({ valid: true, code: null, reason: null })
        expect(validateTicket({
            selections: [{ ...selected[0], currentOdds: 1.8, oddsChanged: true }],
            stake: 10,
            balance: 100,
            settings: { ...DEFAULT_BETSLIP_SETTINGS, oddsPolicy: ODDS_POLICIES.ACCEPT_HIGHER },
        })).toMatchObject({ valid: false, code: 'odds-acceptance-required', needsManualAccept: true })
    })

    it('rejects model, stale, unknown, malformed, unsupported, suspended, and locked selections', () => {
        const valid = toggleSelection([], [event], 'sel-home')[0]
        const cases = [
            [{ ...valid, bookmaker: null, ineligibilityReason: 'model-estimate' }, 'model-estimate'],
            [{ ...valid, freshness: 'stale', submittable: false, ineligibilityReason: 'stale-offer' }, 'stale-offer'],
            [{ ...valid, freshness: 'unknown', submittable: false, ineligibilityReason: 'unknown-freshness' }, 'unknown-freshness'],
            [{ ...valid, bookmaker: '' }, 'malformed-selection'],
            [{ ...valid, marketId: 'correct-score', marketType: 'correct-score', marketLabel: 'Correct Score' }, 'unsupported-market'],
            [{ ...valid, suspended: true, status: 'suspended' }, 'suspended'],
            [{ ...valid, status: 'locked' }, 'locked'],
        ]
        for (const [selection, code] of cases) {
            expect(validateTicket({ selections: [selection], stake: 10, balance: 100 }).code).toBe(code)
        }
    })

    it('accepts exactly winner, total, and spread and rejects every resolver-only market', () => {
        const accepted = [
            offer({ id: 'winner', marketId: 'winner', outcome: 'draw' }),
            offer({ id: 'total', marketId: 'total', outcome: 'over', line: 2.5 }),
            offer({ id: 'spread', marketId: 'spread', outcome: 'away', line: 1.5 }),
        ]
        for (const candidate of accepted) {
            const selection = makeBetSlipSelection({ event, selection: candidate })
            expect(validateTicket({ selections: [selection], stake: 10, balance: 100 })).toEqual({ valid: true, code: null, reason: null })
        }

        const resolverOnlyMarkets = [
            'both-teams-to-score',
            'correct-score',
            'double-chance',
            'draw-no-bet',
            'odd-even',
            'clean-sheet',
            'win-to-nil',
            'home-total-goals',
            'away-total-goals',
            'team-total',
            'result-both-teams-to-score',
        ]
        for (const marketId of resolverOnlyMarkets) {
            const candidate = makeBetSlipSelection({
                event,
                selection: offer({ id: `resolver-${marketId}`, marketId, outcome: 'home', line: 1.5 }),
            })
            expect(validateTicket({ selections: [candidate], stake: 10, balance: 100 }).code, marketId).toBe('unsupported-market')
            expect(() => createPracticeTicket({ selections: [candidate], stake: 10 })).toThrowError(expect.objectContaining({
                code: 'unsupported-market',
                message: 'This practice market cannot be settled safely.',
            }))
        }
    })

    it('rejects invalid outcome domains and requires an explicit finite numeric line', () => {
        const cases = [
            offer({ id: 'winner-invalid', marketId: 'winner', outcome: 'over' }),
            offer({ id: 'total-invalid', marketId: 'total', outcome: 'draw', line: 2.5 }),
            offer({ id: 'spread-invalid', marketId: 'spread', outcome: 'draw', line: -1.5 }),
            offer({ id: 'total-line-missing', marketId: 'total', outcome: 'over', line: undefined, label: 'Over 2.5' }),
            offer({ id: 'total-line-string', marketId: 'total', outcome: 'over', line: '2.5' }),
            offer({ id: 'spread-line-mixed-string', marketId: 'spread', outcome: 'home', line: '-1.5junk' }),
            offer({ id: 'total-line-nan', marketId: 'total', outcome: 'under', line: NaN }),
            offer({ id: 'spread-line-infinity', marketId: 'spread', outcome: 'away', line: Infinity }),
        ]
        for (const candidate of cases) {
            const selection = makeBetSlipSelection({ event, selection: candidate })
            const validation = validateTicket({ selections: [selection], stake: 10, balance: 100 })
            expect(validation).toEqual({
                valid: false,
                code: 'malformed-selection',
                reason: 'This bookmaker price is missing required acceptance facts.',
            })
            expect(() => createPracticeTicket({ selections: [selection], stake: 10 })).toThrowError(expect.objectContaining({
                code: validation.code,
                message: validation.reason,
            }))
        }

        const validLines = [
            offer({ id: 'total-line-zero', marketId: 'total', outcome: 'over', line: 0 }),
            offer({ id: 'total-line-nonzero', marketId: 'total', outcome: 'under', line: 2.5 }),
            offer({ id: 'spread-line-zero', marketId: 'spread', outcome: 'home', line: 0 }),
            offer({ id: 'spread-line-nonzero', marketId: 'spread', outcome: 'away', line: -1.5 }),
        ]
        for (const candidate of validLines) {
            const selection = makeBetSlipSelection({ event, selection: candidate })
            expect(validateTicket({ selections: [selection], stake: 10, balance: 100 })).toEqual({ valid: true, code: null, reason: null })
            expect(createPracticeTicket({ selections: [selection], stake: 10 }).status).toBe('active')
        }
    })

    it('enforces duplicate, contradiction, and repeated exact-fixture policy across every mode', () => {
        const first = toggleSelection([], [event], 'sel-home')[0]
        const away = makeBetSlipSelection({ event, selection: offer({ id: 'sel-away', outcome: 'away', decimalOdds: 3 }) })
        const total = makeBetSlipSelection({ event, selection: offer({ id: 'sel-total', marketId: 'total', outcome: 'over', line: 2.5 }) })
        for (const mode of Object.values(BET_MODES)) {
            expect(validateTicket({ selections: [first, { ...first }], stake: 10, balance: 100, mode }).code, mode).toBe('duplicate-selection')
            expect(validateTicket({ selections: [first, away], stake: 10, balance: 100, mode }).code, mode).toBe('contradictory-market')
        }
        expect(validateTicket({ selections: [first, total], stake: 10, balance: 100, mode: BET_MODES.SINGLES }).valid).toBe(true)
        for (const mode of [BET_MODES.MULTI, BET_MODES.SYSTEM_2]) {
            expect(validateTicket({ selections: [first, total], stake: 10, balance: 100, mode }).code, mode).toBe('duplicate-fixture')
        }
        const isolated = { ...total, selectionId: 'sel-isolated', canonicalEventId: 'canonical-2', eventId: first.eventId }
        for (const mode of Object.values(BET_MODES)) {
            expect(validateTicket({ selections: [first, isolated], stake: 10, balance: 100, mode }).valid, mode).toBe(true)
        }
    })

    it('creates a valid ticket or throws stable coded Errors for every intrinsic failure', () => {
        const selected = toggleSelection([], [event], 'sel-home')
        const ticket = createPracticeTicket({ selections: selected, stake: 10, mode: BET_MODES.SINGLES, seed: 'state-test' })
        expect(ticket).toMatchObject({ status: 'active', combinations: 1, payoutProcessed: false, settlementKey: null })
        expect(ticket.combinationDetails).toEqual(ticket.quote.combinationDetails)
        expect(ticket.legs[0]).toMatchObject({ selectionId: 'sel-home', canonicalEventId: 'canonical-1', status: 'pending' })

        const total = makeBetSlipSelection({ event, selection: offer({ id: 'factory-total', marketId: 'total', outcome: 'over', line: 2.5 }) })
        const away = makeBetSlipSelection({ event, selection: offer({ id: 'factory-away', outcome: 'away' }) })
        const cases = [
            [{ selections: [], stake: 10 }, 'empty', 'Pick at least one practice price.'],
            [{ selections: selected, stake: 10, mode: 'unsupported' }, 'unsupported-mode', 'This practice ticket type is unsupported.'],
            [{ selections: selected, stake: 10, mode: BET_MODES.MULTI }, 'insufficient-legs', 'Add at least two selections for this practice ticket type.'],
            [{ selections: [selected[0], { ...selected[0] }], stake: 10 }, 'duplicate-selection', 'The same practice price cannot be selected twice.'],
            [{ selections: [{ ...selected[0], bookmaker: null, ineligibilityReason: 'model-estimate' }], stake: 10 }, 'model-estimate', 'Model estimates cannot be submitted as bookmaker prices.'],
            [{ selections: [{ ...selected[0], freshness: 'stale', ineligibilityReason: 'stale-offer' }], stake: 10 }, 'stale-offer', 'This bookmaker price is stale.'],
            [{ selections: [{ ...selected[0], freshness: 'unknown' }], stake: 10 }, 'unknown-freshness', 'This bookmaker price has unknown freshness.'],
            [{ selections: [{ ...selected[0], provider: '' }], stake: 10 }, 'malformed-selection', 'This bookmaker price is missing required acceptance facts.'],
            [{ selections: [{ ...selected[0], marketId: 'correct-score', marketType: 'correct-score' }], stake: 10 }, 'unsupported-market', 'This practice market cannot be settled safely.'],
            [{ selections: [{ ...selected[0], suspended: true, status: 'suspended' }], stake: 10 }, 'suspended', 'A selected practice market is suspended.'],
            [{ selections: [{ ...selected[0], status: 'locked' }], stake: 10 }, 'locked', 'A selected practice market is locked.'],
            [{ selections: [selected[0], away], stake: 10 }, 'contradictory-market', 'Contradictory outcomes from the same fixture market cannot be combined.'],
            [{ selections: [selected[0], total], stake: 10, mode: BET_MODES.MULTI }, 'duplicate-fixture', 'This practice ticket type permits only one selection per fixture.'],
            [{ selections: selected, stake: 0 }, 'stake-invalid', 'Enter a valid practice stake.'],
        ]
        for (const [input, code, message] of cases) {
            expect(() => createPracticeTicket(input)).toThrowError(expect.objectContaining({ code, message }))
        }
    })

    it('settles by canonical identity without legacy fallback and preserves legacy-only compatibility', () => {
        const ticket = createPracticeTicket({ selections: toggleSelection([], [event], 'sel-home'), stake: 10, seed: 'canonical-settle' })
        const mismatches = [
            { id: 'canonical-1', status: 'settled', homeScore: 2, awayScore: 0 },
            { eventId: 'event-1', status: 'settled', homeScore: 2, awayScore: 0 },
            { id: 'event-1', canonicalEventId: 'canonical-other', status: 'settled', homeScore: 2, awayScore: 0 },
        ]
        for (const result of mismatches) {
            const pending = settlePracticeTicket(ticket, [result], 100)
            expect(pending).toMatchObject({ status: 'active', result: null, payout: 0, payoutProcessed: false })
            expect(pending.legs[0]).toMatchObject({ status: 'pending', reason: 'event-not-settled' })
        }
        const settled = settlePracticeTicket(ticket, [{ canonicalEventId: 'canonical-1', status: 'settled', homeScore: 2, awayScore: 0 }], 200)
        expect(settled).toMatchObject({ status: 'settled', settledAt: 200, result: 'win', payout: 20, profit: 10, payoutProcessed: true })
        expect(settled.pending).toEqual([])
        expect(settled.settlementKey).toContain('sel-home:won')
        expect(settled.combinationDetails[0].id).toBe(ticket.combinationDetails[0].id)

        const legacyTicket = {
            ...ticket,
            selections: ticket.selections.map(selection => ({ ...selection, canonicalEventId: '' })),
        }
        const legacySettled = settlePracticeTicket(legacyTicket, [{ id: 'event-1', status: 'settled', homeScore: 2, awayScore: 0 }], 300)
        expect(legacySettled).toMatchObject({ status: 'settled', result: 'win', payout: 20, payoutProcessed: true })
    })

    it('marks zero-payout terminal tickets processed without creating payout entries', () => {
        const ticket = createPracticeTicket({ selections: toggleCanonicalSelection([], [event], 'sel-home'), stake: 10, seed: 'zero-payout' })
        const result = settleActiveTicketsWithEvents({
            tickets: [ticket],
            events: [{ canonicalEventId: 'canonical-1', status: 'settled', homeScore: 0, awayScore: 2 }],
            now: 400,
        })
        expect(result.payouts).toEqual([])
        expect(result.tickets[0]).toMatchObject({ status: 'settled', result: 'loss', payout: 0, payoutProcessed: true, settledAt: 400 })
    })

    it.each([
        [BET_MODES.SINGLES, [
            offer({ id: 'align-single-a', canonicalEventId: 'canonical-a', providerEventId: 'provider-a', outcome: 'home', decimalOdds: 2 }),
            offer({ id: 'align-single-b', canonicalEventId: 'canonical-b', providerEventId: 'provider-b', outcome: 'away', decimalOdds: 3 }),
        ]],
        [BET_MODES.MULTI, [
            offer({ id: 'align-multi-a', canonicalEventId: 'canonical-a', providerEventId: 'provider-a', outcome: 'home', decimalOdds: 2 }),
            offer({ id: 'align-multi-b', canonicalEventId: 'canonical-b', providerEventId: 'provider-b', outcome: 'away', decimalOdds: 3 }),
        ]],
        [BET_MODES.SYSTEM_2, [
            offer({ id: 'align-system-a', canonicalEventId: 'canonical-a', providerEventId: 'provider-a', outcome: 'home', decimalOdds: 2 }),
            offer({ id: 'align-system-b', canonicalEventId: 'canonical-b', providerEventId: 'provider-b', outcome: 'away', decimalOdds: 3 }),
            offer({ id: 'align-system-c', canonicalEventId: 'canonical-c', providerEventId: 'provider-c', outcome: 'draw', decimalOdds: 4 }),
        ]],
    ])('keeps quote, creation, settlement details and metadata aligned for %s', (mode, offers) => {
        const modeSelections = offers.map((candidate, index) => makeBetSlipSelection({
            event: canonicalEvent({ id: `event-${index}`, canonicalEventId: candidate.canonicalEventId, home: `Home ${index}`, away: `Away ${index}` }),
            selection: candidate,
        }))
        const ticket = createPracticeTicket({ selections: modeSelections, stake: 30, mode, seed: `align-${mode}` })
        const results = modeSelections.map(selection => ({
            canonicalEventId: selection.canonicalEventId,
            status: 'settled',
            homeScore: selection.outcome === 'away' ? 0 : 2,
            awayScore: selection.outcome === 'away' ? 2 : selection.outcome === 'draw' ? 2 : 0,
        }))
        const settled = settlePracticeTicket(ticket, results, 500)
        const quoteShape = ticket.quote.combinationDetails.map(({ id, selectionIds }) => ({ id, selectionIds }))
        expect(ticket.combinationDetails.map(({ id, selectionIds }) => ({ id, selectionIds }))).toEqual(quoteShape)
        expect(settled.combinationDetails.map(({ id, selectionIds }) => ({ id, selectionIds }))).toEqual(quoteShape)
        expect(settled.combinations).toBe(quoteShape.length)
        expect(settled).toMatchObject({ status: 'settled', settledAt: 500, result: 'win', payoutProcessed: true, pending: [] })
        expect(settled.legs.map(leg => leg.status)).toEqual(modeSelections.map(() => 'won'))
    })

    describe('cashOutTicket', () => {
        function fixture(seed = 'cashout-test') {
            const events = [canonicalEvent({ offers: [offer(), offer({ id: 'sel-away', outcome: 'away', side: 'away', decimalOdds: 2 })] })]
            const ticket = createPracticeTicket({ selections: [makeBetSlipSelection({ event: events[0], selection: events[0].offers[0] })], stake: 10, seed })
            return { ticket, valuation: valueSimulatedCashout({ ticket, events }) }
        }

        it('accepts a precomputed bound valuation into the exact terminal lifecycle', () => {
            const { ticket, valuation } = fixture('cashout-active')
            const cashed = cashOutTicket(ticket, valuation, 1234)
            expect(cashed).toMatchObject({ status: 'cashed_out', result: 'cashed_out', settledAt: 1234, payout: 7.8, profit: -2.2, payoutProcessed: true, pending: [] })
            expect(cashed.settlementKey).toBe(`${ticket.id}:cashout:${valuation.valuationFingerprint}`)
            expect(cashed.cashOut).toEqual({ schemaVersion: 1, status: 'accepted', acceptedAt: 1234, transactionId: `${cashed.settlementKey}:credit`, valuation })
            expect(cashed.legs).toEqual([{ ...ticket.legs[0], status: 'cashed_out', reason: 'cashed-out' }])
        })

        it('returns original identity for terminal, unavailable, malformed, mismatched, and repeat inputs', () => {
            const { ticket, valuation } = fixture('cashout-noop')
            expect(cashOutTicket({ ...ticket, status: 'settled' }, valuation, 2).status).toBe('settled')
            expect(cashOutTicket(ticket, { ...valuation, available: false }, 2)).toBe(ticket)
            expect(cashOutTicket(ticket, { ...valuation, amount: 99 }, 2)).toBe(ticket)
            expect(cashOutTicket(ticket, { ...valuation, valuationFingerprint: 'drift' }, 2)).toBe(ticket)
            const cashed = cashOutTicket(ticket, valuation, 2)
            expect(cashOutTicket(cashed, valuation, 3)).toBe(cashed)
        })

        it.each([
            ['amount', valuation => { valuation.amount += 1 }],
            ['fairCurrentValue', valuation => { valuation.fairCurrentValue += 1 }],
            ['haircut', valuation => { valuation.haircut = 0.5 }],
            ['sources', valuation => { valuation.sources[0] = 'Forged:Source' }],
            ['probability', valuation => { valuation.legProbabilities[0].probability = 0.9 }],
            ['probability bookmaker', valuation => { valuation.legProbabilities[0].bookmaker = 'Forged' }],
            ['combination value', valuation => { valuation.combinationValues[0].rawCurrentValue += 1 }],
            ['observation fingerprint', valuation => { valuation.observationFingerprint = 'forged' }],
            ['valuation fingerprint', valuation => { valuation.valuationFingerprint = 'forged' }],
        ])('rejects a precomputed valuation with tampered %s', (_, mutate) => {
            const { ticket, valuation } = fixture('cashout-tamper')
            const forged = structuredClone(valuation)
            mutate(forged)
            expect(cashOutTicket(ticket, forged, 2)).toBe(ticket)
        })

        it('retains won and void legs while converting only pending legs', () => {
            const { ticket, valuation } = fixture('cashout-statuses')
            const extra = structuredClone(ticket.selections[0])
            extra.id = 'extra'; extra.selectionId = 'extra'; extra.canonicalEventId = 'event-extra'; extra.eventId = 'event-extra'
            const mixed = { ...ticket, selections: [...ticket.selections, extra], legs: [{ ...ticket.legs[0], status: 'won', reason: 'winner' }, { ...ticket.legs[0], selectionId: 'extra', canonicalEventId: 'event-extra', eventId: 'event-extra', status: 'void', reason: 'push' }] }
            mixed.combinationDetails = [{ id: 'singles:sel-home', mode: 'singles', selectionIds: ['sel-home'], rawStake: 5 }, { id: 'singles:extra', mode: 'singles', selectionIds: ['extra'], rawStake: 5 }]
            mixed.quote = { ...mixed.quote, combinationDetails: structuredClone(mixed.combinationDetails) }
            const settledValuation = { ...valuation, fairCurrentValue: 15, amount: 11.7, legProbabilities: [], combinationValues: [{ id: 'singles:sel-home', rawStake: 5, rawCurrentValue: 10 }, { id: 'singles:extra', rawStake: 5, rawCurrentValue: 5 }] }
            settledValuation.observationFingerprint = JSON.stringify(['cashout-observation-v1'])
            settledValuation.sources = ['Book:Provider']
            settledValuation.inputObservedAt = '2026-09-03T12:00:00.000Z'
            const rebound = valueSimulatedCashout({ ticket: mixed, events: [] })
            const cashed = cashOutTicket(mixed, rebound, 2)
            expect(cashed.legs.map(leg => leg.status)).toEqual(['won', 'void'])
        })
    })
})
