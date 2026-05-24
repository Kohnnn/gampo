// ProgressPanel — Wave 19 progression dashboard rendered inside ChatDock.
//
// Shows:
//   - Top summary: unlocked / total + percent ring.
//   - Stats strip: rounds, wins, best multiplier, best streak.
//   - Recent unlocks (last 6 with timestamps).
//   - Grouped achievement list with progress bars + lesson detail.
//   - "Reset progress" with confirm step.

import { useMemo, useState } from 'react'
import {
    Award,
    Compass,
    Flame,
    Gift,
    Play,
    RotateCcw,
    Sparkles,
    Trophy,
    Coins,
} from 'lucide-react'
import { useProgress } from '../hooks/useProgress'
import { ACHIEVEMENT_GROUPS } from '../data/achievements'

const ICONS = {
    play: Play,
    trophy: Trophy,
    flame: Flame,
    sparkles: Sparkles,
    compass: Compass,
    gift: Gift,
    coins: Coins,
    award: Award,
}

function formatTs(ts) {
    if (!ts) return ''
    const diff = Date.now() - ts
    if (diff < 60_000) return 'just now'
    if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
    if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
    return `${Math.round(diff / 86_400_000)}d ago`
}

function tierClass(tier) {
    return `prog-tier-${tier || 'bronze'}`
}

export default function ProgressPanel() {
    const progress = useProgress()
    const [confirming, setConfirming] = useState(false)

    const grouped = useMemo(() => {
        const map = {}
        for (const ach of progress.achievements) {
            if (!map[ach.group]) map[ach.group] = []
            map[ach.group].push(ach)
        }
        return Object.entries(map).sort(([a], [b]) => (
            (ACHIEVEMENT_GROUPS[a]?.sort || 99) - (ACHIEVEMENT_GROUPS[b]?.sort || 99)
        ))
    }, [progress.achievements])

    const summary = progress.summary
    const stats = progress.stats

    return (
        <div className="prog-panel">
            <header className="prog-summary">
                <div className="prog-ring" style={{ '--pct': summary.percent }}>
                    <strong>{summary.percent}%</strong>
                    <small>{summary.unlockedCount}/{summary.total}</small>
                </div>
                <div className="prog-summary-grid">
                    <span><small>Rounds</small><strong>{stats.totalRounds}</strong></span>
                    <span><small>Wins</small><strong>{stats.totalWins}</strong></span>
                    <span><small>Best ×</small><strong>{stats.bestMultiplier.toFixed(1)}</strong></span>
                    <span><small>Best streak</small><strong>{stats.bestWinStreak}</strong></span>
                </div>
            </header>

            {summary.recent.length > 0 && (
                <section className="prog-section">
                    <header><Award size={13} /> Recent unlocks</header>
                    <ul className="prog-recent">
                        {summary.recent.map(ach => {
                            const Icon = ICONS[ach.icon] || Award
                            return (
                                <li key={ach.id} className={tierClass(ach.tier)}>
                                    <Icon size={14} />
                                    <span>{ach.name}</span>
                                    <em>{formatTs(ach.ts)}</em>
                                </li>
                            )
                        })}
                    </ul>
                </section>
            )}

            <section className="prog-section">
                <header>Achievements</header>
                <div className="prog-groups">
                    {grouped.map(([group, list]) => (
                        <div key={group} className="prog-group">
                            <h4>{ACHIEVEMENT_GROUPS[group]?.label || group}</h4>
                            <ul>
                                {list.map(ach => {
                                    const Icon = ICONS[ach.icon] || Award
                                    return (
                                        <li
                                            key={ach.id}
                                            className={`${tierClass(ach.tier)} ${ach.complete ? 'is-complete' : ''}`}
                                        >
                                            <span className="prog-ach-icon">
                                                <Icon size={14} />
                                            </span>
                                            <div className="prog-ach-body">
                                                <strong>{ach.name}</strong>
                                                <span>{ach.detail}</span>
                                                <div className="prog-ach-bar" aria-hidden>
                                                    <i style={{ width: `${ach.ratio * 100}%` }} />
                                                </div>
                                            </div>
                                            <em>
                                                {ach.complete
                                                    ? '✓'
                                                    : `${Math.min(ach.value, ach.target)}/${ach.target}`}
                                            </em>
                                        </li>
                                    )
                                })}
                            </ul>
                        </div>
                    ))}
                </div>
            </section>

            <footer className="prog-foot">
                {!confirming ? (
                    <button
                        className="prog-reset-btn"
                        onClick={() => setConfirming(true)}
                        type="button"
                    >
                        <RotateCcw size={12} /> Reset progress
                    </button>
                ) : (
                    <div className="prog-confirm">
                        <span>This wipes stats + unlocks.</span>
                        <button
                            className="prog-reset-confirm"
                            onClick={() => { progress.reset(); setConfirming(false) }}
                            type="button"
                        >Confirm</button>
                        <button
                            className="prog-reset-cancel"
                            onClick={() => setConfirming(false)}
                            type="button"
                        >Cancel</button>
                    </div>
                )}
            </footer>
        </div>
    )
}
