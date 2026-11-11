import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { round2 } from '../../../utils/simulationMath'

// Exercise Pump with the real BetPanel and EducationPanel controls. Only the
// unrelated providers, timing and RNG are replaced; each component keeps its
// own state across renders, like the existing BetPanel behavior harness.
const fixture = vi.hoisted(() => ({ states: {}, scope: '', cursor: 0, effects: [], effectCursor: 0, rolls: [], winnings: vi.fn(), placeBet: vi.fn(() => true) }))
vi.mock('react', async original => ({
    ...await original(),
    useState(initial) {
        const state = fixture.states[fixture.scope] ||= []
        const index = fixture.cursor++
        if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial
        return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value }]
    },
    useRef: initial => ({ current: initial }),
    useCallback: callback => callback,
    useMemo: callback => callback(),
    useId: () => 'pump-test',
    useEffect(effect) {
        if (fixture.scope === 'panel' && fixture.effectCursor++ === 0) fixture.effects.push(effect)
    },
}))
vi.mock('../../../context/CreditContext', () => ({ useCredits: () => ({ balance: 1000, placeBet: fixture.placeBet, addWinnings: fixture.winnings, showToast: () => {} }) }))
vi.mock('../../../audio/AudioProvider', () => ({ useAudio: () => ({ play: () => {} }) }))
vi.mock('../../../audio/useSfx', () => ({ useSfx: () => ({ play: () => {} }) }))
vi.mock('../../../audio/useBgm', () => ({ useGameBgm: () => {} }))
vi.mock('../../../utils/fairRng', () => ({ nextRoll: vi.fn(() => ({ roll: fixture.rolls.shift() ?? 0.99 })) }))
vi.mock('../../../utils/scheduling', async original => ({ ...await original(), useCancellableTimeouts: () => ({ schedule: () => {} }) }))
vi.mock('../../games/resources/useOriginalsPreloader', () => ({ useOriginalsPreloader: () => ({ ready: true }) }))
vi.mock('../primitives', async () => {
    const { default: BetPanel } = await import('../primitives/BetPanel.jsx')
    const { default: StageActionButton } = await import('../primitives/StageActionButton.jsx')
    const component = () => null
    return {
        BetPanel, StageActionButton,
        BigWinOverlay: component, GameShell: component, HistoryDrawer: component, RecentResultsStrip: component,
        StatsOverlay: component, MultiplierBadge: component, ResultToast: component, ActionLockOverlay: component, CoreStageFrame: component,
        getBigWinThreshold: () => 5,
        useGameSession: () => ({ history: [], stats: {}, clear: () => {}, record: () => {} }),
        useRoundMachine: () => ({ start: () => {}, finish: () => {} }),
        ROUND_EVENTS: { ROUND_START: 'start', INPUT_LOCK: 'lock', BET_ACCEPTED: 'bet' },
    }
})

const { default: PumpGame } = await import('./PumpGame.jsx')
const { default: BetPanel } = await import('../primitives/BetPanel.jsx')
const { default: StageActionButton } = await import('../primitives/StageActionButton.jsx')
const { default: EducationPanel } = await import('../../EducationPanel.jsx')
const { nextRoll } = await import('../../../utils/fairRng')

function find(node, predicate) {
    if (!node || typeof node !== 'object') return null
    if (predicate(node)) return node
    for (const child of [node.props?.panel, ...[node.props?.children].flat(Infinity)]) {
        const found = find(child, predicate)
        if (found) return found
    }
    return null
}
function renderGame() {
    fixture.scope = 'game'; fixture.cursor = 0
    return PumpGame()
}
function renderPanel(game) {
    fixture.scope = 'panel'; fixture.cursor = 0; fixture.effectCursor = 0; fixture.effects = []
    const tree = BetPanel(find(game, node => node.type === BetPanel).props)
    fixture.effects.forEach(effect => effect())
    return tree
}
const educationHtml = game => renderToStaticMarkup(EducationPanel(find(game, node => node.type === EducationPanel).props))
const stakeInput = panel => find(panel, node => node.type === 'input' && node.props?.type === 'number')
const resetButton = panel => find(panel, node => node.type === 'button' && node.props?.['data-bet-chip'] === 'reset')
const playButton = panel => find(panel, node => node.type === 'button' && node.props?.className?.startsWith('bp-play '))
const pumpButton = game => find(game, node => node.type === StageActionButton)

beforeEach(() => {
    fixture.states = {}; fixture.rolls = []; fixture.winnings.mockClear(); fixture.placeBet.mockClear(); nextRoll.mockClear()
})

