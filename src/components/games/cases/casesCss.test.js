import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./cases.css', import.meta.url), 'utf8')

describe('cases CSS polish', () => {
    it('keeps locked collection images true grayscale', () => {
        expect(css).toMatch(/\.cases-skin-card\.cases-skin-locked img\s*\{[^}]*grayscale\(1\)/s)
    })

    it('keeps the case reel deceleration paced for a full reveal', () => {
        expect(css).toContain('--case-spin-ms')
        expect(css).toContain('--case-tile-px')
        expect(css).toContain('--case-tile-gap')
        expect(css).toMatch(/\.cases-carousel-track\s*\{[^}]*left:\s*50%/s)
        expect(css).toContain('transition: transform var(--case-spin-ms, 5200ms) cubic-bezier')
        expect(css).toContain('animation: casePrizeZoom 760ms')
    })

    it('defines the x10 mini-grid layout and keeps case stats readable', () => {
        expect(css).toContain('.cases-multi-open-grid')
        expect(css).toMatch(/\.cases-multi-open-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax/s)
        expect(css).toContain('.cases-mini-reel-frame')
        expect(css).toContain('.cases-carousel-tile.is-mini img')
        expect(css).toMatch(/\.game-shell:has\(\.cases-stage-frame\) \.stats-overlay\s*\{[^}]*grid-template-columns:\s*1fr/s)
        expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*\.game-shell:has\(\.cases-stage-frame\) \.gs-aside\s*\{[^}]*overflow-x:\s*hidden/s)
        expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*\.game-shell:has\(\.cases-stage-frame\) \.so-row\s*\{[^}]*grid-template-columns:\s*1fr/s)
    })
})
