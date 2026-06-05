import { Search, Star, Trophy } from 'lucide-react'
import { OUTRIGHTS, PROMO_CARDS } from '../sportsbookData'
import EventList from './EventList'
import OddsButton from './OddsButton'

function TopMatchCard({ event, selectedIds, onToggleSelection, onOpenEvent }) {
    const market = event.marketGroups?.[0]
    return (
        <article className="sb-top-match">
            <button type="button" className="sb-top-match-main" onClick={() => onOpenEvent(event.id)}>
                <div className="sb-top-match-meta">
                    <span>{event.status === 'live' ? 'Live' : '8h'}</span>
                    <b>{Number(event.popularity || 0).toLocaleString()}</b>
                </div>
                <div className="sb-team-line">
                    <span className="sb-team-mark">{event.home.slice(0, 2).toUpperCase()}</span>
                    <strong>{event.home}<br />{event.away}</strong>
                    <span className="sb-team-mark is-away">{event.away.slice(0, 2).toUpperCase()}</span>
                </div>
                <small>{event.tags?.includes('live') ? 'Live market activity' : 'Popular 1x2 market'}</small>
            </button>
            <div className="sb-top-match-odds">
                {(market?.selections || []).slice(0, 3).map(selection => (
                        <OddsButton
                            key={selection.id}
                            selection={selection}
                            selected={selectedIds.has(selection.id)}
                            onToggle={() => onToggleSelection(selection.id)}
                            marketGroup={market}
                            compact
                        />
                    ))}
            </div>
        </article>
    )
}

function SportsHome({ events, sports, leagues, feedSource = 'fallback', selectedIds, onToggleSelection, onOpenEvent, onOpenSearch, onNavigate }) {
    const topMatches = events.filter(event => event.tags?.includes('top')).slice(0, 3)
    const popularEvents = events.filter(event => event.tags?.includes('popular')).slice(0, 6)
    const isLive = feedSource === 'live'

    // Outrights: only the synthetic fallback ships hardcoded "Practice XI"
    // futures. With a live feed we derive a real "title contenders" board from
    // the shortest-priced moneyline favourites across live events instead.
    const liveOutrights = (() => {
        if (!isLive) return []
        const rows = []
        for (const event of events) {
            const market = event.marketGroups?.[0]
            for (const selection of market?.selections || []) {
                if (selection.side === 'draw') continue
                if (!(selection.decimalOdds > 1)) continue
                rows.push([selection.label, selection.decimalOdds, event.id])
            }
        }
        return rows.sort((a, b) => a[1] - b[1]).slice(0, 8)
    })()
    const showOutrights = isLive ? liveOutrights.length > 0 : OUTRIGHTS.length > 0
    const outrightRows = isLive ? liveOutrights : OUTRIGHTS.map(([label, odds]) => [label, odds, null])
    const outrightTitle = isLive ? 'Title Contenders - Live Favourites' : 'World Cup Winner - 2026'

    return (
        <div className="sb-home">
            <section className="sb-promo-strip" aria-label="Sportsbook promotions">
                {PROMO_CARDS.map(card => {
                    const Icon = card.icon
                    return (
                        <article key={card.id} className="sb-promo">
                            <div>
                                <span>{card.label}</span>
                                <h2>{card.title}</h2>
                                <p>{card.copy}</p>
                                <button type="button">{card.action}</button>
                            </div>
                            <Icon size={78} />
                        </article>
                    )
                })}
            </section>
            <div className="sb-scroll-dots" aria-hidden="true">
                {PROMO_CARDS.map(card => <span key={card.id} />)}
            </div>

            <button type="button" className="sb-search-trigger" onClick={onOpenSearch}>
                <Search size={20} />
                <span>Search your game or event</span>
            </button>

            <nav className="sb-subnav" aria-label="Sportsbook sections">
                <button type="button" className="is-active" onClick={() => onNavigate({ view: 'home' })}>Sports Home</button>
                <button type="button" onClick={() => onNavigate({ view: 'live' })}>Live Betting</button>
                <button type="button" onClick={() => onNavigate({ view: 'my-bets' })}>My Bets</button>
                <button type="button" onClick={() => onNavigate({ view: 'starting' })}>Starting Soon</button>
            </nav>

            <section className="sb-shelf">
                <div className="sb-section-title">
                    <Star size={18} />
                    <h2>Top Matches</h2>
                </div>
                <div className="sb-top-grid">
                    {topMatches.map(event => (
                        <TopMatchCard
                            key={event.id}
                            event={event}
                            selectedIds={selectedIds}
                            onToggleSelection={onToggleSelection}
                            onOpenEvent={onOpenEvent}
                        />
                    ))}
                </div>
            </section>

            {showOutrights && (
                <section className="sb-outrights">
                    <div className="sb-section-title">
                        <Trophy size={18} />
                        <h2>{outrightTitle}</h2>
                    </div>
                    <div className="sb-outright-grid">
                        {outrightRows.map(([label, odds, eventId]) => (
                            <button
                                key={`${label}-${odds}`}
                                type="button"
                                onClick={eventId ? () => onOpenEvent(eventId) : undefined}
                            >
                                <span>{label}</span>
                                <strong>{Number(odds).toFixed(2)}</strong>
                            </button>
                        ))}
                    </div>
                </section>
            )}

            <section className="sb-top-sports">
                <div className="sb-section-title">
                    <Trophy size={18} />
                    <h2>Top Sports</h2>
                </div>
                <div className="sb-sport-chip-grid">
                    {sports.slice(0, 10).map(sport => {
                        const Icon = sport.icon
                        return (
                            <button key={sport.id} type="button" onClick={() => onNavigate({ view: 'sport', sportId: sport.id })}>
                                <Icon size={18} />
                                <span>{sport.label}</span>
                                <b>{sport.eventCount || 0}</b>
                            </button>
                        )
                    })}
                </div>
            </section>

            <EventList
                title="Popular Events"
                events={popularEvents}
                leagues={leagues}
                selectedIds={selectedIds}
                onToggleSelection={onToggleSelection}
                onOpenEvent={onOpenEvent}
            />
        </div>
    )
}

export default SportsHome
