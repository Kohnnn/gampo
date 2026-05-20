import { useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { clamp, formatCredits, limboWinChance } from '../../../utils/simulationMath'
import { nextRoll } from '../../../utils/fairRng'
import { BetPanel, BigWinOverlay, GameShell, HistoryDrawer, StatsOverlay, useGameSession } from '../primitives'
import { NumberRoll, Particles } from '../../fx'
import EducationPanel from '../../EducationPanel'
import './limbo.css'

export default function LimboGame() {
    const definition = findGameDefinition('limbo')
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const session = useGameSession('limbo')

    const [target, setTarget] = useState(2)
    const [last, setLast] = useState(null)
    const [lastWon, setLastWon] = useState(null)
    const [running, setRunning] = useState(false)
    const [burstKey, setBurstKey] = useState(0)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [lastBet, setLastBet] = useState(null)
    const chance = limboWinChance(target)

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (!placeBet(betAmount, 'Limbo')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            resolve({ profit: 0 })
            return
        }
        setLastBet(betAmount)
        playSound('tick')
        setRunning(true)
        const { roll: r } = nextRoll('limbo')
        const won = r < chance
        const multiplier = won ? target + r * target : 1 + r * Math.max(0.1, target - 1)
        const returnAmount = won ? betAmount * target : 0
        const profit = returnAmount - betAmount
        if (won) addWinnings(returnAmount, 'Limbo return')
        setLast(multiplier)
        setLastWon(won)
        setBurstKey(k => k + 1)
        if (won && target >= 5) {
            playSound('bigwin')
            setBigWin({ trigger: Date.now(), profit, multiplier: target })
        } else {
            playSound(won ? 'win' : 'loss')
        }
        session.record({ id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, label: `${multiplier.toFixed(2)}×`, profit, betAmount, multiplier: won ? target : 0, meta: { target } })
        showToast(won ? 'win' : 'loss', won ? 'Target cleared' : 'Below target', `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
        setRunning(false)
        resolve({ profit })
    })

    const gaugePct = last ? Math.min(100, ((last - 1) / Math.max(0.01, target - 1)) * 90) : 0
    const recentProfit = session.history.slice(0, 12).reduce((sum, item) => sum + (item.profit || 0), 0)

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#41d6ff"
            backdrop="/assets/games/backdrops/backdrop-stars.png"
            panel={
                <BetPanel
                    balance={balance}
                    initialBet={5}
                    runningRound={running}
                    actionLabel="Run Limbo"
                    onPlay={performPlay}
                    lastBet={lastBet}
                >
                    <div className="bp-section">
                        <label className="bp-label">Target Multiplier</label>
                        <input type="number" min="1.01" max="100" step="0.1" value={target} onChange={event => setTarget(clamp(Number(event.target.value) || 1.01, 1.01, 100))} className="bp-bet-input" />
                    </div>
                    <div className="bp-quick-actions">
                        {[1.5, 2, 5, 10, 50, 100].map(t => (
                            <button key={t} onClick={() => setTarget(t)}>{t}×</button>
                        ))}
                    </div>
                    <div className="bp-bal-line">
                        <span>Estimated hit chance</span>
                        <strong>{(chance * 100).toFixed(2)}%</strong>
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
            <div className={`limbo-stage ${lastWon === true ? 'win-flash' : lastWon === false ? 'loss-flash' : ''}`}>
                <div className="limbo-stars-bg" />
                <div className="limbo-rocket-row">
                    <div className="limbo-gauge">
                        <div className="limbo-gauge-fill" style={{ height: `${gaugePct}%`, background: lastWon === false ? 'linear-gradient(0deg, #ed4245, #ffcf5a)' : 'linear-gradient(0deg, #00e701, #41d6ff)' }} />
                        <div className="limbo-gauge-target" />
                    </div>
                    <div className={`limbo-ring ${lastWon === true ? 'won' : lastWon === false ? 'lost' : ''}`}>
                        <span><NumberRoll value={last === null ? 1 : Number(last.toFixed(2))} format={v => `${v.toFixed(2)}×`} /></span>
                    </div>
                    {lastWon && burstKey > 0 && <Particles key={burstKey} count={18} color="#41d6ff" />}
                </div>
                <div className="limbo-target-label">Target {target.toFixed(2)}×</div>
            </div>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={5} />
            <EducationPanel definition={definition} betAmount={5} winProbability={chance} payoutMultiplier={target} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
