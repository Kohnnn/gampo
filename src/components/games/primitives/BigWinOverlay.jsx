// Big win celebration overlay. Renders a fullscreen flash with the multiplier
// and a halo of particles when the user wins big (multiplier >= threshold).
// ESC key dismisses early.
//
// Wave 13 polish: tier-driven 3-stage cinematic — ramp-up counter, particle
// burst, sustained glow with subtle pulse — and stronger MEGA/HUGE styling
// so the screen genuinely celebrates the win.

import { useEffect, useState, useRef } from 'react'
import { formatCredits } from '../../../utils/simulationMath'

const RAMP_DURATION_MS = 900
const HOLD_DURATION_MS = 1800

function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3)
}

export default function BigWinOverlay({ profit, multiplier, trigger, threshold = 5 }) {
    const [visible, setVisible] = useState(false)
    const [data, setData] = useState({ profit: 0, multiplier: 0 })
    const [shownMult, setShownMult] = useState(0)
    const rampRef = useRef(null)

    useEffect(() => {
        if (!trigger) return
        if ((multiplier && multiplier >= threshold) || (profit && multiplier >= threshold)) {
            setData({ profit, multiplier })
            setVisible(true)
            setShownMult(0)
            const start = performance.now()
            const tick = () => {
                const elapsed = performance.now() - start
                const t = Math.min(1, elapsed / RAMP_DURATION_MS)
                setShownMult(easeOutCubic(t) * multiplier)
                if (t < 1) rampRef.current = window.requestAnimationFrame(tick)
            }
            rampRef.current = window.requestAnimationFrame(tick)
            const dismiss = window.setTimeout(() => setVisible(false), RAMP_DURATION_MS + HOLD_DURATION_MS)
            return () => {
                window.clearTimeout(dismiss)
                if (rampRef.current) window.cancelAnimationFrame(rampRef.current)
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [trigger])

    useEffect(() => {
        if (!visible) return
        const onKey = (e) => {
            if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') setVisible(false)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [visible])

    useEffect(() => {
        if (!visible) return
        const main = document.querySelector('.gs-playfield')
        if (!main) return
        main.classList.add('screen-shake')
        const t = window.setTimeout(() => main.classList.remove('screen-shake'), 500)
        return () => {
            main.classList.remove('screen-shake')
            window.clearTimeout(t)
        }
    }, [visible])

    if (!visible) return null

    const tier = data.multiplier >= 50 ? 'mega' : data.multiplier >= 15 ? 'huge' : 'big'
    const particleCount = tier === 'mega' ? 48 : tier === 'huge' ? 32 : 24

    return (
        <div className={`bigwin-overlay tier-${tier}`} aria-live="polite" onClick={() => setVisible(false)}>
            <div className="bigwin-rays" />
            <div className="bigwin-shockwave" />
            <div className="bigwin-content">
                <span className="bigwin-tag">
                    {tier === 'mega' ? 'MEGA WIN' : tier === 'huge' ? 'HUGE WIN' : 'BIG WIN'}
                </span>
                <strong className="bigwin-mult">{shownMult.toFixed(2)}×</strong>
                <span className="bigwin-profit">+{formatCredits(data.profit)}</span>
                <small className="bigwin-dismiss">tap or press ESC to dismiss</small>
            </div>
            <div className="bigwin-particles">
                {Array.from({ length: particleCount }, (_, i) => {
                    const angle = (i / particleCount) * Math.PI * 2
                    const radius = 280 + (i % 3) * 60
                    const dx = `${Math.cos(angle) * radius}px`
                    const dy = `${Math.sin(angle) * radius}px`
                    const delay = `${(i % 6) * 35}ms`
                    return <span key={i} style={{ '--dx': dx, '--dy': dy, animationDelay: delay }} />
                })}
            </div>
            {tier !== 'big' && (
                <div className="bigwin-coins">
                    {Array.from({ length: tier === 'mega' ? 18 : 10 }, (_, i) => (
                        <i
                            key={i}
                            style={{
                                left: `${10 + (i * 73) % 80}%`,
                                animationDelay: `${100 + i * 70}ms`,
                                animationDuration: `${1100 + (i % 5) * 110}ms`,
                            }}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}
