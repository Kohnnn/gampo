export const SLOT_WHEEL_WOBBLE_MS = 350
export const SLOT_HOLD_NEW_TILE_PULSE_MS = 200
export const SLOT_RETRIGGER_FLY_MS = 320
export const SLOT_CASCADE_TRACE_MS = 520

// Per-step duration of a real tumble (pop winning symbols -> collapse -> refill).
// Turbo halves it; reduced-motion skips the stepping entirely (jump to final).
export const CASCADE_STEP_MS = 620
export const CASCADE_POP_FRACTION = 0.42 // portion of a step spent on the pop before refill

export const SLOT_REEL_TICKER_MS = Object.freeze({ normal: 85, turbo: 55 })
export const SLOT_REEL_SPIN_DURATION_MS = Object.freeze({ normal: 85, turbo: 55 })
export const SLOT_REEL_SETTLE_MS = Object.freeze({ normal: 360, turbo: 180 })
export const SLOT_REEL_BASE_STOP_MS = Object.freeze({ normal: 200, turbo: 80 })
export const SLOT_REEL_ANTICIPATION_MULTIPLIER = 1.65

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value))
}

function toFiniteNumber(value, fallback = 0) {
    const next = Number(value)
    return Number.isFinite(next) ? next : fallback
}

function uniqueNumbers(values = []) {
    return Array.from(new Set(values.map(value => Number(value)).filter(Number.isFinite)))
}

function normalizeSpinMode(mode = 'normal') {
    return mode === 'turbo' || mode === 'instant' ? mode : 'normal'
}

function getMotionSpeedKey({ mode = 'normal', reduceMotion = false } = {}) {
    return normalizeSpinMode(mode) === 'turbo' || reduceMotion ? 'turbo' : 'normal'
}

export function getSlotTickerIntervalMs({ mode = 'normal', reduceMotion = false } = {}) {
    const nextMode = normalizeSpinMode(mode)
    if (nextMode === 'instant' || reduceMotion) return 0
    return SLOT_REEL_TICKER_MS[getMotionSpeedKey({ mode: nextMode, reduceMotion })]
}

export function getSlotReelSpinDurationMs({ mode = 'normal', reduceMotion = false } = {}) {
    const nextMode = normalizeSpinMode(mode)
    if (nextMode === 'instant' || reduceMotion) return 0
    return SLOT_REEL_SPIN_DURATION_MS[getMotionSpeedKey({ mode: nextMode, reduceMotion })]
}

export function buildSlotAnticipationTiming({ cols = 5, enabled = false, multiplier = SLOT_REEL_ANTICIPATION_MULTIPLIER } = {}) {
    const reelCount = Math.max(1, Math.floor(toFiniteNumber(cols, 1)))
    if (!enabled || reelCount < 3) return null
    return {
        fromCol: Math.max(1, reelCount - 2),
        multiplier: Math.max(1, toFiniteNumber(multiplier, SLOT_REEL_ANTICIPATION_MULTIPLIER)),
    }
}

export function buildSlotStopSchedule({ cols = 5, mode = 'normal', reduceMotion = false, anticipation = null } = {}) {
    const reelCount = Math.max(0, Math.floor(toFiniteNumber(cols, 0)))
    if (!reelCount) return { stops: [], settleDelayMs: 0, totalDelayMs: 0, anticipation: null }

    const nextMode = normalizeSpinMode(mode)
    if (nextMode === 'instant' || reduceMotion) {
        return {
            stops: [{ col: reelCount, atMs: 0, deltaMs: 0, anticipating: false }],
            settleDelayMs: 0,
            totalDelayMs: 0,
            anticipation: null,
        }
    }

    const speedKey = getMotionSpeedKey({ mode: nextMode, reduceMotion })
    const settleDelayMs = SLOT_REEL_SETTLE_MS[speedKey]
    const baseStopMs = SLOT_REEL_BASE_STOP_MS[speedKey]
    const activeAnticipation = anticipation?.fromCol ? anticipation : null
    const stops = []
    let cumulative = 0
    let previousStopAt = 0

    for (let col = 1; col <= reelCount; col += 1) {
        const ratio = col / reelCount
        const targetStopAt = Math.round(baseStopMs * reelCount * (1 - Math.pow(1 - ratio, 3)))
        const deltaMs = targetStopAt - previousStopAt
        const isAnticipating = Boolean(activeAnticipation && col > activeAnticipation.fromCol)
        const adjustedDeltaMs = isAnticipating ? Math.round(deltaMs * activeAnticipation.multiplier) : deltaMs
        cumulative += adjustedDeltaMs
        previousStopAt = targetStopAt
        stops.push({ col, atMs: cumulative, deltaMs: adjustedDeltaMs, anticipating: isAnticipating })
    }

    return {
        stops,
        settleDelayMs,
        totalDelayMs: cumulative + settleDelayMs,
        anticipation: activeAnticipation,
    }
}

