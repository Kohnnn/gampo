// Contract for the live strategy-source bridge.
//
// Central claim: with no reviewed packet configured, the live coach cannot reach
// 'supported' or 'approximate'. These tests drive the same code path PokerGame.jsx
// uses, over real normalized contexts, so the guarantee is behavioural rather than
// a source-text assertion.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

import { buildDecisionSource, currentDecisionSource, getConfiguredStrategyPacket } from './strategySource.js'
import { classifyLocalAsset } from './sourceGovernance.js'
import { normalizeDecisionContext, resolveDecision, REASONS } from './decisionContract.js'
import { createInitialState, startHand, legalActions } from '../engine/Game'

const SNG_SEATS = 6

function readAsset(name) {
    return JSON.parse(readFileSync(new URL(`../../../public/data/poker/${name}`, import.meta.url), 'utf8'))
}

// Build a real hero-turn context the way the live component does.
function liveContext() {
    const state = startHand(createInitialState({
        players: Array.from({ length: SNG_SEATS }, (_, i) => ({ id: 'p' + i, name: 'P' + i, stack: 1000 })),
        sb: 10, bb: 20, ante: 0, buttonIndex: 0,
    }))
    const hero = state.players[state.toAct]
    const acts = legalActions(state)
    const normalized = normalizeDecisionContext({
        game: state,
        format: 'cash',
        heroId: hero.id,
        configuredSeatCount: SNG_SEATS,
        legalActions: acts,
    })
    return { normalized, state, hero, acts }
}

function pricedResult(context) {
    const actions = context.legalActions.map((a, i) => ({
        action: typeof a === 'string' ? a : a.type,
        frequency: i === 0 ? 1 : 0,
    }))
    return { actions }
}

describe('strategy source bridge — nothing is configured today', () => {
    it('ships no configured strategy packet', () => {
        expect(getConfiguredStrategyPacket()).toBeNull()
    })

    it('yields no live source for a real hero-turn context', () => {
        const { normalized } = liveContext()
        expect(normalized.ok).toBe(true)
        expect(currentDecisionSource(normalized.context)).toBeNull()
    })

    it('keeps the live coach unavailable end to end', () => {
        const { normalized } = liveContext()
        const decision = resolveDecision({
            context: normalized.context,
            source: currentDecisionSource(normalized.context),
        })
        expect(decision.state).toBe('unavailable')
        expect(decision.result).toBeNull()
        expect(decision.reason).toBe(REASONS.INVALID_SOURCE)
    })
})

describe('strategy source bridge — refuses ungoverned input', () => {
    const { normalized } = liveContext()
    const context = normalized.context

    it('returns null for absent, malformed, or non-object packets', () => {
        for (const packet of [null, undefined, 0, '', 'packet', [], true, Object.create({ manifest: {} })]) {
            expect(buildDecisionSource({ packet, context })).toBeNull()
        }
    })

    it('returns null when the context is missing or malformed', () => {
        const packet = { manifest: goodManifest(), resultFor: () => pricedResult(context) }
        for (const bad of [null, undefined, 'ctx', [], 5]) {
            expect(buildDecisionSource({ packet, context: bad })).toBeNull()
        }
    })

    it('refuses a packet whose manifest fails validation', () => {
        const rejects = [
            {},
            { sourceId: '', version: '1.0.0', kind: 'authored-local', reviewed: true, reviewer: 'R', coverage: ['x'] },
            { sourceId: 's', version: 'not-semver', kind: 'authored-local', reviewed: true, reviewer: 'R', coverage: ['x'] },
            { sourceId: 's', version: '1.0.0', kind: 'made-up-kind', reviewed: true, reviewer: 'R', coverage: ['x'] },
            // claims review with no accountable reviewer
            { sourceId: 's', version: '1.0.0', kind: 'authored-local', reviewed: true, reviewer: '', coverage: ['x'] },
            // reviewed but no declared coverage scope
            { sourceId: 's', version: '1.0.0', kind: 'authored-local', reviewed: true, reviewer: 'R', coverage: [] },
            // generic catch-all chart cannot back an exact claim
            { sourceId: 's', version: '1.0.0', kind: 'authored-local', reviewed: true, reviewer: 'R', coverage: ['x'], genericFallback: true },
        ]
        for (const manifest of rejects) {
            const packet = { manifest, resultFor: () => pricedResult(context) }
            expect(buildDecisionSource({ packet, context })).toBeNull()
        }
    })

    it('rejects an invalid manifest, and accepts a valid one', () => {
        // Paired assertion: the rejection below must be caused by the manifest and
        // not by some unrelated failure, so the valid case is checked alongside it.
        const manifest = { sourceId: 's', version: 'not-semver', kind: 'authored-local', reviewed: true, reviewer: 'R', coverage: ['x'] }
        const packet = { manifest, resultFor: () => pricedResult(context) }
        expect(buildDecisionSource({ packet, context })).toBeNull()

        const ok = buildDecisionSource({ packet: { manifest: goodManifest(), resultFor: () => pricedResult(context) }, context })
        expect(ok).not.toBeNull()
        expect(ok.reviewed).toBe(true)
        expect(ok.sourceId).toBe('test-packet')
    })

    it('refuses a packet with no usable resultFor, and never invents a result', () => {
        for (const resultFor of [undefined, null, 'fn', 42, () => null, () => undefined, () => 'result', () => []]) {
            const packet = { manifest: goodManifest(), resultFor }
            expect(buildDecisionSource({ packet, context })).toBeNull()
        }
    })

    it('contains a throwing packet instead of letting it break the coach', () => {
        const thrower = { manifest: goodManifest(), resultFor: () => { throw new Error('boom') } }
        expect(() => buildDecisionSource({ packet: thrower, context })).not.toThrow()
        expect(buildDecisionSource({ packet: thrower, context })).toBeNull()

        const hostileManifest = { get manifest() { throw new Error('boom') }, resultFor: () => pricedResult(context) }
        expect(() => buildDecisionSource({ packet: hostileManifest, context })).not.toThrow()
        expect(buildDecisionSource({ packet: hostileManifest, context })).toBeNull()
    })
})

describe('strategy source bridge — committed assets cannot back an exact claim', () => {
    it('classifies both shipped assets as unreviewed non-authored material', () => {
        for (const name of ['preflop.json', 'postflop.json']) {
            const c = classifyLocalAsset(readAsset(name), name)
            expect(c.reviewed).toBe(false)
            expect(c.kind).not.toBe('authored-local')
        }
    })

    it('cannot promote a shipped asset into a live source via its classification', () => {
        const { normalized } = liveContext()
        for (const name of ['preflop.json', 'postflop.json']) {
            const c = classifyLocalAsset(readAsset(name), name)
            // Even handed straight to the bridge as a manifest, classification output
            // lacks the reviewed/coverage guarantees validateManifest demands.
            const packet = { manifest: c, resultFor: () => pricedResult(normalized.context) }
            expect(buildDecisionSource({ packet, context: normalized.context })).toBeNull()
        }
    })
})

function goodManifest() {
    return {
        sourceId: 'test-packet',
        version: '1.0.0',
        kind: 'authored-local',
        reviewed: true,
        reviewer: 'Test Reviewer',
        coverage: ['cash/6max/preflop'],
        genericFallback: false,
    }
}
