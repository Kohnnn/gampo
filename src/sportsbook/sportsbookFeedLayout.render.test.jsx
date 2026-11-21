import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import FeedStatus from './components/FeedStatus'
import { formatObservedAge, presentFeedCondition } from './sportsbookPresentation'

// QA042: on desktop the feed status text had zero readable width while the
// metadata column overlapped it. There is no browser on this host, so nothing
// here measures native layout. What is proven instead:
//   1. the render contract — every feed state produces readable headings, copy
//      and metadata labels through the same component the shell mounts;
//   2. the breakpoint contract — the column model is *read out of the shipped
//      stylesheet*, not restated here, so it cannot drift from the CSS;
//   3. an arithmetic floor over the declared box chrome, which is the only way
//      `minmax(0, 1fr)` can resolve to zero width (it cannot, given `min-width: 0`).

const css = readFileSync(new URL('../styles/sportsbook.css', import.meta.url), 'utf8')
const shell = readFileSync(new URL('./SportsbookShell.jsx', import.meta.url), 'utf8')

// --- stylesheet reading -----------------------------------------------------

function ruleDeclarations(selector, stylesheet = css) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const bodies = [...stylesheet.matchAll(new RegExp(`(?:^|[,{}\\s])(${escaped}(?:\\s*,[^{}]*)?)\\s*\\{([^{}]*)\\}`, 'gm'))]
        .filter(match => match[1].split(',').map(part => part.trim()).includes(selector))
        .map(match => match[2])
    return bodies.at(-1) ?? ''
}

