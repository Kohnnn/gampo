import { formatCredits } from '../../../utils/simulationMath'
import { clampSimRows, SIM_BET_ROW_DEFAULT_CAP } from './simBetRows'

export default function SimBetStrip({ rows = [], title = 'Sim players', cap = SIM_BET_ROW_DEFAULT_CAP }) {
    const visibleRows = clampSimRows(rows, cap)
    if (!visibleRows.length) return null
    return (
        <section className="sim-bet-strip" aria-label={title}>
            <div className="sim-bet-head">
                <span>{title}</span>
                <strong>{visibleRows.length}</strong>
            </div>
            <ul>
                {visibleRows.map(row => (
                    <li key={row.id} className={`sim-bet-row tone-${row.tone || row.state || 'neutral'}`}>
                        <span className="sim-bet-player">
                            <span className="sim-bet-dot" style={{ background: row.color }} />
                            <span>
                                <strong>{row.name}</strong>
                                <em>{row.persona}</em>
                            </span>
                        </span>
                        <span className="sim-bet-action">
                            <strong>{row.action}</strong>
                            <em>{row.detail}</em>
                        </span>
                        <span className="sim-bet-stake">{formatCredits(row.stake)}</span>
                        <span className="sim-bet-result">
                            <strong>{row.result}</strong>
                            <em>{row.metric}</em>
                        </span>
                    </li>
                ))}
            </ul>
        </section>
    )
}
