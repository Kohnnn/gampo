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

// Compact a free-text result label so it fits a small chip without losing
// meaning. Roulette emits "10 black" / "0 green" etc; abbreviate the colour
// word rather than hard-slicing to 6 chars ("10 bla").
const COLOR_ABBR = { black: 'BLK', red: 'RED', green: 'GRN' }
export const compactLabel = (raw) => {
    const label = String(raw).trim()
    const m = label.match(/^(\d+)\s+(black|red|green)$/i)
    if (m) return `${m[1]} ${COLOR_ABBR[m[2].toLowerCase()]}`
    return label.length > 6 ? label.slice(0, 6) : label
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
                    text = compactLabel(item.label)
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
