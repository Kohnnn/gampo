import {
    BET_MODES,
    ODDS_POLICIES,
    isValidSimulatedCashoutValuation,
    roundCurrency,
    evaluateOddsPolicy,
    quoteTicket,
    settleTicketByEventResults,
    settleTicketDeterministic,
} from './sportsbookMath'

export const DEFAULT_BETSLIP_SETTINGS = {
    order: 'singles-first',
    oddsPolicy: ODDS_POLICIES.ACCEPT_HIGHER,
    oddsFormat: 'decimal',
}

const STALE_EVENT_STATUSES = new Set(['settled', 'cancelled', 'canceled', 'final', 'ended', 'closed', 'complete', 'completed', 'abandoned', 'postponed'])

function normalizeText(value) {
    return String(value || '').trim().toLowerCase()
}

function parseNumber(value) {
    if (value === null || value === undefined || value === '') return null
    const direct = Number(value)
    if (Number.isFinite(direct)) return direct
    const match = String(value).match(/[+-]?\d+(?:\.\d+)?/)
    if (!match) return null
    const parsed = Number(match[0])
    return Number.isFinite(parsed) ? parsed : null
}

function firstNumber(values) {
    for (const value of values) {
        const parsed = parseNumber(value)
        if (parsed !== null) return parsed
    }
    return null
}

function marketTypeFor(input = {}) {
    const value = normalizeText([input.marketType, input.marketLabel, input.marketId].filter(Boolean).join(' '))
    if (value.includes('result') && (value.includes('btts') || (value.includes('both') && value.includes('teams') && value.includes('score')))) return null
    if (value.includes('btts') || (value.includes('both') && value.includes('teams') && value.includes('score'))) return null
    if (value.includes('correct') && value.includes('score')) return null
    if (value.includes('double') && value.includes('chance')) return null
    if (value.includes('dnb') || (value.includes('draw') && (value.includes('no bet') || value.includes('no-bet')))) return null
    if (value.includes('clean') && value.includes('sheet')) return null
    if ((value.includes('win') && value.includes('nil')) || value.includes('win to zero')) return null
    if (value.includes('odd') && value.includes('even')) return null
    if (value.includes('total') && (value.includes('home') || value.includes('away') || value.includes('team'))) return null
    if (value.includes('total') || value.includes('over/under') || value.includes('over under')) return 'total'
    if (value.includes('spread') || value.includes('handicap') || value.includes('run line') || value.includes('puck line')) return 'spread'
    if (value.includes('winner') || value.includes('moneyline') || value.includes('match result') || value === '1x2' || value === 'h2h') return 'winner'
    return null
}

function lineFor(input = {}) {
    return firstNumber([input.line, input.marketLine, input.selectionLine, input.handicap, input.spread, input.label, input.marketLabel])
}

function sideFor(selection = {}, event = {}) {
    const explicit = normalizeText(selection.side || selection.outcome)
    if (['home', 'away', 'draw', 'tie', 'over', 'under'].includes(explicit)) return explicit === 'tie' ? 'draw' : explicit
    const label = normalizeText(selection.label)
    const home = normalizeText(event.home || selection.eventHome)
    const away = normalizeText(event.away || selection.eventAway)
    if (home && (label === home || label.startsWith(`${home} `))) return 'home'
    if (away && (label === away || label.startsWith(`${away} `))) return 'away'
    if (/\bover\b/.test(label)) return 'over'
    if (/\bunder\b/.test(label)) return 'under'
    if (/\bhome\b/.test(label) || label === '1' || label.startsWith('team 1')) return 'home'
    if (/\baway\b/.test(label) || /\bvisitor\b/.test(label) || label === '2' || label.startsWith('team 2')) return 'away'
    if (/\bdraw\b/.test(label) || /\btie\b/.test(label) || label === 'x') return 'draw'
    return null
}

function isStaleEventStatus(status) {
    return STALE_EVENT_STATUSES.has(normalizeText(status))
}

const ACCEPTED_OUTCOMES = {
    winner: new Set(['home', 'away', 'draw']),
    total: new Set(['over', 'under']),
    spread: new Set(['home', 'away']),
}

function acceptedMarketFor(input = {}) {
    const marketId = normalizeText(input.marketId)
    return ACCEPTED_OUTCOMES[marketId] ? marketId : null
}

function supportedMarketFor(input = {}) {
    return acceptedMarketFor(input) !== null
}

