import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { prepareCreditTransactions } from '../context/CreditContext'
import { normalizeSportsGameOddsEvent } from './freeFeedAdapters'
import { coordinateSportsbookPublication } from './SportsbookShell'
import { valueSimulatedCashout } from './sportsbookMath'
import { cashOutTicket, createPracticeTicket, makeBetSlipSelection, settleActiveTicketsWithEvents, settlePracticeTicket } from './sportsbookState'
import {
    CREDIT_STORAGE_KEY,
    HISTORY_STORAGE_KEY,
    SPORTSBOOK_TICKETS_V1_KEY,
    SPORTSBOOK_TICKETS_V2_KEY,
    commitSportsbookAccounting,
    persistMigratedSportsbookTickets,
    resetSportsbookIntegrityLatchForTests,
    restoreSportsbookTickets,
} from './sportsbookPersistence'

function ticket(id = 'sports-persist') {
    const event = { id: 'event-1', canonicalEventId: 'canonical-1', home: 'Home', away: 'Away', status: 'prematch', sportId: 'soccer', leagueId: 'league' }
    const selection = makeBetSlipSelection({
        event,
        selection: {
            id: 'selection-1',
            canonicalEventId: 'canonical-1',
            marketId: 'winner',
            outcome: 'home',
            decimalOdds: 2,
            bookmaker: 'Book',
            provider: 'provider',
            providerEventId: 'provider-event',
            sourceContext: { group: 'odds' },
            observedAt: '2026-09-02T12:00:00.000Z',
            freshness: 'current',
            submittable: true,
            ineligibilityReason: null,
            suspended: false,
        },
    })
    return createPracticeTicket({ selections: [selection], stake: 10, seed: id.replace('sports-', '') })
}

function cashedOutTicket(id = 'sports-cashout') {
    const active = ticket(id)
    const selection = active.selections[0]
    const cohort = override => ({
        id: override.outcome, canonicalEventId: selection.canonicalEventId, marketId: selection.marketId,
        bookmaker: selection.bookmaker, provider: selection.provider, providerEventId: selection.providerEventId,
        sourceContext: structuredClone(selection.sourceContext), observedAt: '2026-09-03T12:00:00.000Z', freshness: 'current',
        submittable: true, ineligibilityReason: null, suspended: false, decimalOdds: 2, ...override,
    })
    const events = [{ canonicalEventId: selection.canonicalEventId, offers: [cohort({ outcome: 'home' }), cohort({ outcome: 'away' })] }]
    return cashOutTicket(active, valueSimulatedCashout({ ticket: active, events }), 4)
}

function marketTicket(marketId, outcome, line) {
    const event = { id: `event-${marketId}`, canonicalEventId: `canonical-${marketId}`, home: 'Home', away: 'Away', status: 'prematch', sportId: 'soccer', leagueId: 'league' }
    const selection = makeBetSlipSelection({
        event,
        selection: {
            id: `selection-${marketId}`,
            canonicalEventId: event.canonicalEventId,
            marketId,
            outcome,
            line,
            decimalOdds: 2,
            bookmaker: 'Book',
            provider: 'provider',
            providerEventId: `provider-${marketId}`,
            sourceContext: { group: 'odds' },
            observedAt: '2026-09-02T12:00:00.000Z',
            freshness: 'current',
            submittable: true,
            ineligibilityReason: null,
            suspended: false,
        },
    })
    return createPracticeTicket({ selections: [selection], stake: 10, seed: marketId })
}

function twoSelectionTicket(mode = 'multi') {
    const first = ticket(`${mode}-pair`)
    const secondSelection = structuredClone(first.selections[0])
    secondSelection.id = 'selection-2'
    secondSelection.selectionId = 'selection-2'
    secondSelection.canonicalEventId = 'canonical-2'
    secondSelection.eventId = 'event-2'
    secondSelection.providerEventId = 'provider-event-2'
    secondSelection.outcome = 'away'
    secondSelection.side = 'away'
    const paired = createPracticeTicket({ selections: [first.selections[0], secondSelection], stake: 10, mode, seed: `${mode}-pair` })
    return paired
}

function storage(initial = {}, control = {}) {
    const values = new Map(Object.entries(initial))
    const calls = []
    return {
        calls,
        values,
        getItem(key) {
            calls.push(['getItem', key])
            if (control.getItem?.(key, calls)) throw new Error(`get ${key}`)
            return values.has(key) ? values.get(key) : null
        },
        setItem(key, value) {
            calls.push(['setItem', key, String(value)])
            if (control.setItem?.(key, String(value), calls)) return false
            values.set(key, String(value))
        },
        removeItem(key) {
            calls.push(['removeItem', key])
            if (control.removeItem?.(key, calls)) return false
            values.delete(key)
        },
    }
}

