import { NavLink } from 'react-router-dom'
import { useMemo, useState } from 'react'

const navSections = [
    {
        title: 'Casino',
        items: [
            { icon: 'home', label: 'Lobby', path: '/' },
            { icon: 'originals', label: 'Originals', path: '/originals' },
            { icon: 'slotsLobby', label: 'Slots Lobby', path: '/slots-lobby' },
            { icon: 'live', label: 'Live Studio', path: '/live' },
            { icon: 'sports', label: 'Sportsbook', path: '/sports' },
        ],
    },
    {
        title: 'Progress',
        items: [
            { icon: 'gift', label: 'Promotions', path: '/promotions' },
            { icon: 'mission', label: 'Missions', path: '/missions' },
            { icon: 'vip', label: 'VIP Lab', path: '/vip' },
            { icon: 'academy', label: 'Risk Academy', path: '/learn' },
        ],
    },
    {
        title: 'Account',
        items: [
            { icon: 'verify', label: 'Verify', path: '/verify' },
            { icon: 'race', label: 'Race', path: '/race' },
            { icon: 'activity', label: 'Activity', path: '/activity' },
        ],
    },
]

// Quick-action buttons that don't navigate; they dispatch global events.
const sidebarActions = [
    {
        icon: 'chat', label: 'Open Chat',
        onClick: () => document.dispatchEvent(new CustomEvent('gampo:open-chat', { detail: { tab: 'chat' } })),
    },
    {
        icon: 'pnl', label: 'PnL Stats',
        onClick: () => document.dispatchEvent(new CustomEvent('gampo:open-chat', { detail: { tab: 'stats' } })),
    },
]

const gameItems = [
    { group: 'Featured', icon: 'poker', label: 'Live Poker', path: '/poker' },
    { group: 'Featured', icon: 'crash', label: 'Crash', path: '/crash' },
    { group: 'Featured', icon: 'plinko', label: 'Plinko', path: '/plinko' },
    { group: 'Featured', icon: 'mines', label: 'Mines', path: '/mines' },
    { group: 'Originals', icon: 'dino', label: 'Dino Run', path: '/dino' },
    { group: 'Originals', icon: 'dice', label: 'Dice', path: '/dice' },
    { group: 'Originals', icon: 'limbo', label: 'Limbo', path: '/limbo' },
    { group: 'Originals', icon: 'keno', label: 'Keno', path: '/keno' },
    { group: 'Originals', icon: 'wheel', label: 'Wheel', path: '/wheel' },
    { group: 'Tables', icon: 'roulette', label: 'Roulette', path: '/roulette' },
    { group: 'Tables', icon: 'blackjack', label: 'Blackjack', path: '/blackjack' },
    { group: 'Tables', icon: 'baccarat', label: 'Baccarat', path: '/baccarat' },
    { group: 'Tables', icon: 'war', label: 'Casino War', path: '/war' },
    { group: 'Tables', icon: 'sicbo', label: 'Sic Bo', path: '/sicbo' },
    { group: 'Cards', icon: 'videopoker', label: 'Video Poker', path: '/videopoker' },
    { group: 'Cards', icon: 'hilo', label: 'Hi-Lo Cards', path: '/hilo' },
    { group: 'Arcade', icon: 'color', label: 'Color Pick', path: '/color' },
    { group: 'Arcade', icon: 'tower', label: 'Tower', path: '/tower' },
    { group: 'Arcade', icon: 'chickencross', label: 'Chicken Cross', path: '/chickencross' },
    { group: 'Arcade', icon: 'lottery', label: 'Lottery', path: '/lottery' },
    { group: 'Arcade', icon: 'slots', label: 'Slots', path: '/slots' },
    { group: 'Arcade', icon: 'coinflip', label: 'Coin Flip', path: '/coinflip' },
    { group: 'Arcade', icon: 'rps', label: 'RPS', path: '/rps' },
    { group: 'Arcade', icon: 'guess', label: 'Guess Number', path: '/guess' },
]

