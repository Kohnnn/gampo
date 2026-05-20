import { useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits, pickWeighted } from '../../../utils/simulationMath'
import { nextRoll } from '../../../utils/fairRng'
import { BetPanel, BigWinOverlay, GameShell, HistoryDrawer, StatsOverlay, useGameSession, Asset } from '../primitives'
import { Particles } from '../../fx'
import EducationPanel from '../../EducationPanel'
import './slots.css'

const themes = {
    classic: {
        name: 'Classic',
        symbols: [
            { id: 'seven', label: '7', weight: 2, multiplier: 50, asset: '/assets/games/slots/classic/slot-classic-7.png' },
            { id: 'bar', label: 'BAR', weight: 5, multiplier: 15, asset: '/assets/games/slots/classic/slot-classic-bar.png' },
            { id: 'cherry', label: '🍒', weight: 8, multiplier: 8, asset: '/assets/games/slots/classic/slot-classic-cherry.png' },
            { id: 'bell', label: '🔔', weight: 12, multiplier: 4, asset: '/assets/games/slots/classic/slot-classic-bell.png' },
            { id: 'coin', label: 'GC', weight: 18, multiplier: 2, asset: '/assets/games/slots/classic/slot-classic-coin.png' },
            { id: 'blank', label: '-', weight: 35, multiplier: 0, asset: '/assets/games/slots/classic/slot-classic-blank.png' },
        ],
        accent: '#ffcf5a',
    },
    cyber: {
        name: 'Cyber',
        symbols: [
            { id: 'core', label: 'CORE', weight: 2, multiplier: 50, asset: '/assets/games/slots/cyber/slot-cyber-core.png' },
            { id: 'chip', label: 'CHIP', weight: 5, multiplier: 15, asset: '/assets/games/slots/cyber/slot-cyber-chip.png' },
            { id: 'wave', label: 'WAVE', weight: 8, multiplier: 8, asset: '/assets/games/slots/cyber/slot-cyber-wave.png' },
            { id: 'node', label: 'NODE', weight: 12, multiplier: 4, asset: '/assets/games/slots/cyber/slot-cyber-node.png' },
            { id: 'data', label: 'DATA', weight: 18, multiplier: 2, asset: '/assets/games/slots/cyber/slot-cyber-data.png' },
            { id: 'blank', label: '-', weight: 35, multiplier: 0, asset: '/assets/games/slots/cyber/slot-cyber-blank.png' },
        ],
        accent: '#41d6ff',
    },
    mythic: {
        name: 'Mythic',
        symbols: [
            { id: 'rune', label: 'RUNE', weight: 2, multiplier: 50, asset: '/assets/games/slots/mythic/slot-mythic-rune.png' },
            { id: 'orb', label: 'ORB', weight: 5, multiplier: 15, asset: '/assets/games/slots/mythic/slot-mythic-orb.png' },
            { id: 'sword', label: 'SWORD', weight: 8, multiplier: 8, asset: '/assets/games/slots/mythic/slot-mythic-sword.png' },
            { id: 'shield', label: 'SHIELD', weight: 12, multiplier: 4, asset: '/assets/games/slots/mythic/slot-mythic-shield.png' },
            { id: 'leaf', label: 'LEAF', weight: 18, multiplier: 2, asset: '/assets/games/slots/mythic/slot-mythic-leaf.png' },
            { id: 'blank', label: '-', weight: 35, multiplier: 0, asset: '/assets/games/slots/mythic/slot-mythic-blank.png' },
        ],
        accent: '#7c5cff',
    },
}

