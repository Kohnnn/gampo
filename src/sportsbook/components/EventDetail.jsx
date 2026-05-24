import { ArrowLeft, BarChart3, Filter, Monitor, Radio, Tv } from 'lucide-react'
import MarketGroup from './MarketGroup'

function formatEventDate(startsAt) {
    const date = new Date(startsAt)
    if (Number.isNaN(date.getTime())) return 'Upcoming'
    return date.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function EventDetail({ event, sport, league, selectedIds, onToggleSelection, onBack }) {
    if (!event) return null
    const isRacing = event.sportId === 'horse-racing'
    const tabs = isRacing ? ['R1', 'R2', 'R3', 'R4', 'R5'] : ['Live & Upcoming', 'Outrights', `All ${sport?.label || 'Markets'}`]

    return (
        <section className="sb-event-detail">
            <div className="sb-detail-breadcrumbs">
                <button type="button" onClick={onBack} aria-label="Back to sportsbook">
                    <ArrowLeft size={18} />
                </button>
                <span>{sport?.label || event.sportId}</span>
                <span>{league?.region || event.region}</span>
                <strong>{league?.label || event.leagueId}</strong>
            </div>

            <div className="sb-detail-tabs">
                {tabs.map((tab, index) => (
                    <button key={tab} type="button" className={index === 0 ? 'is-active' : ''}>{tab}</button>
                ))}
            </div>

            <header className="sb-detail-header">
                <div>
                    <span className="sb-detail-kicker">{league?.label || 'Event'}</span>
                    <h1>{event.home} - {event.away}</h1>
                    <div className="sb-detail-meta">
                        {event.status === 'live' ? <span className="sb-live-pill"><Radio size={12} /> Live</span> : null}
                        <span>{formatEventDate(event.startsAt)}</span>
                        {event.clock ? <span>{event.clock} {event.period}</span> : null}
                        <Tv size={15} />
                        <BarChart3 size={15} />
                    </div>
                </div>
                {event.score ? (
                    <div className="sb-detail-score">
                        <span>{event.home}<b>{event.score.home}</b></span>
                        <span>{event.away}<b>{event.score.away}</b></span>
                    </div>
                ) : null}
            </header>

            <div className="sb-detail-tools">
                <button type="button"><Monitor size={16} /> Display <strong>Standard</strong></button>
                <button type="button"><Filter size={16} /> Market <strong>Winner</strong></button>
                <button type="button"><BarChart3 size={16} /> Advanced Stats</button>
            </div>

            <div className="sb-advanced-stats">
                <span>Tickets {Number(event.popularity || 0).toLocaleString()}</span>
                <span>Attack {event.liveStats?.attack || 50}</span>
                <span>Possession {event.liveStats?.possession || 50}%</span>
            </div>

            <div className="sb-detail-markets">
                {event.marketGroups.map(group => (
                    <MarketGroup
                        key={group.id}
                        group={group}
                        selectedIds={selectedIds}
                        onToggleSelection={onToggleSelection}
                    />
                ))}
            </div>
        </section>
    )
}

export default EventDetail
