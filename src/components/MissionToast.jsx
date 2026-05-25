// MissionToast — Wave 25 toast for mission completions.
// Lives next to AchievementToast in Layout. Tier-styled, auto-dismisses.

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Award, Coins, Compass, Flame, Play, Sparkles, Trophy } from 'lucide-react'
import { useMissions } from '../hooks/useMissions'
import './MissionToast.css'

const ICONS = {
    play: Play,
    trophy: Trophy,
    sparkles: Sparkles,
    compass: Compass,
    coins: Coins,
    flame: Flame,
    award: Award,
}

const AUTO_DISMISS_MS = 5800

export default function MissionToast() {
    const { recentComplete, dismiss } = useMissions()
    const navigate = useNavigate()

    useEffect(() => {
        if (!recentComplete) return undefined
        const id = window.setTimeout(() => dismiss(), AUTO_DISMISS_MS)
        return () => window.clearTimeout(id)
    }, [recentComplete, dismiss])

    if (!recentComplete) return null
    const Icon = ICONS[recentComplete.icon] || Award
    const periodClass = `mission-toast-${recentComplete.period || 'daily'}`

    const onClick = () => {
        dismiss()
        navigate('/missions')
    }

    return (
        <button
            type="button"
            className={`mission-toast ${periodClass}`}
            onClick={onClick}
            aria-label={`Mission complete: ${recentComplete.name}`}
        >
            <span className="mission-toast-icon"><Icon size={20} /></span>
            <span className="mission-toast-body">
                <small>{recentComplete.period} mission complete</small>
                <strong>{recentComplete.name}</strong>
                <em>+{recentComplete.reward?.credits || 0} credits ready to claim</em>
            </span>
            <span className="mission-toast-bar" aria-hidden><i /></span>
        </button>
    )
}
