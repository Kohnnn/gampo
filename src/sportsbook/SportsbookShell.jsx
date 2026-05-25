import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Radio, RefreshCcw } from 'lucide-react'
import { useCredits } from '../context/CreditContext'
import { formatCredits } from '../utils/simulationMath'
import { buildSyntheticSportsbookData, driftSyntheticEvents } from './sportsbookData'
import { loadSportsbookFeed } from './sportsbookFeed'
import { BET_MODES } from './sportsbookMath'
import {
    DEFAULT_BETSLIP_SETTINGS,
    acceptSelectionOdds,
    createPracticeTicket,
    deriveBetSlipStatus,
    removeSelection,
    settlePracticeTicket,
    syncSelectionsWithEvents,
    toggleSelection,
} from './sportsbookState'
import BetSlip from './components/BetSlip'
import EventDetail from './components/EventDetail'
import EventList from './components/EventList'
import MobileSportsNav from './components/MobileSportsNav'
import MyBetsPanel from './components/MyBetsPanel'
import SearchOverlay from './components/SearchOverlay'
import SportsHome from './components/SportsHome'
import SportsRail from './components/SportsRail'
import '../styles/sportsbook.css'

function initialFeed() {
    return buildSyntheticSportsbookData()
}

function filterEvents(events, viewState) {
    if (viewState.view === 'live') return events.filter(event => event.status === 'live')
    if (viewState.view === 'starting') {
        const now = Date.now()
        return events.filter(event => event.status === 'prematch' && new Date(event.startsAt).getTime() - now < 6 * 60 * 60 * 1000)
    }
    if (viewState.view === 'sport' && viewState.sportId) return events.filter(event => event.sportId === viewState.sportId)
    if (viewState.view === 'all') return events
    return events
}

function titleForView(viewState, sports) {
    if (viewState.view === 'live') return 'Live Events'
    if (viewState.view === 'starting') return 'Starting Soon'
    if (viewState.view === 'all') return 'All Events'
    if (viewState.view === 'sport') return sports.find(sport => sport.id === viewState.sportId)?.label || 'Sport'
    return 'Sports Home'
}

