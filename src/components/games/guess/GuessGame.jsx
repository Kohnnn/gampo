import { useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { useSfx } from '../../../audio/useSfx'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits } from '../../../utils/simulationMath'
import { nextRoll } from '../../../utils/fairRng'
import { getBigWinThreshold, BetPanel, BigWinOverlay, CoreStageFrame, GameShell, HistoryDrawer, RecentResultsStrip, StatsOverlay, useGameSession, ResultToast, ActionLockOverlay } from '../primitives'
import { NumberRoll, Particles } from '../../fx'
import EducationPanel from '../../EducationPanel'
import './guess.css'
import { useGameBgm } from '../../../audio/useBgm'

export default function GuessGame() {
    useGameBgm('guess', 'idle')
    const definition = findGameDefinition('guess')
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const sfx = useSfx('guess')
    const session = useGameSession('guess')

    const [choice, setChoice] = useState(7)
    const [result, setResult] = useState(null)
    const [spinning, setSpinning] = useState(false)
    const [lastWon, setLastWon] = useState(null)
    const [burstKey, setBurstKey] = useState(0)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [lastBet, setLastBet] = useState(null)
    const [toast, setToast] = useState(null)
    const payout = 9.4

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (!placeBet(betAmount, 'Guess Number')) { showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`); resolve({ profit: 0 }); return }
        setLastBet(betAmount)
        playSound('tick')
        setToast(null)
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
                message: won ? `Hit ${next}` : `Rolled ${next} — you picked ${choice}`,
            })
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
            <CoreStageFrame minHeight={460} maxWidth={760} className="guess-stage-frame">
            <div className={`guess-stage ${lastWon === true ? 'win-flash' : lastWon === false ? 'loss-flash' : ''}`}>
                <RecentResultsStrip results={session.stats.lastResults} />
                <div data-mobile-critical-surface className={`guess-orb ${spinning ? 'spinning' : ''} ${lastWon === true ? 'won' : lastWon === false ? 'lost' : ''}`}>
                    <NumberRoll value={result === null ? '?' : result} format={v => v === '?' ? '?' : String(v)} />
                </div>
                <p className="bp-bal-line" style={{ color: 'var(--text-secondary)' }}>You picked <strong>{choice}</strong> — hit chance 10%</p>
                {lastWon && burstKey > 0 && <Particles key={burstKey} count={18} color="#41d6ff" />}
                <ActionLockOverlay active={spinning} label="Revealing..." />
                <ResultToast result={toast} onDismiss={() => setToast(null)} />
            </div>
            </CoreStageFrame>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={getBigWinThreshold('guess')} />
            <EducationPanel definition={definition} betAmount={5} winProbability={0.1} payoutMultiplier={payout} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