function mediaBlocks(stylesheet = css) {
    const blocks = []
    const opener = /@media([^{]+)\{/g
    let match
    while ((match = opener.exec(stylesheet))) {
        let depth = 1
        let index = opener.lastIndex
        while (index < stylesheet.length && depth > 0) {
            if (stylesheet[index] === '{') depth += 1
            else if (stylesheet[index] === '}') depth -= 1
            index += 1
        }
        blocks.push({ query: match[1].trim(), body: stylesheet.slice(opener.lastIndex, index - 1) })
        opener.lastIndex = index
    }
    return blocks
}

function queryMatches(query, width) {
    return query.split(' and ').every(condition => {
        const min = condition.match(/\(min-width:\s*(\d+)px\)/)
        if (min) return width >= Number(min[1])
        const max = condition.match(/\(max-width:\s*(\d+)px\)/)
        if (max) return width <= Number(max[1])
        return false
    })
}

// A media block's declarations are meaningless without its query, so strip the
// bodies out to read the unconditional base rule.
function stripMedia(stylesheet) {
    return mediaBlocks(stylesheet).reduce((out, block) => out.replace(block.body, ''), stylesheet)
}

function declaration(block, property) {
    return block.match(new RegExp(`(?:^|;|\\s)${property}:\\s*([^;]+)`))?.[1].trim() ?? null
}

// Applies the base rule then every matching media override in source order, the
// same cascade order the browser uses for these single-class selectors.
function resolveFeedStatus(viewportWidth) {
    const base = ruleDeclarations('.sb-feed-status', stripMedia(css))
    let columns = declaration(base, 'grid-template-columns')
    for (const block of mediaBlocks()) {
        if (!queryMatches(block.query, viewportWidth)) continue
        if (!ruleDeclarations('.sb-feed-status', block.body)) continue
        columns = declaration(ruleDeclarations('.sb-feed-status', block.body), 'grid-template-columns') ?? columns
    }
    const padding = declaration(base, 'padding') ?? '0'
    const [vertical, horizontal = vertical] = padding.split(/\s+/).map(value => parseFloat(value) || 0)
    const border = parseFloat(declaration(base, 'border')?.match(/^[\d.]+px/)?.[0]) || 0
    const gap = parseFloat(declaration(base, 'gap') ?? '0') || 0
    const columnsList = columns.split(/\s+(?![^(]*\))/).map(part => part.trim())
    const stacked = columnsList.length === 1
    const chrome = 2 * border + 2 * horizontal
    // Both tracks floor at 0: the reading div and the metadata `dl` both declare
    // `min-width: 0`, so `minmax(0, …)` cannot be inflated by min-content.
    const readingFloor = stacked ? viewportWidth - chrome : viewportWidth - chrome - gap
    return { columns, stacked, readingFloor, verticalPadding: vertical }
}

// --- fixtures ---------------------------------------------------------------

const LONG_SOURCE = 'Very Long Feed Provider Name For Stressing The Metadata Column In This Test'
const UNBROKEN_SOURCE = 'ProviderNameWithoutSpaces'.repeat(20)
const GENERATED_AT = '2026-10-20T12:00:00Z'

const FIXTURES = {
    current: { state: 'current', generatedAt: GENERATED_AT, sources: ['Desk Book', LONG_SOURCE], errors: [] },
    stale: { state: 'stale', generatedAt: GENERATED_AT, sources: [LONG_SOURCE], errors: [] },
    empty: { state: 'empty', generatedAt: null, sources: [], errors: [] },
    error: { state: 'error', generatedAt: null, sources: [], errors: ['Provider unavailable'] },
}

const VIEWPORTS = { desktop: 1610, intermediate: 1024, phone: 390 }

function render(state) {
    return renderToStaticMarkup(<FeedStatus presentation={presentFeedCondition(FIXTURES[state])} />)
}

function textOf(html) {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

describe('sportsbook feed status layout (QA042)', () => {
    it('resolves the status column to a nonzero width at every tested viewport', () => {
        for (const [name, width] of Object.entries(VIEWPORTS)) {
            const { readingFloor, stacked } = resolveFeedStatus(width)
            expect(readingFloor, `${name} ${width}px`).toBeGreaterThan(0)
            // Desktop keeps the two-column split; the phone breakpoint stacks.
            expect(stacked, `${name} ${width}px`).toBe(width <= 767)
        }
        // Text needs far more than a sliver to be readable, not merely > 0.
        expect(resolveFeedStatus(VIEWPORTS.desktop).readingFloor).toBeGreaterThan(300)
        expect(resolveFeedStatus(VIEWPORTS.intermediate).readingFloor).toBeGreaterThan(300)
        expect(resolveFeedStatus(VIEWPORTS.phone).readingFloor).toBeGreaterThan(300)
    })

    it('never lets the metadata column size to its longest token', () => {
        // The historical desktop bug: an `auto` track resolved to the min-content
        // of `sources.join(', ')`, squeezing the `1fr` reading column to 0.
        const { columns } = resolveFeedStatus(VIEWPORTS.desktop)
        expect(columns).toBe('minmax(0, 1fr) minmax(0, auto)')
        const base = stripMedia(css)
        expect(ruleDeclarations('.sb-feed-status dl', base)).toContain('flex-wrap: wrap')
        expect(ruleDeclarations('.sb-feed-status dl', base)).toContain('min-width: 0')
        expect(ruleDeclarations('.sb-feed-status > div', base)).toContain('min-width: 0')
        // One unbreakable provider token must break inside itself instead of
        // overflowing the status copy, which flex wrapping alone cannot do.
        expect(ruleDeclarations('.sb-feed-status dd', base)).toContain('overflow-wrap: anywhere')
    })

    it.each(Object.keys(FIXTURES))('renders readable %s status copy and metadata labels', state => {
        const html = render(state)
        const text = textOf(html)
        const presentation = presentFeedCondition(FIXTURES[state])
        expect(html).toContain(`class="sb-feed-status is-${state}"`)
        expect(html).not.toContain('undefined')
        expect(text).toContain(presentation.heading)
        expect(text).toContain(presentation.body)
        // Labels are the contract here: they are the only way a reader knows what
        // the two metadata values mean once the block stacks on a phone.
        expect(text).toContain('Last refresh')
        expect(text).toContain('Sources')
        expect(text.length).toBeGreaterThan(presentation.heading.length + presentation.body.length + 20)
    })

    it('keeps long and unbroken provider names present, not truncated', () => {
        const long = textOf(render('current'))
        expect(long).toContain(LONG_SOURCE)
        const unbroken = renderToStaticMarkup(<FeedStatus presentation={presentFeedCondition({ ...FIXTURES.current, sources: [UNBROKEN_SOURCE] })} />)
        expect(textOf(unbroken)).toContain(UNBROKEN_SOURCE)
        // No ellipsis/clamp contract on the metadata: the value is fully in the DOM.
        expect(ruleDeclarations('.sb-feed-status dd')).not.toContain('-webkit-line-clamp')
        expect(ruleDeclarations('.sb-feed-status dd')).not.toContain('text-overflow')
    })

    it('states the empty and error cases honestly instead of leaving metadata blank', () => {
        expect(textOf(render('empty'))).toContain('No attributable source')
        expect(textOf(render('empty'))).toContain('Refresh time unavailable')
        expect(textOf(render('error'))).toContain('Sportsbook feed unavailable')
        expect(textOf(render('error'))).toContain('No trustworthy feed data is available.')
        // Freshness text is derived from the observation time, not invented.
        expect(textOf(render('current'))).toContain(formatObservedAge(GENERATED_AT))
    })

    it('keeps the portal-wide placement: one status region inside the shell stage', () => {
        expect(shell).toContain('<FeedStatus presentation={feedPresentation} />')
        expect((shell.match(/<FeedStatus /g) || [])).toHaveLength(1)
        // Single live region, so the four states cannot double-announce.
        expect((render('error').match(/role="status"/g) || [])).toHaveLength(1)
    })
})
