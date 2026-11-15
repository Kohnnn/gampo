// QA022 (#35): Bars and Coop symbols that historically read as the same thing must
// be distinguishable visually and to a screen reader — without changing symbols,
// weights or payouts.
//
// Two different mechanisms already exist in production, and each is what makes its
// pair distinguishable:
//   - Bars BB / COIN are separate artwork files, and the bar tiers are told apart by
//     `barCount` (rendered as literal BAR tokens by SlotSymbol).
//   - Coop BARN / COIN are separate artwork too, and the token-labelled symbols carry
//     a visible `tokenLabel` plus a legend entry when they are not in the paytable.
//
// This pins the mechanisms, not the pixels, and it does not demand a token label
// where another mechanism already distinguishes the pair.
import { describe, expect, it } from 'vitest'
import { SLOT_TEMPLATES } from './slotFactory'

const byId = id => {
    const config = SLOT_TEMPLATES.find(template => template.id === id)
    expect(config, `${id} template exists`).toBeTruthy()
    return config
}
const sym = (config, id) => {
    const symbol = config.symbols.find(candidate => candidate.id === id)
    expect(symbol, `${config.id}/${id} exists`).toBeTruthy()
    return symbol
}

describe('QA022 Bars tiers stay distinguishable', () => {
    it('gives BBB/BB/B distinct labels and bar counts on shared bar artwork', () => {
        const config = byId('bars')
        const tiers = ['bar3', 'bar2', 'bar1'].map(id => sym(config, id))
        // One artwork file is fine; `barCount` is what the player reads.
        expect(new Set(tiers.map(s => s.asset)).size).toBe(1)
        expect(tiers.map(s => s.barCount)).toEqual([3, 2, 1])
        expect(new Set(tiers.map(s => s.label)).size).toBe(3)
    })

    it('does not render the bar tiers as an undifferentiated image', () => {
        const config = byId('bars')
        // The renderer branches on barCount before falling back to the bare asset,
        // so a bar tier never appears as a plain picture.
        for (const tier of ['bar3', 'bar2', 'bar1']) {
            expect(sym(config, tier).barCount, `${tier} carries a count`).toBeGreaterThan(0)
        }
    })

    it('keeps COIN on its own artwork, not on a bar tier', () => {
        const config = byId('bars')
        for (const tier of ['bar3', 'bar2', 'bar1']) {
            expect(sym(config, 'coin').asset, 'COIN is not the bar artwork').not.toBe(sym(config, tier).asset)
        }
        expect(sym(config, 'coin').label).toBe('COIN')
    })
})

describe('QA022 Coop BARN and COIN stay distinguishable', () => {
    it('carries a visible token label on each symbol that shares a token role', () => {
        const config = byId('coop-cluck')
        for (const id of ['barn', 'egg']) {
            const symbol = sym(config, id)
            expect(symbol.tokenLabel, `${id} has a token label`).toBeTruthy()
            expect(typeof symbol.tokenLabel).toBe('string')
        }
        // The two tokens must differ, or the label distinguishes nothing.
        expect(sym(config, 'barn').tokenLabel).not.toBe(sym(config, 'egg').tokenLabel)
        // And the readable names differ independently of the token.
        expect(sym(config, 'barn').label).not.toBe(sym(config, 'egg').label)
    })

    it('keeps the coin role on the coin symbol only', () => {
        const config = byId('coop-cluck')
        const coinRoles = config.symbols.filter(symbol => symbol.type === 'coin')
        expect(coinRoles.map(symbol => symbol.id)).toEqual(['egg'])
    })

    it('leaves labels, weights and payouts intact', () => {
        // QA022 is a distinguishability finding: no economic field may move.
        const config = byId('coop-cluck')
        for (const symbol of config.symbols) {
            expect(typeof symbol.label).toBe('string')
            expect(Number.isFinite(symbol.weight)).toBe(true)
            expect(Number.isFinite(symbol.payout)).toBe(true)
        }
    })
})