beforeEach(() => resetSportsbookIntegrityLatchForTests())

describe('sportsbook V2 restore', () => {
    it('gives any present V2 sole authority and isolates records in stored order', () => {
        const valid = ticket()
        const malformed = { ...valid, id: '' }
        const duplicate = structuredClone(valid)
        const capped = Array.from({ length: 21 }, (_, index) => ({ ...structuredClone(valid), id: `sports-${index}` }))
        const mixed = { version: 2, savedAt: 1, tickets: [malformed, valid, duplicate, ...capped] }
        const restored = restoreSportsbookTickets(JSON.stringify(mixed), JSON.stringify([valid]))
        expect(restored.ok).toBe(true)
        expect(restored.tickets).toHaveLength(20)
        expect(restored.tickets[0].id).toBe(valid.id)
        expect(restored.quarantine.map(item => item.code)).toEqual([
            'malformed-ticket',
            'duplicate-ticket-id',
            'ticket-cap-exceeded',
            'ticket-cap-exceeded',
        ])
        expect(restoreSportsbookTickets('', JSON.stringify([valid]))).toMatchObject({
            ok: false,
            tickets: [],
            sourceVersion: 2,
            migration: 'unavailable',
            code: 'restore-failed',
            quarantine: [{ source: 'v2', index: null, ticketId: null, code: 'malformed-json' }],
        })
    })

    it('rejects nested unknown fields, invalid outcomes, forged arithmetic, and incoherent legs', () => {
        const mutations = [
            value => { value.selections[0].forged = true },
            value => { value.legs[0].forged = true },
            value => { value.quote.combinationDetails[0].forged = true },
            value => { value.combinationDetails[0].forged = true },
            value => { value.settingsSnapshot.forged = true },
        ]
        for (const mutate of mutations) {
            const forged = ticket()
            mutate(forged)
            expect(restoreSportsbookTickets(JSON.stringify({ version: 2, savedAt: 1, tickets: [forged] }), null).quarantine[0].code).toBe('unknown-ticket-field')
        }
        const invalidOutcome = ticket()
        invalidOutcome.selections[0].outcome = 'over'
        const invalidArithmetic = ticket()
        invalidArithmetic.quote.combinationDetails[0].rawEstimatedReturn += 999
        const invalidLeg = ticket()
        invalidLeg.legs[0].canonicalEventId = 'other'
        const invalidTopLevelArithmetic = ticket()
        invalidTopLevelArithmetic.combinationDetails[0].rawEstimatedReturn += 999
        for (const invalid of [invalidOutcome, invalidArithmetic, invalidTopLevelArithmetic, invalidLeg]) {
            expect(restoreSportsbookTickets(JSON.stringify({ version: 2, savedAt: 1, tickets: [invalid] }), null).quarantine[0].code).toBe('malformed-ticket')
        }
    })

    it('restores exact nested cash-out and rejects nested fields, amounts, fingerprints, and lifecycle forgeries', () => {
        const valid = cashedOutTicket()
        const envelope = value => JSON.stringify({ version: 2, savedAt: 4, tickets: [value] })
        expect(restoreSportsbookTickets(envelope(valid), null).tickets).toEqual([valid])
        const mutations = [
            value => { value.cashOut.forged = true },
            value => { value.cashOut.valuation.forged = true },
            value => { value.cashOut.valuation.legProbabilities[0].forged = true },
            value => { value.cashOut.valuation.combinationValues[0].forged = true },
        ]
        for (const mutate of mutations) {
            const forged = structuredClone(valid)
            mutate(forged)
            expect(restoreSportsbookTickets(envelope(forged), null).quarantine[0].code).toBe('unknown-ticket-field')
        }
        for (const mutate of [
            value => { value.payout += 1 },
            value => { value.cashOut.valuation.amount += 1 },
            value => { value.cashOut.valuation.valuationFingerprint = 'forged' },
            value => { value.cashOut.transactionId = 'forged' },
            value => { value.settlementKey = 'forged' },
            value => { value.settledAt += 1 },
            value => { value.legs[0].status = 'pending'; value.legs[0].reason = 'pending' },
        ]) {
            const forged = structuredClone(valid)
            mutate(forged)
            expect(restoreSportsbookTickets(envelope(forged), null).quarantine[0].code).toBe('malformed-ticket')
        }
    })

    it('keeps existing V2 tickets without cashOut compatible and accepts explicit null', () => {
        const absent = ticket()
        delete absent.cashOut
        const explicitNull = ticket('sports-null-cashout')
        expect(restoreSportsbookTickets(JSON.stringify({ version: 2, savedAt: 1, tickets: [absent, explicitNull] }), null).tickets).toEqual([absent, explicitNull])
    })

    it('rejects a forged settlement key and restores the canonical control', () => {
        const settled = settlePracticeTicket(ticket(), [{ canonicalEventId: 'canonical-1', status: 'settled', homeScore: 2, awayScore: 0 }], 3)
        const forged = { ...settled, settlementKey: 'forged' }
        const envelope = value => JSON.stringify({ version: 2, savedAt: 3, tickets: [value] })
        expect(restoreSportsbookTickets(envelope(forged), null).quarantine).toEqual([{ source: 'v2', index: 0, ticketId: settled.id, code: 'malformed-ticket' }])
        expect(restoreSportsbookTickets(envelope(settled), null).tickets).toEqual([settled])
    })

    it('rejects invalid settled leg statuses and reasons and restores the terminal control', () => {
        const settled = settlePracticeTicket(ticket(), [{ canonicalEventId: 'canonical-1', status: 'settled', homeScore: 2, awayScore: 0 }], 3)
        const envelope = value => JSON.stringify({ version: 2, savedAt: 3, tickets: [value] })
        for (const mutation of [
            value => { value.legs[0].status = 'banana'; value.combinationDetails[0].legStatuses[0] = 'banana' },
            value => { value.legs[0].reason = 'banana' },
        ]) {
            const forged = structuredClone(settled)
            mutation(forged)
            expect(restoreSportsbookTickets(envelope(forged), null).quarantine[0].code).toBe('malformed-ticket')
        }
        expect(restoreSportsbookTickets(envelope(settled), null).tickets).toEqual([settled])
    })

    it('requires exact side and outcome coherence for every persisted market', () => {
        const cases = [
            ['winner', 'home', 'away', undefined],
            ['total', 'over', 'under', 2.5],
            ['spread', 'home', 'away', -1.5],
        ]
        for (const [marketId, outcome, forgedSide, line] of cases) {
            const valid = marketTicket(marketId, outcome, line)
            const forged = structuredClone(valid)
            forged.selections[0].side = forgedSide
            const envelope = value => JSON.stringify({ version: 2, savedAt: 1, tickets: [value] })
            expect(restoreSportsbookTickets(envelope(forged), null).quarantine[0].code).toBe('malformed-ticket')
            expect(restoreSportsbookTickets(envelope(valid), null).tickets).toEqual([valid])
        }
    })

    it('classifies contradiction and duplicate-fixture restore failures', () => {
        const contradiction = twoSelectionTicket('singles')
        contradiction.selections[1].canonicalEventId = contradiction.selections[0].canonicalEventId
        contradiction.legs[1].canonicalEventId = contradiction.legs[0].canonicalEventId
        const duplicateFixture = twoSelectionTicket('multi')
        duplicateFixture.selections[1].canonicalEventId = duplicateFixture.selections[0].canonicalEventId
        duplicateFixture.legs[1].canonicalEventId = duplicateFixture.legs[0].canonicalEventId
        const envelope = value => JSON.stringify({ version: 2, savedAt: 1, tickets: [value] })
        expect(restoreSportsbookTickets(envelope(contradiction), null).quarantine[0].code).toBe('contradictory-ticket')
        expect(restoreSportsbookTickets(envelope(duplicateFixture), null).quarantine[0].code).toBe('duplicate-fixture')
    })

    it('rejects accessor and custom-prototype input without invoking properties or storage', () => {
        let invoked = false
        const hostile = Object.create({ inherited: true })
        Object.defineProperty(hostile, 'id', { enumerable: true, get() { invoked = true; throw new Error('hostile') } })
        const store = storage()
        expect(commitSportsbookAccounting({ tickets: [hostile], nextBalance: 990, nextTransactions: [], savedAt: 2, storage: store })).toMatchObject({ ok: false, code: 'validation-failed' })
        expect(invoked).toBe(false)
        expect(store.calls).toEqual([])
    })

    it('migrates only provable V1 records without copying extras', () => {
        const valid = ticket()
        const migrated = restoreSportsbookTickets(null, JSON.stringify([{ ...valid, legacyExtra: 'drop' }, { id: 'unprovable' }]))
        expect(migrated).toMatchObject({ ok: true, sourceVersion: 1, migration: 'required' })
        expect(migrated.tickets).toHaveLength(1)
        expect(migrated.tickets[0]).not.toHaveProperty('legacyExtra')
        expect(migrated.quarantine[0].code).toBe('unprovable-v1')
    })
})

