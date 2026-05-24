import { useMemo, useState } from 'react'
import { Info, X } from 'lucide-react'
import { EDUCATION_SECTIONS } from '../sportsbookEducation'

function toneClass(tone) {
    return tone ? `sb-tone-${tone}` : ''
}

function OddsCoach({ analysis, variant = 'icon', label = 'Analyze' }) {
    const [open, setOpen] = useState(false)
    const [tier, setTier] = useState('beginner')
    const activeInsights = useMemo(() => (
        (analysis?.insights || []).filter(insight => insight.tier === tier)
    ), [analysis, tier])

    if (!analysis) return null

    const openCoach = (event) => {
        event.preventDefault()
        event.stopPropagation()
        setOpen(true)
    }

    const closeCoach = (event) => {
        event?.preventDefault()
        event?.stopPropagation()
        setOpen(false)
    }

    return (
        <>
            <button
                type="button"
                className={`sb-coach-trigger is-${variant}`}
                aria-label={`${label}: ${analysis.title}`}
                onClick={openCoach}
            >
                {variant === 'icon' ? <Info size={14} /> : <><Info size={14} /> {label}</>}
            </button>

            {open ? (
                <div className="sb-coach-backdrop" role="presentation" onClick={closeCoach}>
                    <section className="sb-coach-panel" role="dialog" aria-modal="true" aria-label={analysis.title} onClick={event => event.stopPropagation()}>
                        <header className="sb-coach-head">
                            <div>
                                <span>Odds Coach</span>
                                <strong>{analysis.title}</strong>
                            </div>
                            <button type="button" aria-label="Close odds coach" onClick={closeCoach}>
                                <X size={18} />
                            </button>
                        </header>

                        {analysis.metrics?.length ? (
                            <div className="sb-coach-metrics">
                                {analysis.metrics.map(metric => (
                                    <div key={`${metric.label}-${metric.value}`}>
                                        <span>{metric.label}</span>
                                        <strong className={toneClass(metric.tone)}>{metric.value}</strong>
                                    </div>
                                ))}
                            </div>
                        ) : null}

                        <div className="sb-coach-tabs">
                            {EDUCATION_SECTIONS.map(section => (
                                <button
                                    key={section.tier}
                                    type="button"
                                    className={tier === section.tier ? 'is-active' : ''}
                                    onClick={() => setTier(section.tier)}
                                >
                                    {section.label}
                                </button>
                            ))}
                        </div>

                        <div className="sb-coach-insights">
                            {activeInsights.map(item => (
                                <article key={item.id} className={toneClass(item.tone)}>
                                    <div>
                                        <strong>{item.title}</strong>
                                        {item.metricLabel ? <span>{item.metricLabel}: {item.metricValue}</span> : null}
                                    </div>
                                    <p>{item.body}</p>
                                </article>
                            ))}
                        </div>

                        {analysis.rows?.length ? (
                            <div className="sb-coach-table">
                                <div>
                                    <span>Outcome</span>
                                    <span>Odds</span>
                                    <span>Raw</span>
                                    <span>No-vig</span>
                                    <span>Fair</span>
                                </div>
                                {analysis.rows.map(row => (
                                    <div key={row.label}>
                                        <strong>{row.label}</strong>
                                        <span>{Number(row.decimalOdds).toFixed(2)}</span>
                                        <span>{(row.impliedProbability * 100).toFixed(1)}%</span>
                                        <span>{(row.noVigProbability * 100).toFixed(1)}%</span>
                                        <span>{Number(row.fairOdds).toFixed(2)}</span>
                                    </div>
                                ))}
                            </div>
                        ) : null}
                    </section>
                </div>
            ) : null}
        </>
    )
}

export default OddsCoach
