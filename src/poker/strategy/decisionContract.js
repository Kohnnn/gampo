const ACTIONS = new Set(['fold', 'check', 'call', 'raise'])
const HISTORY_TYPES = new Set(['blind', 'ante', 'fold', 'check', 'call', 'raise', 'street'])
const STREET_SEQUENCE = ['preflop', 'flop', 'turn', 'river']
const STREETS = new Set(STREET_SEQUENCE)
const BOARD_SIZE = Object.freeze({ preflop: 0, flop: 3, turn: 4, river: 5 })
const PLAYER_STATUSES = ['active', 'folded', 'allin']
const SOURCE_KINDS = ['authored-local', 'legacy-local', 'approximate-local']
const FORMATS = ['cash', 'sng']
const ICM_MODEL = 'malmuth-harville-v1'
const STACK_MODEL_KIND = 'bb-vector-v1'
const CONTEXT_ID_PREFIX = 'decision-context-v1:'
const ROLES = {
    2: ['BTN', 'BB'],
    6: ['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO'],
}

export const REASONS = Object.freeze({
    INVALID_INPUT: 'INVALID_INPUT',
    INVALID_CANONICAL_VALUE: 'INVALID_CANONICAL_VALUE',
    UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
    UNSUPPORTED_HANDEDNESS: 'UNSUPPORTED_HANDEDNESS',
    INVALID_SEATING: 'INVALID_SEATING',
    MISSING_LOOKUP_POSITION: 'MISSING_LOOKUP_POSITION',
    MISSING_HERO_TURN: 'MISSING_HERO_TURN',
    MISSING_LEGAL_ACTIONS: 'MISSING_LEGAL_ACTIONS',
    INVALID_BLINDS: 'INVALID_BLINDS',
    INVALID_STACK_MODEL: 'INVALID_STACK_MODEL',
    INVALID_SNG_MODEL: 'INVALID_SNG_MODEL',
    INVALID_HISTORY: 'INVALID_HISTORY',
    INVALID_ACTION_NODE: 'INVALID_ACTION_NODE',
    INVALID_SOURCE: 'INVALID_SOURCE',
    LEGACY_SOURCE_UNREVIEWED: 'LEGACY_SOURCE_UNREVIEWED',
    SOURCE_NOT_REVIEWED: 'SOURCE_NOT_REVIEWED',
    SOURCE_VERSION_MISSING: 'SOURCE_VERSION_MISSING',
    SOURCE_CONTEXT_INCOMPLETE: 'SOURCE_CONTEXT_INCOMPLETE',
    SOURCE_CONTEXT_MISMATCH: 'SOURCE_CONTEXT_MISMATCH',
    SOURCE_RESULT_INVALID: 'SOURCE_RESULT_INVALID',
    NO_SAFE_APPROXIMATION: 'NO_SAFE_APPROXIMATION',
    INVALID_REQUEST_TOKEN: 'INVALID_REQUEST_TOKEN',
    STALE_COMPLETION: 'STALE_COMPLETION',
})

export const BASE_CONTEXT_KEYS = Object.freeze(['actionNode', 'blinds', 'board', 'buttonId', 'configuredSeatCount', 'format', 'handedness', 'hero', 'heroTurn', 'legalActions', 'players', 'sng', 'stackModel', 'street'])
export const FULL_CONTEXT_KEYS = Object.freeze([...BASE_CONTEXT_KEYS, 'contextId'])

function plain(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
}

function finite(value) {
    return typeof value === 'number' && Number.isFinite(value)
}

function dataObject(value, expectedKeys = null) {
    if (!plain(value)) return false
    const keys = Reflect.ownKeys(value)
    if (keys.some(key => typeof key !== 'string')) return false
    if (expectedKeys && (keys.length !== expectedKeys.length || !expectedKeys.every(key => keys.includes(key)))) return false
    return keys.every(key => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key)
        return descriptor?.enumerable && Object.prototype.hasOwnProperty.call(descriptor, 'value')
    })
}

