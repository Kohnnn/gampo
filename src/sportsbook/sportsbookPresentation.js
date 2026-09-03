const FEED_COPY = Object.freeze({
    loading: ['Loading sportsbook feed', 'Checking local feed sources.', false],
    current: ['Current bookmaker feed', 'Current attributable prices are available.', true],
    stale: ['Stale bookmaker prices', 'Prices are visible for reference and cannot be submitted.', true],
    'retained-stale': ['Refresh failed — showing retained data', 'Timestamps are unchanged; retry to check for newer prices.', true],
    'partial-provider': ['Partial provider feed', 'Available sources are shown; one or more sources failed.', true],
    'model-only': ['Model estimates only', 'Generated analysis is not a bookmaker price and cannot be submitted.', true],
    empty: ['No sportsbook events available', 'No received fixtures or model estimates are available.', true],
    error: ['Sportsbook feed unavailable', 'No trustworthy feed data is available.', true],
})

const CASHOUT_COPY = Object.freeze({
    'ticket-ineligible': 'This ticket is not eligible for simulated cash-out.',
    'ticket-terminal': 'This ticket is already final.',
    'leg-lost': 'A losing leg makes simulated cash-out unavailable.',
    'unsupported-leg': 'This ticket contains an unsupported leg state.',
    'probability-unmatched': 'No matching current bookmaker cohort is available.',
    'probability-conflict': 'Current bookmaker inputs conflict.',
    'probability-stale': 'Current probability inputs are stale.',
    'probability-malformed': 'Current probability inputs are invalid.',
    'probability-incomplete': 'A complete bookmaker outcome set is unavailable.',
    'non-positive-value': 'No positive simulated cash-out value is available.',
    'valuation-mismatch': 'The displayed value changed; review the refreshed offer.',
})

const OFFER_COPY = Object.freeze({
    'model-estimate': 'Generated analysis — not a bookmaker price',
    'missing-bookmaker': 'Bookmaker attribution is unavailable.',
    'invalid-odds': 'This price is invalid.',
    'stale-offer': 'This bookmaker price is stale.',
    'unknown-freshness': 'This bookmaker price has unknown freshness.',
})

const TICKET_COPY = Object.freeze({
    win: 'Won — fake-credit return',
    loss: 'Lost — no fake-credit return',
    partial: 'Partial return',
    push: 'Push — stake returned',
    'full-void': 'Full void — stake returned',
})

function eventOffers(events = []) {
    return events.flatMap(event => Array.isArray(event?.offers) ? event.offers : [])
}

function eventEstimates(events = []) {
    return events.flatMap(event => Array.isArray(event?.modelEstimates) ? event.modelEstimates : [])
}

function usableEvents(input) {
    return Array.isArray(input?.feedEvents) && input.feedEvents.length ? input.feedEvents : Array.isArray(input?.events) ? input.events : []
}

export function deriveSportsbookShellState(input = {}) {
    const fallbackEvents = usableEvents(input)
    const configuredEmpty = input.feedState?.status === 'empty' && Object.values(input.providerSources || {}).some(source => source?.configured)
    const suppressFallback = (input.requestPending && !input.lastSuccessfulSnapshot?.feedEvents?.length) || (input.feedState?.status === 'error' && !input.lastSuccessfulSnapshot?.feedEvents?.length) || configuredEmpty
    const events = suppressFallback ? [] : fallbackEvents
    const offers = eventOffers(events)
    const estimates = eventEstimates(events)
    const hasUsableEvent = events.length > 0
    const hasEligibleOffer = offers.some(offer => offer?.freshness === 'current' && offer?.submittable === true && offer?.ineligibilityReason === null)
    const hasAttributableOffer = offers.some(offer => Boolean(offer?.bookmaker && offer?.provider))
    const hasSuccessfulSnapshot = Boolean(input.lastSuccessfulSnapshot?.feedEvents?.length)
    let state
    if (input.requestPending && !hasSuccessfulSnapshot) state = 'loading'
    else if (input.requestFailed && hasSuccessfulSnapshot) state = 'retained-stale'
    else if (input.feedState?.status === 'error' && !hasUsableEvent) state = 'error'
    else if (input.feedState?.status === 'partial' && hasUsableEvent) state = 'partial-provider'
    else if (hasUsableEvent && !hasEligibleOffer) state = hasAttributableOffer ? 'stale' : 'model-only'
    else if (input.feedState?.status === 'empty' && !hasUsableEvent && estimates.length === 0) state = 'empty'
    else if (hasEligibleOffer) state = 'current'
    else state = eventEstimates(input.events).length || input.events?.length ? 'model-only' : 'empty'
    return { state, events, generatedAt: input.generatedAt || null, errors: [...(input.errors || [])] }
}

