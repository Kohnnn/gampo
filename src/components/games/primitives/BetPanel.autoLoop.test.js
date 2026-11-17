// QA021 (#30): drives the real Auto loop, not just `accountAutoRound`.
//
// Regression for a genuine crash: the loop destructured `sessionProfit` from
// `autoState` into a local binding that shadowed the `sessionProfit` ref, then
// wrote `sessionProfit.current`. In an ES module (strict mode) assigning a
// property on a number throws `TypeError`, so **every resolved Auto round threw**
// after the round had already been played and charged. `accountAutoRound` was
// correct throughout, which is exactly why a unit test of it could not catch it.
//
// The panel is rendered as a JSX element and driven through its own controls:
// every `useState` is shared across renders via the fixture, so flipping the tab
// and pressing Auto runs the genuine `handlePlay` closure and the genuine loop.
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'

const fixture = vi.hoisted(() => ({ state: [], cursor: 0, refs: [], refCursor: 0, effects: [] }))
vi.mock('react', async () => {
    const actual = await vi.importActual('react')
    return {
        ...actual,
        useState(initial) {
            const index = fixture.cursor++
            if (!(index in fixture.state)) fixture.state[index] = typeof initial === 'function' ? initial() : initial
            return [fixture.state[index], value => {
                fixture.state[index] = typeof value === 'function' ? value(fixture.state[index]) : value
            }]
        },
        useRef(initial) { const index = fixture.refCursor++; return fixture.refs[index] ||= { current: initial } },
        useEffect(effect) { fixture.effects.push(effect) },
        useLayoutEffect(effect) { fixture.effects.push(effect) },
        useCallback(callback) { return callback },
        useMemo(callback) { return callback() },
        useId: () => 'test-panel',
    }
})
vi.mock('react-dom', () => ({ createPortal: node => node }))
vi.mock('../../../utils/scheduling', () => ({ withTimeout: value => Promise.resolve(value).then(result => ({ timedOut: false, value: result })) }))
vi.mock('./HotkeyHelp', () => ({ isOpenDialogPresent: () => false }))

const { default: BetPanel } = await import('./BetPanel.jsx')

function find(node, predicate) {
    if (!node || typeof node !== 'object') return null
    if (predicate(node)) return node
    for (const child of [node.props?.panel, node.props?.secondary, ...[node.props?.children].flat(Infinity)]) {
        const match = find(child, predicate)
        if (match) return match
    }
    return null
}

// A render reuses the same state/ref slots, so the panel keeps its identity.
function render(props) {
    fixture.cursor = 0
    fixture.refCursor = 0
    return BetPanel({ balance: 1000, minBet: 0.5, maxBet: 1000, initialBet: 5, autoIntervalMs: 0, ...props })
}

const tabButton = (tree, name) => find(tree, node =>
    node.type === 'button'
    && node.props?.className?.includes('bp-tab')
    && [node.props?.children].flat(Infinity).some(child => child?.props?.children === name))
const autoCountInput = tree => find(tree, node => node.type === 'input' && node.props?.id?.endsWith('-auto-count'))
const playButton = tree => find(tree, node => node.type === 'button' && node.props?.className?.includes('bp-play'))

// Switch to Auto and set the round count through the real controls, then press
// the real CTA. Returns the settled click result.
async function runAuto({ onPlay, count = 1 }) {
    let tree = render({ onPlay })
    tabButton(tree, 'auto').props.onClick()
    tree = render({ onPlay })
    autoCountInput(tree).props.onChange({ target: { value: String(count) } })
    tree = render({ onPlay })
    const button = playButton(tree)
    expect(button, 'Auto play control must exist').toBeTruthy()
    return button.props.onClick()
}

beforeEach(() => {
    fixture.state = []; fixture.cursor = 0; fixture.refs = []; fixture.refCursor = 0; fixture.effects = []
})

