import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({ play: null, effects: [], record: vi.fn(), toast: vi.fn(), sound: vi.fn(), credit: vi.fn(), events: [] }))
vi.mock('react', async importOriginal => ({ ...await importOriginal(), useEffect: effect => { fixture.effects.push(effect) } }))
vi.mock('../../../context/CreditContext', () => ({ useCredits: () => ({ balance: 100, placeBet: () => true, addWinnings: fixture.credit, showToast: fixture.toast }) }))
vi.mock('../../../audio/AudioProvider', () => ({ useAudio: () => ({ play: fixture.sound }) }))
vi.mock('../../../audio/useSfx', () => ({ useSfx: () => ({ play: fixture.sound }) }))
vi.mock('../../../audio/useBgm', () => ({ useGameBgm: () => {} }))
vi.mock('../../../utils/fairRng', () => ({ nextRoll: () => ({ roll: 0.1 }) }))
vi.mock('../resources/useOriginalsPreloader', () => ({ useOriginalsPreloader: () => ({ ready: true }) }))
vi.mock('../../EducationPanel', () => ({ default: () => null }))
vi.mock('../primitives', async () => {
    const { buildEvents, ROUND_EVENTS, useRoundMachine } = await import('../primitives/roundEvents')
    const Empty = () => null
    return {
        buildEvents, ROUND_EVENTS, useRoundMachine,
        getBigWinThreshold: () => 5,
        useGameSession: () => ({ record: fixture.record, history: [], stats: { lastResults: [] } }),
        GameShell: ({ panel, children }) => <>{panel}{children}</>,
        BetPanel: props => { fixture.play = props.onPlay; return null },
        CoreStageFrame: ({ children }) => children,
        BigWinOverlay: Empty, HistoryDrawer: Empty, RecentResultsStrip: Empty, StatsOverlay: Empty,
        SegmentedModeTabs: Empty, MultiplierBadge: Empty, ResultToast: Empty, ActionLockOverlay: Empty, SimBetStrip: Empty,
        makeInitialSimBetRows: () => [], makeSimBetRow: () => ({}), prependSimBetRow: () => [],
    }
})
import DiceGame from './DiceGame'

