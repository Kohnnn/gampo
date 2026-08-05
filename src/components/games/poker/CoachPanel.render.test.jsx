// Render-level truthfulness contract for the coach.
//
// Earlier phases could only assert on source text and CSS regexes because no
// jsdom-family dependency is installed. react-dom/server needs no DOM, so these
// tests exercise the real component output with zero new dependencies.
//
// The invariant under test: rendered markup must never present unreviewed data as
// exact or prescriptive.

import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import CoachPanel from './CoachPanel.jsx'

const render = props => renderToStaticMarkup(<CoachPanel {...props} />)

const authored = { kind: 'authored-local', sourceId: 'cash-6max', version: '1.0.0', reviewed: true }
const approximate = { kind: 'approximate-local', sourceId: '6max-cash-100bb', version: 'schema-1', reviewed: false }

const actions = { actions: [{ type: 'raise', frequency: 0.75 }, { type: 'fold', frequency: 0.25 }] }

describe('coach render — state surfacing', () => {
    it('marks a reviewed source as supported and prescriptive', () => {
        const html = render({ decision: { state: 'supported', reason: null, provenance: authored, result: actions } })
        expect(html).toContain('data-poker-coach-state="supported"')
        expect(html).toContain('Reviewed strategy')
        expect(html).toContain('is-reviewed')
        // A supported view is the only one allowed to omit the not-reviewed caveat.
        expect(html).not.toContain('Reference frequencies only')
    })

    it('marks an unreviewed approximate source as not reviewed and caveats the frequencies', () => {
        const html = render({ decision: { state: 'approximate', reason: null, provenance: approximate, result: actions } })
        expect(html).toContain('data-poker-coach-state="approximate"')
        expect(html).toContain('Approximate only')
        expect(html).toContain('is-unreviewed')
        expect(html).toContain('Not reviewed')
        // The caveat is mandatory whenever frequencies show without a reviewed source.
        expect(html).toContain('Reference frequencies only')
    })

    it('renders unavailable without inventing any advice', () => {
        const html = render({ decision: { state: 'unavailable', reason: 'INVALID_SOURCE', provenance: null, result: null } })
        expect(html).toContain('data-poker-coach-state="unavailable"')
        expect(html).toContain('No reviewed strategy')
        expect(html).not.toContain('pk-coach-actions')
        expect(html).not.toMatch(/\d+%/)
    })

    it('fails closed to error for off-contract input', () => {
        for (const decision of [null, undefined, 42, 'x', { state: 'bogus' }, { state: 'supported', reason: 'X', provenance: authored, result: actions }]) {
            expect(render({ decision })).toContain('data-poker-coach-state="error"')
        }
    })

    it('never shows frequency bars in a non-frequency state', () => {
        for (const state of ['unavailable', 'loading', 'error']) {
            const html = render({ decision: { state, reason: state === 'loading' ? null : 'INVALID_SOURCE', provenance: null, result: null } })
            expect(html).not.toContain('pk-coach-action-pct')
        }
    })
})

describe('coach render — the honesty invariant', () => {
    // The single most important guarantee in the whole strategy layer.
    it('only ever renders prescriptive language when the source is authored AND reviewed', () => {
        const cases = [
            { label: 'unreviewed authored', provenance: { ...authored, reviewed: false }, state: 'supported' },
            { label: 'approximate kind in supported state', provenance: approximate, state: 'supported' },
            { label: 'legacy kind', provenance: { kind: 'legacy-local', sourceId: 'p', version: '1', reviewed: false }, state: 'supported' },
        ]
        for (const c of cases) {
            const html = render({ decision: { state: c.state, reason: null, provenance: c.provenance, result: actions } })
            // Each of these is off-contract, so the coach must refuse rather than claim review.
            expect(html, c.label).toContain('data-poker-coach-state="error"')
            expect(html, c.label).not.toContain('Reviewed strategy')
        }
    })

    it('never emits the word exact as a claim about unreviewed data', () => {
        const html = render({ decision: { state: 'approximate', reason: null, provenance: approximate, result: actions } })
        // "Not reviewed for exact play" is a disclaimer; a bare exact claim is not allowed.
        expect(html).not.toMatch(/exact (?:strategy|play|solution)(?!\s*\.?<\/p>)/i)
        expect(html).toContain('Not reviewed for exact play')
    })

    it('shows provenance whenever it presents any source', () => {
        for (const [state, provenance] of [['supported', authored], ['approximate', approximate]]) {
            const html = render({ decision: { state, reason: null, provenance, result: actions } })
            expect(html).toContain(provenance.sourceId)
            expect(html).toContain('v' + provenance.version)
        }
    })
})

describe('coach render — arithmetic coverage block', () => {
    const table = { pot: 150, toCall: 50, effectiveStack: 1000, bb: 20, legalActions: ['fold', 'call', 'raise'] }

    it('shows arithmetic coverage when no source resolves', () => {
        const html = render({
            decision: { state: 'unavailable', reason: 'INVALID_SOURCE', provenance: null, result: null },
            table,
            sourceConfigured: false,
        })
        expect(html).toContain('pk-coach-coverage')
        expect(html).toContain('Table arithmetic')
        expect(html).toContain('low confidence')
    })

    it('never recommends an action in the coverage block', () => {
        const html = render({
            decision: { state: 'unavailable', reason: 'INVALID_SOURCE', provenance: null, result: null },
            table,
            sourceConfigured: false,
        })
        // Arithmetic only. Any imperative action verb here would make it a strategy layer.
        expect(html).not.toMatch(/you should (?:fold|call|raise|bet|check)/i)
        expect(html).not.toMatch(/recommend(?:ed|s)?\s+(?:fold|call|raise)/i)
        expect(html).not.toMatch(/\bbest (?:play|action|line)\b/i)
    })

    it('yields to an exact source instead of showing arithmetic', () => {
        const html = render({
            decision: { state: 'supported', reason: null, provenance: authored, result: actions },
            table,
            sourceConfigured: true,
        })
        expect(html).not.toContain('pk-coach-coverage')
    })

    it('renders without a table without throwing', () => {
        expect(() => render({ decision: { state: 'unavailable', reason: 'INVALID_SOURCE', provenance: null, result: null } })).not.toThrow()
    })
})
