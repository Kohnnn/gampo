import { beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({
    state: [], cursor: 0, timers: [], rolls: [], records: [], events: [], boost: 1,
    winnings: vi.fn(),
}))
vi.mock('react', async () => {
    const actual = await vi.importActual('react')
    return {
        ...actual,
        useState(initial) {
            const index = fixture.cursor++
            if (!(index in fixture.state)) fixture.state[index] = typeof initial === 'function' ? initial() : initial
            return [fixture.state[index], value => { fixture.state[index] = typeof value === 'function' ? value(fixture.state[index]) : value }]
        },
        useRef: value => ({ current: value }),
        useEffect: () => {},
        useCallback: callback => callback,
    }
})
vi.mock('../context/CreditContext', () => ({ useCredits: () => ({ balance: 1000, placeBet: () => true, addWinnings: fixture.winnings, showToast: () => {} }) }))
vi.mock('../audio/AudioProvider', () => ({ useAudio: () => ({ play: () => {} }) }))
vi.mock('../audio/useSfx', () => ({ useSfx: () => ({ play: () => {} }) }))
vi.mock('../audio/useBgm', () => ({ useGameBgm: () => {} }))
vi.mock('../hooks/useScrollActionIntoView', () => ({ useScrollActionIntoView: () => {} }))
vi.mock('../utils/fairRng', () => ({ nextRoll: () => ({ roll: fixture.rolls.shift() ?? 0 }) }))
vi.mock('../utils/funMode', () => ({ funBoostFactor: () => fixture.boost }))
vi.mock('../utils/scheduling', () => ({ useCancellableTimeouts: () => ({ schedule: callback => fixture.timers.push(callback), cancelAll: () => {} }) }))
vi.mock('./games/resources/useOriginalsPreloader', () => ({ useOriginalsPreloader: () => ({ ready: true }) }))
vi.mock('./games/primitives', () => {
    const component = name => Object.assign(() => null, { displayName: name })
    return {
        BetPanel: component('BetPanel'), BigWinOverlay: component('BigWinOverlay'), CoreStageFrame: component('CoreStageFrame'),
        GameShell: component('GameShell'), HistoryDrawer: component('HistoryDrawer'), RecentResultsStrip: component('RecentResultsStrip'),
        StatsOverlay: component('StatsOverlay'), MultiplierBadge: component('MultiplierBadge'), ResultToast: component('ResultToast'),
        ActionLockOverlay: component('ActionLockOverlay'), StageActionButton: component('StageActionButton'),
        getBigWinThreshold: () => 5,
        useGameSession: () => ({ history: fixture.records, stats: {}, clear: () => {}, record: record => fixture.records.unshift(record) }),
        useRoundMachine: () => ({ start: events => { fixture.events = events }, finish: () => {} }),
        ROUND_EVENTS: { ROUND_START: 'start', INPUT_LOCK: 'lock', BET_ACCEPTED: 'bet', RNG_REVEAL: 'reveal', ROUND_RESULT: 'result', PAYOUT_PREVIEW: 'payout', INPUT_UNLOCK: 'unlock' },
        buildEvents: build => { const events = []; build({ push: (type, payload, at) => events.push({ type, payload, at }) }); return events },
    }
})

import EducationPanel from './EducationPanel'
import DinoGame from './games/dino/DinoGame'
import TowerGame from './games/tower/TowerGame'
import DiamondsGame from './games/diamonds/DiamondsGame'
import TomeOfLifeGame from './games/tomeoflife/TomeOfLifeGame'

