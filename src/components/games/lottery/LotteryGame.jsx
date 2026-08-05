import { useEffect, useRef, useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { useSfx } from '../../../audio/useSfx'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits, sampleUniqueNumbers } from '../../../utils/simulationMath'
import { nextRoll } from '../../../utils/fairRng'
import { getBigWinThreshold, BetPanel, BigWinOverlay, CoreStageFrame, GameShell, HistoryDrawer, RecentResultsStrip, StatsOverlay, useGameSession, ResultToast, ActionLockOverlay } from '../primitives'
import { Particles } from '../../fx'
import EducationPanel from '../../EducationPanel'
import './lottery.css'
import { useGameBgm } from '../../../audio/useBgm'

// Prize table indexed by hits (pick-5, draw-5 from 36). Calibrated so the
// expected return is ~0.90 RTP under the true hypergeometric hit distribution
// (P(2)=0.1192, P(3)=0.0123, P(4)=4.1e-4, P(5)=3e-6). The previous table
// [0,0,1,8,120,5000] only returned ~28% — far below the stated 90%.
const TABLE = [0, 0, 4, 25, 250, 5000]

export default function LotteryGame() {
    useGameBgm('lottery', 'idle')
    const definition = findGameDefinition('lottery')
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const sfx = useSfx('lottery')
    const session = useGameSession('lottery')

    const [selected, setSelected] = useState([3, 9, 14, 21, 32])
    const [drawAnim, setDrawAnim] = useState([])
    const [drawing, setDrawing] = useState(false)
    const [burstKey, setBurstKey] = useState(0)
    const [lastWon, setLastWon] = useState(null)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [lastBet, setLastBet] = useState(null)
    const [toast, setToast] = useState(null)
    const [settling, setSettling] = useState(false)
    const settleTimer = useRef(null)

    useEffect(() => () => {
        if (settleTimer.current) window.clearTimeout(settleTimer.current)
    }, [])

    const toggle = (n) => {
        if (drawing) return
        setSelected(prev => prev.includes(n) ? prev.filter(x => x !== n) : prev.length < 5 ? [...prev, n].sort((a, b) => a - b) : prev)
    }

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (selected.length !== 5) { showToast('error', 'Pick 5 numbers', 'Lottery requires 5 picks'); resolve({ profit: 0 }); return }
        if (!placeBet(betAmount, 'Lottery')) { showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`); resolve({ profit: 0 }); return }
        setLastBet(betAmount)
        playSound('tick')
        setToast(null)
        setDrawing(true); setDrawAnim([])
        const next = sampleUniqueNumbers({ max: 36, count: 5, random: () => nextRoll('lottery').roll })
        next.forEach((n, i) => window.setTimeout(() => { playSound('flip'); setDrawAnim(prev => [...prev, n]) }, 400 + i * 350))
        const hits = selected.filter(n => next.includes(n)).length
        const multiplier = TABLE[hits]
        const returnAmount = betAmount * multiplier
        const profit = returnAmount - betAmount
        window.setTimeout(() => {
            if (returnAmount > 0) addWinnings(returnAmount, 'Lottery return')
            setLastWon(returnAmount > 0)
            setBurstKey(k => k + 1)
            setDrawing(false)
            setSettling(true)
            if (settleTimer.current) window.clearTimeout(settleTimer.current)
            settleTimer.current = window.setTimeout(() => setSettling(false), 220)
            if (multiplier >= 8) {
                playSound('bigwin')
                sfx.play('win')
                setBigWin({ trigger: Date.now(), profit, multiplier })
            } else {
                playSound(returnAmount > 0 ? 'win' : 'loss')
                if (returnAmount > 0) sfx.play('win'); else sfx.play('lose')
            }
            setToast({
                kind: profit >= 0 ? 'win' : 'lose',
                multiplier: multiplier > 0 ? multiplier : null,
                amount: profit,
                message: `${hits}/5 numbers hit`,
            })
            session.record({ id: crypto.randomUUID(), label: `${hits}/5`, profit, betAmount, multiplier, meta: { picked: selected, drawn: next } })
            showToast(profit >= 0 ? 'win' : 'loss', `Lottery ${hits} hits`, `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
            resolve({ profit })
        }, 400 + next.length * 350 + 200)
    })

    const recentProfit = session.history.slice(0, 12).reduce((s, i) => s + (i.profit || 0), 0)

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#ffcf5a"
            backdrop="/assets/games/backdrops/backdrop-felt-navy.png"
            panel={
                <BetPanel balance={balance} initialBet={5} runningRound={drawing} actionLabel="Draw Lottery" onPlay={performPlay} lastBet={lastBet}>
                    <button className="bp-bet-btn" disabled={drawing} onClick={() => setSelected(sampleUniqueNumbers({ max: 36, count: 5, random: () => nextRoll('lottery').roll }))}>Quick pick</button>
                    <div className="bp-bal-line"><span>Selected</span><strong>{selected.length}/5</strong></div>
                </BetPanel>
            }
            aside={<><StatsOverlay stats={session.stats} definition={definition} /><HistoryDrawer history={session.history} onClear={session.clear} /></>}
        >
            <CoreStageFrame minHeight={520} maxWidth={780} mobileScrollable className="lottery-stage-frame">
            <div className="lottery-stage">
                <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />
                <div className={`lot-tumbler ${drawing ? 'shaking' : ''} ${settling ? 'settling' : ''}`}>
                    {/* Idle: rotating drum with ghost balls so the panel is never empty. */}
                    {drawAnim.length === 0 && !drawing && (
                        <div className="lot-drum" aria-hidden="true">
                            <span className="lot-drum-ball b1">7</span>
                            <span className="lot-drum-ball b2">14</span>
                            <span className="lot-drum-ball b3">22</span>
                            <span className="lot-drum-ball b4">31</span>
                            <span className="lot-tumbler-hint">Pick 5 · then Draw</span>
                        </div>
                    )}
                    {drawAnim.map((n, i) => <span key={`${n}-${i}`} className="lot-ball">{n}</span>)}
                </div>
                <div className="lot-grid" data-mobile-critical-surface>
                    {Array.from({ length: 36 }, (_, i) => i + 1).map(n => {
                        const isSel = selected.includes(n)
                        const isDr = drawAnim.includes(n)
                        const isHit = isSel && isDr
                        return (
                            <button key={n}
                                className={`${isSel ? 'selected' : ''} ${isDr ? 'drawn' : ''} ${isHit ? 'hit' : ''}`}
                                disabled={drawing}
                                onClick={() => toggle(n)}>{n}</button>
                        )
                    })}
                </div>
                {burstKey > 0 && lastWon && <Particles key={burstKey} count={20} color="#ffcf5a" />}
                <ActionLockOverlay active={drawing} label="Drawing..." interactive />
                <ResultToast result={toast} onDismiss={() => setToast(null)} />
            </div>
            </CoreStageFrame>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={getBigWinThreshold('lottery')} />
            <EducationPanel definition={definition} betAmount={5} winProbability={1 / 376992} payoutMultiplier={5000} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
