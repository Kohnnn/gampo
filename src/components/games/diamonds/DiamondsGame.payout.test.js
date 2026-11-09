import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { round2 } from '../../../utils/simulationMath'

const fixture = vi.hoisted(() => ({
    states: [],
    cursor: 0,
    rolls: [],
    timers: [],
    boost: 1,
    play: null,
    credit: vi.fn(),
    record: vi.fn(),
}))
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
vi.mock('../../../utils/fairRng', () => ({ nextRoll: () => ({ roll: fixture.rolls.shift() ?? 0 }) }))
vi.mock('../../../utils/funMode', () => ({ funBoostFactor: () => fixture.boost }))
vi.mock('../../../utils/scheduling', () => ({ useCancellableTimeouts: () => ({ schedule: callback => fixture.timers.push(callback) }) }))
vi.mock('../resources/useOriginalsPreloader', () => ({ useOriginalsPreloader: () => ({ ready: true }) }))
vi.mock('../../EducationPanel', () => ({ default: () => null }))
vi.mock('../primitives', () => {
    const Empty = () => null
    return {
        ROUND_EVENTS: { ROUND_START: 'start', INPUT_LOCK: 'lock', BET_ACCEPTED: 'bet', RNG_REVEAL: 'reveal', ROUND_RESULT: 'result', PAYOUT_PREVIEW: 'payout', INPUT_UNLOCK: 'unlock' },
        buildEvents: build => { const events = []; build({ push: (type, payload, at) => events.push({ type, payload, at }) }); return events },
        useRoundMachine: () => ({ start: () => {}, finish: () => {} }),
        getBigWinThreshold: () => 5,
        useGameSession: () => ({ record: fixture.record, history: [], stats: { lastResults: [] } }),
        GameShell: ({ panel, children }) => React.createElement(React.Fragment, null, panel, children),
        BetPanel: props => { fixture.play = props.onPlay; return props.children },
        CoreStageFrame: ({ children }) => children,
        MultiplierBadge: ({ label, value }) => React.createElement('output', { 'aria-label': label }, value),
        BigWinOverlay: Empty, HistoryDrawer: Empty, RecentResultsStrip: Empty, StatsOverlay: Empty, ResultToast: Empty, ActionLockOverlay: Empty,
    }
})

import DiamondsGame, { GEMS, diamondsReturn, payoutFor } from './DiamondsGame'

function render() {
    fixture.cursor = 0
    return renderToStaticMarkup(React.createElement(DiamondsGame))
}

beforeEach(() => {
    fixture.states = []
    fixture.cursor = 0
    fixture.rolls = []
    fixture.timers = []
    fixture.boost = 1
    vi.clearAllMocks()
})

describe('Diamonds payout rounding', () => {
    it('books a 2dp return and profit across plausible multipliers and stakes', () => {
        for (let cents = 1; cents <= 400; cents += 7) {
            const multiplier = round2(cents / 10)
            for (const stake of [0.01, 0.1, 0.25, 0.5, 1, 2.5, 5, 7, 12.5, 25, 33, 100, 140]) {
                const { returnAmount, profit } = diamondsReturn(stake, multiplier)
                expect(returnAmount).toBe(round2(returnAmount))
                expect(profit).toBe(round2(profit))
                expect(round2(profit + stake)).toBe(returnAmount)
            }
        }
    })

    it('corrects a stake/multiplier pair that drifts without rounding', () => {
        const raw = 0.1 * 1.17
        expect(raw).not.toBe(round2(raw))
        expect(diamondsReturn(0.1, 1.17).returnAmount).toBe(0.12)
    })

    it('books the full stake as the loss when nothing matches', () => {
        expect(diamondsReturn(7, 0)).toEqual({ won: false, returnAmount: 0, profit: -7 })
    })
})

describe('Diamonds displayed paytable and settlement alignment (QA015)', () => {
    for (const boost of [1, 1 / 0.96]) it(`settles every displayed gem/match return with boost ${boost}`, async () => {
        fixture.boost = boost
        const html = render()
        expect(html).toContain('Best match pays · RTP-normalized gross return')
        const rolls = [0.02, 0.08, 0.18, 0.34, 0.54, 0.83]
        for (let gemIndex = 0; gemIndex < GEMS.length; gemIndex += 1) {
            for (const count of [2, 3, 4, 5]) {
                const multiplier = payoutFor(count, gemIndex, boost)
                expect(html).toContain(`data-gem-index="${gemIndex}" data-match-count="${count}">${multiplier.toFixed(2)}×</td>`)
                // Other gems occur at most once, so this is the winning match.
                fixture.rolls = [...Array(count).fill(rolls[gemIndex]), ...rolls.filter((_, i) => i !== gemIndex).slice(0, 5 - count)]
                const playPromise = fixture.play({ betAmount: 7 })
                fixture.timers.splice(0).forEach(cb => cb())
                const returnAmount = round2(7 * multiplier)
                await expect(playPromise).resolves.toEqual({ profit: round2(returnAmount - 7) })
                expect(fixture.credit).toHaveBeenLastCalledWith(returnAmount, 'Diamonds return')
                expect(fixture.record).toHaveBeenLastCalledWith(expect.objectContaining({ betAmount: 7, multiplier, profit: round2(returnAmount - 7) }))
            }
        }
    })
})
