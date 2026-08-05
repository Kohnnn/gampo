import { describe, it, expect } from 'vitest'
import { startHand, legalActions, applyAction, createInitialState } from '../engine/Game'
import { normalizeDecisionContext, resolveDecision } from './decisionContract'
import { coverGap } from './heuristicCoverage'

function tableFrom(state, hero, acts) {
    const toCall = Math.max(0, (state.currentBet || 0) - (hero.putIn || 0))
    const rivals = state.players.filter(p => p.id !== hero.id && (p.status === 'active' || p.status === 'allin'))
    const biggestRival = rivals.reduce((m, p) => Math.max(m, (p.stack || 0) + (p.putIn || 0)), 0)
    return {
        pot: state.pot || 0,
        toCall,
        effectiveStack: Math.min((hero.stack || 0) + (hero.putIn || 0), biggestRival),
        bb: state.bb || 0,
        legalActions: acts.map(a => a.type),
    }
}

function walk(steps) {
    let state = startHand(createInitialState({
        players: Array.from({ length: 6 }, (_, i) => ({ id: 'p' + i, name: 'P' + i, stack: 1000 })),
        sb: 10,
        bb: 20,
        ante: 0,
        buttonIndex: 0,
    }))
    const seen = []
    for (let step = 0; step < steps && state.toAct >= 0; step++) {
        const hero = state.players[state.toAct]
        const acts = legalActions(state)
        if (!acts.length) break
        const norm = normalizeDecisionContext({ game: state, format: 'cash', heroId: hero.id, configuredSeatCount: 6, legalActions: acts })
        const decision = norm.ok
            ? resolveDecision({ context: norm.context, source: null })
            : { state: 'unavailable', reason: norm.reason, provenance: null, result: null }
        seen.push({ decision, coverage: coverGap({ decision, table: tableFrom(state, hero, acts), sourceConfigured: false }) })
        const next = acts.find(a => a.type === 'call') || acts.find(a => a.type === 'check') || acts[0]
        state = applyAction(state, next)
    }
    return seen
}

describe('coverage against real engine state (C4)', () => {
    const seen = walk(12)

    it('drives real hands without ever throwing or blocking on valid state', () => {
        expect(seen.length).toBeGreaterThan(3)
        expect(seen.every(s => s.coverage.status !== 'blocked')).toBe(true)
    })

    it('produces real arithmetic for genuine gaps', () => {
        const covered = seen.filter(s => s.coverage.status === 'covered')
        expect(covered.length).toBeGreaterThan(0)
        for (const c of covered) {
            expect(JSON.stringify(c.coverage)).not.toMatch(/NaN|Infinity|undefined/)
            for (const n of c.coverage.notes) expect(String(n.value).length).toBeGreaterThan(0)
        }
    })

    it('never turns a real unavailable decision into a recommendation', () => {
        for (const s of seen) {
            expect(s.coverage.prescriptive).toBe(false)
            expect(JSON.stringify(s.coverage)).not.toMatch(/you should|best play|recommend/i)
        }
    })
})
