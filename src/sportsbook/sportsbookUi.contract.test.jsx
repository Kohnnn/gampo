import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const shell = source('./SportsbookShell.jsx')
const home = source('./components/SportsHome.jsx')
const row = source('./components/EventRow.jsx')
const detail = source('./components/EventDetail.jsx')
const odds = source('./components/OddsButton.jsx')
const slip = source('./components/BetSlip.jsx')
const bets = source('./components/MyBetsPanel.jsx')
const search = source('./components/SearchOverlay.jsx')
const coach = source('./components/OddsCoach.jsx')
const mobileNav = source('./components/MobileSportsNav.jsx')
const css = source('../styles/sportsbook.css')

describe('truthful sportsbook UI source contract', () => {
    it('retires fabricated, promotional, inferred, and inert surfaces', () => {
        expect(home).not.toMatch(/PROMO_CARDS|OUTRIGHTS|MatchdaySpotlight|SportsbookEnergy|SpendGuard|popularity/)
        expect(detail).not.toMatch(/Tickets|Attack|Possession|Advanced Stats|Display|const tabs/)
        expect(row).not.toMatch(/extraMarkets \* 12|<Tv|<BarChart3/)
        expect(slip).not.toContain('Collapse bet slip')
        expect(slip).not.toContain('Same-game multi')
        expect(slip).not.toContain('EV Hint')
        expect(shell).not.toContain('API quota')
    })

    it('renders named feed, restore, ticket, cash-out, and offer presentation', () => {
        expect(shell).toContain('deriveSportsbookShellState')
        expect(shell).toContain('presentFeedCondition')
        expect(shell).toContain('presentRestoreResult')
        expect(shell).toContain('role="status"')
        expect(shell).toContain('role="alert"')
        expect(odds).toContain('presentOffer')
        expect(odds).toContain('aria-describedby')
        expect(odds).toContain('aria-pressed')
        expect(odds).toContain('Model estimate')
        expect(slip).toContain('presentCashout')
        expect(bets).toContain('presentTicketLifecycle')
        expect(bets.match(/cashoutValuationsByTicketId=\{cashoutValuationsByTicketId\}/g)).toHaveLength(2)
        expect(`${slip}\n${bets}`).toContain('fake-credit')
    })

    it('uses native dialogs with visible headings and opener restoration', () => {
        for (const dialogSource of [search, coach]) {
            expect(dialogSource).toMatch(/<dialog/)
            expect(dialogSource).toContain('showModal()')
            expect(dialogSource).toContain('.close()')
            expect(dialogSource).toContain('aria-labelledby')
        }
        expect(shell).toMatch(/<dialog[^>]*className="sb-mobile-slip"/)
        expect(shell).toContain('showModal()')
        expect(shell).toContain('.close()')
        expect(shell).toMatch(/querySelector\('\[aria-label="Close bet slip"\]'\)\?\.focus\(\)/)
        expect(shell).toContain('Practice ticket lifecycle updated.')
        expect(shell).toContain('Practice ticket accepted. ${formatCredits(stake)} fake-credit stake committed.')
        expect(shell).toContain('aria-describedby={feedPending ? \'sportsbook-feed-status-copy\' : undefined}')
        expect(slip).toContain('aria-describedby={selections.length === 0 ? \'slip-empty-reason\' : undefined}')
        for (const ticketSource of [slip, bets]) {
            expect(ticketSource).toContain('Simulated cash-out unavailable')
            expect(ticketSource).toContain('aria-describedby={cashoutReasonId}')
            expect(ticketSource).toContain('disabled')
        }
        expect(slip).toContain("aria-describedby={!validation.valid ? (selections.length === 0 ? 'slip-empty-reason' : 'slip-validation-reason') : undefined}")
        expect(mobileNav).not.toMatch(/if \(!selectionCount\) return null/)
        expect(mobileNav).toContain('data-ux-primary-action')
    })
})

describe('responsive and accessible sportsbook CSS contract', () => {
    it('locks closed desktop, tablet, and phone breakpoints', () => {
        expect(css).toContain('@media (min-width: 1200px)')
        expect(css).toContain('@media (min-width: 768px) and (max-width: 1199px)')
        expect(css).toContain('@media (max-width: 767px)')
        expect(css).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\) 360px/)
        expect(css).toMatch(/\.sb-event-main\s*\{[^}]*grid-template-columns:\s*78px minmax\(0, 1fr\) minmax\(0, 112px\)/)
        expect(css).toMatch(/\.sb-event-score\s*\{[^}]*overflow:\s*hidden/)
        expect(css).toMatch(/\.sb-ticket-card header > div\s*\{[^}]*display:\s*grid[^}]*gap:\s*2px/)
    })

    it('locks focus, target, input, modal-scroll, and reduced-motion behavior', () => {
        expect(css).toMatch(/\.sb-page[^}]*:focus-visible[\s\S]*?outline:\s*(?:solid\s+)?(?:2px|3px)/)
        expect(css).toContain('min-height: 44px')
        expect(css).toContain('min-width: 44px')
        expect(css).toMatch(/(?:input|select)[^}]*font-size:\s*16px/)
        expect(css).toContain('90dvh')
        expect(css).toContain('overscroll-behavior: contain')
        expect(css).toContain('@media (prefers-reduced-motion: reduce)')
        expect(css).toMatch(/\.sb-market-caption\s*\{[^}]*color:\s*var\(--sb-muted\)/)
        expect(css).toMatch(/\.sb-team-logo\s*\{[^}]*color:\s*var\(--sb-muted\)/)
        expect(css).not.toContain('backdrop-filter')
    })

    it('keeps every phone section control fully visible and hittable', () => {
        const phone = css.slice(css.indexOf('@media (max-width: 767px)'), css.indexOf('@media (max-width: 1199px)'))
        expect(phone).toMatch(/\.sb-subnav\s*\{[^}]*width:\s*100%[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/)
        expect(phone).toMatch(/\.sb-subnav button\s*\{[^}]*min-width:\s*0[^}]*white-space:\s*normal/)
    })
})
