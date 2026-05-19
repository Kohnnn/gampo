import { useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits } from '../../../utils/simulationMath'
import { nextRoll } from '../../../utils/fairRng'
import { BetPanel, GameShell, HistoryDrawer, StatsOverlay, useGameSession } from '../primitives'
import { Particles } from '../../fx'
import EducationPanel from '../../EducationPanel'
import './hilo.css'

const renderRank = (v) => v === 1 ? 'A' : v === 11 ? 'J' : v === 12 ? 'Q' : v === 13 ? 'K' : String(v)

export default function HiloGame() {
    const definition = findGameDefinition('hilo')
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const session = useGameSession('hilo')

    const [direction, setDirection] = useState('higher')
    const [currentCard, setCurrentCard] = useState(7)
    const [nextCard, setNextCard] = useState(null)
    const [streak, setStreak] = useState(0)
    const [flipping, setFlipping] = useState(false)
    const [lastWon, setLastWon] = useState(null)
    const [burstKey, setBurstKey] = useState(0)

    const winChance = direction === 'higher' ? (13 - currentCard) / 13 : (currentCard - 1) / 13
    const payout = winChance > 0 ? Math.max(1.01, 0.96 / winChance) : 0

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (winChance <= 0) { showToast('error', 'No winning cards', 'Choose other direction'); resolve({ profit: 0 }); return }
        if (!placeBet(betAmount, 'Hi-Lo')) { showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`); resolve({ profit: 0 }); return }
        playSound('flip')
        setFlipping(true)
        const next = Math.floor(nextRoll('hilo').roll * 13) + 1
        const push = next === currentCard
        const won = direction === 'higher' ? next > currentCard : next < currentCard
        const returnAmount = push ? betAmount : won ? betAmount * payout : 0
        const profit = returnAmount - betAmount
        window.setTimeout(() => {
            if (returnAmount > 0) addWinnings(returnAmount, 'Hi-Lo return')
            setNextCard(next)
            setCurrentCard(next)
            setLastWon(push ? null : won)
            setBurstKey(k => k + 1)
            setStreak(prev => won ? prev + 1 : 0)
            setFlipping(false)
            playSound(won ? 'win' : push ? 'click' : 'loss')
            session.record({
                id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
                label: push ? 'Push' : won ? `Win → ${renderRank(next)}` : `Miss → ${renderRank(next)}`,
                profit, betAmount,
                meta: { current: currentCard, next, direction },
            })
            showToast(won ? 'win' : push ? 'bet' : 'loss', push ? 'Push' : won ? 'Hi-Lo hit' : 'Hi-Lo miss', `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
            resolve({ profit })
        }, 600)
    })

    const recentProfit = session.history.slice(0, 12).reduce((s, i) => s + (i.profit || 0), 0)

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#c8a45d"
            backdrop="/assets/games/backdrops/backdrop-felt-green.png"
            panel={
                <BetPanel
                    balance={balance}
                    initialBet={5}
                    runningRound={flipping}
                    actionLabel="Draw Card"
                    onPlay={performPlay}
                >
                    <div className="bp-section">
                        <label className="bp-label">Direction</label>
                        <div className="bp-row">
                            <button className={`bp-bet-btn ${direction === 'higher' ? 'active' : ''}`} onClick={() => setDirection('higher')}>Higher</button>
                            <button className={`bp-bet-btn ${direction === 'lower' ? 'active' : ''}`} onClick={() => setDirection('lower')}>Lower</button>
                        </div>
                    </div>
                    <div className="bp-bal-line">
                        <span>Hit chance</span>
                        <strong>{(winChance * 100).toFixed(1)}%</strong>
                    </div>
                    <div className="bp-bal-line">
                        <span>Payout</span>
                        <strong>{payout.toFixed(2)}×</strong>
                    </div>
                    <div className="bp-bal-line">
                        <span>Streak</span>
                        <strong className={streak >= 3 ? 'hilo-streak-flair' : ''}>{streak}{streak >= 3 ? ' 🔥' : ''}</strong>
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
            <div className={`hilo-stage ${lastWon === true ? 'win-flash' : lastWon === false ? 'loss-flash' : ''}`}>
                <div className="hilo-cards">
                    <span className="hilo-card">{renderRank(currentCard)}</span>
                    <span className="hilo-arrow">{direction === 'higher' ? '↑' : '↓'}</span>
                    <span className={`hilo-card next ${flipping ? 'flipping' : ''} ${lastWon === true ? 'won' : lastWon === false ? 'lost' : ''}`}>{nextCard ? renderRank(nextCard) : '?'}</span>
                </div>
                {lastWon && burstKey > 0 && <Particles key={burstKey} count={12} color="#ffcf5a" />}
            </div>
            <EducationPanel definition={definition} betAmount={5} winProbability={winChance || 0.01} payoutMultiplier={payout || 1} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
