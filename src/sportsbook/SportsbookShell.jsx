import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { RefreshCcw } from 'lucide-react'
import { useGameBgm } from '../audio/useBgm'
import { useCredits } from '../context/CreditContext'
import { formatCredits } from '../utils/simulationMath'
import { buildSyntheticSportsbookData, driftSyntheticEvents, modelBoardWindow } from './sportsbookData'
import { loadSportsbookFeed } from './sportsbookFeed'
import { BET_MODES, valueSimulatedCashout } from './sportsbookMath'
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
import { deriveSportsbookShellState, presentFeedCondition, presentRestoreResult } from './sportsbookPresentation'
import {
    SPORTSBOOK_TICKETS_V1_KEY,
    SPORTSBOOK_TICKETS_V2_KEY,
    commitSportsbookAccounting,
    persistMigratedSportsbookTickets,
    restoreSportsbookTickets,
} from './sportsbookPersistence'
import BetSlip from './components/BetSlip'
import EventDetail from './components/EventDetail'
import EventList from './components/EventList'
import MobileSportsNav from './components/MobileSportsNav'
import MyBetsPanel from './components/MyBetsPanel'
import SearchOverlay from './components/SearchOverlay'
import SportsHome from './components/SportsHome'
import { OddsFormatProvider } from './components/OddsFormatContext'
import '../styles/sportsbook.css'

function initialFeed() {
    return buildSyntheticSportsbookData()
}

function loadStoredTickets() {
    try {
        const restored = restoreSportsbookTickets(localStorage.getItem(SPORTSBOOK_TICKETS_V2_KEY), localStorage.getItem(SPORTSBOOK_TICKETS_V1_KEY))
        if (!restored.ok || restored.migration !== 'required') return { ...restored, migrationPersisted: null }
        const persisted = persistMigratedSportsbookTickets({ tickets: restored.tickets, savedAt: Date.now() })
        return { ...restored, tickets: persisted.ok ? restored.tickets : [], migrationPersisted: persisted.ok }
    } catch {
        return { ok: false, tickets: [], quarantine: [], sourceVersion: null, migration: 'unavailable', code: 'restore-failed', migrationPersisted: null }
    }
}

