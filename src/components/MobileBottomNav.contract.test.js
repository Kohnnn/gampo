import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

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
})
