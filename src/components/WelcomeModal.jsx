// WelcomeModal — one-time first-visit educational intro. Frames GamPo as a
// math simulator: practice credits, real casino odds, negative EV by design,
// no real money and no cashout. Accessible: role=dialog, Escape closes,
// focus moves in on mount and restores on close, backdrop click dismisses.

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { GraduationCap, Dice5, TrendingDown, ShieldCheck, X } from 'lucide-react'
import { useOnboarding } from '../hooks/useOnboarding'
import './WelcomeModal.css'

const POINTS = [
    { icon: <Dice5 size={18} />, title: 'Real casino odds', text: 'Every game uses the same math a real casino runs — true RTP, true house edge.' },
    { icon: <TrendingDown size={18} />, title: 'The house edge is the lesson', text: 'You will lose over time on purpose. Watch how variance and the edge actually behave.' },
    { icon: <ShieldCheck size={18} />, title: 'Practice credits only', text: 'No real money, no deposits, no cashout. Reset or top up anytime — it is a sandbox.' },
]

export default function WelcomeModal() {
    const { seen, completeOnboarding } = useOnboarding()
    const dialogRef = useRef(null)
    const lastFocusRef = useRef(null)

    useEffect(() => {
        if (seen) return undefined
        lastFocusRef.current = document.activeElement
        const dialog = dialogRef.current
        const focusables = () => Array.from(
            dialog?.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])') || [],
        ).filter(el => !el.disabled && el.offsetParent !== null)
        const first = focusables()[0]
        if (first) first.focus()

        const onKey = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); completeOnboarding(); return }
            if (e.key !== 'Tab') return
            const items = focusables()
            if (items.length === 0) return
            const firstEl = items[0]
            const lastEl = items[items.length - 1]
            if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus() }
            else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus() }
        }
        document.addEventListener('keydown', onKey, true)
        return () => {
            document.removeEventListener('keydown', onKey, true)
            const last = lastFocusRef.current
            if (last && typeof last.focus === 'function') last.focus()
        }
    }, [seen, completeOnboarding])

    if (seen) return null

    const modal = (
        <div
            className="welcome-backdrop"
            onClick={completeOnboarding}
            data-ux-surface="toast"
        >
            <div
                className="welcome-card"
                role="dialog"
                aria-modal="true"
                aria-labelledby="welcome-title"
                ref={dialogRef}
                onClick={e => e.stopPropagation()}
            >
                <button
                    type="button"
                    className="welcome-close"
                    aria-label="Close welcome"
                    onClick={completeOnboarding}
                >
                    <X size={16} />
                </button>
                <span className="welcome-kicker"><GraduationCap size={16} /> Welcome to GamPo</span>
                <h2 id="welcome-title">A casino that teaches you the math</h2>
                <p className="welcome-lead">
                    GamPo is an educational simulator. It looks like a casino, plays like a casino,
                    and runs the same odds — so you can learn how they really work, risk-free.
                </p>
                <ul className="welcome-points">
                    {POINTS.map(p => (
                        <li key={p.title}>
                            <span className="welcome-point-icon">{p.icon}</span>
                            <div>
                                <strong>{p.title}</strong>
                                <span>{p.text}</span>
                            </div>
                        </li>
                    ))}
                </ul>
                <button
                    type="button"
                    className="welcome-cta"
                    onClick={completeOnboarding}
                    data-ux-primary-action
                >
                    Start exploring
                </button>
                <p className="welcome-fineprint">You can replay this intro anytime from Settings.</p>
            </div>
        </div>
    )

    return typeof document === 'undefined' ? modal : createPortal(modal, document.body)
}
