// Stats overlay for any game. Reads from useGameSession's stats and renders
// total bets, wagered, returned, profit, observed RTP, win rate, biggest hit,
// streaks, a tiny last-N visual strip, and an EV coach verdict (theoretical vs
// observed return) so every game teaches the math, not just poker.

import { formatCredits } from '../../../utils/simulationMath'
import { buildEvCoach, EV_VERDICT_LABELS } from '../../../utils/evCoach'

export default function StatsOverlay({ stats, definition }) {
    if (!stats) return null
    const targetRtp = definition?.rtp != null ? `${(definition.rtp * 100).toFixed(1)}%` : '—'
    const obs = stats.count >= 20 && stats.rtp != null ? `${(stats.rtp * 100).toFixed(1)}%` : 'Too few samples'
    const winRate = stats.count ? `${((stats.wins / stats.count) * 100).toFixed(1)}%` : '—'
    const coach = buildEvCoach(definition || {}, stats)
    return (
        <div className="stats-overlay">
            <div className="so-row">
                <Card label="Total bets" value={stats.count} />
                <Card label="Win rate" value={winRate} />
                <Card label="Profit" value={formatCredits(stats.profit)} cls={stats.profit >= 0 ? 'positive' : 'negative'} />
            </div>
            <div className="so-row">
                <Card label="Observed RTP" value={obs} title="Stabilizes after ~100 rounds" />
                <Card label="Target RTP" value={targetRtp} />
                <Card label="Best win" value={formatCredits(stats.biggestWin)} />
            </div>
            <div className="so-row">
                <Card label="Win streak" value={stats.streakWin} />
                <Card label="Loss streak" value={stats.streakLoss} />
                <Card label="Wagered" value={formatCredits(stats.wagered)} />
            </div>
            <div className={`so-coach so-coach-${coach.verdict}`} data-ev-verdict={coach.verdict}>
                <span className="so-coach-tag">EV coach · {EV_VERDICT_LABELS[coach.verdict]}</span>
                <p className="so-coach-note">{coach.note}</p>
            </div>
            <div className="so-strip" aria-label="Last results">
                {stats.lastResults && stats.lastResults.length === 0 ? (
                    <span className="so-empty">No plays yet</span>
                ) : (stats.lastResults || []).map((item, index) => (
                    <span key={`${item.id || item.ts || 'result'}-${index}`} className={`so-pill ${item.profit > 0 ? 'win' : item.profit < 0 ? 'loss' : 'push'}`}>
                        {item.label}
                    </span>
                ))}
            </div>
        </div>
    )
}

function Card({ label, value, cls = '', title = undefined }) {
    return (
        <div className="so-card" title={title}>
            <span>{label}</span>
            <strong className={cls}>{value}</strong>
        </div>
    )
}
