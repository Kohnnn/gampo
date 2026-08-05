import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./PokerGame.css', import.meta.url), 'utf8')
const source = readFileSync(new URL('./PokerGame.jsx', import.meta.url), 'utf8')
const loader = readFileSync(new URL('../../../poker/gto/loader.js', import.meta.url), 'utf8')
const globalCss = readFileSync(new URL('../../../styles/index.css', import.meta.url), 'utf8')
const desktopCss = css.slice(css.lastIndexOf('@media (min-width: 769px) {'))
const constrainedDesktopCss = css.slice(css.lastIndexOf('@media (min-width: 769px) and (max-width: 1200px) {'))
const mobileHeaderCss = globalCss.slice(globalCss.lastIndexOf('@media (max-width: 480px) {'))

const retiredPaths = [
    new URL('./GtoPanel.jsx', import.meta.url),
    new URL('../../../poker/gto/lookup.js', import.meta.url),
    new URL('../../../poker/__tests__/gtoLookup.test.js', import.meta.url),
]

describe('poker layout CSS', () => {
    it('keeps the poker page, sidebar, and responsive table layout reachable', () => {
        expect(css).toMatch(/\.poker-page\s*\{[^}]*overflow-y:\s*auto/s)
        expect(css).toMatch(/\.poker-layout\s*\{[^}]*align-items:\s*start/s)
        expect(css).toMatch(/\.poker-sidebar-body\s*\{[^}]*overflow:\s*visible[^}]*max-height:\s*none/s)
        expect(desktopCss).toMatch(/\.poker-sidebar\s*\{[^}]*max-height:\s*calc\(100vh - 32px\)[^}]*max-height:\s*calc\(100dvh - 32px\)[^}]*overflow-y:\s*auto[^}]*overflow-x:\s*hidden/s)
        expect(css).toContain('touch-action: pan-x pan-y')
    })

    it('removes retired player advice paths and selectors', () => {
        expect(source).not.toContain("import GtoPanel from './GtoPanel'")
        expect(source).not.toContain('<GtoPanel')
        expect(source).not.toContain('gtoNow')
        expect(source).not.toContain('data-poker-mobile-panel="gto"')
        expect(source).not.toContain("setTab('gto')")
        expect(source).not.toContain("tab === 'gto'")
        expect(source).not.toContain('>GTO</button>')
        expect(css).not.toMatch(/(^|[\s,{])\.gto-[\w-]*/m)
        expect(css).not.toContain('.poker-mobile-gto-')
        for (const path of retiredPaths) expect(existsSync(path)).toBe(false)
    })

    it('keeps mobile poker entry and action controls reachable', () => {
        expect(source).toContain('data-poker-action="sit-down"')
        expect(source).toContain('data-mobile-hit-target="primary"')
        expect(source).toContain('enterPokerSession')
        expect(source).toContain('scrollIntoView')
        for (const action of ['fold', 'check', 'call', 'raise']) {
            expect(source).toContain(`data-poker-action="${action}"`)
        }
        expect(source).toContain('is-waiting')
        expect(source).toContain('is-raise-open')
        expect(source).toContain('isHumanTurn && acts.map')
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
        expect(css).toMatch(/@media \(max-width: 768px\)[\s\S]*\.poker-titlebar h1\s*\{[^}]*font-size:\s*clamp\(1\.1rem, 4\.5vw, 1\.4rem\)/s)
        expect(css).toMatch(/@media \(max-width: 768px\)[\s\S]*\.pk-actions\s*\{[\s\S]*position:\s*static/s)
        expect(css).toMatch(/@media \(max-width: 768px\)[\s\S]*\.poker-buyin\s*\{[\s\S]*position:\s*sticky[\s\S]*bottom:\s*calc\(var\(--mobile-nav-height, 64px\) \+ max\(8px, env\(safe-area-inset-bottom\)\)\)/s)
        expect(css).toMatch(/\.poker-table-felt\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s)
        expect(css).toMatch(/@media \(max-width: 768px\)[\s\S]*\.pk-seats\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)[^}]*grid-template-rows:\s*repeat\(3, auto\)/s)
        expect(css).toMatch(/@media \(max-width: 768px\)[\s\S]*\.pk-seat\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*28px minmax\(0, 1fr\)/s)
        expect(css).toMatch(/@media \(max-width: 768px\)[\s\S]*\.poker-page \.pk-seat \.pk-seat-cards \.pk-card\s*\{[^}]*height:\s*auto[^}]*aspect-ratio:\s*5 \/ 7/s)
        expect(css).toMatch(/@media \(max-width: 768px\)[\s\S]*\.poker-page \.pk-seat\.is-human \.pk-seat-cards \.pk-card\s*\{[^}]*width:\s*32px/s)
        expect(css).toMatch(/@media \(max-width: 768px\)[\s\S]*\.poker-page \.pk-seat:not\(\.is-human\) \.pk-seat-cards \.pk-card\s*\{[^}]*width:\s*20px/s)
        expect(css).toMatch(/\.poker-page \.pk-card-back::after\s*\{\s*content:\s*''/s)
        expect(css).toMatch(/\.pk-actions\.is-waiting:not\(\.is-showdown\)\s*\{[\s\S]*max-height:\s*none/s)
        expect(css).toMatch(/\.pk-winners\s*\{[\s\S]*grid-column:\s*1 \/ -1/s)
        expect(css).toMatch(/\.pk-table-status\s*\{[^}]*display:\s*flex/s)
        expect(css).toMatch(/\.pk-table-status > div\s*\{[^}]*flex-direction:\s*column/s)
        expect(css).toMatch(/\.pk-action-status\s*\{[^}]*flex-direction:\s*column/s)
        expect(css).toMatch(/\.poker-buyin\s*\{[^}]*width:\s*100%/s)
        expect(css).toMatch(/\.poker-buyin:hover:not\(:disabled\)\s*\{[^}]*filter:\s*brightness/s)
        expect(css).toMatch(/\.poker-buyin-options button\.active:disabled\s*\{[^}]*background:\s*var\(--pk-accent-soft\)/s)
        expect(css).toMatch(/\.poker-page:has\(\.poker-lobby\)\s*\{[^}]*display:\s*flex/s)
        expect(css).toMatch(/\.pk-seat\.seat-0\s*\{[^}]*top:\s*86%/s)
        expect(css).toMatch(/@media \(min-width: 769px\) and \(max-width: 1200px\)[\s\S]*\.pk-seat:not\(\.is-human\) \.pk-style\s*\{[^}]*display:\s*none/s)
        expect(css).toMatch(/@media \(min-width: 769px\) and \(max-width: 1200px\)[\s\S]*\.pk-seat\.seat-1,[\s\S]*\.pk-seat\.seat-2\s*\{[^}]*left:\s*15%/s)
        expect(constrainedDesktopCss).toMatch(/\.pk-seat\s*\{[^}]*gap:\s*2px/s)
        expect(constrainedDesktopCss).toMatch(/\.pk-seat \.pk-avatar\s*\{[^}]*width:\s*28px[^}]*height:\s*28px/s)
        expect(constrainedDesktopCss).toMatch(/\.pk-seat \.pk-seat-info\s*\{[^}]*min-width:\s*72px/s)
        expect(constrainedDesktopCss).toMatch(/\.poker-page \.pk-seat:not\(\.is-human\) \.pk-seat-cards \.pk-card\s*\{[^}]*width:\s*24px/s)
        expect(constrainedDesktopCss).toMatch(/\.pk-seat\.seat-4,[\s\S]*\.pk-seat\.seat-5\s*\{[^}]*left:\s*85%/s)
    })

    it('preserves the bot preload chain without restoring player advice', () => {
        expect(source).toContain("import { preloadGto } from '../../../poker/gto/loader'")
        expect(source).toContain('preloadGto().then(([, postflop]) => {')
        expect(source).toContain('setPostflopChart(postflop)')
        expect(source).toContain('postflopChart,')
        expect(loader).toContain('export function preloadGto()')
    })

    it('tops up a low poker balance by exactly the minimum-buy-in shortfall', () => {
        expect(source).toContain('grantPracticeCredits(BUY_INS[0] - balance)')
        expect(source).toContain('formatCredits(BUY_INS[0] - balance)')
        expect(source).not.toContain('grantPracticeCredits(BUY_INS[0])')
    })

    it('keeps poker hand history mounted while its native panel is hidden', () => {
        expect(source).toContain('data-poker-mobile-panel="history" hidden={tab !== \'history\'}')
        expect(source).toContain('<HandHistoryTab liveState={state} />')
        expect(source).not.toContain("{tab === 'history' && (")
    })

    it('keeps the mobile header balance readable and its drawer viewport-contained', () => {
        expect(mobileHeaderCss).toMatch(/\.header\s*\{[^}]*overflow:\s*visible/s)
        expect(mobileHeaderCss).toMatch(/\.credit-balance-amount\s*\{[^}]*white-space:\s*nowrap/s)
        expect(mobileHeaderCss).not.toMatch(/\.credit-balance-amount\s*\{[^}]*max-width:\s*64px/s)
        expect(mobileHeaderCss).toMatch(/\.credit-dropdown\s*\{[^}]*width:\s*min\(320px, calc\(100vw - 20px\)\)[^}]*max-height:\s*calc\(100dvh - 72px\)[^}]*overflow-y:\s*auto/s)
        expect(globalCss).toMatch(/\.credit-dropdown\s*\{[^}]*border-radius:\s*12px[^}]*overflow:\s*hidden/s)
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
