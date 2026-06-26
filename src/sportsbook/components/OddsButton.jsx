import { Lock, TrendingDown, TrendingUp } from 'lucide-react'
import { analyzeSelection } from '../sportsbookEducation'
import { formatOdds } from '../sportsbookMath'
import OddsCoach from './OddsCoach'
import { useOddsFormat } from './OddsFormatContext'

function OddsButton({ selection, selected = false, onToggle, compact = false, marketGroup = null }) {
    const oddsFormat = useOddsFormat()
    const disabled = selection.suspended || selection.status === 'suspended' || selection.status === 'locked'
    const movement = Number(selection.decimalOdds) - Number(selection.previousOdds)
    const direction = movement > 0.015 ? 'up' : movement < -0.015 ? 'down' : ''
    const analysis = analyzeSelection(selection, marketGroup)
    const estimated = selection.estimated || selection.source === 'synthetic-estimate'
    const priceLabel = formatOdds(selection.decimalOdds, oddsFormat)

    return (
        <div className="sb-odds-cell">
            <button
                type="button"
                className={[
                    'sb-odds-button',
                    selected ? 'is-selected' : '',
                    disabled ? 'is-disabled' : '',
                    direction ? `is-${direction}` : '',
                    compact ? 'is-compact' : '',
                    estimated ? 'is-estimated' : '',
                ].filter(Boolean).join(' ')}
                onClick={(event) => {
                    event.stopPropagation()
                    onToggle?.(selection.id, event)
                }}
                disabled={disabled}
                title={disabled ? 'Market suspended' : `${selection.label} ${priceLabel}`}
            >
                <span className="sb-odds-label">{selection.label}</span>
                <strong>
                    {disabled ? <Lock size={13} /> : priceLabel}
                    {!disabled && direction === 'up' ? <TrendingUp size={12} /> : null}
                    {!disabled && direction === 'down' ? <TrendingDown size={12} /> : null}
                </strong>
                {estimated ? <em>Est.</em> : null}
            </button>
            <OddsCoach analysis={analysis} label="Analyze odds" />
        </div>
    )
}

export default OddsButton
