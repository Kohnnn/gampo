// StatsPanel — Live PnL widget rendered inside the ChatDock as the third tab
// alongside Chat and Race. Mirrors the example/stake-originals-clone Live
// Stats widget (profit-box + Chart.js profit history line) but uses our
// useGlobalPnl hook so it stays in sync across every game route.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useGlobalPnl } from '../hooks/useGlobalPnl'
import { formatCredits } from '../utils/simulationMath'
import { findGameDefinition } from '../data/gameDefinitions'

const SCOPES = [
    { id: 'session', label: 'Session', help: 'Since this tab opened' },
    { id: 'game',    label: 'Game',    help: 'Most recent game' },
    { id: 'alltime', label: 'All-time', help: 'Persisted in this browser' },
]

const WIN_COLOR  = 'rgba(74, 222, 128, 0.95)'
const LOSS_COLOR = 'rgba(248, 113, 113, 0.95)'

export default function StatsPanel() {
    const { summary, history, currentGameId, reset } = useGlobalPnl()
    const [scope, setScope] = useState('session')
    const canvasRef = useRef(null)
    const chartRef  = useRef(null)
    const [hover, setHover] = useState(null)

    const data = summary[scope]
    const entries = history[scope]

    // Cumulative profit history starting from 0 — same shape as the example.
    const profitHistory = useMemo(() => {
        const out = [0]
        let running = 0
        for (const entry of entries) {
            running += entry.profit
            out.push(running)
        }
        return out
    }, [entries])

    useEffect(() => {
        let cancelled = false
        const canvas = canvasRef.current
        if (!canvas) return undefined
        // Lazy-load Chart.js so it doesn't bloat the layout shell entry chunk.
        import('chart.js/auto').then(({ default: Chart }) => {
            if (cancelled || !canvas) return
            if (chartRef.current) {
                chartRef.current.data.labels = profitHistory.map((_, i) => i)
                chartRef.current.data.datasets[0].data = profitHistory
                chartRef.current.update()
                return
            }
            chartRef.current = new Chart(canvas, {
                type: 'line',
                data: {
                    labels: profitHistory.map((_, i) => i),
                    datasets: [
                        {
                            data: profitHistory,
                            fill: {
                                target: 'origin',
                                above: 'rgba(74, 222, 128, 0.18)',
                                below: 'rgba(248, 113, 113, 0.18)',
                            },
                            cubicInterpolationMode: 'monotone',
                            segment: {
                                borderColor: (ctx) => {
                                    if (!ctx.p0 || !ctx.p1) return WIN_COLOR
                                    const y0 = ctx.p0.parsed.y
                                    const y1 = ctx.p1.parsed.y
                                    if (y1 === 0) return y0 < 0 ? LOSS_COLOR : WIN_COLOR
                                    return y1 < 0 ? LOSS_COLOR : WIN_COLOR
                                },
                            },
                            pointRadius: 0,
                            pointHoverRadius: 4,
                            pointHoverBackgroundColor: '#fff',
                            pointHoverBorderColor: '#fff',
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 260, easing: 'easeOutQuart' },
                    animations: {
                        x: { duration: 260, easing: 'easeOutQuart' },
                        y: { duration: 220, easing: 'easeOutQuart' },
                    },
                    interaction: { intersect: false, mode: 'index' },
                    plugins: { legend: { display: false }, tooltip: { enabled: false } },
                    scales: {
                        x: { display: false },
                        y: { display: false, grace: '5%' },
                    },
                    onHover: (_, els) => {
                        if (!els.length) { setHover(null); return }
                        const idx = els[0].index
                        setHover(profitHistory[idx])
                    },
                },
            })
        })
        return () => { cancelled = true }
    }, [profitHistory])

    useEffect(() => () => {
        if (chartRef.current) {
            chartRef.current.destroy()
            chartRef.current = null
        }
    }, [])

    const definition = currentGameId ? findGameDefinition(currentGameId) : null

    return (
        <div className="stats-panel">
            <div className="stats-scope-tabs" role="tablist" aria-label="PnL scope">
                {SCOPES.map(s => (
                    <button
                        key={s.id}
                        role="tab"
                        aria-selected={scope === s.id}
                        title={s.help}
                        className={scope === s.id ? 'active' : ''}
                        onClick={() => setScope(s.id)}
                    >
                        {s.label}
                    </button>
                ))}
            </div>

            <div className="stats-profit-box">
                <div className="stats-profit-main">
                    <span className="stats-label">Profit</span>
                    <strong
                        className="stats-profit-value"
                        style={{ color: data.profit >= 0 ? '#4ade80' : '#f87171' }}
                    >
                        {data.profit >= 0 ? '+' : ''}{formatCredits(data.profit)}
                    </strong>
                </div>
                <div className="stats-profit-divider" />
                <div className="stats-profit-stats">
                    <div className="stats-stat-row">
                        <span className="stats-label">Wins</span>
                        <strong style={{ color: '#4ade80' }}>{data.wins}</strong>
                    </div>
                    <div className="stats-stat-row">
                        <span className="stats-label">Losses</span>
                        <strong style={{ color: '#f87171' }}>{data.losses}</strong>
                    </div>
                </div>
            </div>

            <div className="stats-chart-box" onMouseLeave={() => setHover(null)}>
                <span className="stats-label">Profit History</span>
                {hover !== null && (
                    <span
                        className="stats-hover-value"
                        style={{ color: hover >= 0 ? '#4ade80' : '#f87171' }}
                    >
                        {hover >= 0 ? '+' : ''}{formatCredits(hover)}
                    </span>
                )}
                <div className="stats-canvas-wrap">
                    <canvas ref={canvasRef} />
                </div>
                {entries.length === 0 && (
                    <div className="stats-empty-overlay">
                        <span>Play a round to see your profit curve</span>
                    </div>
                )}
            </div>

            <div className="stats-meta-row">
                <div>
                    <span className="stats-label">Wagered</span>
                    <strong>{formatCredits(data.wagered)}</strong>
                </div>
                <div>
                    <span className="stats-label">Rounds</span>
                    <strong>{data.count}</strong>
                </div>
                <div>
                    <span className="stats-label">{scope === 'game' && definition ? definition.name : 'Scope'}</span>
                    <strong>{scope === 'game' ? (definition?.name || '—') : SCOPES.find(s => s.id === scope).label}</strong>
                </div>
            </div>

            <button
                type="button"
                className="stats-reset"
                onClick={() => reset(scope)}
                title={`Reset ${scope} stats`}
            >
                Reset {SCOPES.find(s => s.id === scope).label}
            </button>
        </div>
    )
}
