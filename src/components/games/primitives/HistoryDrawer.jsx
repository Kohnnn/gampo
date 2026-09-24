// History drawer renders a per-game list of recent plays with profit + label.

import { formatCredits } from '../../../utils/simulationMath'

export function historyRowKey(item = {}, index = 0) {
    return `${item.id || item.ts || item.label || 'history'}-${item.ts || 'legacy'}-${index}`
}

export default function HistoryDrawer({ history, onClear }) {
    return (
        <details className="hd-panel">
            {/* tabIndex makes the summary a valid programmatic focus target: the
                toolbar's History jump moves focus here so keyboard users land in
                the panel they just revealed rather than staying in the toolbar.
                Native <summary> is already in the tab order, so this adds no
                duplicate stop. */}
            <summary className="hd-header" tabIndex={-1}>
                <span>History</span>
                <strong>{history.length}</strong>
            </summary>
            {history.length > 0 && <button type="button" className="hd-clear" onClick={onClear}>Clear</button>}
            <div className="hd-list">
                {history.length === 0 ? (
                    <p className="hd-empty">No plays yet.</p>
                ) : history.slice(0, 60).map((item, index) => (
                    <div key={historyRowKey(item, index)} className={`hd-row ${item.profit > 0 ? 'win' : item.profit < 0 ? 'loss' : 'push'}`}>
                        <span className="hd-label">{item.label}</span>
                        <strong className={`hd-profit ${item.profit >= 0 ? 'positive' : 'negative'}`}>
                            {item.profit >= 0 ? '+' : ''}{formatCredits(item.profit)}
                        </strong>
                    </div>
                ))}
            </div>
        </details>
    )
}
