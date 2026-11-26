import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./sportsbook.css', import.meta.url), 'utf8')

function ruleBodies(selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return [...css.matchAll(new RegExp(`(?:^|[,}])\\s*${escaped}\\s*(?:,[^{]*)?\\{([^}]*)\\}`, 'gm'))]
        .map(match => match[1])
}

function ruleBody(selector) {
    return ruleBodies(selector)[0] ?? ''
}

// QA042: the feed status text had zero readable width on desktop while the
// metadata overlapped it. The status block is a two-column grid whose right
// column is `auto`, and that column's child is a flex `dl` holding
// `sources.join(', ')` - one long unbreakable token. An `auto` track sizes to
// that token's min-content, and a grid child defaults to `min-width: auto`, so
// the `minmax(0, 1fr)` text column was squeezed to nothing.
//
// These original source invariants are retained as automated CI coverage. They
// do not by themselves prove the column cannot squeeze; the mounted native
// geometry probe is the regression that proves rendered readable width.
describe('sportsbook feed status layout (QA042)', () => {
    it('lets the metadata column shrink instead of sizing to its longest token', () => {
        const body = ruleBody('.sb-feed-status')
        expect(body).toContain('grid-template-columns: minmax(0, 1fr) minmax(0, auto)')
    })

    it('wraps the metadata list rather than forcing one unbreakable line', () => {
        const body = ruleBody('.sb-feed-status dl')
        expect(body).toContain('flex-wrap: wrap')
        expect(body).toContain('min-width: 0')
    })

    it('keeps the reading column free of a min-content floor', () => {
        // A grid child's default `min-width: auto` would still defeat the
        // `minmax(0, 1fr)` track if the text contained a long token.
        const body = ruleBody('.sb-feed-status > div')
        expect(body).toContain('min-width: 0')
    })
})
