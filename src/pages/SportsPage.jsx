import { useEffect, useMemo, useState } from 'react'
import { Activity, Calendar, Radio, RotateCcw, Ticket, TrendingUp, TrendingDown } from 'lucide-react'
import { useCredits } from '../context/CreditContext'
import { sportsbookDefinition } from '../data/gameDefinitions'
import {
    createSeededRandom,
    fairDecimalOdds,
    formatCredits,
    sportsbookExpectedValue,
    sportsbookOverround,
    sportsbookVig,
} from '../utils/simulationMath'
import {
    bestBookmakerPrice,
    fetchEventsForDay,
    fetchInSeasonSports,
    fetchOddsForSport,
    fetchUpcomingOdds,
    fixtureFromOddsApi,
    getQuotaSnapshot,
} from '../services/sportsApi'
import '../styles/sports.css'

const fallbackTeams = {
    Football: [
        ['River City FC', 'Northbridge FC'],
        ['Harbor United', 'Lakeside United'],
        ['Eastline SC', 'Westport SC'],
    ],
    Basketball: [
        ['Metro Hoops', 'Capital Hoops'],
    ],
    Tennis: [
        ['A. Practice', 'B. Practice'],
    ],
    Hockey: [
        ['Northern Frost', 'Southern Sparks'],
    ],
    Esports: [
        ['Practice Alpha', 'Practice Beta'],
    ],
}

const sportLeagues = {
    Football: 'Practice League',
    Basketball: 'Practice Hoops',
    Tennis: 'Practice Tennis Open',
    Hockey: 'Practice Ice',
    Esports: 'Practice eLeague',
}

function buildSyntheticFixtures() {
    const random = createSeededRandom(`gampo-sports-${new Date().toISOString().slice(0, 10)}`)
    const fixtures = []
    Object.entries(fallbackTeams).forEach(([sport, list]) => {
        list.forEach(([home, away], idx) => {
            const drawProbability = sport === 'Tennis' || sport === 'Basketball' ? 0 : 0.18 + random() * 0.1
            const homeProbability = 0.34 + random() * 0.2
            const awayProbability = Math.max(0.18, 1 - drawProbability - homeProbability)
            const total = homeProbability + drawProbability + awayProbability
            const trueProbabilities = drawProbability > 0
                ? { home: homeProbability / total, draw: drawProbability / total, away: awayProbability / total }
                : { home: homeProbability / (homeProbability + awayProbability), away: awayProbability / (homeProbability + awayProbability) }
            const margin = 1.05 + random() * 0.045
            const markets = Object.entries(trueProbabilities).map(([outcome, trueProbability]) => {
                const impliedWithMargin = trueProbability * margin
                const decimalOdds = Number((1 / impliedWithMargin).toFixed(2))
                const openingOdds = Number((decimalOdds * (0.94 + random() * 0.12)).toFixed(2))
                return {
                    outcome,
                    label: outcome === 'home' ? home : outcome === 'away' ? away : 'Draw',
                    trueProbability,
                    decimalOdds,
                    openingOdds,
                }
            })
            fixtures.push({
                id: `${sport}-${idx}`,
                sport,
                league: sportLeagues[sport],
                home,
                away,
                starts: `${(14 + idx * 2) % 24}:${idx % 2 === 0 ? '00' : '30'}`,
                live: idx === 0,
                markets,
            })
        })
    })
    return fixtures
}

function combinatorial(n, k) {
    if (k < 0 || k > n) return 0
    let result = 1
    for (let i = 1; i <= k; i++) result = result * (n - i + 1) / i
    return result
}