export default function SlotsGame() {
    const definition = findGameDefinition('slots')
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const session = useGameSession('slots')

    const [theme, setTheme] = useState('classic')
    const [variant, setVariant] = useState('lines') // lines (5x3) or cluster (6x4)
    const [running, setRunning] = useState(false)
    const [stoppedCols, setStoppedCols] = useState(0)
    const [winningCells, setWinningCells] = useState([])
    const [burstKey, setBurstKey] = useState(0)
    const [lastWon, setLastWon] = useState(false)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [lastBet, setLastBet] = useState(null)

    const variantConfig = variant === 'lines'
        ? { rows: 3, cols: 5, paylines: [[0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [10, 11, 12, 13, 14], [0, 6, 12, 8, 4], [10, 6, 2, 8, 14]] }
        : { rows: 4, cols: 6, paylines: null }
    const totalCells = variantConfig.rows * variantConfig.cols
    const themeSymbols = themes[theme].symbols
    const [reels, setReels] = useState(() => Array.from({ length: totalCells }, () => themeSymbols[themeSymbols.length - 1]))

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (!placeBet(betAmount, 'Slots')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            resolve({ profit: 0 })
            return
        }
        setLastBet(betAmount)
        playSound('tick')
        setRunning(true)
        setStoppedCols(0)
        setWinningCells([])
        const next = Array.from({ length: totalCells }, () => pickWeighted(themeSymbols, () => nextRoll('slots').roll))
        setReels(next)
        for (let c = 1; c <= variantConfig.cols; c++) {
            window.setTimeout(() => {
                playSound('flip')
                setStoppedCols(c)
            }, c * 220)
        }
        let multiplier = 0
        const winSet = new Set()
        if (variantConfig.paylines) {
            for (const line of variantConfig.paylines) {
                const first = next[line[0]]
                if (first.multiplier === 0) continue
                if (line.every(idx => next[idx].id === first.id)) {
                    multiplier += first.multiplier
                    line.forEach(idx => winSet.add(idx))
                }
            }
        } else {
            const counts = next.reduce((acc, sym) => ({ ...acc, [sym.id]: (acc[sym.id] || 0) + 1 }), {})
            Object.entries(counts).forEach(([id, count]) => {
                const sym = themeSymbols.find(s => s.id === id)
                if (!sym || sym.multiplier === 0) return
                if (count >= 6) {
                    multiplier += sym.multiplier * (count / 6)
                    next.forEach((s, i) => { if (s.id === id) winSet.add(i) })
                }
            })
            multiplier = Math.round(multiplier * 100) / 100
        }
        const returnAmount = betAmount * multiplier
        const profit = returnAmount - betAmount
        const totalDelay = variantConfig.cols * 220 + 200
        window.setTimeout(() => {
            if (returnAmount > 0) addWinnings(returnAmount, 'Slots return')
            setWinningCells(Array.from(winSet))
            setBurstKey(k => k + 1)
            setLastWon(returnAmount > 0)
            setRunning(false)
            if (multiplier >= 5) {
                playSound('bigwin')
                setBigWin({ trigger: Date.now(), profit, multiplier })
            } else {
                playSound(returnAmount > 0 ? 'win' : 'loss')
            }
            session.record({
                id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
                label: `${multiplier}×`,
                profit, betAmount, multiplier,
                meta: { theme, variant },
            })
            showToast(profit >= 0 ? 'win' : 'loss', `Slots ${multiplier}×`, `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
            resolve({ profit })
        }, totalDelay)
    })

    const recentProfit = session.history.slice(0, 12).reduce((s, i) => s + (i.profit || 0), 0)

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent={themes[theme].accent}
            backdrop={theme === 'mythic' ? '/assets/games/backdrops/backdrop-parchment.png' : theme === 'cyber' ? '/assets/games/backdrops/backdrop-neon-grid.png' : '/assets/games/backdrops/backdrop-felt-navy.png'}
            panel={
                <BetPanel
                    balance={balance}
                    initialBet={5}
                    runningRound={running}
                    actionLabel="Spin Reels"
                    onPlay={performPlay}
                    lastBet={lastBet}
                >
                    <div className="bp-section">
                        <label className="bp-label">Theme</label>
                        <div className="bp-row">
                            {Object.entries(themes).map(([key, t]) => (
                                <button key={key} className={`bp-bet-btn ${theme === key ? 'active' : ''}`} disabled={running} onClick={() => setTheme(key)}>{t.name}</button>
                            ))}
                        </div>
                    </div>
                    <div className="bp-section">
                        <label className="bp-label">Variant</label>
                        <div className="bp-row">
                            <button className={`bp-bet-btn ${variant === 'lines' ? 'active' : ''}`} disabled={running} onClick={() => setVariant('lines')}>5×3 Lines</button>
                            <button className={`bp-bet-btn ${variant === 'cluster' ? 'active' : ''}`} disabled={running} onClick={() => setVariant('cluster')}>6×4 Cluster</button>
                        </div>
                    </div>
                    <div className="slots-paytable">
                        {themeSymbols.filter(s => s.multiplier > 0).map(s => (
                            <span key={s.id}>{s.label}<strong>{s.multiplier}×</strong></span>
                        ))}
                    </div>
                </BetPanel>
            }
            aside={
                <>
                    <StatsOverlay stats={session.stats} definition={definition} />
                    <HistoryDrawer history={session.history} onClear={session.clear} />
                </>
            }
        >
            <div className={`slots-stage ${lastWon && !running ? 'win-flash' : ''}`}>
                <div className="slots-frame slots-theme-pad">
                    <div className="slots-grid" style={{ gridTemplateColumns: `repeat(${variantConfig.cols}, 1fr)` }}>
                        {reels.map((symbol, index) => {
                            const col = index % variantConfig.cols
                            const isSpinning = running && col >= stoppedCols
                            const isWin = winningCells.includes(index)
                            return (
                                <div
                                    key={`${symbol.id}-${index}`}
                                    className={`slot-cell ${isSpinning ? 'reel-spin' : 'reel-stop'} ${isWin ? 'cluster-glow' : ''}`}
                                    style={{ animationDelay: `${col * 50}ms` }}
                                >
                                    <Asset src={symbol.asset} alt={symbol.label} fallback={<span>{symbol.label}</span>} />
                                </div>
                            )
                        })}
                    </div>
                </div>
                {burstKey > 0 && winningCells.length > 0 && <Particles key={burstKey} count={20} color="#ffcf5a" />}
            </div>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={5} />
            <EducationPanel definition={definition} betAmount={5} winProbability={0.28} payoutMultiplier={2.4} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
