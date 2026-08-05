import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { startHand, legalActions, createInitialState } from '../engine/Game'
import { resolveDecision, normalizeDecisionContext, REASONS } from './decisionContract'
import {
    validateManifest,
    classifyLocalAsset,
    toDecisionSource,
    MANIFEST_REASONS,
    SOURCE_KINDS,
} from './sourceGovernance.js'

const good = (over = {}) => ({
    sourceId: 'cash-6max-100bb',
    version: '1.0.0',
    kind: 'authored-local',
    reviewed: true,
    reviewer: 'A. Reviewer',
    coverage: ['preflop/rfi/UTG'],
    genericFallback: false,
    ...over,
})

const readAsset = name => JSON.parse(readFileSync(new URL(`../../../public/data/poker/${name}`, import.meta.url), 'utf8'))
const preflop = readAsset('preflop.json')
const postflop = readAsset('postflop.json')

describe('A — manifest validation', () => {
    it('accepts a complete, reviewed, named packet', () => {
        const v = validateManifest(good())
        expect(v.ok).toBe(true)
        expect(v.manifest.reviewer).toBe('A. Reviewer')
        expect(Object.isFrozen(v)).toBe(true)
        expect(Object.isFrozen(v.manifest)).toBe(true)
    })

    it('rejects a missing manifest', () => {
        for (const bad of [null, undefined]) {
            expect(validateManifest(bad).reason).toBe(MANIFEST_REASONS.MANIFEST_MISSING)
        }
    })

    it('rejects non-data manifests', () => {
        class Forged { constructor() { Object.assign(this, good()) } }
        for (const bad of [42, 'x', [], true, new Forged()]) {
            expect(validateManifest(bad).reason).toBe(MANIFEST_REASONS.MANIFEST_MALFORMED)
        }
    })

    it('requires a sourceId', () => {
        for (const v of ['', '   ', null, 7]) {
            expect(validateManifest(good({ sourceId: v })).reason).toBe(MANIFEST_REASONS.SOURCE_ID_MISSING)
        }
    })

    it('requires a known kind', () => {
        for (const v of ['authored-remote', 'solver', '', null]) {
            expect(validateManifest(good({ kind: v })).reason).toBe(MANIFEST_REASONS.KIND_UNKNOWN)
        }
        for (const kind of SOURCE_KINDS) {
            const packet = kind === 'authored-local' ? good({ kind }) : good({ kind, reviewed: false })
            expect(validateManifest(packet).ok).toBe(true)
        }
    })

    it('requires a version and rejects non-semver', () => {
        expect(validateManifest(good({ version: '' })).reason).toBe(MANIFEST_REASONS.VERSION_MISSING)
        expect(validateManifest(good({ version: undefined })).reason).toBe(MANIFEST_REASONS.VERSION_MISSING)
        for (const v of ['v1', '1', '1.0', 'schema-1', 'latest']) {
            expect(validateManifest(good({ version: v })).reason).toBe(MANIFEST_REASONS.VERSION_MALFORMED)
        }
        expect(validateManifest(good({ version: '2.13.4-rc.1' })).ok).toBe(true)
    })

    it('requires an explicit boolean review declaration', () => {
        for (const v of [undefined, null, 'yes', 1]) {
            expect(validateManifest(good({ reviewed: v })).reason).toBe(MANIFEST_REASONS.REVIEW_UNDECLARED)
        }
    })

    it('refuses anonymous review claims', () => {
        for (const who of [undefined, null, '', '   ']) {
            expect(validateManifest(good({ reviewer: who })).reason).toBe(MANIFEST_REASONS.REVIEWER_MISSING)
        }
        expect(validateManifest(good({ reviewed: false, reviewer: undefined })).ok).toBe(true)
    })

    it('requires a declared, well-formed coverage scope', () => {
        expect(validateManifest(good({ coverage: undefined })).reason).toBe(MANIFEST_REASONS.COVERAGE_UNDECLARED)
        for (const c of [[], 'preflop', [''], ['ok', 3], {}]) {
            expect(validateManifest(good({ coverage: c })).reason).toBe(MANIFEST_REASONS.COVERAGE_MALFORMED)
        }
    })

    it('refuses to treat a generic fallback packet as reviewed exact coverage', () => {
        expect(validateManifest(good({ genericFallback: true })).reason).toBe(MANIFEST_REASONS.GENERIC_FALLBACK_DECLARED)
        expect(validateManifest(good({ genericFallback: true, reviewed: false })).ok).toBe(true)
    })

    it('fails closed when an accessor throws', () => {
        const hostile = good()
        Object.defineProperty(hostile, 'reviewed', { get() { throw new Error('boom') } })
        expect(validateManifest(hostile).reason).toBe(MANIFEST_REASONS.MANIFEST_MALFORMED)
    })

    it('never returns ok for a packet it also gave a reason', () => {
        const cases = [null, {}, good({ version: 'v1' }), good({ reviewer: '' }), good({ coverage: [] })]
        for (const c of cases) {
            const v = validateManifest(c)
            expect(v.ok === false && typeof v.reason === 'string').toBe(true)
            expect(v.manifest).toBeNull()
        }
    })
})

