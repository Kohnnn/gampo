import { presentDecision } from '../../../poker/strategy/coachView'
import { coverGap } from '../../../poker/strategy/heuristicCoverage'

export default function CoachPanel({ decision, table = null, sourceConfigured = false }) {
    const view = presentDecision(decision)
    const coverage = coverGap({ decision, table, sourceConfigured })

    return (
        <div className="pk-coach" data-poker-coach-state={view.state} data-testid={view.testId}>
            <div className="pk-coach-head">
                <span className={`pk-coach-badge is-${view.state}`}>{view.headline}</span>
                {view.provenance && (
                    <span className={`pk-coach-review ${view.provenance.reviewed ? 'is-reviewed' : 'is-unreviewed'}`}>
                        {view.provenance.label}
                    </span>
                )}
            </div>

            <p className="pk-coach-summary">{view.summary}</p>

            {view.reasonText && <p className="pk-coach-reason">{view.reasonText}</p>}

            {view.showsFrequencies && view.actions.length > 0 && (
                <ul className="pk-coach-actions">
                    {view.actions.map(action => (
                        <li key={action.type} className="pk-coach-action">
                            <span className="pk-coach-action-type">{action.type}</span>
                            <span className="pk-coach-bar" aria-hidden="true">
                                <i style={{ width: action.percent }} />
                            </span>
                            <span className="pk-coach-action-pct">{action.percent}</span>
                        </li>
                    ))}
                </ul>
            )}

            {!view.prescriptive && view.showsFrequencies && (
                <p className="pk-coach-note">Reference frequencies only. Not reviewed for exact play.</p>
            )}

            {coverage.status === 'covered' && (
                <div className="pk-coach-coverage" data-poker-coverage-status={coverage.status}>
                    <p className="pk-coach-coverage-head">
                        <span className="pk-coach-coverage-tag">Table arithmetic</span>
                        <span className="pk-coach-coverage-conf">{coverage.confidence} confidence</span>
                    </p>
                    <ul className="pk-coach-coverage-list">
                        {coverage.notes.map(item => (
                            <li key={item.id} className={`pk-coach-coverage-item is-${item.kind}`}>
                                <span className="pk-coach-coverage-label">{item.label}</span>
                                <span className="pk-coach-coverage-value">{item.value}</span>
                                <span className="pk-coach-coverage-detail">{item.detail}</span>
                            </li>
                        ))}
                    </ul>
                    <p className="pk-coach-coverage-ceiling">{coverage.ceiling}</p>
                </div>
            )}

            {view.provenance && (
                <p className="pk-coach-source">
                    <span>{view.provenance.sourceId}</span>
                    <span>v{view.provenance.version}</span>
                </p>
            )}
        </div>
    )
}
