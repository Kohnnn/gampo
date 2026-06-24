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

    it('defines responsive --case-tile-px with 92px on mobile and 118px fallback', () => {
        expect(css).toMatch(/@media\s*\(\s*max-width:\s*768px\s*\)[\s\S]*?--case-tile-px:\s*92px/s)
        expect(css).toContain('width: var(--case-tile-px, 118px)')
        expect(css).toContain('flex: 0 0 var(--case-tile-px, 118px)')
    })

    it('defines the x10 mini-grid layout and keeps case stats readable', () => {
        expect(css).toContain('.cases-multi-open-grid')
        expect(css).toMatch(/\.cases-multi-open-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax/s)
        expect(css).toContain('.cases-mini-reel-frame')
        expect(css).toContain('.cases-carousel-tile.is-mini img')
        expect(css).toContain('.cases-right-panel')
        expect(css).toMatch(/\.game-shell:has\(\.cases-stage-frame\) \.gs-layout\s*\{[^}]*minmax\(300px,\s*340px\)/s)
        expect(css).toMatch(/@media \(max-width: 768px\)[\s\S]*\.game-shell:has\(\.cases-stage-frame\) \.gs-aside\s*\{[^}]*order:\s*1/s)
        expect(css).toContain('.cases-inventory-grid')
    })

    it('C2: defines the overshoot settle-back transition on the reel track', () => {
        expect(css).toMatch(/\.cases-carousel-track\.is-settling\s*\{[^}]*transition:\s*transform\s*360ms/s)
    })

    it('C4: desaturates the reel during spin/slowdown and flashes the target on land', () => {
        expect(css).toMatch(/case-phase-slowdown .cases-carousel-tile[\s\S]*saturate\(/s)
        expect(css).toContain('@keyframes caseRarityFlash')
        // Reduced-motion clears the pre-reveal desaturation filter.
        expect(css).toMatch(/gampo-reduce-motion[\s\S]*case-phase-reveal .cases-carousel-tile[\s\S]*filter:\s*none/s)
    })

    it('C3: near-miss heartbeat pulses pointer/frame (not filter) on slowdown only', () => {
        expect(css).toContain('@keyframes caseNearMissPulse')
        expect(css).toContain('@keyframes caseNearMissGlow')
        // Scoped to the slowdown phase + near-miss class so it can never linger.
        expect(css).toMatch(/\.case-near-miss\.case-phase-slowdown .cases-carousel-pointer/s)
        // Heartbeat must NOT use the `filter` channel (that is C4's anti-leak mask).
        expect(css).not.toMatch(/@keyframes caseNearMissPulse\s*\{[^}]*filter:/s)
        // Reduced-motion kills the visual heartbeat.
        expect(css).toMatch(/gampo-reduce-motion[\s\S]*case-near-miss[\s\S]*animation:\s*none/s)
    })

    it('C5: removes the multi-open scroll cage and defines the finale pulse', () => {
        // The 320px scroll cage on .cases-rows is gone (no max-height clamp).
        expect(css).not.toMatch(/\.cases-rows\s*\{[^}]*max-height:\s*320px/s)
        expect(css).not.toMatch(/\.cases-stage\.has-result \.cases-rows\s*\{[^}]*max-height/s)
        // Staggered settle + best-drop finale animations exist.
        expect(css).toContain('@keyframes caseRowSettle')
        expect(css).toContain('@keyframes caseFinalePulse')
        expect(css).toMatch(/\.cases-multi-slot\.is-finale\s*\{/s)
        // Reduced-motion disables both.
        expect(css).toMatch(/gampo-reduce-motion[\s\S]*cases-multi-slot\.is-finale[\s\S]*animation:\s*none/s)
    })
})
