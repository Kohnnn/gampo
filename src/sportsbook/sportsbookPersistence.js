import { isValidSimulatedCashoutValuation, quoteTicket, roundCurrency } from './sportsbookMath'
import { settlementKeyFor } from './sportsbookState'

export const SPORTSBOOK_TICKETS_V1_KEY = 'gampo_sportsbook_tickets_v1'
export const SPORTSBOOK_TICKETS_V2_KEY = 'gampo_sportsbook_tickets_v2'
export const CREDIT_STORAGE_KEY = 'gampo_credits'
export const HISTORY_STORAGE_KEY = 'gampo_history'

const TICKET_KEYS = ['id', 'mode', 'status', 'selections', 'stake', 'totalOdds', 'estimatedPayout', 'combinations', 'combinationDetails', 'quote', 'acceptedAt', 'settledAt', 'result', 'payout', 'profit', 'payoutProcessed', 'settlementKey', 'cashOut', 'legs', 'pending', 'settingsSnapshot']
const SELECTION_KEYS = ['id', 'selectionId', 'canonicalEventId', 'eventId', 'marketId', 'marketType', 'outcome', 'side', 'line', 'decimalOdds', 'acceptedOdds', 'currentOdds', 'odds', 'bookmaker', 'provider', 'providerEventId', 'sourceContext', 'observedAt', 'freshness', 'submittable', 'ineligibilityReason', 'suspended', 'stake', 'status', 'oddsChanged', 'label', 'eventLabel', 'marketLabel', 'eventStatus', 'eventHome', 'eventAway', 'home', 'away', 'leagueId', 'sportId', 'supportedMarket', 'trueProbability']
const LEG_KEYS = ['selectionId', 'canonicalEventId', 'eventId', 'marketId', 'label', 'eventLabel', 'marketLabel', 'odds', 'status', 'reason']
const CASHOUT_KEYS = ['schemaVersion', 'status', 'acceptedAt', 'transactionId', 'valuation']
const CASHOUT_VALUATION_KEYS = ['available', 'amount', 'currency', 'label', 'reason', 'fairCurrentValue', 'haircut', 'inputObservedAt', 'sources', 'legProbabilities', 'combinationValues', 'observationFingerprint', 'valuationFingerprint']
const CASHOUT_PROBABILITY_KEYS = ['selectionId', 'probability', 'bookmaker', 'provider', 'observedAt']
const CASHOUT_COMBINATION_KEYS = ['id', 'rawStake', 'rawCurrentValue']
const QUOTE_KEYS = ['mode', 'stake', 'count', 'stakePerLeg', 'stakePerCombo', 'totalOdds', 'estimatedPayout', 'impliedChance', 'modelChance', 'combinations', 'combinationDetails', 'expectedValue']
const COMBINATION_KEYS = ['id', 'mode', 'selectionIds', 'stake', 'oddsProduct', 'estimatedReturn', 'rawStake', 'rawOddsProduct', 'rawEstimatedReturn', 'legStatuses', 'status', 'settledReturn', 'rawSettledReturn']
const SETTINGS_KEYS = ['order', 'oddsPolicy', 'oddsFormat']
const MODES = new Set(['singles', 'multi', 'system-2'])
const RESULTS = new Set(['full-void', 'loss', 'push', 'win', 'partial'])
const LEG_REASONS = {
    pending: new Set(['pending', 'event-not-settled', 'score-missing', 'line-missing', 'unsupported-market']),
    won: new Set(['winner', 'total', 'spread']),
    lost: new Set(['winner', 'total', 'spread']),
    void: new Set(['push', 'event-cancelled', 'unsupported-selection']),
    cashed_out: new Set(['cashed-out']),
}
let integrityStopped = false

function plainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
}

function finite(value) {
    return typeof value === 'number' && Number.isFinite(value)
}

function nonEmpty(value) {
    return typeof value === 'string' && value.trim().length > 0
}

function dataKeys(value) {
    if (!plainObject(value)) return null
    const descriptors = Object.getOwnPropertyDescriptors(value)
    if (Object.values(descriptors).some(descriptor => !Object.hasOwn(descriptor, 'value'))) return null
    return Object.keys(descriptors)
}

function exactKeys(value, allowed, required = allowed) {
    const keys = dataKeys(value)
    return Boolean(keys) && keys.every(key => allowed.includes(key)) && required.every(key => keys.includes(key))
}

