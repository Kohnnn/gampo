import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { round2 } from '../../../utils/simulationMath'
import HiloGame from './HiloGame.jsx'
import BetPanel from '../primitives/BetPanel.jsx'
import { accountAutoRound } from '../primitives/autoAccounting'

const fixture = vi.hoisted(() => ({
    owners: {}, active: null, history: [], attempts: [], rolls: [], settle: null,
    debit: vi.fn(() => true), credit: vi.fn(), toast: vi.fn(),
}))

vi.mock('react', async original => ({
    ...await original(),
    useState(initial) {
        const owner = fixture.owners[fixture.active], index = owner.stateCursor++
        if (!(index in owner.states)) owner.states[index] = typeof initial === 'function' ? initial() : initial
        return [owner.states[index], value => { owner.states[index] = typeof value === 'function' ? value(owner.states[index]) : value }]
    },
    useRef(initial) {
        const owner = fixture.owners[fixture.active], index = owner.refCursor++
        return owner.refs[index] ||= { current: initial }
    },
    useEffect: () => {}, useLayoutEffect: () => {},
    useCallback: callback => callback, useMemo: callback => callback(), useId: () => 'hilo-test',
}))
vi.mock('react-dom', () => ({ createPortal: children => children }))
vi.mock('../../../context/CreditContext', () => ({ useCredits: () => ({ balance: 100, placeBet: fixture.debit, addWinnings: fixture.credit, showToast: fixture.toast }) }))
vi.mock('../../../audio/AudioProvider', () => ({ useAudio: () => ({ play: () => {} }) }))
vi.mock('../../../audio/useSfx', () => ({ useSfx: () => ({ play: () => {} }) }))
vi.mock('../../../audio/useBgm', () => ({ useGameBgm: () => {} }))
vi.mock('../../../utils/funMode', () => ({ funBoostedRtp: rtp => rtp }))
vi.mock('../../../utils/fairRng', () => ({ nextRoll: () => ({ roll: fixture.rolls.shift() }) }))
vi.mock('../../../utils/scheduling', () => ({
    useCancellableTimeouts: () => ({ schedule: callback => { fixture.settle = callback } }),
    withTimeout: promise => Promise.resolve(promise).then(value => ({ timedOut: false, value })),
}))
vi.mock('../primitives/HotkeyHelp', () => ({ isOpenDialogPresent: () => false }))
vi.mock('../primitives/autoAccounting', async original => {
    const actual = await original()
    return { ...actual, accountAutoRound: vi.fn(actual.accountAutoRound) }
})
vi.mock('../primitives', async () => {
    const { buildEvents, ROUND_EVENTS } = await import('../primitives/roundEvents')
    const Empty = () => null
    return {
        BetPanel: Empty, GameShell: Empty, CoreStageFrame: Empty,
        getBigWinThreshold: () => 5,
        useGameSession: () => ({ history: fixture.history, stats: { lastResults: [] }, record: entry => fixture.history.push(entry) }),
        useRoundMachine: () => ({ start: () => {} }), buildEvents, ROUND_EVENTS,
        SegmentedModeTabs: Empty, BigWinOverlay: Empty, HistoryDrawer: Empty, RecentResultsStrip: Empty,
        StatsOverlay: Empty, MultiplierBadge: Empty, ResultToast: Empty, ActionLockOverlay: Empty,
    }
})
vi.mock('../resources/useOriginalsPreloader', () => ({ useOriginalsPreloader: () => ({ ready: true }) }))
vi.mock('../../EducationPanel', () => ({ default: () => null }))
vi.mock('../../fx', () => ({ Particles: () => null }))

function findNode(node, predicate) {
    if (Array.isArray(node)) return node.map(child => findNode(child, predicate)).find(Boolean)
    if (!node || typeof node !== 'object') return null
    return predicate(node) ? node : findNode(node.props?.children, predicate)
}

function renderGame() {
    fixture.active = 'game'
    fixture.owners.game.stateCursor = fixture.owners.game.refCursor = 0
    return HiloGame()
}

function renderPanel({ stopFirstAuto = true } = {}) {
    const panel = renderGame().props.panel
    fixture.active = 'panel'
    fixture.owners.panel.stateCursor = fixture.owners.panel.refCursor = 0
    return BetPanel({ ...panel.props, onPlay: async request => {
        const result = await panel.props.onPlay(request)
        fixture.attempts.push({ request, result })
        // A committed result must ignore this consumer hint and continue.
        return stopFirstAuto && request.mode === 'auto' && fixture.attempts.length === 1 ? { ...result, stopAuto: true } : result
    } })
}

const tabButton = (tree, tab) => findNode(tree, node => node.type === 'button' && node.props?.className?.includes('bp-tab')
    && [node.props.children].flat(Infinity).some(child => child?.props?.children === tab))
const playButton = tree => findNode(tree, node => node.type === 'button' && node.props?.className?.includes('bp-play'))

