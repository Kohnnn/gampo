// SessionGuardBanner — surfaces the responsible-play guard status as a small
// fixed banner. Informational and dismissible; nothing is ever blocked. Only
// shows when limits are enabled (or a tilt pattern appears) and the level is
// warn/exceeded. Educational framing, practice credits only.

import { useEffect, useState } from 'react'
import { ShieldAlert, X } from 'lucide-react'
import { useSessionGuard } from '../hooks/useSessionGuard'
import './SessionGuardBanner.css'

export default function SessionGuardBanner() {
    const { status } = useSessionGuard()
    const [dismissedKey, setDismissedKey] = useState(null)

    // A stable signature for the current alert so re-dismissing only happens
    // when the situation escalates (level or reason set changes).
    const signature = `${status.level}:${status.reasons.join('|')}`
    const active = status.level === 'warn' || status.level === 'exceeded'

    useEffect(() => {
        // Auto-clear the dismissal when things return to ok so a fresh breach
        // re-surfaces the banner.
        if (!active && dismissedKey) setDismissedKey(null)
    }, [active, dismissedKey])

    if (!active || dismissedKey === signature) return null

    const heading = status.level === 'exceeded' ? 'Session limit reached' : 'Heads up'

    return (
        <div className={`guard-banner guard-${status.level}`} role="status" data-ux-surface="toast">
            <span className="guard-icon"><ShieldAlert size={16} /></span>
            <div className="guard-body">
                <strong>{heading}</strong>
                <span>
                    {status.reasons[0]
                        ? capitalise(status.reasons[0])
                        : 'You set a play limit for this session.'}
                    {status.reasons.length > 1 ? ` · +${status.reasons.length - 1} more` : ''}
                </span>
                <small>Practice credits only — this is a learning nudge, nothing is blocked.</small>
            </div>
            <button
                type="button"
                className="guard-dismiss"
                aria-label="Dismiss session reminder"
                onClick={() => setDismissedKey(signature)}
            >
                <X size={15} />
            </button>
        </div>
    )
}

function capitalise(s) {
    return typeof s === 'string' && s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s
}
