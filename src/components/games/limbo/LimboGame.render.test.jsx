import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import LimboGame from './LimboGame'

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

describe('Limbo multiplier legibility (QA004)', () => {
    // QA004: the essential multiplier number stays upright and legible while
    // outer decorative art animates. The number lives in a plain <span> inside
    // .limbo-ring; the spinning conic ring is a CSS ::before pseudo-element, so
    // the number carries no inline rotation and is never a spinning child.
    it('renders the multiplier in an un-rotated span inside the ring', () => {
        const html = renderToStaticMarkup(<LimboGame />)
        expect(html).toContain('class="limbo-ring ')
        // The multiplier number is a direct span child of the ring, not rotated.
        expect(html).toMatch(/<div class="limbo-ring [^"]*"><span><span[^>]*>1\.00×<\/span><\/span><\/div>/)
        expect(html).not.toMatch(/limbo-ring[^>]*><span[^>]*transform:\s*rotate/)
    })

    it('keeps a named Target multiplier badge beside the ring', () => {
        const html = renderToStaticMarkup(<LimboGame />)
        expect(html).toContain('class="limbo-target-label"')
        expect(html).toContain('Hit chance')
    })
})
