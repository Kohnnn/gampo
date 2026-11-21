import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({ state: [], refs: [], stateCursor: 0, refCursor: 0, effects: [], outcome: null, fun: false, reduceMotion: false, animations: true, mobile: false, credit: vi.fn(), bet: vi.fn(() => true), record: vi.fn(), dialogOpener: null, resolverArgs: [] }))
vi.mock('react', async () => ({
    ...await vi.importActual('react'),
    useState(initial) {
        const index = fixture.stateCursor++
        if (!(index in fixture.state)) fixture.state[index] = typeof initial === 'function' ? initial() : initial
        return [fixture.state[index], value => { fixture.state[index] = typeof value === 'function' ? value(fixture.state[index]) : value }]
    },
    useRef(initial) { const index = fixture.refCursor++; return fixture.refs[index] ||= { current: initial } },
    useEffect: (effect, dependencies) => fixture.effects.push({ effect, dependencies }),
    useMemo: callback => callback(),
    useCallback: callback => callback,
}))
vi.mock('../../../context/CreditContext', () => ({ useCredits: () => ({ balance: 1000, placeBet: fixture.bet, addWinnings: fixture.credit, showToast: () => {} }) }))
vi.mock('../../../audio/AudioProvider', () => ({ useAudio: () => ({ play: () => {} }) }))
vi.mock('../../../audio/useSfx', () => ({ useSfx: () => ({ play: () => {} }) }))
vi.mock('../../../audio/useBgm', () => ({ useBgm: () => {} }))
vi.mock('../../../hooks/useSettings', () => ({ useSettings: () => ({ reduceMotion: fixture.reduceMotion, animations: fixture.animations, haptics: false, quickSpin: false }) }))
vi.mock('../../../hooks/useIsMobileViewport', () => ({ useIsMobileViewport: () => fixture.mobile }))
vi.mock('../../../hooks/useProgress', () => ({ recordFeatureEvent: () => {} }))
vi.mock('../../../utils/gameFeedback', () => ({ FEEDBACK_EVENTS: {}, playFeedback: () => {} }))
vi.mock('../../../utils/funMode', () => ({ FUN_PAYOUT_BOOST: 1.06, useFunMode: () => [fixture.fun], isFunMode: () => fixture.fun }))
vi.mock('../primitives/useNativeDialog', () => ({ default: (_open, _close, opener) => { fixture.dialogOpener = opener; return { current: null } } }))
vi.mock('../primitives', () => {
    const Empty = () => null
    return { Asset: Empty, BigWinOverlay: Empty, GameShell: Empty, HistoryDrawer: Empty, RecentResultsStrip: Empty, StatsOverlay: Empty, useGameSession: () => ({ history: [], stats: {}, record: fixture.record, clear: () => {} }) }
})
vi.mock('./slotFactory', async () => ({
    ...await vi.importActual('./slotFactory'),
    makeInitialGrid: config => Array(config.layout.evaluation === 'megaways' ? config.layout.columnRows.reduce((sum, rows) => sum + rows, 0) : config.layout.rows * config.layout.cols).fill(config.symbols[0]),
    resolveSlotSpin: (_config, args) => { fixture.resolverArgs.push(args); return fixture.outcome },
}))

import SlotsGame from './SlotsGame'
import EducationPanel from '../../EducationPanel'
import { SLOT_TEMPLATES, getSlotTemplate } from './slotFactory'
import WinPathOverlay from '../primitives/WinPathOverlay'
import { buildCascadeTimeline, cascadeTimelineDurationMs } from './slotsMotion'
import { claimEscape } from '../../../utils/escapeClaims'

function render(id) {
    fixture.stateCursor = 0; fixture.refCursor = 0; fixture.effects = []
    return SlotsGame({ initialTemplateId: id })
}
function find(node, predicate) {
    if (!node || typeof node !== 'object') return null
    if (predicate(node)) return node
    for (const child of [node.props?.panel, node.props?.secondary, ...[node.props?.children].flat(Infinity)]) {
        const match = find(child, predicate)
        if (match) return match
    }
    return null
}
function autoplayEffect() {
    return fixture.effects.find(entry => entry.dependencies?.includes(5) && entry.dependencies?.includes(1000) && entry.dependencies?.some(value => typeof value === 'function'))
}
function text(node) {
    if (node == null || typeof node === 'boolean') return ''
    if (typeof node !== 'object') return String(node)
    return [node.props?.children].flat(Infinity).map(text).join('')
}
function outcome(id, extra = {}) {
    const config = getSlotTemplate(id)
    return { cells: Array(config.layout.rows * config.layout.cols).fill(config.symbols[0]), wins: [], winningIndexes: [], featureEvents: [], multiplier: 0, cascadeSteps: 0, coinHits: 0, triggeredFreeSpins: 0, ...extra }
}
async function spin(id) {
    let tree = render(id)
    find(tree, node => node.props?.value === 'normal' && typeof node.props?.onChange === 'function').props.onChange('instant')
    tree = render(id)
    const settled = find(tree, node => node.props?.['data-slot-action'] === 'spin').props.onClick()
    vi.advanceTimersByTime(0)
    await settled
    return render(id)
}

const cleanups = []
beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('window', globalThis)
    fixture.state = []; fixture.refs = []; fixture.effects = []; fixture.fun = false; fixture.reduceMotion = false; fixture.animations = true; fixture.mobile = false
    fixture.credit.mockClear(); fixture.bet.mockReset().mockReturnValue(true); fixture.record.mockClear(); fixture.dialogOpener = null
    fixture.resolverArgs = []
})
afterEach(() => {
    try {
        const errors = []
        for (const cleanup of cleanups.splice(0)) {
            try { cleanup() } catch (error) { errors.push(error) }
        }
        if (errors.length) throw new AggregateError(errors, 'Slots effect cleanup failed')
    } finally {
        vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals()
    }
})

