import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./PokerGame.css', import.meta.url), 'utf8')
const source = readFileSync(new URL('./PokerGame.jsx', import.meta.url), 'utf8')

describe('poker layout CSS', () => {
    it('lets the poker page scroll inside the app shell', () => {
        expect(css).toMatch(/\.poker-page\s*\{[^}]*overflow-y:\s*auto/s)
        expect(css).toMatch(/\.poker-layout\s*\{[^}]*align-items:\s*start/s)
        expect(css).toMatch(/\.poker-sidebar-body\s*\{[^}]*overflow-y:\s*auto/s)
    })

    it('keeps the GTO decision context sticky and cells keyboard reachable', () => {
        expect(css).toMatch(/\.gto-context\s*\{[^}]*position:\s*sticky/s)
        expect(css).toContain('.gto-cell-button:focus-visible')
        expect(css).toContain('.gto-hand-detail-live')
    })

    it('keeps mobile poker entry and action controls reachable', () => {
        expect(source).toContain('data-poker-action="sit-down"')
        expect(source).toContain('data-mobile-hit-target="primary"')
        expect(source).toContain('poker-mobile-gto-now')
        expect(source).toContain('data-poker-mobile-panel="gto"')
        expect(source).toContain('enterPokerSession')
        expect(source).toContain('scrollIntoView')
        for (const action of ['fold', 'check', 'call', 'raise']) {
            expect(source).toContain(`data-poker-action="${action}"`)
        }
        expect(css).toMatch(/@media \(max-width: 768px\)[\s\S]*\.pk-actions\s*\{[\s\S]*position:\s*sticky/s)
        expect(css).toContain('bottom: calc(var(--mobile-nav-height, 64px) + 8px)')
        expect(css).toContain('max-height: 340px')
        // GTO hand search is pinned (sticky) so it stays reachable while the grid scrolls.
        expect(css).toMatch(/\.gto-search-row\s*\{[^}]*position:\s*sticky/s)
        expect(css).toContain('.poker-mobile-gto-now')
    })

    it('instruments poker surfaces for the UX benchmark like the shared shell', () => {
        // Poker is a custom shell; without these markers it was exempt from the
        // benchmark's surface-coverage and playfield-priority scoring.
        expect(source).toContain('className="poker-page" data-ux-surface="shell"')
        expect(source).toContain('className="poker-titlebar" data-ux-surface="shell"')
        expect(source).toContain('className="poker-table" data-ux-surface="stage"')
        expect(source).toContain('className="poker-sidebar" data-ux-surface="aside"')
        expect(source).toContain('className="pk-actions" data-ux-surface="controls"')
    })
})
