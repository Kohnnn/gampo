import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Flame, Plus, RotateCcw, Search, ShieldCheck, Trophy, Clock, GraduationCap, Pin } from 'lucide-react'
import { useCredits } from '../context/CreditContext'
import { useSidebarPins } from '../hooks/useSidebarPins'
import { findGameDefinition } from '../data/gameDefinitions'
import {
    featuredCollections,
    fullGameCatalog,
    liveStudioTables,
    lobbyStats,
    missions,
} from '../data/casinoCatalog'
import { formatCredits, rolloverProgress } from '../utils/simulationMath'
import '../styles/casino.css'

const filters = ['All', 'Originals', 'Slots', 'Table', 'Arcade', 'Sports']

// Compact volatility labels so the metadata chip reads fully on narrow cards
// instead of hard-truncating ("Low to ext..." -> "Low–Extreme"). Falls back to
// the source string for any label not in the map.
const VOLATILITY_ABBR = {
    'Low to extreme': 'Low–Extreme',
    'Low to medium': 'Low–Med',
    'Low to high': 'Low–High',
    'Medium to high': 'Med–High',
    'Medium high': 'Med-high',
    'Very high': 'Very high',
    'Market dependent': 'Market',
    'Target dependent': 'Target',
    'Skill dependent': 'Skill',
    'Configurable': 'Config',
}

function abbreviateVolatility(volatility) {
    if (!volatility) return 'Variable'
    return VOLATILITY_ABBR[volatility] || volatility
}

const labelToGameId = {
    'Dice': 'dice', 'Limbo': 'limbo', 'Keno': 'keno', 'Wheel': 'wheel', 'Roulette': 'roulette',
    'Blackjack': 'blackjack', 'Slots': 'slots', 'Coin Flip': 'coinflip', 'Rock Paper Scissors': 'rps',
    'Guess Number': 'guess', 'Hi-Lo Cards': 'hilo', 'Baccarat': 'baccarat', 'Sic Bo': 'sicbo',
    'Video Poker': 'videopoker', 'Color Pick': 'color', 'Tower Climb': 'tower', 'Lottery Draw': 'lottery',
    'Casino War': 'war', 'Chicken Cross': 'chickencross', 'Crash': 'crash', 'Plinko': 'plinko',
    'Dino Run': 'dino', 'Mines': 'mines',
}

function deriveRecentlyPlayed(transactions) {
    const seen = new Set()
    const out = []
    for (const tx of transactions) {
        if (tx.type !== 'bet') continue
        const id = labelToGameId[tx.label]
        if (!id || seen.has(id)) continue
        seen.add(id)
        const game = findGameDefinition(id)
        if (game) out.push(game)
        if (out.length >= 8) break
    }
    return out
}

