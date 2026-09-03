import { describe, expect, it } from 'vitest'
import {
    deriveSportsbookShellState,
    formatObservedAge,
    presentCashout,
    presentFeedCondition,
    presentOffer,
    presentRestoreResult,
    presentTicketLifecycle,
} from './sportsbookPresentation'

const currentOffer = {
    id: 'offer-1',
    bookmaker: 'Book A',
    provider: 'odds-api-io',
    sourceContext: { payloadGroup: 'oddsApiIo', observationSource: 'bookmaker' },
    observedAt: '2026-09-03T11:58:00.000Z',
    freshness: 'current',
    submittable: true,
    ineligibilityReason: null,
    suspended: false,
    marketLabel: 'Winner',
    outcome: 'home',
    label: 'Alpha',
    decimalOdds: 1.9,
}

const providerEvent = { id: 'event-1', source: 'odds-api-io', offers: [currentOffer], modelEstimates: [] }
const modelEvent = { id: 'model-1', source: 'synthetic', offers: [], modelEstimates: [{ ...currentOffer, bookmaker: null, provider: 'gampo-model', submittable: false, ineligibilityReason: 'model-estimate' }] }

function shell(overrides = {}) {
    return {
        requestPending: false,
        requestFailed: false,
        lastSuccessfulSnapshot: null,
        feedState: { status: 'current' },
        feedEvents: [providerEvent],
        events: [providerEvent],
        errors: [],
        generatedAt: '2026-09-03T12:00:00.000Z',
        providerSources: { oddsApiIo: { configured: true, eventCount: 1 } },
        ...overrides,
    }
}

describe('deriveSportsbookShellState', () => {
    it('does not expose fallback events as received truth while loading, empty, or failed', () => {
        for (const input of [
            shell({ requestPending: true, feedEvents: [], events: [modelEvent], feedState: { status: 'empty' } }),
            shell({ feedEvents: [], events: [], feedState: { status: 'empty' } }),
            shell({ feedEvents: [], events: [], feedState: { status: 'error' } }),
        ]) expect(deriveSportsbookShellState(input).events).toEqual([])
    })

    it.each([
        ['loading', shell({ requestPending: true, feedEvents: [], events: [], feedState: { status: 'empty' } })],
        ['retained-stale', shell({ requestFailed: true, lastSuccessfulSnapshot: { feedEvents: [providerEvent] } })],
        ['error', shell({ feedState: { status: 'error' }, feedEvents: [], events: [] })],
        ['partial-provider', shell({ feedState: { status: 'partial' }, errors: ['provider failed'] })],
        ['stale', shell({ feedEvents: [{ ...providerEvent, offers: [{ ...currentOffer, freshness: 'stale', submittable: false, ineligibilityReason: 'stale-offer' }] }] })],
        ['model-only', shell({ feedEvents: [modelEvent], events: [modelEvent] })],
        ['empty', shell({ feedState: { status: 'empty' }, feedEvents: [], events: [] })],
        ['current', shell()],
        ['model-only', shell({ feedState: { status: 'empty' }, providerSources: {}, feedEvents: [], events: [modelEvent] })],
    ])('uses first-match precedence for %s', (expected, input) => {
        expect(deriveSportsbookShellState(input).state).toBe(expected)
    })
})

describe('presentation copy', () => {
    it.each([
        ['loading', 'Loading sportsbook feed', 'Checking local feed sources.', false],
        ['current', 'Current bookmaker feed', 'Current attributable prices are available.', true],
        ['stale', 'Stale bookmaker prices', 'Prices are visible for reference and cannot be submitted.', true],
        ['retained-stale', 'Refresh failed — showing retained data', 'Timestamps are unchanged; retry to check for newer prices.', true],
        ['partial-provider', 'Partial provider feed', 'Available sources are shown; one or more sources failed.', true],
        ['model-only', 'Model estimates only', 'Generated analysis is not a bookmaker price and cannot be submitted.', true],
        ['empty', 'No sportsbook events available', 'No received fixtures or model estimates are available.', true],
        ['error', 'Sportsbook feed unavailable', 'No trustworthy feed data is available.', true],
    ])('presents exact %s feed copy', (state, heading, body, retryable) => {
        expect(presentFeedCondition({ state, generatedAt: '2026-09-03T12:00:00.000Z', sources: ['Book A'] })).toMatchObject({ state, heading, body, retryable })
    })

    it.each([
        [{ ok: false, tickets: [], quarantine: [], sourceVersion: 2, migration: 'unavailable' }, 'failed', 'Saved tickets could not be restored; no saved ticket data was applied.'],
        [{ ok: true, tickets: [{}], quarantine: [{}], sourceVersion: 2, migration: 'not-needed' }, 'isolated', 'Restored 1 valid practice ticket; isolated 1 unsupported or damaged record.'],
        [{ ok: true, tickets: [{}], quarantine: [], sourceVersion: 1, migration: 'required', migrationPersisted: true }, 'migrated', 'Restored 1 legacy practice ticket into the current local format.'],
        [{ ok: true, tickets: [{}], quarantine: [], sourceVersion: 1, migration: 'required', migrationPersisted: false }, 'migration-persist-failed', 'Legacy tickets were validated but could not be saved in the current local format.'],
        [{ ok: true, tickets: [{}, {}], quarantine: [], sourceVersion: 2, migration: 'not-needed' }, 'clean', 'Restored 2 practice tickets.'],
        [{ ok: true, tickets: [], quarantine: [], sourceVersion: null, migration: 'not-needed' }, 'none', ''],
    ])('presents restore results without payload details', (result, state, message) => {
        expect(presentRestoreResult(result)).toMatchObject({ state, message })
    })
})

