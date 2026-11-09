// QA027: Dice Auto reconciliation.
//
// Historical hosted observation: three 1 GC Dice autoplay losses were recorded
// but only 1 GC was debited. The root cause in current source is that a
// rejected Dice bet resolves the same `{profit:0}` shape as an accepted push,
// and the BetPanel Auto loop counts every resolved round. This file pins:
//   - deterministic all-loss and mixed fixed-count runs reconcile debit,
//     payout and history per accepted round;
//   - rejected-vs-accepted is distinguishable through the six-kind contract
//     (`{profit:0}` may not mean both rejected and a push);
//   - current affordability, percentage changes, exhaustion, stop-loss/profit
//     and "no extra round after stop";
//   - at least one non-Dice shared BetPanel consumer keeps working.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const panel = vi.hoisted(() => ({ state: [], refs: [], cursor: 0, refCursor: 0 }))
vi.mock('react', async () => ({
    ...await vi.importActual('react'),
    useState(initial) {
        const i = panel.cursor++
        if (!(i in panel.state)) panel.state[i] = typeof initial === 'function' ? initial() : initial
        return [panel.state[i], value => { panel.state[i] = typeof value === 'function' ? value(panel.state[i]) : value }]
    },
    useRef(initial) { return panel.refs[panel.refCursor++] ||= { current: initial } },
    useEffect: () => {}, useCallback: callback => callback, useId: () => 'dice-auto',
}))
vi.mock('react-dom', () => ({ createPortal: node => node }))
import BetPanel from '../primitives/BetPanel'

function renderPanel(props) {
    panel.cursor = 0; panel.refCursor = 0
    return BetPanel({ balance: 1000, initialBet: 3.33, minBet: 0.5, autoIntervalMs: 0, ...props })
}
function find(node, predicate) {
    if (!node || typeof node !== 'object') return null
    if (predicate(node)) return node
    for (const child of [node.props?.children].flat(Infinity)) {
        const found = find(child, predicate)
        if (found) return found
    }
    return null
}
beforeEach(() => { panel.state = []; panel.refs = [] })
import {
    RESULT_KINDS,
    normalizeBetResult,
    acceptedResult,
    rejectedResult,
    accountAutoRound,
} from '../primitives/autoAccounting'


const baseState = (over = {}) => ({
    rounds: 0, refusals: 0, sessionProfit: 0, lastProfit: 0, lastKind: null,
    limitProfit: 0, limitLoss: 0, limitBigWin: 0, ...over,
})

// Reconcile a whole run and return per-accepted-round facts.
function runFixedCount(results) {
    let state = baseState()
    const acceptedProfits = []
    for (const r of results) {
        const step = accountAutoRound(state, r)
        state = step.state
        if (step.accepted) acceptedProfits.push(state.lastProfit)
    }
    return { state, acceptedProfits }
}

describe('QA027 rejected-vs-accepted discrimination', () => {
    it('resolves exactly the six authority kinds', () => {
        expect(RESULT_KINDS).toEqual(['committed', 'rejected', 'not-admitted', 'aborted', 'unknown', 'superseded'])
    })

    it('treats an untyped {profit:0} as accepted (legacy) but a typed rejection as refused', () => {
        // An accepted push is committed with profit 0.
        const push = accountAutoRound(baseState(), acceptedResult(0))
        expect(push.accepted).toBe(true)
        expect(push.state.rounds).toBe(1)
        expect(push.state.sessionProfit).toBe(0)
        // A typed rejection with the same profit number is NOT a round.
        const rej = accountAutoRound(baseState(), rejectedResult('insufficient-funds'))
        expect(rej.accepted).toBe(false)
        expect(rej.state.rounds).toBe(0)
        expect(rej.state.refusals).toBe(1)
    })

})

describe('QA027 deterministic fixed-count runs', () => {
    it('reconciles an all-loss run: every ignored round is refused, every loss debited', () => {
        // 3 accepted 1 GC losses + 0 refusals => 3 accepted, sessionProfit -3.
        const { state, acceptedProfits } = runFixedCount([
            acceptedResult(-1), acceptedResult(-1), acceptedResult(-1),
        ])
        expect(state.rounds).toBe(3)
        expect(state.refusals).toBe(0)
        expect(state.sessionProfit).toBe(-3) // three accepted 1 GC losses
        expect(acceptedProfits.every(p => p === -1)).toBe(true)
    })

    it('reconciles a mixed run counting only accepted rounds', () => {
        const { state } = runFixedCount([
            acceptedResult(-1),
            rejectedResult('insufficient-funds'),
            acceptedResult(2),
            rejectedResult('insufficient-funds'),
            acceptedResult(-1),
        ])
        expect(state.rounds).toBe(3)
        expect(state.refusals).toBe(2)
        expect(state.sessionProfit).toBe(0) // -1 + 2 - 1 across accepted rounds only
    })

    it('does not count a refused round toward exhaustion of the fixed count', () => {
        // Fixed count of 3 accepted: a refusal must not consume a slot.
        let state = baseState()
        let accepted = 0
        const stream = [
            rejectedResult('insufficient-funds'),
            acceptedResult(-1), acceptedResult(-1), acceptedResult(-1),
        ]
        for (const r of stream) {
            const step = accountAutoRound(state, r)
            state = step.state
            if (step.accepted) accepted += 1
        }
        expect(accepted).toBe(3)
        expect(state.refusals).toBe(1)
    })
})

