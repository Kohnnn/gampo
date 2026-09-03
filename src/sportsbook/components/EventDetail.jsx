import { ArrowLeft } from 'lucide-react'
import { formatObservedAge } from '../sportsbookPresentation'
import MarketGroup from './MarketGroup'

function EventDetail({ event, sport, league, selectedIds, onToggleSelection, onBack }) {
    if (!event) return null
    const schedule = event.facts?.scheduleMetadata
    const scoreStatus = event.facts?.scoreStatus

    return (
        <article className="sb-event-detail">
            <nav className="sb-detail-breadcrumbs" aria-label="Fixture breadcrumb">
                <button type="button" onClick={onBack} aria-label="Back to sportsbook"><ArrowLeft size={18} /></button>
                <span>{sport?.label || event.sportId}</span>
                <span>{league?.region || event.region || 'Region unavailable'}</span>
                <strong>{schedule?.competition || league?.label || 'Competition unavailable'}</strong>
            </nav>

            <header className="sb-detail-header">
                <div>
                    <span className="sb-detail-kicker">Received fixture facts</span>
                    <h2>{event.home} – {event.away}</h2>
                </div>
                {scoreStatus?.score ? (
                    <div className="sb-detail-score">
                        <span>{event.home}<b>{scoreStatus.score.home}</b></span>
                        <span>{event.away}<b>{scoreStatus.score.away}</b></span>
                    </div>
                ) : <strong>Score unavailable from this feed</strong>}
            </header>

            <dl className="sb-fact-grid">
                <div><dt>Schedule</dt><dd>{schedule?.startsAt ? new Date(schedule.startsAt).toLocaleString() : 'Unavailable from this feed'}</dd><small>{schedule?.provider ? `${schedule.provider} · ${formatObservedAge(schedule.observedAt)}` : 'Source unavailable'}</small></div>
                <div><dt>Status</dt><dd>{scoreStatus?.status || 'Unavailable from this feed'}</dd><small>{scoreStatus?.provider ? `${scoreStatus.provider} · ${formatObservedAge(scoreStatus.observedAt)}` : 'Source unavailable'}</small></div>
            </dl>

            <section className="sb-detail-markets" aria-label="Supported markets">
                {event.marketGroups.map(group => (
                    <MarketGroup key={group.id} group={group} selectedIds={selectedIds} onToggleSelection={onToggleSelection} />
                ))}
            </section>
        </article>
    )
}

export default EventDetail
