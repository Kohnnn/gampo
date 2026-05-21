// Top-of-playfield row of latest result pills, Stake/Rainbet style.
// Reads `useGameSession` history; renders the last N entries as colored chips.
//
// Each entry shape (from useGameSession): { profit, multiplier?, label?, ts }
// Visual: green chip for profit > 0, red for profit < 0, grey for push.
// If multiplier is supplied, the chip text is the multiplier (e.g. "2.4×");
// otherwise it falls back to label or W/L/P.

import { useMemo } from 'react'

const fmtMult = (m) => {
    if (!Number.isFinite(m)) return null
    if (m >= 1000) return `${(m / 1000).toFixed(1)}k×`
    if (m >= 100) return `${m.toFixed(0)}×`
    if (m >= 10) return `${m.toFixed(1)}×`
    return `${m.toFixed(2)}×`
}

export default function RecentResultsStrip({ results = [], limit = 14, mode = 'auto', emptyHint = 'No history yet' }) {
    const visible = useMemo(() => results.slice(0, limit), [results, limit])

    if (!visible.length) {
        return (
            <div className="rrs-strip rrs-empty" aria-live="polite">
                <span className="rrs-empty-text">{emptyHint}</span>
            </div>
        )
    }

    return (
        <div className="rrs-strip" aria-live="polite">
            {visible.map((item, i) => {
                const profit = Number(item.profit) || 0
                const dir = profit > 0 ? 'win' : profit < 0 ? 'loss' : 'push'
                let text
                if (mode === 'multiplier' || (mode === 'auto' && Number.isFinite(item.multiplier))) {
                    text = fmtMult(item.multiplier) || (dir === 'win' ? 'W' : dir === 'loss' ? 'L' : 'P')
                } else if (item.label) {
                    text = String(item.label).slice(0, 6)
                } else {
                    text = dir === 'win' ? 'W' : dir === 'loss' ? 'L' : 'P'
                }
                return (
                    <span key={item.ts ? `${item.ts}-${i}` : i} className={`rrs-chip rrs-${dir}`} title={item.label || `Profit ${profit.toFixed(2)}`}>
                        {text}
                    </span>
                )
            })}
        </div>
    )
}
