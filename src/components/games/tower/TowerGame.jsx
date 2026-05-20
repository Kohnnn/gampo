import { useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits } from '../../../utils/simulationMath'
import { nextRoll } from '../../../utils/fairRng'
import { BetPanel, BigWinOverlay, GameShell, HistoryDrawer, StatsOverlay, useGameSession } from '../primitives'
import { Particles } from '../../fx'
import EducationPanel from '../../EducationPanel'
import './tower.css'

const PRESETS = {
    easy: { safe: 0.85, growth: 1.18, label: 'Easy' },
    medium: { safe: 0.7, growth: 1.28, label: 'Medium' },
    hard: { safe: 0.55, growth: 1.55, label: 'Hard' },
}

const HEIGHT = 8

export default function TowerGame() {
    const definition = findGameDefinition('tower')
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const session = useGameSession('tower')

    const [risk, setRisk] = useState('medium')
    const [level, setLevel] = useState(0)
    const [activeBet, setActiveBet] = useState(0)
    const [phase, setPhase] = useState('idle') // idle | climbing
    const [fellAt, setFellAt] = useState(null)
    const [burstKey, setBurstKey] = useState(0)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })

    const config = PRESETS[risk]
    const multiplier = Number(Math.pow(config.growth, level).toFixed(2))

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (phase === 'climbing') { resolve({ profit: 0 }); return }
        if (!placeBet(betAmount, 'Tower Climb')) { showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`); resolve({ profit: 0 }); return }
        playSound('click')
        setActiveBet(betAmount)
        setLevel(0)
        setFellAt(null)
        setPhase('climbing')
        // Resolves when player cashes out or falls.
        // We resolve immediately so autoplay doesn't queue a second start.
        // Autoplay isn't used for Tower since it's interactive.
        resolve({ profit: 0 })
    })

    const climb = () => {
        if (phase !== 'climbing') return
        const safe = nextRoll('tower').roll < config.safe
        if (safe) {
            playSound('flip')
            setLevel(prev => prev + 1)
            return
        }
        playSound('explode')
        setFellAt(level)
        session.record({
            id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
            label: `Fall L${level}`,
            profit: -activeBet, betAmount: activeBet,
            meta: { risk, level },
        })
        showToast('loss', 'Tower fell', `-${formatCredits(activeBet)}`)
        window.setTimeout(() => {
            setPhase('idle')
            setActiveBet(0)
            setLevel(0)
            setFellAt(null)
        }, 700)
    }

    const cashout = () => {
        if (level === 0) return
        const returnAmount = activeBet * multiplier
        const profit = returnAmount - activeBet
        addWinnings(returnAmount, 'Tower return')
        if (multiplier >= 5) {
            playSound('bigwin')
            setBigWin({ trigger: Date.now(), profit, multiplier })
        } else {
            playSound('win')
        }
        setBurstKey(k => k + 1)
        session.record({
            id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
            label: `${multiplier}×`,
            profit, betAmount: activeBet, multiplier,
            meta: { risk, level },
        })
        showToast('win', 'Tower cashed out', `+${formatCredits(profit)}`)
        setPhase('idle')
        setActiveBet(0)
        window.setTimeout(() => setLevel(0), 800)
    }

    const recentProfit = session.history.slice(0, 12).reduce((s, i) => s + (i.profit || 0), 0)

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#41d6ff"
            backdrop="/assets/games/backdrops/backdrop-felt-navy.png"
            panel={
                <BetPanel
                    balance={balance}
                    initialBet={5}
                    runningRound={phase === 'climbing'}
                    actionLabel="Start Tower"
                    onPlay={performPlay}
                    disableAuto
                >
                    <div className="bp-section">
                        <label className="bp-label">Difficulty</label>
                        <div className="bp-row">
                            {Object.entries(PRESETS).map(([k, p]) => (
                                <button key={k} disabled={phase === 'climbing'} className={`bp-bet-btn ${risk === k ? 'active' : ''}`} onClick={() => setRisk(k)}>{p.label}</button>
                            ))}
                        </div>
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
            <div className={`tower-stage ${fellAt !== null ? 'loss-flash' : ''}`}>
                <div className="tower-stack" style={{ transform: `translateY(${level * 4}px)` }}>
                    {Array.from({ length: HEIGHT }, (_, index) => {
                        const tileLevel = HEIGHT - index
                        const isCurrent = tileLevel === level + 1 && phase === 'climbing'
                        const isLit = index < level
                        const isFallen = fellAt !== null && index === fellAt
                        return (
                            <span key={index} className={`tower-tile ${isLit ? 'lit' : ''} ${isCurrent ? 'current' : ''} ${isFallen ? 'fallen' : ''}`}>
                                {tileLevel}
                            </span>
                        )
                    })}
                </div>
                <p className="bp-bal-line" style={{ color: 'var(--text-secondary)' }}>Level <strong>{level}</strong> · Multiplier <strong>{multiplier.toFixed(2)}×</strong></p>
                <div className="tower-action-btns">
                    <button disabled={phase !== 'climbing'} onClick={climb}>Climb</button>
                    <button className={`cashout ${phase === 'climbing' && level > 0 ? 'fx-pulse' : ''}`} disabled={phase !== 'climbing' || level === 0} onClick={cashout}>Cashout {multiplier.toFixed(2)}×</button>
                </div>
                {burstKey > 0 && phase === 'idle' && session.history[0]?.profit > 0 && <Particles key={burstKey} count={18} color="#41d6ff" />}
            </div>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={5} />
            <EducationPanel definition={definition} betAmount={5} winProbability={Math.pow(config.safe, Math.max(1, level + 1))} payoutMultiplier={Math.max(1.28, multiplier)} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
