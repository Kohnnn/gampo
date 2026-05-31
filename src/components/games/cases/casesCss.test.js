import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./cases.css', import.meta.url), 'utf8')

describe('cases CSS polish', () => {
    it('keeps locked collection images true grayscale', () => {
        expect(css).toMatch(/\.cases-skin-card\.cases-skin-locked img\s*\{[^}]*grayscale\(1\)/s)
    })

    it('keeps the case reel deceleration paced for a full reveal', () => {
        expect(css).toContain('--case-spin-ms')
        expect(css).toContain('transition: transform var(--case-spin-ms, 5200ms) cubic-bezier')
        expect(css).toContain('animation: casePrizeZoom 760ms')
    })
})