describe('sportsbook exact-key persistence', () => {
    it('commits a real adapter offer through the closed accepted selection contract', () => {
        const observedAt = '2026-09-02T12:00:00.000Z'
        const event = normalizeSportsGameOddsEvent({
            eventID: 'adapter-commit',
            sportID: 'BASKETBALL',
            leagueID: 'Journey League',
            teams: { home: { names: { long: 'Home' } }, away: { names: { long: 'Away' } } },
            status: { startsAt: '2026-09-04T12:00:00.000Z' },
            odds: {
                'points-home-game-ml-home': { byBookmaker: { 'Journey Book': { odds: '2', available: true, lastUpdated: observedAt } } },
                'points-away-game-ml-away': { byBookmaker: { 'Journey Book': { odds: '2', available: true, lastUpdated: observedAt } } },
            },
        }, { generatedAt: observedAt })
        const offer = event.offers[0]
        expect(offer).toMatchObject({ source: 'sportsgameodds', boosted: false, previousOdds: expect.any(Number) })
        const selection = makeBetSlipSelection({ event, selection: offer })
        const acceptedKeys = ['id', 'selectionId', 'canonicalEventId', 'eventId', 'marketId', 'marketType', 'outcome', 'side', 'line', 'decimalOdds', 'acceptedOdds', 'currentOdds', 'bookmaker', 'provider', 'providerEventId', 'sourceContext', 'observedAt', 'freshness', 'submittable', 'ineligibilityReason', 'suspended', 'stake', 'status', 'oddsChanged', 'label', 'eventLabel', 'marketLabel', 'eventStatus', 'eventHome', 'eventAway', 'home', 'away', 'leagueId', 'sportId', 'supportedMarket']
        expect(Object.keys(selection)).toEqual(acceptedKeys)
        expect(selection).toMatchObject({ id: offer.id, selectionId: offer.id, canonicalEventId: offer.canonicalEventId, eventId: event.id, marketId: 'winner', outcome: 'home', acceptedOdds: 2, currentOdds: 2, bookmaker: 'Journey Book', provider: 'sportsgameodds', providerEventId: 'adapter-commit', sourceContext: { payloadGroup: 'sportsGameOdds', observationSource: 'bookmaker' }, observedAt, freshness: 'current', submittable: true, ineligibilityReason: null, suspended: false, status: 'selected' })
        expect(selection).not.toHaveProperty('source')
        expect(selection).not.toHaveProperty('previousOdds')
        expect(selection).not.toHaveProperty('boosted')
        const practiceTicket = createPracticeTicket({ selections: [selection], stake: 10, seed: 'adapter-commit' })
        const store = storage()
        expect(commitSportsbookAccounting({ tickets: [practiceTicket], nextBalance: 990, nextTransactions: [], savedAt: 2, storage: store })).toEqual({ ok: true, code: null, rollback: 'not-needed' })
        expect(store.calls.map(call => call.slice(0, 2))).toEqual([
            ['getItem', SPORTSBOOK_TICKETS_V2_KEY], ['getItem', CREDIT_STORAGE_KEY], ['getItem', HISTORY_STORAGE_KEY],
            ['setItem', SPORTSBOOK_TICKETS_V2_KEY], ['setItem', CREDIT_STORAGE_KEY], ['setItem', HISTORY_STORAGE_KEY],
            ['getItem', SPORTSBOOK_TICKETS_V2_KEY], ['getItem', CREDIT_STORAGE_KEY], ['getItem', HISTORY_STORAGE_KEY],
        ])
        const restored = restoreSportsbookTickets(store.values.get(SPORTSBOOK_TICKETS_V2_KEY), null)
        expect(restored.ok).toBe(true)
        expect(Object.keys(restored.tickets[0].selections[0]).sort()).toEqual([...acceptedKeys.filter(key => selection[key] !== undefined), 'odds'].sort())
        expect(restored.tickets[0].selections[0]).toEqual(JSON.parse(JSON.stringify(practiceTicket.selections[0])))
        expect(restored.tickets[0].selections[0]).not.toHaveProperty('source')
        expect(restored.tickets[0].selections[0]).not.toHaveProperty('previousOdds')
        expect(restored.tickets[0].selections[0]).not.toHaveProperty('boosted')
    })

    it('writes and reads back exactly tickets, credits, history', () => {
        const store = storage({ foreign: 'keep' })
        const result = commitSportsbookAccounting({ tickets: [ticket()], nextBalance: 990, nextTransactions: [], savedAt: 2, storage: store })
        expect(result).toEqual({ ok: true, code: null, rollback: 'not-needed' })
        expect(store.calls.map(call => call.slice(0, 2))).toEqual([
            ['getItem', SPORTSBOOK_TICKETS_V2_KEY], ['getItem', CREDIT_STORAGE_KEY], ['getItem', HISTORY_STORAGE_KEY],
            ['setItem', SPORTSBOOK_TICKETS_V2_KEY], ['setItem', CREDIT_STORAGE_KEY], ['setItem', HISTORY_STORAGE_KEY],
            ['getItem', SPORTSBOOK_TICKETS_V2_KEY], ['getItem', CREDIT_STORAGE_KEY], ['getItem', HISTORY_STORAGE_KEY],
        ])
        expect(store.values.get('foreign')).toBe('keep')
    })

    it('commits settled Phase 02 details and Date-backed history', () => {
        const active = ticket()
        const settled = settlePracticeTicket(active, [{ canonicalEventId: 'canonical-1', status: 'settled', homeScore: 2, awayScore: 0 }], 3)
        const store = storage()
        const result = commitSportsbookAccounting({
            tickets: [settled],
            nextBalance: 1010,
            nextTransactions: [{ id: `${settled.settlementKey}:credit`, timestamp: new Date(3), type: 'win', label: 'Return', amount: 20, balance: 1010 }],
            savedAt: 3,
            storage: store,
        })
        expect(result).toEqual({ ok: true, code: null, rollback: 'not-needed' })
    })

    it('restores exact snapshots in reverse after a later write failure', () => {
        const initial = { [SPORTSBOOK_TICKETS_V2_KEY]: 'old-tickets', [CREDIT_STORAGE_KEY]: 'old-credit', [HISTORY_STORAGE_KEY]: 'old-history' }
        const store = storage(initial, { setItem: (key, value) => key === HISTORY_STORAGE_KEY && value !== 'old-history' })
        const result = commitSportsbookAccounting({ tickets: [ticket()], nextBalance: 990, nextTransactions: [], savedAt: 2, storage: store })
        expect(result).toMatchObject({ ok: false, code: 'rolled-back', failureStage: 'write-history', rollback: 'succeeded', observed: { tickets: 'old-tickets', credits: 'old-credit', history: 'old-history' } })
        expect(store.calls.filter(call => call[0] === 'setItem').slice(-3).map(call => call.slice(0, 2))).toEqual([
            ['setItem', HISTORY_STORAGE_KEY], ['setItem', CREDIT_STORAGE_KEY], ['setItem', SPORTSBOOK_TICKETS_V2_KEY],
        ])
    })

    it('rolls partial writes back byte-for-byte in reverse and latches rollback failure', () => {
        let failRollback = false
        const initial = { [SPORTSBOOK_TICKETS_V2_KEY]: 'old-tickets', [CREDIT_STORAGE_KEY]: 'old-credit', [HISTORY_STORAGE_KEY]: 'old-history', foreign: 'keep' }
        const store = storage(initial, {
            setItem(key, value) {
                if (key === HISTORY_STORAGE_KEY && value !== 'old-history') {
                    failRollback = true
                    return true
                }
                return failRollback && key === CREDIT_STORAGE_KEY && value === 'old-credit'
            },
        })
        const failed = commitSportsbookAccounting({ tickets: [ticket()], nextBalance: 990, nextTransactions: [], savedAt: 2, storage: store })
        expect(failed).toMatchObject({ ok: false, code: 'rollback-failed', failureStage: 'rollback', rollback: 'failed' })
        expect(failed.observed).toEqual({ tickets: 'old-tickets', credits: '990', history: 'old-history' })
        expect(commitSportsbookAccounting({ tickets: [ticket()], nextBalance: 990, nextTransactions: [], savedAt: 2, storage: store })).toMatchObject({ ok: false, code: 'integrity-stopped' })
        expect(store.values.get('foreign')).toBe('keep')
    })

    it.each([
        ['tickets', SPORTSBOOK_TICKETS_V2_KEY],
        ['credits', CREDIT_STORAGE_KEY],
        ['history', HISTORY_STORAGE_KEY],
    ])('restores exact present and absent snapshots after %s write failure', (name, failedKey) => {
        const initial = { [SPORTSBOOK_TICKETS_V2_KEY]: 'old-tickets', [HISTORY_STORAGE_KEY]: 'old-history' }
        const store = storage(initial, { setItem: (key, value) => key === failedKey && !String(value).startsWith('old-') })
        const result = commitSportsbookAccounting({ tickets: [ticket()], nextBalance: 990, nextTransactions: [], savedAt: 2, storage: store })
        expect(result).toMatchObject({ code: 'rolled-back', failureStage: `write-${name}`, rollback: 'succeeded' })
        expect(result.observed).toEqual({ tickets: 'old-tickets', credits: null, history: 'old-history' })
        expect(store.values.has(CREDIT_STORAGE_KEY)).toBe(false)
    })

    it.each([
        ['tickets', SPORTSBOOK_TICKETS_V2_KEY],
        ['credits', CREDIT_STORAGE_KEY],
        ['history', HISTORY_STORAGE_KEY],
    ])('restores every snapshot after %s readback throw and mismatch', (name, failedKey) => {
        for (const failureType of ['throw', 'mismatch']) {
            const counts = new Map()
            const initial = { [SPORTSBOOK_TICKETS_V2_KEY]: 'old-tickets', [CREDIT_STORAGE_KEY]: 'old-credit', [HISTORY_STORAGE_KEY]: 'old-history' }
            const store = storage(initial, {
                getItem(key) {
                    const count = (counts.get(key) || 0) + 1
                    counts.set(key, count)
                    if (key === failedKey && count === 2) {
                        if (failureType === 'throw') return true
                        store.values.set(key, 'mismatch')
                    }
                    return false
                },
            })
            const result = commitSportsbookAccounting({ tickets: [ticket()], nextBalance: 990, nextTransactions: [], savedAt: 2, storage: store })
            expect(result).toMatchObject({ code: 'rolled-back', failureStage: `readback-${name}`, rollback: 'succeeded' })
            expect(result.observed).toEqual({ tickets: 'old-tickets', credits: 'old-credit', history: 'old-history' })
        }
    })

    it.each(['remove', 'write', 'read'])('reports all owned keys safely after rollback %s failure', (failureType) => {
        let rollback = false
        const counts = new Map()
        const initial = failureType === 'remove'
            ? { [CREDIT_STORAGE_KEY]: 'old-credit', [HISTORY_STORAGE_KEY]: 'old-history' }
            : { [SPORTSBOOK_TICKETS_V2_KEY]: 'old-tickets', [CREDIT_STORAGE_KEY]: 'old-credit', [HISTORY_STORAGE_KEY]: 'old-history' }
        const store = storage(initial, {
            setItem(key, value) {
                if (key === HISTORY_STORAGE_KEY && value !== 'old-history') {
                    rollback = true
                    return true
                }
                return failureType === 'write' && rollback && key === CREDIT_STORAGE_KEY
            },
            removeItem: key => failureType === 'remove' && rollback && key === SPORTSBOOK_TICKETS_V2_KEY,
            getItem(key) {
                const count = (counts.get(key) || 0) + 1
                counts.set(key, count)
                return failureType === 'read' && rollback && key === CREDIT_STORAGE_KEY && count >= 2
            },
        })
        const result = commitSportsbookAccounting({ tickets: [ticket()], nextBalance: 990, nextTransactions: [], savedAt: 2, storage: store })
        expect(result).toMatchObject({ code: 'rollback-failed', failureStage: 'rollback', rollback: 'failed' })
        expect(result.observed).toEqual(expect.objectContaining({ tickets: expect.anything(), credits: expect.anything(), history: expect.anything() }))
        if (failureType === 'read') expect(result.observed.credits).toBe('unreadable')
        expect(Object.keys(result.observed)).toEqual(['tickets', 'credits', 'history'])
    })

    it('persists migration to V2 only and leaves V1 bytes untouched', () => {
        const rawV1 = JSON.stringify([ticket()])
        const store = storage({ [SPORTSBOOK_TICKETS_V1_KEY]: rawV1, [CREDIT_STORAGE_KEY]: '1000' })
        expect(persistMigratedSportsbookTickets({ tickets: [ticket()], savedAt: 2, storage: store }).ok).toBe(true)
        expect(store.values.get(SPORTSBOOK_TICKETS_V1_KEY)).toBe(rawV1)
        expect(store.values.get(CREDIT_STORAGE_KEY)).toBe('1000')
        expect(store.calls.some(call => call[1] === SPORTSBOOK_TICKETS_V1_KEY)).toBe(false)
    })
})

