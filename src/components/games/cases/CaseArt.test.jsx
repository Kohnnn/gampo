// QA037 (#36): a failed artwork request must not leave an anonymous broken box.
// For a drop result the player has to be able to tell what they received even
// when the image never arrives, so the fallback keeps the item's name.
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CaseArt from './CaseArt'

// `useState` is the only hook the fallback needs; drive it directly so the
// error branch can be rendered without a DOM.
const artState = vi.hoisted(() => ({ failed: false }))
vi.mock('react', async () => ({
    ...await vi.importActual('react'),
    useState: initial => [artState.failed ? true : initial, () => {}],
}))
afterEach(() => { artState.failed = false })

describe('Cases artwork fallback', () => {
    it('renders the image with the item name while the artwork loads', () => {
        const html = renderToStaticMarkup(<CaseArt src="/assets/cases/skin.webp" alt="AK-47 | Redline" />)
        expect(html).toContain('src="/assets/cases/skin.webp"')
        expect(html).toContain('alt="AK-47 | Redline"')
        expect(html).toContain('loading="lazy"')
        expect(html).toContain('data-case-art="true"')
    })

    it('keeps the item identifiable when the artwork fails', () => {
        artState.failed = true
        const html = renderToStaticMarkup(<CaseArt src="/assets/cases/skin.webp" alt="AK-47 | Redline" />)
        expect(html).not.toContain('<img')
        expect(html).toContain('data-case-art-fallback="true"')
        expect(html).toContain('role="img"')
        expect(html).toContain('AK-47 | Redline (artwork unavailable)')
    })

    it('treats a missing source as a fallback rather than an empty image', () => {
        const html = renderToStaticMarkup(<CaseArt src="" alt="Case" />)
        expect(html).not.toContain('<img')
        expect(html).toContain('data-case-art-fallback="true"')
    })

    it('keeps decorative artwork out of the accessibility tree by name', () => {
        artState.failed = true
        const html = renderToStaticMarkup(<CaseArt src="/assets/cases/bg.webp" alt="" />)
        expect(html).toContain('Artwork unavailable')
    })
})
