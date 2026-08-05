import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
    BASE_CONTEXT_KEYS,
    FULL_CONTEXT_KEYS,
    REASONS,
    beginDecision,
    normalizeDecisionContext,
    resolveDecision,
    settleDecision,
} from './decisionContract'

function cashInput(overrides = {}) {
    const game = {
        players: [
            { id: 'hero', stack: 198, putIn: 2, status: 'active', hole: ['As', 'Kd'] },
            { id: 'villain', stack: 196, putIn: 4, status: 'allin', hole: ['Qh', 'Qc'] },
        ],
        sb: 1,
        bb: 2,
        ante: 0,
        buttonIndex: 0,
        street: 'preflop',
        community: [],
        toAct: 0,
        history: [
            { type: 'blind', player: 'hero', amount: 1 },
            { type: 'blind', player: 'villain', amount: 2 },
            { type: 'raise', player: 'hero', amount: 4 },
        ],
    }
    return { game, format: 'cash', heroId: 'hero', configuredSeatCount: 6, legalActions: [{ type: 'fold' }, { type: 'call' }, { type: 'raise' }], ...overrides }
}

function sngInput() {
    const holes = [['As', 'Kd'], ['2s', '3c'], ['4s', '5c'], ['6s', '7c'], ['8s', '9c'], ['Ts', 'Jc']]
    const players = ['hero', 'sb', 'bb', 'utg', 'mp', 'co'].map((id, index) => ({
        id,
        stack: 200 - index * 10,
        putIn: index === 1 ? 1 : index === 2 ? 2 : 0,
        status: index === 3 ? 'folded' : index === 4 ? 'allin' : 'active',
        hole: holes[index],
    }))
    return {
        game: { players, sb: 1, bb: 2, ante: 0.25, buttonIndex: 0, street: 'flop', community: ['Ah', '7d', '2c'], toAct: 0, history: [{ type: 'blind', player: 'sb', amount: 1 }, { type: 'blind', player: 'bb', amount: 2 }, { type: 'fold', player: 'utg' }, { type: 'street', street: 'flop' }, { type: 'check', player: 'hero' }] },
        format: 'sng', heroId: 'hero', configuredSeatCount: 9, legalActions: [{ type: 'check' }, { type: 'raise' }],
        sng: { payouts: [0.5, 0.3, 0.2], icmModel: 'malmuth-harville-v1' },
    }
}

function context(input = cashInput()) {
    const normalized = normalizeDecisionContext(input)
    expect(normalized.ok).toBe(true)
    return normalized.context
}

const legacyPackets = ['preflop', 'postflop'].map(name => JSON.parse(readFileSync(new URL(`../../../public/data/poker/${name}.json`, import.meta.url), 'utf8')))

function canonicalJson(value) {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
    return JSON.stringify(value)
}

function canonicalId(base) {
    return `decision-context-v1:${canonicalJson(base)}`
}

function ownGetter(object, key) {
    Object.defineProperty(object, key, { enumerable: true, get() { throw new Error('getter') } })
    return object
}

