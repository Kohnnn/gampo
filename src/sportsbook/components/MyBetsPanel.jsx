import { Activity, BadgeDollarSign } from 'lucide-react'
import { analyzeSettlement } from '../sportsbookEducation'
import OddsCoach from './OddsCoach'

function MyBetsPanel({ tickets }) {
    return (
        <section className="sb-my-bets-panel">
            <div className="sb-section-title">
                <Activity size={18} />
                <h2>My Bets</h2>
            </div>
            {tickets.length === 0 ? (
                <div className="sb-empty-panel">Accepted and settled practice tickets will appear here.</div>
            ) : (
                <div className="sb-ticket-list">
                    {tickets.map(ticket => (
                        <article key={ticket.id} className={`sb-ticket-card is-${ticket.status}`}>
                            <header>
                                <BadgeDollarSign size={18} />
                                <div>
                                    <strong>{ticket.mode} - {ticket.selections.length} selections</strong>
                                    <span>{new Date(ticket.acceptedAt).toLocaleTimeString()}</span>
                                </div>
                                <b>{ticket.status}</b>
                            </header>
                            <div className="sb-ticket-legs">
                                {ticket.selections.map(selection => (
                                    <span key={selection.selectionId}>{selection.label} @ {Number(selection.acceptedOdds).toFixed(2)}</span>
                                ))}
                            </div>
                            <footer>
                                <span>Stake GC {Number(ticket.stake).toFixed(2)}</span>
                                <span>Est. GC {Number(ticket.estimatedPayout).toFixed(2)}</span>
                                {ticket.status === 'settled' ? (
                                    <strong className={ticket.profit >= 0 ? 'is-positive' : 'is-negative'}>
                                        {ticket.profit >= 0 ? '+' : ''}GC {Number(ticket.profit).toFixed(2)}
                                    </strong>
                                ) : null}
                                <OddsCoach analysis={analyzeSettlement(ticket)} variant="chip" label="Review" />
                            </footer>
                        </article>
                    ))}
                </div>
            )}
        </section>
    )
}

export default MyBetsPanel
