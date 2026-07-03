// Lightweight hand history tab for the poker sidebar. Tracks the latest
// concluded hands in this session via useGameSession.

import useGameSession from '../primitives/useGameSession'
import { useEffect } from 'react'
import { formatCredits } from '../../../utils/simulationMath'

// External API for PokerGame to record a settled hand:
//   import { recordHand } from './HandHistoryTab'
//   recordHand({ profit, ... })
let recordRef = null
export function recordHand(entry) {
    if (recordRef) recordRef(entry)
}

export default function HandHistoryTab({ liveState }) {
    const session = useGameSession('poker')

    useEffect(() => {
        recordRef = session.record
        return () => { if (recordRef === session.record) recordRef = null }
    }, [session.record])

    return (
        <div className="poker-history-tab">
            <div className="ph-stats">
                <div className="ph-stat"><span>Hands</span><strong>{session.stats.count}</strong></div>
                <div className="ph-stat"><span>Win rate</span><strong>{session.stats.count ? `${((session.stats.wins / session.stats.count) * 100).toFixed(0)}%` : '—'}</strong></div>
                <div className="ph-stat"><span>P/L</span><strong className={session.stats.profit > 0 ? 'pos' : session.stats.profit < 0 ? 'neg' : ''}>{formatCredits(session.stats.profit)}</strong></div>
            </div>
            <h4>Recent hands</h4>
            {session.history.length === 0 ? (
                <p className="ph-empty">No hands yet. Play a few to see history.</p>
            ) : (
                <ul className="ph-list">
                    {session.history.slice(0, 30).map(h => (
                        <li key={h.id || h.ts}>
                            <span className="ph-label">{h.label || (h.profit > 0 ? 'Win' : h.profit < 0 ? 'Loss' : 'Push')}</span>
                            <strong className={h.profit > 0 ? 'pos' : h.profit < 0 ? 'neg' : ''}>
                                {h.profit > 0 ? '+' : ''}{formatCredits(h.profit || 0)}
                            </strong>
                        </li>
                    ))}
                </ul>
            )}
            {liveState?.street === 'showdown' && (
                <div className="ph-show">Showdown — see table for the winner.</div>
            )}
            <button className="ph-clear" onClick={session.clear} disabled={!session.history.length}>Clear history</button>
        </div>
    )
}
