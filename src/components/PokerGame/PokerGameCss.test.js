import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./PokerGame.css', import.meta.url), 'utf8')

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
})
