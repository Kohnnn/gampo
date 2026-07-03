import { useEffect, useState } from 'react'

const SIMULATED_WINS = [
    { player: 'Rune_x', game: 'Crash', amount: 2847.50, multiplier: '8.42x' },
    { player: 'Mira_99', game: 'Plinko', amount: 1204.00, multiplier: null },
    { player: 'Juno_VIP', game: 'Slots', amount: 5620.00, multiplier: null },
    { player: 'Echo_777', game: 'Dice', amount: 890.25, multiplier: '12.3x' },
    { player: 'Nox_BTC', game: 'Limbo', amount: 3410.00, multiplier: '25.0x' },
    { player: 'PixieStar', game: 'Wheel', amount: 675.50, multiplier: null },
    { player: 'Roux_GG', game: 'Roulette', amount: 2100.00, multiplier: null },
    { player: 'Tess_Casino', game: 'Mines', amount: 1580.75, multiplier: null },
    { player: 'Kolt_Prime', game: 'Slots', amount: 4200.00, multiplier: null },
    { player: 'VanceX', game: 'Crash', amount: 990.00, multiplier: '5.5x' },
    { player: 'Uma_Best', game: 'Baccarat', amount: 3300.00, multiplier: null },
    { player: 'WrenHigh', game: 'Keno', amount: 1850.00, multiplier: null },
]

function formatWin(n) {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
    return n.toFixed(0)
}

export function LiveWinsTicker() {
    const [visible, setVisible] = useState(SIMULATED_WINS.slice(0, 6))

    useEffect(() => {
        const interval = setInterval(() => {
            setVisible(prev => {
                const last = prev[prev.length - 1]
                const idx = SIMULATED_WINS.indexOf(last)
                const next = SIMULATED_WINS[(idx + 1) % SIMULATED_WINS.length]
                return [...prev.slice(1), next]
            })
        }, 2200)
        return () => clearInterval(interval)
    }, [])

    return (
        <div className="casino-live-ticker" aria-label="Recent wins">
            <div className="casino-live-ticker-inner">
                {visible.map((win, i) => (
                    <div key={`${win.player}-${i}`} className="ticker-item">
                        <span className="ticker-dot" />
                        <span>{win.player}</span>
                        <span className="ticker-game">{win.game}</span>
                        <span className="ticker-win">+{formatWin(win.amount)}</span>
                        {win.multiplier && <span style={{ color: 'var(--accent-green)', fontWeight: 700 }}>{win.multiplier}</span>}
                    </div>
                ))}
            </div>
        </div>
    )
}
