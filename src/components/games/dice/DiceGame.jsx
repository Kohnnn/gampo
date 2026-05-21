import { useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { dicePayout, formatCredits } from '../../../utils/simulationMath'
import { nextRoll } from '../../../utils/fairRng'
import { BetPanel, BigWinOverlay, GameShell, HistoryDrawer, RecentResultsStrip, StatsOverlay, useGameSession } from '../primitives'
import { NumberRoll, Particles } from '../../fx'
import EducationPanel from '../../EducationPanel'
import './dice.css'

export default function DiceGame() {
    const definition = findGameDefinition('dice')
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const session = useGameSession('dice')

    const [winChance, setWinChance] = useState(50)
    const [rollMode, setRollMode] = useState('under')
    const [lastRoll, setLastRoll] = useState(null)
    const [lastWon, setLastWon] = useState(null)
    const [running, setRunning] = useState(false)
    const [burstKey, setBurstKey] = useState(0)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [lastBet, setLastBet] = useState(null)
    const payout = dicePayout(winChance / 100)

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (!placeBet(betAmount, 'Dice')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            resolve({ profit: 0 })
            return
        }
        setLastBet(betAmount)
        playSound('tick')
        setRunning(true)
        const { roll: r } = nextRoll('dice')
        const roll = r * 100
        const won = rollMode === 'under' ? roll < winChance : roll > (100 - winChance)
        const returnAmount = won ? betAmount * payout : 0
        const profit = returnAmount - betAmount
        if (won) addWinnings(returnAmount, 'Dice return')
        setLastRoll(roll)
        setLastWon(won)
        setBurstKey(k => k + 1)
        if (won) {
            const tier = payout >= 50 ? 'mega' : payout >= 15 ? 'huge' : payout >= 5 ? 'big' : null
            if (tier) {
                playSound('bigwin')
                setBigWin({ trigger: Date.now(), profit, multiplier: payout })
            } else {
                playSound('win')
            }
        } else {
            playSound('loss')
        }
        session.record({ id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, label: roll.toFixed(2), profit, betAmount, multiplier: won ? payout : 0, meta: { winChance, rollMode } })
        showToast(won ? 'win' : 'loss', won ? 'Dice hit' : 'Dice miss', `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
        setRunning(false)
        resolve({ profit })
    })

    const recentProfit = session.history.slice(0, 12).reduce((sum, item) => sum + (item.profit || 0), 0)

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#00e701"
            backdrop="/assets/games/backdrops/backdrop-felt-navy.png"
            panel={
                <BetPanel
                    balance={balance}
                    initialBet={5}
                    runningRound={running}
                    actionLabel="Roll Dice"
                    onPlay={performPlay}
                    lastBet={lastBet}
                >
                    <div className="bp-section">
                        <label className="bp-label">Win Chance: {winChance}%</label>
                        <input type="range" min="2" max="95" value={winChance} onChange={e => setWinChance(Number(e.target.value))} className="dice-slider" />
                    </div>
                    <div className="bp-row">
                        <button className={`bp-bet-btn ${rollMode === 'under' ? 'active' : ''}`} onClick={() => setRollMode('under')}>Roll Under</button>
                        <button className={`bp-bet-btn ${rollMode === 'over' ? 'active' : ''}`} onClick={() => setRollMode('over')}>Roll Over</button>
                    </div>
                    <div className="bp-bal-line">
                        <span>Multiplier</span>
                        <strong>{payout.toFixed(2)}×</strong>
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
            <div className={`dice-stage ${lastWon === true ? 'win-flash' : lastWon === false ? 'loss-flash' : ''}`}>
                <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />
                <div className="dice-pips" aria-label="Last 4 rolls">
                    {Array.from({ length: 4 }, (_, i) => {
                        const item = session.history[i]
                        const empty = !item
                        const won = !empty && (item.profit || 0) >= 0
                        const label = empty ? '?' : (item.label || '—')
                        return (
                            <div key={i} className={`dice-pip ${empty ? 'empty' : won ? 'won' : 'lost'}`}>
                                <span className="dice-pip-label">{label}</span>
                                <span className="dice-pip-tag">{empty ? 'roll' : won ? 'win' : 'loss'}</span>
                            </div>
                        )
                    })}
                </div>
                <div className="dice-outcome-wrap">
                    <div className={`dice-big ${lastWon === true ? 'win' : lastWon === false ? 'loss' : ''}`}>
                        <NumberRoll value={lastRoll === null ? 0 : Number(lastRoll.toFixed(2))} format={v => lastRoll === null ? '--.--' : v.toFixed(2)} />
                    </div>
                    {lastWon && burstKey > 0 && <Particles key={burstKey} count={20} color="#00e701" />}
                </div>
                <div className="dice-track">
                    <div className="dice-rule">{Array.from({ length: 11 }, (_, i) => <span key={i} data-n={i * 10} style={{ left: `${i * 10}%` }} />)}</div>
                    <div className="dice-safe-zone" style={rollMode === 'under' ? { width: `${winChance}%` } : { left: `${100 - winChance}%`, width: `${winChance}%` }} />
                    <div className={`dice-marker ${lastWon === true ? 'won' : lastWon === false ? 'lost' : ''}`} style={{ left: `${lastRoll ?? 50}%` }}>
                        <span />
                    </div>
                </div>
                <div className="dice-meta-row">
                    <div className="dice-meta-card target">
                        <span>{rollMode === 'under' ? 'Roll Under' : 'Roll Over'}</span>
                        <strong>{rollMode === 'under' ? winChance.toFixed(2) : (100 - winChance).toFixed(2)}</strong>
                    </div>
                    <div className="dice-meta-card chance">
                        <span>Win Chance</span>
                        <strong>{winChance.toFixed(2)}%</strong>
                    </div>
                    <div className="dice-meta-card payout">
                        <span>Multiplier</span>
                        <strong>{payout.toFixed(2)}×</strong>
                    </div>
                </div>
            </div>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={5} />
            <EducationPanel definition={definition} betAmount={5} winProbability={winChance / 100} payoutMultiplier={payout} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