// SVG glyphs (stroked outlines). 24x24 viewBox.
const icons = {
    // sidebar nav
    home:        <path d="M3 12 12 4l9 8v8a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1v-8z" />,
    originals:   <path d="M12 2 14.5 8.5 21 9.27 16 13.97l1.5 6.78L12 17.27 6.5 20.75 8 13.97 3 9.27l6.5-.77L12 2z" />,
    slotsLobby:  <path d="M3 6h18v12H3V6zm2 2v8h4V8H5zm6 0v8h2V8h-2zm4 0v8h4V8h-4z" />,
    live:        <path d="M5 6h14v10H5V6zm-2 12h18v2H3v-2zm6-9 5 4-5 4V9z" />,
    sports:      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4 3 2-1 4 3 2-3 2 1 4-3-2-3 2 1-4-3-2 3-2-1-4 3-2z" />,
    gift:        <path d="M20 8h-3.18a3 3 0 0 0-4.82-3 3 3 0 0 0-4.82 3H4v4h2v9h12v-9h2V8zm-9 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm2-2a1 1 0 1 1 2 0 1 1 0 0 1-2 0z" />,
    mission:     <path d="M12 2 4 5v6c0 5 3.5 9.5 8 11 4.5-1.5 8-6 8-11V5l-8-3zm-1 14-4-4 1.5-1.5L11 13l4.5-4.5L17 10l-6 6z" />,
    vip:         <path d="M5 16 3 6l5 3 4-7 4 7 5-3-2 10H5zm0 2h14v3H5v-3z" />,
    academy:     <path d="M12 3 1 9l11 6 9-4.91V17h2V9L12 3zm-7 9.18v4l7 3.82 7-3.82v-4l-7 3.82-7-3.82z" />,
    verify:      <path d="m9 16.2-3.5-3.5L4 14.2 9 19.2 20 8.2l-1.5-1.5L9 16.2z" />,
    race:        <path d="M5 4v6h2V8h2v8H6v2h12v-2h-3V8h2v2h2V4H5zm6 4v8h2V8h-2z" />,
    activity:    <path d="M3 12h4l2-7 4 14 2-7h6v2h-4l-3 9-4-14-1 5H3v-2z" />,

    // actions
    chat:        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z" />,
    pnl:         <path d="M3 17h4v4H3v-4zm6-6h4v10H9V11zm6-8h4v18h-4V3z" />,

    // games
    crash:       <path d="M14 2h7v7l-3-3-5 5-3-3-7 7L2 13l9-9 3 3 0 -5z" />,
    plinko:      <path d="M12 3 4 17h16L12 3zm0 4 5.5 9.5h-11L12 7zm-4 4 4 7 4-7M9 12h2M13 12h2" />,
    dino:        <path d="M19 10V8h-2V6h-2V4h-3v2H9v3H6v3H3v3h3v3h3v-3h6v3h3v-3h3v-3h-3v-2zM12 8h2v2h-2V8z" />,
    mines:       <path d="M12 2 1 22h22L12 2zm0 5 7 12H5l7-12zm0 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />,
    dice:        <path d="M5 5h14v14H5V5zm3 3v2h2V8H8zm6 6v2h2v-2h-2zM8 14v2h2v-2H8zm6-6v2h2V8h-2zm-3 3v2h2v-2h-2z" />,
    limbo:       <path d="M5 19 19 5m-7-2a9 9 0 0 1 9 9h-2a7 7 0 1 0-7 7v2a9 9 0 0 1 0-18z" />,
    keno:        <path d="M3 5h6v6H3V5zm12 0h6v6h-6V5zM3 13h6v6H3v-6zm12 4 6-6m-6 0 6 6" />,
    wheel:       <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm0 0v12m6-6H6" />,
    roulette:    <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 6a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm0 1a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />,
    blackjack:   <path d="M9 4h2l5 5v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2zm5 4V4l4 4h-4zm-3 2 2 5-2 1-2-1 2-5z" />,
    baccarat:    <path d="M5 5h6v6H5V5zm8 8h6v6h-6v-6zm-8 8 4-6 2 2-2 4H5zm14-16-4 6-2-2 2-4h4z" />,
    war:         <path d="m6 4 12 12-2 2-12-12 2-2zm12 0 2 2-12 12-2-2 12-12zM4 18l2-2 2 2-2 2-2-2zm14 0 2-2 2 2-2 2-2-2z" />,
    sicbo:       <path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7zm-6-7v1m6 5v1m-6 7v1m6-5v1" />,
    videopoker:  <path d="M5 3h10l4 4v14H5V3zm10 0v4h4M8 11h2v6H8v-6zm4 0h4v6h-4v-6z" />,
    color:       <path d="M12 3a9 9 0 0 0 0 18 3 3 0 0 0 3-3v-1a2 2 0 0 1 2-2h1a3 3 0 0 0 3-3 9 9 0 0 0-9-9zm-5 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm3-5a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm5 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm3 5a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" />,
    tower:       <path d="M6 3h12v4H6V3zm-2 6h16v4H4V9zm-2 6h20v6H2v-6z" />,
    chickencross:<path d="M5 3v2h14V3H5zM3 7h18v2H3V7zm0 4h18v2H3v-2zm0 4h18v2H3v-2zm0 4h18v2H3v-2z" />,
    lottery:     <path d="M3 7c1 0 2-1 2-2h14c0 1 1 2 2 2v10c-1 0-2 1-2 2H5c0-1-1-2-2-2V7zm3 2v6h12V9H6zm2 1h2v4H8v-4z" />,
    slots:       <path d="M3 5h18v14H3V5zm3 3v8h3V8H6zm6 0v8h3V8h-3zm6 0v8h0V8h0zM5 7h2v2H5V7zm6 0h2v2h-2V7zm6 0h2v2h-2V7z" />,
    coinflip:    <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 3a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm-1 2v2H9v2h2v4h2v-4h2V8h-2V6h-2z" />,
    rps:         <path d="M6 6a2 2 0 0 1 2-2 2 2 0 0 1 2 2v6h0v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a1 1 0 0 1 1-1 1 1 0 0 1 1 1zM14 4l4 8-2 2 4 4-2 2-4-4-2 2-4-8 6-6z" />,
    guess:       <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1 13h2v2h-2v-2zm0-9a3 3 0 0 1 3 3c0 2-3 2-3 5h-2c0-3 3-3 3-5a1 1 0 0 0-1-1 1 1 0 0 0-1 1H9a3 3 0 0 1 3-3z" />,
    hilo:        <path d="M5 4h6v8H5V4zm2 2v4h2V6H7zm6-2h6v8h-6V4zm2 2v4h2V6h-2zM5 14h6v8H5v-8zm2 2v4h2v-4H7zm6-2h6v8h-6v-8zm2 2v4h2v-4h-2z" />,
    poker:       <path d="M12 2a4 4 0 0 0-4 4c0 2 1 3 2 4-2 0-4 1-4 4 0 2 2 4 4 4 1 0 2 0 2-1l-1 5h2l-1-5c0 1 1 1 2 1 2 0 4-2 4-4 0-3-2-4-4-4 1-1 2-2 2-4a4 4 0 0 0-4-4z" />,
}