beforeEach(() => {
    fixture.owners = Object.fromEntries(['game', 'panel'].map(key => [key, { states: [], refs: [], stateCursor: 0, refCursor: 0 }]))
    fixture.history = []; fixture.attempts = []; fixture.rolls = []; fixture.settle = null
    fixture.debit.mockReset().mockReturnValue(true); fixture.credit.mockReset(); fixture.toast.mockClear(); vi.mocked(accountAutoRound).mockClear()
    vi.useFakeTimers()
})
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

const source = readFileSync(new URL('./HiloGame.jsx', import.meta.url), 'utf8')

// Mirror of the component's settle math.
function settle({ push, won, payout, betAmount }) {
    const returnAmount = push ? betAmount : won ? round2(betAmount * payout) : 0
    const profit = round2(returnAmount - betAmount)
    return { returnAmount, profit }
}

const MULTIPLIERS = [1.1466666666666667,1.2414814814814814,1.4497777777777776,2.174666666666667,3.262,10.873333333333333]
const STAKES = [1, 2, 3, 5, 7, 10, 25, 100, 137]
const TWO_DP = /^-?\d+(\.\d{1,2})?$/

describe('hi-lo payout rounding', () => {
    it('books a 2dp-clean profit and return for every stake and multiplier', () => {
        for (const m of MULTIPLIERS) {
            for (const stake of STAKES) {
                const { returnAmount, profit } = settle({ push: false, won: m > 0, payout: m, betAmount: stake })
                expect(String(profit)).toMatch(TWO_DP)
                expect(String(returnAmount)).toMatch(TWO_DP)
            }
        }
    })

    it('would drift without the rounding', () => {
        // Fails if the rounding ever becomes a no-op: at least one real
        // multiplier must produce a raw value that is not already 2dp.
        const drifted = MULTIPLIERS.some(m => STAKES.some(stake => !TWO_DP.test(String(stake * m - stake))))
        expect(drifted).toBe(true)
    })

    it('loses exactly the stake on a losing round', () => {
        for (const stake of STAKES) {
            const m = 0
            const { returnAmount, profit } = settle({ push: false, won: m > 0, payout: m, betAmount: stake })
            expect(returnAmount).toBe(0)
            expect(profit).toBe(-stake)
        }
    })

    it('keeps the credited return and the booked profit consistent', () => {
        for (const m of MULTIPLIERS) {
            for (const stake of STAKES) {
                const { returnAmount, profit } = settle({ push: false, won: m > 0, payout: m, betAmount: stake })
                expect(round2(returnAmount - stake)).toBe(profit)
            }
        }
    })

    it('pushes back exactly the stake when the ranks tie', () => {
        for (const stake of STAKES) {
            const { returnAmount, profit } = settle({ push: true, won: false, payout: 0, betAmount: stake })
            expect(returnAmount).toBe(stake)
            expect(profit).toBe(0)
        }
    })
})

describe('hi-lo is pinned to the component', () => {
    it('rounds the return and the profit', () => {
        expect(source).toContain("const returnAmount = push ? betAmount : won ? round2(betAmount * payout) : 0")
        expect(source).toContain("const profit = round2(returnAmount - betAmount)")
    })

    it('imports round2 from the shared money helpers', () => {
        expect(source).toMatch(/import \{[^}]*\bround2\b[^}]*\} from '(\.\.\/)+utils\/simulationMath'/)
    })

    it('routes its timers through the cancellable scheduler', () => {
        expect(source).not.toMatch(/(?<![.\w])setTimeout\(/)
        expect(source).toContain("import { useCancellableTimeouts } from '../../../utils/scheduling'")
        expect(source).toContain('const { schedule } = useCancellableTimeouts()')
    })
})

describe('hi-lo component parses', () => {
    // The tests above read the component as text, so a syntax error would not
    // fail them. Importing makes a broken component fail here rather than only
    // in `npm run build`.
    it('imports without a syntax or module-resolution error', async () => {
        const mod = await import('./HiloGame.jsx')
        expect(typeof mod.default).toBe('function')
    })
})

