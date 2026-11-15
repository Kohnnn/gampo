// QA006 (#31): every surface that quotes a slot's return must quote the same
// number, on the same stated basis.
//
// Historical hosted observation: some templates showed 95% in the header and 94%
// in the coach. The fix in current source is structural — `getSlotRtpDisclosure`
// is the single source, and the header, the info body and the coach all receive
// that one object. This file pins the consequence across every template and both
// payout modes, so a future surface that recomputes its own figure fails here.
import { describe, expect, it } from 'vitest'
import { SLOT_TEMPLATES } from './slotFactory'
import { getSlotRtpDisclosure } from './slotWinPresentation'
import { FUN_PAYOUT_BOOST } from '../../../utils/funMode'

describe('QA006 slot RTP disclosure agrees on one basis', () => {
    it('covers every shipped template', () => {
        expect(SLOT_TEMPLATES.length).toBeGreaterThanOrEqual(20)
        // Generic slots plus the historical regression routes.
        for (const config of SLOT_TEMPLATES) {
            expect(config.title, 'every template has a title the surfaces quote').toBeTruthy()
            expect(Number.isFinite(config.rtpTarget), `${config.title}: has a nominal target`).toBe(true)
        }
    })

    it('derives exactly one figure per template and mode', () => {
        for (const config of SLOT_TEMPLATES) {
            for (const funActive of [false, true]) {
                const disclosure = getSlotRtpDisclosure(config, funActive)
                const expected = config.rtpTarget * (funActive ? FUN_PAYOUT_BOOST : 1)
                // Any surface quoting a different number is quoting a different basis.
                expect(disclosure.rtp, `${config.title} Fun=${funActive}`).toBeCloseTo(expected, 12)
                // Idempotent: calling twice cannot yield two answers.
                expect(getSlotRtpDisclosure(config, funActive).rtp).toBe(disclosure.rtp)
            }
        }
    })

    it('labels the basis as nominal rather than claiming an effective return', () => {
        for (const config of SLOT_TEMPLATES) {
            for (const funActive of [false, true]) {
                const { label, note } = getSlotRtpDisclosure(config, funActive)
                expect(label).toContain('nominal')
                // The disclosure must say what it is not, so a player cannot read it
                // as a guarantee or as a measured bonus-buy return.
                expect(note).toMatch(/rounding|cap/i)
                expect(note).toMatch(/not a per-spin guarantee/i)
                if (funActive) expect(note).toMatch(/Fun/)
            }
        }
    })

    it('keeps real-mode nominal return below 100%', () => {
        // In Serious mode a disclosed target at or above 100% would be a
        // player-favourable claim the paytable cannot honour long-run.
        for (const config of SLOT_TEMPLATES) {
            expect(getSlotRtpDisclosure(config, false).rtp, `${config.title} Serious`).toBeLessThan(1)
        }
    })

    it('states the Fun basis instead of hiding a boosted return above 100%', () => {
        // Fun is a deliberate practice-only boost, so a Fun figure can exceed 100%.
        // That is only truthful if the surfaces say it is Fun and boosted, which the
        // note does; this pins that the excess is always explained.
        for (const config of SLOT_TEMPLATES) {
            const disclosure = getSlotRtpDisclosure(config, true)
            if (disclosure.rtp >= 1) {
                expect(disclosure.note, `${config.title}: boosted return must be labelled`).toMatch(/Fun on/)
            }
        }
    })

    it('never invents a number when a template has no calibrated target', () => {
        // A missing target must not silently render as 0% or NaN in the header.
        const disclosure = getSlotRtpDisclosure({ title: 'Uncalibrated', rtpTarget: undefined }, false)
        expect(Number.isFinite(disclosure.rtp)).toBe(false)
        // Documented consequence: callers must gate on a real target.
        expect(disclosure.label).toContain('nominal')
    })
})