import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import BetPanel from './BetPanel.jsx'


function renderPanel(props = {}) {
    return renderToStaticMarkup(
        <BetPanel
            balance={1000}
            minBet={0.5}
            maxBet={10000}
            initialBet={5}
            onPlay={vi.fn()}
            {...props}
        />,
    )
}

describe('BetPanel ticket quote', () => {
    it('shows the accumulated ticket without replacing the selection amount', () => {
        const html = renderPanel({ initialBet: 5, ticketStake: 30 })
        expect(html).toMatch(/bp-mobile-summary[^>]*><span>Ticket stake<\/span><strong>GC 30\.00<\/strong>/)
        expect(html).toMatch(/type="number"[^>]*value="5"/)
        expect(html).not.toMatch(/class="bp-mobile-play[^"]*" disabled/)
        const changedDenomination = renderPanel({ initialBet: 100, ticketStake: 30 })
        expect(changedDenomination).toMatch(/bp-mobile-summary[^>]*><span>Ticket stake<\/span><strong>GC 30\.00<\/strong>/)
        expect(changedDenomination).toMatch(/type="number"[^>]*value="100"/)
    })

    it('disables a ticket that exceeds balance even when the selection amount is funded', () => {
        const html = renderPanel({ balance: 20, initialBet: 5, ticketStake: 30 })
        expect(html).toMatch(/class="bp-mobile-play[^"]*" disabled=""/)
        expect(html).toMatch(/class="bp-play[^"]*" disabled=""/)
    })

    it('does not enable an empty or invalid ticket', () => {
        for (const ticketStake of [0, -1, NaN, Infinity, '5']) {
            expect(renderPanel({ ticketStake })).toMatch(/class="bp-mobile-play[^"]*" disabled=""/)
        }
        expect(renderPanel({ balance: 1422.04, ticketStake: 5 })).not.toMatch(/class="bp-mobile-play[^"]*" disabled/)
        expect(renderPanel({ balance: 4.5, ticketStake: 5 })).toMatch(/class="bp-mobile-play[^"]*" disabled=""/)
    })

    it('quotes the game-resolved manual repeat ticket', () => {
        const ticketStake = ({ mode, betAmount }) => mode === 'manual' ? 15 : betAmount
        const html = renderPanel({ ticketStake })
        expect(html).toMatch(/bp-mobile-summary[^>]*><span>Ticket stake<\/span><strong>GC 15\.00<\/strong>/)
        expect(html).not.toMatch(/class="bp-mobile-play[^"]*" disabled/)
        expect(renderPanel({ balance: 10, ticketStake })).toMatch(/class="bp-mobile-play[^"]*" disabled=""/)
    })
})