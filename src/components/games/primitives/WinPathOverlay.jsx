// WinPathOverlay — Wave 27 (win-line fix 2026-06-11). Draws SVG win indicators
// over the winning cells of a slot grid. Animates draw-on then fades.
//
// Props:
//   wins        Array of win objects from `resolveSlotSpin`. Each must have
//               `indexes` (cell indexes into the grid), `type`, and `multiplier`.
//   cellPositions  Array of { col, row } per cell index, from getCellPositions.
//   layout      { cols, rows, evaluation } slot layout config.
//   gridRef     ref to the grid DOM element so we can size the SVG to match.
//   accent      hex string used for the line/halo color.
//
// Behavior:
//   - Line wins (`type:'line'`) trace a left-to-right polyline through one cell
//     per column (sorted by column).
//   - Ways / megaways / cluster / pay-anywhere wins highlight EACH winning cell
//     with a rounded halo rect (these wins span many cells per column, so a
//     single polyline would zig-zag through the wrong cells).
//   - The index ordering now matches the engine: getCellPositions is row-major
//     for non-megaways and column-major for megaways, so centers[i] is the cell
//     the engine actually paid.
//   - Honors `prefers-reduced-motion` via CSS.

import { useEffect, useMemo, useState } from 'react'

const FADE_MS = 1600
const HALO_TYPES = new Set(['ways', 'megaways', 'cluster', 'pay-anywhere'])

export default function WinPathOverlay({ wins = [], cellPositions = [], layout, gridRef, accent = '#ffd166' }) {
    const [size, setSize] = useState({ w: 0, h: 0 })
    const [tick, setTick] = useState(0)

    useEffect(() => {
        if (!gridRef?.current) return undefined
        const el = gridRef.current
        const ro = new ResizeObserver(() => {
            const rect = el.getBoundingClientRect()
            setSize({ w: rect.width, h: rect.height })
        })
        ro.observe(el)
        const rect = el.getBoundingClientRect()
        setSize({ w: rect.width, h: rect.height })
        return () => ro.disconnect()
    }, [gridRef])

    useEffect(() => {
        if (!wins.length) return undefined
        setTick(t => t + 1)
        const id = window.setTimeout(() => setTick(t => t + 1), FADE_MS + 50)
        return () => window.clearTimeout(id)
    }, [wins])

    const { lines, halos } = useMemo(() => {
        if (!wins.length || !size.w || !size.h || !layout) return { lines: [], halos: [] }
        const cols = layout.cols
        const cellW = size.w / cols
        // Per-column row counts (megaways has variable rows per column).
        const colRows = []
        for (let c = 0; c < cols; c += 1) {
            let count = 0
            for (let i = 0; i < cellPositions.length; i += 1) {
                if (cellPositions[i].col === c) count += 1
            }
            colRows.push(count || layout.rows)
        }
        const cellHFor = col => size.h / (colRows[col] || layout.rows)
        const centers = cellPositions.map(({ col, row }) => ({
            x: col * cellW + cellW / 2,
            y: row * cellHFor(col) + cellHFor(col) / 2,
        }))

        const lineOut = []
        const haloOut = []
        wins.forEach((win, idx) => {
            const indexes = (win.indexes || []).filter(i => centers[i])
            if (!indexes.length) return
            if (HALO_TYPES.has(win.type)) {
                indexes.forEach(i => {
                    const { col } = cellPositions[i]
                    const cellH = cellHFor(col)
                    haloOut.push({
                        id: `${tick}-${idx}-${i}`,
                        x: centers[i].x - cellW / 2,
                        y: centers[i].y - cellH / 2,
                        w: cellW,
                        h: cellH,
                    })
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
                lineOut.push({ id: `${tick}-${idx}`, d })
            }
        })
        return { lines: lineOut, halos: haloOut }
    }, [wins, size, cellPositions, layout, tick])

    if (!lines.length && !halos.length) return null

    return (
        <svg
            className="slot-winpath-overlay"
            viewBox={`0 0 ${size.w} ${size.h}`}
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