describe('Dice result publication', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.clearAllMocks()
        fixture.effects = []
        vi.stubGlobal('window', { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout })
    })
    afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals() })

    const mount = () => {
        renderToStaticMarkup(<DiceGame />)
        const cleanups = fixture.effects.map(effect => effect()).filter(Boolean)
        return () => cleanups.forEach(cleanup => cleanup())
    }

    it('credits once but announces only after the final number reveal event', async () => {
        const unmount = mount()
        const round = fixture.play({ betAmount: 5 })
        expect(fixture.credit).toHaveBeenCalledTimes(1)
        fixture.sound.mockClear()
        vi.advanceTimersByTime(719)
        expect(fixture.record).not.toHaveBeenCalled()
        expect(fixture.toast).not.toHaveBeenCalled()
        expect(fixture.sound.mock.calls.flat()).not.toContain('win')
        vi.advanceTimersByTime(1)
        expect(fixture.record).toHaveBeenCalledTimes(1)
        expect(fixture.toast).toHaveBeenCalledTimes(1)
        vi.runAllTimers()
        await round
        unmount()
        expect(fixture.credit).toHaveBeenCalledTimes(1)
        expect(fixture.record).toHaveBeenCalledTimes(1)
    })

    it('keeps both receipts and promises when a 300ms overlap crosses the older cleanup', async () => {
        const unmount = mount()
        const firstSettled = vi.fn()
        const first = fixture.play({ betAmount: 5 }).then(firstSettled)
        await vi.advanceTimersByTimeAsync(300)
        const secondSettled = vi.fn()
        const second = fixture.play({ betAmount: 7 }).then(secondSettled)
        fixture.sound.mockClear()

        await vi.advanceTimersByTimeAsync(420)
        expect(fixture.record).toHaveBeenCalledTimes(1)
        expect(fixture.record).toHaveBeenNthCalledWith(1, expect.objectContaining({ betAmount: 5 }))
        expect(fixture.toast).not.toHaveBeenCalled()
        expect(fixture.sound.mock.calls.flat()).not.toContain('win')
        expect(firstSettled).not.toHaveBeenCalled()
        expect(secondSettled).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(260)
        expect(firstSettled).toHaveBeenCalledWith({ profit: fixture.record.mock.calls[0][0].profit })
        expect(secondSettled).not.toHaveBeenCalled()
        expect(fixture.record).toHaveBeenCalledTimes(1)
        expect(fixture.toast).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(39)
        expect(fixture.record).toHaveBeenCalledTimes(1)
        expect(fixture.toast).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(1)
        expect(fixture.record).toHaveBeenCalledTimes(2)
        expect(fixture.record).toHaveBeenNthCalledWith(2, expect.objectContaining({ betAmount: 7 }))
        expect(fixture.toast).toHaveBeenCalledTimes(1)
        expect(fixture.sound.mock.calls.filter(([name]) => name === 'win')).toHaveLength(2)

        await vi.runAllTimersAsync()
        expect(secondSettled).toHaveBeenCalledWith({ profit: fixture.record.mock.calls[1][0].profit })
        expect(firstSettled).toHaveBeenCalledTimes(1)
        expect(secondSettled).toHaveBeenCalledTimes(1)
        await Promise.all([first, second])
        unmount()
        expect(fixture.credit).toHaveBeenCalledTimes(2)
        expect(fixture.record).toHaveBeenCalledTimes(2)
        expect(new Set(fixture.record.mock.calls.map(([entry]) => entry.id)).size).toBe(2)
    })

    it('flushes every pending round on navigation without announcing superseded results', async () => {
        const unmount = mount()
        const settled = [vi.fn(), vi.fn(), vi.fn()]
        const rounds = [fixture.play({ betAmount: 5 }).then(settled[0])]
        await vi.advanceTimersByTimeAsync(300)
        rounds.push(fixture.play({ betAmount: 7 }).then(settled[1]))
        await vi.advanceTimersByTimeAsync(300)
        rounds.push(fixture.play({ betAmount: 9 }).then(settled[2]))
        fixture.sound.mockClear()
        unmount()
        await Promise.resolve()

        expect(fixture.record.mock.calls.map(([entry]) => entry.betAmount)).toEqual([5, 7, 9])
        expect(new Set(fixture.record.mock.calls.map(([entry]) => entry.id)).size).toBe(3)
        settled.forEach((resolve, index) => {
            expect(resolve).toHaveBeenCalledTimes(1)
            expect(resolve).toHaveBeenCalledWith({ profit: fixture.record.mock.calls[index][0].profit })
        })
        await Promise.all(rounds)
        await vi.runAllTimersAsync()
        expect(fixture.credit).toHaveBeenCalledTimes(3)
        expect(fixture.record).toHaveBeenCalledTimes(3)
        expect(fixture.toast).not.toHaveBeenCalled()
        expect(fixture.sound).not.toHaveBeenCalled()
    })

    it('drains the current receipt when navigation follows an older round cleanup', async () => {
        const unmount = mount()
        const firstSettled = vi.fn()
        const first = fixture.play({ betAmount: 5 }).then(firstSettled)
        await vi.advanceTimersByTimeAsync(300)
        const secondSettled = vi.fn()
        const second = fixture.play({ betAmount: 7 }).then(secondSettled)
        await vi.advanceTimersByTimeAsync(680)
        expect(firstSettled).toHaveBeenCalledTimes(1)
        expect(secondSettled).not.toHaveBeenCalled()
        fixture.sound.mockClear()
        unmount()
        await Promise.resolve()

        expect(fixture.record.mock.calls.map(([entry]) => entry.betAmount)).toEqual([5, 7])
        expect(new Set(fixture.record.mock.calls.map(([entry]) => entry.id)).size).toBe(2)
        expect(secondSettled).toHaveBeenCalledWith({ profit: fixture.record.mock.calls[1][0].profit })
        await Promise.all([first, second])
        await vi.runAllTimersAsync()
        expect(firstSettled).toHaveBeenCalledTimes(1)
        expect(secondSettled).toHaveBeenCalledTimes(1)
        expect(fixture.record).toHaveBeenCalledTimes(2)
        expect(fixture.toast).not.toHaveBeenCalled()
        expect(fixture.sound).not.toHaveBeenCalled()
    })

    it('flushes outstanding promises after one result without duplicating its receipt', async () => {
        const unmount = mount()
        const firstSettled = vi.fn()
        const first = fixture.play({ betAmount: 5 }).then(firstSettled)
        await vi.advanceTimersByTimeAsync(720)
        expect(fixture.record).toHaveBeenCalledTimes(1)
        expect(fixture.toast).toHaveBeenCalledTimes(1)
        const secondSettled = vi.fn()
        const second = fixture.play({ betAmount: 7 }).then(secondSettled)
        await vi.advanceTimersByTimeAsync(100)
        fixture.sound.mockClear()
        unmount()
        await Promise.resolve()

        expect(fixture.record.mock.calls.map(([entry]) => entry.betAmount)).toEqual([5, 7])
        expect(new Set(fixture.record.mock.calls.map(([entry]) => entry.id)).size).toBe(2)
        expect(firstSettled).toHaveBeenCalledTimes(1)
        expect(secondSettled).toHaveBeenCalledTimes(1)
        expect(firstSettled).toHaveBeenCalledWith({ profit: fixture.record.mock.calls[0][0].profit })
        expect(secondSettled).toHaveBeenCalledWith({ profit: fixture.record.mock.calls[1][0].profit })
        await Promise.all([first, second])
        await vi.runAllTimersAsync()
        expect(fixture.credit).toHaveBeenCalledTimes(2)
        expect(fixture.record).toHaveBeenCalledTimes(2)
        expect(fixture.toast).toHaveBeenCalledTimes(1)
        expect(fixture.sound).not.toHaveBeenCalled()
    })

    it('flushes one history receipt on navigation without a late toast or sound', async () => {
        const unmount = mount()
        const round = fixture.play({ betAmount: 5 })
        vi.advanceTimersByTime(200)
        fixture.sound.mockClear()
        unmount()
        await round
        vi.runAllTimers()
        expect(fixture.credit).toHaveBeenCalledTimes(1)
        expect(fixture.record).toHaveBeenCalledTimes(1)
        expect(fixture.record).toHaveBeenCalledWith(expect.objectContaining({ label: '10.00', betAmount: 5 }))
        expect(fixture.toast).not.toHaveBeenCalled()
        expect(fixture.sound).not.toHaveBeenCalled()
    })
})
