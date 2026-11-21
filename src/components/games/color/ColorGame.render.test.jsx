import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import ColorGame from './ColorGame'

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

describe('Color Pick desktop choices (QA014)', () => {
    // QA014: every colour choice, including Gold, must render as its own
    // selectable button inside the panel; the four choices wrap into a
    // two-column grid so no choice (Gold last) is clipped off the right edge.
    it('renders all four choices including Gold as selectable choices', () => {
        const html = renderToStaticMarkup(<ColorGame />)
        for (const label of ['Red', 'Blue', 'Green', 'Gold']) {
            expect(html).toContain(`class="color-choice`)
            expect(html).toContain(`>${label}</button>`)
        }
        expect((html.match(/class="color-choice /g) || [])).toHaveLength(4)
    })

    it('starts with Red selected and Gold still available to choose', () => {
        const html = renderToStaticMarkup(<ColorGame />)
        expect(html).toContain('color-choice active" style="--swatch:#e23d4f"')
        expect(html).toContain('style="--swatch:#ffcf5a"')
        expect(html).not.toMatch(/color-choice[^"]*" [^>]*disabled[^>]*>Gold/)
    })
})
