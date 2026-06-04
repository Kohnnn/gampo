import { useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits } from '../../../utils/simulationMath'
import { nextRoll } from '../../../utils/fairRng'
import { BetPanel, BigWinOverlay, GameShell, HistoryDrawer, RecentResultsStrip, StatsOverlay, useGameSession, Asset } from '../primitives'
import { Particles } from '../../fx'
import EducationPanel from '../../EducationPanel'
import './coinflip.css'
import { useGameBgm } from '../../../audio/useBgm'

const HEAD = '/assets/games/coin/coin-heads.png'
const TAIL = '/assets/games/coin/coin-tails.png'

export default function CoinFlipGame() {
    useGameBgm('coinflip', 'idle')
    const definition = findGameDefinition('coinflip')
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const session = useGameSession('coinflip')

    const [choice, setChoice] = useState('head')
    const [flipping, setFlipping] = useState(false)
    const [lastWon, setLastWon] = useState(null)
    const [burstKey, setBurstKey] = useState(0)
    const [lastBet, setLastBet] = useState(null)
    const payout = 1.96

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (!placeBet(betAmount, 'Coin Flip')) { showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`); resolve({ profit: 0 }); return }
        setLastBet(betAmount)
        playSound('flip')
        setFlipping(true)
        const next = nextRoll('coinflip').roll < 0.5 ? 'head' : 'tail'
        const won = next === choice
        const returnAmount = won ? betAmount * payout : 0
        const profit = returnAmount - betAmount
        window.setTimeout(() => {
            if (returnAmount > 0) addWinnings(returnAmount, 'Coin Flip return')
            setLastWon(won)
            setBurstKey(k => k + 1)
            setFlipping(false)
            playSound(won ? 'win' : 'loss')
            session.record({ id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, label: next, profit, betAmount, multiplier: won ? payout : 0 })
            showToast(won ? 'win' : 'loss', won ? 'Coin matched' : 'Coin missed', `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
            resolve({ profit })
        }, 900)
    })

    const recentProfit = session.history.slice(0, 12).reduce((s, i) => s + (i.profit || 0), 0)

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#ffcf5a"
            backdrop="/assets/games/backdrops/backdrop-felt-navy.png"
            panel={
                <BetPanel balance={balance} initialBet={5} runningRound={flipping} actionLabel="Flip Coin" onPlay={performPlay} lastBet={lastBet}>
                    <div className="bp-section">
                        <label className="bp-label">Pick</label>
                        <div className="coin-choices">
                            <button className={`coin-choice ${choice === 'head' ? 'active' : ''}`} disabled={flipping} onClick={() => setChoice('head')}>
                                <Asset src={HEAD} fallback={<span style={{ fontSize: 32 }}>👑</span>} /><span>Heads</span>
                            </button>
                            <button className={`coin-choice ${choice === 'tail' ? 'active' : ''}`} disabled={flipping} onClick={() => setChoice('tail')}>
                                <Asset src={TAIL} fallback={<span style={{ fontSize: 32 }}>✦</span>} /><span>Tails</span>
                            </button>
                        </div>
                    </div>
                    <div className="bp-bal-line"><span>Payout</span><strong>{payout.toFixed(2)}×</strong></div>
                </BetPanel>
            }
            aside={<><StatsOverlay stats={session.stats} definition={definition} /><HistoryDrawer history={session.history} onClear={session.clear} /></>}
        >
            <div className={`coinflip-stage ${lastWon === true ? 'win-flash' : lastWon === false ? 'loss-flash' : ''}`}>
                <RecentResultsStrip results={session.stats.lastResults} />
                <div className="coin-stage-choices" data-mobile-critical-surface>
                    <button className={choice === 'head' ? 'active' : ''} disabled={flipping} onClick={() => setChoice('head')}>
                        Heads
                    </button>
                    <button className={choice === 'tail' ? 'active' : ''} disabled={flipping} onClick={() => setChoice('tail')}>
                        Tails
                    </button>
                </div>
                <div className={`coin3d-stage ${flipping ? 'flipping' : ''}`}>
                    <div className="coin3d">
                        <div className="coin3d-face front"><Asset src={HEAD} fallback={<span style={{ fontSize: 48 }}>👑</span>} /></div>
                        <div className="coin3d-face back"><Asset src={TAIL} fallback={<span style={{ fontSize: 48 }}>✦</span>} /></div>
                        <div className="coin3d-edge" />
                    </div>
                </div>
                {lastWon && burstKey > 0 && <Particles key={burstKey} count={16} color="#ffcf5a" />}
            </div>
            <EducationPanel definition={definition} betAmount={5} winProbability={0.5} payoutMultiplier={payout} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
