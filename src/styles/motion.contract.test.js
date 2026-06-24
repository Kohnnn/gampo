import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8')

function readToken(name) {
    const match = new RegExp(`${name}:\\s*([^;]+);`).exec(css)
    return match ? match[1].trim() : null
}

function ruleBodies(selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return [...css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g'))].map(match => match[1])
}

function ruleBody(selector) {
    return ruleBodies(selector)[0] ?? ''
}

describe('global motion token contract', () => {
    it('declares reusable page-entry motion tokens from DESIGN.md', () => {
        expect(readToken('--motion-page-enter-duration')).toBe('0.32s')
        expect(readToken('--motion-page-enter-ease')).toBe('cubic-bezier(0.2, 0.8, 0.2, 1)')
    })

    it('uses page-entry tokens for the existing main content animation', () => {
        const animatedBody = ruleBodies('.main-content').find(body => /animation\s*:\s*pageEnter/.test(body)) ?? ''
        expect(animatedBody, '.main-content pageEnter rule not found').not.toBe('')
        expect(animatedBody).toMatch(/animation\s*:\s*pageEnter\s+var\(--motion-page-enter-duration\)\s+var\(--motion-page-enter-ease\)/)
    })

    it('keeps accessibility and player no-animation gates for decorative motion', () => {
        expect(ruleBody('.gampo-reduce-motion .main-content')).toMatch(/animation\s*:\s*none/)
        expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.main-content\s*\{\s*animation\s*:\s*none;?\s*\}/)
        expect(css).toMatch(/\.gampo-no-animations\s+\*[\s\S]*animation-duration\s*:\s*0\.001ms\s*!important/)
        expect(css).toMatch(/\.gampo-no-animations\s+\*[\s\S]*animation-iteration-count\s*:\s*1\s*!important/)
    })
})