export function formatObservedAge(observedAt, now = new Date().toISOString()) {
    const observedMs = Date.parse(observedAt)
    const nowMs = Date.parse(now)
    if (!Number.isFinite(observedMs) || !Number.isFinite(nowMs)) return 'Observation time unavailable'
    const seconds = Math.max(0, Math.floor((nowMs - observedMs) / 1000))
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
}

export function presentFeedCondition({ state = 'empty', generatedAt = null, sources = [], errors = [] } = {}) {
    const [heading, body, retryable] = FEED_COPY[state] || FEED_COPY.empty
    return {
        state,
        heading,
        body,
        retryable,
        generatedAt,
        refreshed: generatedAt ? formatObservedAge(generatedAt) : 'Refresh time unavailable',
        sources: [...sources],
        error: errors[0] || null,
        messageKey: `${state}:${generatedAt || 'unknown'}:${errors.join('|')}`,
    }
}

function plural(value, singular, pluralValue = `${singular}s`) {
    return `${value} ${value === 1 ? singular : pluralValue}`
}

export function presentRestoreResult(result = {}) {
    const valid = Array.isArray(result.tickets) ? result.tickets.length : 0
    const isolated = Array.isArray(result.quarantine) ? result.quarantine.length : 0
    const base = { valid, isolated, sourceVersion: result.sourceVersion ?? null, announce: true }
    if (!result.ok) return { ...base, state: 'failed', message: 'Saved tickets could not be restored; no saved ticket data was applied.', blocking: true }
    if (result.migration === 'required' && result.migrationPersisted === false) return { ...base, state: 'migration-persist-failed', message: 'Legacy tickets were validated but could not be saved in the current local format.', blocking: true }
    if (isolated) return { ...base, state: 'isolated', message: `Restored ${plural(valid, 'valid practice ticket')}; isolated ${plural(isolated, 'unsupported or damaged record')}.`, blocking: false }
    if (result.migration === 'required') return { ...base, state: 'migrated', message: `Restored ${plural(valid, 'legacy practice ticket')} into the current local format.`, blocking: false }
    if (valid) return { ...base, state: 'clean', message: `Restored ${plural(valid, 'practice ticket')}.`, blocking: false }
    return { ...base, state: 'none', message: '', blocking: false, announce: false }
}

export function presentOffer(offer = {}, now) {
    const model = offer.ineligibilityReason === 'model-estimate' || offer.bookmaker === null || offer.provider === 'gampo-model' || offer.estimated === true || offer.source === 'synthetic-estimate'
    const eligible = !model && offer.submittable === true && offer.freshness === 'current' && offer.ineligibilityReason === null && offer.suspended !== true
    return {
        role: model ? 'model-estimate' : 'bookmaker-offer',
        heading: model ? 'Model estimate' : offer.bookmaker || 'Bookmaker unavailable',
        explanation: model ? OFFER_COPY['model-estimate'] : null,
        bookmaker: offer.bookmaker || null,
        provider: offer.provider || 'Source unavailable',
        sourceContext: offer.sourceContext || null,
        observedAt: offer.observedAt || null,
        observed: formatObservedAge(offer.observedAt, now),
        freshness: offer.freshness === 'current' ? 'Current' : offer.freshness === 'stale' ? 'Stale' : 'Unknown freshness',
        eligible,
        reason: eligible ? null : OFFER_COPY[offer.ineligibilityReason] || (offer.suspended ? 'This market is suspended.' : 'This price cannot be submitted.'),
        market: offer.marketLabel || offer.marketId || 'Market unavailable',
        outcome: offer.label || offer.outcome || 'Outcome unavailable',
        decimalOdds: Number(offer.decimalOdds),
    }
}

export function presentCashout(valuation = {}, now) {
    if (valuation.available !== true) return { available: false, message: CASHOUT_COPY[valuation.reason] || 'Simulated cash-out is unavailable.', reason: valuation.reason || 'unknown' }
    return {
        available: true,
        actionLabel: `Simulated cash-out GC ${Number(valuation.amount).toFixed(2)}`,
        amount: valuation.amount,
        currency: 'GC',
        observedAt: valuation.inputObservedAt,
        observed: formatObservedAge(valuation.inputObservedAt, now),
        sources: [...(valuation.sources || [])],
        valuationFingerprint: valuation.valuationFingerprint,
        message: null,
    }
}

export function presentTicketLifecycle(ticket = {}) {
    let label = 'Pending practice ticket'
    if (ticket.status === 'cashed_out') label = 'Simulated cash-out accepted'
    else if (ticket.status === 'settled') label = TICKET_COPY[ticket.result] || 'Practice ticket final'
    return { label, status: ticket.status || 'unknown', result: ticket.result || null }
}

export { CASHOUT_COPY, FEED_COPY, OFFER_COPY, TICKET_COPY }
