// Stake-style multiplier badge. Used by Limbo, Crash, Mines (current),
// Tower (next), Wheel result, and anywhere a multiplier needs the same
// visual treatment.

export default function MultiplierBadge({
    value,
    suffix = 'x',
    size = 'md',
    state = 'idle', // idle | active | win | bust
    label,
    className = '',
}) {
    const display = formatMultiplier(value)
    return (
        <div className={`mx-badge mx-${size} mx-${state} ${className}`}>
            {label ? <span className="mx-label">{label}</span> : null}
            <strong className="mx-value">{display}{suffix}</strong>
        </div>
    )
}

function formatMultiplier(v) {
    if (!Number.isFinite(v)) return '—'
    if (v >= 100) return v.toFixed(0)
    if (v >= 10) return v.toFixed(2)
    return v.toFixed(2)
}
