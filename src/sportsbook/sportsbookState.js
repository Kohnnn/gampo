import { BET_MODES, ODDS_POLICIES, evaluateOddsPolicy, quoteTicket, settleTicketDeterministic } from './sportsbookMath'

export const DEFAULT_BETSLIP_SETTINGS = {
    order: 'singles-first',
    oddsPolicy: ODDS_POLICIES.ACCEPT_HIGHER,
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
    return {
        selectionId: selection.id,
        eventId: event.id,
        marketId: marketGroup.id,
        acceptedOdds: selection.decimalOdds,
        currentOdds: selection.decimalOdds,
        stake,
        status: selection.suspended ? 'suspended' : 'selected',
        oddsChanged: false,
        label: selection.label,
        eventLabel: `${event.home} - ${event.away}`,
        marketLabel: marketGroup.label,
        leagueId: event.leagueId,
        sportId: event.sportId,
        trueProbability: selection.trueProbability,
        suspended: selection.suspended,
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
        if (!match) return { ...item, status: 'locked', suspended: true }
        const currentOdds = match.selection.decimalOdds
        const oddsChanged = Number(currentOdds) !== Number(item.acceptedOdds)
        return {
            ...item,
            currentOdds,
            oddsChanged,
            status: match.selection.suspended ? 'suspended' : oddsChanged
                ? currentOdds > item.acceptedOdds ? 'odds-up' : 'odds-down'
                : 'selected',
            suspended: match.selection.suspended,
            trueProbability: match.selection.trueProbability,
            boosted: match.selection.boosted,
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
    if (lastTicket?.status === 'accepted') return 'accepted'
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
    if (selections.length === 0) return { valid: false, reason: 'Pick at least one price.' }
    if (mode !== BET_MODES.SINGLES && selections.length < 2) return { valid: false, reason: 'Add at least two selections for this ticket type.' }
    if (selections.some(selection => selection.suspended || selection.status === 'suspended' || selection.status === 'locked')) {
        return { valid: false, reason: 'A selected market is suspended.' }
    }
    const amount = Number(stake) || 0
    if (amount <= 0) return { valid: false, reason: 'Enter a practice stake.' }
    if (amount > Number(balance || 0)) return { valid: false, reason: 'Practice balance is too low.' }
    const policy = evaluateOddsPolicy(selections, settings.oddsPolicy)
    if (!policy.allowed) return { valid: false, reason: policy.reason, needsManualAccept: policy.needsManualAccept }
    return { valid: true, reason: null }
}

export function createPracticeTicket({ selections, stake, mode = BET_MODES.SINGLES, settings = DEFAULT_BETSLIP_SETTINGS, seed = Date.now() }) {
    const ticketId = `sports-${seed}`
    const acceptedSelections = selections.map(selection => ({
        ...selection,
        acceptedOdds: selection.oddsChanged ? selection.currentOdds : selection.acceptedOdds,
        oddsChanged: false,
    }))
    const quote = quoteTicket({ selections: acceptedSelections, stake, mode })
    return {
        id: ticketId,
        mode,
        status: 'accepted',
        selections: acceptedSelections,
        stake: Number(stake) || 0,
        totalOdds: quote.totalOdds,
        estimatedPayout: quote.estimatedPayout,
        quote,
        acceptedAt: Date.now(),
        settledAt: null,
        result: null,
        profit: 0,
        settingsSnapshot: { ...settings },
    }
}

export function settlePracticeTicket(ticket, seed = '') {
    const settlement = settleTicketDeterministic({
        ticketId: ticket.id,
        selections: ticket.selections,
        stake: ticket.stake,
        mode: ticket.mode,
        seed,
    })
    return {
        ...ticket,
        status: 'settled',
        settledAt: Date.now(),
        result: settlement.result,
        profit: settlement.profit,
        payout: settlement.payout,
        legs: settlement.legs,
    }
}
