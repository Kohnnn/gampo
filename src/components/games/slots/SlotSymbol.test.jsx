import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import SlotSymbol from './SlotSymbol'
import { getSlotTemplate } from './slotFactory'

describe('slot identity tokens', () => {
    it('renders distinct native one-, two- and three-bar symbols in every shared symbol surface', () => {
        const symbols = getSlotTemplate('bars').symbols
        for (const [id, count] of [['bar1', 1], ['bar2', 2], ['bar3', 3]]) {
            const html = renderToStaticMarkup(<SlotSymbol symbol={symbols.find(symbol => symbol.id === id)} />)
            expect(html.match(/>BAR<\/span>/g)).toHaveLength(count)
            expect(html).toContain(`aria-label="${count} BAR`)
            expect(html).not.toContain('<img')
        }
    })

    it('keeps final themed coop art aliases visibly identified', () => {
        const symbols = getSlotTemplate('coop-cluck').symbols
        const barn = symbols.find(symbol => symbol.id === 'barn')
        const coin = symbols.find(symbol => symbol.id === 'egg')
        expect(barn.asset).toBe(coin.asset)
        for (const [id, label] of [['egg-pay', 'EGG+'], ['barn', 'BARN'], ['egg', 'COIN']]) {
            const html = renderToStaticMarkup(<SlotSymbol symbol={symbols.find(symbol => symbol.id === id)} />)
            expect(html).toContain(`>${label}<`)
        }
    })
})
