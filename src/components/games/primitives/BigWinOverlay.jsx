// Big win celebration overlay. Renders a fullscreen flash with the multiplier
// and a halo of particles when the user wins big (multiplier >= threshold).

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

    if (!visible) return null

    const tier = data.multiplier >= 50 ? 'mega' : data.multiplier >= 15 ? 'huge' : 'big'

    return (
        <div className={`bigwin-overlay tier-${tier}`} aria-live="polite">
            <div className="bigwin-rays" />
            <div className="bigwin-content">
                <span className="bigwin-tag">
                    {tier === 'mega' ? 'MEGA WIN' : tier === 'huge' ? 'HUGE WIN' : 'BIG WIN'}
                </span>
                <strong className="bigwin-mult">{data.multiplier.toFixed(2)}×</strong>
                <span className="bigwin-profit">+{formatCredits(data.profit)}</span>
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
