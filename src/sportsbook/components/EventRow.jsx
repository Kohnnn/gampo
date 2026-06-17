import { BarChart3, ChevronRight, Radio, Tv } from 'lucide-react'
import OddsButton from './OddsButton'
import TeamLogo from './TeamLogo'

function formatEventTime(startsAt) {
    const date = new Date(startsAt)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function EventRow({ event, league, selectedIds, onToggleSelection, onOpenEvent }) {
    const mainMarket = event.marketGroups?.[0]
    const extraMarkets = Math.max(0, (event.marketGroups?.length || 1) - 1)
    const live = event.status === 'live'

    return (
        <article className={`sb-event-row ${live ? 'is-live' : ''}`}>
            <button type="button" className="sb-event-main" onClick={() => onOpenEvent(event.id)}>
                <div className="sb-event-time">
                    {live ? <span className="sb-live-pill">Live</span> : <span>{formatEventTime(event.startsAt)}</span>}
                    {live ? <small>{event.clock} {event.period}</small> : <small>{league?.region || event.region}</small>}
                </div>
                <div className="sb-event-teams">
                    <span><TeamLogo src={event.homeLogo} label={event.home} />{event.home}</span>
                    <span><TeamLogo src={event.awayLogo} label={event.away} />{event.away}</span>
                    <small>{league?.label || event.leagueId}</small>
                </div>
                <div className="sb-event-score" aria-label="Score">
                    {event.score ? (
                        <>
                            <span>{event.score.home}</span>
                            <span>{event.score.away}</span>
                        </>
                    ) : (
                        <>
                            <Tv size={14} />
                            <BarChart3 size={14} />
                        </>
                    )}
                </div>
            </button>

            <div className="sb-event-market">
                <div className="sb-market-caption">
                    <span>{mainMarket?.label || 'Winner'}</span>
                </div>
                <div className="sb-row-odds">
                    {(mainMarket?.selections || []).slice(0, 3).map(selection => (
                        <OddsButton
                            key={selection.id}
                            selection={selection}
                            selected={selectedIds.has(selection.id)}
                            onToggle={() => onToggleSelection(selection.id)}
                            marketGroup={mainMarket}
                            compact
                        />
                    ))}
                </div>
            </div>

            <button type="button" className="sb-more-markets" onClick={() => onOpenEvent(event.id)}>
                {extraMarkets ? `+${extraMarkets * 12}` : '+0'}
                <ChevronRight size={15} />
            </button>
        </article>
    )
}

export default EventRow
