import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./PokerGame.css', import.meta.url), 'utf8')
const source = readFileSync(new URL('./PokerGame.jsx', import.meta.url), 'utf8')

describe('poker layout CSS', () => {
    it('lets the poker page scroll inside the app shell', () => {
        expect(css).toMatch(/\.poker-page\s*\{[^}]*overflow-y:\s*auto/s)
        expect(css).toMatch(/\.poker-layout\s*\{[^}]*align-items:\s*start/s)
        expect(css).toMatch(/\.poker-sidebar-body\s*\{[^}]*overflow-y:\s*auto/s)
        expect(css).toMatch(/Mobile GTO scroll repair:[\s\S]*\.poker-sidebar-body\s*\{[\s\S]*overflow-y:\s*visible/s)
        expect(css).toMatch(/Mobile GTO scroll repair:[\s\S]*\.gto-grid-wrap\s*\{[\s\S]*overflow-y:\s*visible/s)
        expect(css).toContain('touch-action: pan-x pan-y')
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
        expect(source).toContain("is-waiting")
        expect(source).toContain("is-raise-open")
        expect(source).toContain("isHumanTurn && acts.map")
        expect(source).toContain('beforeunload')
        expect(source).toContain('Cash out before leaving poker or your current table stack will not return to balance.')
        expect(source).toContain('onClick={leaveToHub}')
        expect(source).toContain('setPendingExit')
        expect(source).toContain('Leave without cashout')
        expect(source).toContain('Cash out & leave')
        expect(source).toContain("document.addEventListener('click', blockAnchorExit, true)")
        expect(source).toContain("window.addEventListener('popstate', blockBackExit)")
        expect(css).toMatch(/Poker visual repair: final source of truth for cards and phone table flow/s)
        expect(css).toMatch(/Poker desktop repair: final source of truth for non-phone table layout/s)
        expect(css).toMatch(/@media \(min-width: 769px\)[\s\S]*\.pk-actions\s*\{[\s\S]*position:\s*static/s)
        expect(css).toMatch(/@media \(min-width: 769px\)[\s\S]*\.poker-page \.pk-seat\.is-human \.pk-seat-cards \.pk-card\s*\{[\s\S]*width:\s*62px/s)
        expect(css).toMatch(/@media \(min-width: 769px\)[\s\S]*\.poker-page \.pk-seat:not\(\.is-human\) \.pk-seat-cards \.pk-card\s*\{[\s\S]*width:\s*38px/s)
        expect(css).toMatch(/@media \(max-width: 768px\)[\s\S]*\.pk-actions\s*\{[\s\S]*position:\s*static/s)
        expect(css).toMatch(/@media \(max-width: 768px\)[\s\S]*\.poker-buyin\s*\{[\s\S]*position:\s*sticky[\s\S]*bottom:\s*calc\(var\(--mobile-nav-height, 64px\) \+ max\(8px, env\(safe-area-inset-bottom\)\)\)/s)
        expect(css).toMatch(/\.poker-table-felt\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s)
        expect(css).toMatch(/\.poker-page \.pk-seat\.is-human \.pk-seat-cards \.pk-card\s*\{[\s\S]*width:\s*clamp\(58px, 17vw, 72px\)/s)
        expect(css).toMatch(/\.poker-page \.pk-seat:not\(\.is-human\) \.pk-seat-cards \.pk-card\s*\{[\s\S]*width:\s*26px/s)
        expect(css).toMatch(/\.poker-page \.pk-card-back::after\s*\{\s*content:\s*''/s)
        expect(css).toMatch(/\.pk-actions\.is-waiting:not\(\.is-showdown\)\s*\{[\s\S]*max-height:\s*none/s)
        expect(css).toMatch(/\.pk-winners\s*\{[\s\S]*grid-column:\s*1 \/ -1/s)
        expect(css).toMatch(/\.gto-search-row\s*\{[^}]*position:\s*sticky/s)
        expect(css).toContain('.poker-mobile-gto-now')
    })

    it('instruments poker surfaces for the UX benchmark like the shared shell', () => {
        expect(source).toContain('className="poker-page" data-ux-surface="shell"')
        expect(source).toContain('className="poker-titlebar" data-ux-surface="shell"')
        expect(source).toContain('className="poker-table" data-ux-surface="stage"')
        expect(source).toContain('className="poker-sidebar" data-ux-surface="aside"')
        expect(source).toContain('className={`pk-actions')
        expect(source).toContain('data-ux-surface="controls"')
    })
})