describe('settled slot presentation', () => {
    it('reviews the same mounted board in native fullscreen and returns focus on exit', async () => {
        const doc = new EventTarget()
        doc.fullscreenElement = null
        doc.fullscreenEnabled = true
        const opener = { focus: vi.fn(), isConnected: true }
        doc.activeElement = opener
        doc.exitFullscreen = vi.fn(async () => {
            doc.fullscreenElement = null
            doc.dispatchEvent(new Event('fullscreenchange'))
        })
        vi.stubGlobal('document', doc)
        let tree = render('gummy-drops')
        const stage = find(tree, node => node.props?.className?.startsWith('slot-stage-v2'))
        const stageNode = {
            querySelector: () => opener,
            requestFullscreen: vi.fn(async () => {
                doc.fullscreenElement = stageNode
                doc.dispatchEvent(new Event('fullscreenchange'))
            }),
        }
        stage.ref.current = stageNode
        const cleanup = fixture.effects.find(entry => entry.dependencies?.includes(stage.ref)).effect()
        const review = find(tree, node => node.type === 'button' && node.props?.['aria-label'] === 'Enter reel fullscreen')
        await review.props.onClick()
        tree = render('gummy-drops')
        expect(stageNode.requestFullscreen).toHaveBeenCalledOnce()
        expect(find(tree, node => node.props?.className?.startsWith('slot-stage-v2')).ref.current).toBe(stageNode)
        expect(find(tree, node => node.type === 'button' && node.props?.['aria-label'] === 'Exit reel fullscreen')).not.toBeNull()
        expect(find(tree, node => node.props?.className === 'slot-mobile-dock')).toBeNull()
        const exit = find(tree, node => node.type === 'button' && node.props?.['aria-label'] === 'Exit reel fullscreen')
        const cleanupKey = fixture.effects.find(entry => entry.dependencies?.[0] === true && entry.dependencies?.includes(exit.props.onClick)).effect()
        const releaseOverlay = claimEscape(() => true)
        const blockedEscape = new Event('keydown', { cancelable: true })
        Object.defineProperty(blockedEscape, 'key', { value: 'Escape' })
        doc.dispatchEvent(blockedEscape)
        expect(doc.exitFullscreen).not.toHaveBeenCalled()
        releaseOverlay()
        const escape = new Event('keydown', { cancelable: true })
        Object.defineProperty(escape, 'key', { value: 'Escape' })
        doc.dispatchEvent(escape)
        await Promise.resolve()
        expect(doc.exitFullscreen).toHaveBeenCalledOnce()
        expect(escape.defaultPrevented).toBe(true)
        cleanupKey()
        expect(opener.focus).toHaveBeenCalledWith({ preventScroll: true })
        expect(find(render('gummy-drops'), node => node.type === 'button' && node.props?.['aria-label'] === 'Enter reel fullscreen')).not.toBeNull()
        cleanup()
    })

    it('retains settled free-spin, cascade and coin-meter information in secondary content, never over the board', async () => {
        fixture.outcome = outcome('gummy-drops', { triggeredFreeSpins: 6, featureEvents: [
            { type: 'free-spins', freeSpins: 6, indexes: [0, 8, 16] },
            { type: 'cascade', steps: 2, label: '3x cascade chain' },
            { type: 'coin-meter', coinHits: 4, label: 'Collected 4' },
        ] })
        const tree = await spin('gummy-drops')
        const notices = node => node.props?.className === 'slot-feature-callouts'
        const secondary = find(tree.props.secondary, notices)
        expect(secondary).not.toBeNull()
        expect(find(secondary, node => node.props?.className?.includes('type-free-spins'))).not.toBeNull()
        expect(find(secondary, node => node.props?.className?.includes('type-cascade'))).not.toBeNull()
        expect(find(secondary, node => node.props?.className?.includes('type-coin-meter'))).not.toBeNull()
        const counter = find(tree.props.secondary, node => node.props?.totalAwarded > 0)
        expect(counter.props.totalAwarded).toBe(6)
        expect(counter.props.remaining).toBe(6)
        expect(find(tree.props.children, notices)).toBeNull()
    })

    for (const [mode, reduced, animations, duration] of [['normal', false, true, 1500], ['reduced', true, true, 450], ['off', false, false, 450]]) {
        it(`unmounts the Wanted mystery reveal in ${mode} motion`, async () => {
            fixture.reduceMotion = reduced; fixture.animations = animations
            const mysteryReveal = { id: 'badge', label: 'BADGE' }
            fixture.outcome = outcome('wanted-revelation', { mysteryReveal })
            let tree = await spin('wanted-revelation')
            expect(find(tree, node => node.props?.className?.includes('is-wanted-poster'))).not.toBeNull()
            const cleanup = fixture.effects.find(entry => entry.dependencies?.[0] === mysteryReveal).effect()
            vi.advanceTimersByTime(duration)
            tree = render('wanted-revelation')
            expect(find(tree, node => node.props?.className?.includes('is-wanted-poster'))).toBeNull()
            cleanup()
        })
    }

    it('labels Bass collection as raw multipliers while the result uses the actual credited amount', async () => {
        fixture.outcome = outcome('bass-bayou', { multiplier: 0.6, moneyTotal: 6, moneyValues: [{ index: 0, value: 6 }], featureEvents: [{ type: 'money-collect', label: 'Collected 1 prizes', moneyTotal: 6 }] })
        const tree = await spin('bass-bayou')
        expect(text(find(tree, node => node.props?.className === 'slot-collect-overlay'))).toContain('Raw collection6.00×')
        expect(text(find(tree, node => node.props?.className === 'money-chip'))).toBe('6.00× raw')
        const result = text(find(tree, node => node.props?.className?.startsWith('slot-result-banner')))
        expect(result).toContain('GC 3.00')
        expect(result).not.toContain('GC 6.00')
        expect(fixture.credit).toHaveBeenCalledWith(3, 'Bass Bayou Collect return')
        const stage = find(tree, node => node.props?.className?.startsWith('slot-stage-v2'))
        expect(find(stage, node => node.props?.className?.startsWith('slot-result-banner'))).toBeNull()
        expect(find(stage, node => node.props?.className === 'slot-collect-overlay')).toBeNull()
        expect(find(tree.props.secondary, node => node.props?.className === 'slot-collect-overlay')).not.toBeNull()
    })

    it('closes the native autoplay modal from its cancel event', () => {
        let tree = render('mummy-cascade')
        find(tree, node => node.type === 'button' && node.props?.['aria-label'] === 'Autoplay').props.onClick({ currentTarget: {} })
        tree = render('mummy-cascade')
        const dialog = find(tree, node => node.type === 'dialog' && node.props?.['aria-label'] === 'Autoplay configuration')
        const opener = fixture.dialogOpener
        expect(opener).not.toBeNull()
        expect(opener.current).toEqual({})
        const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() }
        dialog.props.onCancel(event)
        expect(event.preventDefault).toHaveBeenCalledOnce()
        expect(find(render('mummy-cascade'), node => node.type === 'dialog')).toBeNull()
    })

    it('waits for a real zero-additional-cascade board replay before mounting the measured win overlay', async () => {
        const actual = await vi.importActual('./slotFactory')
        const config = actual.getSlotTemplate('phoenix-megaways')
        const positions = actual.getCellPositions(config)
        const rolls = positions.map(({ col }) => [0.01, 0.01, 0.01, 0.3, 0.5, 0.7][col])
        rolls.push(...positions.filter(position => position.col < 3).map(({ col }) => [0.01, 0.06, 0.15][col]))
        fixture.outcome = actual.resolveSlotSpin(config, { rng: () => rolls.shift() ?? 0.5 })
        expect(fixture.outcome.cascadeSteps).toBe(0)
        expect(fixture.outcome.cascadeFrames).toHaveLength(2)
        let tree = await spin('phoenix-megaways')
        expect(find(tree, node => node.props?.className?.includes('cascade-pop'))).not.toBeNull()
        expect(find(tree, node => node.type === WinPathOverlay)).toBeNull()
        const replayMs = cascadeTimelineDurationMs(buildCascadeTimeline(fixture.outcome.cascadeFrames)) + 120
        vi.advanceTimersByTime(replayMs)
        tree = render('phoenix-megaways')
        expect(find(tree, node => node.props?.className?.includes('cascade-pop'))).toBeNull()
        expect(find(tree, node => node.type === WinPathOverlay)).not.toBeNull()
    })

    it('gives the selected template and applied Fun nominal return to the educational surface', () => {
        fixture.fun = true
        const props = find(render('bars'), node => node.type === EducationPanel).props
        expect(props.definition.name).toBe('Bars')
        expect(props.effectiveRtp).toBeCloseTo(1.007, 10)
        expect(props.expectedGrossMultiplier).toBe(props.effectiveRtp)
        expect(props.winProbability).toBeUndefined()
        expect(props.rtpNote).toContain('Fun on')
    })

    it('does not promise an outcome hold the resolver never receives (QA034)', () => {
        // `resolveSlotSpin(config, {...})` is called without `lockedCols`, so a frozen
        // column only stops its reel animation. Any "Hold"/"Lock" label would promise
        // the player that symbols are carried into the next result. They are not.
        const tree = render('bars')
        expect(find(tree, node => node.props?.['aria-label'] === 'Freeze columns')).not.toBeNull()
        expect(find(tree, node => typeof node.props?.['aria-label'] === 'string' && /^(Unlock|Lock) column/.test(node.props['aria-label']))).toBeNull()
        expect(find(tree, node => node.props?.['aria-label'] === 'Freeze column 1 reels')).not.toBeNull()
    })

    it('exposes each Megaways reel column as a native toggle that cannot start a round', () => {
        const template = 'phoenix-megaways'
        const column = () => find(render(template), node => node.props?.className?.split(' ').includes('slot-megaways-col'))
        const initial = column()
        expect(initial.type).toBe('button')
        expect(initial.props).toMatchObject({ type: 'button', disabled: false, 'aria-label': 'Freeze column 1 reels' })
        initial.props.onClick()
        const frozen = column()
        expect(frozen.props['aria-label']).toBe('Unfreeze column 1 reels')
        frozen.props.onClick()
        expect(column().props['aria-label']).toBe('Freeze column 1 reels')
        expect(fixture.bet).not.toHaveBeenCalled()
        expect(fixture.record).not.toHaveBeenCalled()
        expect(fixture.resolverArgs).toHaveLength(0)
    })

    it('never passes manual column freezes into the resolver (QA034)', async () => {
        // The row of Freeze buttons is animation-only. If a future change starts
        // feeding `lockedCols` to `resolveSlotSpin`, the outcome would depend on
        // a player control that has no economics behind it — the finding would
        // come back, and the payout math would silently change.
        let tree = render('bars')
        find(tree, node => node.props?.['aria-label'] === 'Freeze column 1 reels').props.onClick()
        tree = render('bars')
        expect(find(tree, node => node.props?.['aria-label'] === 'Unfreeze column 1 reels')).not.toBeNull()
        fixture.outcome = outcome('bars', { multiplier: 1 })
        await spin('bars')
        expect(fixture.resolverArgs).toHaveLength(1)
        expect(fixture.resolverArgs[0]).not.toHaveProperty('lockedCols')
        expect(Object.keys(fixture.resolverArgs[0]).sort()).toEqual([
            'bonusBuy', 'buyTier', 'freeSpin', 'persistentMultiplier', 'stickyWilds',
        ])
    })

    it('leaves no Wanted reveal over the board once the next spin runs and settles (QA023)', async () => {
        // The historical finding: the poster stayed over a settled result. Two
        // guarantees must both hold — the poster is gone for the whole of the
        // next spin (it is suppressed while reels run), and it does not come
        // back when the round settles without a new mystery symbol.
        fixture.outcome = outcome('wanted-revelation', { mysteryReveal: { id: 'badge', label: 'BADGE' } })
        let tree = await spin('wanted-revelation')
        expect(find(tree, node => node.props?.className?.includes('is-wanted-poster'))).not.toBeNull()
        // Animated path: the mode control is still the `spin()` helper's
        // 'instant' pick, so switch it back and leave the reels mid-flight well
        // inside the poster's 1500ms window.
        tree = render('wanted-revelation')
        find(tree, node => node.props?.value === 'instant' && typeof node.props?.onChange === 'function').props.onChange('normal')
        tree = render('wanted-revelation')
        fixture.outcome = outcome('wanted-revelation', { multiplier: 0 })
        find(tree, node => node.props?.['data-slot-action'] === 'spin').props.onClick()
        vi.advanceTimersByTime(1)
        tree = render('wanted-revelation')
        expect(find(tree, node => node.type === 'button' && node.props?.['aria-label'] === 'Skip animation')).not.toBeNull()
        expect(find(tree, node => node.props?.className?.includes('is-wanted-poster'))).toBeNull()
        // Settle it and step past the poster lifetime: still nothing over the board.
        find(tree, node => node.type === 'button' && node.props?.['aria-label'] === 'Skip animation').props.onClick()
        vi.advanceTimersByTime(1600)
        tree = render('wanted-revelation')
        expect(find(tree, node => node.props?.className?.includes('is-wanted-poster'))).toBeNull()
    })

    it('keeps the settled grid readable: the reveal is a sibling overlay, never a cell cover (QA023)', async () => {
        // Structural half of the finding: the poster must never replace or wrap
        // the settled cells, so the resolved symbols stay in the grid whatever
        // the reveal is doing. Paint order and lifetime need a real browser.
        fixture.outcome = outcome('wanted-revelation', { mysteryReveal: { id: 'badge', label: 'BADGE' } })
        const tree = await spin('wanted-revelation')
        const frame = find(tree, node => node.props?.className === 'slot-reel-frame-v2')
        // The poster is a stage overlay, drawn outside the reel frame.
        expect(find(tree, node => node.props?.className?.includes('is-wanted-poster'))).not.toBeNull()
        expect(find(frame, node => node.props?.className?.includes('is-wanted-poster'))).toBeNull()
        const cells = []
        const collect = node => {
            if (!node || typeof node !== 'object') return
            if (node.props?.['data-slot-cell-index'] !== undefined) cells.push(node)
            ;[node.props?.panel, node.props?.secondary, ...[node.props?.children].flat(Infinity)].forEach(collect)
        }
        collect(frame)
        // 5x4 lines board: every cell still carries its own resolved symbol label.
        expect(cells).toHaveLength(20)
        expect(cells.filter(cell => find(cell, node => node.props?.['data-slot-symbol-label'] !== undefined))).toHaveLength(20)
        // The reveal is drawn outside the grid element, so it cannot occupy a
        // cell slot; it can only overlay the board while its timer runs.
        const grid = find(frame, node => node.props?.className === 'slot-reel-grid')
        expect(find(grid, node => node.props?.className?.includes('is-wanted-poster'))).toBeNull()
    })

    it('opens Autoplay as a native dialog with a persistent opener for focus return (QA026)', () => {
        // The dialog element itself is modal (see useNativeDialog.test.js for
        // Escape/Tab/backdrop). What SlotsGame owes the finding is: a real
        // <dialog>, an opener ref that outlives the drawer, and closing that
        // does not start a spin.
        const opener = { focus: vi.fn(), isConnected: true }
        let tree = render('mummy-cascade')
        find(tree, node => node.props?.['aria-label'] === 'Autoplay').props.onClick({ currentTarget: opener })
        tree = render('mummy-cascade')
        const dialog = find(tree, node => node.type === 'dialog')
        expect(dialog.props['aria-label']).toBe('Autoplay configuration')
        expect(fixture.dialogOpener.current).toBe(opener)
        dialog.props.onCancel({ preventDefault: vi.fn(), stopPropagation: vi.fn() })
        tree = render('mummy-cascade')
        expect(find(tree, node => node.type === 'dialog')).toBeNull()
        expect(fixture.bet).not.toHaveBeenCalled()
        expect(fixture.credit).not.toHaveBeenCalled()
    })

    it('states the autoplay counting policy it actually implements (QA035)', () => {
        // The historical finding was a stop after two rounds. The policy the code
        // enforces — accepted completed rounds, free spins included, busy
        // attempts excluded — is only honest if the dialog says so.
        let tree = render('mummy-cascade')
        find(tree, node => node.props?.['aria-label'] === 'Autoplay').props.onClick({ currentTarget: {} })
        tree = render('mummy-cascade')
        const dialog = find(tree, node => node.type === 'dialog')
        const copy = text(find(dialog, node => node.props?.className === 'slot-panel-note'))
        expect(copy).toContain('Counts completed rounds, including free spins')
        expect(copy).toContain('Busy attempts do not count')
    })

    for (const template of [...SLOT_TEMPLATES, { id: undefined, title: 'generic' }]) {
        for (const fun of [false, true]) {
            it(`shares the selected model across every surface: ${template.title}, Fun ${fun}`, () => {
                fixture.fun = fun
                const tree = render(template.id)
                const config = getSlotTemplate(template.id)
                const expected = config.rtpTarget * (fun ? 1.06 : 1)
                const education = find(tree, node => node.type === EducationPanel)
                expect(tree.props.definition).toBe(education.props.definition)
                expect(tree.props.definition.rtp).toBeCloseTo(expected, 12)
                expect(tree.props.definition.houseEdge).toBeCloseTo(1 - expected, 12)
                expect(education.props.effectiveRtp).toBe(expected)
                expect(text(tree.props.panel)).toContain(`${(expected * 100).toFixed(2)}%`)
                const infoToggle = find(tree, node => node.props?.className === 'slot-panel-info-toggle')
                infoToggle.props.onClick()
                const info = find(render(template.id), node => node.props?.rtpDisclosure)
                expect(info.props.rtpDisclosure.rtp).toBe(expected)
                expect(text(info.type(info.props))).toContain(`${(expected * 100).toFixed(2)}%`)
                expect(text(EducationPanel(education.props))).toContain(`${((1 - expected) * 100).toFixed(2)}%`)
            })
        }
    }

    it('labels Gummy tumble sums as raw multipliers and credits only the resolved return', async () => {
        const cells = outcome('gummy-drops').cells
        fixture.outcome = outcome('gummy-drops', { multiplier: 0.4, cascadeSteps: 1, cascadeFrames: [
            { cells, winCells: [0], stepPayout: 81.75, stepMultiplier: 1 },
            { cells, winCells: [], stepPayout: 0, stepMultiplier: 2 },
        ] })
        const tree = await spin('gummy-drops')
        const raw = text(find(tree, node => node.props?.className === 'slot-cascade-mult'))
        expect(raw).toContain('81.75× raw · not GC')
        expect(raw).toContain('payout scaling, caps and rounding')
        expect(raw).not.toContain('GC 81.75')
        expect(fixture.credit).toHaveBeenCalledExactlyOnceWith(2, 'Gummy Drops return')
    })

    for (const mode of ['normal', 'turbo', 'instant']) it(`counts ten accepted Mummy ${mode} rounds including free rounds, waiting through replay`, async () => {
        const id = 'mummy-cascade'
        let tree = render(id)
        find(tree, node => node.props?.value === 'normal' && node.props?.onChange).props.onChange(mode)
        tree = render(id)
        find(tree, node => node.props?.['aria-label'] === 'Autoplay').props.onClick({ currentTarget: {} })
        tree = render(id)
        find(tree, node => node.props?.className === 'slot-auto-start').props.onClick()
        const cells = outcome(id).cells
        for (let round = 0; round < 10; round += 1) {
            fixture.outcome = outcome(id, { multiplier: 0.2, cascadeSteps: 1, cascadeFrames: [
                { cells, winCells: [0], stepPayout: 1, stepMultiplier: 1 },
                { cells, winCells: [], stepPayout: 0, stepMultiplier: 2 },
            ], featureEvents: round === 0 ? [{ type: 'free-spins', freeSpins: 20, indexes: [] }] : [] })
            render(id)
            autoplayEffect().effect()
            await vi.advanceTimersByTimeAsync(mode === 'instant' ? 221 : 220)
            if (mode !== 'instant') {
                tree = render(id)
                find(tree, node => node.type === 'button' && node.props?.['aria-label'] === 'Skip animation').props.onClick()
                await Promise.resolve()
            }
            tree = render(id)
            expect(fixture.credit).toHaveBeenCalledTimes(round + 1)
            // Running is false during replay: readiness must still block a fresh round.
            autoplayEffect().effect()
            await vi.advanceTimersByTimeAsync(250)
            expect(fixture.credit).toHaveBeenCalledTimes(round + 1)
            await vi.advanceTimersByTimeAsync(1000)
        }
        tree = render(id)
        expect(find(tree, node => node.props?.className === 'slot-autoplay-pill')).toBeNull()
        expect(find(tree, node => node.props?.totalAwarded === 20).props.remaining).toBe(11)
        expect(fixture.bet).toHaveBeenCalledTimes(1)
        expect(fixture.record).toHaveBeenCalledTimes(10)
        expect(fixture.record.mock.calls.filter(([entry]) => entry.meta.freeSpin)).toHaveLength(9)
    })

    it('stops autoplay on a rejected debit without consuming a round (QA035)', async () => {
        // A rejected bet is not an accepted round: it must end the session, leave
        // the count untouched and pay nothing. The historical finding was the
        // opposite shape — the count draining without rounds behind it.
        fixture.bet.mockReturnValue(false)
        const id = 'mummy-cascade'
        let tree = render(id)
        find(tree, node => node.props?.value === 'normal' && node.props?.onChange).props.onChange('instant')
        tree = render(id)
        find(tree, node => node.props?.['aria-label'] === 'Autoplay').props.onClick({ currentTarget: {} })
        tree = render(id)
        find(tree, node => node.props?.className === 'slot-auto-start').props.onClick()
        fixture.outcome = outcome(id, { multiplier: 1 })
        render(id)
        autoplayEffect().effect()
        await vi.advanceTimersByTimeAsync(221)
        tree = render(id)
        expect(fixture.bet).toHaveBeenCalledOnce()
        expect(fixture.bet).toHaveReturnedWith(false)
        expect(fixture.credit).not.toHaveBeenCalled()
        expect(fixture.record).not.toHaveBeenCalled()
        expect(find(tree, node => node.props?.className === 'slot-autoplay-pill')).toBeNull()
    })

    it('honours an armed stop condition after an accepted round, leaving the rest unused (QA035)', async () => {
        const id = 'mummy-cascade'
        let tree = render(id)
        find(tree, node => node.props?.value === 'normal' && node.props?.onChange).props.onChange('instant')
        tree = render(id)
        find(tree, node => node.props?.['aria-label'] === 'Autoplay').props.onClick({ currentTarget: {} })
        tree = render(id)
        const checkboxes = []
        const collect = node => {
            if (!node || typeof node !== 'object') return
            if (node.type === 'input' && node.props?.type === 'checkbox') checkboxes.push(node)
            ;[node.props?.children].flat(Infinity).forEach(collect)
        }
        collect(find(tree, node => node.type === 'dialog'))
        // First checkbox is "Stop on feature trigger" (see the drawer markup).
        checkboxes[0].props.onChange({ target: { checked: true } })
        tree = render(id)
        // The drawer writes React state; the running session reads a ref that a
        // sync effect mirrors into it. Nothing in this harness runs effects
        // automatically, so mirror it explicitly before starting.
        const stops = fixture.state.find(value => value && typeof value === 'object' && 'stopOnFeature' in value)
        expect(stops.stopOnFeature).toBe(true)
        fixture.effects.find(entry => entry.dependencies?.length === 1 && entry.dependencies[0] === stops).effect()
        find(tree, node => node.props?.className === 'slot-auto-start').props.onClick()
        fixture.outcome = outcome(id, { multiplier: 0.5, featureEvents: [{ type: 'free-spins', freeSpins: 4, indexes: [] }] })
        render(id)
        autoplayEffect().effect()
        // Settle the instants that finish the round AND let the outcome callback
        // run, so the stop predicate is evaluated before the assertion.
        await vi.advanceTimersByTimeAsync(221)
        await vi.advanceTimersByTimeAsync(0)
        tree = render(id)
        // One accepted round settled, then the stop condition ended the session.
        expect(fixture.credit).toHaveBeenCalledOnce()
        expect(fixture.record).toHaveBeenCalledOnce()
        expect(find(tree, node => node.props?.className === 'slot-autoplay-pill')).toBeNull()
        // The remaining count is not charged against the player: free spins stay.
        expect(find(tree, node => typeof node.props?.totalAwarded === 'number').props.remaining).toBe(4)
    })

    it('does not spend a round on an autoplay attempt that lands while a spin is in flight (QA035)', async () => {
        // The historical early stop: an autoplay tick landing while another spin
        // owns the lock resolves `{skipped:true}` — no debit, no round, no ledger
        // entry. The tick must be retried, not charged against the count.
        const id = 'mummy-cascade'
        let tree = render(id)
        find(tree, node => node.props?.value === 'normal' && node.props?.onChange).props.onChange('turbo')
        tree = render(id)
        find(tree, node => node.props?.['aria-label'] === 'Autoplay').props.onClick({ currentTarget: {} })
        tree = render(id)
        find(tree, node => node.props?.className === 'slot-auto-start').props.onClick()
        fixture.outcome = outcome(id, { multiplier: 1 })
        render(id)
        autoplayEffect().effect()
        // Take a manual spin that is still animating when the 220 ms autoplay
        // tick fires (turbo reels are mid-flight well past that point).
        find(render(id), node => node.props?.['data-slot-action'] === 'spin').props.onClick()
        vi.advanceTimersByTime(0)
        await vi.advanceTimersByTimeAsync(220)
        tree = render(id)
        expect(find(tree, node => node.type === 'button' && node.props?.['aria-label'] === 'Skip animation')).not.toBeNull()
        // Rejected busy attempt: no round spent, no credit booked, no ledger row.
        expect(text(find(tree, node => node.props?.className === 'slot-autoplay-pill'))).toContain('10')
        expect(fixture.bet).toHaveBeenCalledOnce()
        expect(fixture.record).not.toHaveBeenCalled()

        // Settle the manual round, then let the retried tick run for real.
        find(tree, node => node.type === 'button' && node.props?.['aria-label'] === 'Skip animation').props.onClick()
        await Promise.resolve()
        expect(fixture.record).toHaveBeenCalledOnce()
        render(id)
        autoplayEffect().effect()
        await vi.advanceTimersByTimeAsync(220)
        tree = render(id)
        find(tree, node => node.type === 'button' && node.props?.['aria-label'] === 'Skip animation').props.onClick()
        await Promise.resolve()
        tree = render(id)
        expect(text(find(tree, node => node.props?.className === 'slot-autoplay-pill'))).toContain('9')
        expect(fixture.bet).toHaveBeenCalledTimes(2)
    })

    it('updates the selected model immediately after template and mode switches', () => {
        let tree = render()
        find(tree, node => node.props?.id === 'slot-template').props.onChange({ target: { value: 'bars' } })
        fixture.fun = true
        tree = render()
        expect(tree.props.definition.name).toBe('Bars')
        expect(tree.props.definition.rtp).toBeCloseTo(1.007, 12)
        fixture.fun = false
        find(tree, node => node.props?.id === 'slot-template').props.onChange({ target: { value: 'gummy-drops' } })
        expect(render().props.definition.rtp).toBe(0.94)
    })
})