function seedCreditedIds(tickets) {
    const set = new Set()
    for (const ticket of tickets) {
        if (ticket?.status !== 'settled' && ticket?.status !== 'cashed_out') continue
        set.add(ticket.id)
        if (ticket.settlementKey) set.add(ticket.settlementKey)
    }
    return set
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

export function coordinateSportsbookPublication(commit, publishers) {
    const committed = commit()
    if (!committed?.ok) return committed
    publishers.forEach(publish => publish())
    return committed
}

function SportsbookShell() {
    useGameBgm('sports', 'idle')
    const navigate = useNavigate()
    const location = useLocation()
    const { balance, transactions, runCreditTransactionsTransactional, placeBetTransactional, addWinningsTransactional, showToast } = useCredits()
    const routeViewState = useMemo(() => parseSportsbookRoute(location.pathname), [location.pathname])
    const [sports, setSports] = useState(() => initialFeed().sports)
    const [leagues, setLeagues] = useState(() => initialFeed().leagues)
    const [events, setEvents] = useState(() => initialFeed().events)
    const [viewState, setViewState] = useState(routeViewState)
    const [selections, setSelections] = useState([])
    const [restoreResult] = useState(loadStoredTickets)
    const [tickets, setTickets] = useState(() => restoreResult.tickets)
    const [stake, setStake] = useState(10)
    const [mode, setMode] = useState(BET_MODES.SINGLES)
    const [settings, setSettings] = useState(DEFAULT_BETSLIP_SETTINGS)
    const [searchOpen, setSearchOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [searchCategory, setSearchCategory] = useState('all')
    const [mobileSlipOpen, setMobileSlipOpen] = useState(false)
    const [placing, setPlacing] = useState(false)
    const [feedErrors, setFeedErrors] = useState([])
    const [feedPending, setFeedPending] = useState(true)
    const [feedFailed, setFeedFailed] = useState(false)
    const [feedState, setFeedState] = useState({ status: 'empty' })
    const [generatedAt, setGeneratedAt] = useState(null)
    const [providerSources, setProviderSources] = useState({})
    const [feedEvents, setFeedEvents] = useState([])
    const [lastSuccessfulSnapshot, setLastSuccessfulSnapshot] = useState(null)
    const [ticketAnnouncement, setTicketAnnouncement] = useState('')
    const [ticketAnnouncementKey, setTicketAnnouncementKey] = useState(0)
    const mobileSlipRef = useRef(null)
    const mobileSlipOpenerRef = useRef(null)
    const driftTick = useRef(0)
    const boardWindowRef = useRef(modelBoardWindow())
    const creditedTicketIds = useRef(seedCreditedIds(tickets))
    const settledToastIds = useRef(new Set(tickets.map(settlementToastKey).filter(Boolean)))

    useEffect(() => {
        let mounted = true
        loadSportsbookFeed().then(feed => {
            if (!mounted) return
            setSports(feed.sports)
            setLeagues(feed.leagues)
            setEvents(feed.events)
            setFeedEvents(feed.feedEvents || [])
            setFeedErrors(feed.errors || [])
            setFeedState(feed.feedState || { status: 'empty' })
            setGeneratedAt(feed.generatedAt || null)
            setProviderSources(feed.providerSources || {})
            setFeedPending(false)
            const failed = feed.feedState?.status === 'error'
            setFeedFailed(failed)
            if (!failed && feed.feedEvents?.length) setLastSuccessfulSnapshot(feed)
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
        const terminalChanged = result.tickets.some((ticket, index) => ticket?.status === 'settled' && ticketSettlementChanged(tickets[index], ticket))

        const entries = result.payouts.map(payout => ({
            type: 'win',
            label: 'Sportsbook practice return',
            amount: payout.amount,
            transactionId: `${payout.settlementKey}:credit`,
        }))
        const commit = ({ nextBalance, nextTransactions }) => commitSportsbookAccounting({
            tickets: result.tickets,
            nextBalance,
            nextTransactions,
            savedAt: Date.now(),
        })
        const committed = coordinateSportsbookPublication(
            () => entries.length
                ? runCreditTransactionsTransactional(entries, commit)
                : commit({ nextBalance: balance, nextTransactions: transactions }),
            [
                () => setTickets(result.tickets),
                () => { if (terminalChanged) setTicketAnnouncement('Practice ticket lifecycle updated.') },
                () => result.tickets.forEach((ticket, index) => {
                    if (ticket?.status !== 'settled' || !ticketSettlementChanged(tickets[index], ticket)) return
                    const toastKey = settlementToastKey(ticket)
                    if (toastKey && settledToastIds.current.has(toastKey)) return
                    creditedTicketIds.current.add(ticket.id)
                    if (ticket.settlementKey) creditedTicketIds.current.add(ticket.settlementKey)
                    if (toastKey) settledToastIds.current.add(toastKey)
                    showToast(ticket.profit >= 0 ? 'win' : 'loss', 'Sportsbook settled', `${ticket.profit >= 0 ? '+' : ''}${formatCredits(ticket.profit)}`)
                }),
            ],
        )
        if (!committed.ok) showToast('error', 'Sportsbook settlement unavailable', committed.code)
    }, [events, tickets, balance, transactions, runCreditTransactionsTransactional, showToast])

    const selectedIds = useMemo(() => new Set(selections.map(selection => selection.selectionId)), [selections])
    const leagueMap = useMemo(() => new Map(leagues.map(league => [league.id, league])), [leagues])
    const sportMap = useMemo(() => new Map(sports.map(sport => [sport.id, sport])), [sports])
    const shellState = deriveSportsbookShellState({ requestPending: feedPending, requestFailed: feedFailed, lastSuccessfulSnapshot, feedState, generatedAt, providerSources, errors: feedErrors, feedEvents, events })
    const renderedEvents = shellState.events
    const activeEvent = renderedEvents.find(event => event.id === viewState.eventId) || null
    const visibleEvents = filterEvents(renderedEvents, viewState)
    const sourceNames = [...new Set(shellState.events.flatMap(event => [event.source, ...(event.offers || []).flatMap(offer => [offer.bookmaker, offer.provider])]).filter(Boolean))]
    const feedPresentation = presentFeedCondition({ ...shellState, sources: sourceNames, errors: feedErrors })
    const restorePresentation = presentRestoreResult(restoreResult)
    const feedSource = shellState.state === 'model-only' ? 'fallback' : 'blended'
    const betSlipStatus = deriveBetSlipStatus({ selections, stake, settings, placing, lastTicket: tickets[0] })
    const selectionValidation = useMemo(() => validateTicket({ selections, stake, balance, settings, mode }), [selections, stake, balance, settings, mode])
    useEffect(() => {
        if (selections.length && !selectionValidation.valid) setTicketAnnouncement(current => current === selectionValidation.reason ? current : selectionValidation.reason)
    }, [selections.length, selectionValidation.valid, selectionValidation.reason])
    const cashoutValuationsByTicketId = useMemo(() => new Map(tickets.map(ticket => [ticket.id, valueSimulatedCashout({ ticket, events })])), [tickets, events])

    useEffect(() => {
        const dialog = mobileSlipRef.current
        if (!dialog) return
        if (mobileSlipOpen && !dialog.open) {
            dialog.showModal()
            dialog.querySelector('[aria-label="Close bet slip"]')?.focus()
        }
        if (!mobileSlipOpen && dialog.open) dialog.close()
    }, [mobileSlipOpen])

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
        setSelections(current => {
            const next = toggleSelection(current, events, selectionId)
            if (!current.some(selection => selection.selectionId === selectionId) && next === current) setTicketAnnouncement('This bookmaker offer cannot be added to the practice ticket.')
            return next
        })
        if (window.matchMedia('(max-width: 768px)').matches) setMobileSlipOpen(true)
    }

    const refreshFeed = async () => {
        if (feedPending) return
        setFeedPending(true)
        const feed = await loadSportsbookFeed()
        const failed = feed.feedState?.status === 'error'
        setFeedErrors(feed.errors || [])
        setFeedState(feed.feedState || { status: 'empty' })
        setGeneratedAt(feed.generatedAt || null)
        setProviderSources(feed.providerSources || {})
        setFeedFailed(failed)
        setFeedPending(false)
        if (failed && lastSuccessfulSnapshot) return
        setSports(feed.sports)
        setLeagues(feed.leagues)
        setEvents(feed.events)
        setFeedEvents(feed.feedEvents || [])
        if (!failed && feed.feedEvents?.length) setLastSuccessfulSnapshot(feed)
    }

    const placePracticeTicket = () => {
        const validation = validateTicket({ selections, stake, balance, settings, mode })
        if (!validation.valid) {
            setTicketAnnouncement(validation.reason)
            showToast('error', 'Practice ticket unavailable', validation.reason)
            return
        }

        setPlacing(true)
        let ticket
        try {
            ticket = createPracticeTicket({ selections, stake, mode, settings })
        } catch (error) {
            setPlacing(false)
            showToast('error', 'Practice ticket unavailable', error.code || 'validation-failed')
            return
        }
        if (tickets.some(current => current.id === ticket.id)) {
            setPlacing(false)
            showToast('error', 'Practice ticket unavailable', 'duplicate-ticket-id')
            return
        }
        const nextTickets = [ticket, ...tickets].slice(0, 20)
        const committed = coordinateSportsbookPublication(
            () => placeBetTransactional(stake, 'Sportsbook practice ticket', `${ticket.id}:debit`, ({ nextBalance, nextTransactions }) => commitSportsbookAccounting({
                tickets: nextTickets,
                nextBalance,
                nextTransactions,
                savedAt: Date.now(),
            })),
            [
                () => setTickets(nextTickets),
                () => setSelections([]),
                () => setPlacing(false),
                () => {
                    setTicketAnnouncement(`Practice ticket accepted. ${formatCredits(stake)} fake-credit stake committed.`)
                    setTicketAnnouncementKey(current => current + 1)
                },
                () => showToast('bet', 'Practice ticket accepted', `${selections.length} selection${selections.length === 1 ? '' : 's'}`),
            ],
        )
        if (!committed.ok) {
            setPlacing(false)
            setTicketAnnouncement('Practice ticket could not be saved. Your fake-credit balance was not changed.')
            showToast('error', 'Practice ticket unavailable', committed.code)
        }
    }

    const handleCashOut = (ticketId, displayedValuationFingerprint) => {
        const target = tickets.find(item => item.id === ticketId)
        if (!target || (target.status !== 'active' && target.status !== 'accepted')) return
        const valuation = valueSimulatedCashout({ ticket: target, events })
        if (!valuation.available || valuation.valuationFingerprint !== displayedValuationFingerprint) {
            showToast('error', 'Cash out unavailable', 'valuation-mismatch')
            return
        }
        if (creditedTicketIds.current.has(ticketId) || creditedTicketIds.current.has(`${target.id}:cashout:${valuation.valuationFingerprint}`)) return
        const cashed = cashOutTicket(target, valuation, Date.now())
        if (cashed === target) {
            showToast('error', 'Cash out unavailable', 'valuation-mismatch')
            return
        }
        const nextTickets = tickets.map(item => item.id === ticketId ? cashed : item)
        const committed = coordinateSportsbookPublication(
            () => addWinningsTransactional(cashed.payout, 'Sportsbook simulated cash-out', cashed.cashOut.transactionId, ({ nextBalance, nextTransactions }) => commitSportsbookAccounting({
                tickets: nextTickets,
                nextBalance,
                nextTransactions,
                savedAt: cashed.settledAt,
            })),
            [
                () => setTickets(nextTickets),
                () => {
                    creditedTicketIds.current.add(ticketId)
                    creditedTicketIds.current.add(cashed.settlementKey)
                    settledToastIds.current.add(settlementToastKey(cashed) || ticketId)
                    setTicketAnnouncement(`Simulated cash-out accepted. Returned ${formatCredits(cashed.payout)} fake credits.`)
                    showToast('win', 'Practice ticket cashed out', `Returned ${formatCredits(cashed.payout)}`)
                },
            ],
        )
        if (!committed.ok) showToast('error', 'Cash out unavailable', committed.code)
    }

    return (
        <OddsFormatProvider format={settings.oddsFormat || 'decimal'}>
        <div className="sb-page" data-sportsbook-view={viewState.view} data-sportsbook-feed-source={feedSource} data-ux-surface="shell">
            <section className="sb-main" aria-labelledby="sportsbook-heading" data-ux-surface="stage">
                <header className="sb-topbar" data-ux-surface="shell">
                    <div>
                        <span>Gampo Sportsbook · fake-credit simulator</span>
                        <h1 id="sportsbook-heading">{titleForView(viewState, sports)}</h1>
                    </div>
                    <button type="button" onClick={refreshFeed} disabled={!feedPresentation.retryable || feedPending} aria-describedby={feedPending ? 'sportsbook-feed-status-copy' : undefined}><RefreshCcw size={15} /> Refresh</button>
                </header>

                <section className={`sb-feed-status is-${feedPresentation.state}`} role="status" aria-live="polite" aria-atomic="true">
                    <div><strong>{feedPresentation.heading}</strong><span id="sportsbook-feed-status-copy">{feedPresentation.body}</span></div>
                    <dl>
                        <div><dt>Last refresh</dt><dd>{feedPresentation.refreshed}</dd></div>
                        <div><dt>Sources</dt><dd>{feedPresentation.sources.join(', ') || 'No attributable source'}</dd></div>
                    </dl>
                </section>
                {restorePresentation.message && !restorePresentation.blocking ? <p className="sb-restore-notice" role="status" aria-live="polite" aria-atomic="true">{restorePresentation.message}</p> : null}
                <div key={ticketAnnouncementKey} className="sb-ticket-announcement" role="status" aria-live="polite" aria-atomic="true">{ticketAnnouncement}</div>
                {(feedPresentation.state === 'error' || restorePresentation.blocking) ? <p className="sb-blocking-alert" role="alert" aria-live="assertive">{restorePresentation.blocking ? restorePresentation.message : feedPresentation.error || feedPresentation.body}</p> : null}

                {viewState.view === 'home' ? (
                    <SportsHome
                        events={renderedEvents}
                        sports={sports}
                        leagues={leagues}
                        feedSource={feedSource}
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
                    <MyBetsPanel tickets={tickets} events={events} cashoutValuationsByTicketId={cashoutValuationsByTicketId} onCashOut={handleCashOut} />
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
                    cashoutValuationsByTicketId={cashoutValuationsByTicketId}
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

            <dialog
                ref={mobileSlipRef}
                className="sb-mobile-slip"
                aria-labelledby="mobile-bet-slip-heading"
                onCancel={() => setMobileSlipOpen(false)}
                onClose={() => {
                    setMobileSlipOpen(false)
                    mobileSlipOpenerRef.current?.focus()
                }}
            >
                    <BetSlip
                        selections={selections}
                        tickets={tickets}
                        events={events}
                        cashoutValuationsByTicketId={cashoutValuationsByTicketId}
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
                        onClose={() => mobileSlipRef.current?.close()}
                        headingId="mobile-bet-slip-heading"
                    />
            </dialog>

            <SearchOverlay
                open={searchOpen}
                query={searchQuery}
                category={searchCategory}
                events={renderedEvents}
                sports={sports}
                leagues={leagues}
                onQueryChange={setSearchQuery}
                onCategoryChange={setSearchCategory}
                onClose={() => setSearchOpen(false)}
                onOpenEvent={openEvent}
            />

            <MobileSportsNav
                ref={mobileSlipOpenerRef}
                selectionCount={selections.length}
                onOpenBetSlip={() => setMobileSlipOpen(true)}
            />
        </div>
        </OddsFormatProvider>
    )
}

export default SportsbookShell
