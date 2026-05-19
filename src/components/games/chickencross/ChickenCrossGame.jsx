import { useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits } from '../../../utils/simulationMath'
import { nextRoll } from '../../../utils/fairRng'
import { BetPanel, GameShell, HistoryDrawer, StatsOverlay, useGameSession } from '../primitives'
import { Particles } from '../../fx'
import EducationPanel from '../../EducationPanel'
import './chickencross.css'

const PRESETS = {
    easy: { safe: 0.85, growth: 1.18, label: 'Easy' },
    medium: { safe: 0.72, growth: 1.32, label: 'Medium' },
    hard: { safe: 0.58, growth: 1.55, label: 'Hard' },
}
const LANES = 12

export default function ChickenCrossGame() {
    const definition = findGameDefinition('chickencross')
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const session = useGameSession('chickencross')

    const [risk, setRisk] = useState('medium')
    const [lane, setLane] = useState(0)
    const [activeBet, setActiveBet] = useState(0)
    const [phase, setPhase] = useState('idle') // idle | crossing
    const [splat, setSplat] = useState(false)
    const [carKey, setCarKey] = useState(0)
    const [burstKey, setBurstKey] = useState(0)

    const config = PRESETS[risk]
    const multiplier = Number(Math.pow(config.growth, lane).toFixed(2))

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (phase === 'crossing') { resolve({ profit: 0 }); return }
        if (!placeBet(betAmount, 'Chicken Cross')) { showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`); resolve({ profit: 0 }); return }
        playSound('click')
        setActiveBet(betAmount)
        setLane(0)
        setSplat(false)
        setPhase('crossing')
        resolve({ profit: 0 })
    })

    const cross = () => {
        if (lane >= LANES) { cashout(); return }
        if (Math.random() < 0.3) setCarKey(k => k + 1)
        const safe = nextRoll('chickencross').roll < config.safe
        if (safe) {
            playSound('flip')
            setLane(prev => prev + 1)
            return
        }
        playSound('explode')
        setSplat(true)
        session.record({ id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, label: `Splat L${lane}`, profit: -activeBet, betAmount: activeBet, meta: { risk, lane } })
        showToast('loss', 'Chicken hit', `-${formatCredits(activeBet)}`)
        window.setTimeout(() => {
            setPhase('idle')
            setActiveBet(0)
            setLane(0)
            setSplat(false)
        }, 800)
    }

    const cashout = () => {
        if (lane === 0) return
        const returnAmount = activeBet * multiplier
        const profit = returnAmount - activeBet
        addWinnings(returnAmount, 'Chicken Cross return')
        playSound('win')
        setBurstKey(k => k + 1)
        session.record({ id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, label: `${multiplier}×`, profit, betAmount: activeBet, multiplier, meta: { risk, lane } })
        showToast('win', 'Chicken cashed out', `+${formatCredits(profit)}`)
        setPhase('idle')
        setActiveBet(0)
        window.setTimeout(() => setLane(0), 800)
    }

    const recentProfit = session.history.slice(0, 12).reduce((s, i) => s + (i.profit || 0), 0)

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#ffcf5a"
            backdrop="/assets/games/backdrops/backdrop-felt-navy.png"
            panel={
                <BetPanel
                    balance={balance}
                    initialBet={5}
                    runningRound={phase === 'crossing'}
                    actionLabel="Start Crossing"
                    onPlay={performPlay}
                    disableAuto
                >
                    <div className="bp-section">
                        <label className="bp-label">Difficulty</label>
                        <div className="bp-row">
                            {Object.entries(PRESETS).map(([k, p]) => (
                                <button key={k} disabled={phase === 'crossing'} className={`bp-bet-btn ${risk === k ? 'active' : ''}`} onClick={() => setRisk(k)}>{p.label}</button>
                            ))}
                        </div>
                    </div>
                </BetPanel>
            }
            aside={<><StatsOverlay stats={session.stats} definition={definition} /><HistoryDrawer history={session.history} onClear={session.clear} /></>}
        >
            <div className="cc-stage">
                <div className="cc-road">
                    {Array.from({ length: LANES + 1 }, (_, i) => (
                        <div key={i} className={`cc-lane ${i === lane ? 'current' : ''} ${i < lane ? 'crossed' : ''} ${splat && i === lane ? 'splat' : ''}`}>
                            {i === lane && phase === 'crossing' && (
                                <span className={`cc-chicken ${splat ? 'splatted' : 'hopping'}`}>{splat ? '\uD83D\uDCA5' : '\uD83D\uDC25'}</span>
                            )}
                            <span className="cc-mult">{Math.pow(config.growth, i).toFixed(2)}×</span>
                        </div>
                    ))}
                    {carKey > 0 && phase === 'crossing' && <span key={`car-${carKey}`} className="cc-car" />}
                </div>
                <div className="cc-action-btns">
                    <button disabled={phase !== 'crossing'} onClick={cross}>Cross next</button>
                    <button className={`cc-cashout ${phase === 'crossing' && lane > 0 ? 'fx-pulse' : ''}`} disabled={phase !== 'crossing' || lane === 0} onClick={cashout}>Cashout {multiplier.toFixed(2)}×</button>
                </div>
                <p className="bp-bal-line" style={{ color: 'var(--text-secondary)' }}>Lane <strong>{lane}/{LANES}</strong></p>
                {burstKey > 0 && phase === 'idle' && session.history[0]?.profit > 0 && <Particles key={burstKey} count={18} color="#ffcf5a" />}
            </div>
            <EducationPanel definition={definition} betAmount={5} winProbability={Math.pow(config.safe, Math.max(1, lane + 1))} payoutMultiplier={Math.max(1, multiplier)} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
