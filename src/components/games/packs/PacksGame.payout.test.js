import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { formatCredits } from '../../../utils/simulationMath'

const h = vi.hoisted(() => ({
    states: [], cursor: 0, timers: [], rolls: [], buttons: [], panel: null, result: null,
    balance: 1000, debit: vi.fn(), credit: vi.fn(), record: vi.fn(), toast: vi.fn(), finish: vi.fn(),
}))
vi.mock('react', async original => ({
    ...await original(),
    useState(initial) {
        const index = h.cursor++
        if (!(index in h.states)) h.states[index] = typeof initial === 'function' ? initial() : initial
        return [h.states[index], value => { h.states[index] = typeof value === 'function' ? value(h.states[index]) : value }]
    },
}))
vi.mock('../../../context/CreditContext', () => ({ useCredits: () => ({ balance: h.balance, placeBet: h.debit, addWinnings: h.credit, showToast: h.toast }) }))
vi.mock('../../../audio/AudioProvider', () => ({ useAudio: () => ({ play: () => {} }) }))
vi.mock('../../../audio/useSfx', () => ({ useSfx: () => ({ play: () => {} }) }))
vi.mock('../../../audio/useBgm', () => ({ useGameBgm: () => {} }))
vi.mock('../../../utils/fairRng', () => ({ nextRoll: () => ({ roll: h.rolls.shift() ?? 0 }) }))
vi.mock('../../../utils/scheduling', () => ({ useCancellableTimeouts: () => ({ schedule: callback => h.timers.push(callback) }) }))
vi.mock('../../games/resources/useOriginalsPreloader', () => ({ useOriginalsPreloader: () => ({ ready: true }) }))
vi.mock('../../EducationPanel', () => ({ default: () => null }))
vi.mock('../primitives', () => {
    const Empty = () => null
    function captureButtons(node) {
        React.Children.forEach(node, child => {
            if (!React.isValidElement(child)) return
            if (child.type === 'button') h.buttons.push(child.props)
            captureButtons(child.props.children)
        })
    }
    return {
        ROUND_EVENTS: { ROUND_START: 'start', INPUT_LOCK: 'lock', BET_ACCEPTED: 'bet' },
        useRoundMachine: () => ({ start: () => {}, finish: h.finish }),
        getBigWinThreshold: () => 12,
        useGameSession: () => ({ history: [], stats: { lastResults: [] }, record: h.record }),
        GameShell: ({ panel, children }) => React.createElement(React.Fragment, null, panel, children),
        BetPanel: props => { h.panel = props; return props.children },
        CoreStageFrame: ({ children }) => { captureButtons(children); return children },
        ResultToast: ({ result }) => { h.result = result; return null },
        BigWinOverlay: Empty, HistoryDrawer: Empty, RecentResultsStrip: Empty, StatsOverlay: Empty,
        MultiplierBadge: Empty, ActionLockOverlay: Empty,
    }
})

import PacksGame from './PacksGame'

function render() {
    h.cursor = 0
    h.buttons = []
    return renderToStaticMarkup(React.createElement(PacksGame))
}
function selectTier(index) {
    h.buttons[index].onClick()
    render()
}
async function play(amount, rolls = [0, 0, 0]) {
    h.rolls = [...rolls]
    const pending = h.panel.onPlay({ betAmount: amount })
    render()
    h.timers.splice(0).forEach(callback => callback())
    const result = await pending
    render()
    return result
}

beforeEach(() => {
    h.states = []
    h.timers = []
    h.rolls = []
    h.balance = 1000
    vi.clearAllMocks()
    h.debit.mockImplementation(amount => amount <= h.balance)
})