describe('sportsbook publication and reload integration', () => {
    it('keeps valuation in the shell and transports only structured results through components', () => {
        const shell = readFileSync(new URL('./SportsbookShell.jsx', import.meta.url), 'utf8')
        const slip = readFileSync(new URL('./components/BetSlip.jsx', import.meta.url), 'utf8')
        const bets = readFileSync(new URL('./components/MyBetsPanel.jsx', import.meta.url), 'utf8')
        expect(shell).toContain('valueSimulatedCashout({ ticket, events })')
        expect(shell).toContain('valuation.valuationFingerprint !== displayedValuationFingerprint')
        expect(shell).toContain("addWinningsTransactional(cashed.payout, 'Sportsbook simulated cash-out', cashed.cashOut.transactionId")
        expect(shell).not.toContain('addWinnings(cashed.payout')
        expect(shell.match(/cashoutValuationsByTicketId=\{cashoutValuationsByTicketId\}/g)).toHaveLength(3)
        expect(slip).not.toContain('cashoutOffer')
        expect(bets).not.toContain('cashoutOffer')
        expect(slip).not.toContain('cashoutValuation.amount : 0')
        expect(bets).not.toContain('cashoutValuation.amount : 0')
        expect(slip).toMatch(/const cashout = presentCashout\(cashoutValuation\)[\s\S]*onCashOut\(ticket\.id, cashout\.valuationFingerprint\)/)
        expect({ mappedTransport: /const cashout = presentCashout\(cashoutValuation\)[\s\S]*onCashOut\(ticket\.id, cashout\.valuationFingerprint\)/.test(bets), transactionalCommit: /addWinningsTransactional\(cashed\.payout[\s\S]*commitSportsbookAccounting\(\{/.test(shell), directNonAtomicPath: shell.includes('addWinnings(cashed.payout') }).toEqual({ mappedTransport: true, transactionalCommit: true, directNonAtomicPath: false })
    })

    it('publishes only after commit success and preserves all success state on failure', () => {
        const order = []
        const failed = coordinateSportsbookPublication(
            () => { order.push('commit'); return { ok: false, code: 'rolled-back' } },
            [() => order.push('credit'), () => order.push('tickets'), () => order.push('selection'), () => order.push('refs'), () => order.push('toast')],
        )
        expect(failed).toMatchObject({ ok: false, code: 'rolled-back' })
        expect(order).toEqual(['commit'])
        expect(coordinateSportsbookPublication(
            () => { order.push('commit-success'); return { ok: true } },
            [() => order.push('credit'), () => order.push('tickets'), () => order.push('selection'), () => order.push('refs'), () => order.push('toast')],
        ).ok).toBe(true)
        expect(order.slice(1)).toEqual(['commit-success', 'credit', 'tickets', 'selection', 'refs', 'toast'])
    })

    it('atomically commits and restores refreshed-event-not-settled cash-out without replay', () => {
        const active = ticket('sports-refreshed-cashout')
        const placed = prepareCreditTransactions(1000, [], [{ type: 'bet', label: 'Sportsbook practice ticket', amount: active.stake, transactionId: `${active.id}:debit` }], new Date(1))
        const store = storage()
        expect(commitSportsbookAccounting({ tickets: [active], nextBalance: placed.nextBalance, nextTransactions: placed.nextTransactions, savedAt: 1, storage: store })).toEqual({ ok: true, code: null, rollback: 'not-needed' })

        const restoredActive = restoreSportsbookTickets(store.values.get(SPORTSBOOK_TICKETS_V2_KEY), null).tickets[0]
        const refreshed = settlePracticeTicket(restoredActive, [{ canonicalEventId: 'other-event', status: 'pending' }], 2)
        expect(refreshed.legs[0]).toMatchObject({ status: 'pending', reason: 'event-not-settled' })
        const selection = refreshed.selections[0]
        const offer = outcome => ({
            id: outcome, canonicalEventId: selection.canonicalEventId, marketId: selection.marketId, outcome,
            bookmaker: selection.bookmaker, provider: selection.provider, providerEventId: selection.providerEventId,
            sourceContext: structuredClone(selection.sourceContext), observedAt: '2026-09-03T12:00:00.000Z', freshness: 'current',
            submittable: true, ineligibilityReason: null, suspended: false, decimalOdds: 2,
        })
        const valuation = valueSimulatedCashout({ ticket: refreshed, events: [{ canonicalEventId: selection.canonicalEventId, offers: [offer('home'), offer('away')] }] })
        const cashed = cashOutTicket(refreshed, valuation, 3)
        expect(cashed).toMatchObject({ status: 'cashed_out', result: 'cashed_out', payout: 7.8 })
        const credited = prepareCreditTransactions(placed.nextBalance, placed.nextTransactions, [{ type: 'win', label: 'Sportsbook simulated cash-out', amount: cashed.payout, transactionId: cashed.cashOut.transactionId }], new Date(3))
        const callStart = store.calls.length
        expect(commitSportsbookAccounting({ tickets: [cashed], nextBalance: credited.nextBalance, nextTransactions: credited.nextTransactions, savedAt: 3, storage: store })).toEqual({ ok: true, code: null, rollback: 'not-needed' })
        expect(store.calls.slice(callStart).map(call => call.slice(0, 2))).toEqual([
            ['getItem', SPORTSBOOK_TICKETS_V2_KEY], ['getItem', CREDIT_STORAGE_KEY], ['getItem', HISTORY_STORAGE_KEY],
            ['setItem', SPORTSBOOK_TICKETS_V2_KEY], ['setItem', CREDIT_STORAGE_KEY], ['setItem', HISTORY_STORAGE_KEY],
            ['getItem', SPORTSBOOK_TICKETS_V2_KEY], ['getItem', CREDIT_STORAGE_KEY], ['getItem', HISTORY_STORAGE_KEY],
        ])

        const committedBytes = store.values.get(SPORTSBOOK_TICKETS_V2_KEY)
        const restored = restoreSportsbookTickets(committedBytes, null)
        expect(restored.tickets[0]).toEqual(cashed)
        expect(restored.tickets[0]).toMatchObject({ status: 'cashed_out', result: 'cashed_out', payoutProcessed: true, settlementKey: cashed.settlementKey })
        const history = JSON.parse(store.values.get(HISTORY_STORAGE_KEY))
        expect(history.filter(item => item.id === cashed.cashOut.transactionId)).toHaveLength(1)
        expect(store.values.get(CREDIT_STORAGE_KEY)).toBe('997.8')
        expect(cashOutTicket(restored.tickets[0], valuation, 4)).toBe(restored.tickets[0])
        expect(prepareCreditTransactions(credited.nextBalance, history, [{ type: 'win', label: 'Sportsbook simulated cash-out', amount: cashed.payout, transactionId: cashed.cashOut.transactionId }], new Date(4))).toEqual({ ok: false, code: 'duplicate-transaction' })
        expect(restoreSportsbookTickets(committedBytes, null).tickets[0]).toEqual(cashed)
    })

    it('survives reload and settles a positive and zero ticket batch exactly once', () => {
        const positive = ticket('sports-positive')
        const zero = ticket('sports-zero')
        zero.selections[0].canonicalEventId = 'canonical-2'
        zero.legs[0].canonicalEventId = 'canonical-2'
        const secondPositive = ticket('sports-second-positive')
        secondPositive.selections[0].canonicalEventId = 'canonical-3'
        secondPositive.legs[0].canonicalEventId = 'canonical-3'
        const placedStore = storage()
        expect(commitSportsbookAccounting({ tickets: [positive, zero, secondPositive], nextBalance: 970, nextTransactions: [], savedAt: 1, storage: placedStore }).ok).toBe(true)
        const reloaded = restoreSportsbookTickets(placedStore.values.get(SPORTSBOOK_TICKETS_V2_KEY), null).tickets
        const settled = settleActiveTicketsWithEvents({
            tickets: reloaded,
            events: [
                { id: 'changed-provider-2', canonicalEventId: 'canonical-2', status: 'settled', homeScore: 0, awayScore: 2 },
                { id: 'changed-provider-3', canonicalEventId: 'canonical-3', status: 'settled', homeScore: 2, awayScore: 0 },
                { id: 'changed-provider-1', canonicalEventId: 'canonical-1', status: 'settled', homeScore: 2, awayScore: 0 },
            ],
            now: 2,
        })
        const entries = settled.payouts.map(payout => ({ type: 'win', label: 'Return', amount: payout.amount, transactionId: `${payout.settlementKey}:credit` }))
        const prepared = prepareCreditTransactions(970, [], entries, new Date(2))
        expect(entries).toHaveLength(2)
        expect(commitSportsbookAccounting({ tickets: settled.tickets, nextBalance: prepared.nextBalance, nextTransactions: prepared.nextTransactions, savedAt: 2, storage: placedStore }).ok).toBe(true)
        const twiceReloaded = restoreSportsbookTickets(placedStore.values.get(SPORTSBOOK_TICKETS_V2_KEY), null).tickets
        const replay = settleActiveTicketsWithEvents({ tickets: twiceReloaded, events: [{ canonicalEventId: 'canonical-1', status: 'settled', homeScore: 2, awayScore: 0 }], now: 3 })
        expect(replay.payouts).toEqual([])
        expect(replay.tickets.every(item => item.payoutProcessed)).toBe(true)
        expect(prepared.nextTransactions.map(item => item.id)).toEqual([
            `${settled.tickets[0].settlementKey}:credit`,
            `${settled.tickets[2].settlementKey}:credit`,
        ])
    })
})
