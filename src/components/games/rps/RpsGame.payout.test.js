import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({ play: null, settle: null, roll: 0, credit: vi.fn(), record: vi.fn(), toast: vi.fn() }))
vi.mock('../../../context/CreditContext', () => ({ useCredits: () => ({ balance: 100, placeBet: () => true, addWinnings: fixture.credit, showToast: fixture.toast }) }))
vi.mock('../../../audio/AudioProvider', () => ({ useAudio: () => ({ play: () => {} }) }))
vi.mock('../../../audio/useSfx', () => ({ useSfx: () => ({ play: () => {} }) }))
vi.mock('../../../audio/useBgm', () => ({ useGameBgm: () => {} }))
vi.mock('../../../utils/fairRng', () => ({ nextRoll: () => ({ roll: fixture.roll }) }))
vi.mock('../../../utils/funMode', () => ({ funBoostedRtp: rtp => rtp }))
vi.mock('../../../utils/scheduling', () => ({ useCancellableTimeouts: () => ({ schedule: callback => { fixture.settle = callback } }) }))
vi.mock('../../EducationPanel', () => ({ default: () => null }))
vi.mock('../primitives', () => {
    const Empty = () => null
    return {
        getBigWinThreshold: () => 5,
        useGameSession: () => ({ record: fixture.record, history: [], stats: { lastResults: [] } }),
        GameShell: ({ panel, children }) => React.createElement(React.Fragment, null, panel, children),
        BetPanel: props => { fixture.play = props.onPlay; return props.children },
        CoreStageFrame: ({ children }) => children,
        BigWinOverlay: Empty, HistoryDrawer: Empty, RecentResultsStrip: Empty, StatsOverlay: Empty, ResultToast: Empty, ActionLockOverlay: Empty,
    }
})
import RpsGame from './RpsGame'

beforeEach(() => { vi.clearAllMocks(); fixture.roll = 0; fixture.settle = null })

async function play(roll, betAmount = 7) {
    fixture.roll = roll
    renderToStaticMarkup(React.createElement(RpsGame))
    const round = fixture.play({ betAmount })
    fixture.settle()
    return round
}

describe('RPS public settlement receipts', () => {
    it('returns the stake on a push and records its gross 1x multiplier', async () => {
        expect(await play(0)).toEqual({ profit: 0 })
        expect(fixture.credit).toHaveBeenCalledExactlyOnceWith(7, 'RPS return')
        expect(fixture.record).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ label: 'Push', profit: 0, betAmount: 7, multiplier: 1 }))
    })

    it('keeps the existing win and loss payouts and gross multipliers', async () => {
        expect(await play(0.9)).toEqual({ profit: 6.37 })
        expect(fixture.credit).toHaveBeenLastCalledWith(13.37, 'RPS return')
        expect(fixture.record).toHaveBeenLastCalledWith(expect.objectContaining({ label: 'Win', multiplier: 1.91, profit: 6.37 }))
        fixture.credit.mockClear()
        expect(await play(0.5)).toEqual({ profit: -7 })
        expect(fixture.credit).not.toHaveBeenCalled()
        expect(fixture.record).toHaveBeenLastCalledWith(expect.objectContaining({ label: 'Miss', multiplier: 0, profit: -7 }))
    })

    it('rounds the production payout for a fractional stake', async () => {
        expect(await play(0.9, 0.01)).toEqual({ profit: 0.01 })
        expect(fixture.credit).toHaveBeenCalledWith(0.02, 'RPS return')
    })

    it('renders actual transparent hand glyphs instead of the baked checkerboard images', () => {
        const html = renderToStaticMarkup(React.createElement(RpsGame))
        expect(html).toContain('✊')
        expect(html).toContain('✋')
        expect(html).toContain('✌️')
        expect(html).not.toContain('<img')
        expect(html).toContain('aria-label="Rock"')
    })
})
