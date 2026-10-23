import { describe, expect, it } from 'vitest'
import { measureSlotCells } from './WinPathOverlay'
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
