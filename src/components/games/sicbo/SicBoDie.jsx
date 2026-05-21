// SicBoDie — renders a six-pip die face for values 1-6 plus a placeholder
// state when value is null. Uses a 3x3 CSS grid with absolute pip positions
// per face (matches Unicode die conventions).

const PIP_LAYOUT = {
    1: ['mc'],
    2: ['tl', 'br'],
    3: ['tl', 'mc', 'br'],
    4: ['tl', 'tr', 'bl', 'br'],
    5: ['tl', 'tr', 'mc', 'bl', 'br'],
    6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br'],
}

export default function SicBoDie({ value, revealed = true, className = '' }) {
    const pips = revealed && value && PIP_LAYOUT[value] ? PIP_LAYOUT[value] : null
    return (
        <span className={`sicbo-die ${revealed ? 'revealed' : ''} ${className}`} aria-label={revealed ? `Die showing ${value}` : 'Die'}>
            {pips
                ? pips.map(slot => <span key={slot} className={`sicbo-pip pip-${slot}`} />)
                : <span className="sicbo-die-q">?</span>}
        </span>
    )
}
