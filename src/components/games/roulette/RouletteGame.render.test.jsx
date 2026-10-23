import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import RouletteGame from './RouletteGame'

vi.mock('../../../context/CreditContext', () => ({ useCredits: () => ({ balance: 1422.04, placeBet: vi.fn(), addWinnings: vi.fn(), showToast: vi.fn() }) }))
vi.mock('../../../audio/AudioProvider', () => ({ useAudio: () => ({ play: vi.fn() }) }))
vi.mock('../../../audio/useSfx', () => ({ useSfx: () => ({ play: vi.fn() }) }))
vi.mock('../../../audio/useBgm', () => ({ useGameBgm: vi.fn() }))
vi.mock('../../EducationPanel', () => ({ default: () => null }))
vi.mock('../primitives', async importOriginal => {
    const actual = await importOriginal()
    return {
        ...actual,
        GameShell: ({ panel, children }) => <>{panel}{children}</>,
        BigWinOverlay: () => null,
        useGameSession: () => ({ history: [], stats: { lastResults: [] }, record: vi.fn(), clear: vi.fn() }),
    }
})

describe('roulette native betting targets', () => {
    it('renders every number as a named keyboard-operable button', () => {
        const html = renderToStaticMarkup(<RouletteGame />)
        for (let number = 0; number <= 36; number += 1) {
            expect(html).toMatch(new RegExp(`<button[^>]*aria-label="Number ${number}"[^>]*aria-pressed="false"[^>]*>${number}</button>`))
        }
    })

    it('renders columns and outside bets as named keyboard-operable buttons', () => {
        const html = renderToStaticMarkup(<RouletteGame />)
        for (const label of ['Column 1', 'Column 2', 'Column 3', '1st 12', '2nd 12', '3rd 12', '1-18', '19-36', 'Red', 'Black', 'Odd', 'Even']) {
            expect(html).toMatch(new RegExp(`<button[^>]*aria-label="${label}"[^>]*aria-pressed="false"`))
        }
    })
})
