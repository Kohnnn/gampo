import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isGamePath } from './MobileBottomNav'
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

    it('reserves mobile safe space without changing desktop layout', () => {
        expect(css).toContain('--mobile-nav-height: 64px')
        expect(css).toContain('--mobile-action-height: 74px')
        expect(css).toContain('.mobile-bottom-nav')
        expect(css).toContain('grid-template-columns: repeat(5, minmax(0, 1fr))')
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
