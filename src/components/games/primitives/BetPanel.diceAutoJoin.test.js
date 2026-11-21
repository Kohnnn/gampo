// QA027 (#30): the joined seam that neither half proves alone.
//
// `DiceGame.reveal.test.jsx` drives `performPlay` directly with wallet spies.
// `BetPanel.autoLoop.test.js` drives the real Auto loop against a stub `onPlay`.
// Neither shows that the Auto loop's per-round requests reconcile against Dice's
// actual debits and payouts. Historical hosted observation: three 1 GC Dice
// autoplay losses were recorded but only 1 GC was debited — a divergence between
// rounds played and rounds charged, which only the join can expose.
//
// The real Auto CTA calls Dice's real `performPlay`, with fake timers, a
// mount-effect fixture, and in-memory wallet/history collaborators.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({
    hooks: null, games: [],
    balance: 100, debit: vi.fn(), credit: vi.fn(), record: vi.fn(), toast: vi.fn(), sound: vi.fn(), roll: 0.9, rolls: [],
}))

vi.mock('react', async () => ({
    ...await vi.importActual('react'),
    useState(initial) {
        const hooks = fixture.hooks
        const store = hooks.states
        const index = hooks.stateCursor++
        if (!(index in store)) store[index] = typeof initial === 'function' ? initial() : initial
        return [store[index], value => { store[index] = typeof value === 'function' ? value(store[index]) : value }]
    },
    useRef(initial) {
        const hooks = fixture.hooks
        return hooks.refs[hooks.refCursor++] ||= { current: initial }
    },
    useEffect(effect) { fixture.hooks.effects.push(effect) },
    useLayoutEffect(effect) { fixture.hooks.effects.push(effect) },
    useCallback(callback) { return callback },
    useMemo(callback) { return callback() },
    useId: () => 'test-panel',
}))

vi.mock('react-dom', () => ({ createPortal: node => node }))
vi.mock('./HotkeyHelp', () => ({ isOpenDialogPresent: () => false }))
vi.mock('../../../context/CreditContext', () => ({ useCredits: () => ({ balance: fixture.balance, placeBet: fixture.debit, addWinnings: fixture.credit, showToast: fixture.toast }) }))
vi.mock('../../../audio/AudioProvider', () => ({ useAudio: () => ({ play: fixture.sound }) }))
vi.mock('../../../audio/useSfx', () => ({ useSfx: () => ({ play: fixture.sound }) }))
vi.mock('../../../audio/useBgm', () => ({ useGameBgm: () => {} }))
vi.mock('../../../utils/fairRng', () => ({ nextRoll: () => ({ roll: fixture.rolls.length ? fixture.rolls.shift() : fixture.roll }) }))
vi.mock('../resources/useOriginalsPreloader', () => ({ useOriginalsPreloader: () => ({ ready: true }) }))

