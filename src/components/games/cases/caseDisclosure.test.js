import { expect, it } from 'vitest'
import { caseDisclosure } from './caseDisclosure'
import { normalizeCaseForRuntime } from './caseEconomy'
import { buildCaseOutcome, STANDARD_WEARS } from './caseOpening'
it('derives priced final EV from every production rounded payout without RNG', () => {
    const data = normalizeCaseForRuntime({ items: [{ id: 'a', valueGc: 3.4 }] })
    let expected = 0
    for (const wear of STANDARD_WEARS) for (const [statTrak, souvenir, probability] of [[true, false, .1], [false, true, .054], [false, false, .846]]) {
        expected += wear.weight / 100 * probability * buildCaseOutcome(data.items[0], { unitPrice: data.openPriceGc, wear, float: .1, statTrak, souvenir }).valueGc
    }
    const one = caseDisclosure(data)
    expect(one.baseEv).toBe(3.4)
    expect(one.grossEv).toBeCloseTo(expected, 12)
    expect(one.netEv).toBeCloseTo(expected - data.openPriceGc, 12)
    expect(one.rtp).toBeCloseTo(expected / data.openPriceGc, 12)
    expect(one.rtp).toBeGreaterThan(1)
    for (const rows of [3, 5, 10]) {
        expect(caseDisclosure(data, rows).grossEv).toBeCloseTo(expected * rows, 12)
        expect(caseDisclosure(data, rows).netEv).toBeCloseTo(one.netEv * rows, 12)
        expect(caseDisclosure(data, rows).winChance).toBeUndefined()
    }
})
it('uses direct displayed prices and refuses absent distributions', () => {
    expect(caseDisclosure({ items: [{ valueGc: 2 }], openPriceGc: 10 }).rtp).toBeLessThan(1)
    expect(caseDisclosure(null)).toBeNull()
    expect(caseDisclosure({ items: [], openPriceGc: 1 })).toBeNull()
})
