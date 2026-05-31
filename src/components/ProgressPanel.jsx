// ProgressPanel — Wave 19 progression dashboard rendered inside ChatDock.
//
// Shows:
//   - Top summary: unlocked / total + percent ring.
//   - Stats strip: rounds, wins, best multiplier, best streak.
//   - Recent unlocks (last 6 with timestamps).
//   - Grouped achievement list, mission list, VIP ladder.
//   - Scoped reset controls with confirm step.

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
    Award,
    CheckCircle2,
    Compass,
    Crown,
    Flame,
    Gift,
    Lock,
    Play,
    RotateCcw,
    Sparkles,
    Target,
    Trophy,
    Coins,
} from 'lucide-react'
import { useCredits } from '../context/CreditContext'
import { formatCredits } from '../utils/simulationMath'
import { useMissions } from '../hooks/useMissions'
import { useProgress } from '../hooks/useProgress'
import { ACHIEVEMENT_GROUPS } from '../data/achievements'
import { MISSION_PERIODS, VIP_TIERS, vipTierFor } from '../data/missions'

const ICONS = {
    play: Play,
    trophy: Trophy,
    flame: Flame,
    sparkles: Sparkles,
    compass: Compass,
    gift: Gift,
    coins: Coins,
    award: Award,
    target: Target,
    crown: Crown,
}

const MISSION_ROUTES = {
    'daily-spins-10': '/originals',
    'daily-wins-3': '/dice',
    'daily-multi-5': '/limbo',
    'daily-3-games': '/',
    'weekly-spins-100': '/originals',
    'weekly-wagered-1000': '/slots',
    'weekly-streak-5': '/mines',
    'weekly-multi-25': '/wheel',
    'lifetime-spins-1000': '/originals',
    'lifetime-wagered-10000': '/slots-lobby',
    'lifetime-multi-100': '/crash',
    'lifetime-games-15': '/',
}

function missionRouteFor(mission) {
    return MISSION_ROUTES[mission.id] || '/originals'
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

function formatMissionValue(value) {
    const numeric = Number(value) || 0
    return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1)
}

