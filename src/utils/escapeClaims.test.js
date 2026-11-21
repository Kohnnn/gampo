// Contract tests for the Escape-claim registry.
//
// The registry decides which single layer owns the Escape key when a mobile
// drawer and one or more game overlays are open. Five layers depend on it
// (shortcuts panel, slots bet sheet, slots paytable, BetPanel mobile sheet,
// poker exit guard, volume mixer), and a leaked handler would permanently stop
// the drawer from responding to Escape. These tests pin the release contract
// and the routing rule that make that safe, including the interleavings a React
// effect can actually produce.
//
// This is a contract test for the registry itself. It does not prove any
// component registers correctly; the browser probe
// `scripts/verifyOverlayStack.mjs` covers the real co-existence behaviour.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { claimEscape, dispatchEscape, overlayOwnsEscape, resetEscapeClaims } from './escapeClaims'

const fakeEvent = () => ({ key: 'Escape' })

describe('escapeClaims', () => {
    afterEach(() => {
        resetEscapeClaims()
    })

    it('reports no owner while nothing is registered', () => {
        expect(overlayOwnsEscape()).toBe(false)
    })

    it('reports an owner while a handler is registered, and clears on release', () => {
        const release = claimEscape(() => true)
        expect(overlayOwnsEscape()).toBe(true)
        release()
        expect(overlayOwnsEscape()).toBe(false)
    })

    it('routes the key to the most recently registered handler', () => {
        const first = vi.fn(() => true)
        const second = vi.fn(() => true)
        claimEscape(first)
        claimEscape(second)
        expect(dispatchEscape(fakeEvent())).toBe(true)
        expect(second).toHaveBeenCalledTimes(1)
        expect(first).not.toHaveBeenCalled()
    })

    it('yields to the next handler when the topmost declines', () => {
        // A layer that is open but does not handle Escape must not trap the key.
        const declines = vi.fn(() => false)
        const acts = vi.fn(() => true)
        claimEscape(acts)
        claimEscape(declines)
        expect(dispatchEscape(fakeEvent())).toBe(true)
        expect(declines).toHaveBeenCalledTimes(1)
        expect(acts).toHaveBeenCalledTimes(1)
    })

    it('reports that nobody acted when every handler declines', () => {
        claimEscape(() => false)
        claimEscape(() => false)
        expect(dispatchEscape(fakeEvent())).toBe(false)
    })

    it('tolerates a release running twice', () => {
        // React StrictMode invokes effect cleanup twice in development.
        const release = claimEscape(() => true)
        release()
        release()
        expect(overlayOwnsEscape()).toBe(false)
    })

    it('keeps a live claim when a stale token is released again', () => {
        const release = claimEscape(() => true)
        release()
        const live = claimEscape(() => true)
        release()
        expect(overlayOwnsEscape()).toBe(true)
        live()
        expect(overlayOwnsEscape()).toBe(false)
    })

    it('keeps the newer handler active when the older one is released', () => {
        const older = vi.fn(() => true)
        const newer = vi.fn(() => true)
        const releaseOlder = claimEscape(older)
        claimEscape(newer)
        releaseOlder()
        dispatchEscape(fakeEvent())
        expect(newer).toHaveBeenCalledTimes(1)
        expect(older).not.toHaveBeenCalled()
    })

    it('routes to the surviving handler after an interleaved open/close', () => {
        const first = vi.fn(() => true)
        const second = vi.fn(() => true)
        claimEscape(first)
        const releaseSecond = claimEscape(second)
        releaseSecond()
        dispatchEscape(fakeEvent())
        expect(first).toHaveBeenCalledTimes(1)
        expect(second).not.toHaveBeenCalled()
    })

    it('clears regardless of release order across many handlers', () => {
        const forward = Array.from({ length: 25 }, () => claimEscape(() => true))
        expect(overlayOwnsEscape()).toBe(true)
        forward.forEach(release => release())
        expect(overlayOwnsEscape()).toBe(false)

        const reverse = Array.from({ length: 25 }, () => claimEscape(() => true))
        ;[...reverse].reverse().forEach(release => release())
        expect(overlayOwnsEscape()).toBe(false)
    })

    it('calls each registered handler at most once per dispatch', () => {
        const a = vi.fn(() => true)
        const b = vi.fn(() => true)
        claimEscape(a)
        claimEscape(b)
        dispatchEscape(fakeEvent())
        dispatchEscape(fakeEvent())
        expect(a.mock.calls.length + b.mock.calls.length).toBe(2)
    })
})