describe('Auto loop reconciles a resolved round', () => {
    it('plays through the Auto path and settles without throwing', async () => {
        const onPlay = vi.fn(async () => ({ kind: 'committed', profit: 2 }))
        await expect(runAuto({ onPlay, count: 1 })).resolves.toBeUndefined()
        // Proves the Auto branch ran rather than the manual one.
        expect(onPlay).toHaveBeenCalledTimes(1)
        expect(onPlay.mock.calls[0][0]).toMatchObject({ mode: 'auto' })
    })

    it('retries a refusal without spending the configured count, and stops on a terminal kind', async () => {
        // Admission may recover without spending a configured round.
        const onPlay = vi.fn()
            .mockResolvedValueOnce({ kind: 'rejected', code: 'active-obligation', profit: 0 })
            .mockResolvedValueOnce({ kind: 'committed', profit: 1 })
        await expect(runAuto({ onPlay, count: 1 })).resolves.toBeUndefined()
        expect(onPlay).toHaveBeenCalledTimes(2)
        for (const [request] of onPlay.mock.calls) expect(request).toMatchObject({ mode: 'auto' })
    })

    it('stops on insufficient funds even before the wallet rerenders', async () => {
        const onPlay = vi.fn(async () => ({ kind: 'rejected', code: 'insufficient-funds', profit: 0 }))
        await runAuto({ onPlay, count: 5 })
        expect(onPlay).toHaveBeenCalledTimes(1)
    })

    it('checks the latest non-ticket wallet before issuing another round', async () => {
        const onPlay = vi.fn(async () => {
            render({ balance: 0, onPlay })
            return { kind: 'committed', profit: -5 }
        })
        await runAuto({ onPlay, count: 5 })
        expect(onPlay).toHaveBeenCalledTimes(1)
    })

    it('uses the replacement game callback for the next accepted Auto round', async () => {
        let resolveFirst
        const firstRound = new Promise(resolve => { resolveFirst = resolve })
        const initialPlay = vi.fn(() => firstRound)
        const replacementPlay = vi.fn(async () => ({ kind: 'committed', profit: 2 }))
        const autoRun = runAuto({ onPlay: initialPlay, count: 2 })
        expect(initialPlay).toHaveBeenCalledTimes(1)
        render({ onPlay: replacementPlay })
        expect(replacementPlay).not.toHaveBeenCalled()
        resolveFirst({ kind: 'committed', profit: -5 })
        await expect(autoRun).resolves.toBeUndefined()
        expect(initialPlay.mock.calls).toEqual([[{ betAmount: 5, mode: 'auto' }]])
        expect(replacementPlay.mock.calls).toEqual([[{ betAmount: 5, mode: 'auto' }]])
    })

    it('stops the loop on an `aborted` round instead of retrying it forever', async () => {
        const onPlay = vi.fn(async () => ({ kind: 'aborted', profit: 0 }))
        await expect(runAuto({ onPlay, count: 5 })).resolves.toBeUndefined()
        expect(onPlay).toHaveBeenCalledTimes(1)
    })

    it('stops on the configured loss limit without issuing another round', async () => {
        const onPlay = vi.fn(async () => ({ kind: 'committed', profit: -5 }))
        let tree = render({ onPlay })
        tabButton(tree, 'auto').props.onClick()
        tree = render({ onPlay })
        find(tree, node => node.type === 'input' && node.props?.id?.endsWith('-stop-loss')).props.onChange({ target: { value: '5' } })
        tree = render({ onPlay })
        await playButton(tree).props.onClick()
        expect(onPlay).toHaveBeenCalledTimes(1)
    })

    it('stops at the profit limit after two committed Auto rounds', async () => {
        const interval = 61387
        const nativeSetTimeout = globalThis.setTimeout
        let notifyTimer, notifyExtraTimer
        const timerRegistered = new Promise(resolve => { notifyTimer = resolve })
        const extraTimerRegistered = new Promise(resolve => { notifyExtraTimer = resolve })
        const timerSpy = vi.spyOn(globalThis, 'setTimeout')
        onTestFinished(() => timerSpy.mockRestore())
        timerSpy.mockImplementation((callback, delay, ...args) => {
            if (delay !== interval) return nativeSetTimeout(callback, delay, ...args)
            if (notifyTimer) {
                notifyTimer(() => callback(...args))
                notifyTimer = undefined
            } else {
                notifyExtraTimer()
            }
            return 0
        })

        const onPlay = vi.fn(async () => ({ kind: 'committed', profit: 5 }))
        const props = { onPlay, autoIntervalMs: interval }
        let tree = render(props)
        tabButton(tree, 'auto').props.onClick()
        tree = render(props)
        autoCountInput(tree).props.onChange({ target: { value: '3' } })
        find(tree, node => node.type === 'input' && node.props?.id?.endsWith('-stop-profit')).props.onChange({ target: { value: '9' } })
        tree = render(props)
        const autoRun = playButton(tree).props.onClick()
        const releaseCadence = await Promise.race([
            timerRegistered,
            autoRun.then(() => { throw new Error('Auto run stopped before its first cadence') }),
        ])
        expect(onPlay.mock.calls).toEqual([[{ betAmount: 5, mode: 'auto' }]])
        expect(playButton(render(props)).props.className).toContain('stop')

        releaseCadence()
        expect(await Promise.race([
            autoRun.then(() => 'stopped'),
            extraTimerRegistered.then(() => 'unexpected cadence'),
        ])).toBe('stopped')
        await expect(autoRun).resolves.toBeUndefined()
        expect(onPlay.mock.calls).toEqual([
            [{ betAmount: 5, mode: 'auto' }],
            [{ betAmount: 5, mode: 'auto' }],
        ])
        expect(playButton(render(props)).props.className).not.toContain('stop')
    })

    it('keeps a stopped run from settling into the Auto run started after it', async () => {
        let releaseStopped, releaseReplacement
        const stoppedRound = new Promise(resolve => { releaseStopped = resolve })
        const replacementRound = new Promise(resolve => { releaseReplacement = resolve })
        const stoppedPlay = vi.fn(() => stoppedRound)
        const replacementPlay = vi.fn()
            .mockImplementationOnce(() => replacementRound)
            .mockResolvedValue({ kind: 'committed', profit: 1 })

        const stoppedRun = runAuto({ onPlay: stoppedPlay, count: 2 })
        expect(stoppedPlay).toHaveBeenCalledTimes(1)
        // Stop while A is pending, then start B through the same control.
        playButton(render({ onPlay: stoppedPlay })).props.onClick()
        const replacementRun = playButton(render({ onPlay: replacementPlay })).props.onClick()
        expect(replacementPlay).toHaveBeenCalledTimes(1)
        releaseStopped({ kind: 'committed', profit: 5 })
        await expect(stoppedRun).resolves.toBeUndefined()
        expect(stoppedPlay.mock.calls).toEqual([[{ betAmount: 5, mode: 'auto' }]])
        expect(replacementPlay).toHaveBeenCalledTimes(1)
        expect(playButton(render({ onPlay: replacementPlay })).props.className).toContain('stop')

        releaseReplacement({ kind: 'committed', profit: 1 })
        await expect(replacementRun).resolves.toBeUndefined()
        expect(replacementPlay.mock.calls).toEqual([
            [{ betAmount: 5, mode: 'auto' }],
            [{ betAmount: 5, mode: 'auto' }],
        ])
        expect(playButton(render({ onPlay: replacementPlay })).props.className).not.toContain('stop')
    })

    it.each([
        { boundary: 'refusal retry', stoppedResult: { kind: 'rejected', code: 'active-obligation', profit: 0 } },
        { boundary: 'accepted cadence', stoppedResult: { kind: 'committed', profit: 5 } },
    ])('does not let a stopped $boundary enter the replacement Auto run', async ({ stoppedResult }) => {
        // A has finished its round and registered a retry or accepted-round
        // cadence. Losing either post-delay runId check would let A use B's
        // live callback and consume B's shared remaining count.
        const interval = 61387
        const nativeSetTimeout = globalThis.setTimeout
        const scheduled = []
        let notifyTimer
        const nextTimer = () => new Promise(resolve => { notifyTimer = resolve })
        const waitForTimer = (registration, run, label) => Promise.race([
            registration,
            run.then(() => { throw new Error(`${label} ended before its timer was registered`) }),
        ])
        const timerSpy = vi.spyOn(globalThis, 'setTimeout')
        onTestFinished(() => timerSpy.mockRestore())
        timerSpy.mockImplementation((callback, delay, ...args) => {
            if (delay !== interval) return nativeSetTimeout(callback, delay, ...args)
            const release = () => callback(...args)
            scheduled.push(release)
            const notify = notifyTimer
            notifyTimer = undefined
            if (notify) notify(release)
            return 0
        })

        let releaseStopped, releaseReplacement, notifyExtraPlay
        const stoppedRound = new Promise(resolve => { releaseStopped = resolve })
        const replacementRound = new Promise(resolve => { releaseReplacement = resolve })
        const extraPlay = new Promise(resolve => { notifyExtraPlay = resolve })
        const stoppedPlay = vi.fn(() => stoppedRound)
        const replacementPlay = vi.fn()
            .mockImplementationOnce(() => replacementRound)
            .mockImplementation(() => {
                notifyExtraPlay()
                return Promise.resolve({ kind: 'committed', profit: 1 })
            })
        const stoppedProps = { onPlay: stoppedPlay, autoIntervalMs: interval }
        const replacementProps = { onPlay: replacementPlay, autoIntervalMs: interval }

        let tree = render(stoppedProps)
        tabButton(tree, 'auto').props.onClick()
        tree = render(stoppedProps)
        autoCountInput(tree).props.onChange({ target: { value: '2' } })
        tree = render(stoppedProps)
        const stoppedTimerRegistered = nextTimer()
        const stoppedRun = playButton(tree).props.onClick()
        const stoppedTimerWait = waitForTimer(stoppedTimerRegistered, stoppedRun, 'Stopped run')
        expect(stoppedPlay).toHaveBeenCalledTimes(1)
        releaseStopped(stoppedResult)
        const releaseStoppedTimer = await stoppedTimerWait
        expect(scheduled).toHaveLength(1)

        // Stop A only after its timer is registered; B's first round stays pending.
        playButton(render(stoppedProps)).props.onClick()
        const replacementRun = playButton(render(replacementProps)).props.onClick()
        const replacementSettled = vi.fn()
        replacementRun.then(replacementSettled, replacementSettled)
        expect(replacementPlay).toHaveBeenCalledTimes(1)
        const ownershipResult = Promise.race([
            stoppedRun.then(() => 'stopped'),
            extraPlay.then(() => 'extra request'),
        ])
        releaseStoppedTimer()
        expect(await ownershipResult).toBe('stopped')
        await expect(stoppedRun).resolves.toBeUndefined()
        expect(stoppedPlay.mock.calls).toEqual([[{ betAmount: 5, mode: 'auto' }]])
        expect(replacementPlay.mock.calls).toEqual([[{ betAmount: 5, mode: 'auto' }]])
        expect(replacementSettled).not.toHaveBeenCalled()
        expect(playButton(render(replacementProps)).props.className).toContain('stop')
        expect(scheduled).toHaveLength(1)

        // Subscribe before each accepted-round timer is registered, and
        // release those timers individually to finish B's configured count.
        const firstTimerRegistered = nextTimer()
        const firstTimerWait = waitForTimer(firstTimerRegistered, replacementRun, 'Replacement run (first round)')
        releaseReplacement({ kind: 'committed', profit: 1 })
        const releaseFirstTimer = await firstTimerWait
        const secondTimerRegistered = nextTimer()
        const secondTimerWait = waitForTimer(secondTimerRegistered, replacementRun, 'Replacement run (second round)')
        releaseFirstTimer()
        const releaseSecondTimer = await secondTimerWait
        expect(scheduled).toHaveLength(3)
        releaseSecondTimer()
        await expect(replacementRun).resolves.toBeUndefined()
        expect(replacementPlay.mock.calls).toEqual([
            [{ betAmount: 5, mode: 'auto' }],
            [{ betAmount: 5, mode: 'auto' }],
        ])
        expect(playButton(render(replacementProps)).props.className).not.toContain('stop')
    })

    it('surfaces a throwing round instead of silently swallowing it', async () => {
        const onPlay = vi.fn(async () => { throw new Error('round exploded') })
        await expect(runAuto({ onPlay, count: 1 })).rejects.toThrow('round exploded')
    })
})