function validOutcomeAndLineFor(input = {}) {
    const marketType = acceptedMarketFor(input)
    const outcome = normalizeText(input.outcome)
    if (!ACCEPTED_OUTCOMES[marketType]?.has(outcome)) return false
    return marketType === 'winner' || Number.isFinite(input.line)
}

function effectiveFixtureId(selection = {}) {
    return String(selection.canonicalEventId || '').trim() || String(selection.eventId || '').trim()
}

function eventFor(eventsOrMap, selection) {
    if (!eventsOrMap) return null
    const events = Array.isArray(eventsOrMap) ? eventsOrMap : eventsOrMap.events
    const canonicalEventId = String(selection.canonicalEventId || '').trim()
    const eventId = String(selection.eventId || '').trim()
    if (Array.isArray(events)) {
        if (canonicalEventId) return events.find(event => event.canonicalEventId === canonicalEventId) || null
        return events.find(event => event.id === eventId || event.eventId === eventId) || null
    }
    if (canonicalEventId) return eventsOrMap[canonicalEventId] || (eventsOrMap.canonicalEventId === canonicalEventId ? eventsOrMap : null)
    return eventsOrMap[eventId] || (eventsOrMap.id === eventId || eventsOrMap.eventId === eventId ? eventsOrMap : null)
}

function pendingLeg(selection) {
    return {
        selectionId: selection.selectionId,
        canonicalEventId: selection.canonicalEventId,
        eventId: selection.eventId,
        marketId: selection.marketId,
        label: selection.label,
        eventLabel: selection.eventLabel,
        marketLabel: selection.marketLabel,
        odds: Number(selection.acceptedOdds),
        status: 'pending',
        reason: 'pending',
    }
}

export function settlementKeyFor(ticket, settlement) {
    return `${ticket.id}:${settlement.legs.map(leg => `${leg.selectionId}:${leg.status}:${leg.reason || ''}`).join('|')}`
}

export function findEvent(events, eventId) {
    return events.find(event => event.id === eventId) || null
}

export function findSelection(events, selectionId) {
    for (const event of events) {
        const selection = (event.offers || []).find(item => item.id === selectionId)
        if (selection) return { event, selection }
    }
    return null
}

export function makeBetSlipSelection({ event, selection, stake = 0 }) {
    const marketType = marketTypeFor(selection)
    const line = selection.line
    const side = sideFor(selection, event)
    return {
        id: selection.id,
        selectionId: selection.id,
        canonicalEventId: selection.canonicalEventId || event.canonicalEventId || event.id,
        eventId: event.id,
        marketId: selection.marketId,
        marketType,
        outcome: selection.outcome,
        side,
        line,
        decimalOdds: selection.decimalOdds,
        acceptedOdds: selection.decimalOdds,
        currentOdds: selection.decimalOdds,
        bookmaker: selection.bookmaker,
        provider: selection.provider,
        providerEventId: selection.providerEventId,
        sourceContext: selection.sourceContext,
        observedAt: selection.observedAt,
        freshness: selection.freshness,
        submittable: selection.submittable,
        ineligibilityReason: selection.ineligibilityReason,
        suspended: Boolean(selection.suspended),
        stake,
        status: selection.suspended ? 'suspended' : 'selected',
        oddsChanged: false,
        label: selection.label || selection.outcome,
        eventLabel: `${event.home} - ${event.away}`,
        marketLabel: selection.marketLabel || selection.marketId,
        eventStatus: event.status || 'prematch',
        eventHome: event.home,
        eventAway: event.away,
        home: event.home,
        away: event.away,
        leagueId: event.leagueId,
        sportId: event.sportId,
        supportedMarket: supportedMarketFor({ ...selection, marketType, side, line }),
    }
}

export function toggleSelection(betslipSelections, events, selectionId) {
    if (betslipSelections.some(item => item.selectionId === selectionId)) {
        return betslipSelections.filter(item => item.selectionId !== selectionId)
    }
    const match = findSelection(events, selectionId)
    if (!match || match.selection.suspended) return betslipSelections
    return [
        ...betslipSelections,
        makeBetSlipSelection(match),
    ].slice(0, 10)
}

export function removeSelection(betslipSelections, selectionId) {
    return betslipSelections.filter(item => item.selectionId !== selectionId)
}

