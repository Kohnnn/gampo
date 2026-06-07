import { useState } from 'react'
import { ChevronDown, Settings, Ticket, Trash2, X } from 'lucide-react'
import { analyzeTicket } from '../sportsbookEducation'
import { BET_MODES, ODDS_POLICIES, quoteTicket } from '../sportsbookMath'
import { validateTicket } from '../sportsbookState'
import OddsCoach from './OddsCoach'

const modeLabels = {
    [BET_MODES.SINGLES]: 'Singles',
    [BET_MODES.MULTI]: 'Multi',
    [BET_MODES.SYSTEM_2]: 'System 2',
}

function BetSlipSettings({ settings, onChange, onClose }) {
    return (
        <div className="sb-slip-settings">
            <div className="sb-slip-settings-head">
                <strong>Betslip Settings</strong>
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
        </div>
    )
}

function BetSlip({ selections, tickets, stake, mode, settings, balance, placing, onStakeChange, onModeChange, onSettingsChange, onRemove, onClear, onAcceptOdds, onPlace, onClose }) {
    const [showSettings, setShowSettings] = useState(false)
    const quote = quoteTicket({ selections, stake, mode })
    const analysis = analyzeTicket({ selections, stake, mode, quote })
    const validation = validateTicket({ selections, stake, balance, settings, mode })
    const status = placing ? 'placing' : selections.length === 0 ? 'empty' : validation.valid ? 'ready' : validation.needsManualAccept ? 'odds-changed' : 'selected'
    const hasSameGame = selections.some((selection, index) => selections.findIndex(other => other.eventId === selection.eventId) !== index)

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
                    <button type="button" aria-label="Bet slip settings" onClick={() => setShowSettings(value => !value)}><Settings size={17} /></button>
                    {onClose ? <button type="button" aria-label="Close bet slip" onClick={onClose}><X size={17} /></button> : null}
                </div>
            </header>

            {showSettings ? <BetSlipSettings settings={settings} onChange={onSettingsChange} onClose={() => setShowSettings(false)} /> : null}

            <div className="sb-slip-mode">
                {Object.entries(modeLabels).map(([value, label]) => (
                    <button key={value} type="button" className={mode === value ? 'is-active' : ''} onClick={() => onModeChange(value)}>
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
                    <strong>Your bet slip is empty</strong>
                    <p>Select a price to build a fake-credit ticket.</p>
                </div>
            ) : (
                <div className="sb-slip-selections">
                    {mode !== BET_MODES.SINGLES && selections.length >= 2 ? (
                        <section className="sb-slip-section">
                            <h3>{mode === BET_MODES.MULTI ? `${selections.length} Leg Multi` : `2-of-${selections.length} System`}</h3>
                            <div className="sb-slip-total-odds">
                                <span>Total Odds</span>
                                <strong>{quote.totalOdds ? quote.totalOdds.toFixed(2) : '-'}</strong>
                            </div>
                        </section>
                    ) : null}

                    <section className="sb-slip-section">
                        <h3>Single Bets</h3>
                        {selections.map(selection => (
                            <article key={selection.selectionId} className={`sb-slip-leg ${selection.oddsChanged ? 'has-odds-change' : ''} ${selection.suspended ? 'is-suspended' : ''}`}>
                                <button type="button" aria-label="Remove selection" onClick={() => onRemove(selection.selectionId)}>
                                    <X size={15} />
                                </button>
                                <small>{selection.eventLabel}</small>
                                <span>{selection.marketLabel}</span>
                                <strong>{selection.label}<b>{Number(selection.currentOdds).toFixed(2)}</b></strong>
                                {selection.oddsChanged ? (
                                    <div className="sb-odds-change">
                                        Was {Number(selection.acceptedOdds).toFixed(2)}
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
                <span>Total Stake</span>
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
                <div><span>Est. Payout</span><strong>GC {quote.estimatedPayout.toFixed(2)}</strong></div>
                <div><span>EV Hint</span><strong className={quote.expectedValue >= 0 ? 'is-positive' : 'is-negative'}>GC {quote.expectedValue.toFixed(2)}</strong></div>
                <div><span>Balance</span><strong>GC {Number(balance || 0).toFixed(2)}</strong></div>
            </div>

            {!validation.valid && selections.length > 0 ? <p className="sb-slip-reason">{validation.reason}</p> : null}

            <div className="sb-slip-actions">
                <button type="button" className="sb-clear-btn" onClick={onClear} disabled={selections.length === 0}>
                    <Trash2 size={15} />
                    Clear Bets
                </button>
                <button type="button" className="sb-place-btn" onClick={onPlace} disabled={!validation.valid || placing} data-ux-primary-action>
                    {placing ? 'Placing...' : 'Place Practice Bet'}
                </button>
            </div>

            <section className="sb-my-bets-mini">
                <h3>My Bets</h3>
                {tickets.length === 0 ? <p>No practice tickets yet.</p> : tickets.slice(0, 4).map(ticket => (
                    <article key={ticket.id}>
                        <span>{modeLabels[ticket.mode] || ticket.mode} - {ticket.selections.length} legs</span>
                        <strong className={ticket.profit >= 0 ? 'is-positive' : 'is-negative'}>
                            {ticket.status === 'settled' ? `${ticket.profit >= 0 ? '+' : ''}GC ${Number(ticket.profit).toFixed(2)}` : ticket.status}
                        </strong>
                    </article>
                ))}
            </section>
        </aside>
    )
}

export default BetSlip