it.each([
    { direction: 'higher', opposite: 'lower', edge: 13, roll: 0.99 },
    { direction: 'lower', opposite: 'higher', edge: 1, roll: 0 },
])('stops Auto at the $direction boundary and permits the opposite decision', async ({ direction, opposite, edge, roll }) => {
    fixture.rolls = [roll, 0.1, 0.4, 0.1]
    let panel = renderPanel()
    if (direction === 'lower') {
        findNode(panel, node => node.props?.options?.some(option => option.value === direction)).props.onChange(direction)
        panel = renderPanel()
    }
    tabButton(panel, 'auto').props.onClick()
    panel = renderPanel()
    findNode(panel, node => node.type === 'input' && node.props?.id?.endsWith('-auto-count'))
        .props.onChange({ target: { value: '3' } })
    panel = renderPanel()
    const auto = playButton(panel).props.onClick()
    expect(fixture.debit).toHaveBeenCalledTimes(1)
    expect(fixture.settle).toBeTypeOf('function')
    fixture.settle()
    panel = renderPanel() // publish the new boundary card to the retained Auto callback
    let stopped = false
    auto.then(() => { stopped = true })
    await vi.advanceTimersByTimeAsync(1000)
    // The bounded clock avoids hanging if an invalid decision is retried forever.

    expect(fixture.attempts).toHaveLength(2)
    expect(fixture.attempts[0].request).toMatchObject({ mode: 'auto', betAmount: 5 })
    expect(fixture.debit).toHaveBeenCalledTimes(1)
    expect(fixture.history).toHaveLength(1)
    expect(fixture.toast).toHaveBeenCalledWith('error', 'No winning cards', 'Choose other direction')
    expect(fixture.credit).toHaveBeenCalledTimes(1)
    expect(fixture.credit).toHaveBeenCalledWith(9.57, 'Hi-Lo return')
    expect(fixture.history[0]).toMatchObject({ profit: 4.57, betAmount: 5, meta: { current: { rank: 7 }, next: { rank: edge }, direction } })
    expect(fixture.attempts[1].result).toMatchObject({ kind: 'not-admitted', code: 'no-winning-cards', stopAuto: true })
    expect(vi.mocked(accountAutoRound)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(accountAutoRound).mock.results[1].value).toMatchObject({ accepted: false, state: { rounds: 1, refusals: 1 } })
    expect(stopped).toBe(true)

    panel = renderPanel()
    tabButton(panel, 'manual').props.onClick()
    panel = renderPanel()
    findNode(panel, node => node.props?.options?.some(option => option.value === opposite)).props.onChange(opposite)
    panel = renderPanel()
    const manual = playButton(panel).props.onClick()
    fixture.settle()
    await manual
    expect(fixture.debit).toHaveBeenCalledTimes(2)
    expect(fixture.history).toHaveLength(2)
    expect(fixture.history[1]).toMatchObject({ meta: { current: { rank: edge }, next: { rank: 6 }, direction: opposite } })
    expect(fixture.rolls).toHaveLength(0)
})

it('stops Auto without counting a refused debit and permits a later funded round', async () => {
    // The panel still displays 100 credits, but the wallet has already changed.
    let wallet = 4
    fixture.debit.mockImplementation(amount => {
        if (amount > wallet) return false
        wallet -= amount
        return true
    })
    fixture.credit.mockImplementation(amount => { wallet += amount })
    fixture.rolls = [0.99, 0.1]

    let panel = renderPanel({ stopFirstAuto: false })
    tabButton(panel, 'auto').props.onClick()
    panel = renderPanel({ stopFirstAuto: false })
    findNode(panel, node => node.type === 'input' && node.props?.id?.endsWith('-auto-count'))
        .props.onChange({ target: { value: '3' } })
    panel = renderPanel({ stopFirstAuto: false })
    expect(renderGame().props.panel.props.balance).toBe(100)
    const auto = playButton(panel).props.onClick()
    let stopped = false
    auto.then(() => { stopped = true })
    await vi.advanceTimersByTimeAsync(1000)

    expect(vi.mocked(accountAutoRound).mock.results[0].value).toMatchObject({
        accepted: false, state: { rounds: 0, refusals: 1, sessionProfit: 0 },
    })
    expect(fixture.attempts).toHaveLength(1)
    expect(fixture.attempts[0].result).toMatchObject({ kind: 'not-admitted', code: 'insufficient-funds', stopAuto: true })
    expect(fixture.debit).toHaveBeenCalledTimes(1)
    expect(fixture.debit).toHaveBeenCalledWith(5, 'Hi-Lo')
    expect(wallet).toBe(4)
    expect(fixture.credit).not.toHaveBeenCalled()
    expect(fixture.history).toHaveLength(0)
    expect(fixture.settle).toBeNull()
    expect(fixture.toast).toHaveBeenCalledWith('error', 'Not enough credits', 'Need GC 5.00')
    expect(stopped).toBe(true)

    wallet = 100
    panel = renderPanel({ stopFirstAuto: false })
    findNode(panel, node => node.type === 'input' && node.props?.id?.endsWith('-auto-count'))
        .props.onChange({ target: { value: '1' } })
    panel = renderPanel({ stopFirstAuto: false })
    const validAuto = playButton(panel).props.onClick()
    expect(wallet).toBe(95)
    expect(fixture.settle).toBeTypeOf('function')
    fixture.settle()
    await vi.advanceTimersByTimeAsync(1000)
    await validAuto

    expect(fixture.debit).toHaveBeenCalledTimes(2)
    expect(fixture.credit).toHaveBeenCalledWith(9.57, 'Hi-Lo return')
    expect(wallet).toBe(104.57)
    expect(fixture.history).toHaveLength(1)
    expect(fixture.history[0]).toMatchObject({ profit: 4.57, betAmount: 5, meta: { current: { rank: 7 }, next: { rank: 13 }, direction: 'higher' } })
    expect(vi.mocked(accountAutoRound)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(accountAutoRound).mock.results[1].value).toMatchObject({ accepted: true, state: { rounds: 1, refusals: 0 } })
})