function render(Game) {
    fixture.cursor = 0
    return Game()
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
const named = (tree, name) => find(tree, node => node.type?.displayName === name)
const education = tree => find(tree, node => node.type === EducationPanel).props
const flush = () => { const timers = fixture.timers.splice(0); timers.forEach(callback => callback()) }

beforeEach(() => {
    fixture.state = []; fixture.cursor = 0; fixture.timers = []; fixture.rolls = []; fixture.records = []; fixture.events = []; fixture.boost = 1
    fixture.winnings.mockClear()
})

describe('current progressive decisions', () => {
    for (const [name, Game, action, safe, first, next] of [
        ['Dino', DinoGame, 'Jump', 0.72, 1.38, 1.89],
        ['Tower', TowerGame, 'Climb up', 0.7, 1.37, 1.88],
    ]) {
        it(`${name} explains the first and conditional next action with the selected and accepted stake`, () => {
            let tree = render(Game)
            named(tree, 'BetPanel').props.onStakeChange(10)
            tree = render(Game)
            expect(education(tree)).toMatchObject({ betAmount: 10, conditionalDecision: { probability: safe, payoutMultiplier: first } })
            named(tree, 'BetPanel').props.onPlay({ betAmount: 10 })
            named(tree, 'BetPanel').props.onStakeChange(20)
            tree = render(Game)
            const button = find(tree, node => typeof node.props?.onClick === 'function' && String(node.props.children).startsWith(action))
            button.props.onClick()
            tree = render(Game)
            expect(education(tree)).toMatchObject({ betAmount: 10, conditionalDecision: { probability: safe, payoutMultiplier: next, cashoutMultiplier: first } })
            named(tree, 'BetPanel').props.onPlayPhaseAction()
            tree = render(Game)
            expect(education(tree).conditionalDecision).toEqual({ settled: true })
            expect(fixture.winnings).toHaveBeenLastCalledWith(name === 'Dino' ? 13.8 : 13.7, `${name} return`)
            flush()
            expect(education(render(Game)).conditionalDecision).toEqual({ settled: true })
        })
        it(`${name} has no live next action after a fall and idle reset`, () => {
            let tree = render(Game)
            named(tree, 'BetPanel').props.onPlay({ betAmount: 7 })
            fixture.rolls = [0.99]
            tree = render(Game)
            find(tree, node => typeof node.props?.onClick === 'function' && String(node.props.children).startsWith(action)).props.onClick()
            flush()
            expect(education(render(Game)).conditionalDecision).toEqual({ settled: true })
            expect(fixture.records[0]).toMatchObject({ profit: -7, betAmount: 7 })
        })
    }
})

describe('Diamonds canonical visible paytable', () => {
    for (const boost of [1, 1 / 0.96]) {
        it(`shows the same match payout that is settled with boost ${boost}`, () => {
            fixture.boost = boost
            const tree = render(DiamondsGame)
            const paytable = find(tree, node => node.props?.className === 'diamonds-paytable')
            const rolls = [0.02, 0.08, 0.18, 0.34, 0.54, 0.83]
            for (let gem = 0; gem < rolls.length; gem += 1) {
                for (const count of [2, 3, 4, 5]) {
                    fixture.rolls = [...Array(count).fill(rolls[gem]), ...rolls.filter((_, index) => index !== gem).slice(0, 5 - count)]
                    named(tree, 'BetPanel').props.onPlay({ betAmount: 7 })
                    const record = fixture.records[0]
                    const cell = find(paytable, node => node.props?.['data-gem-index'] === gem && node.props?.['data-match-count'] === count)
                    expect(cell.props.children).toBe(`${record.multiplier.toFixed(2)}×`)
                    expect(fixture.winnings).toHaveBeenLastCalledWith(Math.round(7 * record.multiplier * 100) / 100, 'Diamonds return')
                }
            }
        })
    }
})

describe('Tome contribution and settled result presentation', () => {
    function start(rolls) {
        fixture.rolls = rolls
        const tree = render(TomeOfLifeGame)
        named(tree, 'BetPanel').props.onPlay({ betAmount: 5 })
        flush()
        return render(TomeOfLifeGame)
    }
    it('has no fake initial result and keeps a sub-stake cashout after idle reset', () => {
        expect(named(render(TomeOfLifeGame), 'MultiplierBadge')).toBeNull()
        let tree = start([0])
        expect(named(tree, 'MultiplierBadge').props.value).toBe(0.6)
        named(tree, 'BetPanel').props.onPlayPhaseAction()
        flush()
        tree = render(TomeOfLifeGame)
        expect(named(tree, 'MultiplierBadge').props).toMatchObject({ label: 'Result', value: 0.6 })
        expect(fixture.records[0]).toMatchObject({ multiplier: 0.6, profit: -2 })
        expect(fixture.winnings).toHaveBeenLastCalledWith(3, 'Tome of Life return')
    })
    it('retains 0x after a skull and its idle reset', () => {
        start([0.99])
        flush()
        const tree = render(TomeOfLifeGame)
        expect(named(tree, 'MultiplierBadge').props).toMatchObject({ label: 'Result', value: 0, state: 'bust' })
        expect(fixture.records[0].multiplier).toBe(0)
    })
    it('shows a Star doubled Moon contribution and the actual legend values', () => {
        let tree = start([0.7, 0.4])
        named(tree, 'StageActionButton').props.onClick()
        flush()
        tree = render(TomeOfLifeGame)
        const pages = find(tree, node => node.props?.className === 'tome-pages')
        const moon = pages.props.children[1]
        expect(find(moon, node => node.props?.className === 'tome-mult').props.children).toBe('+1.86×')
        expect(named(tree, 'MultiplierBadge').props.value).toBe(1.86)
        const legend = find(tree, node => node.props?.className === 'tome-paytable')
        expect(legend.props.children.map(node => node.props.children).join(' ')).toContain('Sun +0.60×')
        expect(legend.props.children.map(node => node.props.children).join(' ')).toContain('Moon +0.93×')
    })
    it('records the credited multiplier after cent rounding rather than a fictional 1x floor', () => {
        fixture.rolls = [0.4]
        const first = render(TomeOfLifeGame)
        named(first, 'BetPanel').props.onPlay({ betAmount: 0.03 })
        flush()
        let tree = render(TomeOfLifeGame)
        named(tree, 'BetPanel').props.onPlayPhaseAction()
        flush()
        tree = render(TomeOfLifeGame)
        expect(fixture.winnings).toHaveBeenLastCalledWith(0.03, 'Tome of Life return')
        expect(fixture.records[0]).toMatchObject({ multiplier: 1, profit: 0 })
        expect(named(tree, 'MultiplierBadge').props.value).toBe(1)
    })

    it('settles Sun plus Moon from zero without an invented starting multiplier', () => {
        let tree = start([0, 0.4])
        named(tree, 'StageActionButton').props.onClick()
        flush()
        tree = render(TomeOfLifeGame)
        named(tree, 'BetPanel').props.onPlayPhaseAction()
        expect(fixture.winnings).toHaveBeenLastCalledWith(7.65, 'Tome of Life return')
        expect(fixture.records[0]).toMatchObject({ multiplier: 1.53, profit: 2.65 })
    })

    it('does not stack consecutive Stars and gives a final-page Star no future value', () => {
        let tree = start([0.7, 0.7, 0.4])
        named(tree, 'StageActionButton').props.onClick()
        flush()
        tree = render(TomeOfLifeGame)
        named(tree, 'StageActionButton').props.onClick()
        flush()
        tree = render(TomeOfLifeGame)
        expect(named(tree, 'MultiplierBadge').props.value).toBe(1.86)
        expect(fixture.records[0].multiplier).toBe(1.86)

        flush()
        tree = render(TomeOfLifeGame)
        fixture.rolls = [0, 0.4, 0.7]
        named(tree, 'BetPanel').props.onPlay({ betAmount: 5 })
        flush()
        for (let page = 1; page < 3; page += 1) {
            tree = render(TomeOfLifeGame)
            named(tree, 'StageActionButton').props.onClick()
            flush()
        }
        tree = render(TomeOfLifeGame)
        expect(fixture.records[0].multiplier).toBe(1.53)
        const finalPage = find(tree, node => node.props?.className === 'tome-pages').props.children[2]
        expect(find(finalPage, node => node.props?.className === 'tome-mult').props.children).toBe('No next page')
    })
})
