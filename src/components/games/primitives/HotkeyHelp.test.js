// Regression test for the mobile hotkey guard.
//
// `isOpenDialogPresent` asks "is a dialog layer actually on screen?". The mobile
// bet sheet stays MOUNTED while collapsed: `BetPanel.jsx` renders it whenever
// `isMobile`, always with `role="dialog"`, and `primitives.css` collapses it
// with `opacity: 0; pointer-events: none; transform: translateY(...)` — never
// `display: none` or `visibility: hidden`.
//
// When the predicate treated that as an open dialog, every mobile viewport had a
// permanently-open dialog, so BetPanel's global handler returned early and
// S/Space could not stop a paid Auto loop.
//
// The predicate takes an injectable `root`, so this runs with plain stubs and no
// DOM environment (the suite runs under `environment: 'node'`).

import { describe, expect, it } from 'vitest'
import { isOpenDialogPresent } from './HotkeyHelp.jsx'

function style(overrides = {}) {
    return { display: 'block', visibility: 'visible', opacity: '1', pointerEvents: 'auto', ...overrides }
}

function dialog(attrs = {}, computed = {}) {
    return {
        getAttribute: (name) => (name in attrs ? attrs[name] : null),
        ownerDocument: { defaultView: { getComputedStyle: () => style(computed) } },
    }
}

function rootOf(dialogs) {
    return { querySelectorAll: () => dialogs }
}

describe('isOpenDialogPresent', () => {
    it('is false when there is no root', () => {
        expect(isOpenDialogPresent(null)).toBe(false)
    })

    it('is false when no dialog is mounted', () => {
        expect(isOpenDialogPresent(rootOf([]))).toBe(false)
    })

    it('is true for a visible dialog', () => {
        expect(isOpenDialogPresent(rootOf([dialog()]))).toBe(true)
    })

    it('is false for a dialog hidden with display:none', () => {
        expect(isOpenDialogPresent(rootOf([dialog({}, { display: 'none' })]))).toBe(false)
    })

    it('is false for a dialog hidden with visibility:hidden', () => {
        expect(isOpenDialogPresent(rootOf([dialog({}, { visibility: 'hidden' })]))).toBe(false)
    })

    // The regression. This is what the collapsed mobile bet sheet looks like.
    it('is false for a collapsed portaled dialog at opacity 0', () => {
        expect(isOpenDialogPresent(rootOf([dialog({}, { opacity: '0' })]))).toBe(false)
    })

    it('is false for a collapsed dialog that is also pointer-events: none', () => {
        expect(isOpenDialogPresent(rootOf([dialog({}, { opacity: '0', pointerEvents: 'none' })]))).toBe(false)
    })

    it('is false for a dialog explicitly marked aria-hidden', () => {
        expect(isOpenDialogPresent(rootOf([dialog({ 'aria-hidden': 'true' })]))).toBe(false)
    })

    it('is true when one of several dialogs is genuinely open', () => {
        const dialogs = [dialog({}, { opacity: '0' }), dialog()]
        expect(isOpenDialogPresent(rootOf(dialogs))).toBe(true)
    })

    it('matches aria-modal layers as well as role=dialog', () => {
        // querySelectorAll receives both selectors; the stub returns the layer.
        expect(isOpenDialogPresent(rootOf([dialog({ 'aria-modal': 'true' })]))).toBe(true)
    })
})
