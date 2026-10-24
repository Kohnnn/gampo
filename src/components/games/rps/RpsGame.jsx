import { useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { useSfx } from '../../../audio/useSfx'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits, round2 } from '../../../utils/simulationMath'
import { useCancellableTimeouts } from '../../../utils/scheduling'
import { nextRoll } from '../../../utils/fairRng'
import { funBoostedRtp } from '../../../utils/funMode'
import { getBigWinThreshold, BetPanel, BigWinOverlay, CoreStageFrame, GameShell, HistoryDrawer, RecentResultsStrip, StatsOverlay, useGameSession, ResultToast, ActionLockOverlay } from '../primitives'
import { Particles } from '../../fx'
import EducationPanel from '../../EducationPanel'
import './rps.css'
import { useGameBgm } from '../../../audio/useBgm'

const OPTIONS = [
    { id: 'rock', label: 'Rock', hand: '✊', beats: 'scissors' },
    { id: 'paper', label: 'Paper', hand: '✋', beats: 'rock' },
    { id: 'scissors', label: 'Scissors', hand: '✌️', beats: 'paper' },
]

export default function RpsGame() {
    const { schedule } = useCancellableTimeouts()
    useGameBgm('rps', 'idle')
    const definition = findGameDefinition('rps')
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const sfx = useSfx('rps')
    const session = useGameSession('rps')

    const [choice, setChoice] = useState('rock')
    const [house, setHouse] = useState(null)
    const [phase, setPhase] = useState('idle')
    const [lastWon, setLastWon] = useState(null)
    const [burstKey, setBurstKey] = useState(0)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [lastBet, setLastBet] = useState(null)
    const [toast, setToast] = useState(null)
    // RTP-lock: P(win)=P(push)=1/3. A push refunds the stake (EV-neutral 1/3),
    // so RTP = payout/3 + 1/3. Solving for 97% RTP → payout = 1.91 (was 2.91,
    // which combined with the push refund gave a player-favourable 130% RTP).
    const RPS_RTP = 0.97
    const effectiveRtp = funBoostedRtp(RPS_RTP)
    const payout = round2(effectiveRtp * 3 - 1)

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (!placeBet(betAmount, 'RPS')) { showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`); resolve({ profit: 0 }); return }
        setLastBet(betAmount)
        const player = OPTIONS.find(o => o.id === choice)
        const dealer = OPTIONS[Math.floor(nextRoll('rps').roll * 3)]
        const push = player.id === dealer.id
        const won = player.beats === dealer.id
        const returnAmount = push ? betAmount : won ? round2(betAmount * payout) : 0
        const profit = round2(returnAmount - betAmount)
        const multiplier = push ? 1 : won ? payout : 0
        playSound('tick')
        setToast(null)
        setPhase('slamming')
        schedule(() => {
            if (returnAmount > 0) addWinnings(returnAmount, 'RPS return')
            setHouse(dealer)
            setLastWon(push ? null : won)
            setBurstKey(k => k + 1)
            setPhase(push ? 'push' : won ? 'won' : 'lost')
            if (won) {
                playSound('bigwin')
                sfx.play('win')
                setBigWin({ trigger: Date.now(), profit, multiplier: payout })
            } else {
                playSound(push ? 'click' : 'loss')
                if (!push) sfx.play('lose')
            }
            setToast({
                kind: won ? 'win' : push ? 'push' : 'lose',
                multiplier,
                amount: profit,
                message: push ? 'Push — stake returned' : won ? 'RPS win' : 'RPS miss',
            })
            session.record({
                id: crypto.randomUUID(),
                label: push ? 'Push' : won ? 'Win' : 'Miss',
                profit, betAmount, multiplier,
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
            primaryStage
            secondary={<>
                <RecentResultsStrip results={session.stats.lastResults} />
                <EducationPanel definition={definition} effectiveRtp={effectiveRtp} betAmount={5} winProbability={1 / 3} payoutMultiplier={payout} balance={balance} recentProfit={recentProfit} />
            </>}
            panel={
                <BetPanel balance={balance} initialBet={5} runningRound={phase === 'slamming'} actionLabel="Play Round" mobilePlayLabel="Play" onPlay={performPlay} lastBet={lastBet}>
                    <div className="bp-section">
                        <label className="bp-label">Pick</label>
                        <div className="rps-choices">
                            {OPTIONS.map(o => (
                                <button key={o.id} className={`rps-choice ${choice === o.id ? 'active' : ''}`} disabled={phase === 'slamming'} onClick={() => setChoice(o.id)}>
                                    <span className="rps-hand" aria-hidden="true">{o.hand}</span>
                                    <span>{o.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="bp-bal-line"><span>Payout</span><strong>{payout.toFixed(2)}×</strong></div>
                </BetPanel>
            }
            aside={<><StatsOverlay stats={session.stats} definition={definition} effectiveRtp={effectiveRtp} /><HistoryDrawer history={session.history} onClear={session.clear} /></>}
        >
            <CoreStageFrame maxWidth={780} className="rps-stage-frame gs-primary-stage">
            <div className={`rps-stage ${lastWon === true ? 'win-flash' : lastWon === false ? 'loss-flash' : ''}`}>
                <div className="rps-stage-choices" data-mobile-critical-surface>
                    {OPTIONS.map(o => (
                        <button
                            key={o.id}
                            type="button"
                            className={choice === o.id ? 'active' : ''}
                            disabled={phase === 'slamming'}
                            onClick={() => setChoice(o.id)}
                        >
                            <span className="rps-hand" aria-hidden="true">{o.hand}</span>
                            <strong>{o.label}</strong>
                        </button>
                    ))}
                </div>
                <div className={`rps-versus phase-${phase}`}>
                    <div className={`rps-side player ${phase === 'won' ? 'winner' : phase === 'lost' ? 'loser' : ''}`}>
                        <span>You</span>
                        <span className="rps-hand" role="img" aria-label={OPTIONS.find(o => o.id === choice).label}>{OPTIONS.find(o => o.id === choice).hand}</span>
                    </div>
                    <strong className={`rps-vs ${phase === 'push' ? 'fx-shake' : ''}`}>VS</strong>
                    <div className={`rps-side dealer ${phase === 'lost' ? 'winner' : phase === 'won' ? 'loser' : ''}`}>
                        <span>Lab</span>
                        {house ? <span className="rps-hand" role="img" aria-label={house.label}>{house.hand}</span> : <span style={{ fontSize: 60, opacity: 0.4 }}>?</span>}
                    </div>
                </div>
                {lastWon && burstKey > 0 && <Particles key={burstKey} count={14} color="#00e701" />}
                <ActionLockOverlay active={phase === 'slamming'} label="Throwing..." />
                <ResultToast result={toast} onDismiss={() => setToast(null)} />
            </div>
            </CoreStageFrame>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={getBigWinThreshold('rps')} />
        </GameShell>
    )
}
