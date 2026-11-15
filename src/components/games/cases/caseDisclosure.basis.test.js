// QA036 (#31): a Cases disclosure must distinguish the base item price from the
// final weighted payout, and must say so when a figure is unavailable rather than
// presenting it on an incompatible basis.
//
// Historical hosted observation: a price, base item EV, RTP and per-play EV were
// shown on incompatible bases. The production model is `caseDisclosure`; this file
// pins the remaining edges: fallback item prices, the per-row basis of a bulk open,
// and what the disclosure must refuse to quote.
import { describe, expect, it } from 'vitest'
import { caseDisclosure } from './caseDisclosure'
import { normalizeCaseForRuntime } from './caseEconomy'

describe('QA036 Cases disclosure basis', () => {
    it('falls back through value, multiplier, then 1 for an unpriced item', () => {
        // `baseEv` must never silently become NaN or 0 for a real item.
        const byValue = caseDisclosure({ items: [{ valueGc: 2 }], openPriceGc: 3 })
        const byMultiplier = caseDisclosure({ items: [{ multiplier: 2 }], openPriceGc: 3 })
        const bare = caseDisclosure({ items: [{}], openPriceGc: 3 })
        for (const [label, disclosure] of [['value', byValue], ['multiplier', byMultiplier], ['bare', bare]]) {
            expect(Number.isFinite(disclosure.baseEv), `${label}: base EV is finite`).toBe(true)
            expect(disclosure.baseEv, `${label}: base EV is a real price`).toBeGreaterThan(0)
        }
    })

    it('scales gross and net EV by rows while keeping RTP a per-open ratio', () => {
        const data = normalizeCaseForRuntime({ items: [{ id: 'a', valueGc: 3.4 }] })
        const one = caseDisclosure(data, 1)
        for (const rows of [3, 5, 10]) {
            const many = caseDisclosure(data, rows)
            expect(many.grossEv).toBeCloseTo(one.grossEv * rows, 12)
            expect(many.netEv).toBeCloseTo(one.netEv * rows, 12)
            // RTP is the ratio the player experiences per GC staked, so it does not scale.
            expect(many.rtp).toBeCloseTo(one.rtp, 12)
        }
    })

    it('reports win chance for a single open and marks it unavailable for bulk', () => {
        const data = normalizeCaseForRuntime({ items: [{ id: 'a', valueGc: 3.4 }] })
        const one = caseDisclosure(data, 1)
        expect(Number.isFinite(one.winChance)).toBe(true)
        expect(one.winChance).toBeGreaterThan(0)
        expect(one.winChance).toBeLessThanOrEqual(1)
        // A bulk open can win on any row, so a single-row chance would be a
        // different basis. The disclosure must omit it, not reuse the 1-row figure.
        for (const rows of [3, 5, 10]) {
            expect(caseDisclosure(data, rows).winChance).toBeUndefined()
        }
    })

    it('refuses to quote when the price or distribution is unusable', () => {
        // No distribution, no price, a non-positive price, or an unsupported row
        // count must all yield no disclosure rather than a misleading one.
        expect(caseDisclosure(null)).toBeNull()
        expect(caseDisclosure({ items: [] , openPriceGc: 1 })).toBeNull()
        expect(caseDisclosure({ items: [{ valueGc: 1 }] })).toBeNull()
        expect(caseDisclosure({ items: [{ valueGc: 1 }], openPriceGc: 0 })).toBeNull()
        expect(caseDisclosure({ items: [{ valueGc: 1 }], openPriceGc: -5 })).toBeNull()
        expect(caseDisclosure({ items: [{ valueGc: 1 }], openPriceGc: 1 }, 2)).toBeNull()
    })

    it('keeps base EV and final gross EV on distinct, explicable bases', () => {
        // Base EV is the item's nominal price; gross EV adds wear, StatTrak/souvenir
        // and rounding. They must not be presented as the same number.
        const data = normalizeCaseForRuntime({ items: [{ id: 'a', valueGc: 3.4 }] })
        const disclosure = caseDisclosure(data)
        expect(disclosure.baseEv).not.toBe(disclosure.grossEv)
        // Net EV is exactly gross minus the stake, the only honest bridge between them.
        expect(disclosure.netEv).toBeCloseTo(disclosure.grossEv - data.openPriceGc, 12)
        expect(disclosure.rtp).toBeCloseTo(disclosure.grossEv / data.openPriceGc, 12)
    })
})