export function buildHoldTileStates(board = {}) {
    const size = Math.max(0, Math.floor(toFiniteNumber(board.size, 0)))
    if (!size) return []

    const startFilled = clamp(Math.floor(toFiniteNumber(board.startFilled, 0)), 0, size)
    const finalFilled = clamp(Math.floor(toFiniteNumber(board.finalFilled, startFilled)), startFilled, size)
    const fallbackFilled = Array.from({ length: finalFilled }, (_, index) => index)
    const filledIndexes = uniqueNumbers(board.filledIndexes?.length ? board.filledIndexes : fallbackFilled)
        .filter(index => index >= 0 && index < size)
    const fallbackFresh = Array.from({ length: Math.max(0, finalFilled - startFilled) }, (_, offset) => startFilled + offset)
    const freshIndexes = uniqueNumbers(board.newFillIndexes?.length ? board.newFillIndexes : fallbackFresh)
        .filter(index => filledIndexes.includes(index))

    return Array.from({ length: size }, (_, index) => {
        const freshOrder = freshIndexes.indexOf(index)
        return {
            index,
            filled: filledIndexes.includes(index),
            fresh: freshOrder >= 0,
            delayMs: freshOrder >= 0 ? freshOrder * 34 : 0,
        }
    })
}

export function getCellCenterPercent(index, cellPositions = [], layout = {}) {
    const position = cellPositions[index]
    if (!position) return null
    const cols = Math.max(1, Math.floor(toFiniteNumber(layout.cols, 1)))
    const rowsInColumn = Math.max(
        1,
        cellPositions.filter(item => item?.col === position.col).length || toFiniteNumber(layout.rows, 1),
    )
    return {
        x: ((position.col + 0.5) / cols) * 100,
        y: ((position.row + 0.5) / rowsInColumn) * 100,
    }
}

export function buildRetriggerFlyers({ indexes = [], cellPositions = [], layout = {}, amount = 0, trigger = Date.now() } = {}) {
    return uniqueNumbers(indexes)
        .map((index, order) => {
            const center = getCellCenterPercent(index, cellPositions, layout)
            if (!center) return null
            return {
                id: `${trigger}-${index}-${order}`,
                index,
                amount,
                fromX: center.x,
                fromY: center.y,
                toX: 88,
                toY: -18,
                delayMs: order * 42,
            }
        })
        .filter(Boolean)
}

export function buildCascadeTraceCells({ indexes = [], cellPositions = [], layout = {}, limit = 18 } = {}) {
    return uniqueNumbers(indexes)
        .slice(0, Math.max(0, limit))
        .map((index, order) => {
            const center = getCellCenterPercent(index, cellPositions, layout)
            if (!center) return null
            return {
                id: `trace-${index}-${order}`,
                index,
                x: center.x,
                y: center.y,
                delayMs: order * 22,
            }
        })
        .filter(Boolean)
}

function defaultCellPositions(layout = {}) {
    const cols = Math.max(1, Math.floor(toFiniteNumber(layout.cols, 5)))
    const rows = Math.max(1, Math.floor(toFiniteNumber(layout.rows, 3)))
    return Array.from({ length: cols * rows }, (_, index) => ({
        col: index % cols,
        row: Math.floor(index / cols),
    }))
}

// Turn the engine's cascadeFrames into a playable UI timeline. Each step in the
// returned timeline tells the renderer which board to show, which cells are
// "popping" (about to clear), the running payout, and the absolute clock time
// at which to apply it. The renderer just walks the timeline with setTimeout.
//
// Conservation guarantee: the final timeline entry's `cells` is always the last
// frame's board (the settled grid), so replaying the timeline lands exactly on
// the engine's resolved cells. Reduced-motion / instant callers can ignore the
// timing and jump straight to the last entry.
export function buildCascadeTimeline(frames = [], { stepMs = CASCADE_STEP_MS, turbo = false, reduceMotion = false } = {}) {
    const list = Array.isArray(frames) ? frames.filter(Boolean) : []
    if (list.length <= 1) return []
    // reduced-motion: a single jump to the final board, no intermediate pops.
    if (reduceMotion) {
        const finalFrame = list[list.length - 1]
        return [{
            index: list.length - 1,
            atMs: 0,
            cells: [...(finalFrame.cells || [])],
            winCells: [],
            popCells: [],
            stepPayout: 0,
            stepMultiplier: finalFrame.stepMultiplier ?? 0,
            isFinal: true,
        }]
    }
    const perStep = Math.max(120, Math.round((turbo ? stepMs / 2 : stepMs)))
    const timeline = []
    let clock = 0
    for (let i = 0; i < list.length; i += 1) {
        const frame = list[i]
        const winCells = uniqueNumbers(frame.winCells || [])
        timeline.push({
            index: i,
            atMs: clock,
            cells: [...(frame.cells || [])],
            // Cells that win on THIS board will pop, then the NEXT frame refills.
            winCells,
            popCells: i < list.length - 1 ? winCells : [],
            stepPayout: toFiniteNumber(frame.stepPayout, 0),
            stepMultiplier: toFiniteNumber(frame.stepMultiplier, 0),
            isFinal: i === list.length - 1,
        })
        clock += perStep
    }
    return timeline
}

