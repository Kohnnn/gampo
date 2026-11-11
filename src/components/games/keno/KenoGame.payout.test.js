import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { round2, kenoPayout } from '../../../utils/simulationMath'

const fixture = vi.hoisted(() => ({ states: [], cursor: 0, panel: null, tree: null, education: null, timers: [], drawn: [], credit: vi.fn(), record: vi.fn(), debit: vi.fn(() => true) }))
vi.mock('react', async original => ({ ...await original(), useState: initial => {
    const index = fixture.cursor++
    if (!(index in fixture.states)) fixture.states[index] = typeof initial === 'function' ? initial() : initial
    return [fixture.states[index], value => { fixture.states[index] = typeof value === 'function' ? value(fixture.states[index]) : value }]
} }))
vi.mock('../../../utils/simulationMath', async original => ({ ...await original(), sampleUniqueNumbers: () => fixture.drawn }))
vi.mock('../../../context/CreditContext', () => ({ useCredits: () => ({ balance: 100, placeBet: fixture.debit, addWinnings: fixture.credit, showToast: () => {} }) }))
vi.mock('../../../audio/AudioProvider', () => ({ useAudio: () => ({ play: () => {} }) }))
vi.mock('../../../audio/useSfx', () => ({ useSfx: () => ({ play: () => {} }) }))
vi.mock('../../../audio/useBgm', () => ({ useGameBgm: () => {} }))
vi.mock('../../../hooks/useScrollActionIntoView', () => ({ useScrollActionIntoView: () => {} }))
vi.mock('../resources/useOriginalsPreloader', () => ({ useOriginalsPreloader: () => ({ ready: true }) }))
vi.mock('../../../utils/scheduling', () => ({ useCancellableTimeouts: () => ({ schedule: callback => { fixture.timers.push(callback); return fixture.timers.length } }) }))
vi.mock('../../EducationPanel', () => ({ default: props => { fixture.education = props; return null } }))
vi.mock('../../fx', () => ({ Particles: () => null }))
vi.mock('../primitives', () => {
    const Empty = () => null
    return {
        ROUND_EVENTS: {}, buildEvents: build => { build({ push: () => {} }); return [] },
        useRoundMachine: () => ({ start: () => {}, finish: () => {} }), getBigWinThreshold: () => 5,
        useGameSession: () => ({ history: [], stats: { lastResults: [] }, record: fixture.record }),
        GameShell: ({ panel, children }) => { fixture.tree = children; return React.createElement(React.Fragment, null, panel, children) },
        BetPanel: props => { fixture.panel = props; return props.children },
        CoreStageFrame: ({ children }) => children,
        BigWinOverlay: Empty, HistoryDrawer: Empty, RecentResultsStrip: Empty, StatsOverlay: Empty,
        MultiplierBadge: Empty, ResultToast: Empty, ActionLockOverlay: Empty, SimBetStrip: Empty,
        makeInitialSimBetRows: () => [], makeSimBetRow: () => ({}), prependSimBetRow: () => [],
    }
})
import KenoGame from './KenoGame.jsx'
function render() { fixture.cursor = 0; return renderToStaticMarkup(React.createElement(KenoGame)) }
function buttons(node = fixture.tree) {
    const out = [], stack = [node]
    for (let child; (child = stack.pop()) !== undefined;) {
        if (Array.isArray(child)) { stack.push(...child.slice().reverse()); continue }
        if (!React.isValidElement(child)) continue
        if (child.type === 'button') out.push(child)
        if (child.props?.children !== undefined) stack.push(child.props.children)
    }
    return out
}
beforeEach(() => {
    fixture.states = []; fixture.cursor = 0; fixture.timers = []; fixture.education = null
    vi.clearAllMocks(); fixture.debit.mockReturnValue(true)
})
describe('Keno production settlement and live disclosure', () => {
    for (let hits = 0; hits <= 5; hits += 1) {
        it('settles the actual ' + hits + '-hit outcome at the rounded production return', async () => {
            const selected = [4,8,15,16,23]
            fixture.drawn = [...selected.slice(0, hits), ...Array.from({ length: 10 - hits }, (_, i) => 40 - i)]
            render()
            const multiplier = kenoPayout(5, hits)
            const stake = 7.13
            const returned = round2(stake * multiplier)
            const pending = fixture.panel.onPlay({ betAmount: stake })
            while (fixture.timers.length) fixture.timers.shift()()
            await expect(pending).resolves.toEqual({ profit: round2(returned - stake) })
            expect(fixture.debit).toHaveBeenCalledWith(stake, 'Keno')
            if (returned > 0) expect(fixture.credit).toHaveBeenCalledWith(returned, 'Keno return')
            else expect(fixture.credit).not.toHaveBeenCalled()
            expect(fixture.record).toHaveBeenCalledWith(expect.objectContaining({ multiplier, betAmount: stake, profit: round2(returned - stake) }))
        })
    }
    it('quotes the live selected stake and refuses an invalid selection', () => {
        render()
        fixture.panel.onStakeChange(0.33)
        const html = render()
        expect(fixture.education.betAmount).toBe(0.33)
        expect(fixture.education.expectedGrossMultiplier).toBe(fixture.education.effectiveRtp)
        expect(fixture.education.payoutMultiplier).toBeUndefined()
        expect(fixture.education.winProbability).toBeUndefined()
        expect(html).toContain('Paying probability:')
        expect(html).toContain('20-play funding risk:')
        expect(html).toContain('no deposits, withdrawals')
        for (const number of [4,8,15,16,23]) {
            buttons().find(button => button.props.children === number).props.onClick()
            render()
        }
        fixture.education = null
        expect(render()).toContain('to see a payout quote')
        expect(fixture.education).toBeNull()
    })
    it('does not settle or credit a refused debit', async () => {
        render(); fixture.debit.mockReturnValue(false)
        await expect(fixture.panel.onPlay({ betAmount: 5 })).resolves.toEqual({ profit: 0 })
        expect(fixture.timers).toHaveLength(0)
        expect(fixture.credit).not.toHaveBeenCalled()
        expect(fixture.record).not.toHaveBeenCalled()
    })
})
