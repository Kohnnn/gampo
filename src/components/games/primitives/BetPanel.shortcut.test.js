// QA028 (#30): the shared bet-panel shortcut must never start or change a paid
// action from a key the player did not deliberately press at the page. The guard
// was previously inline in the effect; it is extracted so each refusal can be
// pinned without mounting a DOM (the suite runs under `environment: 'node'`).
import { describe, expect, it } from 'vitest'
import { shouldHandleShortcut } from './BetPanel'

const key = (overrides = {}) => ({ key: ' ', target: { tagName: 'DIV' }, ...overrides })

describe('BetPanel shortcut guard', () => {
    it('accepts a plain, unheld Space on the page body', () => {
        expect(shouldHandleShortcut(key())).toBe(true)
    })

    it('rejects keyboard auto-repeat so a held key cannot fire a second paid round', () => {
        expect(shouldHandleShortcut(key({ repeat: true }))).toBe(false)
    })

    it('rejects shortcuts carrying a modifier', () => {
        for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
            expect(shouldHandleShortcut(key({ [modifier]: true }))).toBe(false)
        }
    })

    it('rejects a keystroke owned by a focused interactive control', () => {
        for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A']) {
            expect(shouldHandleShortcut(key({ target: { tagName } }))).toBe(false)
        }
        expect(shouldHandleShortcut(key({ target: { tagName: 'DIV', isContentEditable: true } }))).toBe(false)
    })

    it('rejects a keystroke while a dialog is open', () => {
        expect(shouldHandleShortcut(key(), { dialogOpen: true })).toBe(false)
    })
})
