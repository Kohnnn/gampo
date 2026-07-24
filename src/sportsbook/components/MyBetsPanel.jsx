import { useMemo } from 'react'
import { Activity, BadgeDollarSign } from 'lucide-react'
import { analyzeSettlement } from '../sportsbookEducation'
import { cashoutOffer } from '../sportsbookMath'
import OddsCoach from './OddsCoach'

const modeLabels = {
    singles: 'Singles',
    multi: 'Multi',
    'system-2': 'System 2',
}

function isActiveTicket(ticket) {
    return ticket?.status === 'active' || ticket?.status === 'accepted'
}

function formatGc(value) {
    return `GC ${Number(value || 0).toFixed(2)}`
}

function legStatus(leg = {}) {
    if (leg.status) return leg.reason === 'push' ? 'push' : leg.status
    if (leg.won === true) return 'won'
    if (leg.won === false) return 'lost'
    return 'pending'
}

function eventSnapshot(event) {
    if (!event) return 'Score update pending'
    const homeScore = event.homeScore ?? event.score?.home
    const awayScore = event.awayScore ?? event.score?.away
    const score = homeScore !== undefined && awayScore !== undefined ? `${homeScore}-${awayScore}` : 'score pending'
    const status = event.status === 'settled' ? 'Final' : event.status === 'live' ? `Live ${event.clock || event.period || ''}`.trim() : 'Not started'
    return `${status} · ${score}`
}

function TicketSection({ title, copy, tickets, eventMap, emptyCopy, onCashOut }) {
    return (
        <section className="sb-ticket-section" aria-label={title}>
            <div className="sb-ticket-section-head">
                <div>
                    <strong>{title}</strong>
                    <span>{copy}</span>
                </div>
                <b>{tickets.length}</b>
            </div>
            {tickets.length === 0 ? (
                <div className="sb-empty-panel is-compact">{emptyCopy}</div>
            ) : (
                <div className="sb-ticket-list">
                    {tickets.map(ticket => <TicketCard key={ticket.id} ticket={ticket} eventMap={eventMap} onCashOut={onCashOut} />)}
                </div>
            )}
        </section>
    )
}

function TicketCard({ ticket, eventMap, onCashOut }) {
    const legs = ticket.legs?.length ? ticket.legs : ticket.selections || []
    const settled = ticket.status === 'settled' || ticket.status === 'cashed_out'
    const profit = Number(ticket.profit || 0)
    const time = new Date(settled && ticket.settledAt ? ticket.settledAt : ticket.acceptedAt).toLocaleTimeString()
    const offer = isActiveTicket(ticket) ? cashoutOffer(ticket) : 0

    return (
        <article className={`sb-ticket-card is-${settled ? 'settled' : 'active'}`}>
            <header>
                <BadgeDollarSign size={18} />
                <div>
                    <strong>{modeLabels[ticket.mode] || ticket.mode} · {legs.length} selections</strong>
                    <span>{settled ? 'Settled' : 'Accepted'} {time}</span>
                </div>
                <b className={`sb-life-badge ${settled ? 'is-settled' : 'is-active'}`}>{settled ? ticket.result || 'settled' : `${ticket.pending?.length || legs.filter(leg => legStatus(leg) === 'pending').length || legs.length} pending`}</b>
            </header>
            <div className="sb-ticket-legs">
                {legs.map(leg => {
                    const status = legStatus(leg)
                    const event = eventMap.get(leg.eventId)
                    return (
                        <span key={leg.selectionId} className={`is-${status}`}>
                            <strong>{leg.label} @ {Number(leg.odds || leg.acceptedOdds || 0).toFixed(2)}</strong>
                            <small>{eventSnapshot(event)} · {leg.reason || status}</small>
                        </span>
                    )
                })}
            </div>
            <footer>
                <span>Stake {formatGc(ticket.stake)}</span>
                <span>{settled ? `Returned ${formatGc(ticket.payout)}` : `Est. ${formatGc(ticket.estimatedPayout)}`}</span>
                {settled ? (
                    <strong className={profit >= 0 ? 'is-positive' : 'is-negative'}>
                        {profit >= 0 ? '+' : ''}{formatGc(profit)}
                    </strong>
                ) : null}
                {settled ? <OddsCoach analysis={analyzeSettlement(ticket)} variant="chip" label="Review" /> : null}
            </footer>
            {onCashOut && offer > 0 ? (
                <button type="button" className="sb-cashout-btn" onClick={() => onCashOut(ticket.id)} data-ux-primary-action>
                    Cash out {formatGc(offer)}
                </button>
            ) : null}
        </article>
    )
}

function settledSummary(tickets) {
    return tickets.reduce((acc, ticket) => {
        acc.staked += Number(ticket.stake || 0)
        acc.returned += Number(ticket.payout || 0)
        acc.net += Number(ticket.profit || 0)
        if (Number(ticket.profit || 0) > 0) acc.won += 1
        else if (Number(ticket.profit || 0) < 0) acc.lost += 1
        return acc
    }, { staked: 0, returned: 0, net: 0, won: 0, lost: 0 })
}

function MyBetsPanel({ tickets = [], events = [], onCashOut }) {
    const eventMap = useMemo(() => new Map(events.map(event => [event.id, event])), [events])
    const activeTickets = tickets.filter(isActiveTicket)
    const settledTickets = tickets.filter(ticket => ticket.status === 'settled' || ticket.status === 'cashed_out')
    const summary = useMemo(() => settledSummary(settledTickets), [settledTickets])

    return (
        <section className="sb-my-bets-panel">
            <div className="sb-section-title">
                <Activity size={18} />
                <h2>My Bets</h2>
            </div>
            {tickets.length === 0 ? (
                <div className="sb-empty-panel">Accepted and settled practice tickets will appear here.</div>
            ) : (
                <div className="sb-ticket-sections">
                    {settledTickets.length ? (
                        <div className="sb-bets-summary" role="group" aria-label="Practice profit and loss summary">
                            <div><span>Settled</span><strong>{summary.won}W · {summary.lost}L</strong></div>
                            <div><span>Staked</span><strong>{formatGc(summary.staked)}</strong></div>
                            <div><span>Returned</span><strong>{formatGc(summary.returned)}</strong></div>
                            <div><span>Net P/L</span><strong className={summary.net >= 0 ? 'is-positive' : 'is-negative'}>{summary.net >= 0 ? '+' : ''}{formatGc(summary.net)}</strong></div>
                        </div>
                    ) : null}
                    <TicketSection
                        title="Active practice tickets"
                        copy="Pending legs follow the simulator event feed."
                        tickets={activeTickets}
                        eventMap={eventMap}
                        emptyCopy="No active practice tickets."
                        onCashOut={onCashOut}
                    />
                    <TicketSection
                        title="Settled practice tickets"
                        copy="Final fake-credit returns and review context."
                        tickets={settledTickets}
                        eventMap={eventMap}
                        emptyCopy="No settled practice tickets yet."
                    />
                </div>
            )}
        </section>
    )
}

export default MyBetsPanel