export function cascadeTimelineDurationMs(timeline = []) {
    if (!Array.isArray(timeline) || !timeline.length) return 0
    return timeline[timeline.length - 1].atMs
}

// Sum of every step's `stepPayout`. The UI uses this to display the running
// total that has landed so far during the tumble replay (the per-step
// `stepPayout` from the engine). Reduced-motion callers still get the full
// sum even though only the final frame renders — the engine's `cascadeSteps`
// is what guarantees the math.
export function sumCascadeStepPayouts(frames = []) {
    if (!Array.isArray(frames) || !frames.length) return 0
    return frames.reduce((total, frame) => {
        const payout = Number(frame?.stepPayout)
        return Number.isFinite(payout) ? total + payout : total
    }, 0)
}

// Per-step multiplier ladder. The engine records the active step's
// `stepMultiplier` on each `cascadeFrames[i]`; the UI shows the active step's
// value and pulses on transitions. Reduced-motion / instant callers skip the
// intermediate steps and land on the last entry's value.
export function buildCascadeLadderSteps(frames = [], { reduceMotion = false } = {}) {
    if (!Array.isArray(frames) || !frames.length) return []
    if (reduceMotion) {
        const last = frames[frames.length - 1]
        const lastMultiplier = Number(last?.stepMultiplier)
        if (!Number.isFinite(lastMultiplier) || lastMultiplier <= 0) return []
        return [{ index: frames.length - 1, multiplier: lastMultiplier, isFinal: true }]
    }
    return frames
        .map((frame, index) => {
            const multiplier = Number(frame?.stepMultiplier)
            if (!Number.isFinite(multiplier) || multiplier <= 0) return null
            return {
                index,
                multiplier,
                isFinal: index === frames.length - 1,
            }
        })
        .filter(Boolean)
}

export function buildSlotFeatureDemoState({
    layout = { cols: 5, rows: 3 },
    cellPositions,
    scatterIndexes = [0, 7, 14],
    retriggerAmount = 5,
    wheelValue = 10,
    holdBoard = { size: 12, startFilled: 3, finalFilled: 7 },
    trigger = 1,
} = {}) {
    const positions = cellPositions?.length ? cellPositions : defaultCellPositions(layout)
    const normalizedScatters = uniqueNumbers(scatterIndexes)
        .filter(index => index >= 0 && index < positions.length)
    return {
        scatterCells: normalizedScatters
            .map(index => ({ index, center: getCellCenterPercent(index, positions, layout) }))
            .filter(cell => cell.center),
        wheel: {
            value: wheelValue,
            wobbleMs: SLOT_WHEEL_WOBBLE_MS,
        },
        holdTiles: buildHoldTileStates(holdBoard),
        retriggerFlyers: buildRetriggerFlyers({
            indexes: normalizedScatters,
            cellPositions: positions,
            layout,
            amount: retriggerAmount,
            trigger,
        }),
    }
}

const defaultMotionScheduler = {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: id => clearTimeout(id),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: id => clearInterval(id),
    requestAnimationFrame: typeof requestAnimationFrame === 'function' ? fn => requestAnimationFrame(fn) : null,
    cancelAnimationFrame: typeof cancelAnimationFrame === 'function' ? id => cancelAnimationFrame(id) : null,
}

export function createSlotMotionController(scheduler = defaultMotionScheduler) {
    let generation = 0
    const timeoutIds = new Set()
    const intervalIds = new Set()
    let rafId = null

    return {
        get generation() {
            return generation
        },
        schedule(callback, delayMs = 0) {
            const gen = generation
            let id = null
            id = scheduler.setTimeout(() => {
                if (id != null) timeoutIds.delete(id)
                if (gen !== generation) return
                callback()
            }, delayMs)
            timeoutIds.add(id)
            return id
        },
        ticker(callback, intervalMs) {
            const gen = generation
            const id = scheduler.setInterval(() => {
                if (gen !== generation) return
                callback()
            }, intervalMs)
            intervalIds.add(id)
            return id
        },
        raf(callback) {
            if (!scheduler.requestAnimationFrame) return null
            if (rafId != null && scheduler.cancelAnimationFrame) scheduler.cancelAnimationFrame(rafId)
            const gen = generation
            rafId = scheduler.requestAnimationFrame(() => {
                rafId = null
                if (gen !== generation) return
                callback()
            })
            return rafId
        },
        cancel() {
            generation += 1
            timeoutIds.forEach(id => scheduler.clearTimeout(id))
            timeoutIds.clear()
            intervalIds.forEach(id => scheduler.clearInterval(id))
            intervalIds.clear()
            if (rafId != null && scheduler.cancelAnimationFrame) scheduler.cancelAnimationFrame(rafId)
            rafId = null
        },
    }
}