export default function ProgressPanel() {
    const progress = useProgress()
    const missions = useMissions()
    const { resetBalance } = useCredits()
    const [confirming, setConfirming] = useState(null)

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

    const missionGroups = useMemo(() => {
        const map = { daily: [], weekly: [], lifetime: [] }
        for (const mission of missions.missions) {
            if (map[mission.period]) map[mission.period].push(mission)
        }
        return map
    }, [missions.missions])

    const summary = progress.summary
    const stats = progress.stats
    const missionComplete = Object.values(missions.summary).reduce((sum, bucket) => sum + bucket.complete, 0)
    const missionTotal = Object.values(missions.summary).reduce((sum, bucket) => sum + bucket.total, 0)
    const wagered = missions.stats.lifetime.wagered
    const { current: currentVip, next: nextVip } = vipTierFor(wagered)
    const vipProgress = nextVip
        ? Math.min(1, (wagered - currentVip.wager) / Math.max(1, nextVip.wager - currentVip.wager))
        : 1

    const resetScopes = [
        {
            id: 'achievements',
            label: 'Achievements',
            detail: 'Wipes achievement stats and unlocks.',
            action: progress.reset,
        },
        {
            id: 'missions',
            label: 'Missions',
            detail: 'Wipes daily, weekly, lifetime missions.',
            action: missions.reset,
        },
        {
            id: 'vip',
            label: 'VIP',
            detail: 'Wipes lifetime mission volume and VIP tier progress.',
            action: missions.resetVip,
        },
        {
            id: 'wallet',
            label: 'Wallet',
            detail: 'Resets practice credits to the starter balance.',
            action: resetBalance,
        },
    ]

    const confirmScope = resetScopes.find(scope => scope.id === confirming)

    const runReset = () => {
        if (!confirmScope) return
        confirmScope.action()
        setConfirming(null)
    }

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
                    <span><small>Missions</small><strong>{missionComplete}/{missionTotal}</strong></span>
                    <span><small>VIP</small><strong>{currentVip.label}</strong></span>
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

            <section className="prog-section">
                <header><Target size={13} /> Missions</header>
                <div className="prog-mission-summary">
                    {(['daily', 'weekly', 'lifetime']).map(period => (
                        <span key={period}>
                            <small>{MISSION_PERIODS[period].label}</small>
                            <strong>{missions.summary[period].complete}/{missions.summary[period].total}</strong>
                            <em>{missions.summary[period].claimed} claimed</em>
                        </span>
                    ))}
                </div>
                <div className="prog-groups">
                    {(['daily', 'weekly', 'lifetime']).map(period => (
                        <div key={period} className="prog-group">
                            <h4>{MISSION_PERIODS[period].label}</h4>
                            <ul>
                                {missionGroups[period].map(mission => {
                                    const Icon = ICONS[mission.icon] || Target
                                    return (
                                        <li
                                            key={mission.id}
                                            className={`prog-mission period-${mission.period} ${mission.complete ? 'is-complete' : ''} ${mission.claimed ? 'is-claimed' : ''}`}
                                        >
                                            <span className="prog-ach-icon">
                                                <Icon size={14} />
                                            </span>
                                            <div className="prog-ach-body">
                                                <strong>{mission.name}</strong>
                                                <span>{mission.detail}</span>
                                                <div className="prog-ach-bar" aria-hidden>
                                                    <i style={{ width: `${mission.ratio * 100}%` }} />
                                                </div>
                                                <Link className="prog-mission-link" to={missionRouteFor(mission)}>
                                                    Play relevant game
                                                </Link>
                                            </div>
                                            <em>
                                                {mission.claimed
                                                    ? 'Claimed'
                                                    : mission.complete
                                                        ? 'Ready'
                                                        : `${formatMissionValue(mission.progress)}/${mission.target}`}
                                            </em>
                                        </li>
                                    )
                                })}
                            </ul>
                        </div>
                    ))}
                </div>
            </section>

            <section className="prog-section">
                <header><Crown size={13} /> VIP</header>
                <div className="prog-vip-card">
                    <div>
                        <small>Current tier</small>
                        <strong>{currentVip.label}</strong>
                    </div>
                    <div>
                        <small>Lifetime wagered</small>
                        <strong>{formatCredits(wagered)}</strong>
                    </div>
                    <div>
                        <small>{nextVip ? 'Next tier' : 'Top tier'}</small>
                        <strong>{nextVip ? nextVip.label : currentVip.label}</strong>
                        <em>{nextVip ? `${formatCredits(Math.max(0, nextVip.wager - wagered))} to go` : 'Complete'}</em>
                    </div>
                    <span className="prog-vip-progress" aria-hidden><i style={{ width: `${vipProgress * 100}%` }} /></span>
                </div>
                <ul className="prog-vip-list">
                    {VIP_TIERS.map(tier => {
                        const unlocked = wagered >= tier.wager
                        const active = tier.id === currentVip.id
                        return (
                            <li key={tier.id} className={`${unlocked ? 'is-complete' : ''} ${active ? 'is-active' : ''}`}>
                                <span className="prog-ach-icon">
                                    {unlocked ? <CheckCircle2 size={14} /> : <Lock size={14} />}
                                </span>
                                <div className="prog-ach-body">
                                    <strong>{tier.label}</strong>
                                    <span>{tier.perk}</span>
                                </div>
                                <em>{formatCredits(tier.wager)}</em>
                            </li>
                        )
                    })}
                </ul>
            </section>

            <footer className="prog-foot">
                {!confirmScope ? (
                    <div className="prog-reset-grid" aria-label="Reset progress scopes">
                        {resetScopes.map(scope => (
                            <button
                                key={scope.id}
                                className="prog-reset-btn"
                                onClick={() => setConfirming(scope.id)}
                                type="button"
                                title={scope.detail}
                            >
                                <RotateCcw size={12} /> {scope.label}
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="prog-confirm">
                        <span>{confirmScope.detail}</span>
                        <button
                            className="prog-reset-confirm"
                            onClick={runReset}
                            type="button"
                        >Confirm</button>
                        <button
                            className="prog-reset-cancel"
                            onClick={() => setConfirming(null)}
                            type="button"
                        >Cancel</button>
                    </div>
                )}
            </footer>
        </div>
    )
}
