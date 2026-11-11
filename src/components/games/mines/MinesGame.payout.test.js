import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({ states: [], cursor: 0, play: null, cashout: null, panel: null, tree: null, timers: [], record: vi.fn(), credit: vi.fn() }))
vi.mock('react', async importOriginal => ({
    ...await importOriginal(),
    useState: initial => {
        const index = fixture.cursor++
        if (!(index in fixture.states)) fixture.states[index] = typeof initial === 'function' ? initial() : initial
        return [fixture.states[index], value => { fixture.states[index] = typeof value === 'function' ? value(fixture.states[index]) : value }]
    },
}))
vi.mock('../../../context/CreditContext', () => ({ useCredits: () => ({ balance: 100, placeBet: () => true, addWinnings: fixture.credit, showToast: () => {} }) }))
vi.mock('../../../audio/AudioProvider', () => ({ useAudio: () => ({ play: () => {} }) }))
vi.mock('../../../audio/useSfx', () => ({ useSfx: () => ({ play: () => {} }) }))
vi.mock('../../../audio/useBgm', () => ({ useGameBgm: () => {} }))
vi.mock('../../../utils/fairRng', () => ({ nextRoll: () => ({ roll: 0 }) }))
vi.mock('../../../utils/scheduling', () => ({ useCancellableTimeouts: () => ({ schedule: callback => fixture.timers.push(callback), cancelAll: () => { fixture.timers = [] } }) }))
vi.mock('../resources/useOriginalsPreloader', () => ({ useOriginalsPreloader: () => ({ ready: true }) }))
vi.mock('../../EducationPanel', () => ({ default: () => null }))
vi.mock('../../fx', () => ({ Particles: () => null }))
vi.mock('../primitives', () => {
    const Empty = () => null
    return {
        ROUND_EVENTS: {}, useRoundMachine: () => ({ start: () => {}, finish: () => {} }), getBigWinThreshold: () => 5,
        useGameSession: () => ({ record: fixture.record, history: [], stats: { lastResults: [] } }),
        GameShell: ({ panel, children }) => React.createElement(React.Fragment, null, panel, children),
        BetPanel: props => { fixture.play = props.onPlay; fixture.cashout = props.onPlayPhaseAction; fixture.panel = props.children; return props.children },
        CoreStageFrame: ({ children }) => { fixture.tree = children; return children },
        MultiplierBadge: ({ label, value }) => React.createElement('output', { 'aria-label': label }, value),
        BigWinOverlay: Empty, HistoryDrawer: Empty, RecentResultsStrip: Empty, StatsOverlay: Empty, ResultToast: Empty, ActionLockOverlay: Empty, SimBetStrip: Empty,
        makeInitialSimBetRows: () => [], makeSimBetRow: () => ({}), prependSimBetRow: () => [],
    }
})
import MinesGame from './MinesGame'

function render() {
    fixture.cursor = 0
    return renderToStaticMarkup(React.createElement(MinesGame))
}
function cells(node = fixture.tree) {
    if (!React.isValidElement(node)) return []
    if (node.type === 'button' && node.props['aria-label']) return [node]
    return React.Children.toArray(node.props.children).flatMap(child => cells(child))
}
function bombButtons(node = fixture.panel) {
    if (Array.isArray(node)) return node.flatMap(child => bombButtons(child))
    if (!React.isValidElement(node)) return []
    if (node.type === 'button' && typeof node.props.children === 'number') return [node]
    return React.Children.toArray(node.props.children).flatMap(child => bombButtons(child))
}
function reveal(index) {
    cells()[index].props.onClick()
    return render()
}
const expectNoNextPick = html => {
    expect(html).not.toContain('aria-label="Next pick"')
    expect(html).not.toContain('Infinity')
    expect(html).not.toContain('NaN')
    expect(html).toContain('<span>Next pick</span><strong>No next pick</strong>')
}

beforeEach(() => { fixture.states = []; fixture.cursor = 0; fixture.timers = []; vi.clearAllMocks() })

describe('Mines next-pick availability', () => {
    it('quotes a finite next pick only during an active round and removes it after a bust', async () => {
        expectNoNextPick(render())
        await fixture.play({ betAmount: 5 })
        expect(render()).toContain('aria-label="Next pick"')
        expectNoNextPick(reveal(0))
        expect(fixture.record).toHaveBeenCalledWith(expect.objectContaining({ profit: -5 }))
        fixture.timers.forEach(callback => callback())
        expectNoNextPick(render())
    })

    it('removes the next pick after a cashout while preserving the production payout', async () => {
        render()
        await fixture.play({ betAmount: 5 })
        render()
        reveal(3)
        fixture.cashout()
        expectNoNextPick(render())
        expect(fixture.credit).toHaveBeenCalledWith(5.63, 'Mines return')
        expect(fixture.record).toHaveBeenCalledWith(expect.objectContaining({ betAmount: 5, profit: 0.63, multiplier: 1.125 }))
    })

    it('auto-cashes the last safe cell without computing an impossible next pick', async () => {
        render()
        await fixture.play({ betAmount: 5 })
        render()
        for (let index = 3; index < 25; index += 1) reveal(index)
        expectNoNextPick(render())
        expect(fixture.credit).toHaveBeenCalledTimes(1)
        expect(fixture.record).toHaveBeenCalledTimes(1)
        expect(fixture.record).toHaveBeenCalledWith(expect.objectContaining({ multiplier: 2277 }))
    })

    it('never displays Infinity or stale multipliers when changing to 24 bombs after a 3-bomb cashout (QA010)', async () => {
        render()
        await fixture.play({ betAmount: 5 })
        render()
        reveal(3)
        reveal(4)
        fixture.cashout()
        const cashedHtml = render()
        expectNoNextPick(cashedHtml)
        expect(cashedHtml).toContain('<span>Current</span><strong>1.29×</strong>')

        const bomb24 = bombButtons().find(btn => btn.props.children === 24)
        bomb24.props.onClick()
        const after24Html = render()
        expectNoNextPick(after24Html)
        expect(after24Html).toContain('Bombs (24)')
        expect(after24Html).toContain('<span>Current</span><strong>1.00×</strong>')
        expect(after24Html).toContain('<output aria-label="Current">1</output>')
    })
})
