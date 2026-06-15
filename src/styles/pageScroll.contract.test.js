import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Regression guard for the "some pages cannot scroll" bug.
//
// The app shell (.main-content in index.css) is overflow:hidden and stretches
// each routed page to the viewport height. A page therefore MUST declare its
// own scroll viewport (height:100% + overflow-y:auto) on its root element, or
// any content taller than the viewport is clipped with no scrollbar. Working
// surfaces (Home/Casino/Sportsbook) already do this; these four regressed.

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')

// Pull the body of the first CSS rule for `selector` (the page root rule).
function ruleBody(css, selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css)
    return match ? match[1] : ''
}

const PAGE_ROOTS = [
    ['./settings.css', '.settings-page'],
    ['./insights.css', '.insights-page'],
    ['./sandbox.css', '.sandbox-page'],
    ['../pages/CollectionsPage.css', '.collections-page'],
]

describe('page scroll contract', () => {
    it.each(PAGE_ROOTS)('%s root %s owns a scroll viewport', (file, selector) => {
        const body = ruleBody(read(file), selector)
        expect(body, `${selector} rule not found`).not.toBe('')
        expect(body, `${selector} must set height:100%`).toMatch(/height\s*:\s*100%/)
        expect(body, `${selector} must set overflow-y:auto`).toMatch(/overflow(?:-y)?\s*:\s*auto/)
    })

    it('the app shell still clips overflow (the reason pages must opt in)', () => {
        const indexCss = read('./index.css')
        const body = ruleBody(indexCss, '.main-content')
        expect(body).toMatch(/overflow\s*:\s*hidden/)
    })
})
