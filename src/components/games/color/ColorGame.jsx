import { useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { useSfx } from '../../../audio/useSfx'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits, round2 } from '../../../utils/simulationMath'
import { useCancellableTimeouts } from '../../../utils/scheduling'
import { nextRoll } from '../../../utils/fairRng'
import { getBigWinThreshold, BetPanel, BigWinOverlay, CoreStageFrame, GameShell, HistoryDrawer, RecentResultsStrip, StatsOverlay, useGameSession, ResultToast, ActionLockOverlay } from '../primitives'
import { Particles } from '../../fx'
import EducationPanel from '../../EducationPanel'
import './color.css'
import { useGameBgm } from '../../../audio/useBgm'

const COLORS = [
    { id: 'red', label: 'Red', color: '#e23d4f' },
    { id: 'blue', label: 'Blue', color: '#3d7dff' },
    { id: 'green', label: 'Green', color: '#00c781' },
    { id: 'gold', label: 'Gold', color: '#ffcf5a' },
]

export default function ColorGame() {
    useGameBgm('color', 'idle')
    const definition = findGameDefinition('color')
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const sfx = useSfx('color')
    const session = useGameSession('color')

    const [choice, setChoice] = useState('red')
    const [result, setResult] = useState(null)
    const [spinning, setSpinning] = useState(false)
    const [rotation, setRotation] = useState(0)
    const [lastWon, setLastWon] = useState(null)
    const [burstKey, setBurstKey] = useState(0)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [lastBet, setLastBet] = useState(null)
    const [toast, setToast] = useState(null)
    const { schedule } = useCancellableTimeouts()
    const payout = 3.84

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (!placeBet(betAmount, 'Color Pick')) { showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`); resolve({ profit: 0 }); return }
        setLastBet(betAmount)
        playSound('tick')
        setToast(null)
        setSpinning(true)
        const idx = Math.floor(nextRoll('color').roll * COLORS.length)
        const next = COLORS[idx]
        const won = next.id === choice
        const returnAmount = won ? round2(betAmount * payout) : 0
        const profit = round2(returnAmount - betAmount)
        const segAngle = 360 / COLORS.length
        const target = 5 * 360 + (360 - idx * segAngle - segAngle / 2)
        setRotation(prev => prev + (target - (prev % 360)))
        schedule(() => {
            if (returnAmount > 0) addWinnings(returnAmount, 'Color Pick return')
            setResult(next)
            setLastWon(won)
            setBurstKey(k => k + 1)
            setSpinning(false)
            if (won) {
                playSound('bigwin')
                sfx.play('win')
                setBigWin({ trigger: Date.now(), profit, multiplier: payout })
            } else {
                playSound('loss')
                sfx.play('lose')
            }
            setToast({
                kind: won ? 'win' : 'lose',
                multiplier: won ? payout : null,
                amount: profit,
                message: `Landed ${next.label}`,
            })
            session.record({ id: crypto.randomUUID(), label: next.label, profit, betAmount, multiplier: won ? payout : 0 })
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
            <CoreStageFrame minHeight={460} maxWidth={760} className="color-stage-frame">
            <div className={`color-stage ${lastWon === true ? 'win-flash' : lastWon === false ? 'loss-flash' : ''}`} style={{ '--result-color': result?.color }}>
                <RecentResultsStrip results={session.stats.lastResults} />
                <div className="color-pointer" />
                <div className="color-spectrum" data-mobile-critical-surface style={{ transform: `rotate(${rotation}deg)` }} />
                <div className="color-result-label">{result?.label || 'Pick'}</div>
                {lastWon && burstKey > 0 && <Particles key={burstKey} count={20} color={result?.color || '#fff'} />}
                <ActionLockOverlay active={spinning} label="Spinning..." />
                <ResultToast result={toast} onDismiss={() => setToast(null)} />
            </div>
            </CoreStageFrame>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={getBigWinThreshold('color')} />
            <EducationPanel definition={definition} betAmount={5} winProbability={0.25} payoutMultiplier={payout} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