describe('Packs live quote and production settlement', () => {
    it('updates the quote before play, then debits the quoted amount through stake and tier changes', async () => {
        render()
        expect(h.panel.actionLabel).toContain(formatCredits(5))
        h.panel.onStakeChange(7.127)
        render()
        for (const [tier, cost] of [[0, 7.13], [1, 21.38], [2, 57.02]]) {
            selectTier(tier)
            expect(h.panel.actionLabel).toContain(formatCredits(cost))
            expect(h.panel.ticketStake({ betAmount: 7.127 })).toBe(cost)
            await play(7.127)
            expect(h.debit).toHaveBeenLastCalledWith(cost, 'Packs')
            expect(h.record.mock.lastCall[0].betAmount).toBe(cost)
        }
        h.panel.onStakeChange(0.01)
        render()
        selectTier(0)
        expect(h.panel.actionLabel).toContain(formatCredits(1))
        expect(h.panel.ticketStake({ betAmount: 0.01 })).toBe(1)
        await play(0.01)
        expect(h.debit).toHaveBeenLastCalledWith(1, 'Packs')
    })

    it('reports the three-card mean (1.03), not the best card, with gross and net', async () => {
        render()
        // Common: Bronze 0.5, Silver 1, Gold 1.6 => mean 1.033333…
        const result = await play(5, [0.4, 0.6, 0.85])
        const multiplier = (0.5 + 1 + 1.6) / 3
        expect(result).toEqual({ profit: 0.17 })
        expect(h.credit).toHaveBeenCalledExactlyOnceWith(5.17, 'Packs return')
        expect(h.record.mock.lastCall[0]).toMatchObject({ betAmount: 5, profit: 0.17, multiplier })
        expect(h.finish).toHaveBeenCalledWith(expect.objectContaining({ multiplier, profit: 0.17 }))
        expect(h.result).toMatchObject({ multiplier, amount: 0.17, kind: 'win' })
        expect(h.result.message).toContain('Best card ×1.60')
        expect(h.result.message).toContain(`Gross ${formatCredits(5.17)} · Net +${formatCredits(0.17)}`)
        expect(h.toast).toHaveBeenLastCalledWith('win', 'Packs Common · ×1.03', expect.stringContaining('Best card ×1.60'))
    })

    it('keeps a high card separate from a losing aggregate, and books a zero return', async () => {
        render()
        await play(5, [0, 0, 0.85])
        expect(h.result).toMatchObject({ multiplier: 1.6 / 3, kind: 'lose', amount: -2.33 })
        expect(h.credit).toHaveBeenLastCalledWith(2.67, 'Packs return')
        expect(h.result.message).toContain('Best card ×1.60')
        h.credit.mockClear()
        await play(7)
        expect(h.credit).not.toHaveBeenCalled()
        expect(h.record.mock.lastCall[0]).toMatchObject({ betAmount: 7, profit: -7, multiplier: 0 })
        expect(h.result.message).toContain(`Gross ${formatCredits(0)} · Net ${formatCredits(-7)}`)
    })

    it('exposes the tier-adjusted funding quote and refuses an unfunded play without credit or history', async () => {
        h.balance = 10
        render()
        selectTier(2)
        expect(h.panel.ticketStake({ betAmount: 5 })).toBe(40)
        expect(h.panel.ticketStake({ betAmount: 5 })).toBeGreaterThan(h.panel.balance)
        await expect(h.panel.onPlay({ betAmount: 5 })).resolves.toEqual({ profit: 0 })
        expect(h.debit).toHaveBeenCalledExactlyOnceWith(40, 'Packs')
        expect(h.credit).not.toHaveBeenCalled()
        expect(h.record).not.toHaveBeenCalled()
        expect(h.timers).toHaveLength(0)
    })

    it.each([NaN, Infinity, -Infinity, -5, 0])('rejects invalid amount %s before debit or settlement', async amount => {
        render()
        await expect(h.panel.onPlay({ betAmount: amount })).resolves.toEqual({ profit: 0 })
        expect(h.debit).not.toHaveBeenCalled()
        expect(h.credit).not.toHaveBeenCalled()
        expect(h.record).not.toHaveBeenCalled()
        expect(h.timers).toHaveLength(0)
        expect(h.toast).toHaveBeenCalledWith('error', 'Invalid bet amount', expect.any(String))
    })
})
