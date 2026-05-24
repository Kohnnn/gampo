import {
    ChevronDown,
    Clock3,
    Grid2X2,
    ListChecks,
    Radio,
} from 'lucide-react'

function RailRow({ active, icon: Icon, label, count, onClick, chevron = false }) {
    return (
        <button type="button" className={`sb-rail-row ${active ? 'is-active' : ''}`} onClick={onClick}>
            {Icon ? <Icon size={18} /> : null}
            <span>{label}</span>
            {count ? <b>{count}</b> : null}
            {chevron ? <ChevronDown size={15} className="sb-rail-chevron" /> : null}
        </button>
    )
}

function SportsRail({ sports, view, activeSportId, onNavigate }) {
    const liveCount = sports.reduce((sum, sport) => sum + (sport.liveCount || 0), 0)
    const topSports = sports.slice(0, 10)

    return (
        <aside className="sb-rail">
            <div className="sb-rail-section">
                <RailRow active={view === 'live'} icon={Radio} label="Live Events" count={liveCount} onClick={() => onNavigate({ view: 'live' })} />
                <RailRow active={view === 'starting'} icon={Clock3} label="Starting Soon" onClick={() => onNavigate({ view: 'starting' })} />
                <RailRow active={view === 'all'} icon={Grid2X2} label="All" onClick={() => onNavigate({ view: 'all' })} />
                <RailRow active={view === 'my-bets'} icon={ListChecks} label="My Bets" onClick={() => onNavigate({ view: 'my-bets' })} />
            </div>

            <div className="sb-rail-section">
                <h3>Top Sports</h3>
                {topSports.map(sport => (
                    <RailRow
                        key={sport.id}
                        active={activeSportId === sport.id && view === 'sport'}
                        icon={sport.icon}
                        label={sport.label}
                        count={sport.liveCount}
                        chevron
                        onClick={() => onNavigate({ view: 'sport', sportId: sport.id })}
                    />
                ))}
            </div>

            <div className="sb-rail-section sb-rail-groups">
                <RailRow icon={Grid2X2} label="All Sports" chevron onClick={() => onNavigate({ view: 'all', group: 'all-sports' })} />
                <RailRow icon={Grid2X2} label="All Esports" chevron onClick={() => onNavigate({ view: 'all', group: 'all-esports' })} />
                <RailRow icon={Grid2X2} label="All Racing" chevron onClick={() => onNavigate({ view: 'sport', sportId: 'horse-racing' })} />
            </div>
        </aside>
    )
}

export default SportsRail