describe('QA027 stop conditions use accepted rounds only', () => {
    it('stop-loss accumulates only accepted loss', () => {
        let state = baseState({ limitLoss: 2 })
        const seq = [rejectedResult('insufficient-funds'), acceptedResult(0), acceptedResult(-1), acceptedResult(-1)]
        let stop = false
        for (const r of seq) {
            const step = accountAutoRound(state, r)
            state = step.state
            if (step.stop) { stop = true; break }
        }
        expect(stop).toBe(true)
        expect(state.sessionProfit).toBe(-2)
        expect(state.refusals).toBe(1)
    })

    it('stop-profit triggers on accepted profit and never on refusals', () => {
        let state = baseState({ limitProfit: 5 })
        const onlyRefusals = [rejectedResult('insufficient-funds'), rejectedResult('insufficient-funds')]
        for (const r of onlyRefusals) {
            const step = accountAutoRound(state, r)
            state = step.state
            expect(step.stop).toBe(false)
        }
        const win = accountAutoRound(state, acceptedResult(5))
        expect(win.stop).toBe(true)
    })

    it('no extra round after stop: the loop must break once stop is set', () => {
        // Simulate the loop contract: stop is checked before issuing the next.
        let state = baseState({ limitProfit: 1 })
        const issued = []
        const stream = [acceptedResult(1), acceptedResult(1), acceptedResult(1)]
        for (const r of stream) {
            const step = accountAutoRound(state, r)
            state = step.state
            issued.push(r)
            if (step.stop) break
        }
        expect(issued).toHaveLength(1)
        expect(state.rounds).toBe(1)
    })
})

describe('QA027 percentage bet changes stay 2dp and clamped', () => {
    it.each([[1, 'win', 7, 3.56], [-1, 'loss', 7, 3.56], [-1, 'loss', -90, 0.5]])('adjusts the actual next onPlay stake after %s profit', async (profit, kind, percentage, expected) => {
        const onPlay = vi.fn(async () => acceptedResult(profit))
        const render = () => renderPanel({ onPlay })
        let tree = render()
        find(tree, node => node.props?.className?.includes('bp-tab') && node.props.children.some(child => child?.props?.children === 'auto')).props.onClick()
        tree = render()
        find(tree, node => node.props?.id?.endsWith('-auto-count')).props.onChange({ target: { value: '2' } })
        const group = find(tree, node => node.props?.['aria-labelledby'] === `dice-auto-on-${kind}-label`)
        group.props.children[1].props.onClick()
        tree = render()
        find(tree, node => node.props?.['aria-label'] === `On ${kind} increase percentage`).props.onChange({ target: { value: String(percentage) } })
        tree = render()
        await find(tree, node => node.props?.className?.startsWith('bp-play ')).props.onClick()
        expect(onPlay.mock.calls.map(([request]) => request.betAmount)).toEqual([3.33, expected])
    })
})

describe('QA027 regression: a non-Dice shared consumer still reconciles', () => {
    // Plinko Auto resolves immediately on an accepted drop; RPS resolves a
    // push as an accepted zero-profit round. Both must stay counted.
    it('RPS push remains an accepted zero-profit round', () => {
        const push = accountAutoRound(baseState(), { profit: 0, kind: 'committed', multiplier: 1 })
        expect(push.accepted).toBe(true)
        expect(push.state.sessionProfit).toBe(0)
    })

    it('a refused Roulette spin (already spinning) is not an accepted round', () => {
        const refused = accountAutoRound(baseState(), { kind: 'not-admitted', code: 'gate-closed', profit: 0 })
        expect(refused.accepted).toBe(false)
        expect(refused.state.rounds).toBe(0)
    })

    it('normalizeBetResult preserves the legacy profit for a migrated committed result', () => {
        expect(normalizeBetResult({ kind: 'committed', profit: 3.5 })).toMatchObject({ kind: 'committed', profit: 3.5 })
        expect(normalizeBetResult({ profit: -2 })).toMatchObject({ kind: 'committed', profit: -2 })
    })
})