function unknownKeys(value, allowed) {
    const keys = dataKeys(value)
    return keys?.some(key => !allowed.includes(key)) || false
}

function jsonSafe(value, seen = new WeakSet()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
    if (typeof value === 'number') return Number.isFinite(value)
    if (typeof value !== 'object' || !value || seen.has(value)) return false
    if (Array.isArray(value) && Object.getPrototypeOf(value) !== Array.prototype) return false
    const descriptors = Object.getOwnPropertyDescriptors(value)
    if (Object.values(descriptors).some(descriptor => !Object.hasOwn(descriptor, 'value'))) return false
    if (!Array.isArray(value) && !plainObject(value)) return false
    seen.add(value)
    const safe = Object.entries(descriptors).every(([key, descriptor]) => key === 'length' || descriptor.value === undefined || jsonSafe(descriptor.value, seen))
    seen.delete(value)
    return safe
}

function validCombination(value) {
    if (!exactKeys(value, COMBINATION_KEYS, ['id', 'mode', 'selectionIds', 'stake', 'rawStake'])) return false
    if (!nonEmpty(value.id) || !MODES.has(value.mode) || !Array.isArray(value.selectionIds) || !value.selectionIds.every(nonEmpty) || !finite(value.stake) || !finite(value.rawStake)) return false
    const quoteShape = ['oddsProduct', 'estimatedReturn', 'rawOddsProduct', 'rawEstimatedReturn'].every(key => finite(value[key]))
    const settlementShape = Array.isArray(value.legStatuses)
        && value.legStatuses.every(nonEmpty)
        && ['lost', 'pending', 'settled'].includes(value.status)
        && finite(value.settledReturn)
        && finite(value.rawSettledReturn)
    return (quoteShape || settlementShape) && jsonSafe(value)
}

function validQuote(value) {
    if (!exactKeys(value, QUOTE_KEYS, ['mode', 'stake', 'count', 'totalOdds', 'estimatedPayout', 'impliedChance', 'modelChance', 'combinations', 'combinationDetails', 'expectedValue'])) return false
    if (!MODES.has(value.mode) || !finite(value.stake) || !Number.isInteger(value.count) || !finite(value.totalOdds) || !finite(value.estimatedPayout) || !finite(value.impliedChance) || !finite(value.modelChance) || !Number.isInteger(value.combinations) || !finite(value.expectedValue)) return false
    if ('stakePerLeg' in value && !finite(value.stakePerLeg)) return false
    if ('stakePerCombo' in value && !finite(value.stakePerCombo)) return false
    return Array.isArray(value.combinationDetails) && value.combinationDetails.every(validCombination)
}

function validSelection(value) {
    if (!exactKeys(value, SELECTION_KEYS, ['id', 'selectionId', 'canonicalEventId', 'eventId', 'marketId', 'outcome', 'side', 'acceptedOdds', 'bookmaker', 'provider', 'providerEventId', 'sourceContext', 'observedAt', 'freshness', 'submittable', 'ineligibilityReason', 'suspended', 'status'])) return false
    if (!['id', 'selectionId', 'canonicalEventId', 'marketId', 'outcome', 'side', 'bookmaker', 'provider', 'providerEventId', 'observedAt'].every(key => nonEmpty(value[key]))) return false
    if (!['winner', 'total', 'spread'].includes(value.marketId) || value.side !== value.outcome || !finite(value.acceptedOdds) || value.acceptedOdds <= 1) return false
    if ((value.marketId === 'total' || value.marketId === 'spread') && !finite(value.line)) return false
    if (!plainObject(value.sourceContext) || !jsonSafe(value.sourceContext)) return false
    return value.submittable === true && value.ineligibilityReason === null && typeof value.suspended === 'boolean' && jsonSafe(value)
}

function validLeg(value) {
    return exactKeys(value, LEG_KEYS)
        && ['selectionId', 'canonicalEventId', 'marketId', 'label', 'eventLabel', 'marketLabel', 'status', 'reason'].every(key => nonEmpty(value[key]))
        && LEG_REASONS[value.status]?.has(value.reason)
        && finite(value.odds)
        && jsonSafe(value)
}

function validSettings(value) {
    return exactKeys(value, SETTINGS_KEYS) && SETTINGS_KEYS.every(key => nonEmpty(value[key]))
}

