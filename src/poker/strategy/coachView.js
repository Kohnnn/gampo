// Pure presentation mapping for the live Decision Coach.
// Consumes decisionContract output only. No data loading, no matching, no heuristics.
// Fails closed to the 'error' view state for anything off-contract.

const VIEW_STATES = ['supported', 'approximate', 'unavailable', 'loading', 'error']
const SOURCE_KINDS = ['authored-local', 'legacy-local', 'approximate-local']

export const VIEW_STATE_VALUES = Object.freeze([...VIEW_STATES])

const REASON_TEXT = Object.freeze({
    INVALID_INPUT: 'The table state could not be read.',
    INVALID_CANONICAL_VALUE: 'The table state contained a value that could not be read.',
    UNSUPPORTED_FORMAT: 'No reviewed strategy exists for this game format.',
    UNSUPPORTED_HANDEDNESS: 'No reviewed strategy exists for this table size.',
    INVALID_SEATING: 'Seating could not be resolved for this hand.',
    MISSING_LOOKUP_POSITION: 'No reviewed strategy exists for this position.',
    MISSING_HERO_TURN: 'It is not your turn to act.',
    MISSING_LEGAL_ACTIONS: 'No legal actions are available to read.',
    INVALID_BLINDS: 'Blind levels could not be read.',
    INVALID_STACK_MODEL: 'Stack sizes could not be read.',
    INVALID_SNG_MODEL: 'Tournament payout state could not be read.',
    INVALID_HISTORY: 'Action history could not be read.',
    INVALID_ACTION_NODE: 'The current action point could not be read.',
    INVALID_SOURCE: 'No usable strategy source was provided.',
    LEGACY_SOURCE_UNREVIEWED: 'The only data for this spot is unreviewed legacy data.',
    SOURCE_NOT_REVIEWED: 'A strategy exists for this spot but has not been reviewed.',
    SOURCE_VERSION_MISSING: 'The strategy source is missing a version.',
    SOURCE_CONTEXT_INCOMPLETE: 'The strategy source does not describe this exact spot.',
    SOURCE_CONTEXT_MISMATCH: 'The strategy source describes a different spot.',
    SOURCE_RESULT_INVALID: 'The strategy source returned an unusable result.',
    NO_SAFE_APPROXIMATION: 'No safe approximation is available for this spot.',
    INVALID_REQUEST_TOKEN: 'The request could not be tracked.',
    STALE_COMPLETION: 'A newer hand state replaced this request.',
})

const FALLBACK_REASON_TEXT = 'This spot cannot be shown right now.'

const HEADLINE = Object.freeze({
    supported: 'Reviewed strategy',
    approximate: 'Approximate only',
    unavailable: 'No reviewed strategy',
    loading: 'Reading table state',
    error: 'Coach unavailable',
})

const SUMMARY = Object.freeze({
    supported: 'Authored and reviewed for this exact spot.',
    approximate: 'Close reference for this spot. Not reviewed for exact play.',
    unavailable: 'Nothing reviewed covers this spot.',
    loading: 'Waiting for the current action point.',
    error: 'The coach could not read a valid state.',
})

function plain(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
}

function readOnce(target, key) {
    try {
        return { ok: true, value: target[key] }
    } catch {
        return { ok: false, value: null }
    }
}

function nonEmptyString(value) {
    return typeof value === 'string' && value.length > 0
}

function presentProvenance(raw) {
    if (raw === null || raw === undefined) return null
    if (!plain(raw)) return null
    const kind = readOnce(raw, 'kind')
    const sourceId = readOnce(raw, 'sourceId')
    const version = readOnce(raw, 'version')
    const reviewed = readOnce(raw, 'reviewed')
    if (!kind.ok || !sourceId.ok || !version.ok || !reviewed.ok) return null
    if (!SOURCE_KINDS.includes(kind.value)) return null
    if (!nonEmptyString(sourceId.value) || !nonEmptyString(version.value)) return null
    if (typeof reviewed.value !== 'boolean') return null
    return Object.freeze({
        kind: kind.value,
        sourceId: sourceId.value,
        version: version.value,
        reviewed: reviewed.value,
        label: reviewed.value ? 'Reviewed' : 'Not reviewed',
    })
}

function percentLabel(frequency) {
    return `${Math.round(frequency * 100)}%`
}

function presentActions(raw) {
    if (!plain(raw)) return null
    const actions = readOnce(raw, 'actions')
    if (!actions.ok || !Array.isArray(actions.value) || actions.value.length === 0) return null
    const rows = []
    for (const entry of actions.value) {
        if (!plain(entry)) return null
        const type = readOnce(entry, 'type')
        const frequency = readOnce(entry, 'frequency')
        if (!type.ok || !frequency.ok) return null
        if (!nonEmptyString(type.value)) return null
        if (typeof frequency.value !== 'number' || !Number.isFinite(frequency.value)) return null
        if (frequency.value < 0 || frequency.value > 1) return null
        rows.push(Object.freeze({
            type: type.value,
            frequency: frequency.value,
            percent: percentLabel(frequency.value),
        }))
    }
    return Object.freeze(rows)
}

function view(state, options = {}) {
    const reasonCode = options.reasonCode ?? null
    return Object.freeze({
        state,
        headline: HEADLINE[state],
        summary: SUMMARY[state],
        prescriptive: state === 'supported',
        showsFrequencies: state === 'supported' || state === 'approximate',
        actions: options.actions ?? Object.freeze([]),
        provenance: options.provenance ?? null,
        reasonCode,
        reasonText: reasonCode === null ? null : (REASON_TEXT[reasonCode] ?? FALLBACK_REASON_TEXT),
        testId: `coach-state-${state}`,
    })
}

export function presentDecision(input) {
    try {
        if (!plain(input)) return view('error')
        const rawState = readOnce(input, 'state')
        if (!rawState.ok || !VIEW_STATES.includes(rawState.value)) return view('error')
        const state = rawState.value

        if (state === 'loading') return view('loading')

        const rawReason = readOnce(input, 'reason')
        const rawProvenance = readOnce(input, 'provenance')
        const rawResult = readOnce(input, 'result')
        if (!rawReason.ok || !rawProvenance.ok || !rawResult.ok) return view('error')

        const provenance = presentProvenance(rawProvenance.value)

        if (state === 'supported' || state === 'approximate') {
            if (rawReason.value !== null) return view('error')
            if (provenance === null) return view('error')
            const expectedKind = state === 'supported' ? 'authored-local' : 'approximate-local'
            if (provenance.kind !== expectedKind) return view('error')
            if (state === 'supported' && provenance.reviewed !== true) return view('error')
            const actions = presentActions(rawResult.value)
            if (actions === null) return view('error')
            return view(state, { actions, provenance })
        }

        if (rawResult.value !== null) return view('error')
        const reasonCode = nonEmptyString(rawReason.value) ? rawReason.value : null
        if (state === 'error' && reasonCode === null) return view('error')
        return view(state, { reasonCode, provenance })
    } catch {
        return view('error')
    }
}