describe('role-specific presentation', () => {
    it('presents attributable offer evidence and age', () => {
        expect(formatObservedAge(currentOffer.observedAt, '2026-09-03T12:00:00.000Z')).toBe('2m ago')
        expect(presentOffer(currentOffer, '2026-09-03T12:00:00.000Z')).toMatchObject({
            role: 'bookmaker-offer',
            bookmaker: 'Book A',
            provider: 'odds-api-io',
            observed: '2m ago',
            freshness: 'Current',
            eligible: true,
            reason: null,
        })
        expect(presentOffer({ ...currentOffer, bookmaker: null, provider: 'gampo-model', submittable: false, ineligibilityReason: 'model-estimate' })).toMatchObject({
            role: 'model-estimate',
            heading: 'Model estimate',
            explanation: 'Generated analysis — not a bookmaker price',
            eligible: false,
        })
    })

    it.each([
        ['ticket-ineligible', 'This ticket is not eligible for simulated cash-out.'],
        ['ticket-terminal', 'This ticket is already final.'],
        ['leg-lost', 'A losing leg makes simulated cash-out unavailable.'],
        ['unsupported-leg', 'This ticket contains an unsupported leg state.'],
        ['probability-unmatched', 'No matching current bookmaker cohort is available.'],
        ['probability-conflict', 'Current bookmaker inputs conflict.'],
        ['probability-stale', 'Current probability inputs are stale.'],
        ['probability-malformed', 'Current probability inputs are invalid.'],
        ['probability-incomplete', 'A complete bookmaker outcome set is unavailable.'],
        ['non-positive-value', 'No positive simulated cash-out value is available.'],
        ['valuation-mismatch', 'The displayed value changed; review the refreshed offer.'],
        ['unknown', 'Simulated cash-out is unavailable.'],
    ])('maps cash-out reason %s', (reason, message) => {
        expect(presentCashout({ available: false, reason })).toMatchObject({ available: false, message })
    })

    it('preserves available cash-out provenance', () => {
        expect(presentCashout({ available: true, amount: 7.8, currency: 'GC', label: 'Simulated cash-out', inputObservedAt: currentOffer.observedAt, sources: ['Book A:odds-api-io'], valuationFingerprint: 'fingerprint' }, '2026-09-03T12:00:00.000Z')).toMatchObject({
            available: true,
            actionLabel: 'Simulated cash-out GC 7.80',
            observed: '2m ago',
            sources: ['Book A:odds-api-io'],
        })
    })

    it.each([
        [{ status: 'active' }, 'Pending practice ticket'],
        [{ status: 'accepted' }, 'Pending practice ticket'],
        [{ status: 'settled', result: 'win' }, 'Won — fake-credit return'],
        [{ status: 'settled', result: 'loss' }, 'Lost — no fake-credit return'],
        [{ status: 'settled', result: 'partial' }, 'Partial return'],
        [{ status: 'settled', result: 'push' }, 'Push — stake returned'],
        [{ status: 'settled', result: 'full-void' }, 'Full void — stake returned'],
        [{ status: 'cashed_out' }, 'Simulated cash-out accepted'],
    ])('maps ticket lifecycle %j', (ticket, label) => {
        expect(presentTicketLifecycle(ticket).label).toBe(label)
    })
})
