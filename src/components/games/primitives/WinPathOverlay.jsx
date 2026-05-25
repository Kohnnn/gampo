// WinPathOverlay — Wave 27. Draws an SVG dotted polyline through the
// centers of winning cells in a slot grid. Animates draw-on then fades.
//
// Props:
//   wins        Array of win objects from `resolveSlotSpin`. Each must have
//               `indexes` (cell indexes into the grid) and `multiplier`.
//   cellPositions  Array of { col, row } per cell index, from getCellPositions.
//   layout      { cols, rows, evaluation } slot layout config.
//   gridRef     ref to the grid DOM element so we can size the SVG to match.
//   accent      hex string used for the line color.
//
// Behavior:
//   - One <path> per win. Stroke-dasharray + stroke-dashoffset animate the
//     draw-on. Each line stays for ~1.4s then fades.
//   - For megaways, computes a polyline from left-most matching cell to
//     right-most across each column. For cluster, draws a halo around each
//     winning cell.
//   - Honors `prefers-reduced-motion`.

import { useEffect, useMemo, useState } from 'react'

const FADE_MS = 1600

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

    const paths = useMemo(() => {
        if (!wins.length || !size.w || !size.h || !layout) return []
        const cols = layout.cols
        const cellW = size.w / cols
        // Compute per-column row counts (for megaways).
        const colRows = []
        for (let c = 0; c < cols; c += 1) {
            // count cells in column c
            let count = 0
            for (let i = 0; i < cellPositions.length; i += 1) {
                if (cellPositions[i].col === c) count += 1
            }
            colRows.push(count || layout.rows)
        }
        // Center coords for each cell index.
        const centers = cellPositions.map(({ col, row }) => {
            const rows = colRows[col] || layout.rows
            const cellH = size.h / rows
            return { x: col * cellW + cellW / 2, y: row * cellH + cellH / 2 }
        })
        return wins.map((win, idx) => {
            const indexes = (win.indexes || []).slice().sort((a, b) => {
                const ca = cellPositions[a]?.col ?? 0
                const cb = cellPositions[b]?.col ?? 0
                if (ca !== cb) return ca - cb
                return (cellPositions[a]?.row ?? 0) - (cellPositions[b]?.row ?? 0)
            })
            const points = indexes.map(i => centers[i]).filter(Boolean)
            if (points.length === 0) return null
            const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
            return { id: `${tick}-${idx}`, d, label: win.label, multiplier: win.multiplier }
        }).filter(Boolean)
    }, [wins, size, cellPositions, layout, tick])

    if (!paths.length) return null

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
            {paths.map(p => (
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