function SportsPage() {
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const [ticketAmount, setTicketAmount] = useState(10)
    const [selections, setSelections] = useState([])
    const [tickets, setTickets] = useState([])
    const [tab, setTab] = useState('all')
    const [mode, setMode] = useState('single')
    const [region, setRegion] = useState('us')
    const [bookmakerFilter, setBookmakerFilter] = useState('best')
    const [fixtures, setFixtures] = useState(() => buildSyntheticFixtures())
    const [previousOdds, setPreviousOdds] = useState({}) // for drift indicators
    const [liveLoaded, setLiveLoaded] = useState(false)
    const [errors, setErrors] = useState([])
    const [historyDate, setHistoryDate] = useState(() => new Date().toISOString().slice(0, 10))
    const [historyEvents, setHistoryEvents] = useState([])
    const [historyLoading, setHistoryLoading] = useState(false)
    const [showHistorical, setShowHistorical] = useState(false)
    const [quotas, setQuotas] = useState(() => getQuotaSnapshot())
    const [inSeason, setInSeason] = useState([])

    useEffect(() => {
        let mounted = true
        const load = async () => {
            const [usR, ukR, sportsR] = await Promise.all([
                fetchUpcomingOdds('us'),
                fetchUpcomingOdds('uk'),
                fetchInSeasonSports(),
            ])
            if (!mounted) return
            const events = [...(usR.data || []).map(e => ({ ...e, _region: 'us' })), ...(ukR.data || []).map(e => ({ ...e, _region: 'uk' }))]
            const allErrors = [...(usR.errors || []), ...(ukR.errors || [])]
            setInSeason(sportsR.data || [])
            const liveFixtures = events.map(e => fixtureFromOddsApi(e, null, e._region))
            // Merge with synthetic
            if (liveFixtures.length) {
                setFixtures(prev => {
                    // Capture previous odds for drift comparison
                    const driftCapture = {}
                    for (const f of prev) for (const m of f.markets) driftCapture[`${f.id}:${m.outcome}`] = m.decimalOdds
                    setPreviousOdds(driftCapture)
                    return [...liveFixtures, ...prev.filter(p => !p.liveSource)]
                })
                setLiveLoaded(true)
            }
            setErrors(allErrors)
            setQuotas(getQuotaSnapshot())
        }
        load()
        return () => { mounted = false }
    }, [region])

    const filteredFixtures = useMemo(() => {
        let list = fixtures
        if (region) list = list.filter(f => !f.region || f.region === region || !f.liveSource)
        if (tab === 'all') return list
        if (tab === 'live') return list.filter(item => item.live || item.liveSource)
        return list.filter(item => (item.sport || '').toLowerCase().includes(tab.toLowerCase()))
    }, [fixtures, tab, region])

    const sports = useMemo(() => Array.from(new Set(fixtures.map(item => item.sport))), [fixtures])

    const selectionDetails = selections.map(selection => {
        const fixture = fixtures.find(item => item.id === selection.fixtureId)
        const market = fixture?.markets.find(item => item.outcome === selection.outcome)
        return { fixture, market }
    }).filter(item => item.fixture && item.market)

    const combinedOdds = selectionDetails.reduce((product, item) => product * item.market.decimalOdds, 1)
    const combinedTrueProbability = selectionDetails.reduce((product, item) => product * item.market.trueProbability, 1)
    const ticketEv = mode === 'parlay' && selectionDetails.length
        ? sportsbookExpectedValue(ticketAmount, combinedOdds, combinedTrueProbability)
        : mode === 'single' && selectionDetails.length
            ? selectionDetails.reduce((sum, item) => sum + sportsbookExpectedValue(ticketAmount / selectionDetails.length, item.market.decimalOdds, item.market.trueProbability), 0)
            : 0

    const systemCombos = mode === 'system' && selectionDetails.length >= 2 ? combinatorial(selectionDetails.length, 2) : 0

    // Bet builder: detect same-game multi
    const sgmFixtureCounts = selectionDetails.reduce((acc, item) => ({ ...acc, [item.fixture.id]: (acc[item.fixture.id] || 0) + 1 }), {})
    const hasSGM = Object.values(sgmFixtureCounts).some(c => c > 1)

    const toggleSelection = (fixtureId, outcome) => {
        setSelections(prev => {
            const exists = prev.some(item => item.fixtureId === fixtureId && item.outcome === outcome)
            if (exists) return prev.filter(item => !(item.fixtureId === fixtureId && item.outcome === outcome))
            // Allow multiple from same fixture (bet builder mode)
            return [...prev, { fixtureId, outcome }].slice(0, 8)
        })
    }

    const clearTicket = () => setSelections([])

    const settle = () => {
        if (selectionDetails.length === 0) {
            showToast('error', 'No selections', 'Pick at least one market')
            return
        }
        if (!placeBet(ticketAmount, `Sportsbook ${mode}`)) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(ticketAmount)}`)
            return
        }
        const legs = selectionDetails.map(item => ({
            fixture: `${item.fixture.home} vs ${item.fixture.away}`,
            label: item.market.label,
            won: Math.random() < item.market.trueProbability,
            odds: item.market.decimalOdds,
            trueP: item.market.trueProbability,
        }))
        let totalReturn = 0
        if (mode === 'single') {
            const stakePer = ticketAmount / legs.length
            for (const l of legs) if (l.won) totalReturn += stakePer * l.odds
        } else if (mode === 'parlay') {
            if (legs.every(l => l.won)) totalReturn = ticketAmount * combinedOdds
        } else {
            const perStake = ticketAmount / systemCombos
            for (let i = 0; i < legs.length; i++) {
                for (let j = i + 1; j < legs.length; j++) {
                    if (legs[i].won && legs[j].won) totalReturn += perStake * legs[i].odds * legs[j].odds
                }
            }
        }
        if (totalReturn > 0) addWinnings(totalReturn, 'Sportsbook return')
        const profit = totalReturn - ticketAmount
        setTickets(prev => [{
            id: Date.now(), mode, legs, amount: ticketAmount, odds: combinedOdds, profit,
        }, ...prev].slice(0, 12))
        showToast(profit >= 0 ? 'win' : 'loss', `${mode} settled`, `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
    }

    const refresh = async () => {
        const r = await fetchUpcomingOdds(region)
        if (r.data && r.data.length) {
            const liveFixtures = r.data.map(e => fixtureFromOddsApi(e, null, region))
            const driftCapture = {}
            for (const f of fixtures) for (const m of f.markets) driftCapture[`${f.id}:${m.outcome}`] = m.decimalOdds
            setPreviousOdds(driftCapture)
            setFixtures([...liveFixtures, ...fixtures.filter(p => !p.liveSource)])
            setLiveLoaded(true)
        }
        setQuotas(getQuotaSnapshot())
    }

    const loadHistory = async () => {
        setHistoryLoading(true)
        const { data } = await fetchEventsForDay(historyDate, 'Soccer')
        setHistoryEvents(data || [])
        setHistoryLoading(false)
    }

    const totalQuotaRemaining = Object.values(quotas).reduce((sum, q) => sum + (q?.remaining || 0), 0)

    return (
        <div className="sports-page">
            <section className="sports-header">
                <div>
                    <span className="sports-kicker">Synthetic + live sportsbook</span>
                    <h1>Sportsbook Lab</h1>
                    <p>Practice implied probability, overround, fair odds, parlay/system math. Real odds via The Odds API; settlement is fully simulated and educational.</p>
                    {liveLoaded && <small className="live-indicator"><Radio size={12} /> live odds connected</small>}
                    {errors.length > 0 && <small className="live-error">odds api notice: {errors[0]}</small>}
                </div>
                <div className="sports-balance">
                    <span>Practice Credits</span>
                    <strong>{formatCredits(balance)}</strong>
                    <small className="quota-chip">Odds API quota remaining: {totalQuotaRemaining || '–'}</small>
                </div>
            </section>

            <div className="sports-tabs">
                <button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>
                    <Calendar size={14} /> All
                </button>
                <button className={tab === 'live' ? 'active' : ''} onClick={() => setTab('live')}>
                    <Radio size={14} /> Live
                </button>
                {sports.map(sport => (
                    <button key={sport} className={tab === sport ? 'active' : ''} onClick={() => setTab(sport)}>
                        {sport}
                    </button>
                ))}
                <span className="sports-spacer" />
                <div className="region-toggle">
                    <button className={region === 'us' ? 'active' : ''} onClick={() => setRegion('us')}>US</button>
                    <button className={region === 'uk' ? 'active' : ''} onClick={() => setRegion('uk')}>UK</button>
                </div>
                <button className="sports-tabs-action" onClick={refresh}>Refresh odds</button>
                <button className="sports-tabs-action" onClick={() => setShowHistorical(s => !s)}>
                    {showHistorical ? 'Hide history' : 'Educational history'}
                </button>
            </div>

            {showHistorical && (
                <section className="sports-history">
                    <h3>Historical results (TheSportsDB, educational)</h3>
                    <p className="sports-muted">Pick a date to load past Soccer fixtures. Compare to estimate odds you would have set.</p>
                    <div className="sports-history-controls">
                        <input type="date" value={historyDate} onChange={e => setHistoryDate(e.target.value)} />
                        <button className="sports-tabs-action" onClick={loadHistory} disabled={historyLoading}>{historyLoading ? 'Loading...' : 'Load'}</button>
                    </div>
                    <div className="sports-history-grid">
                        {historyEvents.length === 0 ? <p className="sports-muted">No events yet.</p> : historyEvents.map(ev => (
                            <article key={ev.idEvent} className="history-card">
                                <span>{ev.strLeague}</span>
                                <strong>{ev.strHomeTeam} vs {ev.strAwayTeam}</strong>
                                <small>{ev.strDate} · {ev.strTime}</small>
                                {ev.intHomeScore != null && <small>Final: {ev.intHomeScore} - {ev.intAwayScore}</small>}
                            </article>
                        ))}
                    </div>
                </section>
            )}

            <div className="sports-layout">
                <main className="fixtures-list">
                    {filteredFixtures.length === 0 && <p className="sports-muted">No fixtures in this tab.</p>}
                    {filteredFixtures.map(fixture => {
                        const overround = sportsbookOverround(fixture.markets.map(market => market.decimalOdds))
                        const vig = sportsbookVig(fixture.markets.map(market => market.decimalOdds))
                        return (
                            <article key={fixture.id} className={`fixture-card ${fixture.live || fixture.liveSource ? 'live' : ''}`}>
                                <div className="fixture-top">
                                    <div>
                                        <span>
                                            {(fixture.live || fixture.liveSource) && <span className="live-pill">LIVE</span>}
                                            {fixture.sport} · {fixture.league}
                                            {fixture.bookmakerTitle && <small className="fixture-bookmaker"> · {fixture.bookmakerTitle}</small>}
                                        </span>
                                        <h2>{fixture.home} vs {fixture.away}</h2>
                                    </div>
                                    <strong>{fixture.starts}</strong>
                                </div>
                                <div className="market-grid">
                                    {fixture.markets.map(market => {
                                        const active = selections.some(item => item.fixtureId === fixture.id && item.outcome === market.outcome)
                                        const movement = market.decimalOdds - market.openingOdds
                                        const prevKey = `${fixture.id}:${market.outcome}`
                                        const drift = previousOdds[prevKey] != null ? market.decimalOdds - previousOdds[prevKey] : 0
                                        return (
                                            <button
                                                key={market.outcome + market.label}
                                                className={`${active ? 'active' : ''} ${drift > 0 ? 'drift-up' : drift < 0 ? 'drift-down' : ''}`}
                                                onClick={() => toggleSelection(fixture.id, market.outcome)}
                                            >
                                                <span>{market.label}</span>
                                                <strong>{market.decimalOdds.toFixed(2)}</strong>
                                                <small>
                                                    Fair {fairDecimalOdds(market.trueProbability).toFixed(2)}
                                                    {drift !== 0 && (drift > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />)}
                                                </small>
                                            </button>
                                        )
                                    })}
                                </div>
                                <div className="fixture-math">
                                    <span>Overround {(overround * 100).toFixed(1)}%</span>
                                    <span>Vig {(vig * 100).toFixed(1)}%</span>
                                    <span>{sportsbookDefinition.lesson}</span>
                                </div>
                            </article>
                        )
                    })}
                </main>

                <aside className="betslip">
                    <div className="betslip-title">
                        <Ticket size={17} />
                        Practice Ticket
                    </div>

                    <div className="betslip-mode">
                        <button className={mode === 'single' ? 'active' : ''} onClick={() => setMode('single')}>Singles</button>
                        <button className={mode === 'parlay' ? 'active' : ''} onClick={() => setMode('parlay')}>Parlay</button>
                        <button className={mode === 'system' ? 'active' : ''} onClick={() => setMode('system')}>System</button>
                    </div>

                    {hasSGM && mode === 'parlay' && (
                        <div className="sgm-warning">
                            Same-game multi detected. Real books often correlate-block these legs; learn why before stacking them.
                        </div>
                    )}

                    <div className="ticket-legs">
                        {selectionDetails.length === 0 ? (
                            <p className="sports-muted">Choose markets. Singles split stake, Parlay multiplies odds, System pairs all 2-of-N combos.</p>
                        ) : selectionDetails.map(item => (
                            <div key={`${item.fixture.id}-${item.market.outcome}-${item.market.label}`} className="ticket-leg">
                                <span>{item.fixture.home} vs {item.fixture.away}</span>
                                <strong>{item.market.label} @ {item.market.decimalOdds.toFixed(2)}</strong>
                            </div>
                        ))}
                    </div>

                    <label className="ticket-amount">
                        Ticket amount
                        <input type="number" min="0.01" step="1" value={ticketAmount} onChange={event => setTicketAmount(Math.max(0, Number(event.target.value) || 0))} />
                    </label>

                    <div className="ticket-metrics">
                        <div><span>Mode</span><strong>{mode}</strong></div>
                        <div><span>Combined odds</span><strong>{selectionDetails.length ? combinedOdds.toFixed(2) : '-'}</strong></div>
                        <div><span>Implied chance</span><strong>{selectionDetails.length ? `${(100 / Math.max(combinedOdds, 0.0001)).toFixed(1)}%` : '-'}</strong></div>
                        <div><span>Model chance</span><strong>{selectionDetails.length ? `${(combinedTrueProbability * 100).toFixed(1)}%` : '-'}</strong></div>
                        <div><span>EV</span><strong className={ticketEv >= 0 ? 'positive' : 'negative'}>{formatCredits(ticketEv)}</strong></div>
                        {mode === 'system' && <div><span>Pairs</span><strong>{systemCombos}</strong></div>}
                    </div>

                    <button className="place-ticket-btn" onClick={settle}>Settle {mode} Ticket</button>
                    <button className="clear-ticket-btn" onClick={clearTicket}>
                        <RotateCcw size={15} />
                        Clear
                    </button>

                    <div className="ticket-history">
                        <div className="betslip-title small">
                            <Activity size={15} />
                            Settled Tickets
                        </div>
                        {tickets.length === 0 ? <p className="sports-muted">Settlement results will appear here.</p> : tickets.map(ticket => (
                            <div key={ticket.id} className="settled-ticket">
                                <span>{ticket.mode} · {ticket.legs.length} legs · {ticket.odds.toFixed(2)}</span>
                                <strong className={ticket.profit >= 0 ? 'positive' : 'negative'}>
                                    {ticket.profit >= 0 ? '+' : ''}{formatCredits(ticket.profit)}
                                </strong>
                            </div>
                        ))}
                    </div>
                </aside>
            </div>
        </div>
    )
}

export default SportsPage
