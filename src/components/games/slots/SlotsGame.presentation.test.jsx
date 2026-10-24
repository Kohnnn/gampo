import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({ state: [], refs: [], stateCursor: 0, refCursor: 0, effects: [], outcome: null, fun: false, reduceMotion: false, animations: true, credit: vi.fn() }))
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
vi.mock('../../../context/CreditContext', () => ({ useCredits: () => ({ balance: 1000, placeBet: () => true, addWinnings: fixture.credit, showToast: () => {} }) }))
vi.mock('../../../audio/AudioProvider', () => ({ useAudio: () => ({ play: () => {} }) }))
vi.mock('../../../audio/useSfx', () => ({ useSfx: () => ({ play: () => {} }) }))
vi.mock('../../../audio/useBgm', () => ({ useBgm: () => {} }))
vi.mock('../../../hooks/useSettings', () => ({ useSettings: () => ({ reduceMotion: fixture.reduceMotion, animations: fixture.animations, haptics: false, quickSpin: false }) }))
vi.mock('../../../hooks/useIsMobileViewport', () => ({ useIsMobileViewport: () => false }))
vi.mock('../../../hooks/useProgress', () => ({ recordFeatureEvent: () => {} }))
vi.mock('../../../utils/gameFeedback', () => ({ FEEDBACK_EVENTS: {}, playFeedback: () => {} }))
vi.mock('../../../utils/funMode', () => ({ FUN_PAYOUT_BOOST: 1.06, useFunMode: () => [fixture.fun], isFunMode: () => fixture.fun }))
vi.mock('../primitives/useNativeDialog', () => ({ default: () => ({ current: null }) }))
vi.mock('../primitives', () => {
    const Empty = () => null
    return { Asset: Empty, BigWinOverlay: Empty, GameShell: Empty, HistoryDrawer: Empty, RecentResultsStrip: Empty, StatsOverlay: Empty, useGameSession: () => ({ history: [], stats: {}, record: () => {}, clear: () => {} }) }
})
vi.mock('./slotFactory', async () => ({
    ...await vi.importActual('./slotFactory'),
    makeInitialGrid: config => Array(config.layout.evaluation === 'megaways' ? config.layout.columnRows.reduce((sum, rows) => sum + rows, 0) : config.layout.rows * config.layout.cols).fill(config.symbols[0]),
    resolveSlotSpin: () => fixture.outcome,
}))

import SlotsGame from './SlotsGame'
import EducationPanel from '../../EducationPanel'
import { getSlotTemplate } from './slotFactory'
import WinPathOverlay from '../primitives/WinPathOverlay'
import { buildCascadeTimeline, cascadeTimelineDurationMs } from './slotsMotion'
import { claimEscape } from '../../../utils/escapeClaims'

function render(id = 'wanted-revelation') {
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

beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('window', globalThis)
    fixture.state = []; fixture.refs = []; fixture.effects = []; fixture.fun = false; fixture.reduceMotion = false; fixture.animations = true
    fixture.credit.mockClear()
})
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals() })

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
        find(tree, node => node.type === 'button' && node.props?.['aria-label'] === 'Autoplay').props.onClick()
        tree = render('mummy-cascade')
        const dialog = find(tree, node => node.type === 'dialog' && node.props?.['aria-label'] === 'Autoplay configuration')
        expect(dialog).not.toBeNull()
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
})