function validCashout(ticket) {
    const cashOut = ticket.cashOut
    if (!exactKeys(cashOut, CASHOUT_KEYS) || cashOut.schemaVersion !== 1 || cashOut.status !== 'accepted' || !Number.isInteger(cashOut.acceptedAt) || cashOut.acceptedAt < 0) return false
    const valuation = cashOut.valuation
    if (!exactKeys(valuation, CASHOUT_VALUATION_KEYS) || !Array.isArray(valuation.legProbabilities) || !Array.isArray(valuation.combinationValues)) return false
    if (valuation.legProbabilities.some(item => !exactKeys(item, CASHOUT_PROBABILITY_KEYS)) || valuation.combinationValues.some(item => !exactKeys(item, CASHOUT_COMBINATION_KEYS))) return false
    const activeTicket = { ...ticket, status: 'active', settledAt: null, result: null, payout: 0, profit: 0, payoutProcessed: false, settlementKey: null, cashOut: null, legs: ticket.legs.map(leg => leg.status === 'cashed_out' ? { ...leg, status: 'pending', reason: 'pending' } : leg), pending: ticket.legs.filter(leg => leg.status === 'cashed_out').map(leg => leg.selectionId) }
    if (!isValidSimulatedCashoutValuation(activeTicket, valuation)) return false
    const settlementKey = `${ticket.id}:cashout:${valuation.valuationFingerprint}`
    return cashOut.transactionId === `${settlementKey}:credit`
        && ticket.settlementKey === settlementKey
        && ticket.settledAt === cashOut.acceptedAt
        && sameNumber(ticket.payout, valuation.amount)
        && sameNumber(ticket.profit, roundCurrency(valuation.amount - ticket.stake))
}

function hasNestedUnknownTicketField(ticket) {
    return unknownKeys(ticket, TICKET_KEYS)
        || ticket.selections?.some(selection => unknownKeys(selection, SELECTION_KEYS))
        || ticket.legs?.some(leg => unknownKeys(leg, LEG_KEYS))
        || unknownKeys(ticket.quote, QUOTE_KEYS)
        || ticket.quote?.combinationDetails?.some(detail => unknownKeys(detail, COMBINATION_KEYS))
        || ticket.combinationDetails?.some(detail => unknownKeys(detail, COMBINATION_KEYS))
        || unknownKeys(ticket.settingsSnapshot, SETTINGS_KEYS)
        || (ticket.cashOut && (unknownKeys(ticket.cashOut, CASHOUT_KEYS)
            || unknownKeys(ticket.cashOut.valuation, CASHOUT_VALUATION_KEYS)
            || ticket.cashOut.valuation?.legProbabilities?.some(item => unknownKeys(item, CASHOUT_PROBABILITY_KEYS))
            || ticket.cashOut.valuation?.combinationValues?.some(item => unknownKeys(item, CASHOUT_COMBINATION_KEYS))))
}

function sameNumber(left, right) {
    return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) < 1e-12
}

function sameCombination(left, right) {
    return left.id === right.id
        && left.mode === right.mode
        && JSON.stringify(left.selectionIds) === JSON.stringify(right.selectionIds)
        && sameNumber(left.stake, right.stake)
        && sameNumber(left.rawStake, right.rawStake)
        && (!Object.hasOwn(right, 'oddsProduct') || sameNumber(left.oddsProduct, right.oddsProduct))
        && (!Object.hasOwn(right, 'estimatedReturn') || sameNumber(left.estimatedReturn, right.estimatedReturn))
        && (!Object.hasOwn(right, 'rawOddsProduct') || sameNumber(left.rawOddsProduct, right.rawOddsProduct))
        && (!Object.hasOwn(right, 'rawEstimatedReturn') || sameNumber(left.rawEstimatedReturn, right.rawEstimatedReturn))
}

function rounded(value) {
    return Math.round(value * 100) / 100
}

