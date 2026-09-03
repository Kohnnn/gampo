import { useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'

function SearchOverlay({ open, query, category, events, sports, leagues, onQueryChange, onCategoryChange, onClose, onOpenEvent }) {
    const dialogRef = useRef(null)
    const inputRef = useRef(null)
    const openerRef = useRef(null)

    useEffect(() => {
        const dialog = dialogRef.current
        if (!dialog) return
        if (open && !dialog.open) {
            openerRef.current = document.activeElement
            dialog.showModal()
            inputRef.current?.focus()
        }
        if (!open && dialog.open) dialog.close()
    }, [open])

    const close = () => dialogRef.current?.close()
    const q = query.trim().toLowerCase()
    const leagueMap = new Map(leagues.map(league => [league.id, league]))
    const sportMap = new Map(sports.map(sport => [sport.id, sport]))
    const results = events.filter(event => {
        if (category !== 'all' && event.sportId !== category) return false
        if (!q) return true
        const league = leagueMap.get(event.leagueId)
        return [event.home, event.away, league?.label, sportMap.get(event.sportId)?.label, event.region].filter(Boolean).some(value => String(value).toLowerCase().includes(q))
    }).slice(0, 12)

    return (
        <dialog
            ref={dialogRef}
            className="sb-search-overlay"
            aria-labelledby="sportsbook-search-heading"
            onCancel={onClose}
            onClose={() => {
                onClose()
                openerRef.current?.isConnected && openerRef.current.focus()
            }}
            onClick={event => { if (event.target === dialogRef.current) close() }}
        >
            <section className="sb-search-panel">
                <header className="sb-search-heading">
                    <h2 id="sportsbook-search-heading">Search sportsbook fixtures</h2>
                    <button type="button" onClick={close} aria-label="Close search"><X size={20} /></button>
                </header>
                <div className="sb-search-box">
                    <label><span>Sport</span><select value={category} onChange={event => onCategoryChange(event.target.value)}><option value="all">All sports</option>{sports.map(sport => <option key={sport.id} value={sport.id}>{sport.label}</option>)}</select></label>
                    <Search size={19} aria-hidden="true" />
                    <label><span>Fixture</span><input ref={inputRef} value={query} onChange={event => onQueryChange(event.target.value)} placeholder="Team or competition" /></label>
                </div>

                <div className="sb-search-results">
                    {results.length === 0 ? <div className="sb-empty-panel">No matching fixtures.</div> : results.map(event => {
                        const league = leagueMap.get(event.leagueId)
                        const sport = sportMap.get(event.sportId)
                        const score = event.facts?.scoreStatus?.score
                        return (
                            <button key={event.id} type="button" className="sb-search-result" onClick={() => onOpenEvent(event.id)}>
                                <div><strong>{event.home}</strong><strong>{event.away}</strong><small>{sport?.label} · {league?.label || 'Competition unavailable'}</small></div>
                                <span className="sb-result-score">{score ? `${score.home}–${score.away}` : 'Score unavailable'}</span>
                            </button>
                        )
                    })}
                </div>
            </section>
        </dialog>
    )
}

export default SearchOverlay
