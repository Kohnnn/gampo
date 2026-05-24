// AchievementToast — auto-dismissing toast for unlocks (Wave 19).
//
// Wires into useProgress.recentUnlock. When the hook reports a new unlock the
// toast slides in from the top-right; user can click to dismiss or it
// auto-dismisses after ~5 seconds. Reduced-motion compatible.

import { useEffect } from 'react'
import { Award, Compass, Flame, Gift, Play, Sparkles, Trophy, Coins } from 'lucide-react'
import { useProgress } from '../hooks/useProgress'
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

    useEffect(() => {
        if (!recentUnlock) return undefined
        const id = window.setTimeout(() => dismissUnlock(), AUTO_DISMISS_MS)
        return () => window.clearTimeout(id)
    }, [recentUnlock, dismissUnlock])

    if (!recentUnlock) return null

    const Icon = ICONS[recentUnlock.icon] || Award
    const tierClass = `ach-toast-${recentUnlock.tier || 'bronze'}`

    return (
        <button
            type="button"
            className={`ach-toast ${tierClass}`}
            onClick={dismissUnlock}
            aria-label={`Achievement unlocked: ${recentUnlock.name}`}
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
