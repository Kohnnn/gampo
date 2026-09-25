// OddsPopup — Wave 17. Standalone popup that surfaces RTP, house edge,
// hit chance, EV per play, volatility, and 20-play bankroll risk for the
// current game. Replaces the in-titlebar block of education metrics.

import { createPortal } from 'react-dom'
import useNativeDialog from './useNativeDialog'
import { X } from 'lucide-react'
import { bankrollRisk, expectedValue, formatCredits } from '../../../utils/simulationMath'

// Coerce to a finite number, or null when the value is genuinely unknown.
// `Number(null) || 0` is 0, which would silently present an unknown quantity as
// a real zero — the exact failure mode this component must avoid.
function numOrNull(v) {
    if (v === null || v === undefined || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
}

// An unavailable figure says so, instead of rendering `0.00%`.
function pct(v) { return v === null ? 'Unavailable' : `${(v * 100).toFixed(2)}%` }

// `odds` carries the *live* selection from the game that owns it (e.g. Dice's
// under/over + win chance). It is deliberately optional: when a game cannot
// supply authoritative conditions, the corresponding figure renders as
// unavailable rather than falling back to a fabricated default.
//
// Earlier this component defaulted to `betAmount = 5`, `balance = 0` and
// `winChance = rtp / 2`, which displayed numbers that did not correspond to the
// player's actual selection or balance. Inventing a hit chance from RTP is not a
// derivation — it is a different quantity.
export default function OddsPopup({ open, onClose, definition, odds, betAmount, balance, recentProfit = 0, openerRef }) {
    // Native <dialog> owns focus entry, containment and Escape; the hook
    // restores focus to the control that opened us on close.
    const dialogRef = useNativeDialog(open, onClose, openerRef)

    if (!open) return null
    const rtp = numOrNull(definition?.rtp)
    const edge = numOrNull(definition?.houseEdge) ?? (rtp === null ? null : 1 - rtp)
    // Only the owning game can state a hit chance. Accept it from the live
    // selection; otherwise it is unknown — never `rtp / 2`.
    const winChance = numOrNull(odds?.winChance)
    const multiplier = numOrNull(odds?.payoutMultiplier)
        ?? (winChance === null || winChance <= 0 || rtp === null ? null : rtp / winChance)
    const stake = numOrNull(betAmount)
    const bankroll = numOrNull(balance)
    const ev = (stake === null || winChance === null || multiplier === null)
        ? null
        : expectedValue({ betAmount: stake, winProbability: winChance, payoutMultiplier: multiplier })
    const ruin = (stake === null || bankroll === null || winChance === null)
        ? null
        : bankrollRisk({
            bankroll,
            betAmount: stake,
            lossProbability: 1 - winChance,
            trials: 20,
        })

    const popup = (
        <dialog ref={dialogRef} className="odds-popup-backdrop" aria-label="Game odds and probability">
            <div className="odds-popup-card">
                <header className="odds-popup-head">
                    <div>
                        <span className="odds-popup-eyebrow">Probability lab</span>
                        <h2>{definition?.name || 'Game odds'}</h2>
                    </div>
                    <button className="odds-popup-close" onClick={onClose} aria-label="Close odds popup">
                        <X size={16} />
                    </button>
                </header>
                {odds?.label && (
                    <p className="odds-popup-selection" data-odds-selection>
                        <span>Selection</span> <strong>{odds.label}</strong>
                    </p>
                )}
                <div className="odds-popup-grid">
                    <Card label="RTP" value={pct(rtp)} />
                    <Card label="House edge" value={pct(edge)} />
                    <Card label="Win chance" value={pct(winChance)} />
                    <Card
                        label="EV per play"
                        value={ev === null ? 'Unavailable' : formatCredits(ev)}
                        cls={ev === null ? '' : (ev >= 0 ? 'pos' : 'neg')}
                    />
                    <Card label="Volatility" value={definition?.volatility || '—'} />
                    <Card label="20-play risk" value={pct(ruin)} />
                </div>
                {definition?.lesson && (
                    <p className="odds-popup-lesson">
                        <strong>Lesson:</strong> {definition.lesson}
                    </p>
                )}
                <footer className="odds-popup-foot">
                    <span>Recent session P/L</span>
                    <strong className={recentProfit >= 0 ? 'pos' : 'neg'}>
                        {recentProfit >= 0 ? '+' : ''}{formatCredits(recentProfit)}
                    </strong>
                </footer>
            </div>
        </dialog>
    )

    return typeof document === 'undefined' ? popup : createPortal(popup, document.body)
}

function Card({ label, value, cls = '' }) {
    return (
        <div className="odds-popup-cell">
            <span>{label}</span>
            <strong className={cls}>{value}</strong>
        </div>
    )
}
