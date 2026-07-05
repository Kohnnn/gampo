import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import StreakGauge from './StreakGauge.jsx'

function makeDrop(index, overrides = {}) {
    const rarities = ['Consumer', 'Industrial', 'Mil-Spec', 'Restricted', 'Classified', 'Covert', 'Contraband']
    const colors = ['#b0c3d9', '#5e98d9', '#4b69ff', '#8847ff', '#d32ce6', '#eb4b4b', '#e4ae39']
    const rarityIndex = overrides.rarityIndex ?? (index % rarities.length)
    return {
        key: `drop-${index}`,
        dropId: `drop-id-${index}`,
        rarity: rarities[rarityIndex] || 'Mil-Spec',
        color: colors[rarityIndex] || '#4b69ff',
        multiplier: 0.6 + (rarityIndex * 0.4),
        valueGc: 1 + rarityIndex,
        ts: Date.now() - (10 - index) * 60_000,
        ...overrides,
    }
}

describe('StreakGauge', () => {
    it('renders nothing when there are no drops', () => {
        const html = renderToStaticMarkup(<StreakGauge drops={[]} />)
        expect(html).toBe('')
    })

    it('reads slot count from matchMedia at mount so responsive layout is correct', () => {
        // Server-side render (no window): falls back to desktop (10 slots).
        const drops = [makeDrop(0)]
        const ssrHtml = renderToStaticMarkup(<StreakGauge drops={drops} />)
        expect(ssrHtml).toContain('data-streak-count="10"')
    })

    it('renders 10 slots by default and pads with empty placeholders', () => {
        const drops = [makeDrop(0), makeDrop(1), makeDrop(2)]
        const html = renderToStaticMarkup(<StreakGauge drops={drops} />)
        expect(html).toContain('aria-label="Last 10 case drops"')
        expect(html).toContain('data-streak-count="10"')
        const slotMatches = html.match(/data-slot-index="/g) || []
        expect(slotMatches).toHaveLength(10)
        const filledMatches = html.match(/is-filled/g) || []
        expect(filledMatches).toHaveLength(3)
        const emptyMatches = html.match(/is-empty/g) || []
        expect(emptyMatches).toHaveLength(7)
    })

    it('emits aria-labels with rarity and multiplier per slot', () => {
        const drops = [
            makeDrop(0, { rarityIndex: 5 }), // Covert
            makeDrop(1, { rarityIndex: 3 }), // Restricted
        ]
        const html = renderToStaticMarkup(<StreakGauge drops={drops} />)
        expect(html).toMatch(/aria-label="Drop 1: Covert/)
        expect(html).toMatch(/aria-label="Drop 2: Restricted/)
        expect(html).toContain('data-slot-rarity="Covert"')
        expect(html).toContain('data-slot-rarity="Restricted"')
    })

    it('uses the drop color as the rarity CSS variable on filled slots', () => {
        const drops = [makeDrop(0, { color: '#eb4b4b' })]
        const html = renderToStaticMarkup(<StreakGauge drops={drops} />)
        expect(html).toContain('--rarity:#eb4b4b')
    })
})