function validSettlementArithmetic(ticket) {
    if (ticket.status !== 'settled') return true
    const quote = quoteTicket({ selections: ticket.selections, stake: ticket.stake, mode: ticket.mode })
    const legs = new Map(ticket.legs.map(leg => [leg.selectionId, leg]))
    if (ticket.combinationDetails.length !== quote.combinationDetails.length) return false
    let rawPayout = 0
    let allVoid = ticket.combinationDetails.length > 0
    for (let index = 0; index < quote.combinationDetails.length; index++) {
        const expected = quote.combinationDetails[index]
        const actual = ticket.combinationDetails[index]
        const statuses = expected.selectionIds.map(id => legs.get(id)?.status)
        const status = statuses.includes('lost') ? 'lost' : statuses.includes('pending') ? 'pending' : 'settled'
        const rawSettledReturn = status === 'settled'
            ? expected.rawStake * expected.selectionIds.reduce((product, id) => product * (legs.get(id)?.status === 'void' ? 1 : legs.get(id)?.odds), 1)
            : 0
        if (!sameCombination(expected, actual) || JSON.stringify(actual.legStatuses) !== JSON.stringify(statuses) || actual.status !== status || !sameNumber(actual.rawSettledReturn, rawSettledReturn) || !sameNumber(actual.settledReturn, rounded(rawSettledReturn))) return false
        rawPayout += rawSettledReturn
        allVoid = allVoid && statuses.every(statusValue => statusValue === 'void')
    }
    const payout = rounded(rawPayout)
    const result = allVoid ? 'full-void' : payout === 0 ? 'loss' : payout === rounded(ticket.stake) ? 'push' : payout > rounded(ticket.stake) ? 'win' : 'partial'
    return ticket.result === result && sameNumber(ticket.payout, payout) && sameNumber(ticket.profit, rounded(payout - rounded(ticket.stake)))
}

function validAcceptedArithmetic(ticket) {
    const quote = quoteTicket({ selections: ticket.selections, stake: ticket.stake, mode: ticket.mode })
    if (ticket.quote.mode !== ticket.mode || ticket.quote.stake !== ticket.stake || ticket.quote.count !== ticket.selections.length) return false
    if (ticket.combinations !== quote.combinations || ticket.quote.combinations !== quote.combinations) return false
    if (!sameNumber(ticket.totalOdds, quote.totalOdds) || !sameNumber(ticket.estimatedPayout, quote.estimatedPayout)) return false
    if (!sameNumber(ticket.quote.totalOdds, quote.totalOdds) || !sameNumber(ticket.quote.estimatedPayout, quote.estimatedPayout)) return false
    if (!sameNumber(ticket.quote.impliedChance, quote.impliedChance) || !sameNumber(ticket.quote.modelChance, quote.modelChance) || !sameNumber(ticket.quote.expectedValue, quote.expectedValue)) return false
    if (quote.stakePerLeg !== undefined && !sameNumber(ticket.quote.stakePerLeg, quote.stakePerLeg)) return false
    if (quote.stakePerCombo !== undefined && !sameNumber(ticket.quote.stakePerCombo, quote.stakePerCombo)) return false
    return ticket.quote.combinationDetails.length === quote.combinationDetails.length
        && ticket.quote.combinationDetails.every((detail, index) => sameCombination(quote.combinationDetails[index], detail))
        && (!['active', 'cashed_out'].includes(ticket.status) || (ticket.combinationDetails.length === quote.combinationDetails.length
            && ticket.combinationDetails.every((detail, index) => sameCombination(quote.combinationDetails[index], detail))))
}