describe('slots Space shortcut guard (QA028)', () => {
    function matches(selectorList, selectors) {
        return selectorList.split(',').some(selector => selectors.includes(selector.trim()))
    }

    function keyboardTarget(tagName, { attributes = {}, selectors = [], parentElement = null, isContentEditable = false } = {}) {
        const target = {
            tagName,
            parentElement,
            isContentEditable,
            getAttribute: name => attributes[name] ?? null,
            closest(selectorList) {
                return matches(selectorList, [tagName.toLowerCase(), ...selectors])
                    ? target
                    : parentElement?.closest(selectorList) ?? null
            },
        }
        return target
    }

    function renderedDialog(node, style = { display: 'flex', opacity: '1' }) {
        const selectors = (node.props.className?.split(/\s+/) ?? []).map(name => `.${name}`)
        if (node.props.role === 'dialog') selectors.push('[role="dialog"]')
        if (node.props['aria-modal'] === 'true') selectors.push('[aria-modal="true"]')
        return {
            selectors,
            getAttribute: name => node.props[name] ?? null,
            ownerDocument: { defaultView: { getComputedStyle: () => style } },
        }
    }

    // The suite runs without a DOM, so `window` is a recording stub. Renders the
    // real component, executes its recorded effects (registering the shipped
    // keydown listener) and presses Space on a real Event — no copy of the guard.
    function mount(prepare, id = 'bars') {
        const listeners = new Map()
        const dialogs = []
        const doc = new EventTarget()
        doc.body = { nodeType: 1 }
        doc.querySelectorAll = selectorList => dialogs.filter(({ selectors }) => matches(selectorList, selectors))
        vi.stubGlobal('document', doc)
        vi.stubGlobal('window', {
            setTimeout: (fn, ms) => setTimeout(fn, ms),
            clearTimeout: id => clearTimeout(id),
            addEventListener: (type, fn) => listeners.set(type, [...(listeners.get(type) || []), fn]),
            removeEventListener: (type, fn) => listeners.set(type, (listeners.get(type) || []).filter(entry => entry !== fn)),
            dispatchEvent: event => {
                for (const fn of [...(listeners.get(event.type) || [])]) fn(event)
                return !event.defaultPrevented
            },
        })
        fixture.outcome = outcome(id)
        const tree = render(id)
        let refreshShortcut
        for (const [index, entry] of fixture.effects.entries()) {
            const priorListeners = listeners.get('keydown')
            let cleanup = entry.effect()
            if (listeners.get('keydown') !== priorListeners) {
                refreshShortcut = () => {
                    cleanup()
                    cleanup = fixture.effects[index].effect()
                }
            }
            if (typeof cleanup === 'function') cleanups.push(() => cleanup())
        }
        const rerender = () => {
            const nextTree = render(id)
            refreshShortcut()
            return nextTree
        }
        if (prepare) {
            prepare(tree)
            rerender()
        }
        const send = event => {
            for (const fn of [...(listeners.get('keydown') || [])]) fn(event)
            return event
        }
        const press = (as = {}, target = keyboardTarget('DIV')) => send(Object.defineProperties(new Event('keydown', { cancelable: true }), {
            key: { value: ' ' }, code: { value: 'Space' }, target: { value: target },
            repeat: { value: false }, ctrlKey: { value: false }, metaKey: { value: false }, altKey: { value: false }, shiftKey: { value: false },
            ...as,
        }))
        return { press, send, dialogs, rerender }
    }

    it.each([
        ['Game tools button', keyboardTarget('BUTTON')],
        ['icon inside the Mute button', keyboardTarget('svg', { parentElement: keyboardTarget('BUTTON') })],
        ['sidebar summary', keyboardTarget('SUMMARY')],
        ['link', keyboardTarget('A', { attributes: { href: '/hub' }, selectors: ['a[href]'] })],
        ['reel Freeze control', keyboardTarget('DIV', { attributes: { role: 'button' }, selectors: ['[role="button"]'] })],
        ['Spin button', keyboardTarget('BUTTON', { selectors: ['[data-slot-action="spin"]'] })],
    ])('leaves Space to the %s without placing a paid round', (_name, target) => {
        const page = mount()
        const event = page.press({}, target)
        expect(event.defaultPrevented).toBe(false)
        expect(fixture.bet).not.toHaveBeenCalled()
        expect(fixture.record).not.toHaveBeenCalled()
    })

    it.each([
        ['native Game odds dialog', ['dialog[open]'], { 'aria-label': 'Game odds and probability' }],
        ['Keyboard shortcuts overlay', ['[role="dialog"]', '[aria-modal="true"]', 'dialog[open]'], {
            role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Keyboard shortcuts',
        }],
    ])('blocks playfield Space while the %s is open and restores it on close', (_name, selectors, attributes) => {
        const page = mount()
        page.dialogs.push({ selectors, getAttribute: name => attributes[name] ?? null })
        expect(page.press({}, keyboardTarget('BUTTON')).defaultPrevented).toBe(false)
        expect(page.press().defaultPrevented).toBe(false)
        expect(fixture.bet).not.toHaveBeenCalled()
        expect(fixture.record).not.toHaveBeenCalled()

        page.dialogs.pop()
        expect(page.press().defaultPrevented).toBe(true)
        expect(fixture.bet).toHaveBeenCalledExactlyOnceWith(5, 'Bars spin')
    })

    it('spins once from playfield Space with the Volume mixer open but yields to a mixer control', () => {
        const page = mount()
        const selectors = ['[role="dialog"]']
        const mixer = keyboardTarget('DIV', { attributes: { role: 'dialog', 'aria-label': 'Volume mixer' }, selectors })
        mixer.selectors = selectors
        const computedStyle = { display: 'block', visibility: 'visible', opacity: '1', pointerEvents: 'auto' }
        mixer.ownerDocument = { defaultView: { getComputedStyle: () => computedStyle } }
        page.dialogs.push(mixer)

        document.activeElement = keyboardTarget('BUTTON', { attributes: { 'aria-label': 'Mute music' }, parentElement: mixer })
        expect(page.press({}, document.activeElement).defaultPrevented).toBe(false)
        expect(fixture.bet).not.toHaveBeenCalled()

        document.activeElement = keyboardTarget('DIV')
        const event = page.press({}, document.activeElement)
        expect(fixture.bet).toHaveBeenCalledExactlyOnceWith(5, 'Bars spin')
        expect(event.defaultPrevented).toBe(true)
    })

    it('releases playfield Space on desktop resize and keeps the paytable closed on return to mobile', () => {
        fixture.mobile = true
        const page = mount(tree => {
            find(tree, node => node.props?.['aria-label'] === 'View paytable and rules').props.onClick()
        })

        let tree = render('bars')
        const findPaytable = () => find(tree, node => node.props?.role === 'dialog' && node.props?.['aria-label'] === 'Bars paytable and rules')
        // Query the rendered sheet, not the viewport: its own display is flex
        // even when desktop CSS hides the backdrop that contains it.
        document.querySelectorAll = selectors => {
            const sheet = findPaytable()
            if (!sheet) return []
            const dialog = renderedDialog(sheet)
            return matches(selectors, dialog.selectors) ? [dialog] : []
        }

        expect(findPaytable()).not.toBeNull()
        expect(page.press().defaultPrevented).toBe(false)
        expect(fixture.bet).not.toHaveBeenCalled()

        fixture.mobile = false
        tree = render('bars')
        expect(page.press().defaultPrevented).toBe(true)
        expect(fixture.bet).toHaveBeenCalledExactlyOnceWith(5, 'Bars spin')

        fixture.mobile = true
        tree = render('bars')
        expect(findPaytable()).toBeNull()
    })

    it.each([
        keyboardTarget('INPUT'), keyboardTarget('TEXTAREA'), keyboardTarget('SELECT'),
        keyboardTarget('DIV', { isContentEditable: true }),
        keyboardTarget('SPAN', { parentElement: keyboardTarget('DIV', { attributes: { role: 'textbox' } }) }),
    ])('yields Space to the editable target $tagName', target => {
        const page = mount()
        expect(page.press({}, target).defaultPrevented).toBe(false)
        expect(fixture.bet).not.toHaveBeenCalled()
        expect(fixture.record).not.toHaveBeenCalled()
    })

    it.each(['ctrlKey', 'metaKey', 'altKey', 'shiftKey'])('yields Space with %s held', modifier => {
        const page = mount()
        expect(page.press({ [modifier]: { value: true } }).defaultPrevented).toBe(false)
        expect(fixture.bet).not.toHaveBeenCalled()
        expect(fixture.record).not.toHaveBeenCalled()
    })

    it('leaves playfield Space alone while the Autoplay drawer is open', () => {
        const page = mount(tree => {
            find(tree, node => node.type === 'button' && node.props?.['aria-label'] === 'Autoplay').props.onClick({ currentTarget: {} })
        })
        expect(page.press().defaultPrevented).toBe(false)
        expect(fixture.bet).not.toHaveBeenCalled()
    })

    it.each([
        ['Buy bonus tier', 'vault-rush', 'Vault Rush spin', false, node => text(node).trim() === 'Buy'],
        ['Adjust bet', 'bars', 'Bars spin', true, node => node.props?.['aria-label'] === 'Edit bet'],
    ])('blocks playfield Space while %s is open and restores it on close', (label, id, spinLabel, mobile, isOpener) => {
        fixture.mobile = mobile
        const page = mount(tree => {
            find(tree, node => node.type === 'button' && isOpener(node)).props.onClick()
        }, id)
        const findDialog = tree => find(tree, node => node.props?.role === 'dialog' && node.props?.['aria-label'] === label)
        const dialog = findDialog(render(id))
        expect(dialog).not.toBeNull()
        page.dialogs.push(renderedDialog(dialog))
        expect(page.press().defaultPrevented).toBe(false)
        expect(fixture.bet).not.toHaveBeenCalled()

        find(dialog, node => node.type === 'button' && node.props?.['aria-label'] === 'Close').props.onClick()
        expect(findDialog(page.rerender())).toBeNull()
        page.dialogs.pop()
        expect(page.press().defaultPrevented).toBe(true)
        expect(fixture.bet).toHaveBeenCalledExactlyOnceWith(5, spinLabel)
    })

    it('blocks playfield Space while Adjust bet is visible past the mobile breakpoint', () => {
        fixture.mobile = true
        const page = mount(tree => {
            find(tree, node => node.type === 'button' && node.props?.['aria-label'] === 'Edit bet').props.onClick()
        })

        // At 768.5px the mobile hook is false, but CSS hides the sheet only at 769px and up.
        fixture.mobile = false
        const sheet = find(page.rerender(), node => node.props?.role === 'dialog' && node.props?.['aria-label'] === 'Adjust bet')
        expect(sheet).not.toBeNull()
        const style = { display: 'flex', opacity: '1' }
        page.dialogs.push(renderedDialog(sheet, style))
        expect(page.press().defaultPrevented).toBe(false)
        expect(fixture.bet).not.toHaveBeenCalled()

        style.display = 'none'
        expect(page.press().defaultPrevented).toBe(true)
        expect(fixture.bet).toHaveBeenCalledExactlyOnceWith(5, 'Bars spin')
    })

    it('spins once from playfield Space and ignores held Space after the round settles', async () => {
        const page = mount(tree => {
            find(tree, node => node.props?.value === 'normal' && typeof node.props?.onChange === 'function').props.onChange('instant')
        })
        const event = page.press()
        expect(event.defaultPrevented).toBe(true)
        await vi.advanceTimersByTimeAsync(0)
        expect(fixture.record).toHaveBeenCalledOnce()
        expect(page.press({ repeat: { value: true } }).defaultPrevented).toBe(false)
        expect(fixture.bet).toHaveBeenCalledExactlyOnceWith(5, 'Bars spin')
        expect(fixture.record).toHaveBeenCalledOnce()
    })

    it('leaves a running round alone for a button or open dialog and still allows playfield Space to skip', () => {
        const page = mount(tree => {
            find(tree, node => node.props?.['aria-label'] === 'Spin').props.onClick()
        })
        expect(fixture.bet).toHaveBeenCalledOnce()
        expect(page.press({ repeat: { value: true } }).defaultPrevented).toBe(false)
        expect(page.press({}, keyboardTarget('BUTTON')).defaultPrevented).toBe(false)
        page.dialogs.push({ selectors: ['dialog[open]'], getAttribute: () => null })
        expect(page.press().defaultPrevented).toBe(false)
        expect(fixture.record).not.toHaveBeenCalled()

        page.dialogs.pop()
        expect(page.press().defaultPrevented).toBe(true)
        expect(fixture.record).toHaveBeenCalledOnce()
        expect(fixture.bet).toHaveBeenCalledOnce()
    })

    it('refuses a repeated key and a press another layer already consumed', () => {
        const page = mount()
        const held = page.press({ repeat: { value: true } })
        expect(fixture.bet).not.toHaveBeenCalled()
        expect(held.defaultPrevented).toBe(false)
        // A layer above slots (an open dialog, the hotkey help) already called
        // preventDefault: the playfield shortcut must yield instead of stacking
        // a second action on the same keystroke.
        const consumed = new Event('keydown', { cancelable: true })
        Object.defineProperties(consumed, {
            key: { value: ' ' }, code: { value: 'Space' }, repeat: { value: false },
            target: { value: { tagName: 'DIV', isContentEditable: false, closest: () => null } },
        })
        consumed.preventDefault()
        page.send(consumed)
        expect(fixture.bet).not.toHaveBeenCalled()
    })
})
