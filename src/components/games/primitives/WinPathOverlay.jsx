// WinPathOverlay — Wave 27 (win-line fix 2026-06-11). Draws SVG win indicators
// over the winning cells of a slot grid. Animates draw-on then fades.
//
// Props:
//   wins        Array of win objects from `resolveSlotSpin`. Each must have
//               `indexes` (cell indexes into the grid), `type`, and `multiplier`.
//   cellPositions  Array of { col, row } per cell index, from getCellPositions.
//   layout      Slot layout config; changes trigger a fresh measurement.
//   gridRef     ref to the frame containing indexed slot-cell DOM elements.
//   accent      hex string used for the line/halo color.
//
// Behavior:
//   - Line wins (`type:'line'`) trace a left-to-right polyline through one cell
//     per column (sorted by column).
//   - Ways / megaways / cluster / pay-anywhere wins highlight EACH winning cell
//     with a rounded halo rect (these wins span many cells per column, so a
//     single polyline would zig-zag through the wrong cells).
//   - Cell rectangles are measured relative to the SVG itself, including frame
//     borders, column controls, padding, gaps and variable megaways row heights.
//   - Honors `prefers-reduced-motion` via CSS.

import { useLayoutEffect, useMemo, useRef, useState } from 'react'

export function measureSlotCells(frame, svg) {
    const origin = svg.getBoundingClientRect()
    const cells = []
    frame.querySelectorAll('[data-slot-cell-index]').forEach(cell => {
        const index = Number(cell.dataset.slotCellIndex)
        if (!Number.isInteger(index) || index < 0) return
        const rect = cell.getBoundingClientRect()
        cells[index] = { x: rect.left - origin.left, y: rect.top - origin.top, w: rect.width, h: rect.height }
    })
    return { w: origin.width, h: origin.height, cells }
}
const HALO_TYPES = new Set(['ways', 'megaways', 'cluster', 'pay-anywhere'])

/**
 * Derive drawn geometry from measured cell rectangles.
 *
 * Pure on purpose: outline alignment is then provable against a synthetic
 * viewport, which is the only way this repo can check cell-to-outline geometry
 * (there is no browser in the test environment). `geometry` is exactly what
 * `measureSlotCells` returns — cell rects already relative to the SVG origin,
 * so frame padding, borders and grid gaps are baked in by measurement instead
 * of being re-derived (and re-guessed) here.
 */
export function buildWinPathShapes({ wins = [], cellPositions = [], geometry }) {
    const width = geometry?.w || 0
    const height = geometry?.h || 0
    if (!wins.length || !width || !height) return { lines: [], halos: [] }
    const centers = geometry.cells.map(cell => ({ x: cell.x + cell.w / 2, y: cell.y + cell.h / 2 }))

    const lineOut = []
    const haloOut = []
    wins.forEach((win, idx) => {
        const indexes = (win.indexes || []).filter(i => centers[i])
        if (!indexes.length) return
        if (HALO_TYPES.has(win.type)) {
            indexes.forEach(i => {
                const cell = geometry.cells[i]
                haloOut.push({ id: `${idx}-${i}`, ...cell })
            })
        } else {
            // Line win: one cell per column, traced left-to-right.
            const sorted = indexes.slice().sort((a, b) => {
                const ca = cellPositions[a]?.col ?? 0
                const cb = cellPositions[b]?.col ?? 0
                if (ca !== cb) return ca - cb
                return (cellPositions[a]?.row ?? 0) - (cellPositions[b]?.row ?? 0)
            })
            const points = sorted.map(i => centers[i])
            const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
            lineOut.push({ id: String(idx), d })
        }
    })
    return { lines: lineOut, halos: haloOut }
}

export default function WinPathOverlay({ wins = [], cellPositions = [], layout, gridRef, accent = '#ffd166' }) {
    const svgRef = useRef(null)
    const [geometry, setGeometry] = useState({ w: 0, h: 0, cells: [] })

    useLayoutEffect(() => {
        const frame = gridRef?.current
        const svg = svgRef.current
        if (!frame || !svg) return undefined
        const measure = () => setGeometry(measureSlotCells(frame, svg))
        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(frame)
        frame.querySelectorAll('[data-slot-cell-index]').forEach(cell => observer.observe(cell))
        return () => observer.disconnect()
    }, [gridRef, wins, layout, cellPositions])

    const { lines, halos } = useMemo(
        () => buildWinPathShapes({ wins, cellPositions, geometry }),
        [wins, geometry, cellPositions],
    )

    return (
        <svg
            ref={svgRef}
            className="slot-winpath-overlay"
            viewBox={`0 0 ${geometry.w || 1} ${geometry.h || 1}`}
            preserveAspectRatio="none"
            aria-hidden
        >
            <defs>
                <filter id="slot-winpath-glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="b" />
                    <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
            </defs>
            {halos.map(h => (
                <rect
                    key={h.id}
                    x={h.x.toFixed(1)}
                    y={h.y.toFixed(1)}
                    width={h.w.toFixed(1)}
                    height={h.h.toFixed(1)}
                    rx={Math.min(h.w, h.h) * 0.18}
                    stroke={accent}
                    strokeWidth={3}
                    fill="none"
                    filter="url(#slot-winpath-glow)"
                    className="slot-winpath-halo"
                />
            ))}
            {lines.map(p => (
                <path
                    key={p.id}
                    d={p.d}
                    stroke={accent}
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    strokeDasharray="4 7"
                    filter="url(#slot-winpath-glow)"
                    className="slot-winpath-line"
                />
            ))}
        </svg>
    )
}