function SportsbookShell() {
    const navigate = useNavigate()
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const [sports, setSports] = useState(() => initialFeed().sports)
    const [leagues, setLeagues] = useState(() => initialFeed().leagues)
    const [events, setEvents] = useState(() => initialFeed().events)
    const [viewState, setViewState] = useState({ view: 'home', sportId: null, eventId: null })
    const [selections, setSelections] = useState([])
    const [tickets, setTickets] = useState([])
    const [stake, setStake] = useState(10)
    const [mode, setMode] = useState(BET_MODES.SINGLES)
    const [settings, setSettings] = useState(DEFAULT_BETSLIP_SETTINGS)
    const [searchOpen, setSearchOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [searchCategory, setSearchCategory] = useState('all')
    const [mobileSlipOpen, setMobileSlipOpen] = useState(false)
    const [placing, setPlacing] = useState(false)
    const [feedErrors, setFeedErrors] = useState([])
    const [feedLoaded, setFeedLoaded] = useState(false)
    const [quotas, setQuotas] = useState({})
    const driftTick = useRef(0)
    const settleTimer = useRef(null)

    useEffect(() => {
        let mounted = true
        loadSportsbookFeed().then(feed => {
            if (!mounted) return
            setSports(feed.sports)
            setLeagues(feed.leagues)
            setEvents(feed.events)
            setFeedErrors(feed.errors || [])
            setQuotas(feed.quotas || {})
            setFeedLoaded(feed.feedEvents?.length > 0)
        })
        return () => { mounted = false }
    }, [])

    useEffect(() => {
        const timer = window.setInterval(() => {
            driftTick.current += 1
            setEvents(current => driftSyntheticEvents(current, driftTick.current))
        }, 26000)
        return () => window.clearInterval(timer)
    }, [])

    useEffect(() => {
        setSelections(current => syncSelectionsWithEvents(current, events))
    }, [events])

    useEffect(() => () => {
        if (settleTimer.current) window.clearTimeout(settleTimer.current)
    }, [])

    // Wave 22: respond to `gampo:sports-navigate` events from the app
    // sidebar (Casino/Sports adaptive). Detail mirrors the navigateSportsbook
    // payload: { view, sportId?, group?, eventId? }.
    useEffect(() => {
        const onNav = (e) => {
            const detail = e.detail || {}
            setViewState({
                view: detail.view || 'home',
                sportId: detail.sportId || null,
                eventId: detail.eventId || null,
                group: detail.group || null,
            })
        }
        document.addEventListener('gampo:sports-navigate', onNav)
        return () => document.removeEventListener('gampo:sports-navigate', onNav)
    }, [])

    const selectedIds = useMemo(() => new Set(selections.map(selection => selection.selectionId)), [selections])
    const leagueMap = useMemo(() => new Map(leagues.map(league => [league.id, league])), [leagues])
    const sportMap = useMemo(() => new Map(sports.map(sport => [sport.id, sport])), [sports])
    const activeEvent = events.find(event => event.id === viewState.eventId) || null
    const visibleEvents = useMemo(() => filterEvents(events, viewState), [events, viewState])
    const totalQuotaRemaining = Object.values(quotas).reduce((sum, quota) => sum + (Number(quota?.remaining) || 0), 0)
    const betSlipStatus = deriveBetSlipStatus({ selections, stake, settings, placing, lastTicket: tickets[0] })

    const navigateSportsbook = (next) => {
        setViewState({
            view: next.view || 'home',
            sportId: next.sportId || null,
            eventId: next.eventId || null,
            group: next.group || null,
        })
    }

    const openEvent = (eventId) => {
        const event = events.find(item => item.id === eventId)
        setSearchOpen(false)
        setViewState({ view: 'event', eventId, sportId: event?.sportId || null })
    }

    const handleToggleSelection = (selectionId) => {
        setSelections(current => toggleSelection(current, events, selectionId))
        if (window.matchMedia('(max-width: 760px)').matches) setMobileSlipOpen(true)
    }

    const refreshFeed = async () => {
        const feed = await loadSportsbookFeed()
        setSports(feed.sports)
        setLeagues(feed.leagues)
        setEvents(feed.events)
        setFeedErrors(feed.errors || [])
        setQuotas(feed.quotas || {})
        setFeedLoaded(feed.feedEvents?.length > 0)
    }

    const placePracticeTicket = () => {
        const seed = `${Date.now()}-${selections.map(selection => selection.selectionId).join('|')}`
        const ticket = createPracticeTicket({ selections, stake, mode, settings, seed })
        if (!placeBet(stake, `Sportsbook ${mode}`)) {
            showToast('error', 'Practice balance too low', `Need ${formatCredits(stake)}`)
            return
        }
        setPlacing(true)
        setTickets(current => [{ ...ticket, status: 'accepted' }, ...current].slice(0, 20))
        showToast('bet', 'Practice ticket accepted', `${selections.length} selection${selections.length === 1 ? '' : 's'}`)
        settleTimer.current = window.setTimeout(() => {
            const settled = settlePracticeTicket(ticket, seed)
            if (settled.payout > 0) addWinnings(settled.payout, 'Sportsbook practice return')
            setTickets(current => current.map(item => item.id === ticket.id ? settled : item))
            setSelections([])
            setPlacing(false)
            showToast(settled.profit >= 0 ? 'win' : 'loss', 'Sportsbook settled', `${settled.profit >= 0 ? '+' : ''}${formatCredits(settled.profit)}`)
        }, 650)
    }

    return (
        <div className="sb-page">
            <SportsRail
                sports={sports}
                view={viewState.view}
                activeSportId={viewState.sportId}
                onNavigate={navigateSportsbook}
            />

            <main className="sb-main">
                <header className="sb-topbar">
                    <div>
                        <span>Gampo Sportsbook</span>
                        <strong>{titleForView(viewState, sports)}</strong>
                    </div>
                    <div className="sb-topbar-actions">
                        {feedLoaded ? <small><Radio size={12} /> optional feed connected</small> : null}
                        {feedErrors.length ? <small className="is-warning"><AlertTriangle size={12} /> {feedErrors[0]}</small> : null}
                        {totalQuotaRemaining ? <small>Quota {totalQuotaRemaining}</small> : null}
                        <button type="button" onClick={refreshFeed}><RefreshCcw size={15} /> Refresh</button>
                    </div>
                </header>

                {viewState.view === 'home' ? (
                    <SportsHome
                        events={events}
                        sports={sports}
                        leagues={leagues}
                        selectedIds={selectedIds}
                        onToggleSelection={handleToggleSelection}
                        onOpenEvent={openEvent}
                        onOpenSearch={() => setSearchOpen(true)}
                        onNavigate={navigateSportsbook}
                    />
                ) : viewState.view === 'event' ? (
                    <EventDetail
                        event={activeEvent}
                        sport={activeEvent ? sportMap.get(activeEvent.sportId) : null}
                        league={activeEvent ? leagueMap.get(activeEvent.leagueId) : null}
                        selectedIds={selectedIds}
                        onToggleSelection={handleToggleSelection}
                        onBack={() => navigateSportsbook({ view: activeEvent?.sportId ? 'sport' : 'home', sportId: activeEvent?.sportId })}
                    />
                ) : viewState.view === 'my-bets' ? (
                    <MyBetsPanel tickets={tickets} />
                ) : (
                    <EventList
                        title={titleForView(viewState, sports)}
                        events={visibleEvents}
                        leagues={leagues}
                        selectedIds={selectedIds}
                        onToggleSelection={handleToggleSelection}
                        onOpenEvent={openEvent}
                    />
                )}
            </main>

            <div className="sb-desktop-slip">
                <BetSlip
                    selections={selections}
                    tickets={tickets}
                    stake={stake}
                    mode={mode}
                    settings={settings}
                    balance={balance}
                    placing={placing}
                    status={betSlipStatus}
                    onStakeChange={setStake}
                    onModeChange={setMode}
                    onSettingsChange={setSettings}
                    onRemove={selectionId => setSelections(current => removeSelection(current, selectionId))}
                    onClear={() => setSelections([])}
                    onAcceptOdds={selectionId => setSelections(current => acceptSelectionOdds(current, selectionId))}
                    onPlace={placePracticeTicket}
                />
            </div>

            {mobileSlipOpen ? (
                <div className="sb-mobile-slip">
                    <BetSlip
                        selections={selections}
                        tickets={tickets}
                        stake={stake}
                        mode={mode}
                        settings={settings}
                        balance={balance}
                        placing={placing}
                        status={betSlipStatus}
                        onStakeChange={setStake}
                        onModeChange={setMode}
                        onSettingsChange={setSettings}
                        onRemove={selectionId => setSelections(current => removeSelection(current, selectionId))}
                        onClear={() => setSelections([])}
                        onAcceptOdds={selectionId => setSelections(current => acceptSelectionOdds(current, selectionId))}
                        onPlace={placePracticeTicket}
                        onClose={() => setMobileSlipOpen(false)}
                    />
                </div>
            ) : null}

            <SearchOverlay
                open={searchOpen}
                query={searchQuery}
                category={searchCategory}
                events={events}
                sports={sports}
                leagues={leagues}
                onQueryChange={setSearchQuery}
                onCategoryChange={setSearchCategory}
                onClose={() => setSearchOpen(false)}
                onOpenEvent={openEvent}
            />

            <MobileSportsNav
                selectionCount={selections.length}
                onBrowse={() => navigateSportsbook({ view: 'home' })}
                onSearch={() => setSearchOpen(true)}
                onOpenBetSlip={() => setMobileSlipOpen(true)}
                onCasino={() => navigate('/')}
            />
        </div>
    )
}

export default SportsbookShell
