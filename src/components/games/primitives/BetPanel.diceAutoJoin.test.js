// QA027 (#30): the joined seam that neither half proves alone.
//
// `DiceGame.reveal.test.jsx` drives `performPlay` directly with a real wallet.
// `BetPanel.autoLoop.test.js` drives the real Auto loop against a stub `onPlay`.
// Neither shows that the Auto loop's per-round requests reconcile against Dice's
// actual debits and payouts. Historical hosted observation: three 1 GC Dice
// autoplay losses were recorded but only 1 GC was debited — a divergence between
// rounds played and rounds charged, which only the join can expose.
//
// Here the real BetPanel Auto CTA calls the real Dice `performPlay`, and every
// configured round is checked against the wallet and the history ledger.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({
    // BetPanel state slots (shared across renders so the panel keeps identity).
    panel: [], panelCursor: 0, refs: [], refCursor: 0, effects: [],
    // DiceGame state slots.
    states: [], diceCursor: 0, diceRefs: [], diceRefCursor: 0, diceEffects: [],
    balance: 100, debit: vi.fn(), credit: vi.fn(), record: vi.fn(), toast: vi.fn(), sound: vi.fn(), roll: 0.9,
}))

// One React mock serves both components: DiceGame uses the `states` slots,
// BetPanel uses the `panel` slots. Each render resets its own cursor.
vi.mock('react', async () => ({
    ...await vi.importActual('react'),
    useState(initial) {
        const store = fixture.inPanel ? fixture.panel : fixture.states
        const index = (fixture.inPanel ? fixture.panelCursor++ : fixture.diceCursor++)
        if (!(index in store)) store[index] = typeof initial === 'function' ? initial() : initial
        return [store[index], value => { store[index] = typeof value === 'function' ? value(store[index]) : value }]
    },
    useRef(initial) {
        const store = fixture.inPanel ? fixture.refs : fixture.diceRefs
        const index = (fixture.inPanel ? fixture.refCursor++ : fixture.diceRefCursor++)
        return store[index] ||= { current: initial }
    },
    useEffect(effect) { (fixture.inPanel ? fixture.effects : fixture.diceEffects).push(effect) },
    useLayoutEffect(effect) { (fixture.inPanel ? fixture.effects : fixture.diceEffects).push(effect) },
    useCallback(callback) { return callback },
    useMemo(callback) { return callback() },
    useId: () => 'test-panel',
}))

vi.mock('react-dom', () => ({ createPortal: node => node }))
vi.mock('../../../utils/scheduling', async original => ({
    ...await original(),
    // DiceGame schedules through this; run callbacks immediately so the reveal
    // completes inside the fake-timer run.
    useCancellableTimeouts: () => ({ schedule: (fn, delay) => globalThis.setTimeout(fn, delay), cancel: () => {} }),
}))
vi.mock('./HotkeyHelp', () => ({ isOpenDialogPresent: () => false }))
vi.mock('../../../context/CreditContext', () => ({ useCredits: () => ({ balance: fixture.balance, placeBet: fixture.debit, addWinnings: fixture.credit, showToast: fixture.toast }) }))
vi.mock('../../../audio/AudioProvider', () => ({ useAudio: () => ({ play: fixture.sound }) }))
vi.mock('../../../audio/useSfx', () => ({ useSfx: () => ({ play: fixture.sound }) }))
vi.mock('../../../audio/useBgm', () => ({ useGameBgm: () => {} }))
vi.mock('../../../utils/fairRng', () => ({ nextRoll: () => ({ roll: fixture.roll }) }))
vi.mock('../resources/useOriginalsPreloader', () => ({ useOriginalsPreloader: () => ({ ready: true }) }))

const { default: BetPanel } = await import('../primitives/BetPanel.jsx')
const { buildEvents, ROUND_EVENTS, useRoundMachine } = await import('../primitives/roundEvents')
vi.mock('../primitives', async () => {
    const Empty = () => null
    return {
        buildEvents: (...args) => buildEvents(...args), ROUND_EVENTS, useRoundMachine,
        getBigWinThreshold: () => 5,
        useGameSession: () => ({ record: fixture.record, history: [], stats: { lastResults: [] } }),
        GameShell: Empty, BetPanel: Empty, CoreStageFrame: Empty, BigWinOverlay: Empty,
        HistoryDrawer: Empty, RecentResultsStrip: Empty, StatsOverlay: Empty, SegmentedModeTabs: Empty,
        MultiplierBadge: Empty, ResultToast: Empty, ActionLockOverlay: Empty, SimBetStrip: Empty,
        makeInitialSimBetRows: () => [], makeSimBetRow: () => ({}), prependSimBetRow: () => [],
    }
})
const { default: DiceGame } = await import('../dice/DiceGame')