const { default: BetPanel } = await import('../primitives/BetPanel.jsx')
const { buildEvents, ROUND_EVENTS, useRoundMachine } = await import('../primitives/roundEvents')
vi.mock('../primitives', async () => {
    const Empty = () => null
    return {
        buildEvents: (...args) => buildEvents(...args), ROUND_EVENTS, useRoundMachine,
        getBigWinThreshold: () => 5,
        useGameSession: () => ({ record: fixture.record, history: [], stats: { lastResults: [] } }),
        GameShell: Empty, BetPanel, CoreStageFrame: Empty, BigWinOverlay: Empty,
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

function createComponent(Component) {
    const hooks = { states: [], refs: [], effects: [], stateCursor: 0, refCursor: 0 }
    const cleanups = []
    let mounted = false
    return {
        render(props) {
            hooks.stateCursor = 0
            hooks.refCursor = 0
            hooks.effects = []
            fixture.hooks = hooks
            let tree
            try {
                tree = Component(props)
            } finally {
                fixture.hooks = null
            }
            if (!mounted) {
                mounted = true
                for (const effect of hooks.effects) {
                    const cleanup = effect()
                    if (typeof cleanup === 'function') cleanups.push(cleanup)
                }
            }
            return tree
        },
        unmount() {
            for (const cleanup of cleanups.splice(0)) cleanup()
        },
    }
}

function mountGame() {
    const dice = createComponent(DiceGame)
    const panel = createComponent(BetPanel)
    const onPlay = vi.fn(function (request) { return this.onPlay(request) })
    const onStop = vi.fn()
    const game = {
        onPlay,
        onStop,
        render(options) {
            const props = dice.render().props.panel.props
            return panel.render({ ...props, ...options, onPlay: onPlay.bind(props), onStop })
        },
        unmount() {
            dice.unmount()
            panel.unmount()
        },
    }
    fixture.games.push(game)
    return game
}

const tabButton = (tree, name) => find(tree, node =>
    node.type === 'button'
    && node.props?.className?.includes('bp-tab')
    && [node.props?.children].flat(Infinity).some(child => child?.props?.children === name))
const input = (tree, name) => find(tree, node => node.type === 'input' && node.props?.id?.endsWith(`-${name}`))
const playButton = tree => find(tree, node => node.type === 'button' && node.props?.className?.includes('bp-play'))

function startAuto(game, { count, stopProfit = '', autoTimeoutMs }) {
    const tree = game.render()
    tabButton(tree, 'auto').props.onClick()
    const settings = game.render()
    input(settings, 'bet-amount').props.onChange({ target: { value: '1' } })
    input(settings, 'auto-count').props.onChange({ target: { value: String(count) } })
    input(settings, 'stop-profit').props.onChange({ target: { value: String(stopProfit) } })
    const button = playButton(game.render({ autoTimeoutMs }))
    expect(button.props.disabled).toBeFalsy()
    return button.props.onClick()
}

const autoRequest = [{ betAmount: 1, mode: 'auto' }]

function expectThreeWinningRounds() {
    expect(fixture.debit.mock.calls).toEqual(Array(3).fill([1, 'Dice']))
    expect(fixture.credit.mock.calls).toEqual(Array(3).fill([1.98, 'Dice return']))
    const entries = fixture.record.mock.calls.map(([entry]) => entry)
    expect(entries).toEqual(['5.00', '10.00', '20.00'].map(label =>
        expect.objectContaining({ label, betAmount: 1, profit: 0.98, multiplier: 1.98 })))
    expect(new Set(entries.map(entry => entry.id)).size).toBe(3)
    expect(fixture.balance).toBeCloseTo(102.94, 2)
}

beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    fixture.roll = 0.9
    fixture.rolls = []
    fixture.balance = 100
    fixture.debit.mockImplementation(amount => { if (amount > fixture.balance) return false; fixture.balance -= amount; return true })
    fixture.credit.mockImplementation(amount => { fixture.balance += amount })
    vi.stubGlobal('window', { setTimeout, clearTimeout, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    vi.stubGlobal('document', { body: {}, documentElement: {} })
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '#00e701' }))
})
afterEach(() => {
    for (const game of fixture.games.splice(0)) game.unmount()
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('BetPanel Auto reconciles Dice wallet and history callbacks (QA027)', () => {
    it('debits and records exactly one round per configured Autoplay round', async () => {
        const game = mountGame()
        const rounds = 3

        const click = startAuto(game, { count: rounds })
        await vi.runAllTimersAsync()
        await click

        // The Auto loop issued the configured rounds, and Dice charged for each.
        expect(game.onPlay.mock.calls).toEqual(Array(rounds).fill(autoRequest))
        expect(fixture.debit, 'every Auto round is debited').toHaveBeenCalledTimes(rounds)
        expect(fixture.debit.mock.calls.map(([amount]) => amount)).toEqual(Array(rounds).fill(1))
        // The historical defect was rounds recorded without a matching debit.
        expect(fixture.record, 'every Auto round is recorded').toHaveBeenCalledTimes(rounds)
        expect(fixture.credit).not.toHaveBeenCalled()
        expect(fixture.balance).toBe(97)
    })

    it('keeps wallet and history consistent across a mixed Auto run', async () => {
        // The click starts the first roll synchronously, so queue the RNG values
        // first: the DiceGame default is Roll Under 50, so 0.9 loses, 0.1 wins at
        // 1.98x, 0.9 loses.
        fixture.rolls = [0.9, 0.1, 0.9]
        const rounds = fixture.rolls.length
        const game = mountGame()
        const click = startAuto(game, { count: rounds })
        await vi.runAllTimersAsync()
        await click

        expect(game.onPlay.mock.calls).toEqual(Array(rounds).fill(autoRequest))
        expect(fixture.debit, 'every Auto round is debited 1 GC').toHaveBeenCalledTimes(rounds)
        expect(fixture.debit.mock.calls.map(([amount]) => amount)).toEqual([1, 1, 1])
        expect(fixture.record, 'every Auto round is recorded').toHaveBeenCalledTimes(rounds)
        // Exactly one payout, for the single winning roll.
        expect(fixture.credit).toHaveBeenCalledTimes(1)
        expect(fixture.credit).toHaveBeenCalledWith(1.98, 'Dice return')
        expect(fixture.record.mock.calls.map(([entry]) => entry.profit), 'history profits per round').toEqual([-1, 0.98, -1])
        expect(fixture.balance, 'wallet settles at 100 - 3 + 1.98').toBeCloseTo(98.98, 2)

        const debited = fixture.debit.mock.calls.reduce((sum, [amount]) => sum + amount, 0)
        const credited = fixture.credit.mock.calls.reduce((sum, [amount]) => sum + amount, 0)
        const recordedProfit = fixture.record.mock.calls.reduce((sum, [entry]) => sum + entry.profit, 0)
        // History must reconcile with the wallet, not with the number of clicks.
        expect(recordedProfit).toBeCloseTo(credited - debited, 2)
    })

    it('uses updated Dice odds for the next Auto round and reconciles wallet and history', async () => {
        fixture.rolls = [0.7, 0.7]
        const game = mountGame()
        const run = startAuto(game, { count: 2 })

        await vi.advanceTimersByTimeAsync(980)
        expect(fixture.debit).toHaveBeenCalledExactlyOnceWith(1, 'Dice')
        expect(fixture.record).toHaveBeenCalledTimes(1)

        tabButton(game.render(), 'manual').props.onClick()
        const winChance = input(game.render(), 'win-chance')
        expect(winChance.props).toMatchObject({ value: 50, disabled: false })
        winChance.props.onChange({ target: { value: '75' } })
        const updated = game.render()
        expect(input(updated, 'win-chance').props.value).toBe(75)
        tabButton(updated, 'auto').props.onClick()
        expect(playButton(game.render()).props.className).toContain('stop')

        await vi.runAllTimersAsync()
        await run

        expect(fixture.record.mock.calls.map(([entry]) => entry)).toEqual([
            expect.objectContaining({ label: '70.00', betAmount: 1, profit: -1, multiplier: 0, meta: { winChance: 50, rollMode: 'under' } }),
            expect.objectContaining({ label: '70.00', betAmount: 1, profit: 0.32, multiplier: 1.32, meta: { winChance: 75, rollMode: 'under' } }),
        ])
        expect(game.onPlay.mock.calls).toEqual([autoRequest, autoRequest])
        expect(fixture.debit.mock.calls).toEqual([[1, 'Dice'], [1, 'Dice']])
        expect(fixture.credit).toHaveBeenCalledExactlyOnceWith(1.32, 'Dice return')
        expect(fixture.balance).toBeCloseTo(99.32, 2)
    })

    it.each([
        { boundary: 'an owned timeout', autoTimeoutMs: 100, manualStop: false },
        { boundary: 'a stopped run timing out after restart', autoTimeoutMs: 970, manualStop: true },
    ])('keeps late Dice results out of replacement accounting after $boundary', async ({ autoTimeoutMs, manualStop }) => {
        fixture.rolls = [0.05, 0.1, 0.2]
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const game = mountGame()
        const originalFinished = vi.fn()
        const original = startAuto(game, { count: 3, autoTimeoutMs })
        original.then(originalFinished, originalFinished)
        expect(game.onPlay.mock.calls).toEqual([autoRequest])
        const lateResult = vi.fn()
        game.onPlay.mock.results[0].value.then(lateResult)

        await vi.advanceTimersByTimeAsync(100)
        if (manualStop) await playButton(game.render()).props.onClick()
        const stopCallsAt100Ms = game.onStop.mock.calls.length
        expect(fixture.debit).toHaveBeenCalledExactlyOnceWith(1, 'Dice')
        expect(fixture.record).not.toHaveBeenCalled()
        expect(lateResult).not.toHaveBeenCalled()

        // Dice unlocks at 960 ms, 20 ms before its accepted callback resolves.
        await vi.advanceTimersByTimeAsync(860)
        expect(game.onPlay.mock.calls).toEqual([autoRequest])
        expect(stopCallsAt100Ms).toBe(1)
        expect(game.onStop).toHaveBeenCalledTimes(1)
        expect(originalFinished).toHaveBeenCalledTimes(manualStop ? 0 : 1)
        expect(lateResult).not.toHaveBeenCalled()
        expect(fixture.record).toHaveBeenCalledTimes(1)
        expect(fixture.credit).toHaveBeenCalledExactlyOnceWith(1.98, 'Dice return')
        const replacement = startAuto(game, { count: 2, stopProfit: 1.5 })
        expect(game.onPlay.mock.calls).toEqual([autoRequest, autoRequest])
        await expect(game.onPlay.mock.results[1].value).resolves.toMatchObject({ kind: 'rejected', code: 'active-obligation' })

        await vi.advanceTimersByTimeAsync(20)
        await expect(original).resolves.toBeUndefined()
        expect(lateResult).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
            kind: 'committed', profit: 0.98, id: fixture.record.mock.calls[0][0].id,
        }))
        expect(game.onPlay.mock.calls).toEqual([autoRequest, autoRequest])
        expect(fixture.debit).toHaveBeenCalledExactlyOnceWith(1, 'Dice')
        expect(fixture.credit).toHaveBeenCalledExactlyOnceWith(1.98, 'Dice return')
        expect(fixture.record).toHaveBeenCalledTimes(1)
        expect(game.onStop).toHaveBeenCalledTimes(1)
        expect(playButton(game.render()).props.className).toContain('stop')
        expect(warn.mock.calls).toEqual(manualStop ? [] : [['[BetPanel] autoplay round timed out after', 100, 'ms']])

        await vi.advanceTimersByTimeAsync(1080)
        expect(game.onPlay.mock.calls).toEqual(Array(3).fill(autoRequest))
        expect(fixture.record).toHaveBeenCalledTimes(2)
        expect(game.onStop).toHaveBeenCalledTimes(1)
        expect(playButton(game.render()).props.className).toContain('stop')
        await vi.runAllTimersAsync()
        await replacement
        expect(game.onPlay.mock.calls).toEqual(Array(4).fill(autoRequest))
        expect(game.onStop).toHaveBeenCalledTimes(2)
        expect(playButton(game.render()).props.className).not.toContain('stop')
        expectThreeWinningRounds()
    })

    it('settles pending Dice once on unmount and gives the remount its own count and profit', async () => {
        fixture.rolls = [0.05, 0.1, 0.2]
        const original = mountGame()
        const originalRun = startAuto(original, { count: 3 })
        expect(original.onPlay.mock.calls).toEqual([autoRequest])
        const pendingResult = original.onPlay.mock.results[0].value
        await vi.advanceTimersByTimeAsync(100)
        expect(fixture.debit).toHaveBeenCalledExactlyOnceWith(1, 'Dice')
        expect(fixture.record).not.toHaveBeenCalled()
        expect(fixture.credit).not.toHaveBeenCalled()

        original.unmount()
        const replacement = mountGame()
        const replacementRun = startAuto(replacement, { count: 2, stopProfit: 1.5 })
        expect(fixture.record).toHaveBeenCalledTimes(1)
        expect(fixture.credit).toHaveBeenCalledExactlyOnceWith(1.98, 'Dice return')
        await expect(pendingResult).resolves.toMatchObject({
            kind: 'committed', profit: 0.98, id: fixture.record.mock.calls[0][0].id,
        })
        await vi.advanceTimersByTimeAsync(120)
        expect({
            original: original.onPlay.mock.calls,
            replacement: replacement.onPlay.mock.calls,
            debits: fixture.debit.mock.calls,
        }).toEqual({
            original: [autoRequest],
            replacement: [autoRequest],
            debits: [[1, 'Dice'], [1, 'Dice']],
        })
        expect(fixture.record).toHaveBeenCalledTimes(1)
        expect(fixture.credit).toHaveBeenCalledExactlyOnceWith(1.98, 'Dice return')
        expect(original.onStop).not.toHaveBeenCalled()
        await expect(originalRun).resolves.toBeUndefined()

        await vi.advanceTimersByTimeAsync(860)
        expect(replacement.onPlay.mock.calls).toEqual([autoRequest])
        expect(fixture.record).toHaveBeenCalledTimes(2)
        expect(replacement.onStop).not.toHaveBeenCalled()
        expect(playButton(replacement.render()).props.className).toContain('stop')
        await vi.runAllTimersAsync()
        await replacementRun
        expect(original.onPlay.mock.calls).toEqual([autoRequest])
        expect(replacement.onPlay.mock.calls).toEqual([autoRequest, autoRequest])
        expect(replacement.onStop).toHaveBeenCalledTimes(1)
        expect(playButton(replacement.render()).props.className).not.toContain('stop')
        expectThreeWinningRounds()
    })
})
