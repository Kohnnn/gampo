import { useMemo, useState } from 'react'
import { ChevronDown, Settings, Ticket, Trash2, X } from 'lucide-react'
import { analyzeTicket } from '../sportsbookEducation'
import { BET_MODES, ODDS_POLICIES, cashoutOffer, formatOdds, quoteTicket } from '../sportsbookMath'
import { validateTicket } from '../sportsbookState'
import OddsCoach from './OddsCoach'

const modeLabels = {
    [BET_MODES.SINGLES]: 'Singles',
    [BET_MODES.MULTI]: 'Multi',
    [BET_MODES.SYSTEM_2]: 'System 2',
}

const lifecycleTabs = [
    { value: 'slip', label: 'Slip' },
    { value: 'active', label: 'Active' },
    { value: 'settled', label: 'Settled' },
]

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

function formatEventSnapshot(event) {
    if (!event) return 'Score update pending'
    const homeScore = event.homeScore ?? event.score?.home
    const awayScore = event.awayScore ?? event.score?.away
    const status = event.status === 'settled' ? 'Final' : event.status || 'Pending'
    const score = homeScore !== undefined && awayScore !== undefined ? ` · ${homeScore}-${awayScore}` : ''
    return `${status}${score}`
}

function TicketSnapshot({ ticket, eventMap, onCashOut }) {
    const legs = ticket.legs?.length ? ticket.legs : ticket.selections || []
    const pending = legs.filter(leg => legStatus(leg) === 'pending')
    const focusLeg = pending[0] || legs[0] || {}
    const event = eventMap.get(focusLeg.eventId)
    const settled = ticket.status === 'settled' || ticket.status === 'cashed_out'
    const profit = Number(ticket.profit || 0)
    const statusClass = settled ? 'is-settled' : 'is-active'
    const resultLabel = settled ? ticket.result || 'settled' : `${pending.length || legs.length} pending`
    const offer = isActiveTicket(ticket) ? cashoutOffer(ticket) : 0

    return (
        <article className={`sb-slip-ticket ${statusClass}`}>
            <header>
                <span>{modeLabels[ticket.mode] || ticket.mode} · {legs.length} legs</span>
                <b className={`sb-life-badge ${statusClass}`}>{resultLabel}</b>
            </header>
            <p>{focusLeg.eventLabel || 'Practice ticket'}</p>
            <small>{formatEventSnapshot(event)}{focusLeg.reason && focusLeg.reason !== 'pending' ? ` · ${focusLeg.reason}` : ''}</small>
            <footer>
                <span>Stake {formatGc(ticket.stake)}</span>
                <span>{settled ? `Returned ${formatGc(ticket.payout)}` : `Est. ${formatGc(ticket.estimatedPayout)}`}</span>
                {settled ? <strong className={profit >= 0 ? 'is-positive' : 'is-negative'}>{profit >= 0 ? '+' : ''}{formatGc(profit)}</strong> : null}
            </footer>
            {onCashOut && offer > 0 ? (
                <button type="button" className="sb-cashout-btn" onClick={() => onCashOut(ticket.id)} data-ux-primary-action>
                    Cash out {formatGc(offer)}
                </button>
            ) : null}
        </article>
    )
}

function TicketList({ tickets, events, emptyTitle, emptyCopy, onCashOut }) {
    const eventMap = useMemo(() => new Map(events.map(event => [event.id, event])), [events])

    if (tickets.length === 0) {
        return (
            <div className="sb-slip-empty is-compact">
                <Ticket size={24} />
                <strong>{emptyTitle}</strong>
                <p>{emptyCopy}</p>
            </div>
        )
    }

    return (
        <div className="sb-slip-ticket-list">
            {tickets.map(ticket => <TicketSnapshot key={ticket.id} ticket={ticket} eventMap={eventMap} onCashOut={onCashOut} />)}
        </div>
    )
}