function HomePage() {
    const { balance, grantPracticeCredits, resetBalance, transactions } = useCredits()
    const { pins } = useSidebarPins()
    const [query, setQuery] = useState('')
    const [filter, setFilter] = useState('All')

    const wagered = transactions.filter(item => item.type === 'bet').reduce((sum, item) => sum + Math.abs(item.amount || 0), 0)
    const rollover = rolloverProgress({ wagered, required: 500 })

    const games = useMemo(() => fullGameCatalog.filter(item => {
        const haystack = `${item.name} ${item.category || ''} ${item.provider || ''} ${item.volatility || ''}`.toLowerCase()
        const matchesSearch = haystack.includes(query.trim().toLowerCase())
        const matchesFilter = filter === 'All'
            || (filter === 'Originals' && ['Arcade originals', 'Table math', 'Decision games', 'Lottery math'].includes(item.category))
            || (filter === 'Slots' && item.provider)
            || (filter === 'Table' && ['Table math', 'Card room', 'Dice table'].includes(item.category))
            || (filter === 'Arcade' && String(item.category || '').includes('Arcade'))
            || (filter === 'Sports' && item.id === 'sports')
        return matchesSearch && matchesFilter
    }), [filter, query])

    const recent = transactions.slice(0, 5)
    const recentlyPlayed = useMemo(() => deriveRecentlyPlayed(transactions), [transactions])
    const pinnedRow = useMemo(() => (
        pins
            .map(path => fullGameCatalog.find(game => game.path === path))
            .filter(Boolean)
            .slice(0, 12)
    ), [pins])

    // Curated rows scroll horizontally. Only the contextual rows remain
    // (recently played, pinned, recommended starters); the per-category rows
    // were removed because the filterable grid below is the canonical browse
    // surface and duplicated them verbatim.
    const recommendedRow = useMemo(() => {
        // Pick a few games with low complexity / strong educational value first
        const priority = ['dice', 'coinflip', 'limbo', 'wheel', 'blackjack', 'baccarat', 'roulette', 'videopoker']
        return priority.map(id => findGameDefinition(id)).filter(Boolean)
    }, [])

    return (
        <div className="casino-page" data-ux-surface="stage">
            <section className="casino-hero" data-ux-surface="stage">
                <div className="casino-hero-copy" data-ux-surface="stage">
                    <span className="casino-kicker">Practice casino lab</span>
                    <h1>GamPo</h1>
                    <p>Fake-credit originals, arcade classics, slots catalogue, live-table simulations, sportsbook odds and risk education in one app.</p>
                    <div className="casino-actions">
                        <button className="casino-action primary" onClick={() => grantPracticeCredits(500)} data-ux-primary-action>
                            <Plus size={16} />
                            Add 500 GC
                        </button>
                        <button className="casino-action" onClick={resetBalance}>
                            <RotateCcw size={16} />
                            Reset lab
                        </button>
                        <Link className="casino-action" to="/learn">
                            <BookOpen size={16} />
                            Risk academy
                        </Link>
                        <Link className="casino-action" to="/verify">
                            <ShieldCheck size={16} />
                            Verify
                        </Link>
                    </div>
                </div>
                <div className="casino-bank-panel">
                    <div>
                        <span>Practice Credits</span>
                        <strong>{formatCredits(balance)}</strong>
                    </div>
                    <div className="casino-progress">
                        <span style={{ width: `${rollover * 100}%` }} />
                    </div>
                    <div className="casino-stat-grid">
                        {lobbyStats.map(stat => (
                            <div key={stat.label}>
                                <span>{stat.label}</span>
                                <strong>{stat.label === 'Practice balance' ? formatCredits(balance) : stat.value}</strong>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="casino-strip" data-ux-surface="card">
                {featuredCollections.map(collection => (
                    <Link key={collection.id} to={collection.path} className="collection-tile" style={{ '--accent': collection.accent }} data-ux-surface="card">
                        <span>{collection.title}</span>
                        <p>{collection.description}</p>
                    </Link>
                ))}
            </section>

            {/* Contextual discovery rows only — the curated per-category rows
                (Originals / Tables / Arcade / Slots) used to duplicate the
                filterable grid below verbatim. The grid + filters are now the
                single canonical browse surface, so we keep just the rows that
                add context the grid can't: what you played, what you pinned, and
                a beginner-friendly starter set. */}
            {recentlyPlayed.length > 0 && (
                <CategoryRow icon={<Clock size={16} />} title="Recently played" link="/activity" games={recentlyPlayed} />
            )}
            {pinnedRow.length > 0 && (
                <CategoryRow icon={<Pin size={16} />} title="Pinned games" link="/" games={pinnedRow} />
            )}
            <CategoryRow icon={<GraduationCap size={16} />} title="New here? Start with these" link="/learn" games={recommendedRow} />

            <section className="casino-workspace" data-ux-surface="stage">
                <main>
                    <div className="casino-toolbar">
                        <div className="casino-search">
                            <Search size={17} />
                            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search games, volatility, provider" aria-label="Search games" />
                        </div>
                        <div className="casino-filters">
                            {filters.map(item => (
                                <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>
                                    {item}
                                </button>
                            ))}
                        </div>
                    </div>
                    <h2 className="casino-grid-heading">All games</h2>
                    <GameGrid games={games} />
                </main>
                <aside className="casino-rail">
                    <RailBlock icon={<Flame size={16} />} title="Live Studio">
                        {liveStudioTables.slice(0, 3).map(table => (
                            <Link key={table.id} to={table.gamePath} className="rail-link">
                                <span>{table.name}</span>
                                <strong>{table.pace}</strong>
                            </Link>
                        ))}
                    </RailBlock>
                    <RailBlock icon={<Trophy size={16} />} title="Missions">
                        {missions.slice(0, 3).map(mission => (
                            <div key={mission.id} className="mini-progress">
                                <span>{mission.title}</span>
                                <div><i style={{ width: `${mission.progress * 100}%` }} /></div>
                            </div>
                        ))}
                    </RailBlock>
                    <RailBlock icon={<ShieldCheck size={16} />} title="Recent Activity">
                        {recent.length === 0 ? (
                            <p className="muted">No simulations yet.</p>
                        ) : recent.map(item => (
                            <div key={item.id} className="activity-mini">
                                <span>{item.label || item.type}</span>
                                <strong className={(item.amount || 0) >= 0 ? 'positive' : 'negative'}>
                                    {(item.amount || 0) >= 0 ? '+' : ''}{formatCredits(item.amount || 0)}
                                </strong>
                            </div>
                        ))}
                    </RailBlock>
                </aside>
            </section>
        </div>
    )
}

function CategoryRow({ icon, title, link, games }) {
    if (!games || games.length === 0) return null
    return (
        <section className="category-row" data-ux-surface="card">
            <header>
                <h2>{icon}{title}</h2>
                <Link to={link}>View all</Link>
            </header>
            <div className="category-scroll">
                {games.map(game => (
                    <Link key={game.id} to={game.path} className="category-card" style={{ '--accent': game.accent || '#00e701' }} data-ux-surface="card">
                        <div className="category-art">
                            {game.image ? <img src={game.image} alt="" loading="lazy" decoding="async" width="320" height="320" /> : <span>{game.name.slice(0, 2)}</span>}
                            {game.tag ? <span className="casino-game-tag">{game.tag}</span> : null}
                            <i className="category-glow" />
                        </div>
                        <h3>{game.name}</h3>
                        <small>{game.provider || game.category || 'GamPo Lab'}</small>
                    </Link>
                ))}
            </div>
        </section>
    )
}

export function GameGrid({ games = [] }) {
    if (!games.length) {
        return (
            <div className="casino-empty-state">
                <strong>No matching games</strong>
                <span>Try a game name, category, volatility, provider, or mode.</span>
            </div>
        )
    }

    return (
        <div className="casino-game-grid" data-ux-surface="card">
            {games.map(game => {
                const badges = [
                    `RTP ${game.rtp ? `${(game.rtp * 100).toFixed(1)}%` : 'Lab'}`,
                    abbreviateVolatility(game.volatility),
                    game.hitFrequency || game.category || 'Practice',
                ].filter(Boolean)
                const visibleBadges = badges.slice(0, 2)
                const hiddenCount = Math.max(0, badges.length - visibleBadges.length)
                return (
                    <Link key={game.id} to={game.path} className="casino-game-card" style={{ '--accent': game.accent || '#00e701' }} data-ux-surface="card">
                        <div className="casino-game-art">
                            {game.image ? <img src={game.image} alt="" loading="lazy" decoding="async" width="320" height="320" /> : <span>{game.name.slice(0, 2)}</span>}
                            {game.tag ? <span className="casino-game-tag">{game.tag}</span> : null}
                            <div className="casino-game-titlemark">
                                <span>{game.category?.split(' ')[0] || 'Game'}</span>
                                <strong>{game.name}</strong>
                            </div>
                        </div>
                        <div className="casino-game-body">
                            <span>{game.provider || game.category || 'GamPo Lab'}</span>
                            <div className="casino-game-badges" title={[`RTP ${game.rtp ? `${(game.rtp * 100).toFixed(1)}%` : 'Lab'}`, game.volatility || 'Variable', game.hitFrequency || game.category || 'Practice'].join(' · ')}>
                                {visibleBadges.map(label => <b key={label}>{label}</b>)}
                                {hiddenCount > 0 ? <b className="casino-game-more">+{hiddenCount}</b> : null}
                            </div>
                        </div>
                    </Link>
                )
            })}
        </div>
    )
}

function RailBlock({ icon, title, children }) {
    return (
        <section className="rail-block">
            <h3>{icon}{title}</h3>
            {children}
        </section>
    )
}

export default HomePage
