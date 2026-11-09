import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({ states: [], refs: [], cursor: 0, refCursor: 0, effects: [], record: vi.fn(), toast: vi.fn(), sound: vi.fn(), credit: vi.fn(), debit: vi.fn(), roll: 0.1, balance: 100 }))
vi.mock('react', async () => ({
    ...await vi.importActual('react'),
    useState(initial) {
        const i = fixture.cursor++
        if (!(i in fixture.states)) fixture.states[i] = typeof initial === 'function' ? initial() : initial
        return [fixture.states[i], value => { fixture.states[i] = typeof value === 'function' ? value(fixture.states[i]) : value }]
    },
    useRef(initial) { return fixture.refs[fixture.refCursor++] ||= { current: initial } },
    useEffect: effect => fixture.effects.push(effect), useCallback: callback => callback,
}))
vi.mock('../../../context/CreditContext', () => ({ useCredits: () => ({ balance: fixture.balance, placeBet: fixture.debit, addWinnings: fixture.credit, showToast: fixture.toast }) }))
vi.mock('../../../audio/AudioProvider', () => ({ useAudio: () => ({ play: fixture.sound }) }))
vi.mock('../../../audio/useSfx', () => ({ useSfx: () => ({ play: fixture.sound }) }))
vi.mock('../../../audio/useBgm', () => ({ useGameBgm: () => {} }))
vi.mock('../../../utils/fairRng', () => ({ nextRoll: () => ({ roll: fixture.roll }) }))
vi.mock('../resources/useOriginalsPreloader', () => ({ useOriginalsPreloader: () => ({ ready: true }) }))
vi.mock('../primitives', async () => {
    const { buildEvents, ROUND_EVENTS, useRoundMachine } = await import('../primitives/roundEvents')
    const Empty = () => null
    return {
        buildEvents, ROUND_EVENTS, useRoundMachine, getBigWinThreshold: () => 5,
        useGameSession: () => ({ record: fixture.record, history: [], stats: { lastResults: [] } }),
        GameShell: Empty, BetPanel: Empty, CoreStageFrame: Empty,
        BigWinOverlay: Empty, HistoryDrawer: Empty, RecentResultsStrip: Empty, StatsOverlay: Empty,
        SegmentedModeTabs: Empty, MultiplierBadge: Empty, ResultToast: Empty, ActionLockOverlay: Empty, SimBetStrip: Empty,
        makeInitialSimBetRows: () => [], makeSimBetRow: () => ({}), prependSimBetRow: () => [],
    }
})
import DiceGame from './DiceGame'

function render() { fixture.cursor = 0; fixture.refCursor = 0; fixture.effects = []; return DiceGame() }
function find(node, predicate) {
    if (!node || typeof node !== 'object') return null
    if (predicate(node)) return node
    for (const child of [node.props?.panel, ...[node.props?.children].flat(Infinity)]) {
        const found = find(child, predicate)
        if (found) return found
    }
    return null
}
const lock = tree => find(tree, node => node.props?.label === 'Rolling...').props.active
const play = tree => tree.props.panel.props.onPlay
function mount() {
    const tree = render()
    const cleanup = fixture.effects.map(effect => effect()).filter(Boolean)
    return { tree, unmount: () => cleanup.forEach(fn => fn()) }
}

beforeEach(() => {
    vi.useFakeTimers(); vi.clearAllMocks()
    fixture.states = []; fixture.refs = []; fixture.roll = 0.1; fixture.balance = 100
    fixture.debit.mockImplementation(amount => { if (amount > fixture.balance) return false; fixture.balance -= amount; return true })
    fixture.credit.mockImplementation(amount => { fixture.balance += amount })
    vi.stubGlobal('window', { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout })
})
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('Dice reveal and settlement share one outcome', () => {
    it('publishes payout/history only when Rolling disappears and the exact final number is visible', async () => {
        const mounted = mount()
        const round = play(mounted.tree)({ betAmount: 5 })
        expect(lock(render())).toBe(true)
        expect(fixture.balance).toBe(95) // accepted stake, not an outcome
        await vi.advanceTimersByTimeAsync(719)
        expect(fixture.credit).not.toHaveBeenCalled()
        expect(fixture.record).not.toHaveBeenCalled()
        expect(lock(render())).toBe(true)
        await vi.advanceTimersByTimeAsync(1)
        const settled = render()
        expect(lock(settled)).toBe(false)
        expect(find(settled, node => node.props?.className === 'dice-big win').props.children).toBe('10.00')
        expect(fixture.credit).toHaveBeenCalledExactlyOnceWith(9.9, 'Dice return')
        expect(fixture.record).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ label: '10.00', profit: 4.9, betAmount: 5 }))
        await vi.runAllTimersAsync(); await round; mounted.unmount()
        expect(fixture.credit).toHaveBeenCalledTimes(1)
        expect(fixture.record).toHaveBeenCalledTimes(1)
    })

    it('refuses same-tick and reveal-hold overlaps without another debit or RNG outcome', async () => {
        const mounted = mount()
        const first = play(mounted.tree)({ betAmount: 5 })
        await expect(play(mounted.tree)({ betAmount: 7 })).resolves.toMatchObject({ kind: 'rejected', code: 'active-obligation' })
        await vi.advanceTimersByTimeAsync(720)
        await expect(play(render())({ betAmount: 7 })).resolves.toMatchObject({ kind: 'rejected', code: 'active-obligation' })
        expect(fixture.debit).toHaveBeenCalledTimes(1)
        await vi.runAllTimersAsync(); await first
        const second = play(render())({ betAmount: 7 })
        await vi.runAllTimersAsync(); await second
        expect(fixture.debit).toHaveBeenCalledTimes(2)
        expect(fixture.record).toHaveBeenCalledTimes(2)
        mounted.unmount()
    })

    it('settles an accepted receipt once on navigation without a late announcement', async () => {
        const mounted = mount()
        const round = play(mounted.tree)({ betAmount: 5 })
        await vi.advanceTimersByTimeAsync(200)
        fixture.sound.mockClear()
        mounted.unmount()
        await expect(round).resolves.toMatchObject({ kind: 'committed', profit: 4.9 })
        await vi.runAllTimersAsync()
        expect(fixture.credit).toHaveBeenCalledExactlyOnceWith(9.9, 'Dice return')
        expect(fixture.record).toHaveBeenCalledTimes(1)
        expect(fixture.toast).not.toHaveBeenCalled()
        expect(fixture.sound).not.toHaveBeenCalled()
    })

    it('reconciles real Dice loss and mixed rounds against every debit, credit and receipt', async () => {
        const mounted = mount()
        for (const roll of [0.9, 0.9, 0.9, 0.1]) {
            fixture.roll = roll
            const round = play(render())({ betAmount: 1 })
            await vi.runAllTimersAsync()
            await round
        }
        expect(fixture.balance).toBe(97.98)
        expect(fixture.debit.mock.calls.map(([amount]) => amount)).toEqual([1, 1, 1, 1])
        expect(fixture.record.mock.calls.map(([entry]) => entry.profit)).toEqual([-1, -1, -1, 0.98])
        expect(fixture.credit).toHaveBeenCalledExactlyOnceWith(1.98, 'Dice return')
        mounted.unmount()
    })
})
