// Small reusable list of bet meta rows (label / value).
// Replaces the inline `<div className="bp-bal-line">` blocks every game inlines.
//
// Usage:
//   <BetMetaList items={[
//     { label: 'Multiplier', value: '2.00×' },
//     { label: 'Hit chance', value: '49.50%' },
//     { label: 'Payout', value: '+10.00', tone: 'win' },
//   ]} />

export default function BetMetaList({ items = [], className = '' }) {
    if (!items.length) return null
    return (
        <ul className={`bml-list ${className}`}>
            {items.map((item, i) => (
                <li key={item.label || i} className={`bml-row${item.tone ? ` bml-${item.tone}` : ''}`}>
                    <span className="bml-label">{item.label}</span>
                    <strong className="bml-value">{item.value}</strong>
                </li>
            ))}
        </ul>
    )
}