describe('decision contract', () => {
    it('NORMALIZATION-AND-ROLE-HISTORY-MATRIX normalizes complete 2- and 6-handed contexts with immutable deterministic IDs', () => {
        const headsUp = context()
        const sng = context(sngInput())
        expect(headsUp.handedness).toBe(2)
        expect(headsUp.players.map(player => player.role)).toEqual(['BTN', 'BB'])
        expect(sng.handedness).toBe(6)
        expect(sng.players.map(player => player.role)).toEqual(['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO'])
        expect(sng.players.map(player => player.status)).toEqual(['active', 'active', 'active', 'folded', 'allin', 'active'])
        expect(sng.actionNode.history.at(-1)).toEqual({ street: 'flop', type: 'check', actorRole: 'BTN', amountBb: null })
        expect(sng.sng).toEqual({ payoutSignature: [0.5, 0.3, 0.2], icmModel: 'malmuth-harville-v1' })
        expect(Object.isFrozen(headsUp)).toBe(true)
        expect(Object.isFrozen(headsUp.players)).toBe(true)
        expect(Object.isFrozen(headsUp.stackModel)).toBe(true)
        expect(Object.isFrozen(headsUp.actionNode.history)).toBe(true)
    })

    it('CANONICAL-ID-AND-IMMUTABILITY is insertion-order independent and rejects malformed input without throwing', () => {
        const first = cashInput()
        const second = cashInput({ game: { ...first.game, players: first.game.players.map(player => ({ status: player.status, hole: player.hole, putIn: player.putIn, stack: player.stack, id: player.id })) } })
        expect(context(first).contextId).toBe(context(second).contextId)
        expect(context(cashInput({ game: { ...first.game, ante: 1 } })).contextId).not.toBe(context(first).contextId)
        expect(normalizeDecisionContext(cashInput({ game: { ...first.game, bb: Infinity } }))).toEqual({ ok: false, reason: 'INVALID_BLINDS' })
        expect(normalizeDecisionContext(cashInput({ game: { ...first.game, community: ['As'] } }))).toEqual({ ok: false, reason: 'INVALID_INPUT' })
        expect(normalizeDecisionContext(cashInput({ legalActions: [{ type: 'bet' }] }))).toEqual({ ok: false, reason: 'MISSING_LEGAL_ACTIONS' })
        expect(normalizeDecisionContext(cashInput({ game: { ...first.game, history: undefined } }))).toEqual({ ok: false, reason: 'INVALID_HISTORY' })
        expect(normalizeDecisionContext(cashInput({ game: { ...first.game, buttonIndex: -1 } }))).toEqual({ ok: false, reason: 'INVALID_SEATING' })
        expect(normalizeDecisionContext(cashInput({ game: { ...first.game, players: [{ ...first.game.players[0] }, { ...first.game.players[1], id: 'hero' }] } }))).toEqual({ ok: false, reason: 'INVALID_SEATING' })
        expect(normalizeDecisionContext(cashInput({ game: { ...first.game, players: [...first.game.players, { id: 'out', stack: 0, putIn: 0, status: 'sittingOut', hole: [] }] } }))).toMatchObject({ ok: true })
        expect(normalizeDecisionContext(cashInput({ game: { ...first.game, players: [...first.game.players, { id: 'third', stack: 100, putIn: 0, status: 'active', hole: ['2s', '3s'] }] } }))).toEqual({ ok: false, reason: 'UNSUPPORTED_HANDEDNESS' })
        expect(normalizeDecisionContext(cashInput({ game: { ...first.game, history: [{ type: 'raise', player: 'unknown', amount: 4 }] } }))).toEqual({ ok: false, reason: 'INVALID_ACTION_NODE' })
        expect(normalizeDecisionContext(cashInput({ game: { ...first.game, players: [{ ...first.game.players[0] }, { ...first.game.players[1], hole: ['As', 'Qc'] }] } }))).toEqual({ ok: false, reason: 'INVALID_INPUT' })
        expect(normalizeDecisionContext(cashInput({ game: { ...first.game, players: [{ ...first.game.players[0] }, { ...first.game.players[1], hole: ['Qs'] }] } }))).toEqual({ ok: false, reason: 'INVALID_INPUT' })
        for (const history of [[{ type: 'street', street: 'turn' }], [{ type: 'street', street: 'flop' }, { type: 'street', street: 'flop' }], [{ type: 'street', street: 'flop' }, { type: 'street', street: 'river' }]]) {
            expect(normalizeDecisionContext(cashInput({ game: { ...first.game, street: 'river', community: ['2s', '3c', '4d', '5h', '6s'], history } }))).toEqual({ ok: false, reason: 'INVALID_HISTORY' })
        }
    })

    it('AUTHORED-LOCAL-COMPLETE-MATCH-MATRIX supports only reviewed exact complete packets', () => {
        const current = context()
        const source = { sourceId: 'cash-v1', kind: 'authored-local', reviewed: true, version: 'v1', context: { ...current }, result: { actions: [{ type: 'fold', frequency: 0.2 }, { type: 'call', frequency: 0.8 }] } }
        const supported = resolveDecision({ context: current, source })
        expect(supported.state).toBe('supported')
        expect(Object.isFrozen(supported)).toBe(true)
        expect(Object.isFrozen(supported.provenance)).toBe(true)
        expect(Object.isFrozen(supported.result.actions)).toBe(true)
        expect(supported.result).not.toBe(source.result)
        expect(supported.result.actions).not.toBe(source.result.actions)
        expect(resolveDecision({ context: { ...current }, source }).reason).toBe('INVALID_SOURCE')
        expect(resolveDecision({ context: current, source: { ...source, context: { ...current, street: 'flop' } } }).reason).toBe('SOURCE_CONTEXT_MISMATCH')
        expect(resolveDecision({ context: current, source: { ...source, context: { format: 'cash' } } }).reason).toBe('SOURCE_CONTEXT_INCOMPLETE')
        expect(resolveDecision({ context: current, source: { ...source, reviewed: false } }).reason).toBe('SOURCE_NOT_REVIEWED')
        expect(resolveDecision({ context: current, source: { ...source, version: '' } }).reason).toBe('SOURCE_VERSION_MISSING')
        const sparseActions = Array(2)
        sparseActions[1] = { type: 'call', frequency: 1 }
        expect(resolveDecision({ context: current, source: { ...source, result: { actions: sparseActions } } }).reason).toBe('SOURCE_RESULT_INVALID')
        const symbolContext = { ...current }
        Object.defineProperty(symbolContext, Symbol('hidden'), { value: true })
        expect(resolveDecision({ context: current, source: { ...source, context: symbolContext } }).reason).toBe('INVALID_CANONICAL_VALUE')
        const hiddenContext = { ...current }
        Object.defineProperty(hiddenContext, 'hidden', { value: true })
        expect(resolveDecision({ context: current, source: { ...source, context: hiddenContext } }).reason).toBe('INVALID_CANONICAL_VALUE')
        source.result.actions[0].frequency = 1
        expect(supported.result.actions[0].frequency).toBe(0.2)
    })

    it('AUTHORED-LOCAL-COMPLETE-MATCH-MATRIX supports reviewed exact six-handed SNG packets', () => {
        const current = context(sngInput())
        const source = { sourceId: 'sng-v1', kind: 'authored-local', reviewed: true, version: 'v1', context: { ...current }, result: { actions: [{ type: 'check', frequency: 0.65 }, { type: 'raise', frequency: 0.35 }] } }
        const supported = resolveDecision({ context: current, source })
        expect(supported.state).toBe('supported')
        expect(supported.provenance).toEqual({ kind: 'authored-local', sourceId: 'sng-v1', version: 'v1', reviewed: true })
        expect(supported.result.actions.map(action => action.type)).toEqual(['check', 'raise'])
        expect(resolveDecision({ context: current, source: { ...source, context: { ...current, sng: { payoutSignature: [0.6, 0.3, 0.1], icmModel: 'malmuth-harville-v1' } } } }).reason).toBe(REASONS.SOURCE_CONTEXT_MISMATCH)
        expect(resolveDecision({ context: current, source: { ...source, context: { ...current, sng: { payoutSignature: [0.6, 0.4], icmModel: 'malmuth-harville-v1' } } } }).reason).toBe(REASONS.SOURCE_CONTEXT_INCOMPLETE)
        expect(resolveDecision({ context: current, source: { ...source, result: { actions: [{ type: 'fold', frequency: 1 }] } } }).reason).toBe(REASONS.SOURCE_RESULT_INVALID)
        const settled = settleDecision(beginDecision(current.contextId, 0), { contextId: current.contextId, requestId: 0 }, { state: supported.state, reason: supported.reason, provenance: supported.provenance, result: supported.result })
        expect(settled).toMatchObject({ applied: true, state: { state: 'supported' } })
    })

    it('REASON-VOCABULARY-AND-CONTEXT-KEYS are frozen and exhaustive', () => {
        expect(Object.isFrozen(REASONS)).toBe(true)
        expect(Object.isFrozen(BASE_CONTEXT_KEYS)).toBe(true)
        expect(Object.isFrozen(FULL_CONTEXT_KEYS)).toBe(true)
        expect(Object.entries(REASONS).every(([key, value]) => key === value)).toBe(true)
        expect(Object.keys(REASONS).sort()).toEqual([
            'INVALID_ACTION_NODE', 'INVALID_BLINDS', 'INVALID_CANONICAL_VALUE', 'INVALID_HISTORY', 'INVALID_INPUT',
            'INVALID_REQUEST_TOKEN', 'INVALID_SEATING', 'INVALID_SNG_MODEL', 'INVALID_SOURCE', 'INVALID_STACK_MODEL',
            'LEGACY_SOURCE_UNREVIEWED', 'MISSING_HERO_TURN', 'MISSING_LEGAL_ACTIONS', 'MISSING_LOOKUP_POSITION',
            'NO_SAFE_APPROXIMATION', 'SOURCE_CONTEXT_INCOMPLETE', 'SOURCE_CONTEXT_MISMATCH', 'SOURCE_NOT_REVIEWED',
            'SOURCE_RESULT_INVALID', 'SOURCE_VERSION_MISSING', 'STALE_COMPLETION', 'UNSUPPORTED_FORMAT', 'UNSUPPORTED_HANDEDNESS',
        ])
        expect(FULL_CONTEXT_KEYS).toEqual([...BASE_CONTEXT_KEYS, 'contextId'])
        expect(Object.keys(context()).sort()).toEqual([...FULL_CONTEXT_KEYS].sort())
        expect(BASE_CONTEXT_KEYS).not.toContain('contextId')
    })

    it('LEGACY-SOURCE-CLASSIFICATION exposes no legacy or approximate player result', () => {
        const current = context()
        for (const packet of legacyPackets) {
            const legacy = resolveDecision({ context: current, source: { sourceId: packet.format, kind: 'legacy-local', reviewed: false, version: `schema-${packet.schemaVersion}`, context: current, result: { actions: [{ type: 'call', frequency: 1 }] } } })
            expect(legacy).toMatchObject({ state: 'unavailable', reason: 'LEGACY_SOURCE_UNREVIEWED', result: null })
        }
        expect(resolveDecision({ context: current, source: { sourceId: 'approx', kind: 'approximate-local', reviewed: false, version: 'v1', context: current, result: { actions: [{ type: 'call', frequency: 1 }] } } }).state).toBe('approximate')
        const approximate = resolveDecision({ context: current, source: { sourceId: 'approx', kind: 'approximate-local', reviewed: false, version: 'v1', context: current, result: { actions: [{ type: 'call', frequency: 1 }] } } })
        expect(approximate.state).not.toBe('supported')
        expect(approximate.provenance).toEqual({ kind: 'approximate-local', sourceId: 'approx', version: 'v1', reviewed: false })
        expect(resolveDecision({ context: current, source: { sourceId: 'approx', kind: 'approximate-local', reviewed: true, version: '', context: current, result: { actions: [{ type: 'call', frequency: 1 }] } } }).reason).toBe(REASONS.SOURCE_VERSION_MISSING)
        expect(resolveDecision({ context: current, source: { sourceId: 'preflop', kind: 'legacy-local', reviewed: false, version: 'schema-1', context: current } }).reason).toBe('LEGACY_SOURCE_UNREVIEWED')
    })

    it('CANONICAL-BOUNDARY rejects hidden or accessor array fields and canonical malformed contexts', () => {
        const current = context()
        const source = { sourceId: 'cash-v1', kind: 'authored-local', reviewed: true, version: 'v1', context: { ...current }, result: { actions: [{ type: 'call', frequency: 1 }] } }
        for (const [field, decorate] of [['board', value => Object.defineProperty(value, Symbol('hidden'), { value: true })], ['legalActions', value => Object.defineProperty(value, 'hidden', { value: true })], ['actionNode.history', value => Object.defineProperty(value, 'hidden', { value: true })]]) {
            const candidate = { ...current, actionNode: { ...current.actionNode, history: [...current.actionNode.history] }, board: [...current.board], legalActions: [...current.legalActions] }
            const target = field === 'actionNode.history' ? candidate.actionNode.history : candidate[field]
            decorate(target)
            expect(() => resolveDecision({ context: current, source: { ...source, context: candidate } })).not.toThrow()
            expect(resolveDecision({ context: current, source: { ...source, context: candidate } }).reason).toBe('INVALID_CANONICAL_VALUE')
        }
        const actions = [{ type: 'call', frequency: 1 }]
        Object.defineProperty(actions, Symbol('hidden'), { value: true })
        expect(resolveDecision({ context: current, source: { ...source, result: { actions } } }).reason).toBe('SOURCE_RESULT_INVALID')
        for (const mutate of [base => { base.players[0].role = 'CO' }, base => { base.hero.hole[0] = '1s' }, base => { base.stackModel.byPlayer[0].bb = -1 }, base => { base.legalActions = ['bet'] }, base => { base.actionNode.history = [{ street: 'flop', type: 'street', actorRole: null, amountBb: null }] }, base => { base.sng = { payoutSignature: [], icmModel: 'bad' } }, base => { base.extra = true }]) {
            const base = structuredClone({ ...current, contextId: undefined })
            delete base.contextId
            mutate(base)
            const id = canonicalId(base)
            expect(beginDecision(id, 0).state).toBe('error')
            const forged = Object.freeze({ ...base, contextId: id })
            expect(resolveDecision({ context: forged, source }).reason).toBe('INVALID_SOURCE')
        }
    })

    it('ADVERSARIAL-INPUT-SNAPSHOT never throws, never forges support, and never aliases caller state', () => {
        const current = context()
        const id = current.contextId
        const base = { sourceId: 'cash-v1', kind: 'authored-local', reviewed: true, version: 'v1', context: { ...current }, result: { actions: [{ type: 'call', frequency: 1 }] } }
        for (const field of ['kind', 'sourceId', 'version', 'reviewed', 'context', 'result']) {
            const source = { ...base }
            delete source[field]
            ownGetter(source, field)
            expect(() => resolveDecision({ context: current, source })).not.toThrow()
            expect(resolveDecision({ context: current, source })).toMatchObject({ state: 'unavailable', reason: REASONS.INVALID_CANONICAL_VALUE, result: null })
        }
        expect(() => resolveDecision(ownGetter({ context: current }, 'source'))).not.toThrow()
        expect(resolveDecision(ownGetter({ context: current }, 'source')).reason).toBe(REASONS.INVALID_SOURCE)

        const loading = beginDecision(id, 3)
        let kindReads = 0
        const provenanceProxy = new Proxy({ kind: 'authored-local', sourceId: 'source', version: 'v1', reviewed: true }, {
            get(target, key) {
                if (key === 'kind') {
                    kindReads += 1
                    return kindReads <= 2 ? 'authored-local' : 'legacy-local'
                }
                if (key === 'reviewed') return kindReads <= 2
                return target[key]
            },
        })
        const proxied = settleDecision(loading, loading.token, { state: 'supported', reason: null, provenance: provenanceProxy, result: { actions: [{ type: 'call', frequency: 1 }] } })
        if (proxied.applied) {
            expect(proxied.state.provenance).toEqual({ kind: 'authored-local', sourceId: 'source', version: 'v1', reviewed: true })
        }
        expect(proxied.state.state === 'supported' && proxied.state.provenance.kind === 'legacy-local').toBe(false)
        expect(proxied.state.state === 'supported' && proxied.state.provenance.reviewed === false).toBe(false)

        for (const reason of ['NOT_A_PLAN_REASON', 'invalid_source', ' INVALID_SOURCE', 0, true]) {
            expect(settleDecision(loading, loading.token, { state: 'unavailable', reason, provenance: null, result: null })).toEqual({ applied: false, state: loading })
        }
        expect(settleDecision(loading, loading.token, { state: 'unavailable', reason: REASONS.NO_SAFE_APPROXIMATION, provenance: null, result: null })).toMatchObject({ applied: true, state: { state: 'unavailable' } })

        const mutable = { state: 'loading', token: { contextId: id, requestId: 3 }, provenance: null, reason: null, result: null }
        const rejected = settleDecision(mutable, { contextId: id, requestId: 999 }, { state: 'error', reason: REASONS.INVALID_SOURCE, provenance: null, result: null })
        expect(rejected.applied).toBe(false)
        expect(rejected.state).not.toBe(mutable)
        expect(Object.isFrozen(rejected.state)).toBe(true)
        mutable.state = 'MUTATED'
        mutable.token.requestId = 41
        expect(rejected.state).toEqual({ state: 'loading', token: { contextId: id, requestId: 3 }, provenance: null, reason: null, result: null })
    })

    it('TRUTH-STATE-AND-LIFECYCLE-MATRIX and DUAL-TOKEN-STALE-SETTLEMENT preserve current state unless both token fields match', () => {
        const id = context().contextId
        const loading = beginDecision(id, 3)
        expect(loading).toMatchObject({ state: 'loading', reason: null, result: null })
        expect(beginDecision('', -1)).toMatchObject({ state: 'error', reason: 'INVALID_REQUEST_TOKEN', token: null })
        expect(beginDecision('decision-context-v1:not-json', 0)).toMatchObject({ state: 'error', reason: 'INVALID_REQUEST_TOKEN', token: null })
        expect(beginDecision('decision-context-v1:{"z":1,"a":2}', 0)).toMatchObject({ state: 'error', reason: 'INVALID_REQUEST_TOKEN', token: null })
        expect(beginDecision(id, 0)).toMatchObject({ state: 'loading', token: { contextId: id, requestId: 0 } })
        const outcome = Object.freeze({ state: 'error', reason: 'INVALID_SOURCE', provenance: null, result: null })
        expect(settleDecision(loading, { contextId: id, requestId: 3 }, outcome)).toEqual({ applied: true, state: outcome })
        expect(settleDecision(loading, { contextId: `${id}x`, requestId: 3 }, outcome)).toEqual({ applied: false, state: loading })
        expect(settleDecision(loading, { contextId: id, requestId: 4 }, outcome)).toEqual({ applied: false, state: loading })
        expect(settleDecision(loading, { contextId: id, requestId: 3 }, { state: 'supported' })).toEqual({ applied: false, state: loading })
        const sparseOutcomeActions = Array(2)
        sparseOutcomeActions[1] = { type: 'call', frequency: 1 }
        for (const malformed of [{ state: 'supported', reason: null, provenance: {}, result: null }, { state: 'approximate', reason: null, provenance: {}, result: { actions: sparseOutcomeActions } }]) {
            expect(() => settleDecision(loading, loading.token, malformed)).not.toThrow()
            expect(settleDecision(loading, loading.token, malformed)).toEqual({ applied: false, state: loading })
        }
        for (const malformed of [
            ownGetter({ state: 'error', reason: 'INVALID_SOURCE', provenance: null, result: null }, 'reason'),
            { state: 'supported', reason: null, provenance: { kind: 'legacy-local', sourceId: 'legacy', version: 'v1', reviewed: false }, result: { actions: [{ type: 'call', frequency: 1 }] } },
            { state: 'supported', reason: null, provenance: { kind: 'authored-local', sourceId: 'source', version: 'v1', reviewed: true }, result: { actions: [{ type: 'bet', frequency: 1 }] } },
            { state: 'error', reason: '', provenance: null, result: null },
            { state: 'unavailable', reason: 'NO_SAFE_APPROXIMATION', provenance: { kind: 'bad', sourceId: 'source', version: 'v1', reviewed: true }, result: null },
        ]) {
            expect(() => settleDecision(loading, loading.token, malformed)).not.toThrow()
            expect(settleDecision(loading, loading.token, malformed)).toEqual({ applied: false, state: loading })
        }
        const supported = { state: 'supported', reason: null, provenance: { kind: 'authored-local', sourceId: 'source', version: 'v1', reviewed: true }, result: { actions: [{ type: 'call', frequency: 1 }] } }
        const approximate = { state: 'approximate', reason: null, provenance: { kind: 'approximate-local', sourceId: 'source', version: 'v1', reviewed: false }, result: { actions: [{ type: 'call', frequency: 1 }] } }
        expect(settleDecision(loading, loading.token, supported)).toMatchObject({ applied: true, state: { state: 'supported' } })
        expect(settleDecision(loading, loading.token, approximate)).toMatchObject({ applied: true, state: { state: 'approximate' } })
        expect(settleDecision(loading, loading.token, outcome)).toMatchObject({ applied: true, state: { state: 'error' } })
        expect(settleDecision(loading, loading.token, { state: 'unavailable', reason: 'NO_SAFE_APPROXIMATION', provenance: null, result: null })).toMatchObject({ applied: true, state: { state: 'unavailable' } })
        expect(settleDecision(loading, ownGetter({ contextId: id, requestId: 3 }, 'contextId'), outcome)).toEqual({ applied: false, state: loading })
        const newer = beginDecision(id, 4)
        expect(settleDecision(newer, newer.token, outcome)).toEqual({ applied: true, state: outcome })
    })
})
