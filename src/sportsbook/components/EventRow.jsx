import { ChevronRight } from 'lucide-react'
import OddsButton from './OddsButton'
import TeamLogo from './TeamLogo'

function formatEventTime(startsAt) {
    const date = new Date(startsAt)
    if (Number.isNaN(date.getTime())) return 'Schedule unavailable'
    return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function EventRow({ event, league, selectedIds, onToggleSelection, onOpenEvent }) {
    const mainMarket = event.marketGroups?.[0]
    const additionalMarkets = Math.max(0, (event.marketGroups?.length || 0) - 1)
    const schedule = event.facts?.scheduleMetadata
    const scoreStatus = event.facts?.scoreStatus
    const offers = mainMarket?.selections || []

    return (
        <article className={`sb-event-row ${scoreStatus?.status === 'live' ? 'is-live' : ''}`}>
            <button type="button" className="sb-event-main" onClick={() => onOpenEvent(event.id)}>
                <div className="sb-event-time">
                    <span>{schedule?.startsAt ? formatEventTime(schedule.startsAt) : 'Unavailable from this feed'}</span>
                    <small>{schedule?.provider ? `Schedule · ${schedule.provider}` : 'Schedule source unavailable'}</small>
                </div>
                <div className="sb-event-teams">
                    <span><TeamLogo src={event.homeLogo} label={event.home} />{event.home}</span>
                    <span><TeamLogo src={event.awayLogo} label={event.away} />{event.away}</span>
                    <small>{schedule?.competition || league?.label || 'Competition unavailable'}</small>
                </div>
                <div className="sb-event-score" aria-label="Received score and status">
                    {scoreStatus?.score ? <><span>{scoreStatus.score.home}</span><span>{scoreStatus.score.away}</span></> : <span>Score unavailable</span>}
                    <small>{scoreStatus?.status || 'Status unavailable'}</small>
                </div>
            </button>

            <div className="sb-event-market">
                <div className="sb-market-caption"><span>{mainMarket?.label || 'Market unavailable'}</span></div>
                <div className="sb-row-odds">
                    {offers.slice(0, 3).map(selection => (
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

            {additionalMarkets > 0 ? (
                <button type="button" className="sb-more-markets" onClick={() => onOpenEvent(event.id)} aria-label={`Open ${additionalMarkets} additional supported markets`}>
                    +{additionalMarkets}<ChevronRight size={15} />
                </button>
            ) : null}
        </article>
    )
}

export default EventRow
