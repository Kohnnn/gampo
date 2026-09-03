import { Search, Trophy } from 'lucide-react'
import EventList from './EventList'

function SportsHome({ events, sports, leagues, feedSource = 'fallback', selectedIds, onToggleSelection, onOpenEvent, onOpenSearch, onNavigate }) {
    const providerFeed = feedSource !== 'fallback'

    return (
        <div className="sb-home">
            <button type="button" className="sb-search-trigger" onClick={onOpenSearch}>
                <Search size={20} />
                <span>Search fixtures</span>
            </button>

            <p className="sb-board-role">{providerFeed ? 'Real-event feed guard active. Only received fixture facts and attributable offers are shown.' : 'Generated model practice board. Model estimates are not bookmaker prices.'}</p>

            <nav className="sb-subnav" aria-label="Sportsbook sections">
                <button type="button" className="is-active" aria-current="page" onClick={() => onNavigate({ view: 'home' })}>Sports Home</button>
                <button type="button" onClick={() => onNavigate({ view: 'live' })}>Live</button>
                <button type="button" onClick={() => onNavigate({ view: 'my-bets' })}>My Bets</button>
                <button type="button" onClick={() => onNavigate({ view: 'starting' })}>Starting Soon</button>
            </nav>

            <section className="sb-top-sports" aria-labelledby="sports-list-heading">
                <div className="sb-section-title">
                    <Trophy size={18} />
                    <h2 id="sports-list-heading">Sports</h2>
                </div>
                <div className="sb-sport-chip-grid">
                    {sports.filter(sport => sport.eventCount > 0).map(sport => {
                        const Icon = sport.icon
                        return (
                            <button key={sport.id} type="button" onClick={() => onNavigate({ view: 'sport', sportId: sport.id })}>
                                <Icon size={18} />
                                <span>{sport.label}</span>
                                <b>{sport.eventCount}</b>
                            </button>
                        )
                    })}
                </div>
            </section>

            <EventList
                title="Fixture board"
                events={events}
                leagues={leagues}
                selectedIds={selectedIds}
                onToggleSelection={onToggleSelection}
                onOpenEvent={onOpenEvent}
            />
        </div>
    )
}

export default SportsHome
