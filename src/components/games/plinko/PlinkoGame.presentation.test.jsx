import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({ state: [], refs: [], stateCursor: 0, refCursor: 0, effects: [], engine: null, credit: vi.fn(), debit: vi.fn(), record: vi.fn(), toast: vi.fn(), sound: vi.fn() }))
vi.mock('react', async () => ({
    ...await vi.importActual('react'),
    useState(initial) {
        const index = fixture.stateCursor++
        if (!(index in fixture.state)) fixture.state[index] = typeof initial === 'function' ? initial() : initial
        return [fixture.state[index], value => { fixture.state[index] = typeof value === 'function' ? value(fixture.state[index]) : value }]
    },
    useRef(initial) { const index = fixture.refCursor++; return fixture.refs[index] ||= { current: initial } },
    useEffect: effect => fixture.effects.push(effect),
    useMemo: callback => callback(),
    useCallback: callback => callback,
}))
vi.mock('../../../context/CreditContext', () => ({ useCredits: () => ({ balance: 1000, placeBet: fixture.debit, addWinnings: fixture.credit, showToast: fixture.toast }) }))
vi.mock('../../../audio/AudioProvider', () => ({ useAudio: () => ({ play: fixture.sound }) }))
vi.mock('../../../audio/useSfx', () => ({ useSfx: () => ({ play: fixture.sound }) }))
vi.mock('../../../audio/useBgm', () => ({ useGameBgm: () => {} }))
vi.mock('../../../hooks/useScrollActionIntoView', () => ({ useScrollActionIntoView: () => {} }))
vi.mock('../resources/useOriginalsPreloader', () => ({ useOriginalsPreloader: () => ({ ready: true }) }))
vi.mock('../../../utils/fairRng', () => ({ nextRoll: () => ({ roll: 0.1 }) }))
vi.mock('../../../utils/scheduling', () => ({ useCancellableTimeouts: () => ({ schedule: (callback, delay) => setTimeout(callback, delay) }) }))
vi.mock('../primitives', () => {
    const Empty = () => null
    return {
        GameShell: Empty, BetPanel: Empty, CoreStageFrame: Empty, BigWinOverlay: Empty, HistoryDrawer: Empty,
        RecentResultsStrip: Empty, StatsOverlay: Empty, MultiplierBadge: Empty, ResultToast: Empty, ActionLockOverlay: Empty, SimBetStrip: Empty,
        getBigWinThreshold: () => 15,
        useGameSession: () => ({ history: [], stats: { lastResults: [] }, record: fixture.record, clear: () => {} }),
        makeInitialSimBetRows: () => [], makeSimBetRow: () => ({}), prependSimBetRow: () => [],
        ROUND_EVENTS: {}, useRoundMachine: () => ({ start: () => {}, finish: () => {} }),
    }
})
vi.mock('./engine/PlinkoEngine.js', () => ({
    default: class {
        constructor(_canvas, options) { this.options = options; this.nextId = 0; fixture.engine = this }
        start() {}
        stop() {}
        updateRowCount() {}
        updateRiskLevel() {}
        updateBallStyle() {}
        updateBetAmount() {}
        dropBall() { return { id: `ball-${++this.nextId}` } }
    },
}))

import PlinkoGame from './PlinkoGame'
import EducationPanel from '../../EducationPanel'

function render() {
    fixture.stateCursor = 0
    fixture.refCursor = 0
    fixture.effects = []
    return PlinkoGame()
}
function find(node, predicate) {
    if (!node || typeof node !== 'object') return null
    if (predicate(node)) return node
    for (const child of [node.props?.panel, ...[node.props?.children].flat(Infinity)]) {
        const match = find(child, predicate)
        if (match) return match
    }
    return null
}
async function mount() {
    const tree = render()
    find(tree, node => node.type === 'canvas').ref.current = {}
    const cleanups = fixture.effects.map(effect => effect()).filter(Boolean)
    await vi.dynamicImportSettled()
    return { tree: render(), unmount: () => cleanups.forEach(cleanup => cleanup()) }
}

beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('window', globalThis)
    vi.clearAllMocks()
    fixture.state = []
    fixture.refs = []
    fixture.engine = null
    fixture.debit.mockReturnValue(true)
})
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('Plinko current stake and accepted outcomes', () => {
    it('describes the weighted return against the current total scaled ball cost', async () => {
        const mounted = await mount()
        find(mounted.tree, node => typeof node.props?.onStakeChange === 'function').props.onStakeChange(7.5)
        find(mounted.tree, node => node.type === 'button' && node.props?.title?.startsWith('Sapphire')).props.onClick()
        const props = find(render(), node => node.type === EducationPanel).props
        expect(props.betAmount).toBe(150)
        expect(props.expectedGrossMultiplier).toBeCloseTo(0.989892578125, 12)
        expect(props.effectiveRtp).toBe(props.expectedGrossMultiplier)
        expect(props.winProbability).toBeUndefined()
        expect(props.payoutMultiplier).toBeUndefined()
        mounted.unmount()
    })

    it('settles each accepted in-flight drop once on navigation without result announcements', async () => {
        const mounted = await mount()
        const play = find(mounted.tree, node => typeof node.props?.onPlay === 'function').props.onPlay
        const first = play({ betAmount: 5, mode: 'manual' })
        const second = play({ betAmount: 1, mode: 'auto' })
        expect(fixture.debit.mock.calls.map(call => call[0])).toEqual([5, 1])
        expect(fixture.credit).not.toHaveBeenCalled()
        fixture.sound.mockClear()
        mounted.unmount()
        await Promise.all([first, second])
        expect(fixture.credit.mock.calls.map(call => call[0])).toEqual([165, 33])
        expect(fixture.record.mock.calls.map(call => [call[0].betAmount, call[0].profit])).toEqual([[5, 160], [1, 32]])
        fixture.engine.options.onBallEnterBin({ ballId: 'ball-1', binIndex: 0, payout: { multiplier: 33 } })
        expect(fixture.credit).toHaveBeenCalledTimes(2)
        expect(fixture.record).toHaveBeenCalledTimes(2)
        expect(fixture.sound).not.toHaveBeenCalled()
        expect(fixture.toast).not.toHaveBeenCalled()
    })
})
