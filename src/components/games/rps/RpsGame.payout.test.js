import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({ play: null, settle: null, shell: null, roll: 0, credit: vi.fn(), record: vi.fn(), toast: vi.fn() }))
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
        GameShell: props => { fixture.shell = props; return React.createElement(React.Fragment, null, props.panel, props.children, props.secondary) },
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
        expect(await play(0)).toEqual(expect.objectContaining({ kind: 'committed', profit: 0, outcome: 'push', multiplier: 1 }))
        expect(fixture.credit).toHaveBeenCalledExactlyOnceWith(7, 'RPS return')
        expect(fixture.record).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ label: 'Push', profit: 0, betAmount: 7, multiplier: 1 }))
    })

    it('keeps the existing win and loss payouts and gross multipliers', async () => {
        expect(await play(0.9)).toEqual(expect.objectContaining({ kind: 'committed', profit: 6.37, outcome: 'win' }))
        expect(fixture.credit).toHaveBeenLastCalledWith(13.37, 'RPS return')
        expect(fixture.record).toHaveBeenLastCalledWith(expect.objectContaining({ label: 'Win', multiplier: 1.91, profit: 6.37 }))
        fixture.credit.mockClear()
        expect(await play(0.5)).toEqual(expect.objectContaining({ kind: 'committed', profit: -7, outcome: 'loss' }))
        expect(fixture.credit).not.toHaveBeenCalled()
        expect(fixture.record).toHaveBeenLastCalledWith(expect.objectContaining({ label: 'Miss', multiplier: 0, profit: -7 }))
    })

    it('rounds the production payout for a fractional stake', async () => {
        expect(await play(0.9, 0.01)).toEqual(expect.objectContaining({ kind: 'committed', profit: 0.01, outcome: 'win' }))
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

    it('keeps labeled gestures and the versus outcome ahead of secondary activity', () => {
        renderToStaticMarkup(React.createElement(RpsGame))
        expect(fixture.shell.primaryStage).toBe(true)
        const primary = renderToStaticMarkup(React.createElement(React.Fragment, null, fixture.shell.children))
        expect(primary).toContain('rps-versus phase-idle')
        for (const label of ['Rock', 'Paper', 'Scissors']) expect(primary).toContain(`<strong>${label}</strong>`)
        const nodes = React.Children.toArray(fixture.shell.children)
        expect(nodes[0].props.className).toContain('gs-primary-stage')
        expect(nodes[0].props.minHeight).toBeUndefined()
        expect(fixture.shell.secondary.props.children).toHaveLength(2)
    })
    it('push stakes the wallet zero-net and updates history exactly once', async () => {
        await play(0)
        expect(fixture.credit).toHaveBeenCalledExactlyOnceWith(7, 'RPS return')
        expect(fixture.record).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ label: 'Push', profit: 0, betAmount: 7, multiplier: 1 }))
    })
})

