import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import FreeSpinCounter from './FreeSpinCounter.jsx'

describe('FreeSpinCounter', () => {
    it('renders nothing when there is no awarded total', () => {
        const html = renderToStaticMarkup(<FreeSpinCounter totalAwarded={0} remaining={0} />)
        expect(html).toBe('')
    })

    it('renders the HUD chip with remaining count and aria label', () => {
        const html = renderToStaticMarkup(<FreeSpinCounter totalAwarded={10} remaining={6} />)
        expect(html).toContain('class="slot-free-spin-counter"')
        expect(html).toContain('aria-label="6 of 10 free spins remaining"')
        expect(html).toContain('<strong>6</strong>')
        expect(html).toContain('60%')
    })

    it('marks the FINAL tag and fires onComplete on the last remaining spin', () => {
        const onComplete = vi.fn()
        const html = renderToStaticMarkup(
            <FreeSpinCounter totalAwarded={3} remaining={1} onComplete={onComplete} />,
        )
        expect(html).toContain('is-final')
        expect(html).toContain('FINAL')
    })

    it('clamps the ring fill math so remaining=0 stays 0%', () => {
        const html = renderToStaticMarkup(<FreeSpinCounter totalAwarded={5} remaining={0} />)
        expect(html).toContain('0%')
        expect(html).toMatch(/aria-label="0 of 5 free spins remaining"/)
    })

    it('uses a circular SVG ring with stroke-dasharray setup', () => {
        const html = renderToStaticMarkup(<FreeSpinCounter totalAwarded={4} remaining={2} />)
        expect(html).toContain('<svg')
        expect(html).toContain('class="slot-free-spin-counter-ring-track"')
        expect(html).toContain('class="slot-free-spin-counter-ring-fill"')
    })
})