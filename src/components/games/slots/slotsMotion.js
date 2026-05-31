export const SLOT_WHEEL_WOBBLE_MS = 350
export const SLOT_HOLD_NEW_TILE_PULSE_MS = 200
export const SLOT_RETRIGGER_FLY_MS = 320
export const SLOT_CASCADE_TRACE_MS = 520

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
