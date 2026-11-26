import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import FeedStatus from './components/FeedStatus'
import { formatObservedAge, presentFeedCondition } from './sportsbookPresentation'

// QA042: customer-visible rendered states only. Mounted placement, native
// geometry, wrapping and overlap are asserted in qa042NativeProbe.mjs.

const LONG_SOURCE = 'Very Long Feed Provider Name For Stressing The Metadata Column In This Test'
const UNBROKEN_SOURCE = 'ProviderNameWithoutSpaces'.repeat(20)
const STRESS_SOURCES = Array.from({ length: 18 }, (_, i) => `International Bookmaker ${String(i + 1).padStart(2, '0')} Trading and Sports Markets`)
const GENERATED_AT = '2026-10-20T12:00:00Z'

const FIXTURES = {
    current: { state: 'current', generatedAt: GENERATED_AT, sources: ['Desk Book', LONG_SOURCE], errors: [] },
    stale: { state: 'stale', generatedAt: GENERATED_AT, sources: [LONG_SOURCE], errors: [] },
    empty: { state: 'empty', generatedAt: null, sources: [], errors: [] },
    error: { state: 'error', generatedAt: null, sources: [], errors: ['Provider unavailable'] },
}
const render = state => renderToStaticMarkup(<FeedStatus presentation={presentFeedCondition(FIXTURES[state])} />)
const textOf = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

describe('sportsbook feed status render (QA042)', () => {
    it.each(Object.keys(FIXTURES))('renders %s status copy and metadata labels', state => {
        const html = render(state)
        const text = textOf(html)
        const presentation = presentFeedCondition(FIXTURES[state])
        expect(html).toContain(`class="sb-feed-status is-${state}"`)
        expect(html).not.toContain('undefined')
        expect(text).toContain(presentation.heading)
        expect(text).toContain(presentation.body)
        expect(text).toContain('Last refresh')
        expect(text).toContain('Sources')
        expect(text.length).toBeGreaterThan(presentation.heading.length + presentation.body.length + 20)
    })

    it('preserves long, unbroken and eighteen provider names in rendered markup', () => {
        expect(textOf(render('current'))).toContain(LONG_SOURCE)
        const unbroken = renderToStaticMarkup(<FeedStatus presentation={presentFeedCondition({ ...FIXTURES.current, sources: [UNBROKEN_SOURCE] })} />)
        expect(textOf(unbroken)).toContain(UNBROKEN_SOURCE)
        const stress = renderToStaticMarkup(<FeedStatus presentation={presentFeedCondition({ ...FIXTURES.current, sources: STRESS_SOURCES })} />)
        expect(textOf(stress)).toContain(STRESS_SOURCES.join(', '))
    })

    it('states empty and error cases honestly instead of leaving metadata blank', () => {
        expect(textOf(render('empty'))).toContain('No attributable source')
        expect(textOf(render('empty'))).toContain('Refresh time unavailable')
        expect(textOf(render('error'))).toContain('Sportsbook feed unavailable')
        expect(textOf(render('error'))).toContain('No trustworthy feed data is available.')
        expect(textOf(render('current'))).toContain(formatObservedAge(GENERATED_AT))
    })
})
