// Guards the core text-color tokens against WCAG AA contrast regressions.
// Parses the actual values from src/styles/index.css and computes the contrast
// ratio against the app's primary dark background. This catches a future edit
// that darkens a token below the readable threshold without needing a browser.

import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8')

function readToken(name) {
    const m = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))
    return m ? m[1] : null
}

function toRgb(hex) {
    return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
}

function luminance([r, g, b]) {
    const f = (c) => {
        const x = c / 255
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function contrast(a, b) {
    const l1 = luminance(toRgb(a))
    const l2 = luminance(toRgb(b))
    const hi = Math.max(l1, l2)
    const lo = Math.min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)
}

describe('text token contrast (WCAG AA)', () => {
    const bg = readToken('--bg-primary')

    it('defines the core tokens', () => {
        expect(bg).toBeTruthy()
        expect(readToken('--text-primary')).toBeTruthy()
        expect(readToken('--text-secondary')).toBeTruthy()
        expect(readToken('--text-muted')).toBeTruthy()
    })

    it('text-primary clears AA (4.5:1) on the primary background', () => {
        expect(contrast(readToken('--text-primary'), bg)).toBeGreaterThanOrEqual(4.5)
    })

    it('text-secondary clears AA (4.5:1)', () => {
        expect(contrast(readToken('--text-secondary'), bg)).toBeGreaterThanOrEqual(4.5)
    })

    it('text-muted clears AA (4.5:1) — regression guard for the #5f6368 fix', () => {
        expect(contrast(readToken('--text-muted'), bg)).toBeGreaterThanOrEqual(4.5)
    })
})