function BetSlipSettings({ settings, onChange, onClose }) {
    return (
        <div className="sb-slip-settings">
            <div className="sb-slip-settings-head">
                <strong>Practice Slip Settings</strong>
                <button type="button" onClick={onClose} aria-label="Close settings"><X size={16} /></button>
            </div>
            <label>
                <span>Default order</span>
                <select value={settings.order} onChange={event => onChange({ ...settings, order: event.target.value })}>
                    <option value="singles-first">Singles First</option>
                    <option value="multis-first">Multis First</option>
                </select>
            </label>
            <label>
                <span>Odds changes</span>
                <select value={settings.oddsPolicy} onChange={event => onChange({ ...settings, oddsPolicy: event.target.value })}>
                    <option value={ODDS_POLICIES.ACCEPT_ANY}>Accept Any Odds</option>
                    <option value={ODDS_POLICIES.ACCEPT_HIGHER}>Accept Only Higher Odds</option>
                    <option value={ODDS_POLICIES.NO_CHANGES}>No Odds Changes Accepted</option>
                </select>
            </label>
            <label>
                <span>Odds format</span>
                <select value={settings.oddsFormat || 'decimal'} onChange={event => onChange({ ...settings, oddsFormat: event.target.value })}>
                    <option value="decimal">Decimal</option>
                    <option value="american">American</option>
                    <option value="fractional">Fractional</option>
                </select>
            </label>
        </div>
    )
}