function Sidebar({ isOpen, toggleSidebar }) {
    const [gameSearch, setGameSearch] = useState('')
    const groupedGames = useMemo(() => {
        const q = gameSearch.trim().toLowerCase()
        const filtered = q ? gameItems.filter(item => item.label.toLowerCase().includes(q) || item.group.toLowerCase().includes(q)) : gameItems
        return filtered.reduce((acc, item) => {
            if (!acc[item.group]) acc[item.group] = []
            acc[item.group].push(item)
            return acc
        }, {})
    }, [gameSearch])
    return (
        <aside className={`app-sidebar ${!isOpen ? 'app-sidebar-hidden' : ''}`}>
            <div className="sidebar-header">
                <button className="icon-btn sidebar-toggle" onClick={toggleSidebar} aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'} title={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}>
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 6h18v2H3V6m0 5h18v2H3v-2m0 5h18v2H3v-2z"></path></svg>
                </button>
                <div className="sidebar-switcher">
                    <NavLink to="/" className={({ isActive }) => `switch-btn ${isActive ? 'active' : ''}`}>
                        Games
                    </NavLink>
                    <NavLink to="/sports" className={({ isActive }) => `switch-btn ${isActive ? 'active' : ''}`}>
                        Sports
                    </NavLink>
                </div>
            </div>

            <nav className="sidebar-nav">
                {navSections.map(section => (
                    <div key={section.title} className="nav-section compact">
                        <h3 className="nav-title">{section.title}</h3>
                        {section.items.map((item) => (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                title={item.label}
                                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                            >
                                <span className="nav-icon">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{icons[item.icon] || icons.home}</svg>
                                </span>
                                <span>{item.label}</span>
                            </NavLink>
                        ))}
                    </div>
                ))}

                <div className="nav-section compact">
                    <h3 className="nav-title">Utility</h3>
                    {sidebarActions.map((action) => (
                        <button
                            key={action.label}
                            type="button"
                            className="nav-item nav-item-action"
                            title={action.label}
                            onClick={action.onClick}
                        >
                            <span className="nav-icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{icons[action.icon] || icons.chat}</svg>
                            </span>
                            <span>{action.label}</span>
                        </button>
                    ))}
                </div>

                <div className="nav-section">
                    <h3 className="nav-title">Games</h3>
                    <label className="nav-game-search">
                        <span>Search games</span>
                        <input value={gameSearch} onChange={e => setGameSearch(e.target.value)} placeholder="Crash, poker, cards..." />
                    </label>
                    {Object.entries(groupedGames).map(([group, items]) => (
                        <details key={group} className="nav-game-group" open={group === 'Featured' || gameSearch.trim()}>
                            <summary>{group}<b>{items.length}</b></summary>
                            {items.map((item) => (
                                <NavLink
                                    key={item.path}
                                    to={item.path}
                                    title={item.label}
                                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                                >
                                    <span className="nav-icon">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{icons[item.icon] || icons.dice}</svg>
                                    </span>
                                    <span>{item.label}</span>
                                </NavLink>
                            ))}
                        </details>
                    ))}
                </div>
            </nav>
        </aside>
    )
}

export default Sidebar