describe('B — honest classification of shipped data', () => {
    it('classifies preflop.json as approximate-local and unreviewed', () => {
        const c = classifyLocalAsset(preflop, 'preflop.json')
        expect(c.kind).toBe('approximate-local')
        expect(c.reviewed).toBe(false)
        expect(c.reasons).toContain('NO_NAMED_REVIEWER')
        expect(c.reasons).toContain('NO_SEMVER_VERSION')
        expect(c.reasons).toContain('SOLVER_DERIVED_PROSE')
    })

    it('classifies postflop.json as approximate-local with a generic fallback and exploit block', () => {
        const c = classifyLocalAsset(postflop, 'postflop.json')
        expect(c.kind).toBe('approximate-local')
        expect(c.reviewed).toBe(false)
        expect(c.genericFallback).toBe(true)
        expect(c.reasons).toContain('GENERIC_FALLBACK_CHART')
        expect(c.reasons).toContain('UNREVIEWED_EXPLOIT_BLOCK')
    })

    it('can never classify any asset as authored-local', () => {
        const attempts = [
            preflop,
            postflop,
            { reviewer: 'Someone', schemaVersion: '1.0.0', kind: 'authored-local', reviewed: true },
            {},
            null,
        ]
        for (const a of attempts) {
            const c = classifyLocalAsset(a, 'x')
            expect(c.kind).not.toBe('authored-local')
            expect(c.reviewed).toBe(false)
        }
    })

    it('does not relabel or mutate the source asset', () => {
        const snapshot = JSON.stringify(preflop)
        classifyLocalAsset(preflop, 'preflop.json')
        expect(JSON.stringify(preflop)).toBe(snapshot)
    })
})

describe('B3 — exact can never fall through to approximate or generic data', () => {
    // Built from the real engine, not a hand-written literal, so the contract sees a
    // context it actually accepts and the source checks are genuinely exercised.
    function realContext() {
        const state = startHand(createInitialState({
            players: Array.from({ length: 6 }, (_, i) => ({ id: 'p' + i, name: 'P' + i, stack: 1000 })),
            sb: 10, bb: 20, ante: 0, buttonIndex: 0,
        }))
        const hero = state.players[state.toAct]
        const acts = legalActions(state).map(a => a.type)
        const norm = normalizeDecisionContext({
            game: state, format: 'cash', heroId: hero.id, configuredSeatCount: 6, legalActions: legalActions(state),
        })
        expect(norm.ok).toBe(true)
        return norm.context
    }

    // A result must price every legal action; this fabricates no strategy, it only
    // supplies a structurally complete stand-in so provenance is what decides.
    const fullResult = context => ({
        actions: context.legalActions.map((type, i) => ({ type, frequency: i === 0 ? 1 : 0 })),
    })

    it('classified local data resolves non-supported through the real contract', () => {
        const context = realContext()
        for (const [asset, name] of [[preflop, 'preflop.json'], [postflop, 'postflop.json']]) {
            const c = classifyLocalAsset(asset, name)
            const out = resolveDecision({
                context,
                source: {
                    sourceId: c.sourceId, kind: c.kind, reviewed: c.reviewed,
                    version: c.version || '', context, result: fullResult(context),
                },
            })
            expect(out.state).not.toBe('supported')
        }
    })

    it('a legacy-kind source is refused', () => {
        const context = realContext()
        const out = resolveDecision({
            context,
            source: { sourceId: 'preflop', kind: 'legacy-local', reviewed: false, version: '1.0.0', context, result: fullResult(context) },
        })
        expect(out.state).not.toBe('supported')
        expect(out.reason).toBe(REASONS.LEGACY_SOURCE_UNREVIEWED)
    })

    it('an unreviewed authored packet cannot reach supported', () => {
        const context = realContext()
        const out = resolveDecision({
            context,
            source: { sourceId: 'cash', kind: 'authored-local', reviewed: false, version: '1.0.0', context, result: fullResult(context) },
        })
        expect(out.reason).toBe(REASONS.SOURCE_NOT_REVIEWED)
        expect(out.state).toBe('unavailable')
    })

    it('toDecisionSource refuses every rejected manifest', () => {
        const context = realContext()
        const rejected = [null, validateManifest(null), validateManifest(good({ version: 'v1' })), validateManifest(good({ reviewer: '' }))]
        for (const verdict of rejected) {
            expect(toDecisionSource({ verdict, context, result: fullResult(context) })).toBeNull()
        }
    })

    it('toDecisionSource cannot invent a result or context', () => {
        const context = realContext()
        const verdict = validateManifest(good())
        expect(toDecisionSource({ verdict, context, result: null })).toBeNull()
        expect(toDecisionSource({ verdict, context: null, result: fullResult(context) })).toBeNull()
    })

    it('a validated reviewed packet still only reaches supported on a full context match', () => {
        const context = realContext()
        const verdict = validateManifest(good())
        const source = toDecisionSource({ verdict, context, result: fullResult(context) })
        expect(resolveDecision({ context, source }).state).toBe('supported')

        const mismatched = toDecisionSource({ verdict, context: { ...context, street: 'flop' }, result: fullResult(context) })
        expect(resolveDecision({ context, source: mismatched }).state).not.toBe('supported')
    })
})

describe('no invented data', () => {
    it('the module ships no ranges, frequencies, or EV numbers', () => {
        const src = readFileSync(new URL('./sourceGovernance.js', import.meta.url), 'utf8')
        expect(src).not.toMatch(/frequency:\s*0?\.\d/)
        expect(src).not.toMatch(/\bevDelta\b|\bequity\b/)
        expect(src).not.toMatch(/AKs|QQ\+|suited/i)
    })
})
