import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
const f = vi.hoisted(() => ({ state: [], cursor: 0, timers: [], rolls: [], records: [], credit: vi.fn() }))
vi.mock('react', async () => ({ ...await vi.importActual('react'), useState(initial) {
    const i = f.cursor++
    if (!(i in f.state)) f.state[i] = typeof initial === 'function' ? initial() : initial
    return [f.state[i], value => { f.state[i] = typeof value === 'function' ? value(f.state[i]) : value }]
}, useRef: value => ({ current: value }), useEffect: () => {}, useCallback: cb => cb }))
vi.mock('../../../context/CreditContext', () => ({ useCredits: () => ({ balance: 100, placeBet: () => true, addWinnings: f.credit, showToast: () => {} }) }))
vi.mock('../../../audio/AudioProvider', () => ({ useAudio: () => ({ play: () => {} }) }))
vi.mock('../../../audio/useSfx', () => ({ useSfx: () => ({ play: () => {} }) }))
vi.mock('../../../audio/useBgm', () => ({ useGameBgm: () => {} }))
vi.mock('../../../utils/fairRng', () => ({ nextRoll: () => ({ roll: f.rolls.shift() ?? 0 }) }))
vi.mock('../../../utils/scheduling', () => ({ useCancellableTimeouts: () => ({ schedule: cb => f.timers.push(cb) }) }))
vi.mock('../resources/useOriginalsPreloader', () => ({ useOriginalsPreloader: () => ({ ready: true }) }))
vi.mock('../primitives', () => {
    const component = name => Object.assign(() => null, { displayName: name })
    return Object.fromEntries(['BetPanel','BigWinOverlay','GameShell','HistoryDrawer','RecentResultsStrip','StatsOverlay','MultiplierBadge','ResultToast','ActionLockOverlay','CoreStageFrame','StageActionButton'].map(name => [name, component(name)]).concat([
        ['getBigWinThreshold', () => 5], ['ROUND_EVENTS', {}],
        ['useGameSession', () => ({ history: f.records, stats: {}, record: r => f.records.unshift(r) })],
        ['useRoundMachine', () => ({ start: () => {}, finish: () => {} })],
    ]))
})
import Game, { SYMBOLS, symbolEffect } from './TomeOfLifeGame'
import EducationPanel from '../../EducationPanel'
function render() { f.cursor = 0; return Game() }
function find(node, predicate) {
    if (Array.isArray(node)) return node.map(n => find(n, predicate)).find(Boolean)
    if (!node || typeof node !== 'object') return null
    if (predicate(node)) return node
    return find([node.props?.panel, node.props?.children], predicate)
}
const named = (tree, name) => find(tree, n => n.type?.displayName === name)
const flush = () => f.timers.splice(0).forEach(cb => cb())
beforeEach(() => { f.state = []; f.cursor = 0; f.timers = []; f.rolls = []; f.records = []; f.credit.mockClear() })
describe('Tome authoritative symbols and gross/net result', () => {
    it('uses the same values in rules, legend, revealed cards and accumulated value', async () => {
        let tree = render()
        const note = find(tree, n => n.type === EducationPanel).props.rtpNote
        for (const symbol of SYMBOLS) expect(note).toContain(`${symbol.name}: ${symbolEffect(symbol)}`)
        expect(renderToStaticMarkup(find(tree, n => n.props?.className === 'tome-paytable'))).toContain('Sun +0.60×')
        f.rolls = [0.7, 0]
        await named(tree, 'BetPanel').props.onPlay({ betAmount: 5 }); flush()
        tree = render(); named(tree, 'StageActionButton').props.onClick(); flush()
        tree = render()
        expect(named(tree, 'MultiplierBadge').props.value).toBe(1.2)
        expect(renderToStaticMarkup(find(tree, n => n.props?.className === 'tome-pages'))).toContain('+1.20×')
    })
    for (const [label, rolls, stake, multiplier, returned, profit] of [
        ['partial', [0], 5, 0.6, 3, -2], ['break-even after rounding', [0.4], 0.03, 1, 0.03, 0],
        ['profit', [0, 0.4], 5, 1.53, 7.65, 2.65], ['bust', [0.99], 5, 0, 0, -5],
    ]) it(`shows actual gross return and separate net for ${label}`, async () => {
        f.rolls = [...rolls]
        let tree = render(); await named(tree, 'BetPanel').props.onPlay({ betAmount: stake }); flush()
        for (let i = 1; i < rolls.length; i++) { tree = render(); named(tree, 'StageActionButton').props.onClick(); flush() }
        tree = render()
        if (label !== 'bust') named(tree, 'BetPanel').props.onPlayPhaseAction()
        flush(); tree = render()
        expect(named(tree, 'MultiplierBadge').props.value).toBe(multiplier)
        expect(f.records[0]).toMatchObject({ multiplier, profit, betAmount: stake })
        const result = renderToStaticMarkup(find(tree, n => n.props?.className === 'tome-result'))
        expect(result).toContain(`<dt>Gross multiplier</dt><dd>${multiplier.toFixed(2)}×</dd>`)
        expect(result).toContain(`<dt>Gross return</dt><dd>GC ${returned.toFixed(2)}</dd>`)
        expect(result).toContain(profit < 0 ? 'Net loss' : profit > 0 ? 'Net profit' : 'Net result')
        expect(result).not.toContain('NO PAYOUT')
        if (returned) expect(f.credit).toHaveBeenLastCalledWith(returned, 'Tome of Life return')
    })
})
