import { useEffect, useRef, useState } from 'react'
import './fx.css'

export function NumberRoll({ value, format = (v) => v, className = '' }) {
    const [bump, setBump] = useState(false)
    const prev = useRef(value)
    useEffect(() => {
        if (prev.current !== value) {
            setBump(true)
            prev.current = value
            const t = window.setTimeout(() => setBump(false), 360)
            return () => window.clearTimeout(t)
        }
    }, [value])
    return <span className={`fx-number-roll ${bump ? 'bumping' : ''} ${className}`}>{format(value)}</span>
}

export function Pop({ children, keyValue }) {
    return <span key={keyValue} className="fx-pop">{children}</span>
}

export function Pulse({ children, className = '' }) {
    return <span className={`fx-pulse ${className}`}>{children}</span>
}

export function Particles({ count = 12, color = '#00e701' }) {
    const items = Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2
        const dx = `${Math.cos(angle) * 90}px`
        const dy = `${Math.sin(angle) * 90 - 30}px`
        return <span key={i} style={{ '--dx': dx, '--dy': dy, color, left: '50%', top: '50%' }} />
    })
    return <div className="fx-particles" style={{ color }}>{items}</div>
}

export function RippleButton({ children, className = '', ...rest }) {
    return <button className={`fx-ripple ${className}`} {...rest}>{children}</button>
}

export function useReduceMotion() {
    const [reduce, setReduce] = useState(() => {
        try { return localStorage.getItem('gampo_reduce_motion') === '1' } catch { return false }
    })
    useEffect(() => {
        try { localStorage.setItem('gampo_reduce_motion', reduce ? '1' : '0') } catch { /* ignore */ }
        document.documentElement.classList.toggle('gampo-reduce-motion', reduce)
    }, [reduce])
    return [reduce, setReduce]
}
