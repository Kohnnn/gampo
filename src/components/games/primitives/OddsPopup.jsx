// OddsPopup — Wave 17. Standalone popup that surfaces RTP, house edge,
// hit chance, EV per play, volatility, and 20-play bankroll risk for the
// current game. Replaces the in-titlebar block of education metrics.

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { bankrollRisk, expectedValue, formatCredits } from '../../../utils/simulationMath'

function pct(v) { return `${((Number(v) || 0) * 100).toFixed(2)}%` }

export default function OddsPopup({ open, onClose, definition, betAmount = 5, balance = 0, recentProfit = 0 }) {
    useEffect(() => {
        if (!open) return
        const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open, onClose])

    if (!open) return null
    const rtp = definition?.rtp ?? 0.99
    const edge = definition?.houseEdge ?? (1 - rtp)
    const winChance = definition?.winChance ?? Math.min(0.99, Math.max(0.01, rtp / 2))
    const multiplier = definition?.payoutMultiplier ?? (rtp / Math.max(0.01, winChance))
    const ev = expectedValue({ betAmount, winProbability: winChance, payoutMultiplier: multiplier })
    const ruin = bankrollRisk({
        bankroll: balance,
        betAmount,
        lossProbability: 1 - winChance,
        trials: 20,
    })

    const popup = (
        <div className="odds-popup-backdrop" onClick={onClose} role="dialog" aria-label="Game odds and probability">
            <div className="odds-popup-card" onClick={e => e.stopPropagation()}>
                <header className="odds-popup-head">
                    <div>
                        <span className="odds-popup-eyebrow">Probability lab</span>
                        <h2>{definition?.name || 'Game odds'}</h2>
                    </div>
                    <button className="odds-popup-close" onClick={onClose} aria-label="Close odds popup">
                        <X size={16} />
                    </button>
                </header>
                <div className="odds-popup-grid">
                    <Card label="RTP" value={pct(rtp)} />
                    <Card label="House edge" value={pct(edge)} />
                    <Card label="Win chance" value={pct(winChance)} />
                    <Card label="EV per play" value={formatCredits(ev)} cls={ev >= 0 ? 'pos' : 'neg'} />
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
        </div>
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
