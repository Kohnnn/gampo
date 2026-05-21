// Crash canvas chart with rocket / exhaust / explosion overlays.
// Ported from example/stake-originals-clone CrashGame/GameChart.jsx but
// trimmed to GamPo's needs: no antd chrome, no countdown text, accepts a
// `phase` of 'idle' | 'running' | 'crashed' | 'cashed', plus the live
// `multiplier` and `elapsedTime`. When phase==='idle' it loops a low-opacity
// "ghost" preview curve so the screen is never empty.

import { useEffect, useMemo, useRef } from 'react'

const ROCKET_SRC    = '/images/spaceship.png'
const EXHAUST_SRC   = '/images/exhaust/exhaust02_preview.gif'
const EXPLOSION_SRC = '/images/explosions/normal_explosion.gif'

export default function CrashChart({ phase, multiplier, elapsedTime }) {
    const canvasRef = useRef(null)
    const rocketRef = useRef(null)
    const exhaustRef = useRef(null)
    const explosionRef = useRef(null)
    const sizeRef = useRef({ width: 0, height: 0, dpr: 1 })
    const ghostTickRef = useRef({ raf: 0, t: 0 })

    const maxTime = useMemo(() => Math.max(elapsedTime + 2, 8), [elapsedTime])
    const maxMult = useMemo(() => Math.max(multiplier * 1.3, 2), [multiplier])

    // DPI-aware resize
    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const observer = new ResizeObserver(entries => {
            for (const entry of entries) {
                const dpr = window.devicePixelRatio || 1
                const { width, height } = entry.contentRect
                canvas.width = Math.max(1, Math.round(width * dpr))
                canvas.height = Math.max(1, Math.round(height * dpr))
                sizeRef.current = { width, height, dpr }
            }
        })
        observer.observe(canvas)
        const r = canvas.getBoundingClientRect()
        const dpr = window.devicePixelRatio || 1
        canvas.width = Math.max(1, Math.round(r.width * dpr))
        canvas.height = Math.max(1, Math.round(r.height * dpr))
        sizeRef.current = { width: r.width, height: r.height, dpr }
        return () => observer.disconnect()
    }, [])

    // Idle loop: animate a faint ghost curve so the canvas isn't blank.
    useEffect(() => {
        if (phase !== 'idle') {
            cancelAnimationFrame(ghostTickRef.current.raf)
            ghostTickRef.current.raf = 0
            return
        }
        const start = performance.now()
        const step = () => {
            const t = ((performance.now() - start) / 1000) % 6
            ghostTickRef.current.t = t
            drawCanvas({
                canvas: canvasRef.current,
                size: sizeRef.current,
                phase: 'idle',
                multiplier: Math.pow(Math.E, 0.1 * t),
                elapsedTime: t,
                maxTime: 8,
                maxMult: 4,
            })
            ghostTickRef.current.raf = requestAnimationFrame(step)
        }
        ghostTickRef.current.raf = requestAnimationFrame(step)
        return () => cancelAnimationFrame(ghostTickRef.current.raf)
    }, [phase])

    // Active draw on multiplier change.
    useEffect(() => {
        if (phase === 'idle') return
        drawCanvas({
            canvas: canvasRef.current,
            size: sizeRef.current,
            phase, multiplier, elapsedTime, maxTime, maxMult,
            rocketRef, exhaustRef, explosionRef,
        })
    }, [phase, multiplier, elapsedTime, maxTime, maxMult])

    return (
        <div className="crash-chart-wrap">
            <canvas ref={canvasRef} className="crash-canvas" />
            <img ref={rocketRef}    src={ROCKET_SRC}    alt="" className="crash-rocket"    />
            <img ref={exhaustRef}   src={EXHAUST_SRC}   alt="" className="crash-exhaust"   />
            <img ref={explosionRef} src={EXPLOSION_SRC} alt="" className="crash-explosion" />
        </div>
    )
}

