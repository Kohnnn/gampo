import { useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits } from '../../../utils/simulationMath'
import { nextRoll } from '../../../utils/fairRng'
import { BetPanel, BigWinOverlay, GameShell, HistoryDrawer, RecentResultsStrip, StatsOverlay, useGameSession, Asset } from '../primitives'
import { Particles } from '../../fx'
import EducationPanel from '../../EducationPanel'
import './rps.css'

const OPTIONS = [
    { id: 'rock', label: 'Rock', img: '/assets/games/rps/rps-rock.png', emoji: '🪨', beats: 'scissors' },
    { id: 'paper', label: 'Paper', img: '/assets/games/rps/rps-paper.png', emoji: '📄', beats: 'rock' },
    { id: 'scissors', label: 'Scissors', img: '/assets/games/rps/rps-scissors.png', emoji: '✂️', beats: 'paper' },
]

export default function RpsGame() {
    const definition = findGameDefinition('rps')
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const session = useGameSession('rps')

    const [choice, setChoice] = useState('rock')
    const [house, setHouse] = useState(null)
    const [phase, setPhase] = useState('idle')
    const [lastWon, setLastWon] = useState(null)
    const [burstKey, setBurstKey] = useState(0)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [lastBet, setLastBet] = useState(null)
    const payout = 2.91

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (!placeBet(betAmount, 'RPS')) { showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`); resolve({ profit: 0 }); return }
        setLastBet(betAmount)
        const player = OPTIONS.find(o => o.id === choice)
        const dealer = OPTIONS[Math.floor(nextRoll('rps').roll * 3)]
        const push = player.id === dealer.id
        const won = player.beats === dealer.id
        const returnAmount = push ? betAmount : won ? betAmount * payout : 0
        const profit = returnAmount - betAmount
        playSound('tick')
        setPhase('slamming')
        window.setTimeout(() => {
            if (returnAmount > 0) addWinnings(returnAmount, 'RPS return')
            setHouse(dealer)
            setLastWon(push ? null : won)
            setBurstKey(k => k + 1)
            setPhase(push ? 'push' : won ? 'won' : 'lost')
            if (won) {
                playSound('bigwin')
                setBigWin({ trigger: Date.now(), profit, multiplier: payout })
            } else {
                playSound(push ? 'click' : 'loss')
            }
            session.record({
                id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
                label: push ? 'Push' : won ? 'Win' : 'Miss',
                profit, betAmount, multiplier: won ? payout : 0,
                meta: { player: player.id, dealer: dealer.id },
            })
            showToast(won ? 'win' : push ? 'bet' : 'loss', push ? 'Push' : won ? 'RPS win' : 'RPS miss', `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
            resolve({ profit })
        }, 600)
    })

    const recentProfit = session.history.slice(0, 12).reduce((s, i) => s + (i.profit || 0), 0)

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#ef476f"
            backdrop="/assets/games/backdrops/backdrop-neon-grid.png"
            panel={
                <BetPanel balance={balance} initialBet={5} runningRound={phase === 'slamming'} actionLabel="Play Round" onPlay={performPlay} lastBet={lastBet}>
                    <div className="bp-section">
                        <label className="bp-label">Pick</label>
                        <div className="rps-choices">
                            {OPTIONS.map(o => (
                                <button key={o.id} className={`rps-choice ${choice === o.id ? 'active' : ''}`} disabled={phase === 'slamming'} onClick={() => setChoice(o.id)}>
                                    <Asset src={o.img} fallback={<span style={{ fontSize: 28 }}>{o.emoji}</span>} />
                                    <span>{o.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="bp-bal-line"><span>Payout</span><strong>{payout.toFixed(2)}×</strong></div>
                </BetPanel>
            }
            aside={<><StatsOverlay stats={session.stats} definition={definition} /><HistoryDrawer history={session.history} onClear={session.clear} /></>}
        >
            <div className={`rps-stage ${lastWon === true ? 'win-flash' : lastWon === false ? 'loss-flash' : ''}`}>
                <RecentResultsStrip results={session.stats.lastResults} />
                <div className={`rps-versus phase-${phase}`}>
                    <div className={`rps-side player ${phase === 'won' ? 'winner' : phase === 'lost' ? 'loser' : ''}`}>
                        <span>You</span>
                        <Asset src={OPTIONS.find(o => o.id === choice).img} fallback={<span style={{ fontSize: 60 }}>{OPTIONS.find(o => o.id === choice).emoji}</span>} />
                    </div>
                    <strong className={`rps-vs ${phase === 'push' ? 'fx-shake' : ''}`}>VS</strong>
                    <div className={`rps-side dealer ${phase === 'lost' ? 'winner' : phase === 'won' ? 'loser' : ''}`}>
                        <span>Lab</span>
                        {house ? <Asset src={house.img} fallback={<span style={{ fontSize: 60 }}>{house.emoji}</span>} /> : <span style={{ fontSize: 60, opacity: 0.4 }}>?</span>}
                    </div>
                </div>
                {lastWon && burstKey > 0 && <Particles key={burstKey} count={14} color="#00e701" />}
            </div>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={2.5} />
            <EducationPanel definition={definition} betAmount={5} winProbability={1 / 3} payoutMultiplier={payout} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
