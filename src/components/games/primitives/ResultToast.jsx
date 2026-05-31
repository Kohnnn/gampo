// Result toast for round outcomes. Used by every game so the result
// language and animation timing stays consistent: 180ms in, 1.2-2.0s hold,
// 180ms out per the implementation guide section 7.

import { useEffect, useState } from 'react'
import { formatCredits } from '../../../utils/simulationMath'

export default function ResultToast({
    result, // { kind: 'win'|'lose'|'push'|'cashout', amount?, multiplier?, message? } | null
    holdMs = 1500,
    onDismiss,
}) {
    const [visible, setVisible] = useState(false)
    const [latched, setLatched] = useState(null)

    useEffect(() => {
        if (!result) return
        setLatched(result)
        setVisible(true)
        const t = setTimeout(() => setVisible(false), holdMs)
        return () => clearTimeout(t)
    }, [result, holdMs])

    useEffect(() => {
        if (visible) return
        if (!latched) return
        const t = setTimeout(() => {
            setLatched(null)
            if (onDismiss) onDismiss()
        }, 220)
        return () => clearTimeout(t)
    }, [visible, latched, onDismiss])

    if (!latched) return null

    const kind = latched.kind || 'win'
    return (
        <div className={`rt-toast rt-${kind} ${visible ? 'in' : 'out'}`} role="status">
            <div className="rt-row">
                {latched.message ? <span className="rt-msg">{latched.message}</span> : <span className="rt-msg">{defaultMessage(kind)}</span>}
                {Number.isFinite(latched.multiplier) ? <strong className="rt-mult">{formatMult(latched.multiplier)}x</strong> : null}
            </div>
            {Number.isFinite(latched.amount) ? (
                <div className="rt-amount">
                    {latched.amount > 0 ? '+' : latched.amount < 0 ? '-' : ''}
                    {formatCredits(Math.abs(latched.amount))}
                </div>
            ) : null}
        </div>
    )
}

function formatMult(v) {
    if (v >= 100) return v.toFixed(0)
    if (v >= 10) return v.toFixed(2)
    return v.toFixed(2)
}

function defaultMessage(kind) {
    if (kind === 'win') return 'Win'
    if (kind === 'cashout') return 'Cashed Out'
    if (kind === 'push') return 'Push'
    return 'Bust'
}
