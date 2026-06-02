import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const appSource = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8')
const sidebarSource = readFileSync(new URL('./components/Sidebar.jsx', import.meta.url), 'utf8')
const notFoundSource = readFileSync(new URL('./components/NotFoundPage.jsx', import.meta.url), 'utf8')

describe('app route contracts', () => {
    it('keeps sportsbook canonical while preserving legacy sports URLs', () => {
        expect(appSource).toContain('path="sportsbook"')
        expect(appSource).toContain('path="sportsbook/:viewOrSport"')
        expect(appSource).toContain('path="sports"')
        expect(appSource).toContain('path="sports/:viewOrSport"')
        expect(appSource).toContain('legacySportsbookPath(location.pathname)')
        expect(sidebarSource).toContain("path: '/sportsbook'")
        expect(sidebarSource).toContain('sportsbookPathForView({ view: \'sport\'')
    })

    it('registers direct aliases for report-listed moved routes', () => {
        expect(appSource).toContain('path="risk-academy"')
        expect(appSource).toContain('to="/learn"')
        expect(appSource).toContain('path="vip-lab"')
        expect(appSource).toContain('to="/vip"')
        expect(appSource).toContain('path="slot-factory"')
        expect(appSource).toContain('to="/slots"')
        expect(appSource).toContain('path="pnl-stats"')
        expect(appSource).toContain('to="/?dock=stats"')
    })

    it('uses contextual route fallback content and stable selectors', () => {
        expect(notFoundSource).toContain('data-route-fallback')
        expect(notFoundSource).toContain('Sportsbook route not found')
        expect(notFoundSource).toContain('Slot route not found')
        expect(notFoundSource).toContain('Progress route not found')
    })
})
