import { describe, expect, it } from 'vitest'
import {
    SLOT_HOLD_NEW_TILE_PULSE_MS,
    SLOT_RETRIGGER_FLY_MS,
    SLOT_WHEEL_WOBBLE_MS,
    CASCADE_STEP_MS,
    SLOT_REEL_SPIN_DURATION_MS,
    SLOT_REEL_TICKER_MS,
    buildSlotAnticipationTiming,
    buildSlotFeatureDemoState,
    buildSlotStopSchedule,
    buildCascadeTraceCells,
    buildCascadeTimeline,
    cascadeTimelineDurationMs,
    getSlotReelSpinDurationMs,
    getSlotTickerIntervalMs,
    buildHoldTileStates,
    buildRetriggerFlyers,
    getCellCenterPercent,
} from './slotsMotion'

describe('slot motion helpers', () => {
    it('marks only newly filled hold-and-respin tiles as fresh', () => {
        const tiles = buildHoldTileStates({
            size: 6,
            startFilled: 2,
            finalFilled: 5,
        })

        expect(tiles.filter(tile => tile.filled).map(tile => tile.index)).toEqual([0, 1, 2, 3, 4])
        expect(tiles.filter(tile => tile.fresh).map(tile => tile.index)).toEqual([2, 3, 4])
        expect(tiles.find(tile => tile.index === 1).fresh).toBe(false)
        expect(tiles.find(tile => tile.index === 4).delayMs).toBeGreaterThan(tiles.find(tile => tile.index === 2).delayMs)
    })

    it('honors explicit hold tile indexes from the resolver', () => {
        const tiles = buildHoldTileStates({
            size: 6,
            startFilled: 2,
            finalFilled: 4,
            filledIndexes: [0, 3, 4, 5],
            newFillIndexes: [4, 5],
        })

        expect(tiles.filter(tile => tile.filled).map(tile => tile.index)).toEqual([0, 3, 4, 5])
        expect(tiles.filter(tile => tile.fresh).map(tile => tile.index)).toEqual([4, 5])
    })

    it('computes cell centers for uniform and variable-height columns', () => {
        const uniformPositions = [
            { col: 0, row: 0 },
            { col: 0, row: 1 },
            { col: 1, row: 0 },
            { col: 1, row: 1 },
        ]
        expect(getCellCenterPercent(2, uniformPositions, { cols: 2, rows: 2 })).toEqual({ x: 75, y: 25 })

        const megawaysPositions = [
            { col: 0, row: 0 },
            { col: 1, row: 0 },
            { col: 1, row: 1 },
            { col: 1, row: 2 },
        ]
        expect(getCellCenterPercent(3, megawaysPositions, { cols: 2, rows: 3 })).toEqual({ x: 75, y: 83.33333333333334 })
    })

    it('builds retrigger flyers from scatter cells toward the free-spin pill', () => {
        const flyers = buildRetriggerFlyers({
            indexes: [0, 3, 3],
            amount: 6,
            trigger: 123,
            layout: { cols: 2, rows: 2 },
            cellPositions: [
                { col: 0, row: 0 },
                { col: 0, row: 1 },
                { col: 1, row: 0 },
                { col: 1, row: 1 },
            ],
        })

        expect(flyers).toHaveLength(2)
        expect(flyers[0]).toMatchObject({ id: '123-0-0', amount: 6, fromX: 25, fromY: 25, toX: 88, toY: -18 })
        expect(flyers[1].delayMs).toBeGreaterThan(flyers[0].delayMs)
    })

    it('caps cascade trace cells and keeps position data', () => {
        const cellPositions = Array.from({ length: 10 }, (_, index) => ({ col: index % 5, row: Math.floor(index / 5) }))
        const traces = buildCascadeTraceCells({
            indexes: [0, 1, 2, 3, 4, 5],
            cellPositions,
            layout: { cols: 5, rows: 2 },
            limit: 3,
        })

        expect(traces).toHaveLength(3)
        expect(traces[0]).toMatchObject({ id: 'trace-0-0', x: 10, y: 25 })
        expect(traces[2].delayMs).toBeGreaterThan(traces[0].delayMs)
    })

    it('keeps requested motion timings explicit', () => {
        expect(SLOT_WHEEL_WOBBLE_MS).toBe(350)
        expect(SLOT_HOLD_NEW_TILE_PULSE_MS).toBe(200)
        expect(SLOT_RETRIGGER_FLY_MS).toBe(320)
    })

    it('builds a deterministic QA state for feature visual checks', () => {
        const demo = buildSlotFeatureDemoState({
            layout: { cols: 5, rows: 3 },
            scatterIndexes: [0, 7, 14],
            retriggerAmount: 8,
            wheelValue: 25,
            holdBoard: {
                size: 6,
                startFilled: 2,
                finalFilled: 5,
                filledIndexes: [0, 1, 2, 4, 5],
                newFillIndexes: [2, 4, 5],
            },
            trigger: 99,
        })

        expect(demo.scatterCells.map(cell => cell.index)).toEqual([0, 7, 14])
        expect(demo.wheel).toEqual({ value: 25, wobbleMs: SLOT_WHEEL_WOBBLE_MS })
        expect(demo.holdTiles.filter(tile => tile.fresh).map(tile => tile.index)).toEqual([2, 4, 5])
        expect(demo.retriggerFlyers.map(flyer => flyer.id)).toEqual(['99-0-0', '99-7-1', '99-14-2'])
        expect(demo.retriggerFlyers.every(flyer => flyer.amount === 8)).toBe(true)
    })
})