function ticketFailure(ticket) {
    if (!plainObject(ticket) || !dataKeys(ticket)) return 'malformed-ticket'
    if (hasNestedUnknownTicketField(ticket)) return 'unknown-ticket-field'
    if (!exactKeys(ticket, TICKET_KEYS, TICKET_KEYS.filter(key => key !== 'cashOut'))) return 'malformed-ticket'
    if (!nonEmpty(ticket.id) || !MODES.has(ticket.mode) || !['active', 'settled', 'cashed_out'].includes(ticket.status)) return 'malformed-ticket'
    if (!finite(ticket.stake) || ticket.stake <= 0 || !finite(ticket.totalOdds) || !finite(ticket.estimatedPayout) || !finite(ticket.payout) || !finite(ticket.profit)) return 'malformed-ticket'
    if (!Number.isInteger(ticket.acceptedAt) || ticket.acceptedAt < 0 || !Array.isArray(ticket.selections) || ticket.selections.length < 1 || ticket.selections.length > 10) return 'malformed-ticket'
    if (!ticket.selections.every(validSelection) || ticket.selections.some(selection => !({ winner: ['home', 'away', 'draw'], total: ['over', 'under'], spread: ['home', 'away'] }[selection.marketId]?.includes(selection.outcome)))) return 'malformed-ticket'
    if (!Array.isArray(ticket.legs) || !ticket.legs.every(validLeg) || !validQuote(ticket.quote) || !validSettings(ticket.settingsSnapshot)) return 'malformed-ticket'
    if (!Number.isInteger(ticket.combinations) || !Array.isArray(ticket.combinationDetails) || !ticket.combinationDetails.every(validCombination) || ticket.combinations !== ticket.combinationDetails.length) return 'malformed-ticket'
    const selectionIds = ticket.selections.map(selection => selection.selectionId)
    for (let left = 0; left < ticket.selections.length; left++) {
        for (let right = left + 1; right < ticket.selections.length; right++) {
            const first = ticket.selections[left]
            const second = ticket.selections[right]
            if (first.canonicalEventId !== second.canonicalEventId) continue
            if (ticket.mode !== 'singles') return 'duplicate-fixture'
            if (first.marketId === second.marketId && first.line === second.line && first.outcome !== second.outcome) return 'contradictory-ticket'
        }
    }
    const selectionsById = new Map(ticket.selections.map(selection => [selection.selectionId, selection]))
    if (new Set(selectionIds).size !== selectionIds.length || ticket.legs.length !== selectionIds.length || new Set(ticket.legs.map(leg => leg.selectionId)).size !== selectionIds.length || ticket.legs.some(leg => {
        const selection = selectionsById.get(leg.selectionId)
        return !selection || leg.canonicalEventId !== selection.canonicalEventId || leg.eventId !== selection.eventId || leg.marketId !== selection.marketId || !sameNumber(leg.odds, selection.acceptedOdds)
    })) return 'malformed-ticket'
    if (!validAcceptedArithmetic(ticket) || !validSettlementArithmetic(ticket)) return 'malformed-ticket'
    if (!Array.isArray(ticket.pending) || new Set(ticket.pending).size !== ticket.pending.length || ticket.pending.some(id => !selectionIds.includes(id))) return 'malformed-ticket'
    const expectedPending = ticket.legs.filter(leg => leg.status === 'pending').map(leg => leg.selectionId)
    if (JSON.stringify(ticket.pending) !== JSON.stringify(expectedPending)) return 'malformed-ticket'
    if (ticket.status === 'active' && (ticket.settledAt !== null || ticket.result !== null || ticket.payout !== 0 || ticket.profit !== 0 || ticket.payoutProcessed !== false || ticket.settlementKey !== null || (ticket.cashOut !== undefined && ticket.cashOut !== null))) return 'malformed-ticket'
    if (ticket.status === 'settled' && (!Number.isInteger(ticket.settledAt) || ticket.settledAt < 0 || !RESULTS.has(ticket.result) || ticket.payoutProcessed !== true || ticket.settlementKey !== settlementKeyFor(ticket, ticket) || ticket.pending.length || ticket.legs.some(leg => leg.status === 'pending') || (ticket.cashOut !== undefined && ticket.cashOut !== null))) return 'malformed-ticket'
    if (ticket.status === 'cashed_out' && (ticket.result !== 'cashed_out' || ticket.payoutProcessed !== true || ticket.pending.length || ticket.legs.some(leg => leg.status === 'pending' || leg.status === 'lost') || !validCashout(ticket))) return 'malformed-ticket'
    if (!jsonSafe(ticket)) return 'malformed-ticket'
    return null
}

function copyAllowed(value, keys) {
    return Object.fromEntries(keys.filter(key => Object.hasOwn(value, key)).map(key => [key, structuredClone(value[key])]))
}

function migrateV1Ticket(value) {
    if (!plainObject(value)) return null
    const ticket = copyAllowed(value, TICKET_KEYS)
    if (Array.isArray(ticket.selections)) ticket.selections = ticket.selections.map(selection => plainObject(selection) ? copyAllowed(selection, SELECTION_KEYS) : selection)
    if (Array.isArray(ticket.legs)) ticket.legs = ticket.legs.map(leg => plainObject(leg) ? copyAllowed(leg, LEG_KEYS) : leg)
    if (plainObject(ticket.quote)) {
        ticket.quote = copyAllowed(ticket.quote, QUOTE_KEYS)
        if (Array.isArray(ticket.quote.combinationDetails)) ticket.quote.combinationDetails = ticket.quote.combinationDetails.map(item => plainObject(item) ? copyAllowed(item, COMBINATION_KEYS) : item)
    }
    if (Array.isArray(ticket.combinationDetails)) ticket.combinationDetails = ticket.combinationDetails.map(item => plainObject(item) ? copyAllowed(item, COMBINATION_KEYS) : item)
    if (plainObject(ticket.settingsSnapshot)) ticket.settingsSnapshot = copyAllowed(ticket.settingsSnapshot, SETTINGS_KEYS)
    return ticketFailure(ticket) ? null : ticket
}

