import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const indexCss = readFileSync(new URL('./index.css', import.meta.url), 'utf8')
const settingsCss = readFileSync(new URL('./settings.css', import.meta.url), 'utf8')

function readToken(name) {
    const match = indexCss.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))
    return match ? match[1] : null
}

function readRule(css, selector) {
    const match = css.match(new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\}`))
    return match ? match[1] : null
}

function hexToRgb(hex) {
    return [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16))
}

function composite(foreground, background) {
    return foreground.slice(0, 3).map((channel, index) => Math.round(channel * foreground[3] + background[index] * (1 - foreground[3])))
}

function luminance(rgb) {
    const linear = channel => {
        const value = channel / 255
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2])
}

function contrast(foreground, background) {
    const first = luminance(foreground)
    const second = luminance(background)
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

function headerModeContrast() {
    const color = readRule(indexCss, '\\.header-mode').match(/color:\s*(#[0-9a-fA-F]{6})/)[1]
    const background = composite([231, 76, 60, 0.12], hexToRgb(readToken('--bg-secondary')))
    return contrast(hexToRgb(color), background)
}

function settingsModeContrast() {
    const color = readRule(settingsCss, '\\.settings-mode-segment button').match(/color:\s*var\((--[\w-]+)\)/)[1]
    const background = composite([255, 255, 255, 0.04], hexToRgb(readToken('--bg-secondary')))
    return contrast(hexToRgb(readToken(color)), background)
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
        expect(contrast(hexToRgb(readToken('--text-primary')), hexToRgb(bg))).toBeGreaterThanOrEqual(4.5)
    })

    it('text-secondary clears AA (4.5:1)', () => {
        expect(contrast(hexToRgb(readToken('--text-secondary')), hexToRgb(bg))).toBeGreaterThanOrEqual(4.5)
    })

    it('text-muted clears AA (4.5:1)', () => {
        expect(contrast(hexToRgb(readToken('--text-muted')), hexToRgb(bg))).toBeGreaterThanOrEqual(4.5)
    })

    it('keeps the Live label at WCAG AA against its actual translucent pill', () => {
        expect(readRule(indexCss, '\\.header-mode')).toMatch(/color:\s*#[0-9a-fA-F]{6}/)
        expect(headerModeContrast()).toBeGreaterThanOrEqual(4.5)
    })

    it('keeps unselected Story and Serious text at WCAG AA without changing active semantics', () => {
        expect(readRule(settingsCss, '\\.settings-mode-segment button')).toMatch(/color:\s*var\(--text-secondary\)/)
        expect(settingsModeContrast()).toBeGreaterThanOrEqual(4.5)
        expect(readRule(settingsCss, '\\.settings-mode-segment button\\.is-active')).toMatch(/color:\s*#07130a/)
    })
})
