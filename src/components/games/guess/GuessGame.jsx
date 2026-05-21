import { useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits } from '../../../utils/simulationMath'
import { nextRoll } from '../../../utils/fairRng'
import { BetPanel, BigWinOverlay, GameShell, HistoryDrawer, RecentResultsStrip, StatsOverlay, useGameSession } from '../primitives'
import { NumberRoll, Particles } from '../../fx'
import EducationPanel from '../../EducationPanel'
import './guess.css'

export default function GuessGame() {
    const definition = findGameDefinition('guess')
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const session = useGameSession('guess')

    const [choice, setChoice] = useState(7)
    const [result, setResult] = useState(null)
    const [spinning, setSpinning] = useState(false)
    const [lastWon, setLastWon] = useState(null)
    const [burstKey, setBurstKey] = useState(0)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [lastBet, setLastBet] = useState(null)
    const payout = 9.4

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (!placeBet(betAmount, 'Guess Number')) { showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`); resolve({ profit: 0 }); return }
        setLastBet(betAmount)
        playSound('tick')
        setSpinning(true)
        const next = Math.floor(nextRoll('guess').roll * 10)
        const won = next === choice
        const returnAmount = won ? betAmount * payout : 0
        const profit = returnAmount - betAmount
        window.setTimeout(() => {
            if (returnAmount > 0) addWinnings(returnAmount, 'Guess Number return')
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
            session.record({ id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, label: String(next), profit, betAmount, multiplier: won ? payout : 0, meta: { picked: choice } })
            showToast(won ? 'win' : 'loss', won ? 'Number hit' : 'Number missed', `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
            resolve({ profit })
        }, 1100)
    })

    const recentProfit = session.history.slice(0, 12).reduce((s, i) => s + (i.profit || 0), 0)

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#4cc9f0"
            backdrop="/assets/games/backdrops/backdrop-stars.png"
            panel={
                <BetPanel balance={balance} initialBet={5} runningRound={spinning} actionLabel="Reveal Number" onPlay={performPlay} lastBet={lastBet}>
                    <div className="bp-section">
                        <label className="bp-label">Pick a number 0-9</label>
                        <div className="guess-pick">
                            {Array.from({ length: 10 }, (_, i) => (
                                <button key={i} className={`bp-bet-btn ${choice === i ? 'active' : ''}`} disabled={spinning} onClick={() => setChoice(i)}>{i}</button>
                            ))}
                        </div>
                    </div>
                    <div className="bp-bal-line"><span>Payout</span><strong>{payout.toFixed(2)}×</strong></div>
                </BetPanel>
            }
            aside={<><StatsOverlay stats={session.stats} definition={definition} /><HistoryDrawer history={session.history} onClear={session.clear} /></>}
        >
            <div className={`guess-stage ${lastWon === true ? 'win-flash' : lastWon === false ? 'loss-flash' : ''}`}>
                <RecentResultsStrip results={session.stats.lastResults} />
                <div className={`guess-orb ${spinning ? 'spinning' : ''} ${lastWon === true ? 'won' : lastWon === false ? 'lost' : ''}`}>
                    <NumberRoll value={result === null ? '?' : result} format={v => v === '?' ? '?' : String(v)} />
                </div>
                <p className="bp-bal-line" style={{ color: 'var(--text-secondary)' }}>You picked <strong>{choice}</strong> — hit chance 10%</p>
                {lastWon && burstKey > 0 && <Particles key={burstKey} count={18} color="#41d6ff" />}
            </div>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={5} />
            <EducationPanel definition={definition} betAmount={5} winProbability={0.1} payoutMultiplier={payout} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