function drawCanvas({ canvas, size, phase, multiplier, elapsedTime, maxTime, maxMult, rocketRef, exhaustRef, explosionRef }) {
    if (!canvas) return
    const { width, height, dpr } = size
    if (!width || !height) return
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    const padding = { left: 50, right: 24, top: 36, bottom: 40 }
    const chartW = width - padding.left - padding.right
    const chartH = height - padding.top - padding.bottom

    const timeToX = t => padding.left + (t / maxTime) * chartW
    const multToY = m => height - padding.bottom - ((m - 1) / (maxMult - 1)) * chartH

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 6])
    ctx.beginPath()
    for (let i = 0; i <= 5; i++) {
        const y = padding.top + (chartH * i) / 5
        ctx.moveTo(padding.left, y)
        ctx.lineTo(width - padding.right, y)
    }
    for (let i = 0; i <= 4; i++) {
        const x = padding.left + (chartW * i) / 4
        ctx.moveTo(x, padding.top)
        ctx.lineTo(x, height - padding.bottom)
    }
    ctx.stroke()
    ctx.setLineDash([])

    // Axis labels
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.font = '11px system-ui, sans-serif'
    ctx.textAlign = 'right'
    for (let i = 0; i <= 5; i++) {
        const v = 1 + ((maxMult - 1) * (5 - i)) / 5
        ctx.fillText(`${v.toFixed(1)}×`, padding.left - 6, padding.top + (chartH * i) / 5 + 4)
    }
    ctx.textAlign = 'center'
    const xStep = Math.max(1, Math.ceil(maxTime / 4))
    for (let s = xStep; s <= Math.ceil(maxTime); s += xStep) {
        ctx.fillText(`${s}s`, timeToX(s), height - padding.bottom + 16)
    }

    // Curve
    if (elapsedTime <= 0) return
    const numPoints = Math.min(180, Math.max(40, Math.floor(elapsedTime * 22)))
    const pts = new Array(numPoints + 1)
    for (let i = 0; i <= numPoints; i++) {
        const t = (elapsedTime * i) / numPoints
        const m = Math.pow(Math.E, 0.1 * t)
        pts[i] = { x: timeToX(t), y: Math.max(padding.top, multToY(m)) }
    }

    const isIdle    = phase === 'idle'
    const isCrashed = phase === 'crashed'
    const main      = isCrashed ? '#ed4245' : '#f7931a'
    const glow      = isCrashed ? 'rgba(237,66,69,0.18)' : 'rgba(247,147,26,0.18)'

    // Fill under curve
    const fillGrad = ctx.createLinearGradient(padding.left, height - padding.bottom, pts[numPoints].x, pts[numPoints].y)
    if (isCrashed) {
        fillGrad.addColorStop(0, 'rgba(237,66,69,0.02)')
        fillGrad.addColorStop(0.5, 'rgba(237,66,69,0.22)')
        fillGrad.addColorStop(1, 'rgba(237,66,69,0.5)')
    } else {
        fillGrad.addColorStop(0, 'rgba(255,165,0,0.02)')
        fillGrad.addColorStop(0.6, 'rgba(255,180,50,0.32)')
        fillGrad.addColorStop(1, 'rgba(255,200,80,0.55)')
    }
    ctx.beginPath()
    ctx.moveTo(padding.left, height - padding.bottom)
    for (const p of pts) ctx.lineTo(p.x, p.y)
    ctx.lineTo(pts[numPoints].x, height - padding.bottom)
    ctx.closePath()
    ctx.globalAlpha = isIdle ? 0.35 : 1
    ctx.fillStyle = fillGrad
    ctx.fill()

    // Glow stroke
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i <= numPoints; i++) ctx.lineTo(pts[i].x, pts[i].y)
    ctx.strokeStyle = glow
    ctx.lineWidth = 12
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.shadowColor = main
    ctx.shadowBlur = 10
    ctx.stroke()

    // Main stroke
    ctx.shadowBlur = 0
    const lineGrad = ctx.createLinearGradient(padding.left, 0, pts[numPoints].x, 0)
    if (isCrashed) {
        lineGrad.addColorStop(0, '#f7931a')
        lineGrad.addColorStop(0.7, '#ed4245')
        lineGrad.addColorStop(1, '#ed4245')
    } else {
        lineGrad.addColorStop(0, '#f7931a')
        lineGrad.addColorStop(0.5, '#ffaa33')
        lineGrad.addColorStop(0.8, '#ffcc66')
        lineGrad.addColorStop(1, '#ffffff')
    }
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i <= numPoints; i++) ctx.lineTo(pts[i].x, pts[i].y)
    ctx.strokeStyle = lineGrad
    ctx.lineWidth = isIdle ? 2 : 4
    ctx.stroke()
    ctx.globalAlpha = 1

    if (isIdle) return

    // Endpoint angle
    let angle = 0
    if (numPoints >= 2) {
        const a = pts[Math.max(0, numPoints - 10)]
        const b = pts[numPoints]
        angle = Math.atan2(b.y - a.y, b.x - a.x)
    }
    const endX = pts[numPoints].x
    const endY = pts[numPoints].y

    // Position rocket / exhaust / explosion
    if (rocketRef?.current) {
        if (phase === 'running') {
            rocketRef.current.style.display = 'block'
            rocketRef.current.style.left = `${endX}px`
            rocketRef.current.style.top  = `${endY}px`
            rocketRef.current.style.transform = `translate(-50%, -50%) rotate(${angle}rad) rotate(90deg)`
        } else {
            rocketRef.current.style.display = 'none'
        }
    }
    if (exhaustRef?.current) {
        if (phase === 'running') {
            exhaustRef.current.style.display = 'block'
            exhaustRef.current.style.left = `${endX}px`
            exhaustRef.current.style.top  = `${endY}px`
            exhaustRef.current.style.transform = `translate(-50%, -50%) rotate(${angle}rad) rotate(90deg) translate(0px, 80px)`
        } else {
            exhaustRef.current.style.display = 'none'
        }
    }
    if (explosionRef?.current) {
        if (phase === 'crashed') {
            explosionRef.current.style.display = 'block'
            explosionRef.current.style.left = `${endX}px`
            explosionRef.current.style.top  = `${endY}px`
        } else {
            explosionRef.current.style.display = 'none'
        }
    }
}
