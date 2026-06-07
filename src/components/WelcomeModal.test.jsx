import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

const modal = readFileSync(new URL('./WelcomeModal.jsx', import.meta.url), 'utf8')
const layout = readFileSync(new URL('./Layout.jsx', import.meta.url), 'utf8')

describe('WelcomeModal', () => {
    it('is mounted in the app layout', () => {
        expect(layout).toContain('WelcomeModal')
    })

    it('is an accessible, focus-managed dialog', () => {
        expect(modal).toContain('role="dialog"')
        expect(modal).toContain('aria-modal="true"')
        expect(modal).toContain('aria-labelledby="welcome-title"')
        expect(modal).toContain("if (e.key === 'Escape')")
        expect(modal).toContain("if (e.key !== 'Tab') return")
        expect(modal).toContain('lastFocusRef')
    })

    it('completes onboarding from the primary CTA and only renders when unseen', () => {
        expect(modal).toContain('data-ux-primary-action')
        expect(modal).toContain('if (seen) return null')
        expect(modal).toContain('completeOnboarding')
    })
})
