// Bounded heuristic coverage: arithmetic table facts only.
//
// Deliberate scope limit. This module NEVER recommends an action, because with no
// approved authored source (Phases 04/05 blocked-skipped) any action recommendation
// would be invented strategy. It emits only values derivable from the table state by
// arithmetic, plus strictly-dominated-action warnings that are provable rather than
// strategic. Exact authored results always win; corrupt state never falls through here.
//
// No bot code is imported or reused. No RNG. No equity, EV, or solver frequencies.

const REASONS_ABSENCE = Object.freeze([
    'UNSUPPORTED_FORMAT',
    'UNSUPPORTED_HANDEDNESS',
    'MISSING_LOOKUP_POSITION',
    'LEGACY_SOURCE_UNREVIEWED',
    'SOURCE_NOT_REVIEWED',
    'SOURCE_CONTEXT_INCOMPLETE',
    'NO_SAFE_APPROXIMATION',
])

const REASONS_CORRUPTION = Object.freeze([
    'INVALID_INPUT',
    'INVALID_CANONICAL_VALUE',
    'INVALID_SEATING',
    'INVALID_BLINDS',
    'INVALID_STACK_MODEL',
    'INVALID_SNG_MODEL',
    'INVALID_HISTORY',
    'INVALID_ACTION_NODE',
    'INVALID_SOURCE',
    'SOURCE_VERSION_MISSING',
    'SOURCE_CONTEXT_MISMATCH',
    'SOURCE_RESULT_INVALID',
    'INVALID_REQUEST_TOKEN',
    'STALE_COMPLETION',
])

const REASONS_NOT_APPLICABLE = Object.freeze(['MISSING_HERO_TURN', 'MISSING_LEGAL_ACTIONS'])

export const COVERAGE_STATUSES = Object.freeze(['covered', 'exact-wins', 'blocked', 'not-applicable', 'none'])

export const COVERAGE_CEILING = 'Arithmetic only. These numbers describe the pot, not your hand. They do not tell you whether to fold, call, or raise.'

export const COVERAGE_CONFIDENCE = 'low'

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

function finite(value) {
    return typeof value === 'number' && Number.isFinite(value)
}

function frame(status, notes = [], detail = null) {
    return Object.freeze({
        status,
        prescriptive: false,
        confidence: COVERAGE_CONFIDENCE,
        ceiling: COVERAGE_CEILING,
        notes: Object.freeze(notes),
        detail,
        testId: `coverage-${status}`,
    })
}

function note(id, kind, label, value, detail) {
    return Object.freeze({ id, kind, label, value, detail })
}

export function classifyReason(reason, sourceConfigured) {
    if (typeof reason !== 'string' || reason.length === 0) return 'corruption'
    if (REASONS_NOT_APPLICABLE.includes(reason)) return 'not-applicable'
    if (reason === 'INVALID_SOURCE') return sourceConfigured === false ? 'absence' : 'corruption'
    if (REASONS_ABSENCE.includes(reason)) return 'absence'
    if (REASONS_CORRUPTION.includes(reason)) return 'corruption'
    return 'corruption'
}

export function potOddsBreakEven(pot, toCall) {
    if (!finite(pot) || !finite(toCall) || pot < 0 || toCall <= 0) return null
    const denominator = pot + toCall
    if (denominator <= 0) return null
    return toCall / denominator
}

export function stackToPotRatio(effectiveStack, pot) {
    if (!finite(effectiveStack) || !finite(pot) || effectiveStack < 0 || pot <= 0) return null
    return effectiveStack / pot
}

function percent(fraction) {
    return `${Math.round(fraction * 100)}%`
}

function oneDecimal(value) {
    return `${Math.round(value * 10) / 10}`
}

function buildNotes(table) {
    const notes = []

    const pot = readOnce(table, 'pot')
    const toCall = readOnce(table, 'toCall')
    const stack = readOnce(table, 'effectiveStack')
    const bb = readOnce(table, 'bb')
    const legal = readOnce(table, 'legalActions')
    if (!pot.ok || !toCall.ok || !stack.ok || !bb.ok || !legal.ok) return null
    if (!finite(pot.value) || !finite(toCall.value) || pot.value < 0 || toCall.value < 0) return null
    if (!Array.isArray(legal.value)) return null

    const breakEven = potOddsBreakEven(pot.value, toCall.value)
    if (breakEven !== null) {
        notes.push(note(
            'pot-odds',
            'fact',
            'Break-even threshold',
            percent(breakEven),
            `Calling ${toCall.value} into ${pot.value} needs to win ${percent(breakEven)} of the time just to break even. This is pot arithmetic, not an estimate of your hand.`,
        ))
    }

    const spr = stackToPotRatio(stack.value, pot.value)
    if (spr !== null) {
        notes.push(note(
            'spr',
            'fact',
            'Stack-to-pot ratio',
            oneDecimal(spr),
            `Effective stack is ${oneDecimal(spr)}x the current pot.`,
        ))
    }

    if (finite(stack.value) && finite(bb.value) && bb.value > 0) {
        notes.push(note(
            'effective-bb',
            'fact',
            'Effective stack',
            `${oneDecimal(stack.value / bb.value)} bb`,
            'Effective stack measured in big blinds.',
        ))
    }

    if (toCall.value === 0 && legal.value.includes('check') && legal.value.includes('fold')) {
        notes.push(note(
            'dominated-fold',
            'warning',
            'Folding is strictly dominated',
            'Checking is free',
            'You can check at no cost, so folding here gives up the pot for nothing. This follows from the price alone, not from any read on your hand.',
        ))
    }

    return notes
}

export function coverGap(input) {
    try {
        if (!plain(input)) return frame('blocked', [], 'Coverage input could not be read.')

        const decisionRaw = readOnce(input, 'decision')
        const tableRaw = readOnce(input, 'table')
        const configuredRaw = readOnce(input, 'sourceConfigured')
        if (!decisionRaw.ok || !tableRaw.ok || !configuredRaw.ok) return frame('blocked', [], 'Coverage input could not be read.')
        if (!plain(decisionRaw.value)) return frame('blocked', [], 'Decision could not be read.')

        const stateRaw = readOnce(decisionRaw.value, 'state')
        if (!stateRaw.ok || typeof stateRaw.value !== 'string') return frame('blocked', [], 'Decision state could not be read.')
        const state = stateRaw.value

        if (state === 'supported' || state === 'approximate') {
            return frame('exact-wins', [], 'An exact result covers this spot, so no arithmetic fallback is shown.')
        }
        if (state === 'loading') return frame('none', [], null)
        if (state !== 'unavailable' && state !== 'error') return frame('blocked', [], 'Unrecognized decision state.')

        const reasonRaw = readOnce(decisionRaw.value, 'reason')
        if (!reasonRaw.ok) return frame('blocked', [], 'Decision reason could not be read.')

        const classification = classifyReason(reasonRaw.value, configuredRaw.value === true)
        if (classification === 'not-applicable') return frame('not-applicable', [], null)
        if (classification === 'corruption') {
            return frame('blocked', [], 'The table state or strategy source could not be trusted, so no arithmetic is shown.')
        }

        if (!plain(tableRaw.value)) return frame('blocked', [], 'Table state could not be read.')
        const notes = buildNotes(tableRaw.value)
        if (notes === null) return frame('blocked', [], 'Table numbers could not be read.')
        if (notes.length === 0) return frame('none', [], null)

        return frame('covered', notes, null)
    } catch {
        return frame('blocked', [], 'Coverage failed to compute.')
    }
}
