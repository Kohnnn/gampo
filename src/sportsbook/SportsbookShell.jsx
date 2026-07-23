import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, Radio, RefreshCcw } from 'lucide-react'
import { useGameBgm } from '../audio/useBgm'
import { useCredits } from '../context/CreditContext'
import { formatCredits } from '../utils/simulationMath'
import { buildSyntheticSportsbookData, driftSyntheticEvents, modelBoardWindow } from './sportsbookData'
import { loadSportsbookFeed } from './sportsbookFeed'
import { BET_MODES } from './sportsbookMath'
import {
    DEFAULT_BETSLIP_SETTINGS,
    acceptSelectionOdds,
    cashOutTicket,
    createPracticeTicket,
    deriveBetSlipStatus,
    removeSelection,
    settleActiveTicketsWithEvents,
    syncSelectionsWithEvents,
    toggleSelection,
    validateTicket,
} from './sportsbookState'
import { parseSportsbookRoute, sportsbookPathForView } from './sportsbookRoutes'
import BetSlip from './components/BetSlip'
import EventDetail from './components/EventDetail'
import EventList from './components/EventList'
import MobileSportsNav from './components/MobileSportsNav'
import MyBetsPanel from './components/MyBetsPanel'
import SearchOverlay from './components/SearchOverlay'
import SportsHome from './components/SportsHome'
import SportsRail from './components/SportsRail'
import { OddsFormatProvider } from './components/OddsFormatContext'
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

function legSettlementKey(ticket) {
    return (ticket?.legs || []).map(leg => `${leg.selectionId}:${leg.status}:${leg.reason || ''}`).join('|')
}

function ticketSettlementChanged(before, after) {
    if (before === after) return false
    if (!before || !after) return before !== after
    return before.status !== after.status
        || before.settledAt !== after.settledAt
        || before.result !== after.result
        || before.payout !== after.payout
        || before.profit !== after.profit
        || before.payoutProcessed !== after.payoutProcessed
        || before.settlementKey !== after.settlementKey
        || (before.pending || []).join('|') !== (after.pending || []).join('|')
        || legSettlementKey(before) !== legSettlementKey(after)
}

function settlementToastKey(ticket) {
    return ticket?.settlementKey || ticket?.id || null
}

