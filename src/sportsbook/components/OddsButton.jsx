import { Lock, TrendingDown, TrendingUp } from 'lucide-react'
import { formatOdds } from '../sportsbookMath'
import { presentOffer } from '../sportsbookPresentation'
import { useOddsFormat } from './OddsFormatContext'

function OddsButton({ selection, selected = false, onToggle, compact = false }) {
    const oddsFormat = useOddsFormat()
    const offer = presentOffer(selection)
    const movement = Number(selection.decimalOdds) - Number(selection.previousOdds)
    const direction = movement > 0.015 ? 'up' : movement < -0.015 ? 'down' : ''
    const disabled = !offer.eligible
    const reasonId = `offer-reason-${String(selection.id).replace(/[^a-zA-Z0-9_-]/g, '-')}`
    const priceLabel = formatOdds(selection.decimalOdds, oddsFormat)

    if (offer.role === 'model-estimate') {
        return (
            <article className="sb-model-estimate" aria-label={`Model estimate for ${offer.outcome}`}>
                <span>Model estimate</span>
                <strong>{offer.outcome} · {priceLabel}</strong>
                <small>{offer.explanation}</small>
                <small>{offer.observed}</small>
            </article>
        )
    }

    return (
        <div className="sb-odds-cell">
            <button
                type="button"
                className={['sb-odds-button', selected ? 'is-selected' : '', disabled ? 'is-disabled' : '', direction ? `is-${direction}` : '', compact ? 'is-compact' : ''].filter(Boolean).join(' ')}
                onClick={event => {
                    event.stopPropagation()
                    onToggle?.(selection.id, event)
                }}
                disabled={disabled}
                aria-pressed={selected}
                aria-describedby={disabled ? reasonId : undefined}
            >
                <span className="sb-odds-label">{offer.outcome}</span>
                <strong>
                    {disabled ? <Lock size={13} /> : priceLabel}
                    {!disabled && direction === 'up' ? <TrendingUp size={12} aria-label="Price increased" /> : null}
                    {!disabled && direction === 'down' ? <TrendingDown size={12} aria-label="Price decreased" /> : null}
                </strong>
                <small>{offer.bookmaker} · {offer.provider}</small>
                <small>{offer.freshness} · {offer.observed}</small>
            </button>
            {disabled ? <small id={reasonId} className="sb-offer-reason">{offer.reason}</small> : null}
        </div>
    )
}

export default OddsButton
