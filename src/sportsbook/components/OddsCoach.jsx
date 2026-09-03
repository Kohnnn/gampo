import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Info, X } from 'lucide-react'
import { EDUCATION_SECTIONS } from '../sportsbookEducation'

function toneClass(tone) {
    return tone ? `sb-tone-${tone}` : ''
}

function OddsCoach({ analysis, variant = 'icon', label = 'Analyze' }) {
    const [open, setOpen] = useState(false)
    const dialogRef = useRef(null)
    const openerRef = useRef(null)
    const closeRef = useRef(null)

    useEffect(() => {
        const dialog = dialogRef.current
        if (!dialog) return
        if (open && !dialog.open) {
            dialog.showModal()
            closeRef.current?.focus()
        }
        if (!open && dialog.open) dialog.close()
    }, [open])

    if (!analysis) return null

    const sections = EDUCATION_SECTIONS.map(section => ({
        ...section,
        insights: (analysis.insights || []).filter(insight => insight.tier === section.tier),
    })).filter(section => section.insights.length > 0)

    const openCoach = (event) => {
        event.preventDefault()
        event.stopPropagation()
        openerRef.current = event.currentTarget
        setOpen(true)
    }

    const closeCoach = (event) => {
        event?.preventDefault()
        event?.stopPropagation()
        dialogRef.current?.close()
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

            <dialog
                ref={dialogRef}
                className="sb-coach-backdrop"
                aria-labelledby={`odds-coach-${analysis.id || 'heading'}`}
                onCancel={() => setOpen(false)}
                onClose={() => {
                    setOpen(false)
                    openerRef.current?.isConnected && openerRef.current.focus()
                }}
                onClick={event => { if (event.target === dialogRef.current) closeCoach(event) }}
            >
                    <section className="sb-coach-panel">
                        <header className="sb-coach-head">
                            <div>
                                <span>Odds Coach</span>
                                <strong id={`odds-coach-${analysis.id || 'heading'}`}>{analysis.title}</strong>
                            </div>
                            <button ref={closeRef} type="button" aria-label="Close odds coach" onClick={closeCoach}>
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

                        <div className="sb-coach-sections">
                            {sections.map(section => (
                                <details key={section.tier} className="sb-coach-section" open={section.tier === 'beginner' || undefined}>
                                    <summary>
                                        <span>{section.label}</span>
                                        <ChevronDown size={15} />
                                    </summary>
                                    <div className="sb-coach-insights">
                                        {section.insights.map(item => (
                                            <article key={item.id} className={toneClass(item.tone)}>
                                                <div>
                                                    <strong>{item.title}</strong>
                                                    {item.metricLabel ? <span>{item.metricLabel}: {item.metricValue}</span> : null}
                                                </div>
                                                <p>{item.body}</p>
                                            </article>
                                        ))}
                                    </div>
                                </details>
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

                        {analysis.legRows?.length ? (
                            <div className="sb-coach-leg-table">
                                <div>
                                    <span>Leg</span>
                                    <span>Odds</span>
                                    <span>Prob.</span>
                                    <span>Roll</span>
                                    <span>Result</span>
                                    <span>Return role</span>
                                </div>
                                {analysis.legRows.map(row => (
                                    <div key={`${row.label}-${row.roll}`}>
                                        <strong>{row.label}</strong>
                                        <span>{Number(row.acceptedOdds).toFixed(2)}</span>
                                        <span>{(row.probability * 100).toFixed(1)}%</span>
                                        <span>{Number(row.roll).toFixed(2)}</span>
                                        <span className={row.result === 'won' ? 'sb-tone-positive' : 'sb-tone-danger'}>{row.result}</span>
                                        <span>{row.returnRole}</span>
                                    </div>
                                ))}
                            </div>
                        ) : null}
                    </section>
            </dialog>
        </>
    )
}

export default OddsCoach
