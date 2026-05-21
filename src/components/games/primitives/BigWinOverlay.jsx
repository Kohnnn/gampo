// Big win celebration overlay. Renders a fullscreen flash with the multiplier
// and a halo of particles when the user wins big (multiplier >= threshold).
// ESC key dismisses early.

import { useEffect, useState } from 'react'
import { formatCredits } from '../../../utils/simulationMath'

export default function BigWinOverlay({ profit, multiplier, trigger, threshold = 5 }) {
    const [visible, setVisible] = useState(false)
    const [data, setData] = useState({ profit: 0, multiplier: 0 })

    useEffect(() => {
        if (!trigger) return
        if ((multiplier && multiplier >= threshold) || (profit && multiplier >= threshold)) {
            setData({ profit, multiplier })
            setVisible(true)
            const t = window.setTimeout(() => setVisible(false), 2400)
            return () => window.clearTimeout(t)
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

    return (
        <div className={`bigwin-overlay tier-${tier}`} aria-live="polite" onClick={() => setVisible(false)}>
            <div className="bigwin-rays" />
            <div className="bigwin-content">
                <span className="bigwin-tag">
                    {tier === 'mega' ? 'MEGA WIN' : tier === 'huge' ? 'HUGE WIN' : 'BIG WIN'}
                </span>
                <strong className="bigwin-mult">{data.multiplier.toFixed(2)}×</strong>
                <span className="bigwin-profit">+{formatCredits(data.profit)}</span>
                <small className="bigwin-dismiss">tap or press ESC to dismiss</small>
            </div>
            <div className="bigwin-particles">
                {Array.from({ length: 24 }, (_, i) => {
                    const angle = (i / 24) * Math.PI * 2
                    const dx = `${Math.cos(angle) * 320}px`
                    const dy = `${Math.sin(angle) * 320}px`
                    const delay = `${(i % 4) * 40}ms`
                    return <span key={i} style={{ '--dx': dx, '--dy': dy, animationDelay: delay }} />
                })}
            </div>
        </div>
    )
}