function find(node, predicate) {
    if (!node || typeof node !== 'object') return null
    if (predicate(node)) return node
    for (const child of [node.props?.panel, node.props?.secondary, ...[node.props?.children].flat(Infinity)]) {
        const match = find(child, predicate)
        if (match) return match
    }
    return null
}

function renderDice() {
    fixture.inPanel = false
    fixture.diceCursor = 0
    fixture.diceRefCursor = 0
    fixture.diceEffects = []
    const tree = DiceGame()
    fixture.diceCleanup = fixture.diceEffects.map(effect => effect()).filter(Boolean)
    return tree
}

// The real `performPlay` the game hands to its bet panel.
const diceOnPlay = () => renderDice().props.panel.props.onPlay

function renderPanel(props) {
    fixture.inPanel = true
    fixture.panelCursor = 0
    fixture.refCursor = 0
    return BetPanel({ balance: fixture.balance, minBet: 0.5, maxBet: 1000, initialBet: 1, autoIntervalMs: 0, ...props })
}

const tabButton = (tree, name) => find(tree, node =>
    node.type === 'button'
    && node.props?.className?.includes('bp-tab')
    && [node.props?.children].flat(Infinity).some(child => child?.props?.children === name))
const autoCountInput = tree => find(tree, node => node.type === 'input' && node.props?.id?.endsWith('-auto-count'))
const playButton = tree => find(tree, node => node.type === 'button' && node.props?.className?.includes('bp-play'))

beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    fixture.panel = []; fixture.refs = []; fixture.effects = []
    fixture.states = []; fixture.diceRefs = []; fixture.diceEffects = []
    fixture.roll = 0.9
    fixture.balance = 100
    fixture.debit.mockImplementation(amount => { if (amount > fixture.balance) return false; fixture.balance -= amount; return true })
    fixture.credit.mockImplementation(amount => { fixture.balance += amount })
    vi.stubGlobal('window', { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout })
})
afterEach(() => {
    if (typeof fixture.diceCleanup === 'function') fixture.diceCleanup()
    fixture.diceCleanup = null
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe('BetPanel Auto drives the real Dice wallet (QA027)', () => {
    it('debits and records exactly one round per configured Autoplay round', async () => {
        const onPlay = diceOnPlay()
        const rounds = 3

        let tree = renderPanel({ onPlay })
        tabButton(tree, 'auto').props.onClick()
        tree = renderPanel({ onPlay })
        autoCountInput(tree).props.onChange({ target: { value: String(rounds) } })
        tree = renderPanel({ onPlay })
        // The Auto loop awaits each round, so the reveal timers must advance while
        // the click is still in flight.
        const click = playButton(tree).props.onClick()
        await vi.advanceTimersByTimeAsync(5000 * rounds)
        await click

        // The Auto loop issued the configured rounds, and Dice charged for each.
        expect(onPlay).toBeTypeOf('function')
        expect(fixture.debit, 'every Auto round is debited').toHaveBeenCalledTimes(rounds)
        expect(fixture.debit.mock.calls.map(([amount]) => amount)).toEqual(Array(rounds).fill(1))
        // The historical defect was rounds recorded without a matching debit.
        expect(fixture.record, 'every Auto round is recorded').toHaveBeenCalledTimes(rounds)
        // Credits only accompany wins, and never exceed the rounds actually played.
        expect(fixture.credit.mock.calls.length).toBeLessThanOrEqual(rounds)
        expect(fixture.balance).toBeCloseTo(100 - 1 * rounds + fixture.credit.mock.calls.reduce((s, [a]) => s + a, 0), 2)
    })

    it('keeps wallet and history consistent across a mixed Auto run', async () => {
        const rolls = [0.9, 0.1, 0.9] // win, loss, win at Roll Over 50
        const onPlay = diceOnPlay()
        const rounds = rolls.length

        let tree = renderPanel({ onPlay })
        tabButton(tree, 'auto').props.onClick()
        tree = renderPanel({ onPlay })
        autoCountInput(tree).props.onChange({ target: { value: String(rounds) } })
        tree = renderPanel({ onPlay })

        const click = playButton(tree).props.onClick()
        for (const roll of rolls) {
            fixture.roll = roll
            await vi.advanceTimersByTimeAsync(2000)
        }
        await vi.runAllTimersAsync()
        await click

        const debited = fixture.debit.mock.calls.reduce((sum, [amount]) => sum + amount, 0)
        const credited = fixture.credit.mock.calls.reduce((sum, [amount]) => sum + amount, 0)
        const recordedProfit = fixture.record.mock.calls.reduce((sum, [entry]) => sum + entry.profit, 0)

        expect(fixture.balance).toBeCloseTo(100 - debited + credited, 2)
        // History must reconcile with the wallet, not with the number of clicks.
        expect(recordedProfit).toBeCloseTo(credited - debited, 2)
        expect(fixture.record).toHaveBeenCalledTimes(fixture.debit.mock.calls.length)
    })
})