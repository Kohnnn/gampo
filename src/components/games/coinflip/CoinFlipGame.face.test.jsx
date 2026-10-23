import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({ states: [], cursor: 0, play: null, settle: null, roll: 0, record: vi.fn() }))
vi.mock('react', async importOriginal => ({
    ...await importOriginal(),
    useState: initial => {
        const index = fixture.cursor++
        if (!(index in fixture.states)) fixture.states[index] = typeof initial === 'function' ? initial() : initial
        return [fixture.states[index], value => { fixture.states[index] = typeof value === 'function' ? value(fixture.states[index]) : value }]
    },
}))
vi.mock('../../../context/CreditContext', () => ({ useCredits: () => ({ balance: 100, placeBet: () => true, addWinnings: () => {}, showToast: () => {} }) }))
vi.mock('../../../audio/AudioProvider', () => ({ useAudio: () => ({ play: () => {} }) }))
vi.mock('../../../audio/useSfx', () => ({ useSfx: () => ({ play: () => {} }) }))
vi.mock('../../../audio/useBgm', () => ({ useGameBgm: () => {} }))
vi.mock('../../../utils/fairRng', () => ({ nextRoll: () => ({ roll: fixture.roll }) }))
vi.mock('../../../utils/scheduling', () => ({ useCancellableTimeouts: () => ({ schedule: callback => { fixture.settle = callback } }) }))
vi.mock('../../EducationPanel', () => ({ default: () => null }))
vi.mock('../../fx', () => ({ Particles: () => null }))
vi.mock('../primitives', () => {
    const Empty = () => null
    return {
        getBigWinThreshold: () => 5,
        useGameSession: () => ({ record: fixture.record, history: [], stats: { lastResults: [] } }),
        GameShell: ({ panel, children }) => <>{panel}{children}</>,
        BetPanel: props => { fixture.play = props.onPlay; return null },
        CoreStageFrame: ({ children }) => children,
        Asset: ({ src }) => <img src={src} alt="" />,
        BigWinOverlay: Empty, HistoryDrawer: Empty, RecentResultsStrip: Empty, StatsOverlay: Empty, ResultToast: Empty, ActionLockOverlay: Empty,
    }
})
import CoinFlipGame from './CoinFlipGame'

function render() {
    fixture.cursor = 0
    return renderToStaticMarkup(<CoinFlipGame />)
}

beforeEach(() => { fixture.states = []; fixture.cursor = 0; vi.clearAllMocks() })

describe('Coin Flip landed face', () => {
    it.each([[0.1, 'head', 'Heads', '0deg'], [0.9, 'tail', 'Tails', '180deg']])('retains the recorded %s outcome on the coin', async (roll, side, label, rotation) => {
        fixture.roll = roll
        render()
        const round = fixture.play({ betAmount: 5 })
        expect(render()).toContain('aria-label="Coin flipping"')
        fixture.settle()
        await round
        const settled = render()
        expect(fixture.record).toHaveBeenCalledWith(expect.objectContaining({ label: side }))
        expect(settled).toContain(`data-landed-side="${side}"`)
        expect(settled).toContain(`aria-label="Landed ${label}"`)
        expect(settled).toContain(`--coin-landing:${rotation}`)
        expect(settled).not.toContain('coin3d-stage flipping')
        expect(render()).toBe(settled)
    })
})