export function syncSelectionsWithEvents(betslipSelections, events) {
    return betslipSelections.map(item => {
        const match = findSelection(events, item.selectionId)
        if (!match) {
            return {
                ...item,
                status: 'locked',
                suspended: true,
                supportedMarket: false,
            }
        }
        const currentOdds = match.selection.decimalOdds
        const oddsChanged = Number(currentOdds) !== Number(item.acceptedOdds)
        const marketType = marketTypeFor(match.selection)
        const line = match.selection.line
        const side = sideFor(match.selection, match.event)
        const suspended = Boolean(match.selection.suspended)
        return {
            ...item,
            ...match.selection,
            selectionId: item.selectionId,
            canonicalEventId: item.canonicalEventId,
            eventId: item.eventId,
            acceptedOdds: item.acceptedOdds,
            currentOdds,
            oddsChanged,
            status: suspended ? 'suspended' : isStaleEventStatus(match.event.status) ? 'locked' : oddsChanged
                ? currentOdds > item.acceptedOdds ? 'odds-up' : 'odds-down'
                : 'selected',
            eventStatus: match.event.status || item.eventStatus || 'prematch',
            eventHome: match.event.home,
            eventAway: match.event.away,
            suspended,
            marketType,
            side,
            line,
            supportedMarket: supportedMarketFor({ ...match.selection, marketType, side, line }),
        }
    })
}

export function acceptSelectionOdds(betslipSelections, selectionId = null) {
    return betslipSelections.map(item => {
        if (selectionId && item.selectionId !== selectionId) return item
        return {
            ...item,
            acceptedOdds: item.currentOdds,
            oddsChanged: false,
            status: item.suspended ? 'suspended' : 'selected',
        }
    })
}

export function hasSameGameMulti(selections = []) {
    const counts = selections.reduce((acc, item) => {
        const fixtureId = effectiveFixtureId(item)
        acc[fixtureId] = (acc[fixtureId] || 0) + 1
        return acc
    }, {})
    return Object.values(counts).some(count => count > 1)
}

export function deriveBetSlipStatus({ selections = [], stake = 0, settings = DEFAULT_BETSLIP_SETTINGS, placing = false, lastTicket = null }) {
    if (placing) return 'placing'
    if (lastTicket?.status === 'accepted' || lastTicket?.status === 'active') return 'accepted'
    if (lastTicket?.status === 'rejected') return 'rejected'
    if (lastTicket?.status === 'settled') return 'settled'
    if (selections.length === 0) return 'empty'
    if (selections.some(selection => selection.suspended || selection.status === 'suspended' || selection.status === 'locked')) return 'selected'
    const policy = evaluateOddsPolicy(selections, settings.oddsPolicy)
    if (!policy.allowed) return 'odds-changed'
    if ((Number(stake) || 0) <= 0) return 'needs-stake'
    return 'ready'
}

const VALIDATION_REASONS = {
    empty: 'Pick at least one practice price.',
    'insufficient-legs': 'Add at least two selections for this practice ticket type.',
    'duplicate-selection': 'The same practice price cannot be selected twice.',
    'contradictory-market': 'Contradictory outcomes from the same fixture market cannot be combined.',
    'duplicate-fixture': 'This practice ticket type permits only one selection per fixture.',
    'model-estimate': 'Model estimates cannot be submitted as bookmaker prices.',
    'stale-offer': 'This bookmaker price is stale.',
    'unknown-freshness': 'This bookmaker price has unknown freshness.',
    'malformed-selection': 'This bookmaker price is missing required acceptance facts.',
    'unsupported-market': 'This practice market cannot be settled safely.',
    'unsupported-mode': 'This practice ticket type is unsupported.',
    suspended: 'A selected practice market is suspended.',
    locked: 'A selected practice market is locked.',
    'stake-invalid': 'Enter a valid practice stake.',
    'balance-insufficient': 'Fake-credit practice balance is too low.',
    'odds-acceptance-required': 'Accept the updated prices before placing.',
}

function invalid(code, reason = VALIDATION_REASONS[code], extra = {}) {
    return { valid: false, code, reason, ...extra }
}