function restoreResult(tickets, quarantine, sourceVersion, migration, ok = true) {
    return { ok, tickets, quarantine, sourceVersion, migration, code: ok ? null : 'restore-failed' }
}

function quarantine(source, index, ticketId, code) {
    return { source, index, ticketId: nonEmpty(ticketId) ? ticketId : null, code }
}

export function restoreSportsbookTickets(rawV2, rawV1) {
    if (rawV2 !== null) {
        let envelope
        try {
            envelope = JSON.parse(rawV2)
        } catch {
            return restoreResult([], [quarantine('v2', null, null, 'malformed-json')], 2, 'unavailable', false)
        }
        if (!plainObject(envelope)) return restoreResult([], [quarantine('v2', null, null, 'malformed-envelope')], 2, 'unavailable', false)
        if (Object.keys(envelope).some(key => !['version', 'savedAt', 'tickets'].includes(key))) return restoreResult([], [quarantine('v2', null, null, 'unknown-envelope-field')], 2, 'unavailable', false)
        if (envelope.version !== 2) return restoreResult([], [quarantine('v2', null, null, 'unsupported-version')], 2, 'unavailable', false)
        if (!exactKeys(envelope, ['version', 'savedAt', 'tickets']) || !Number.isInteger(envelope.savedAt) || envelope.savedAt < 0 || !Array.isArray(envelope.tickets)) return restoreResult([], [quarantine('v2', null, null, 'malformed-envelope')], 2, 'unavailable', false)
        const tickets = []
        const isolated = []
        const ids = new Set()
        envelope.tickets.forEach((ticket, index) => {
            const failure = ticketFailure(ticket)
            if (failure) isolated.push(quarantine('v2', index, ticket?.id, failure))
            else if (ids.has(ticket.id)) isolated.push(quarantine('v2', index, ticket.id, 'duplicate-ticket-id'))
            else {
                ids.add(ticket.id)
                if (tickets.length >= 20) isolated.push(quarantine('v2', index, ticket.id, 'ticket-cap-exceeded'))
                else tickets.push(structuredClone(ticket))
            }
        })
        return restoreResult(tickets, isolated, 2, 'not-needed')
    }
    if (rawV1 === null) return restoreResult([], [], null, 'not-needed')
    let records
    try {
        records = JSON.parse(rawV1)
    } catch {
        return restoreResult([], [quarantine('v1', null, null, 'malformed-json')], 1, 'unavailable', false)
    }
    if (!Array.isArray(records)) return restoreResult([], [quarantine('v1', null, null, 'malformed-envelope')], 1, 'unavailable', false)
    const tickets = []
    const isolated = []
    const ids = new Set()
    records.forEach((record, index) => {
        const migrated = migrateV1Ticket(record)
        if (!migrated) isolated.push(quarantine('v1', index, record?.id, 'unprovable-v1'))
        else if (ids.has(migrated.id)) isolated.push(quarantine('v1', index, migrated.id, 'duplicate-ticket-id'))
        else {
            ids.add(migrated.id)
            if (tickets.length >= 20) isolated.push(quarantine('v1', index, migrated.id, 'ticket-cap-exceeded'))
            else tickets.push(migrated)
        }
    })
    return restoreResult(tickets, isolated, 1, tickets.length ? 'required' : 'unavailable')
}

function failure(code, failureStage, rollback = 'not-needed', observed = null) {
    return { ok: false, code, failureStage, rollback, observed }
}

function storageFor(storage) {
    if (storage) return storage
    try {
        return globalThis.localStorage || null
    } catch {
        return null
    }
}

function callSucceeded(callback) {
    try {
        return callback() !== false
    } catch {
        return false
    }
}

function observedValues(store, keys) {
    const result = {}
    keys.forEach(({ name, key }) => {
        try {
            result[name] = store.getItem(key)
        } catch {
            result[name] = 'unreadable'
        }
    })
    return result
}