function denseArray(value) {
    if (!Array.isArray(value)) return false
    const keys = Reflect.ownKeys(value)
    if (keys.length !== value.length + 1 || !keys.includes('length')) return false
    for (let index = 0; index < value.length; index += 1) {
        const key = String(index)
        const descriptor = Object.getOwnPropertyDescriptor(value, key)
        if (!descriptor?.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return false
    }
    return true
}

function snapshot(value, seen = new Set()) {
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return value
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new TypeError(REASONS.INVALID_CANONICAL_VALUE)
        return Object.is(value, -0) ? 0 : value
    }
    if (typeof value !== 'object' || seen.has(value)) throw new TypeError(REASONS.INVALID_CANONICAL_VALUE)
    seen.add(value)
    let copy
    if (denseArray(value)) {
        copy = value.map(item => snapshot(item, seen))
    } else if (dataObject(value)) {
        copy = {}
        for (const key of Object.keys(value).sort()) copy[key] = snapshot(value[key], seen)
    } else {
        throw new TypeError(REASONS.INVALID_CANONICAL_VALUE)
    }
    seen.delete(value)
    return copy
}

function read(container, key) {
    try {
        return { ok: true, value: container[key] }
    } catch {
        return { ok: false, value: undefined }
    }
}

function canonicalJson(value, seen = new Set()) {
    if (value === null) return 'null'
    if (typeof value === 'boolean') return value ? 'true' : 'false'
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new TypeError(REASONS.INVALID_CANONICAL_VALUE)
        return JSON.stringify(Object.is(value, -0) ? 0 : value)
    }
    if (typeof value === 'string') return JSON.stringify(value)
    if (typeof value !== 'object' || seen.has(value)) throw new TypeError(REASONS.INVALID_CANONICAL_VALUE)
    seen.add(value)
    let output
    if (denseArray(value)) {
        output = `[${value.map(item => canonicalJson(item, seen)).join(',')}]`
    } else if (dataObject(value)) {
        output = `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key], seen)}`).join(',')}}`
    } else {
        throw new TypeError(REASONS.INVALID_CANONICAL_VALUE)
    }
    seen.delete(value)
    return output
}

function failed(reason) {
    return Object.freeze({ ok: false, reason })
}

function validCard(card) {
    return typeof card === 'string' && /^[2-9TJQKA][shdc]$/.test(card)
}

function freezeContext(context) {
    const byPlayer = Object.freeze(context.stackModel.byPlayer.map(player => Object.freeze({ id: player.id, bb: player.bb })))
    const players = Object.freeze(context.players.map(player => Object.freeze({ id: player.id, status: player.status, role: player.role })))
    const history = Object.freeze(context.actionNode.history.map(event => Object.freeze({ street: event.street, type: event.type, actorRole: event.actorRole, amountBb: event.amountBb })))
    const stackModel = Object.freeze({ kind: 'bb-vector-v1', effectiveBb: context.stackModel.effectiveBb, byPlayer })
    const hero = Object.freeze({ id: context.hero.id, role: context.hero.role, hole: Object.freeze([...context.hero.hole]) })
    const blinds = Object.freeze({ sb: context.blinds.sb, bb: context.blinds.bb, ante: context.blinds.ante })
    const actionNode = Object.freeze({ history })
    const sng = context.sng === null ? null : Object.freeze({ payoutSignature: Object.freeze([...context.sng.payoutSignature]), icmModel: context.sng.icmModel })
    return Object.freeze({
        format: context.format,
        handedness: context.handedness,
        configuredSeatCount: context.configuredSeatCount,
        buttonId: context.buttonId,
        blinds,
        stackModel,
        players,
        hero,
        street: context.street,
        board: Object.freeze([...context.board]),
        legalActions: Object.freeze([...context.legalActions]),
        heroTurn: context.heroTurn,
        actionNode,
        sng,
        contextId: context.contextId,
    })
}

function roleMap(players, buttonIndex) {
    const roles = ROLES[players.length]
    if (!roles) return null
    const button = players.findIndex(player => player.id === players[buttonIndex]?.id)
    if (button < 0) return null
    return new Map(players.map((player, index) => [player.id, roles[(index - button + players.length) % players.length]]))
}

function complete(candidate, expected) {
    if (expected === null || typeof expected !== 'object') return typeof candidate === typeof expected
    if (Array.isArray(expected)) return Array.isArray(candidate) && candidate.length === expected.length && candidate.every((item, index) => complete(item, expected[index]))
    if (!plain(candidate)) return false
    return Object.keys(expected).every(key => Object.prototype.hasOwnProperty.call(candidate, key) && complete(candidate[key], expected[key]))
}

function resolution(state, reason, provenance = null, result = null) {
    const safeProvenance = provenance === null ? null : Object.freeze({ kind: provenance.kind, sourceId: provenance.sourceId, version: provenance.version, reviewed: provenance.reviewed })
    const safeResult = result === null ? null : Object.freeze({ actions: Object.freeze(result.actions.map(action => Object.freeze({ type: action.type, frequency: action.frequency }))) })
    return Object.freeze({ state, reason, provenance: safeProvenance, result: safeResult })
}

function validResult(result, legalActions) {
    if (!dataObject(result, ['actions']) || !denseArray(result.actions) || result.actions.length === 0 || !result.actions.every(action => dataObject(action, ['type', 'frequency']))) return false
    return new Set(result.actions.map(action => action.type)).size === result.actions.length && result.actions.every(action => ACTIONS.has(action.type) && legalActions.includes(action.type) && finite(action.frequency) && action.frequency >= 0 && action.frequency <= 1)
}

function validSeating(context) {
    if (!FORMATS.includes(context.format)) return false
    if (!ROLES[context.handedness]) return false
    if (!Number.isInteger(context.configuredSeatCount) || context.configuredSeatCount <= 0) return false
    if (typeof context.buttonId !== 'string' || !context.buttonId) return false
    if (context.heroTurn !== true) return false
    if (!STREETS.has(context.street)) return false
    return denseArray(context.players) && context.players.length === context.handedness
}

function validBlinds(blinds) {
    if (!dataObject(blinds, ['sb', 'bb', 'ante'])) return false
    if (!finite(blinds.sb) || !finite(blinds.bb) || !finite(blinds.ante)) return false
    return blinds.sb >= 0 && blinds.bb > 0 && blinds.ante >= 0
}

function validPlayers(players, buttonId) {
    const ids = new Set()
    for (const player of players) {
        if (!dataObject(player, ['id', 'status', 'role'])) return null
        if (typeof player.id !== 'string' || !player.id || ids.has(player.id)) return null
        if (!PLAYER_STATUSES.includes(player.status)) return null
        if (typeof player.role !== 'string') return null
        ids.add(player.id)
    }
    const button = players.findIndex(player => player.id === buttonId)
    if (button < 0) return null
    const roles = ROLES[players.length]
    if (!players.every((player, index) => player.role === roles[(index - button + players.length) % players.length])) return null
    return ids
}

function validBoard(board, street) {
    if (!denseArray(board) || BOARD_SIZE[street] !== board.length) return false
    return board.every(validCard)
}

function validHero(hero, players, ids, board) {
    if (!dataObject(hero, ['id', 'role', 'hole']) || !ids.has(hero.id)) return false
    if (hero.role !== players.find(player => player.id === hero.id).role) return false
    if (!denseArray(hero.hole) || hero.hole.length !== 2 || !hero.hole.every(validCard)) return false
    return new Set([...hero.hole, ...board]).size === hero.hole.length + board.length
}

function validLegalActions(legalActions) {
    if (!denseArray(legalActions) || legalActions.length === 0) return false
    if (!legalActions.every(action => typeof action === 'string' && ACTIONS.has(action))) return false
    return new Set(legalActions).size === legalActions.length
}

function validStackModel(stackModel, players, heroId) {
    if (!dataObject(stackModel, ['kind', 'effectiveBb', 'byPlayer']) || stackModel.kind !== STACK_MODEL_KIND) return false
    if (!finite(stackModel.effectiveBb) || stackModel.effectiveBb < 0) return false
    if (!denseArray(stackModel.byPlayer) || stackModel.byPlayer.length !== players.length) return false
    if (!stackModel.byPlayer.every((entry, index) => dataObject(entry, ['id', 'bb']) && entry.id === players[index].id && finite(entry.bb) && entry.bb >= 0)) return false
    const effective = players
        .filter(player => player.id === heroId || player.status !== 'folded')
        .map(player => stackModel.byPlayer.find(entry => entry.id === player.id).bb)
    return effective.length > 0 && stackModel.effectiveBb === Math.min(...effective)
}

function validHistory(actionNode, players, street) {
    if (!dataObject(actionNode, ['history']) || !denseArray(actionNode.history)) return false
    let current = 'preflop'
    for (const event of actionNode.history) {
        if (!dataObject(event, ['street', 'type', 'actorRole', 'amountBb'])) return false
        if (!STREETS.has(event.street) || !HISTORY_TYPES.has(event.type)) return false
        if (event.type === 'street') {
            if (STREET_SEQUENCE[STREET_SEQUENCE.indexOf(current) + 1] !== event.street) return false
            if (event.actorRole !== null || event.amountBb !== null) return false
            current = event.street
            continue
        }
        if (event.street !== current || !players.some(player => player.role === event.actorRole)) return false
        const amountless = event.type === 'fold' || event.type === 'check'
        if (amountless ? event.amountBb !== null : !finite(event.amountBb) || event.amountBb < 0) return false
    }
    return current === street
}

function validSngModel(format, sng) {
    if (format === 'cash') return sng === null
    if (!dataObject(sng, ['payoutSignature', 'icmModel']) || sng.icmModel !== ICM_MODEL) return false
    return denseArray(sng.payoutSignature) && sng.payoutSignature.length > 0 && sng.payoutSignature.every(value => finite(value) && value >= 0)
}

function validBaseContext(context) {
    if (!dataObject(context, BASE_CONTEXT_KEYS)) return false
    if (!validSeating(context) || !validBlinds(context.blinds)) return false
    if (!validBoard(context.board, context.street)) return false
    const ids = validPlayers(context.players, context.buttonId)
    if (!ids) return false
    if (!validHero(context.hero, context.players, ids, context.board)) return false
    if (!validLegalActions(context.legalActions)) return false
    if (!validStackModel(context.stackModel, context.players, context.hero.id)) return false
    if (!validHistory(context.actionNode, context.players, context.street)) return false
    return validSngModel(context.format, context.sng)
}

function splitContextId(context) {
    const { contextId, ...base } = context
    return { contextId, base }
}

function validContext(context) {
    if (!Object.isFrozen(context) || !dataObject(context, FULL_CONTEXT_KEYS)) return false
    const { contextId, base } = splitContextId(context)
    if (typeof contextId !== 'string' || !validBaseContext(base)) return false
    try {
        return contextId === `${CONTEXT_ID_PREFIX}${canonicalJson(base)}`
    } catch {
        return false
    }
}

function parseContextId(contextId) {
    if (typeof contextId !== 'string' || !contextId.startsWith(CONTEXT_ID_PREFIX)) return null
    try {
        const context = JSON.parse(contextId.slice(CONTEXT_ID_PREFIX.length))
        if (!validBaseContext(context) || contextId !== `${CONTEXT_ID_PREFIX}${canonicalJson(context)}`) return null
        return context
    } catch {
        return null
    }
}

function validContextId(contextId) {
    return parseContextId(contextId) !== null
}

export function normalizeDecisionContext(input) {
    try {
        if (!plain(input)) return failed(REASONS.INVALID_INPUT)
        const { game, format, heroId, configuredSeatCount, legalActions } = input
        if (!plain(game)) return failed(REASONS.INVALID_INPUT)
        if (!FORMATS.includes(format)) return failed(REASONS.UNSUPPORTED_FORMAT)
        if (!Number.isInteger(configuredSeatCount) || configuredSeatCount <= 0) return failed(REASONS.INVALID_SEATING)
        if (!Array.isArray(game.players) || game.players.length === 0) return failed(REASONS.INVALID_SEATING)
        const ids = new Set()
        for (const player of game.players) {
            if (!plain(player) || typeof player.id !== 'string' || !player.id || ids.has(player.id) || ![...PLAYER_STATUSES, 'sittingOut'].includes(player.status)) return failed(REASONS.INVALID_SEATING)
            ids.add(player.id)
        }
        const players = game.players.filter(player => player.status !== 'sittingOut')
        if (!players.every(player => Array.isArray(player.hole) && player.hole.length === 2 && player.hole.every(validCard))) return failed(REASONS.INVALID_INPUT)
        if (!ROLES[players.length]) return failed(REASONS.UNSUPPORTED_HANDEDNESS)
        if (!Number.isInteger(game.buttonIndex) || game.buttonIndex < 0 || game.buttonIndex >= game.players.length || game.players[game.buttonIndex].status === 'sittingOut') return failed(REASONS.INVALID_SEATING)
        const roles = roleMap(players, game.players.findIndex(player => player.id === game.players[game.buttonIndex].id))
        if (!roles) return failed(REASONS.MISSING_LOOKUP_POSITION)
        const hero = players.find(player => player.id === heroId)
        if (!hero || !roles.has(hero.id)) return failed(REASONS.MISSING_LOOKUP_POSITION)
        if (!finite(game.sb) || !finite(game.bb) || !finite(game.ante) || game.sb < 0 || game.bb <= 0 || game.ante < 0) return failed(REASONS.INVALID_BLINDS)
        if (!STREETS.has(game.street)) return failed(REASONS.INVALID_INPUT)
        if (!Array.isArray(game.community) || BOARD_SIZE[game.street] !== game.community.length) return failed(REASONS.INVALID_INPUT)
        if (!game.community.every(validCard) || new Set([...players.flatMap(player => player.hole), ...game.community]).size !== players.length * 2 + game.community.length) return failed(REASONS.INVALID_INPUT)
        if (!Array.isArray(legalActions) || legalActions.length === 0) return failed(REASONS.MISSING_LEGAL_ACTIONS)
        const normalizedActions = [...new Set(legalActions.map(action => typeof action === 'string' ? action : action?.type))].sort()
        if (!normalizedActions.every(action => ACTIONS.has(action))) return failed(REASONS.MISSING_LEGAL_ACTIONS)
        if (!Number.isInteger(game.toAct) || game.players[game.toAct]?.id !== hero.id) return failed(REASONS.MISSING_HERO_TURN)
        const byPlayer = []
        for (const player of players) {
            if (!finite(player.stack) || !finite(player.putIn) || player.stack < 0 || player.putIn < 0) return failed(REASONS.INVALID_STACK_MODEL)
            byPlayer.push({ id: player.id, bb: (player.stack + player.putIn) / game.bb })
        }
        const effective = players.filter(player => player.id === hero.id || player.status !== 'folded').map(player => byPlayer.find(entry => entry.id === player.id).bb)
        if (!effective.length || !effective.every(finite)) return failed(REASONS.INVALID_STACK_MODEL)
        if (!Array.isArray(game.history)) return failed(REASONS.INVALID_HISTORY)
        let currentStreet = 'preflop'
        const history = []
        for (const event of game.history) {
            if (!plain(event) || !HISTORY_TYPES.has(event.type)) return failed(REASONS.INVALID_HISTORY)
            if (event.type === 'street') {
                if (STREET_SEQUENCE[STREET_SEQUENCE.indexOf(currentStreet) + 1] !== event.street) return failed(REASONS.INVALID_HISTORY)
                currentStreet = event.street
                history.push({ street: currentStreet, type: 'street', actorRole: null, amountBb: null })
                continue
            }
            if (typeof event.player !== 'string' || !roles.has(event.player)) return failed(REASONS.INVALID_ACTION_NODE)
            const amountless = event.type === 'fold' || event.type === 'check'
            if ((!amountless && (!finite(event.amount) || event.amount < 0)) || (amountless && event.amount !== undefined)) return failed(REASONS.INVALID_ACTION_NODE)
            history.push({ street: currentStreet, type: event.type, actorRole: roles.get(event.player), amountBb: amountless ? null : event.amount / game.bb })
        }
        if (currentStreet !== game.street) return failed(REASONS.INVALID_ACTION_NODE)
        let sng = null
        if (format === 'sng') {
            if (!plain(input.sng)) return failed(REASONS.INVALID_SNG_MODEL)
            const payoutSignature = input.sng.payoutSignature ?? input.sng.payouts
            if (!Array.isArray(payoutSignature) || payoutSignature.length === 0 || !payoutSignature.every(value => finite(value) && value >= 0) || input.sng.icmModel !== ICM_MODEL) return failed(REASONS.INVALID_SNG_MODEL)
            sng = { payoutSignature: [...payoutSignature], icmModel: input.sng.icmModel }
        }
        const base = {
            format,
            handedness: players.length,
            configuredSeatCount,
            buttonId: game.players[game.buttonIndex].id,
            blinds: { sb: game.sb, bb: game.bb, ante: game.ante },
            stackModel: { kind: STACK_MODEL_KIND, effectiveBb: Math.min(...effective), byPlayer },
            players: players.map(player => ({ id: player.id, status: player.status, role: roles.get(player.id) })),
            hero: { id: hero.id, role: roles.get(hero.id), hole: [...hero.hole] },
            street: game.street,
            board: [...game.community],
            legalActions: normalizedActions,
            heroTurn: true,
            actionNode: { history },
            sng,
        }
        const contextId = `${CONTEXT_ID_PREFIX}${canonicalJson(base)}`
        return Object.freeze({ ok: true, context: freezeContext({ ...base, contextId }) })
    } catch {
        return failed(REASONS.INVALID_CANONICAL_VALUE)
    }
}

export function resolveDecision(input) {
    if (!plain(input)) return resolution('unavailable', REASONS.INVALID_SOURCE)
    const rawContext = read(input, 'context')
    const rawSource = read(input, 'source')
    if (!rawContext.ok || !rawSource.ok || !plain(rawContext.value) || !plain(rawSource.value)) return resolution('unavailable', REASONS.INVALID_SOURCE)
    const context = rawContext.value
    if (!validContext(context)) return resolution('unavailable', REASONS.INVALID_SOURCE)
    let source
    try {
        const { result, ...rest } = rawSource.value
        source = snapshot(rest)
        source.result = result
    } catch {
        return resolution('unavailable', REASONS.INVALID_CANONICAL_VALUE)
    }
    const provenance = { kind: source.kind, sourceId: source.sourceId, version: source.version, reviewed: source.reviewed }
    if (!SOURCE_KINDS.includes(source.kind) || typeof source.sourceId !== 'string' || !source.sourceId || typeof source.reviewed !== 'boolean') return resolution('unavailable', REASONS.INVALID_SOURCE)
    if (source.kind === 'legacy-local') return resolution('unavailable', REASONS.LEGACY_SOURCE_UNREVIEWED, provenance)
    if (source.kind === 'authored-local' && !source.reviewed) return resolution('unavailable', REASONS.SOURCE_NOT_REVIEWED, provenance)
    if (typeof source.version !== 'string' || !source.version) return resolution('unavailable', REASONS.SOURCE_VERSION_MISSING, provenance)
    if (!plain(source.context)) return resolution('unavailable', REASONS.SOURCE_CONTEXT_INCOMPLETE, provenance)
    try {
        if (!complete(source.context, context)) return resolution('unavailable', REASONS.SOURCE_CONTEXT_INCOMPLETE, provenance)
        if (canonicalJson(source.context) !== canonicalJson(context)) return resolution('unavailable', REASONS.SOURCE_CONTEXT_MISMATCH, provenance)
    } catch {
        return resolution('unavailable', REASONS.INVALID_CANONICAL_VALUE, provenance)
    }
    if (!validResult(source.result, context.legalActions)) return resolution('unavailable', REASONS.SOURCE_RESULT_INVALID, provenance)
    return resolution(source.kind === 'approximate-local' ? 'approximate' : 'supported', null, provenance, source.result)
}

export function beginDecision(contextId, requestId) {
    if (!validContextId(contextId) || !Number.isInteger(requestId) || requestId < 0) return Object.freeze({ state: 'error', token: null, provenance: null, reason: REASONS.INVALID_REQUEST_TOKEN, result: null })
    return Object.freeze({ state: 'loading', token: Object.freeze({ contextId, requestId }), provenance: null, reason: null, result: null })
}

function validProvenance(provenance) {
    return dataObject(provenance, ['kind', 'sourceId', 'version', 'reviewed']) && SOURCE_KINDS.includes(provenance.kind) && typeof provenance.sourceId === 'string' && provenance.sourceId && typeof provenance.version === 'string' && provenance.version && typeof provenance.reviewed === 'boolean'
}

const REASON_VALUES = Object.freeze(Object.values(REASONS))

function validOutcome(outcome, legalActions) {
    if (!dataObject(outcome, ['state', 'reason', 'provenance', 'result']) || !['supported', 'approximate', 'unavailable', 'error'].includes(outcome.state)) return false
    if (outcome.state === 'supported') return outcome.reason === null && validProvenance(outcome.provenance) && outcome.provenance.kind === 'authored-local' && outcome.provenance.reviewed === true && validResult(outcome.result, legalActions)
    if (outcome.state === 'approximate') return outcome.reason === null && validProvenance(outcome.provenance) && outcome.provenance.kind === 'approximate-local' && validResult(outcome.result, legalActions)
    return outcome.result === null && REASON_VALUES.includes(outcome.reason) && (outcome.provenance === null || validProvenance(outcome.provenance))
}

function copyOutcome(outcome) {
    return resolution(outcome.state, outcome.reason, outcome.provenance, outcome.result)
}

function loadingState(current) {
    if (!dataObject(current, ['state', 'token', 'provenance', 'reason', 'result'])) return false
    if (current.state !== 'loading' || current.provenance !== null || current.reason !== null || current.result !== null) return false
    if (!dataObject(current.token, ['contextId', 'requestId'])) return false
    if (typeof current.token.contextId !== 'string') return false
    return Number.isInteger(current.token.requestId) && current.token.requestId >= 0
}

function freezeLoading(current) {
    if (!loadingState(current)) return current
    return Object.freeze({ state: 'loading', token: Object.freeze({ contextId: current.token.contextId, requestId: current.token.requestId }), provenance: null, reason: null, result: null })
}

function tokenMatches(token, expected) {
    if (!dataObject(token, ['contextId', 'requestId'])) return false
    return token.contextId === expected.contextId && token.requestId === expected.requestId
}

export function settleDecision(current, token, outcome) {
    try {
        if (!loadingState(current)) return Object.freeze({ applied: false, state: freezeLoading(current) })
        const held = freezeLoading(current)
        let candidate
        let expected
        try {
            candidate = snapshot(outcome)
            expected = snapshot(token)
        } catch {
            return Object.freeze({ applied: false, state: held })
        }
        if (!tokenMatches(expected, held.token)) return Object.freeze({ applied: false, state: held })
        const context = parseContextId(held.token.contextId)
        if (!context || !validOutcome(candidate, context.legalActions)) return Object.freeze({ applied: false, state: held })
        return Object.freeze({ applied: true, state: copyOutcome(candidate) })
    } catch {
        return Object.freeze({ applied: false, state: current })
    }
}
