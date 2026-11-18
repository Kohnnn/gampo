import { describe, expect, it } from 'vitest'
import { buildWinPathShapes, measureSlotCells } from './WinPathOverlay'
import { getCellPositions, getSlotTemplate } from '../slots/slotFactory'

const cell = (index, rect) => ({
    dataset: { slotCellIndex: String(index) },
    getBoundingClientRect: () => rect,
})

describe('slot win overlay cell geometry', () => {
    it('uses real cell rectangles relative to the SVG, including locks, border, padding and gaps', () => {
        const cells = [
            cell(0, { left: 126, top: 178, width: 70, height: 54 }),
            cell(1, { left: 204, top: 178, width: 70, height: 54 }),
            cell(2, { left: 126, top: 240, width: 70, height: 54 }),
        ]
        const frame = { querySelectorAll: () => cells }
        const svg = { getBoundingClientRect: () => ({ left: 101, top: 121, width: 200, height: 200 }) }
        expect(measureSlotCells(frame, svg)).toEqual({
            w: 200, h: 200,
            cells: [
                { x: 25, y: 57, w: 70, h: 54 },
                { x: 103, y: 57, w: 70, h: 54 },
                { x: 25, y: 119, w: 70, h: 54 },
            ],
        })
    })

    it('preserves engine indexes for variable-height megaways columns', () => {
        const positions = getCellPositions(getSlotTemplate('phoenix-megaways'))
        const indexAt = (col, row) => positions.findIndex(position => position.col === col && position.row === row)
        const frame = { querySelectorAll: () => [
            cell(indexAt(1, 0), { left: 100, top: 20, width: 60, height: 23 }),
            cell(indexAt(0, 0), { left: 20, top: 20, width: 60, height: 30 }),
            cell(indexAt(1, 1), { left: 100, top: 48, width: 60, height: 23 }),
            cell(indexAt(0, 1), { left: 20, top: 55, width: 60, height: 30 }),
        ] }
        const svg = { getBoundingClientRect: () => ({ left: 10, top: 10, width: 170, height: 170 }) }
        const { cells } = measureSlotCells(frame, svg)
        expect(cells[0]).toEqual({ x: 10, y: 10, w: 60, h: 30 })
        expect(cells[1]).toEqual({ x: 10, y: 45, w: 60, h: 30 })
        expect(cells[4]).toEqual({ x: 90, y: 10, w: 60, h: 23 })
        expect(cells[5]).toEqual({ x: 90, y: 38, w: 60, h: 23 })
    })
})

// QA005: the hosted finding was an outline sitting off its symbol cells on
// Storm Banner (desktop and phone) and Vault (phone). The repair is that the
// overlay draws from the SAME rectangles the symbols occupy, so the only way
// it can regress is a geometry derivation that stops matching the cells. That
// is checkable here against a synthetic viewport; actual painted pixels need a
// browser and are not claimed by this file.
describe('QA005 win outlines track the rendered symbol cells', () => {
    // Synthetic 5x4 ways board: cell 70x54, 8px grid gap, 12px frame padding,
    // 1px rail border. Rectangle origin is arbitrary (scroll/resize dependent);
    // only differences from the SVG origin carry into the drawing.
    function board({ originLeft = 101, originTop = 121, width = 418, height = 356, cellWidth = 70, cellHeight = 54 } = {}) {
        const positions = getCellPositions(getSlotTemplate('storm-banner'))
        const gap = 6
        const pad = 12
        const left = originLeft + pad + 1
        const top = originTop + pad + 1
        const dom = positions.map(({ col, row }, index) => cell(index, {
            left: left + col * (cellWidth + gap),
            top: top + row * (cellHeight + gap),
            width: cellWidth,
            height: cellHeight,
        }))
        const frame = { querySelectorAll: () => dom }
        const svg = { getBoundingClientRect: () => ({ left: originLeft, top: originTop, width, height }) }
        return { positions, geometry: measureSlotCells(frame, svg) }
    }

    const indexesFor = (positions, predicate) => positions.reduce((out, position, index) => (
        predicate(position) ? [...out, index] : out
    ), [])

    it('haloes every winning cell on a desktop board with no offset drift', () => {
        const { positions, geometry } = board()
        const winCells = indexesFor(positions, ({ col }) => col < 3)
        const { halos, lines } = buildWinPathShapes({
            wins: [{ type: 'ways', indexes: winCells }],
            cellPositions: positions,
            geometry,
        })
        expect(lines).toEqual([])
        expect(halos).toHaveLength(winCells.length)
        // Each halo is exactly the cell it marks — same origin, size and order.
        expect(halos.map(({ x, y, w, h }) => ({ x, y, w, h }))).toEqual(winCells.map(index => geometry.cells[index]))
        // Sanity on the synthetic viewport itself: cell 0 starts inside the
        // frame padding, and the outline is not drawn at the raw grid origin.
        expect(geometry.cells[0]).toEqual({ x: 13, y: 13, w: 70, h: 54 })
    })

    it('keeps outlines on the cells at phone width, and ignores scroll/translation of the whole board', () => {
        const phone = board({ originLeft: 0, originTop: 0, width: 318, height: 300, cellWidth: 52, cellHeight: 46 })
        const scrolled = board({ originLeft: -240, originTop: -640 })
        // Phone: a narrower cell changes the derived geometry, and the halo has
        // to follow it rather than stay at desktop measurements.
        const phoneHalo = buildWinPathShapes({
            wins: [{ type: 'ways', indexes: [0, 1] }],
            cellPositions: phone.positions,
            geometry: phone.geometry,
        }).halos
        expect(phoneHalo).toEqual([
            { id: '0-0', x: 13, y: 13, w: 52, h: 46 },
            { id: '0-1', x: 71, y: 13, w: 52, h: 46 },
        ])
        // Scroll/resize moves the SVG and its cells in the same document, so the
        // relative rects — and therefore the drawing — must be identical. A
        // stale measurement of only one of the two would land here as an offset.
        const desktop = board()
        expect(scrolled.geometry.cells).toEqual(desktop.geometry.cells)
        expect(buildWinPathShapes({
            wins: [{ type: 'ways', indexes: [0, 1] }],
            cellPositions: scrolled.positions,
            geometry: scrolled.geometry,
        })).toEqual(buildWinPathShapes({
            wins: [{ type: 'ways', indexes: [0, 1] }],
            cellPositions: desktop.positions,
            geometry: desktop.geometry,
        }))
    })

    it('traces a line win through one cell centre per column, left to right', () => {
        const { positions, geometry } = board()
        const rowTwo = indexesFor(positions, ({ col, row }) => row === 2 && col < 3).reverse()
        const { lines } = buildWinPathShapes({
            wins: [{ type: 'line', indexes: rowTwo }],
            cellPositions: positions,
            geometry,
        })
        // Literal expected path, not a re-run of the derivation: row 2 sits at
        // y 133..187 relative to the SVG, so its centre line is y=160; the three
        // 70px cells start at x 13/89/165, so their centres are 48/124/200.
        expect(lines).toEqual([{ id: '0', d: 'M48.0,160.0 L124.0,160.0 L200.0,160.0' }])
        // Column order, not grid-index order, decides the path: the indexes were
        // fed in reversed and the trace still runs left to right.
        expect(rowTwo).not.toEqual([...rowTwo].sort((a, b) => a - b))
    })
})