describe('slot reel cadence', () => {
    it('SC-SLOT-001 builds a deterministic monotonic normal stop schedule', () => {
        // Given: five columns in normal motion.
        const schedule = buildSlotStopSchedule({ cols: 5, mode: 'normal' })

        // When: the schedule is built.
        const delays = schedule.stops.map(stop => stop.atMs)

        // Then: each stop lands after the previous stop and total delay includes settle time.
        expect(delays).toEqual([...delays].sort((a, b) => a - b))
        expect(new Set(delays).size).toBe(delays.length)
        expect(schedule.stops.map(stop => stop.col)).toEqual([1, 2, 3, 4, 5])
        expect(schedule.totalDelayMs).toBe(delays[delays.length - 1] + schedule.settleDelayMs)
    })

    it('SC-SLOT-001 makes turbo shorter than normal while preserving every column stop', () => {
        // Given: matching normal and turbo schedules.
        const normal = buildSlotStopSchedule({ cols: 5, mode: 'normal' })
        const turbo = buildSlotStopSchedule({ cols: 5, mode: 'turbo' })

        // When: comparing stop and total timings.
        const normalLast = normal.stops[normal.stops.length - 1].atMs
        const turboLast = turbo.stops[turbo.stops.length - 1].atMs

        // Then: turbo is strictly shorter but keeps the same stop columns.
        expect(turboLast).toBeLessThan(normalLast)
        expect(turbo.totalDelayMs).toBeLessThan(normal.totalDelayMs)
        expect(turbo.stops.map(stop => stop.col)).toEqual(normal.stops.map(stop => stop.col))
    })

    it('SC-SLOT-001 collapses reduced-motion and instant schedules to the final state', () => {
        // Given: reduced-motion and instant callers.
        const reduced = buildSlotStopSchedule({ cols: 5, mode: 'normal', reduceMotion: true })
        const instant = buildSlotStopSchedule({ cols: 5, mode: 'instant' })

        // When: timing is generated.
        const reducedDelays = reduced.stops.map(stop => stop.atMs)
        const instantDelays = instant.stops.map(stop => stop.atMs)

        // Then: both skip staggered reel timing and finish at once.
        expect(reducedDelays).toEqual([0])
        expect(instantDelays).toEqual([0])
        expect(reduced.stops[0].col).toBe(5)
        expect(instant.stops[0].col).toBe(5)
        expect(reduced.totalDelayMs).toBe(0)
        expect(instant.totalDelayMs).toBe(0)
    })

    it('SC-SLOT-001 extends anticipation only for final columns', () => {
        // Given: anticipation begins on the penultimate reel.
        const schedule = buildSlotStopSchedule({
            cols: 5,
            mode: 'normal',
            anticipation: buildSlotAnticipationTiming({ cols: 5, enabled: true }),
        })
        const normal = buildSlotStopSchedule({ cols: 5, mode: 'normal' })

        // When: stop deltas are compared.
        const deltas = schedule.stops.map((stop, index) => stop.atMs - (schedule.stops[index - 1]?.atMs || 0))
        const normalDeltas = normal.stops.map((stop, index) => stop.atMs - (normal.stops[index - 1]?.atMs || 0))

        // Then: only the last two columns are stretched.
        expect(deltas.slice(0, 3)).toEqual(normalDeltas.slice(0, 3))
        expect(deltas[3]).toBeGreaterThan(normalDeltas[3])
        expect(deltas[4]).toBeGreaterThan(normalDeltas[4])
        expect(schedule.anticipation?.fromCol).toBe(3)
    })

    it('SC-SLOT-002 maps ticker interval and CSS spin duration to normal/turbo cadence', () => {
        // Given: normal, turbo, reduced-motion, and instant modes.
        const normalTicker = getSlotTickerIntervalMs({ mode: 'normal' })
        const turboTicker = getSlotTickerIntervalMs({ mode: 'turbo' })
        const normalDuration = getSlotReelSpinDurationMs({ mode: 'normal' })
        const turboDuration = getSlotReelSpinDurationMs({ mode: 'turbo' })

        // When: comparing cadence tokens.
        // Then: turbo ticks and visible reel motion are faster; reduced/instant collapse.
        expect(normalTicker).toBe(SLOT_REEL_TICKER_MS.normal)
        expect(turboTicker).toBe(SLOT_REEL_TICKER_MS.turbo)
        expect(getSlotTickerIntervalMs({ mode: 'normal', reduceMotion: true })).toBe(0)
        expect(getSlotTickerIntervalMs({ mode: 'instant' })).toBe(0)
        expect(normalDuration).toBe(SLOT_REEL_SPIN_DURATION_MS.normal)
        expect(turboDuration).toBeLessThan(normalDuration)
        expect(getSlotReelSpinDurationMs({ mode: 'instant' })).toBe(0)
    })
})

