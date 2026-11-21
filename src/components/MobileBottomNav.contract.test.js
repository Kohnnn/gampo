import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isGamePath, navItems } from './MobileBottomNav'
import { gameDefinitions } from '../data/gameDefinitions'
import { SLOT_TEMPLATE_ROUTES } from '../data/slotRoutes'

const source = readFileSync(new URL('./MobileBottomNav.jsx', import.meta.url), 'utf8')
const layoutSource = readFileSync(new URL('./Layout.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../styles/index.css', import.meta.url), 'utf8')

describe('Mobile bottom navigation contract', () => {
    it('mounts the global mobile nav with the required destinations and Chat action', () => {
        expect(layoutSource).toContain('<MobileBottomNav />')
        expect(source).toContain('data-mobile-bottom-nav')
        expect(source).toContain("path: '/sportsbook'")
        expect(source).toContain("path: '/originals'")
        expect(source).toContain("path: '/learn'")
        expect(source).toContain("gampo:open-chat")
    })

    it('highlights exactly one destination per route, with no lying active state', () => {
        // Regression: `/missions`, `/vip` and `/sandbox` used to light up the
        // "Learn" tab (which points at `/learn`) because its match predicate
        // over-claimed those prefixes. A truthful nav highlights the tab whose
        // own destination the user is actually on.
        const activeFor = pathname =>
            navItems.filter(item => item.match(pathname)).map(item => item.id)

        for (const pathname of ['/missions', '/vip', '/sandbox']) {
            const active = activeFor(pathname)
            expect(active).toEqual(['missions'])
            // and the highlighted tab must point at the route the user is on
            const tab = navItems.find(item => item.id === active[0])
            if (pathname === '/missions') expect(tab.path).toBe('/missions')
        }
        for (const pathname of ['/learn', '/learn/any-topic', '/originals', '/crash', '/dice', '/sportsbook/event/1', '/']) {
            expect(activeFor(pathname)).toHaveLength(1)
        }
    })

    it('should mark Games current only for the exact canonical game route set', () => {
        for (const path of ['/originals', '/slots-lobby', '/collections', ...gameDefinitions.map(({ path }) => path), ...SLOT_TEMPLATE_ROUTES.map(({ path }) => path)]) {
            expect(isGamePath(path)).toBe(true)
        }
        for (const path of ['/settings', '/insights', '/missions', '/sportsbook', '/sports', '/sicbo/details', '/scarab']) {
            expect(isGamePath(path)).toBe(false)
        }
        expect(source).toContain("path: '/originals'")
        expect(source).toContain('GAME_PATHS.has(pathname)')
    })
})