function BetSlip({ selections = [], tickets = [], events = [], stake, mode, settings, balance, placing, onStakeChange, onModeChange, onSettingsChange, onRemove, onClear, onAcceptOdds, onPlace, onCashOut, onClose }) {
    const [showSettings, setShowSettings] = useState(false)
    const [activeTab, setActiveTab] = useState('slip')
    const quote = quoteTicket({ selections, stake, mode })
    const analysis = analyzeTicket({ selections, stake, mode, quote })
    const validation = validateTicket({ selections, stake, balance, settings, mode })
    const status = placing ? 'placing' : selections.length === 0 ? 'empty' : validation.valid ? 'ready' : validation.needsManualAccept ? 'odds-changed' : 'selected'
    const hasSameGame = selections.some((selection, index) => selections.findIndex(other => other.eventId === selection.eventId) !== index)
    const activeTickets = tickets.filter(isActiveTicket)
    const settledTickets = tickets.filter(ticket => ticket.status === 'settled' || ticket.status === 'cashed_out')
    const tabCounts = { slip: selections.length, active: activeTickets.length, settled: settledTickets.length }

    return (
        <aside className="sb-betslip" data-ux-surface="controls">
            <header className="sb-slip-header">
                <div>
                    <Ticket size={18} />
                    <strong>Bet Slip</strong>
                    <span>{selections.length}</span>
                </div>
                <div>
                    <button type="button" aria-label="Collapse bet slip"><ChevronDown size={17} /></button>
                    <button type="button" aria-label="Bet slip settings" onClick={() => { setActiveTab('slip'); setShowSettings(value => !value) }}><Settings size={17} /></button>
                    {onClose ? <button type="button" aria-label="Close bet slip" onClick={onClose}><X size={17} /></button> : null}
                </div>
            </header>

            <nav className="sb-slip-tabs" aria-label="Practice ticket lifecycle">
                {lifecycleTabs.map(tab => (
                    <button
                        key={tab.value}
                        type="button"
                        className={activeTab === tab.value ? 'is-active' : ''}
                        aria-pressed={activeTab === tab.value}
                        onClick={() => setActiveTab(tab.value)}
                    >
                        <span>{tab.label}</span>
                        <b>{tabCounts[tab.value]}</b>
                    </button>
                ))}
            </nav>

            {activeTab === 'slip' ? (
                <>
                    {showSettings ? <BetSlipSettings settings={settings} onChange={onSettingsChange} onClose={() => setShowSettings(false)} /> : null}

                    <div className="sb-slip-mode">
                        {Object.entries(modeLabels).map(([value, label]) => (
                            <button key={value} type="button" className={mode === value ? 'is-active' : ''} aria-pressed={mode === value} onClick={() => onModeChange(value)}>
                                {label}
                            </button>
                        ))}
                    </div>

                    <div className="sb-slip-coach">
                        <OddsCoach analysis={analysis} variant="chip" label="Analyze ticket" />
                    </div>

                    {selections.length === 0 ? (
                        <div className="sb-slip-empty">
                            <Ticket size={28} />
                            <strong>Your practice slip is empty</strong>
                            <p>Select a price to build a fake-credit ticket.</p>
                        </div>
                    ) : (
                        <div className="sb-slip-selections">
                            {mode !== BET_MODES.SINGLES && selections.length >= 2 ? (
                                <section className="sb-slip-section">
                                    <h3>{mode === BET_MODES.MULTI ? `${selections.length} Leg Multi` : `2-of-${selections.length} System`}</h3>
                                    <div className="sb-slip-total-odds">
                                        <span>Total Odds</span>
                                        <strong>{quote.totalOdds ? formatOdds(quote.totalOdds, settings.oddsFormat) : '-'}</strong>
                                    </div>
                                </section>
                            ) : null}

                            <section className="sb-slip-section">
                                <h3>Single Picks</h3>
                                {selections.map(selection => (
                                    <article key={selection.selectionId} className={`sb-slip-leg ${selection.oddsChanged ? 'has-odds-change' : ''} ${selection.suspended ? 'is-suspended' : ''}`}>
                                        <button type="button" aria-label="Remove selection" onClick={() => onRemove(selection.selectionId)}>
                                            <X size={15} />
                                        </button>
                                        <small>{selection.eventLabel}</small>
                                        <span>{selection.marketLabel}</span>
                                        <strong>{selection.label}<b>{formatOdds(selection.currentOdds, settings.oddsFormat)}</b></strong>
                                        {selection.oddsChanged ? (
                                            <div className="sb-odds-change">
                                                Was {formatOdds(selection.acceptedOdds, settings.oddsFormat)}
                                                <button type="button" onClick={() => onAcceptOdds(selection.selectionId)}>Accept</button>
                                            </div>
                                        ) : null}
                                        {selection.suspended ? <em>Suspended</em> : null}
                                    </article>
                                ))}
                            </section>
                        </div>
                    )}

                    {hasSameGame && mode !== BET_MODES.SINGLES ? (
                        <div className="sb-slip-warning">Same-game multi: correlation can distort the displayed price.</div>
                    ) : null}

                    <label className="sb-slip-stake">
                        <span>Total Practice Stake</span>
                        <input
                            type="number"
                            min="0"
                            step="1"
                            value={stake}
                            onChange={event => onStakeChange(Math.max(0, Number(event.target.value) || 0))}
                        />
                    </label>

                    <div className="sb-slip-metrics">
                        <div><span>Status</span><strong>{status}</strong></div>
                        <div><span>Est. Return</span><strong>{formatGc(quote.estimatedPayout)}</strong></div>
                        <div><span>EV Hint</span><strong className={quote.expectedValue >= 0 ? 'is-positive' : 'is-negative'}>{formatGc(quote.expectedValue)}</strong></div>
                        <div><span>Balance</span><strong>{formatGc(balance)}</strong></div>
                    </div>

                    {!validation.valid && selections.length > 0 ? <p className="sb-slip-reason">{validation.reason}</p> : null}

                    <div className="sb-slip-actions">
                        <button type="button" className="sb-clear-btn" onClick={onClear} disabled={selections.length === 0}>
                            <Trash2 size={15} />
                            Clear Picks
                        </button>
                        <button type="button" className="sb-place-btn" onClick={onPlace} disabled={!validation.valid || placing} data-ux-primary-action>
                            {placing ? 'Placing...' : 'Place Practice Bet'}
                        </button>
                    </div>
                </>
            ) : (
                <section className="sb-slip-lifecycle-panel">
                    <header className="sb-slip-lifecycle-head">
                        <strong>{activeTab === 'active' ? 'Active practice tickets' : 'Settled practice tickets'}</strong>
                        <span>{tabCounts[activeTab]}</span>
                    </header>
                    <p>{activeTab === 'active' ? 'Pending legs update from event score/status in the fake-credit simulator.' : 'Finished practice tickets show returned GC and decision-review context.'}</p>
                    <TicketList
                        tickets={activeTab === 'active' ? activeTickets : settledTickets}
                        events={events}
                        emptyTitle={activeTab === 'active' ? 'No active tickets' : 'No settled tickets'}
                        emptyCopy={activeTab === 'active' ? 'Place a practice ticket to track pending legs here.' : 'Completed local practice results will appear here.'}
                        onCashOut={activeTab === 'active' ? onCashOut : undefined}
                    />
                </section>
            )}
        </aside>
    )
}

export default BetSlip