function rollback(store, keys, snapshots, mutatedCount, failureStage) {
    let callsOk = true
    for (let index = mutatedCount - 1; index >= 0; index--) {
        const { key } = keys[index]
        const raw = snapshots[index]
        callsOk = callSucceeded(() => raw === null ? store.removeItem(key) : store.setItem(key, raw)) && callsOk
    }
    const observed = observedValues(store, keys)
    const bytesOk = keys.every(({ name }, index) => observed[name] === snapshots[index])
    if (callsOk && bytesOk) return failure('rolled-back', failureStage, 'succeeded', observed)
    integrityStopped = true
    return failure('rollback-failed', 'rollback', 'failed', observed)
}

function commitRaw({ keys, rawValues, storage }) {
    if (integrityStopped) return failure('integrity-stopped', 'validate')
    const store = storageFor(storage)
    if (!store || typeof store.getItem !== 'function' || typeof store.setItem !== 'function' || typeof store.removeItem !== 'function') return failure('storage-unavailable', 'storage')
    const snapshots = []
    for (const { key } of keys) {
        try {
            snapshots.push(store.getItem(key))
        } catch {
            return failure('snapshot-failed', 'snapshot')
        }
    }
    for (let index = 0; index < keys.length; index++) {
        const wrote = callSucceeded(() => store.setItem(keys[index].key, rawValues[index]))
        if (!wrote) return rollback(store, keys, snapshots, index + 1, `write-${keys[index].name}`)
    }
    for (let index = 0; index < keys.length; index++) {
        let observed
        try {
            observed = store.getItem(keys[index].key)
        } catch {
            return rollback(store, keys, snapshots, keys.length, `readback-${keys[index].name}`)
        }
        if (observed !== rawValues[index]) return rollback(store, keys, snapshots, keys.length, `readback-${keys[index].name}`)
    }
    return { ok: true, code: null, rollback: 'not-needed' }
}

function serializableHistory(value) {
    if (value instanceof Date) return Number.isFinite(value.getTime())
    if (value === null || ['string', 'boolean'].includes(typeof value)) return true
    if (typeof value === 'number') return Number.isFinite(value)
    if (!value || typeof value !== 'object') return false
    if (Array.isArray(value) && Object.getPrototypeOf(value) !== Array.prototype) return false
    if (!Array.isArray(value) && !plainObject(value)) return false
    const descriptors = Object.getOwnPropertyDescriptors(value)
    return Object.values(descriptors).every(descriptor => Object.hasOwn(descriptor, 'value') && serializableHistory(descriptor.value))
}

function serializeTickets(tickets, savedAt) {
    if (!Array.isArray(tickets) || tickets.length > 20 || tickets.some(ticketFailure) || !Number.isInteger(savedAt) || savedAt < 0) return null
    try {
        return JSON.stringify({ version: 2, savedAt, tickets })
    } catch {
        return null
    }
}

export function commitSportsbookAccounting({ tickets, nextBalance, nextTransactions, savedAt, storage } = {}) {
    if (integrityStopped) return failure('integrity-stopped', 'validate')
    const ticketsRaw = serializeTickets(tickets, savedAt)
    if (!ticketsRaw || !finite(nextBalance) || !Array.isArray(nextTransactions) || !serializableHistory(nextTransactions)) return failure('validation-failed', 'validate')
    let historyRaw
    try {
        historyRaw = JSON.stringify(nextTransactions)
    } catch {
        return failure('serialization-failed', 'serialize')
    }
    return commitRaw({
        keys: [
            { name: 'tickets', key: SPORTSBOOK_TICKETS_V2_KEY },
            { name: 'credits', key: CREDIT_STORAGE_KEY },
            { name: 'history', key: HISTORY_STORAGE_KEY },
        ],
        rawValues: [ticketsRaw, String(nextBalance), historyRaw],
        storage,
    })
}

export function persistMigratedSportsbookTickets({ tickets, savedAt, storage } = {}) {
    if (integrityStopped) return failure('integrity-stopped', 'validate')
    const ticketsRaw = serializeTickets(tickets, savedAt)
    if (!ticketsRaw) return failure('validation-failed', 'validate')
    return commitRaw({ keys: [{ name: 'tickets', key: SPORTSBOOK_TICKETS_V2_KEY }], rawValues: [ticketsRaw], storage })
}

export function resetSportsbookIntegrityLatchForTests() {
    integrityStopped = false
}
