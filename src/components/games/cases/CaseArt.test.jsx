// QA037 (#36): a failed artwork request must not leave an anonymous broken box.
// For a drop result the player has to be able to tell what they received even
// when the image never arrives, so the fallback keeps the item's name.
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CaseArt from './CaseArt'

// `useState` is the only hook the fallback needs; drive it directly so the
// error branch can be rendered without a DOM.
const artState = vi.hoisted(() => ({ failedSrc: null }))
vi.mock('react', async () => ({
    ...await vi.importActual('react'),
    useState: initial => [artState.failedSrc === null ? initial : artState.failedSrc, () => {}],
}))
afterEach(() => { artState.failedSrc = null })

describe('Cases artwork fallback', () => {
    it('renders the image with the item name while the artwork loads', () => {
        const html = renderToStaticMarkup(<CaseArt src="/assets/cases/skin.webp" alt="AK-47 | Redline" />)
        expect(html).toContain('src="/assets/cases/skin.webp"')
        expect(html).toContain('alt="AK-47 | Redline"')
        expect(html).toContain('loading="lazy"')
        expect(html).toContain('data-case-art="true"')
    })

    it('keeps the item identifiable when the artwork fails', () => {
        artState.failedSrc = '/assets/cases/skin.webp'
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

    it('recovers valid artwork when the source changes after a failure', () => {
        // The selected-case slot reuses this component as `activeCase` changes.
        // A sticky failure flag would hide the next case's valid artwork forever.
        artState.failedSrc = '/assets/cases/broken.webp'
        const broken = renderToStaticMarkup(<CaseArt src="/assets/cases/broken.webp" alt="Broken" />)
        expect(broken).toContain('data-case-art-fallback="true"')
        const healthy = renderToStaticMarkup(<CaseArt src="/assets/cases/valid.webp" alt="Valid" />)
        expect(healthy).toContain('src="/assets/cases/valid.webp"')
        expect(healthy).not.toContain('data-case-art-fallback')
    })

    it('keeps decorative artwork out of the accessibility tree by name', () => {
        artState.failedSrc = '/assets/cases/bg.webp'
        const html = renderToStaticMarkup(<CaseArt src="/assets/cases/bg.webp" alt="" />)
        expect(html).toContain('Artwork unavailable')
    })
})
