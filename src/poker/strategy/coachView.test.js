import { describe, expect, it } from 'vitest'

import { REASONS } from './decisionContract.js'
import { VIEW_STATE_VALUES, presentDecision } from './coachView.js'

const provenance = (over = {}) => ({
    kind: 'authored-local',
    sourceId: 'cash-6max-100bb',
    version: '1.0.0',
    reviewed: true,
    ...over,
})

const result = (actions = [{ type: 'raise', frequency: 1 }]) => ({ actions })

const supported = () => ({ state: 'supported', reason: null, provenance: provenance(), result: result() })
const approximate = () => ({
    state: 'approximate',
    reason: null,
    provenance: provenance({ kind: 'approximate-local', reviewed: false }),
    result: result([{ type: 'call', frequency: 0.62 }, { type: 'fold', frequency: 0.38 }]),
})
const unavailable = reason => ({ state: 'unavailable', reason, provenance: null, result: null })

describe('coachView five-state presentation', () => {
    it('exposes exactly the five truth states', () => {
        expect(VIEW_STATE_VALUES).toEqual(['supported', 'approximate', 'unavailable', 'loading', 'error'])
    })

    it('renders every state distinctly and only prescribes when supported', () => {
        const seen = new Map()
        for (const input of [
            supported(),
            approximate(),
            unavailable(REASONS.MISSING_LOOKUP_POSITION),
            { state: 'loading', token: { contextId: 'x', requestId: 0 }, provenance: null, reason: null, result: null },
            { state: 'error', reason: REASONS.INVALID_REQUEST_TOKEN, provenance: null, result: null },
        ]) {
            const out = presentDecision(input)
            seen.set(out.state, out)
        }
        expect([...seen.keys()]).toEqual(['supported', 'approximate', 'unavailable', 'loading', 'error'])
        const headlines = [...seen.values()].map(v => v.headline)
        const testIds = [...seen.values()].map(v => v.testId)
        expect(new Set(headlines).size).toBe(5)
        expect(new Set(testIds).size).toBe(5)
        expect([...seen.values()].filter(v => v.prescriptive)).toHaveLength(1)
        expect(seen.get('supported').prescriptive).toBe(true)
    })

    it('shows frequencies only for supported and approximate', () => {
        expect(presentDecision(supported()).showsFrequencies).toBe(true)
        expect(presentDecision(approximate()).showsFrequencies).toBe(true)
        for (const input of [
            unavailable(REASONS.LEGACY_SOURCE_UNREVIEWED),
            { state: 'loading', provenance: null, reason: null, result: null },
            { state: 'error', reason: REASONS.INVALID_SOURCE, provenance: null, result: null },
        ]) {
            const out = presentDecision(input)
            expect(out.showsFrequencies).toBe(false)
            expect(out.actions).toEqual([])
        }
    })

    it('formats action frequencies as whole percentages', () => {
        const out = presentDecision(approximate())
        expect(out.actions.map(a => [a.type, a.percent])).toEqual([['call', '62%'], ['fold', '38%']])
    })

    it('never marks approximate output as prescriptive even when reviewed is true', () => {
        const input = approximate()
        input.provenance = provenance({ kind: 'approximate-local', reviewed: true })
        const out = presentDecision(input)
        expect(out.state).toBe('approximate')
        expect(out.prescriptive).toBe(false)
        expect(out.provenance.label).toBe('Reviewed')
    })

    it('maps every contract reason code to human text with no leaked identifiers', () => {
        for (const code of Object.values(REASONS)) {
            const out = presentDecision(unavailable(code))
            expect(out.state).toBe('unavailable')
            expect(out.reasonCode).toBe(code)
            expect(typeof out.reasonText).toBe('string')
            expect(out.reasonText.length).toBeGreaterThan(0)
            expect(out.reasonText).not.toContain('_')
        }
    })

    it('falls back to safe text for an unknown reason code without throwing', () => {
        const out = presentDecision(unavailable('NOT_A_REAL_REASON'))
        expect(out.state).toBe('unavailable')
        expect(out.reasonText).toBe('This spot cannot be shown right now.')
    })
})

describe('coachView fails closed', () => {
    it('rejects non-plain and unknown-state input', () => {
        for (const bad of [null, undefined, 0, 'supported', [], () => {}, new Date(), { state: 'gto' }, { state: null }]) {
            expect(presentDecision(bad).state).toBe('error')
        }
    })

    it('rejects supported claims that lack reviewed authored-local provenance', () => {
        const cases = [
            { ...supported(), provenance: provenance({ reviewed: false }) },
            { ...supported(), provenance: provenance({ kind: 'legacy-local' }) },
            { ...supported(), provenance: provenance({ kind: 'approximate-local' }) },
            { ...supported(), provenance: null },
            { ...supported(), provenance: provenance({ sourceId: '' }) },
            { ...supported(), provenance: provenance({ version: '' }) },
            { ...supported(), reason: REASONS.INVALID_SOURCE },
        ]
        for (const bad of cases) {
            const out = presentDecision(bad)
            expect(out.state).toBe('error')
            expect(out.prescriptive).toBe(false)
        }
    })

    it('rejects malformed results rather than rendering partial advice', () => {
        const cases = [
            result([]),
            result([{ type: 'raise' }]),
            result([{ type: 'raise', frequency: 1.4 }]),
            result([{ type: 'raise', frequency: -0.1 }]),
            result([{ type: 'raise', frequency: Number.NaN }]),
            result([{ type: '', frequency: 1 }]),
            { actions: 'raise' },
            null,
        ]
        for (const bad of cases) {
            const out = presentDecision({ ...supported(), result: bad })
            expect(out.state).toBe('error')
            expect(out.actions).toEqual([])
        }
    })

    it('rejects non-prescriptive states that smuggle a result payload', () => {
        const out = presentDecision({ state: 'unavailable', reason: REASONS.MISSING_HERO_TURN, provenance: null, result: result() })
        expect(out.state).toBe('error')
    })

    it('survives throwing accessors and returns the error view', () => {
        for (const key of ['state', 'reason', 'provenance', 'result']) {
            const hostile = { state: 'supported', reason: null, provenance: provenance(), result: result() }
            Object.defineProperty(hostile, key, { get() { throw new Error('hostile') }, configurable: true })
            expect(presentDecision(hostile).state).toBe('error')
        }
    })

    it('cannot be forged by a proxy that varies values across reads', () => {
        let reads = 0
        const hostile = new Proxy({ state: 'supported', reason: null, provenance: provenance(), result: result() }, {
            get(target, key) {
                if (key === 'state') {
                    reads += 1
                    return 'supported'
                }
                if (key === 'provenance') return reads > 1 ? provenance() : provenance({ reviewed: false })
                return target[key]
            },
        })
        const out = presentDecision(hostile)
        expect(out.state).toBe('error')
        expect(out.prescriptive).toBe(false)
    })

    it('returns frozen output that cannot be mutated by the caller', () => {
        const out = presentDecision(supported())
        expect(Object.isFrozen(out)).toBe(true)
        expect(Object.isFrozen(out.actions)).toBe(true)
        expect(() => { 'use strict'; out.prescriptive = true }).toThrow()
        expect(out.prescriptive).toBe(true)
    })

    it('does not mutate or alias the caller input', () => {
        const input = supported()
        const snapshot = JSON.stringify(input)
        const out = presentDecision(input)
        expect(JSON.stringify(input)).toBe(snapshot)
        expect(out.actions).not.toBe(input.result.actions)
        expect(out.provenance).not.toBe(input.provenance)
    })
})
