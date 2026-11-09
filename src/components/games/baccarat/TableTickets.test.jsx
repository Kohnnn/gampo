import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const f = vi.hoisted(() => ({ slots: {}, key: 'game', cursor: 0, timers: [], debit: vi.fn() }))
vi.mock('react', async () => ({
    ...await vi.importActual('react'),
    useState(initial) {
        const slots = f.slots[f.key] ||= []
        const i = f.cursor++
        if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial
        return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value }]
    },
    useRef: initial => ({ current: initial }), useEffect: () => {}, useCallback: callback => callback,
    useMemo: callback => callback(), useId: () => 'table-ticket',
}))
vi.mock('react-dom', () => ({ createPortal: node => node }))
vi.mock('../../../context/CreditContext', () => ({ useCredits: () => ({ balance: 1286.92, placeBet: f.debit, addWinnings: () => {}, showToast: () => {} }) }))
vi.mock('../../../audio/AudioProvider', () => ({ useAudio: () => ({ play: () => {} }) }))
vi.mock('../../../audio/useSfx', () => ({ useSfx: () => ({ play: () => {} }) }))
vi.mock('../../../audio/useBgm', () => ({ useGameBgm: () => {} }))
vi.mock('../../../hooks/useScrollActionIntoView', () => ({ useScrollActionIntoView: () => {} }))
vi.mock('../../../utils/fairRng', () => ({ nextRoll: () => ({ roll: 0.1 }) }))
vi.mock('../../../utils/scheduling', () => ({
    useCancellableTimeouts: () => ({ schedule: callback => f.timers.push(callback), cancelAll: () => {} }),
    useCancellableFrames: () => ({ requestFrame: () => {}, cancelFrames: () => {} }),
}))
vi.mock('../resources/useOriginalsPreloader', () => ({ useOriginalsPreloader: () => ({ ready: true }) }))
vi.mock('../primitives', () => {
    const Empty = () => null
    return {
        GameShell: Empty, BetPanel: Empty, CoreStageFrame: Empty, BigWinOverlay: Empty, HistoryDrawer: Empty,
        RecentResultsStrip: Empty, StatsOverlay: Empty, MultiplierBadge: Empty, ResultToast: Empty, ActionLockOverlay: Empty,
        getBigWinThreshold: () => 5,
        useGameSession: () => ({ history: [], stats: {}, record: () => {} }),
        ROUND_EVENTS: {}, useRoundMachine: () => ({ start: () => {}, finish: () => {} }),
    }
})
import BetPanel from '../primitives/BetPanel'
import RouletteGame from '../roulette/RouletteGame'
import BaccaratGame from './BaccaratGame'
import SicBoGame from '../sicbo/SicBoGame'

function find(node, predicate) {
    if (!node || typeof node !== 'object') return null
    if (predicate(node)) return node
    for (const child of [node.props?.panel, ...[node.props?.children].flat(Infinity)]) {
        const result = find(child, predicate)
        if (result) return result
    }
    return null
}
function render(Game) { f.key = 'game'; f.cursor = 0; return Game() }
function dock(tree) {
    f.key = 'panel'; f.cursor = 0
    const panel = BetPanel(tree.props.panel.props)
    const summary = find(panel, node => node.props?.className === 'bp-mobile-summary')
    return summary.props.children.map(child => child.props.children)
}
function flush() { while (f.timers.length) f.timers.shift()() }
const text = node => [node.props?.children].flat(Infinity).filter(child => typeof child === 'string').join('')
beforeEach(() => {
    f.slots = {}; f.timers = []; f.debit.mockReset().mockReturnValue(true)
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
    vi.stubGlobal('document', { documentElement: { classList: { contains: () => false } } })
})
afterEach(() => vi.unstubAllGlobals())

for (const [name, Game, target] of [
    ['Roulette', RouletteGame, node => node.props?.['aria-label'] === 'Number 36'],
    ['Baccarat', BaccaratGame, node => node.props?.className === 'bac-bet-cell banker '],
    ['Sic Bo', SicBoGame, node => text(node).startsWith('Small (4–10)')],
]) {
    describe(`${name} live ticket dock`, () => {
        it('quotes added chips, ignores manual amount edits, clears and repeats the charged ticket', async () => {
            let tree = render(Game)
            expect(dock(tree)).toEqual(['Ticket stake', 'GC 0.00'])
            const cell = find(tree, target)
            expect(cell).toBeTruthy()
            expect(cell.props.disabled).not.toBe(true) // fractional wallet remains funded
            cell.props.onClick(); cell.props.onClick()
            tree = render(Game)
            expect(dock(tree)).toEqual(['Ticket stake', 'GC 10.00'])
            find(tree, node => typeof node.props?.onClick === 'function' && text(node) === 'Clear').props.onClick()
            tree = render(Game)
            expect(dock(tree)).toEqual(['Ticket stake', 'GC 0.00'])
            find(tree, target).props.onClick(); find(tree, target).props.onClick()
            tree = render(Game)
            f.key = 'panel'; f.cursor = 0
            let panel = BetPanel(tree.props.panel.props)
            find(panel, node => node.props?.id === 'table-ticket-bet-amount').props.onChange({ target: { value: '100' } })
            expect(dock(tree)).toEqual(['Ticket stake', 'GC 10.00'])
            const round = tree.props.panel.props.onPlay({ mode: 'auto', betAmount: 100 })
            flush(); await round
            expect(f.debit).toHaveBeenCalledExactlyOnceWith(10, name)
            tree = render(Game)
            // Repeat fallback remains the next payable ticket even after clearing.
            find(tree, node => typeof node.props?.onClick === 'function' && text(node) === 'Repeat').props.onClick()
            tree = render(Game)
            expect(dock(tree)).toEqual(['Ticket stake', 'GC 10.00'])
            find(tree, node => typeof node.props?.onClick === 'function' && text(node) === 'Clear').props.onClick()
            tree = render(Game)
            expect(dock(tree)).toEqual(['Ticket stake', 'GC 10.00'])
        })
    })
}