describe('cascade tumble timeline', () => {
    const frames = [
        { cells: ['a', 'b', 'c', 'd'], winCells: [0, 1], stepPayout: 2, stepMultiplier: 1 },
        { cells: ['x', 'y', 'c', 'd'], winCells: [0], stepPayout: 3, stepMultiplier: 2 },
        { cells: ['z', 'y', 'c', 'd'], winCells: [], stepPayout: 0, stepMultiplier: 0 },
    ]

    it('returns empty for trivial (0 or 1 frame) chains', () => {
        expect(buildCascadeTimeline([])).toEqual([])
        expect(buildCascadeTimeline([frames[0]])).toEqual([])
    })

    it('conserves the final board: replaying lands exactly on the last frame cells', () => {
        const timeline = buildCascadeTimeline(frames)
        const settled = timeline[timeline.length - 1]
        expect(settled.cells).toEqual(frames[frames.length - 1].cells)
        expect(settled.isFinal).toBe(true)
        // The final frame never marks cells as popping (nothing refills after it).
        expect(settled.popCells).toEqual([])
    })

    it('marks each non-final frame win cells as popping and schedules monotonically', () => {
        const timeline = buildCascadeTimeline(frames)
        expect(timeline).toHaveLength(3)
        expect(timeline[0].popCells).toEqual([0, 1])
        expect(timeline[1].popCells).toEqual([0])
        let prev = -1
        for (const frame of timeline) {
            expect(frame.atMs).toBeGreaterThan(prev)
            prev = frame.atMs
        }
        expect(cascadeTimelineDurationMs(timeline)).toBe(timeline[timeline.length - 1].atMs)
    })

    it('turbo halves the per-step interval', () => {
        const normal = buildCascadeTimeline(frames)
        const fast = buildCascadeTimeline(frames, { turbo: true })
        expect(fast[1].atMs).toBeLessThan(normal[1].atMs)
        expect(normal[1].atMs).toBe(CASCADE_STEP_MS)
    })

    it('reduced-motion collapses to a single instant jump to the final board', () => {
        const timeline = buildCascadeTimeline(frames, { reduceMotion: true })
        expect(timeline).toHaveLength(1)
        expect(timeline[0].atMs).toBe(0)
        expect(timeline[0].cells).toEqual(frames[frames.length - 1].cells)
        expect(timeline[0].popCells).toEqual([])
        expect(timeline[0].isFinal).toBe(true)
    })
})
