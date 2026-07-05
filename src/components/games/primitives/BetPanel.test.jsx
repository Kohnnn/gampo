import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactDOM from 'react-dom'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import BetPanel from './BetPanel.jsx'

// Stub `createPortal` so the portaled dock renders inline (BetPanel mounts
// into <body> when on mobile; in a node env there's no DOM body). We only
// assert markup structure, not interaction — interactive coverage lives in
// scripts/verifyBetSheet.mjs.
let portalSpy
beforeAll(() => {
    portalSpy = vi.spyOn(ReactDOM, 'createPortal').mockImplementation((node) => node)
})
afterAll(() => {
    portalSpy?.mockRestore?.()
})

function renderPanel(props = {}) {
    return renderToStaticMarkup(
        <BetPanel
            balance={1000}
            minBet={0.5}
            maxBet={10000}
            initialBet={5}
            onPlay={vi.fn()}
            {...props}
        />,
    )
}

describe('BetPanel mobile stepper polish (Wave 2)', () => {
    it('renders the primary chip row with data-mobile-stepper-chips marker', () => {
        const html = renderPanel()
        expect(html).toContain('data-mobile-stepper-chips="primary"')
        expect(html).toContain('data-stepper-touch-floor="44"')
    })

    it('exposes the quarter chip for halving chains', () => {
        const html = renderPanel()
        expect(html).toContain('data-bet-chip="quarter"')
        expect(html).toMatch(/1\/4|¼/)
    })

    it('marks the reset chip as 1x and exposes aria-label', () => {
        const html = renderPanel()
        expect(html).toContain('data-bet-chip="reset"')
        expect(html).toContain('aria-label="Reset to default bet')
    })

    it('declares the touch-floor as 44 on the primary row', () => {
        const html = renderPanel()
        expect(html).toContain('data-stepper-touch-floor="44"')
    })

    it('keeps the existing chip order: quarter, half, double, max', () => {
        const html = renderPanel()
        const idx = (needle) => html.indexOf(needle)
        const q = idx('data-bet-chip="quarter"')
        const h = idx('data-bet-chip="half"')
        const d = idx('data-bet-chip="double"')
        const m = idx('data-bet-chip="max"')
        expect(q).toBeGreaterThan(-1)
        expect(q).toBeLessThan(h)
        expect(h).toBeLessThan(d)
        expect(d).toBeLessThan(m)
    })
})