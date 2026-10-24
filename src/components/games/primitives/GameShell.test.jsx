import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import GameShell from './GameShell'

function renderShell(props = {}) {
    return renderToStaticMarkup(
        <MemoryRouter>
            <GameShell title="Test game" balance={1000} titleBarExtras={null} {...props} />
        </MemoryRouter>,
    )
}

describe('GameShell primary player', () => {
    it('keeps the primary outcome before secondary activity and education', () => {
        const html = renderShell({
            primaryStage: true,
            children: <div className="gs-primary-stage">Primary outcome</div>,
            secondary: <section aria-label="Game activity">Secondary activity</section>,
        })
        expect(html).toContain('data-primary-stage="true"')
        expect(html).toContain('aria-label="Test game playfield"')
        expect(html).toContain('tabindex="0"')
        expect(html.indexOf('Primary outcome')).toBeLessThan(html.indexOf('gs-secondary'))
        expect(html.indexOf('gs-secondary')).toBeLessThan(html.indexOf('Secondary activity'))
    })

    it('leaves existing games outside the bounded primary layout', () => {
        const html = renderShell({ children: <div>Existing game</div> })
        expect(html).not.toContain('data-primary-stage')
        expect(html).not.toContain('gs-secondary')
        expect(html).toContain('Existing game')
    })
})
