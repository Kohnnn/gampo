import { useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits } from '../../../utils/simulationMath'
import { nextRoll } from '../../../utils/fairRng'
import { BetPanel, BigWinOverlay, GameShell, HistoryDrawer, RecentResultsStrip, StatsOverlay, useGameSession } from '../primitives'
import { Particles } from '../../fx'
import EducationPanel from '../../EducationPanel'
import './wheel.css'

const wheelPresets = {
    low: [0, 1.2, 1.2, 1.5, 0, 2, 1.2, 1.5, 0, 2, 1.2, 3],
    medium: [0, 0, 1.5, 0, 2, 0, 3, 0, 1.5, 0, 5, 0],
    high: [0, 0, 0, 2, 0, 0, 5, 0, 0, 10, 0, 25],
}

export default function WheelGame() {
    const definition = findGameDefinition('wheel')
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const session = useGameSession('wheel')

    const [risk, setRisk] = useState('medium')
    const [rotation, setRotation] = useState(0)
    const [last, setLast] = useState(null)
    const [lastWon, setLastWon] = useState(null)
    const [spinning, setSpinning] = useState(false)
    const [burstKey, setBurstKey] = useState(0)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [lastBet, setLastBet] = useState(null)
    const segments = wheelPresets[risk]

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (!placeBet(betAmount, 'Wheel')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            resolve({ profit: 0 })
            return
        }
        setLastBet(betAmount)
        playSound('tick')
        setSpinning(true)
        const { roll: r } = nextRoll('wheel')
        const idx = Math.floor(r * segments.length)
        const multiplier = segments[idx]
        const returnAmount = betAmount * multiplier
        const profit = returnAmount - betAmount
        const won = multiplier > 1
        const segAngle = 360 / segments.length
        const target = 6 * 360 + (360 - idx * segAngle - segAngle / 2)
        setRotation(prev => prev + (target - (prev % 360)))
        window.setTimeout(() => {
            if (returnAmount > 0) addWinnings(returnAmount, 'Wheel return')
            setLast(multiplier)
            setLastWon(won)
            setBurstKey(k => k + 1)
            setSpinning(false)
            if (won && multiplier >= 5) {
                playSound('bigwin')
                setBigWin({ trigger: Date.now(), profit, multiplier })
            } else {
                playSound(won ? 'win' : 'loss')
            }
            session.record({ id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, label: `${multiplier}×`, profit, betAmount, multiplier, meta: { risk } })
            showToast(profit >= 0 ? 'win' : 'loss', `Wheel ${multiplier}×`, `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
            resolve({ profit })
        }, 2200)
    })

    const hitChance = segments.filter(item => item > 0).length / segments.length
    const avgMultiplier = segments.reduce((sum, item) => sum + item, 0) / segments.length
    const recentProfit = session.history.slice(0, 12).reduce((sum, item) => sum + (item.profit || 0), 0)

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
                    runningRound={spinning}
                    actionLabel="Spin Wheel"
                    onPlay={performPlay}
                    lastBet={lastBet}
                >
                    <div className="bp-section">
                        <label className="bp-label">Risk</label>
                        <div className="bp-row">
                            {Object.keys(wheelPresets).map(r => (
                                <button key={r} className={`bp-bet-btn ${risk === r ? 'active' : ''}`} onClick={() => !spinning && setRisk(r)}>{r}</button>
                            ))}
                        </div>
                    </div>
                    <div className="bp-bal-line">
                        <span>Average return</span>
                        <strong>{avgMultiplier.toFixed(2)}×</strong>
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
            <div className={`wheel-stage ${lastWon === true ? 'win-flash' : lastWon === false ? 'loss-flash' : ''}`}>
                <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />
                <div className="wheel-pointer" />
                <div className={`wheel-disc ${spinning ? 'spinning' : ''}`} style={{ transform: `rotate(${rotation}deg)` }}>
                    {segments.map((segment, i) => (
                        <span key={`${segment}-${i}`} className={segment > 0 ? 'paying' : 'blank'} style={{ transform: `rotate(${i * (360 / segments.length)}deg)` }}>
                            {segment}×
                        </span>
                    ))}
                </div>
                <div className="wheel-last">Last: {last === null ? '--' : `${last}×`}</div>
                {lastWon && burstKey > 0 && <Particles key={burstKey} count={20} color="#ffcf5a" />}
            </div>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={5} />
            <EducationPanel definition={definition} betAmount={5} winProbability={hitChance} payoutMultiplier={avgMultiplier} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
