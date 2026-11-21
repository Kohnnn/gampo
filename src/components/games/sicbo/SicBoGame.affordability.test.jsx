// QA021: server-rendered controls only; native clicks, staging and settlement need the held runner.
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { AudioProvider } from '../../../audio/AudioProvider'
import { CreditProvider } from '../../../context/CreditContext'
import SicBoGame from './SicBoGame'

afterEach(() => vi.unstubAllGlobals())

it('keeps Sic Bo wager controls available exactly when a 5 GC chip is affordable', () => {
    vi.stubGlobal('document', {})
    for (const [balance, disabled] of [[1286.92, false], [5, false], [4.99, true]]) {
        const initial = { gampo_credits: String(balance) }
        vi.stubGlobal('localStorage', { getItem: key => initial[key] ?? null })
        const html = renderToStaticMarkup(
            <MemoryRouter><AudioProvider><CreditProvider><SicBoGame /></CreditProvider></AudioProvider></MemoryRouter>,
        )
        // Wager controls expose their unselected toggle state through aria-pressed.
        const wagers = html.match(/<button\b(?=[^>]*\baria-pressed="false")[^>]*>/g) || []
        expect(wagers.length, `wager controls at ${balance} GC`).toBeGreaterThan(0)
        for (const button of wagers) {
            expect(/\sdisabled(?:="[^"]*")?(?=\s|>)/.test(button), `wager control at ${balance} GC`).toBe(disabled)
        }
    }
})
