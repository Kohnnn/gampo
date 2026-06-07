// AchievementToast — auto-dismissing toast for unlocks (Wave 19).
//
// Wires into useProgress.recentUnlock. When the hook reports a new unlock the
// toast slides in from the top-right; user can click to dismiss or it
// auto-dismisses after ~5 seconds. Reduced-motion compatible.

import { useEffect } from 'react'
import { Award, Compass, Flame, Gift, Play, Sparkles, Trophy, Coins } from 'lucide-react'
import { useProgress } from '../hooks/useProgress'
import { useXp } from '../hooks/useXp'
import './AchievementToast.css'

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

const AUTO_DISMISS_MS = 5200

export default function AchievementToast() {
    const { recentUnlock, dismissUnlock } = useProgress()
    const { recentLevelUp, dismissLevelUp } = useXp()

    useEffect(() => {
        if (!recentUnlock) return undefined
        const id = window.setTimeout(() => dismissUnlock(), AUTO_DISMISS_MS)
        return () => window.clearTimeout(id)
    }, [recentUnlock, dismissUnlock])

    useEffect(() => {
        if (!recentLevelUp) return undefined
        const id = window.setTimeout(() => dismissLevelUp(), AUTO_DISMISS_MS)
        return () => window.clearTimeout(id)
    }, [recentLevelUp, dismissLevelUp])

    // Level-up toast takes priority (it's the rarer, more rewarding event).
    if (recentLevelUp) {
        const RankIcon = ICONS[recentLevelUp.rank?.icon] || Award
        return (
            <button
                type="button"
                className="ach-toast ach-toast-levelup"
                onClick={dismissLevelUp}
                aria-label={`Level up: reached level ${recentLevelUp.level}`}
                style={{ '--rank-accent': recentLevelUp.rank?.accent || '#ffd166' }}
                data-ux-surface="toast"
            >
                <span className="ach-toast-icon"><RankIcon size={20} /></span>
                <span className="ach-toast-body">
                    <small>{recentLevelUp.rankUp ? 'New rank reached' : 'Level up'}</small>
                    <strong>Level {recentLevelUp.level} · {recentLevelUp.rank?.label}</strong>
                    <em>{recentLevelUp.rankUp ? `You are now a ${recentLevelUp.rank?.label}.` : 'Keep playing to climb the ranks.'}</em>
                </span>
                <span className="ach-toast-bar" aria-hidden>
                    <i />
                </span>
            </button>
        )
    }

    if (!recentUnlock) return null

    const Icon = ICONS[recentUnlock.icon] || Award
    const tierClass = `ach-toast-${recentUnlock.tier || 'bronze'}`

    return (
        <button
            type="button"
            className={`ach-toast ${tierClass}`}
            onClick={dismissUnlock}
            aria-label={`Achievement unlocked: ${recentUnlock.name}`}
            data-ux-surface="toast"
        >
            <span className="ach-toast-icon"><Icon size={20} /></span>
            <span className="ach-toast-body">
                <small>Achievement unlocked</small>
                <strong>{recentUnlock.name}</strong>
                <em>{recentUnlock.detail}</em>
            </span>
            <span className="ach-toast-bar" aria-hidden>
                <i />
            </span>
        </button>
    )
}
