import { useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits } from '../../../utils/simulationMath'
import { nextRoll } from '../../../utils/fairRng'
import { BetPanel, BigWinOverlay, GameShell, HistoryDrawer, RecentResultsStrip, StatsOverlay, useGameSession } from '../primitives'
import { Particles } from '../../fx'
import EducationPanel from '../../EducationPanel'
import './color.css'

const COLORS = [
    { id: 'red', label: 'Red', color: '#e23d4f' },
    { id: 'blue', label: 'Blue', color: '#3d7dff' },
    { id: 'green', label: 'Green', color: '#00c781' },
    { id: 'gold', label: 'Gold', color: '#ffcf5a' },
]

export default function ColorGame() {
    const definition = findGameDefinition('color')
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const session = useGameSession('color')

    const [choice, setChoice] = useState('red')
    const [result, setResult] = useState(null)
    const [spinning, setSpinning] = useState(false)
    const [rotation, setRotation] = useState(0)
    const [lastWon, setLastWon] = useState(null)
    const [burstKey, setBurstKey] = useState(0)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [lastBet, setLastBet] = useState(null)
    const payout = 3.84

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (!placeBet(betAmount, 'Color Pick')) { showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`); resolve({ profit: 0 }); return }
        setLastBet(betAmount)
        playSound('tick')
        setSpinning(true)
        const idx = Math.floor(nextRoll('color').roll * COLORS.length)
        const next = COLORS[idx]
        const won = next.id === choice
        const returnAmount = won ? betAmount * payout : 0
        const profit = returnAmount - betAmount
        const segAngle = 360 / COLORS.length
        const target = 5 * 360 + (360 - idx * segAngle - segAngle / 2)
        setRotation(prev => prev + (target - (prev % 360)))
        window.setTimeout(() => {
            if (returnAmount > 0) addWinnings(returnAmount, 'Color Pick return')
            setResult(next)
            setLastWon(won)
            setBurstKey(k => k + 1)
            setSpinning(false)
            if (won) {
                playSound('bigwin')
                setBigWin({ trigger: Date.now(), profit, multiplier: payout })
            } else {
                playSound('loss')
            }
            session.record({ id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, label: next.label, profit, betAmount, multiplier: won ? payout : 0 })
            showToast(won ? 'win' : 'loss', `Color ${next.label}`, `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
            resolve({ profit })
        }, 1900)
    })

    const recentProfit = session.history.slice(0, 12).reduce((s, i) => s + (i.profit || 0), 0)

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#7c5cff"
            backdrop="/assets/games/backdrops/backdrop-neon-grid.png"
            panel={
                <BetPanel balance={balance} initialBet={5} runningRound={spinning} actionLabel="Pick Color" onPlay={performPlay} lastBet={lastBet}>
                    <div className="bp-section">
                        <label className="bp-label">Color</label>
                        <div className="color-choices">
                            {COLORS.map(c => (
                                <button key={c.id} className={`color-choice ${choice === c.id ? 'active' : ''}`} style={{ '--swatch': c.color }} disabled={spinning} onClick={() => setChoice(c.id)}>{c.label}</button>
                            ))}
                        </div>
                    </div>
                    <div className="bp-bal-line"><span>Payout</span><strong>{payout.toFixed(2)}×</strong></div>
                </BetPanel>
            }
            aside={<><StatsOverlay stats={session.stats} definition={definition} /><HistoryDrawer history={session.history} onClear={session.clear} /></>}
        >
            <div className={`color-stage ${lastWon === true ? 'win-flash' : lastWon === false ? 'loss-flash' : ''}`} style={{ '--result-color': result?.color }}>
                <RecentResultsStrip results={session.stats.lastResults} />
                <div className="color-pointer" />
                <div className="color-spectrum" style={{ transform: `rotate(${rotation}deg)` }} />
                <div className="color-result-label">{result?.label || 'Pick'}</div>
                {lastWon && burstKey > 0 && <Particles key={burstKey} count={20} color={result?.color || '#fff'} />}
            </div>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={3} />
            <EducationPanel definition={definition} betAmount={5} winProbability={0.25} payoutMultiplier={payout} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
