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
    Zap,
    Calendar,
    Layers,
} from 'lucide-react'
import { useCredits } from '../context/CreditContext'
import { formatCredits } from '../utils/simulationMath'
import { useMissions } from '../hooks/useMissions'
import { useProgress } from '../hooks/useProgress'
import { useXp } from '../hooks/useXp'
import { useRewards } from '../hooks/useRewards'
import { useSettings } from '../hooks/useSettings'
import { STARTER_PACKS, DAILY_CLAIM_CREDITS, PROGRESS_PACK_CREDITS } from '../data/rewards'
import { ACHIEVEMENT_GROUPS } from '../data/achievements'
import { MISSION_PERIODS, VIP_TIERS, vipTierFor } from '../data/missions'
import { haptic } from '../utils/haptics'

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
    zap: Zap,
    calendar: Calendar,
    layers: Layers,
}

const MISSION_ROUTES = {
    'daily-spins-10': '/originals',
    'daily-wins-3': '/dice',
    'daily-multi-5': '/limbo',
    'daily-3-games': '/',
    'daily-profit-50': '/blackjack',
    'daily-wagered-250': '/slots',
    'weekly-spins-100': '/originals',
    'weekly-wagered-1000': '/slots',
    'weekly-streak-5': '/mines',
    'weekly-multi-25': '/wheel',
    'weekly-5-games': '/',
    'weekly-bigwin-500': '/crash',
    'lifetime-spins-1000': '/originals',
    'lifetime-wagered-10000': '/slots-lobby',
    'lifetime-multi-100': '/crash',
    'lifetime-games-15': '/',
    'lifetime-games-40': '/',
    'lifetime-wagered-100000': '/slots-lobby',
    'lifetime-multi-500': '/limbo',
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
    const xp = useXp()
    const rewards = useRewards()
    const { haptics } = useSettings()
    const { resetBalance, grantPracticeCredits, showToast } = useCredits()
    const [confirming, setConfirming] = useState(null)

    const pendingLevels = rewards.pendingLevelRewards(xp.level)

    const handleStarterPack = (id) => {
        const credits = rewards.chooseStarterPack(id)
        if (credits > 0) {
            grantPracticeCredits(credits)
            haptic('win', { enabled: haptics, force: true })
            showToast?.('win', 'Starter pack claimed', `+GC ${credits.toLocaleString()}`)
        }
    }
    const handleDailyClaim = () => {
        const credits = rewards.claimDaily()
        if (credits > 0) {
            grantPracticeCredits(credits)
            haptic('win', { enabled: haptics, force: true })
            showToast?.('win', 'Daily reward', `+GC ${credits.toLocaleString()}`)
        }
    }
    const handleLevelClaim = () => {
        const credits = rewards.claimLevelRewards(xp.level)
        if (credits > 0) {
            grantPracticeCredits(credits)
            haptic('rare', { enabled: haptics, force: true })
            showToast?.('win', 'Level rewards claimed', `+GC ${credits.toLocaleString()}`)
        }
    }
    const handleProgressPack = () => {
        const credits = rewards.takeProgressPack()
        if (credits > 0) {
            grantPracticeCredits(credits)
            haptic('win', { enabled: haptics, force: true })
            showToast?.('win', 'Progress pack', `+GC ${credits.toLocaleString()}`)
        }
    }
    const handleChallengeClaim = () => {
        const result = missions.claimChallenge(missions.challenge.challengeId)
        const credits = result?.reward?.credits || 0
        if (credits > 0) {
            grantPracticeCredits(credits)
            haptic('rare', { enabled: haptics, force: true })
            showToast?.('win', 'Daily challenge', `+GC ${credits.toLocaleString()}`)
        }
    }

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
            id: 'xp',
            label: 'XP / Level',
            detail: 'Resets your level, rank, and total XP to zero.',
            action: xp.reset,
        },
        {
            id: 'rewards',
            label: 'Rewards',
            detail: 'Resets starter pack, daily, and level reward claims.',
            action: rewards.reset,
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
                    <span><small>Day streak</small><strong>{stats.currentDayStreak || 0}🔥</strong></span>
                    <span><small>Best streak</small><strong>{stats.bestWinStreak}</strong></span>
                    <span><small>Missions</small><strong>{missionComplete}/{missionTotal}</strong></span>
                    <span><small>VIP</small><strong>{currentVip.label}</strong></span>
                </div>
            </header>

            <section className="prog-xp">
                <div className="prog-xp-head">
                    <span className="prog-xp-rank">
                        {(() => { const RankIcon = ICONS[xp.rank.current.icon] || Award; return <RankIcon size={15} /> })()}
                        <strong>Lvl {xp.level}</strong>
                        <em>{xp.rank.current.label}</em>
                    </span>
                    <span className="prog-xp-count">
                        {xp.atMax ? 'MAX' : `${Math.round(xp.intoLevel)} / ${Math.round(xp.span)} XP`}
                    </span>
                </div>
                <div className="prog-xp-track" role="progressbar" aria-valuenow={Math.round(xp.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                    <span className="prog-xp-fill" style={{ width: `${Math.round(xp.progress * 100)}%`, '--rank-accent': xp.rank.current.accent }} />
                </div>
                <div className="prog-xp-foot">
                    <span>{xp.totalXp.toLocaleString()} XP total</span>
                    {xp.rank.next && !xp.atMax && <span>Next: {xp.rank.next.label} · Lvl {xp.rank.next.minLevel}</span>}
                </div>
            </section>

            <section className="prog-section prog-bests">
                <header><Trophy size={13} /> Personal bests</header>
                <div className="prog-bests-grid">
                    <span><small>Biggest win ×</small><strong>{(stats.bestMultiplier || 0).toFixed(1)}×</strong></span>
                    <span><small>Best win streak</small><strong>{stats.bestWinStreak || 0}</strong></span>
                    <span><small>Best day streak</small><strong>{stats.bestDayStreak || 0}🔥</strong></span>
                    <span><small>Days played</small><strong>{stats.totalDaysPlayed || 0}</strong></span>
                    <span><small>Peak profit</small><strong>{Math.round(stats.bestProfit || 0).toLocaleString()}</strong></span>
                    <span><small>Rare drops</small><strong>{stats.casesRareDrops || 0}</strong></span>
                </div>
            </section>

            <section className="prog-section prog-rewards">
                <header><Gift size={13} /> Rewards</header>
                {!rewards.starterPackChosen && (
                    <div className="prog-starter">
                        <p className="prog-rewards-hint">One-time starter pack — free play stays default.</p>
                        <div className="prog-starter-grid">
                            {STARTER_PACKS.map(pack => {
                                const PackIcon = ICONS[pack.icon] || Gift
                                return (
                                    <button
                                        key={pack.id}
                                        type="button"
                                        className="prog-starter-card"
                                        onClick={() => handleStarterPack(pack.id)}
                                        title={pack.detail}
                                    >
                                        <PackIcon size={16} />
                                        <strong>{pack.label}</strong>
                                        <em>{pack.credits > 0 ? `+GC ${pack.credits.toLocaleString()}` : 'Free'}</em>
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                )}
                <div className="prog-reward-claims">
                    <button
                        type="button"
                        className="prog-claim-btn"
                        onClick={handleDailyClaim}
                        disabled={!rewards.canClaimDaily}
                    >
                        <span>Daily reward</span>
                        <strong>{rewards.canClaimDaily ? `+GC ${DAILY_CLAIM_CREDITS}` : 'Claimed'}</strong>
                    </button>
                    <button
                        type="button"
                        className="prog-claim-btn"
                        onClick={handleLevelClaim}
                        disabled={pendingLevels.count === 0}
                    >
                        <span>Level rewards{pendingLevels.count ? ` (${pendingLevels.count})` : ''}</span>
                        <strong>{pendingLevels.count ? `+GC ${pendingLevels.total.toLocaleString()}` : 'Up to date'}</strong>
                    </button>
                </div>
                <div className="prog-progress-pack">
                    <button
                        type="button"
                        className="prog-claim-btn prog-progress-pack-btn"
                        onClick={handleProgressPack}
                    >
                        <span>Progress pack{rewards.progressPacks ? ` ×${rewards.progressPacks}` : ''}</span>
                        <strong>+GC {PROGRESS_PACK_CREDITS.toLocaleString()}</strong>
                    </button>
                    <p className="prog-rewards-hint">Opt-in top-up to climb the stakes. Free play stays the default — take it only when you want to progress.</p>
                </div>
            </section>

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

            <section className="prog-section prog-challenge">
                <header><Zap size={13} /> Daily challenge</header>
                {(() => {
                    const c = missions.challenge
                    const ChalIcon = ICONS[c.icon] || Zap
                    return (
                        <div className={`prog-challenge-card ${c.complete ? 'is-complete' : ''} ${c.claimed ? 'is-claimed' : ''}`}>
                            <span className="prog-ach-icon"><ChalIcon size={16} /></span>
                            <div className="prog-ach-body">
                                <strong>{c.name}</strong>
                                <span>{c.detail}</span>
                                <div className="prog-ach-bar" aria-hidden><i style={{ width: `${c.ratio * 100}%` }} /></div>
                            </div>
                            {c.claimable ? (
                                <button type="button" className="prog-challenge-claim" onClick={handleChallengeClaim}>
                                    Claim +GC {c.reward.credits}
                                </button>
                            ) : (
                                <em>{c.claimed ? 'Claimed' : c.complete ? 'Ready' : `${formatMissionValue(c.progress)}/${c.target}`}</em>
                            )}
                        </div>
                    )
                })()}
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