describe('Pump controls and education', () => {
    it('keeps the edited stake live while 1× resets to the labeled default', async () => {
        let game = renderGame()
        let panel = renderPanel(game)
        expect(resetButton(panel).props['aria-label']).toBe('Reset to default bet GC 5.00')
        stakeInput(panel).props.onChange({ target: { value: '10' } })
        panel = renderPanel(game)
        game = renderGame()
        panel = renderPanel(game)
        expect(stakeInput(panel).props.value).toBe(10)
        expect(educationHtml(game)).toContain('GC 10.00')
        expect(resetButton(panel).props['aria-label']).toBe('Reset to default bet GC 5.00')
        resetButton(panel).props.onClick()
        panel = renderPanel(game)
        game = renderGame()
        panel = renderPanel(game)
        expect(stakeInput(panel).props.value).toBe(5)
        expect(educationHtml(game)).toContain('GC 5.00')
        await playButton(panel).props.onClick()
        expect(fixture.placeBet).toHaveBeenCalledWith(5, 'Pump')
    })

    it.each(['Pump', 'Cashout'])('quotes the guaranteed 10-pump return before %s cashes out', async action => {
        let game = renderGame()
        let panel = renderPanel(game)
        stakeInput(panel).props.onChange({ target: { value: '10' } })
        panel = renderPanel(game)
        game = renderGame()
        panel = renderPanel(game)
        await playButton(panel).props.onClick()
        expect(educationHtml(renderGame())).toContain('88.00%')
        for (let index = 0; index < 10; index++) {
            game = renderGame()
            expect(pumpButton(game).props.disabled).toBe(false)
            pumpButton(game).props.onClick()
            if (index === 8) {
                const beforeCap = educationHtml(renderGame())
                expect(beforeCap).toContain('88.00%')
                expect(beforeCap).toContain('A failure returns 0 GC')
                expect(beforeCap).not.toContain('Cap reached')
            }
        }
        game = renderGame()
        const html = educationHtml(game)
        expect(html).toContain('Cashout success')
        expect(html).toContain('100.00%')
        expect(html).not.toContain('88.00%')
        expect(html).toContain('GC 23.87')
        expect(html).toContain('2.39×')
        expect(html).toContain('EV vs cashout')
        expect(html).toMatch(/EV vs cashout<\/span><strong[^>]*>GC 0\.00/)
        expect(html).toMatch(/cap reached/i)
        expect(html).toContain('2.3870×')
        expect(html).toContain('Pump and Cashout both immediately')
        expect(html).toContain('RTP per risky pump')
        expect(html).toContain('not this cashout or a whole round')
        expect(html).toMatch(/guaranteed/i)
        expect(html).not.toContain('A failure returns 0 GC')
        expect(nextRoll).toHaveBeenCalledTimes(10)
        if (action === 'Pump') pumpButton(game).props.onClick()
        else await playButton(renderPanel(game)).props.onClick()
        expect(nextRoll).toHaveBeenCalledTimes(10)
        expect(fixture.winnings).toHaveBeenCalledOnce()
        expect(fixture.winnings).toHaveBeenCalledWith(23.87, 'Pump return')
    })
})

const source = readFileSync(new URL('./PumpGame.jsx', import.meta.url), 'utf8')

// Mirror of the component's settle math.
function settle({ m, stake }) {
    const totalReturn = round2(stake * m)
    const profit = round2(totalReturn - stake)
    return { returnAmount: totalReturn, profit }
}

const MULTIPLIERS = [1.0909090909090908,1.2396694214876034,1.4087152516904584,1.8191054386498686]
const STAKES = [1, 2, 3, 5, 7, 10, 25, 100, 137]
const TWO_DP = /^-?\d+(\.\d{1,2})?$/

describe('pump payout rounding', () => {
    it('books a 2dp-clean profit and return for every stake and multiplier', () => {
        for (const m of MULTIPLIERS) {
            for (const stake of STAKES) {
                const { returnAmount, profit } = settle({ m, stake })
                expect(String(profit)).toMatch(TWO_DP)
                expect(String(returnAmount)).toMatch(TWO_DP)
            }
        }
    })

    it('would drift without the rounding', () => {
        // Guards against the rounding quietly becoming a no-op: at least one
        // of the real multipliers must produce a raw value that is not 2dp.
        const drifted = MULTIPLIERS.some(m => STAKES.some(stake => !TWO_DP.test(String(stake * m - stake))))
        expect(drifted).toBe(true)
    })

    it('loses exactly the stake when the round pays nothing', () => {
        const m = 0
        const stake = 5
        const { returnAmount, profit } = settle({ m, stake })
        expect(returnAmount).toBe(0)
        expect(profit).toBe(-5)
    })

    it('keeps the credited return and the booked profit consistent', () => {
        for (const m of MULTIPLIERS) {
            for (const stake of STAKES) {
                const { returnAmount, profit } = settle({ m, stake })
                expect(round2(returnAmount - stake)).toBe(profit)
            }
        }
    })
})

describe('pump is pinned to the component', () => {
    it('rounds the return and the profit', () => {
        expect(source).toContain("const totalReturn = round2(stake * m)")
        expect(source).toContain("const profit = round2(totalReturn - stake)")
        expect(source).toContain("addWinnings(totalReturn, 'Pump return')")
    })

    it('imports round2 from the shared money helpers', () => {
        expect(source).toMatch(/import \{[^}]*\bround2\b[^}]*\} from '(\.\.\/)+utils\/simulationMath'/)
    })

    it('routes its timers through the cancellable scheduler', () => {
        expect(source).toContain("import { useCancellableTimeouts } from '../../../utils/scheduling'")
        expect(source).toContain('const { schedule } = useCancellableTimeouts()')
    })
})

describe('pump component parses', () => {
    // The tests above read the component as text, so a syntax error would not
    // fail them. Importing makes a broken component fail here rather than only
    // in `npm run build`.
    it('imports without a syntax or module-resolution error', async () => {
        const mod = await import('./PumpGame.jsx')
        expect(typeof mod.default).toBe('function')
    })
})
