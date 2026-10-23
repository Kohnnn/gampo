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
