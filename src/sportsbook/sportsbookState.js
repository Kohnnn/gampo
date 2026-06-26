import {
    BET_MODES,
    ODDS_POLICIES,
    cashoutOffer,
    evaluateOddsPolicy,
    quoteTicket,
    resolveSelectionFromScore,
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

function supportedMarketFor(input = {}) {
    const marketType = marketTypeFor(input)
    if (!marketType) return false
    const line = lineFor(input)
    if ((marketType === 'spread' || marketType === 'total') && line === null) return false
    const probe = resolveSelectionFromScore({
        marketType,
        selectionLabel: marketType === 'total' ? input.label || 'Over' : input.label || 'Home',
        side: input.side || (marketType === 'total' ? 'over' : 'home'),
        line,
        marketLine: line,
        home: input.eventHome || input.home || 'Home',
        away: input.eventAway || input.away || 'Away',
        homeScore: 1,
        awayScore: 0,
        eventStatus: 'settled',
    })
    return probe.reason !== 'unsupported-market'
}

function eventFor(eventsOrMap, eventId) {
    if (!eventsOrMap || !eventId) return null
    const events = Array.isArray(eventsOrMap) ? eventsOrMap : eventsOrMap.events
    if (Array.isArray(events)) return events.find(event => event.id === eventId || event.eventId === eventId) || null
    if (eventsOrMap[eventId]) return eventsOrMap[eventId]
    return eventsOrMap.id === eventId || eventsOrMap.eventId === eventId ? eventsOrMap : null
}

function pendingLeg(selection) {
    return {
        selectionId: selection.selectionId,
        eventId: selection.eventId,
        marketId: selection.marketId,
        label: selection.label,
        eventLabel: selection.eventLabel,
        marketLabel: selection.marketLabel,
        odds: Number(selection.acceptedOdds || selection.currentOdds || 0),
        status: 'pending',
        reason: 'pending',
    }
}

function settlementKeyFor(ticket, settlement) {
    return `${ticket.id}:${settlement.legs.map(leg => `${leg.selectionId}:${leg.status}:${leg.reason || ''}`).join('|')}`
}

export function findEvent(events, eventId) {
    return events.find(event => event.id === eventId) || null
}

export function findSelection(events, selectionId) {
    for (const event of events) {
        for (const marketGroup of event.marketGroups || []) {
            const selection = (marketGroup.selections || []).find(item => item.id === selectionId)
            if (selection) return { event, marketGroup, selection }
        }
    }
    return null
}

export function makeBetSlipSelection({ event, marketGroup, selection, stake = 0 }) {
    const marketType = marketTypeFor({ marketType: selection.marketType, marketLabel: marketGroup.label, marketId: marketGroup.id })
    const line = lineFor({ ...selection, marketLabel: marketGroup.label, marketId: marketGroup.id })
    const side = sideFor(selection, event)
    return {
        ...selection,
        selectionId: selection.id,
        eventId: event.id,
        marketId: marketGroup.id,
        marketType,
        side,
        line,
        acceptedOdds: selection.decimalOdds,
        currentOdds: selection.decimalOdds,
        stake,
        status: selection.suspended ? 'suspended' : 'selected',
        oddsChanged: false,
        label: selection.label,
        eventLabel: `${event.home} - ${event.away}`,
        marketLabel: marketGroup.label,
        eventStatus: event.status || 'prematch',
        eventHome: event.home,
        eventAway: event.away,
        leagueId: event.leagueId,
        sportId: event.sportId,
        trueProbability: selection.trueProbability,
        suspended: Boolean(selection.suspended),
        supportedMarket: supportedMarketFor({ marketType, marketLabel: marketGroup.label, marketId: marketGroup.id, label: selection.label, side, line, eventHome: event.home, eventAway: event.away }),
        boosted: selection.boosted,
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
        const marketType = marketTypeFor({ marketType: match.selection.marketType || item.marketType, marketLabel: match.marketGroup.label, marketId: match.marketGroup.id })
        const line = lineFor({ ...item, ...match.selection, marketLabel: match.marketGroup.label, marketId: match.marketGroup.id })
        const side = sideFor({ ...item, ...match.selection }, match.event)
        const suspended = Boolean(match.selection.suspended)
        return {
            ...item,
            currentOdds,
            oddsChanged,
            status: suspended ? 'suspended' : isStaleEventStatus(match.event.status) ? 'locked' : oddsChanged
                ? currentOdds > item.acceptedOdds ? 'odds-up' : 'odds-down'
                : 'selected',
            eventStatus: match.event.status || item.eventStatus || 'prematch',
            eventHome: match.event.home,
            eventAway: match.event.away,
            suspended,
            trueProbability: match.selection.trueProbability,
            boosted: match.selection.boosted,
            marketType,
            side,
            line,
            supportedMarket: supportedMarketFor({ marketType, marketLabel: match.marketGroup.label, marketId: match.marketGroup.id, label: match.selection.label, side, line, eventHome: match.event.home, eventAway: match.event.away }),
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
        acc[item.eventId] = (acc[item.eventId] || 0) + 1
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

export function validateTicket({ selections = [], stake = 0, balance = 0, settings = DEFAULT_BETSLIP_SETTINGS, mode = BET_MODES.SINGLES }) {
    if (selections.length === 0) return { valid: false, reason: 'Pick at least one practice price.' }
    if (mode !== BET_MODES.SINGLES && selections.length < 2) return { valid: false, reason: 'Add at least two selections for this practice ticket type.' }
    if (selections.some(selection => selection.supportedMarket === false || !supportedMarketFor(selection))) {
        return { valid: false, reason: 'This practice market cannot be settled from score/status yet.' }
    }
    if (selections.some(selection => isStaleEventStatus(selection.eventStatus))) {
        return { valid: false, reason: 'This practice event is no longer open for ticket placement.' }
    }
    if (selections.some(selection => selection.suspended || selection.status === 'suspended')) {
        return { valid: false, reason: 'A selected practice market is suspended.' }
    }
    if (selections.some(selection => selection.status === 'locked')) {
        return { valid: false, reason: 'A selected practice market is locked.' }
    }
    const amount = Number(stake) || 0
    if (amount <= 0) return { valid: false, reason: 'Enter a practice stake.' }
    if (amount > Number(balance || 0)) return { valid: false, reason: 'Fake-credit practice balance is too low.' }
    const policy = evaluateOddsPolicy(selections, settings.oddsPolicy)
    if (!policy.allowed) return { valid: false, reason: policy.reason, needsManualAccept: policy.needsManualAccept }
    return { valid: true, reason: null }
}

export function createPracticeTicket({ selections, stake, mode = BET_MODES.SINGLES, settings = DEFAULT_BETSLIP_SETTINGS, seed = Date.now() }) {
    const ticketId = `sports-${seed}`
    const acceptedSelections = selections.map(selection => {
        const acceptedOdds = selection.oddsChanged ? selection.currentOdds : selection.acceptedOdds
        return {
            ...selection,
            acceptedOdds,
            currentOdds: acceptedOdds,
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
        stake: Number(stake) || 0,
        totalOdds: quote.totalOdds,
        estimatedPayout: quote.estimatedPayout,
        quote,
        acceptedAt: Date.now(),
        settledAt: null,
        result: null,
        payout: 0,
        profit: 0,
        payoutProcessed: false,
        settlementKey: null,
        legs: acceptedSelections.map(pendingLeg),
        pending: acceptedSelections.map(selection => selection.selectionId),
        settingsSnapshot: { ...settings },
    }
}

function settleTicketWithEvents(ticket, events, now = Date.now()) {
    const selections = (ticket.selections || []).map(selection => {
        const event = eventFor(events, selection.eventId)
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
            legs: settlement.legs,
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

export function cashOutTicket(ticket, now = Date.now()) {
    if (!ticket) return ticket
    if (ticket.status === 'cashed_out') return ticket
    if (ticket.status !== 'active' && ticket.status !== 'accepted') return ticket
    const offer = cashoutOffer(ticket, now)
    if (offer <= 0) return ticket
    const legs = (ticket.legs || []).map(leg => (
        leg.status === 'pending' ? { ...leg, status: 'cashed_out', reason: 'cashed-out' } : leg
    ))
    return {
        ...ticket,
        status: 'cashed_out',
        settledAt: now,
        result: 'cashed_out',
        payout: offer,
        profit: roundCurrencyOffer(offer - (Number(ticket.stake) || 0)),
        payoutProcessed: true,
        settlementKey: `${ticket.id}:cashed_out`,
        legs,
        pending: [],
    }
}

function roundCurrencyOffer(value) {
    return Math.round((Number(value) || 0) * 100) / 100
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
        return { ...settled, payoutProcessed: Boolean(ticket.payoutProcessed || credited.has(settled.id) || credited.has(settled.settlementKey)) }
    })
    return { tickets: nextTickets, payouts }
}
