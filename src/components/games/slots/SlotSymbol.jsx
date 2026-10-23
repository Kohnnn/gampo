import Asset from '../primitives/Asset'

export default function SlotSymbol({ symbol }) {
    if (symbol?.barCount) {
        return (
            <span className="slot-bar-token" role="img" aria-label={`${symbol.barCount} BAR${symbol.barCount === 1 ? '' : 'S'}`}>
                {Array.from({ length: symbol.barCount }, (_, index) => <span key={index}>BAR</span>)}
            </span>
        )
    }
    return (
        <>
            <Asset src={symbol?.asset} alt={symbol?.label} fallback={<strong>{symbol?.label}</strong>} />
            {symbol?.tokenLabel && <span className="slot-symbol-token">{symbol.tokenLabel}</span>}
        </>
    )
}
