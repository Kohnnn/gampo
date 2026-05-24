import { Search, X } from 'lucide-react'

function SearchOverlay({ open, query, category, events, sports, leagues, onQueryChange, onCategoryChange, onClose, onOpenEvent }) {
    if (!open) return null
    const q = query.trim().toLowerCase()
    const leagueMap = new Map(leagues.map(league => [league.id, league]))
    const sportMap = new Map(sports.map(sport => [sport.id, sport]))
    const results = events.filter(event => {
        if (category !== 'all' && event.sportId !== category) return false
        if (!q) return true
        const league = leagueMap.get(event.leagueId)
        return [
            event.home,
            event.away,
            league?.label,
            sportMap.get(event.sportId)?.label,
            event.region,
        ].filter(Boolean).some(value => String(value).toLowerCase().includes(q))
    }).slice(0, 12)

    return (
        <div className="sb-search-overlay" role="dialog" aria-modal="true" aria-label="Search sportsbook">
            <div className="sb-search-panel">
                <div className="sb-search-box">
                    <select value={category} onChange={event => onCategoryChange(event.target.value)} aria-label="Search category">
                        <option value="all">Sports</option>
                        {sports.map(sport => <option key={sport.id} value={sport.id}>{sport.label}</option>)}
                    </select>
                    <Search size={19} />
                    <input
                        value={query}
                        onChange={event => onQueryChange(event.target.value)}
                        placeholder="soccer, Liverpool, NBA, racing"
                        autoFocus
                    />
                    <button type="button" onClick={onClose} aria-label="Close search"><X size={20} /></button>
                </div>

                <div className="sb-search-results">
                    {results.length === 0 ? <div className="sb-empty-panel">No matching events.</div> : results.map(event => {
                        const league = leagueMap.get(event.leagueId)
                        const sport = sportMap.get(event.sportId)
                        const mainMarket = event.marketGroups?.[0]
                        return (
                            <button key={event.id} type="button" className="sb-search-result" onClick={() => onOpenEvent(event.id)}>
                                <div>
                                    <strong>{event.home}</strong>
                                    <strong>{event.away}</strong>
                                    <small>
                                        {event.status === 'live' ? <b>Live {event.clock}</b> : null}
                                        {sport?.label} {'>'} {league?.region} {'>'} {league?.label}
                                    </small>
                                </div>
                                {event.score ? <span className="sb-result-score">{event.score.home}<br />{event.score.away}</span> : null}
                                <div className="sb-result-odds">
                                    {(mainMarket?.selections || []).slice(0, 3).map(selection => (
                                        <span key={selection.id}>{Number(selection.decimalOdds).toFixed(2)}</span>
                                    ))}
                                </div>
                            </button>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

export default SearchOverlay
