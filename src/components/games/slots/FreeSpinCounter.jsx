// FreeSpinCounter — persistent HUD overlay during a free-spin session.
//
// Shows a circular ring fill that drains linearly from 100% to 0% across the
// awarded count, plus a numeric label "X free spins remaining" and a "FINAL"
// flag on the last spin. Final-spin completion flashes the chip gold and
// dispatches a `onComplete` callback (used by the parent to fire a bonus
// stinger).
//
// Reduced-motion: no ring animation; static percentage label only.

import { useEffect, useMemo, useRef } from 'react'

const RING_RADIUS = 22
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

export default function FreeSpinCounter({
    totalAwarded = 0,
    remaining = 0,
    onComplete,
    className = '',
}) {
    const ringRef = useRef(null)
    const firedRef = useRef(false)

    const safeTotal = Math.max(1, totalAwarded)
    const safeRemaining = Math.max(0, Math.min(remaining, safeTotal))
    const ratio = safeRemaining / safeTotal
    const dashOffset = useMemo(() => RING_CIRCUMFERENCE * (1 - ratio), [ratio])
    const isFinal = safeRemaining === 1

    useEffect(() => {
        firedRef.current = false
    }, [totalAwarded])

    useEffect(() => {
        if (!ringRef.current) return
        ringRef.current.style.strokeDasharray = `${RING_CIRCUMFERENCE}`
        ringRef.current.style.strokeDashoffset = `${dashOffset}`
    }, [dashOffset])

    useEffect(() => {
        if (isFinal && !firedRef.current && onComplete) {
            firedRef.current = true
            onComplete()
        }
    }, [isFinal, onComplete])

    if (!totalAwarded || totalAwarded <= 0) return null

    const percentLabel = `${Math.round(ratio * 100)}%`

    return (
        <div
            className={`slot-free-spin-counter ${isFinal ? 'is-final' : ''} ${className}`.trim()}
            role="status"
            aria-live="polite"
            aria-label={`${safeRemaining} of ${safeTotal} free spins remaining`}
            data-ux-surface="controls"
        >
            <svg
                className="slot-free-spin-counter-ring"
                viewBox="0 0 52 52"
                aria-hidden="true"
                focusable="false"
            >
                <circle
                    className="slot-free-spin-counter-ring-track"
                    cx="26"
                    cy="26"
                    r={RING_RADIUS}
                    fill="none"
                    strokeWidth="3"
                />
                <circle
                    ref={ringRef}
                    className="slot-free-spin-counter-ring-fill"
                    cx="26"
                    cy="26"
                    r={RING_RADIUS}
                    fill="none"
                    strokeWidth="3"
                    strokeLinecap="round"
                    transform="rotate(-90 26 26)"
                />
            </svg>
            <span className="slot-free-spin-counter-value">
                <strong>{safeRemaining}</strong>
                <small>free spins</small>
            </span>
            {isFinal ? (
                <span className="slot-free-spin-counter-final-tag" aria-hidden="true">FINAL</span>
            ) : (
                <span className="slot-free-spin-counter-percent" aria-hidden="true">{percentLabel}</span>
            )}
        </div>
    )
}