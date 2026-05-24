import { CalendarDays } from 'lucide-react'
import EventRow from './EventRow'

function groupEvents(events) {
    return events.reduce((groups, event) => {
        const day = new Date(event.startsAt)
        const dayLabel = Number.isNaN(day.getTime())
            ? 'Upcoming'
            : day.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
        const key = `${event.leagueId}-${dayLabel}`
        if (!groups[key]) groups[key] = { key, leagueId: event.leagueId, dayLabel, events: [] }
        groups[key].events.push(event)
        return groups
    }, {})
}

function EventList({ title = 'Events', events, leagues, selectedIds, onToggleSelection, onOpenEvent }) {
    const leagueMap = new Map(leagues.map(league => [league.id, league]))
    const groups = Object.values(groupEvents(events))

    return (
        <section className="sb-event-list">
            <div className="sb-section-title">
                <CalendarDays size={18} />
                <h2>{title}</h2>
            </div>
            {groups.length === 0 ? (
                <div className="sb-empty-panel">No events in this view.</div>
            ) : groups.map(group => {
                const league = leagueMap.get(group.leagueId)
                return (
                    <div key={group.key} className="sb-league-group">
                        <div className="sb-league-header">
                            <strong>{league?.label || group.leagueId}</strong>
                            <span>{group.dayLabel}</span>
                        </div>
                        {group.events.map(event => (
                            <EventRow
                                key={event.id}
                                event={event}
                                league={league}
                                selectedIds={selectedIds}
                                onToggleSelection={onToggleSelection}
                                onOpenEvent={onOpenEvent}
                            />
                        ))}
                    </div>
                )
            })}
        </section>
    )
}

export default EventList