function intrinsicValidation({ selections, stake, mode }) {
    if (selections.length === 0) return invalid('empty')
    if (!Object.values(BET_MODES).includes(mode)) return invalid('unsupported-mode')
    if (mode !== BET_MODES.SINGLES && selections.length < 2) return invalid('insufficient-legs')
    if (new Set(selections.map(selection => selection.selectionId || selection.id)).size !== selections.length) return invalid('duplicate-selection')
    if (selections.some(selection => selection.ineligibilityReason === 'model-estimate' || selection.bookmaker === null)) return invalid('model-estimate')
    if (selections.some(selection => selection.freshness === 'stale' || selection.ineligibilityReason === 'stale-offer')) return invalid('stale-offer')
    if (selections.some(selection => selection.freshness !== 'current')) return invalid('unknown-freshness')
    if (selections.some(selection => selection.suspended || selection.status === 'suspended')) return invalid('suspended')
    if (selections.some(selection => selection.status === 'locked' || isStaleEventStatus(selection.eventStatus))) return invalid('locked')
    const malformed = selections.some(selection => {
        const requiredStrings = ['selectionId', 'canonicalEventId', 'marketId', 'outcome', 'bookmaker', 'provider', 'providerEventId', 'observedAt']
        return requiredStrings.some(key => !String(selection[key] || '').trim())
            || !selection.sourceContext
            || !Number.isFinite(Number(selection.acceptedOdds))
            || Number(selection.acceptedOdds) <= 1
            || selection.submittable !== true
            || selection.ineligibilityReason !== null
    })
    if (malformed) return invalid('malformed-selection')
    if (selections.some(selection => selection.supportedMarket === false || !supportedMarketFor(selection))) return invalid('unsupported-market')
    if (selections.some(selection => !validOutcomeAndLineFor(selection))) return invalid('malformed-selection')
    for (let i = 0; i < selections.length; i++) {
        for (let j = i + 1; j < selections.length; j++) {
            const a = selections[i]
            const b = selections[j]
            if (effectiveFixtureId(a) === effectiveFixtureId(b)
                && marketTypeFor(a) === marketTypeFor(b)
                && lineFor(a) === lineFor(b)
                && sideFor(a) !== sideFor(b)) return invalid('contradictory-market')
        }
    }
    if (mode !== BET_MODES.SINGLES && hasSameGameMulti(selections)) return invalid('duplicate-fixture')
    const amount = Number(stake)
    if (!Number.isFinite(amount) || amount <= 0) return invalid('stake-invalid')
    return { valid: true, code: null, reason: null }
}

export function validateTicket({ selections = [], stake = 0, balance = 0, settings = DEFAULT_BETSLIP_SETTINGS, mode = BET_MODES.SINGLES }) {
    const intrinsic = intrinsicValidation({ selections, stake, mode })
    if (!intrinsic.valid) return intrinsic
    if (Number(stake) > Number(balance || 0)) return invalid('balance-insufficient')
    const policy = evaluateOddsPolicy(selections, settings.oddsPolicy)
    if (!policy.allowed) return invalid('odds-acceptance-required', policy.reason, { needsManualAccept: policy.needsManualAccept })
    return { valid: true, code: null, reason: null }
}

export function createPracticeTicket({ selections = [], stake = 0, mode = BET_MODES.SINGLES, settings = DEFAULT_BETSLIP_SETTINGS, seed = Date.now() }) {
    const validation = intrinsicValidation({ selections, stake, mode })
    if (!validation.valid) {
        const error = new Error(validation.reason)
        error.code = validation.code
        throw error
    }
    const ticketId = `sports-${seed}`
    const acceptedSelections = selections.map(selection => {
        const acceptedOdds = selection.oddsChanged ? selection.currentOdds : selection.acceptedOdds
        return {
            ...selection,
            acceptedOdds,
            currentOdds: selection.currentOdds,
            odds: acceptedOdds,
            oddsChanged: false,
            status: 'accepted',
        }
    })
    const quote = quoteTicket({ selections: acceptedSelections, stake, mode })
    return {
        id: ticketId,
        mode,
        status: 'active',
        selections: acceptedSelections,
        stake: Number(stake),
        totalOdds: quote.totalOdds,
        estimatedPayout: quote.estimatedPayout,
        combinations: quote.combinations,
        combinationDetails: quote.combinationDetails,
        quote,
        acceptedAt: Date.now(),
        settledAt: null,
        result: null,
        payout: 0,
        profit: 0,
        payoutProcessed: false,
        settlementKey: null,
        cashOut: null,
        legs: acceptedSelections.map(pendingLeg),
        pending: acceptedSelections.map(selection => selection.selectionId),
        settingsSnapshot: { ...settings },
    }
}

