import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Settings as SettingsIcon } from 'lucide-react'
import { useCredits } from '../context/CreditContext'
import { fullGameCatalog } from '../data/casinoCatalog'
import { searchGames } from '../utils/gameSearch'

const GAME_PATHS = [
    '/crash',
    '/plinko',
    '/dino',
    '/mines',
    '/dice',
    '/limbo',
    '/keno',
    '/wheel',
    '/roulette',
    '/blackjack',
    '/slots',
    '/coinflip',
    '/rps',
    '/guess',
    '/hilo',
    '/sportsbook',
    '/sports',
    '/originals',
    '/slots-lobby',
    '/live',
    '/missions',
    '/vip',
    '/learn',
    '/activity',
]

const CreditIcon = ({ size = 20, fontSize = 11 }) => (
    <div
        className="credit-icon"
        style={{ width: size, height: size, minWidth: size, fontSize }}
        aria-hidden="true"
    >
        GC
    </div>
)

function Header() {
    const location = useLocation()
    const navigate = useNavigate()
    const {
        balance,
        grantPracticeCredits,
        resetBalance,
        transactions,
        toasts,
    } = useCredits()
    const [showCredits, setShowCredits] = useState(false)
    const [grantAmount, setGrantAmount] = useState('')
    const [searchQuery, setSearchQuery] = useState('')
    const [searchOpen, setSearchOpen] = useState(false)
    const [activeSearchIndex, setActiveSearchIndex] = useState(0)
    const dropdownRef = useRef(null)
    const searchRef = useRef(null)

    const isPlaySurface = GAME_PATHS.some(path => location.pathname.startsWith(path))
    const searchResults = useMemo(() => searchGames(fullGameCatalog, searchQuery, 8), [searchQuery])
    const formattedBalance = balance.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setShowCredits(false)
            }
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setSearchOpen(false)
                setActiveSearchIndex(0)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    useEffect(() => {
        setSearchOpen(false)
        setActiveSearchIndex(0)
    }, [location.pathname])

    useEffect(() => {
        setActiveSearchIndex(0)
    }, [searchQuery])

    const addPracticeCredits = () => {
        const amount = Number(grantAmount)
        if (Number.isFinite(amount) && amount > 0) {
            grantPracticeCredits(amount)
            setGrantAmount('')
        }
    }

    const renderTransactionLabel = (type) => {
        if (type === 'bet') return 'Bet'
        if (type === 'win') return 'Return'
        if (type === 'grant') return 'Top-up'
        if (type === 'reset') return 'Reset'
        return 'Adjustment'
    }

    const handleSearchKeyDown = (event) => {
        if (event.key === 'Escape') {
            setSearchOpen(false)
            setActiveSearchIndex(0)
            return
        }
        if (!searchResults.length) return
        if (event.key === 'ArrowDown') {
            event.preventDefault()
            setSearchOpen(true)
            setActiveSearchIndex(index => Math.min(index + 1, searchResults.length - 1))
        } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActiveSearchIndex(index => Math.max(index - 1, 0))
        } else if (event.key === 'Enter') {
            const next = searchResults[activeSearchIndex]
            if (next?.path) {
                setSearchQuery('')
                setSearchOpen(false)
                navigate(next.path)
            }
        }
    }

    return (
        <header className={`header ${isPlaySurface ? 'header-play-surface' : ''}`} data-ux-surface="shell">
            <div className="header-left">
                <Link to="/" className="logo-link" aria-label="GamPo home">
                    <span className="logo">GamPo</span>
                </Link>
                <span className="header-mode">Education mode</span>
            </div>

            <div className="header-center">
                <div
                    className={`search-input-wrapper ${isPlaySurface ? 'is-game-search' : ''}`}
                    ref={searchRef}
                    data-header-search
                    data-ux-surface="controls"
                >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="var(--text-secondary)" className="search-icon">
                        <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                    </svg>
                    <input
                        type="text"
                        placeholder="Search simulators"
                        className="search-input"
                        value={searchQuery}
                        onChange={(event) => {
                            setSearchQuery(event.target.value)
                            setSearchOpen(true)
                        }}
                        onFocus={() => setSearchOpen(true)}
                        onKeyDown={handleSearchKeyDown}
                        aria-label="Search simulators"
                        aria-expanded={searchOpen && searchQuery.trim().length > 0}
                    />
                    {searchOpen && searchQuery.trim().length > 0 && (
                        <div className="header-search-results" data-header-search-results role="listbox">
                            {searchResults.length ? searchResults.map((game, index) => (
                                <Link
                                    key={`${game.id}-${game.path}`}
                                    to={game.path}
                                    className={index === activeSearchIndex ? 'active' : ''}
                                    role="option"
                                    aria-selected={index === activeSearchIndex}
                                    onMouseEnter={() => setActiveSearchIndex(index)}
                                    onClick={() => {
                                        setSearchQuery('')
                                        setSearchOpen(false)
                                    }}
                                >
                                    <span>{game.name}</span>
                                    <small>{game.category || 'Simulator'}</small>
                                </Link>
                            )) : (
                                <div className="header-search-empty">No simulators found</div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="header-right" ref={dropdownRef}>
            <div className="header-toggles">
                <Link
                    to="/settings"
                    className={`header-toggle ${location.pathname.startsWith('/settings') ? 'is-active' : ''}`}
                    aria-label="Settings"
                    title="Settings — audio, Fun Mode, appearance &amp; more"
                >
                    <SettingsIcon size={16} />
                </Link>
            </div>
                <div className="header-credits">
                    <button
                        className={`credit-pill ${showCredits ? 'is-open' : ''}`}
                        onClick={() => setShowCredits(prev => !prev)}
                        aria-expanded={showCredits}
                        aria-label="Practice credits balance and top-up"
                        title="Practice credits — fake balance, tab-isolated. Click to top up or review activity."
                    >
                        <CreditIcon size={18} />
                        <span className="credit-balance-amount">{formattedBalance}</span>
                        <svg className="credit-pill-caret" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
                            <path d="M7 10l5 5 5-5z" />
                        </svg>
                    </button>

                    {showCredits && (
                        <div className="credit-dropdown">
                            <div className="credit-dropdown-header">
                                <h4>Practice Credits</h4>
                                <button className="credit-close-btn" onClick={() => setShowCredits(false)}>x</button>
                            </div>

                            <div className="credit-balance-section">
                                <div className="credit-balance-label">Simulation balance</div>
                                <div className="credit-balance-big">
                                    <CreditIcon size={28} fontSize={13} />
                                    {formattedBalance}
                                </div>
                                <p>Fake credits only. No cash value, accounts, payouts, or transfers. Practice sessions are tab-isolated.</p>
                            </div>

                            <div className="credit-actions">
                                <div className="credit-grant-row">
                                    <input
                                        type="number"
                                        value={grantAmount}
                                        onChange={(event) => setGrantAmount(event.target.value)}
                                        placeholder="Add practice credits"
                                        className="credit-grant-input"
                                        min="0"
                                        step="1"
                                    />
                                    <button className="credit-grant-btn" onClick={addPracticeCredits}>
                                        Add
                                    </button>
                                </div>
                                <div className="credit-quick-amounts">
                                    {[100, 500, 1000, 5000].map(amount => (
                                        <button key={amount} className="credit-quick-btn" onClick={() => grantPracticeCredits(amount)}>
                                            +GC {amount}
                                        </button>
                                    ))}
                                </div>
                                <button className="credit-reset-btn" onClick={resetBalance}>
                                    Reset to GC 1,000.00
                                </button>
                            </div>

                            <div className="credit-transactions">
                                <h5>Recent Simulation Activity</h5>
                                {transactions.length === 0 ? (
                                    <div className="credit-no-tx">No simulations yet</div>
                                ) : (
                                    <div className="credit-tx-list">
                                        {transactions.slice(0, 8).map(tx => (
                                            <div key={tx.id} className={`credit-tx-item ${tx.type}`}>
                                                <div className="credit-tx-info">
                                                    <span className="credit-tx-type">{renderTransactionLabel(tx.type)}</span>
                                                    <span className="credit-tx-time">{tx.timestamp.toLocaleTimeString()}</span>
                                                </div>
                                                <span className={`credit-tx-amount ${tx.amount >= 0 ? 'positive' : 'negative'}`}>
                                                    {tx.amount >= 0 ? '+' : ''}GC {Math.abs(tx.amount).toFixed(2)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <Link to="/settings" className="credit-settings-link" onClick={() => setShowCredits(false)}>
                                <SettingsIcon size={14} /> Settings &amp; preferences
                            </Link>
                        </div>
                    )}
                </div>

                {toasts.length > 0 && (
                    <div className="credit-toast-container">
                        {toasts.map(toast => (
                            <div key={toast.id} className={`credit-toast credit-toast-${toast.type}`}>
                                <div className="credit-toast-icon">
                                    <CreditIcon size={20} />
                                </div>
                                <div className="credit-toast-content">
                                    <span className="credit-toast-title">{toast.title}</span>
                                    <span className="credit-toast-desc">{toast.description}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </header>
    )
}

export default Header
