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
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

    it('surfaces a throwing round instead of silently swallowing it', async () => {
        const onPlay = vi.fn(async () => { throw new Error('round exploded') })
        await expect(runAuto({ onPlay, count: 1 })).rejects.toThrow('round exploded')
    })
})
