import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { SLOT_TEMPLATE_ROUTES } from '../data/slotRoutes'

vi.mock('../context/CreditContext', () => ({
    useCredits: () => ({ balance: 1000, transactions: [], toasts: [] }),
}))
vi.mock('../context/SidebarUIContext', () => ({
    useSidebarUI: () => ({ isSidebarOpen: false, toggleSidebar: () => {} }),
}))

import Header from './Header'

const source = readFileSync(new URL('./Header.jsx', import.meta.url), 'utf8')

describe('Header search contract', () => {
    it('uses the shared game index and exposes result hooks', () => {
        expect(source).toContain('fullGameCatalog')
        expect(source).toContain('searchGames')
        expect(source).toContain('data-header-search')
        expect(source).toContain('data-header-search-results')
        expect(source).not.toContain('!isPlaySurface && (')
    })
})

describe('Header game chrome', () => {
    it('uses compact game chrome on every canonical slot route without losing wallet or settings access', () => {
        for (const { path } of SLOT_TEMPLATE_ROUTES) {
            const html = renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(Header)))
            expect(html).toContain('header header-play-surface')
            expect(html).toContain('aria-label="Settings"')
            expect(html).toContain('aria-label="Open navigation menu"')
            expect(html).toContain('aria-label="Practice credits balance 1,000.00. Click to top up or review activity."')
        }
    })

    it('keeps lobby search chrome outside game routes', () => {
        const html = renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: ['/'] }, React.createElement(Header)))
        expect(html).not.toContain('header header-play-surface')
        expect(html).toContain('aria-label="Search games"')
    })
})
