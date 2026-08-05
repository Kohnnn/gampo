import { useEffect, useMemo, useState } from 'react'

import { loadPreflop } from '../../../poker/gto/loader'
import { buildGrid, listPositions, listScenarios, loadingFrame } from '../../../poker/strategy/rangeBrowser'

const RANK_LABELS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2']

export default function RangeBrowser() {
    const [chart, setChart] = useState(null)
    const [failed, setFailed] = useState(false)
    const [position, setPosition] = useState('BTN')
    const [scenario, setScenario] = useState('rfi')

    useEffect(() => {
        let alive = true
        loadPreflop()
            .then(data => { if (alive) { if (data) setChart(data); else setFailed(true) } })
            .catch(() => { if (alive) setFailed(true) })
        return () => { alive = false }
    }, [])

    const positions = useMemo(() => listPositions(chart), [chart])
    const scenarios = useMemo(() => listScenarios(chart, position), [chart, position])

    useEffect(() => {
        if (scenarios.length > 0 && !scenarios.includes(scenario)) setScenario(scenarios[0])
    }, [scenarios, scenario])

    const grid = useMemo(() => {
        if (failed) return buildGrid(null, position, scenario)
        if (!chart) return loadingFrame()
        return buildGrid(chart, position, scenario)
    }, [chart, failed, position, scenario])

    return (
        <div className="pk-range" data-poker-range-status={grid.status} data-testid={grid.testId}>
            <div className="pk-range-controls">
                <label className="pk-range-field">
                    <span>Position</span>
                    <select value={position} onChange={e => setPosition(e.target.value)} disabled={positions.length === 0}>
                        {positions.length === 0 ? <option value={position}>{position}</option> : positions.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </label>
                <label className="pk-range-field">
                    <span>Spot</span>
                    <select value={scenario} onChange={e => setScenario(e.target.value)} disabled={scenarios.length === 0}>
                        {scenarios.length === 0 ? <option value={scenario}>{scenario}</option> : scenarios.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </label>
                {grid.sizeLabel && <span className="pk-range-size">Open {grid.sizeLabel}</span>}
            </div>

            <p className="pk-range-disclosure">{grid.disclosure}</p>

            {grid.status === 'loading' && <p className="pk-range-empty">Loading chart data.</p>}
            {grid.status === 'error' && <p className="pk-range-empty">Chart data could not be read.</p>}
            {grid.status === 'empty' && <p className="pk-range-empty">No range data ships for this spot.</p>}

            {grid.status === 'ready' && (
                <div className="pk-range-grid" role="grid" aria-label={`${position} ${scenario} starting hands`}>
                    {RANK_LABELS.map((_, row) => (
                        <div className="pk-range-row" role="row" key={row}>
                            {RANK_LABELS.map((__, col) => {
                                const cell = grid.cells[row * 13 + col]
                                return (
                                    <span
                                        role="gridcell"
                                        key={cell.hand}
                                        className={`pk-range-cell ${cell.inRange ? `is-${cell.action}` : 'is-out'}`}
                                        title={`${cell.hand} ${cell.inRange ? `${cell.action} ${Math.round(cell.frequency * 100)}%` : 'not in range'}`}
                                    >
                                        {cell.hand}
                                    </span>
                                )
                            })}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