function settleTicketWithEvents(ticket, events, now = Date.now()) {
    const selections = (ticket.selections || []).map(selection => {
        const event = eventFor(events, selection)
        return {
            ...selection,
            status: undefined,
            eventStatus: event?.status || selection.eventStatus,
            homeScore: event?.homeScore ?? event?.score?.home ?? selection.homeScore,
            awayScore: event?.awayScore ?? event?.score?.away ?? selection.awayScore,
        }
    })
    const settlement = settleTicketByEventResults({
        selections,
        stake: ticket.stake,
        mode: ticket.mode,
        eventResults: events,
    })
    if (settlement.status === 'pending') {
        return {
            ...ticket,
            status: 'active',
            settledAt: null,
            result: null,
            payout: 0,
            profit: 0,
            payoutProcessed: false,
            settlementKey: null,
            legs: settlement.legs,
            combinations: settlement.combinations,
            combinationDetails: settlement.combinationDetails,
            pending: settlement.legs.filter(leg => leg.status === 'pending').map(leg => leg.selectionId),
        }
    }
    const settlementKey = settlementKeyFor(ticket, settlement)
    return {
        ...ticket,
        status: 'settled',
        settledAt: now,
        result: settlement.result,
        profit: settlement.profit,
        payout: settlement.payout,
        legs: settlement.legs,
        combinations: settlement.combinations,
        combinationDetails: settlement.combinationDetails,
        pending: [],
        settlementKey,
    }
}

function settleTicketWithSeed(ticket, seed = '', now = Date.now()) {
    if (normalizeText(seed).includes('live')) return ticket
    const settlement = settleTicketDeterministic({
        ticketId: ticket.id,
        selections: ticket.selections,
        stake: ticket.stake,
        mode: ticket.mode,
        seed,
    })
    const settlementKey = settlementKeyFor(ticket, {
        legs: settlement.legs.map(leg => ({ ...leg, status: leg.won ? 'won' : 'lost' })),
    })
    return {
        ...ticket,
        status: 'settled',
        settledAt: now,
        result: settlement.result,
        profit: settlement.profit,
        payout: settlement.payout,
        payoutProcessed: true,
        settlementKey,
        legs: settlement.legs,
        pending: [],
    }
}

export function settlePracticeTicket(ticket, eventsOrSeed = null, now = Date.now()) {
    if (!ticket || ticket.status === 'settled' || ticket.status === 'cancelled' || ticket.status === 'canceled') return ticket
    if (typeof eventsOrSeed === 'string') return settleTicketWithSeed(ticket, eventsOrSeed, now)
    if (!eventsOrSeed) return ticket
    const settled = settleTicketWithEvents(ticket, eventsOrSeed, now)
    if (settled.status !== 'settled') return settled
    return {
        ...settled,
        payoutProcessed: true,
    }
}

export function cashOutTicket(ticket, valuation, settledAt = Date.now()) {
    if (!ticket || (ticket.status !== 'active' && ticket.status !== 'accepted') || !Number.isInteger(settledAt) || settledAt < 0) return ticket
    if (!isValidSimulatedCashoutValuation(ticket, valuation)) return ticket
    const settlementKey = `${ticket.id}:cashout:${valuation.valuationFingerprint}`
    return {
        ...ticket,
        status: 'cashed_out',
        settledAt,
        result: 'cashed_out',
        payout: valuation.amount,
        profit: roundCurrency(valuation.amount - ticket.stake),
        payoutProcessed: true,
        settlementKey,
        cashOut: {
            schemaVersion: 1,
            status: 'accepted',
            acceptedAt: settledAt,
            transactionId: `${settlementKey}:credit`,
            valuation: structuredClone(valuation),
        },
        legs: ticket.legs.map(leg => leg.status === 'pending' ? { ...leg, status: 'cashed_out', reason: 'cashed-out' } : leg),
        pending: [],
    }
}

export function settleActiveTicketsWithEvents({ tickets = [], events = [], creditedTicketIds = new Set(), now = Date.now() }) {
    const credited = creditedTicketIds instanceof Set ? creditedTicketIds : new Set(creditedTicketIds)
    const payouts = []
    const nextTickets = tickets.map(ticket => {
        if (!ticket || (ticket.status !== 'active' && ticket.status !== 'accepted')) return ticket
        const settled = settleTicketWithEvents(ticket, events, now)
        if (settled.status !== 'settled') return settled
        const alreadyCredited = credited.has(settled.id) || credited.has(settled.settlementKey) || ticket.payoutProcessed
        if (settled.payout > 0 && !alreadyCredited) {
            payouts.push({
                ticketId: settled.id,
                amount: settled.payout,
                payout: settled.payout,
                profit: settled.profit,
                result: settled.result,
                settlementKey: settled.settlementKey,
            })
            return { ...settled, payoutProcessed: true }
        }
        return { ...settled, payoutProcessed: true }
    })
    return { tickets: nextTickets, payouts }
}