function SportsbookShell() {
    useGameBgm('sports', 'idle')
    const navigate = useNavigate()
    const location = useLocation()
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const routeViewState = useMemo(() => parseSportsbookRoute(location.pathname), [location.pathname])
    const [sports, setSports] = useState(() => initialFeed().sports)
    const [leagues, setLeagues] = useState(() => initialFeed().leagues)
    const [events, setEvents] = useState(() => initialFeed().events)
    const [viewState, setViewState] = useState(routeViewState)
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
    const [marquee, setMarquee] = useState(null)
    const [feedMode, setFeedMode] = useState('fallback')
    const driftTick = useRef(0)
    const boardWindowRef = useRef(modelBoardWindow())
    const creditedTicketIds = useRef(new Set())
    const settledToastIds = useRef(new Set())

    useEffect(() => {
        let mounted = true
        loadSportsbookFeed().then(feed => {
            if (!mounted) return
            setSports(feed.sports)
            setLeagues(feed.leagues)
            setEvents(feed.events)
            setFeedErrors(feed.errors || [])
            setQuotas(feed.quotas || {})
            setMarquee(feed.marquee || null)
            setFeedLoaded(feed.feedSource === 'live' || feed.feedSource === 'blended' || feed.feedEvents?.length > 0)
            setFeedMode(feed.feedSource || 'fallback')
        })
        return () => { mounted = false }
    }, [])

    useEffect(() => {
        const timer = window.setInterval(() => {
            driftTick.current += 1
            const nextWindow = modelBoardWindow()
            setEvents(current => {
                const localOnly = current.every(event => event.source === 'synthetic')
                if (localOnly && nextWindow !== boardWindowRef.current) {
                    boardWindowRef.current = nextWindow
                    return buildSyntheticSportsbookData(nextWindow).events
                }
                return driftSyntheticEvents(current, driftTick.current)
            })
        }, 26000)
        return () => window.clearInterval(timer)
    }, [])

    useEffect(() => {
        setSelections(current => syncSelectionsWithEvents(current, events))
    }, [events])

    useEffect(() => {
        setViewState(routeViewState)
    }, [routeViewState])

    useEffect(() => {
        const result = settleActiveTicketsWithEvents({
            tickets,
            events,
            creditedTicketIds: creditedTicketIds.current,
            now: Date.now(),
        })
        const changed = result.tickets.some((ticket, index) => ticketSettlementChanged(tickets[index], ticket))
        if (!changed) return

        const payoutsByTicketId = new Map(result.payouts.map(payout => [payout.ticketId, payout]))
        result.tickets.forEach((ticket, index) => {
            if (ticket?.status !== 'settled' || !ticketSettlementChanged(tickets[index], ticket)) return
            const toastKey = settlementToastKey(ticket)
            if (toastKey && settledToastIds.current.has(toastKey)) return
            const payout = payoutsByTicketId.get(ticket.id)
            if (payout) {
                creditedTicketIds.current.add(payout.ticketId)
                if (payout.settlementKey) creditedTicketIds.current.add(payout.settlementKey)
                addWinnings(payout.amount, 'Sportsbook practice return')
            }
            if (toastKey) settledToastIds.current.add(toastKey)
            showToast(ticket.profit >= 0 ? 'win' : 'loss', 'Sportsbook settled', `${ticket.profit >= 0 ? '+' : ''}${formatCredits(ticket.profit)}`)
        })
        setTickets(result.tickets)
    }, [events, tickets, addWinnings, showToast])

    const selectedIds = useMemo(() => new Set(selections.map(selection => selection.selectionId)), [selections])
    const leagueMap = useMemo(() => new Map(leagues.map(league => [league.id, league])), [leagues])
    const sportMap = useMemo(() => new Map(sports.map(sport => [sport.id, sport])), [sports])
    const activeEvent = events.find(event => event.id === viewState.eventId) || null
    const visibleEvents = useMemo(() => filterEvents(events, viewState), [events, viewState])
    const totalQuotaRemaining = Object.values(quotas).reduce((sum, quota) => sum + (Number(quota?.remaining) || 0), 0)
    const feedSource = feedLoaded ? feedMode : 'fallback'
    const betSlipStatus = deriveBetSlipStatus({ selections, stake, settings, placing, lastTicket: tickets[0] })

    const navigateSportsbook = (next) => {
        const nextState = {
            view: next.view || 'home',
            sportId: next.sportId || null,
            eventId: next.eventId || null,
            group: next.group || null,
        }
        setViewState(nextState)
        if (!nextState.eventId) navigate(sportsbookPathForView(nextState))
    }

    const openEvent = (eventId) => {
        const event = events.find(item => item.id === eventId)
        setSearchOpen(false)
        setViewState({ view: 'event', eventId, sportId: event?.sportId || null })
    }

    const handleToggleSelection = (selectionId) => {
        setSelections(current => toggleSelection(current, events, selectionId))
        if (window.matchMedia('(max-width: 768px)').matches) setMobileSlipOpen(true)
    }

    const refreshFeed = async () => {
        const feed = await loadSportsbookFeed()
        setSports(feed.sports)
        setLeagues(feed.leagues)
        setEvents(feed.events)
        setFeedErrors(feed.errors || [])
        setQuotas(feed.quotas || {})
        setMarquee(feed.marquee || null)
        setFeedLoaded(feed.feedSource === 'live' || feed.feedSource === 'blended' || feed.feedEvents?.length > 0)
        setFeedMode(feed.feedSource || 'fallback')
    }

    const placePracticeTicket = () => {
        const validation = validateTicket({ selections, stake, balance, settings, mode })
        if (!validation.valid) {
            showToast('error', 'Practice ticket unavailable', validation.reason)
            return
        }

        setPlacing(true)
        if (!placeBet(stake, 'Sportsbook practice ticket')) {
            setPlacing(false)
            showToast('error', 'Practice balance too low', `Need ${formatCredits(stake)}`)
            return
        }

        const ticket = createPracticeTicket({ selections, stake, mode, settings })
        setTickets(current => [ticket, ...current].slice(0, 20))
        setSelections([])
        setPlacing(false)
        showToast('bet', 'Practice ticket accepted', `${selections.length} selection${selections.length === 1 ? '' : 's'}`)
    }

    const handleCashOut = (ticketId) => {
        const target = tickets.find(item => item.id === ticketId)
        if (!target || (target.status !== 'active' && target.status !== 'accepted')) return
        const cashed = cashOutTicket(target, Date.now())
        if (cashed.status !== 'cashed_out' || cashed === target) {
            showToast('error', 'Cash out unavailable', 'No cash-out offer for this practice ticket right now.')
            return
        }
        if (creditedTicketIds.current.has(ticketId)) return
        creditedTicketIds.current.add(ticketId)
        if (cashed.settlementKey) creditedTicketIds.current.add(cashed.settlementKey)
        settledToastIds.current.add(settlementToastKey(cashed) || ticketId)
        addWinnings(cashed.payout, 'Sportsbook practice cash-out')
        setTickets(current => current.map(item => (item.id === ticketId ? cashed : item)))
        showToast('win', 'Practice ticket cashed out', `Returned ${formatCredits(cashed.payout)}`)
    }

    return (
        <OddsFormatProvider format={settings.oddsFormat || 'decimal'}>
        <div className="sb-page" data-sportsbook-view={viewState.view} data-sportsbook-feed-source={feedSource} data-ux-surface="shell">
            <SportsRail
                sports={sports}
                view={viewState.view}
                activeSportId={viewState.sportId}
                onNavigate={navigateSportsbook}
            />
            <section className="sb-main" aria-labelledby="sportsbook-heading" data-ux-surface="stage">
                <header className="sb-topbar" data-ux-surface="shell">
                    <div>
                        <span>Gampo Sportsbook</span>
                        <h1 id="sportsbook-heading">{titleForView(viewState, sports)}</h1>
                    </div>
                    <div className="sb-topbar-actions">
                        {feedLoaded ? <small><Radio size={12} /> real-event feed connected</small> : <small>synthetic practice fallback · generated model prices · fake credits</small>}
                        {feedErrors.length ? <small className="is-warning"><AlertTriangle size={12} /> {feedErrors[0]}</small> : null}
                        {totalQuotaRemaining ? <small>API quota {totalQuotaRemaining}</small> : null}
                        <button type="button" onClick={refreshFeed}><RefreshCcw size={15} /> Refresh</button>
                    </div>
                </header>

                {viewState.view === 'home' ? (
                    <SportsHome
                        events={events}
                        sports={sports}
                        leagues={leagues}
                        feedSource={feedSource}
                        marquee={marquee}
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
                    <MyBetsPanel tickets={tickets} events={events} onCashOut={handleCashOut} />
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
            </section>

            <div className="sb-desktop-slip" data-ux-surface="aside">
                <BetSlip
                    selections={selections}
                    tickets={tickets}
                    events={events}
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
                    onCashOut={handleCashOut}
                />
            </div>

            {mobileSlipOpen ? (
                <div className="sb-mobile-slip" data-ux-surface="dock">
                    <BetSlip
                        selections={selections}
                        tickets={tickets}
                        events={events}
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
                        onCashOut={handleCashOut}
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
                onOpenBetSlip={() => setMobileSlipOpen(true)}
            />
        </div>
        </OddsFormatProvider>
    )
}

export default SportsbookShell
