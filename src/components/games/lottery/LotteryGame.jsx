import { useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits, sampleUniqueNumbers } from '../../../utils/simulationMath'
import { nextRoll } from '../../../utils/fairRng'
import { BetPanel, BigWinOverlay, GameShell, HistoryDrawer, RecentResultsStrip, StatsOverlay, useGameSession } from '../primitives'
import { Particles } from '../../fx'
import EducationPanel from '../../EducationPanel'
import './lottery.css'

const TABLE = [0, 0, 1, 8, 120, 5000]

export default function LotteryGame() {
    const definition = findGameDefinition('lottery')
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const session = useGameSession('lottery')

    const [selected, setSelected] = useState([3, 9, 14, 21, 32])
    const [drawAnim, setDrawAnim] = useState([])
    const [drawing, setDrawing] = useState(false)
    const [burstKey, setBurstKey] = useState(0)
    const [lastWon, setLastWon] = useState(null)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [lastBet, setLastBet] = useState(null)

    const toggle = (n) => {
        if (drawing) return
        setSelected(prev => prev.includes(n) ? prev.filter(x => x !== n) : prev.length < 5 ? [...prev, n].sort((a, b) => a - b) : prev)
    }

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (selected.length !== 5) { showToast('error', 'Pick 5 numbers', 'Lottery requires 5 picks'); resolve({ profit: 0 }); return }
        if (!placeBet(betAmount, 'Lottery')) { showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`); resolve({ profit: 0 }); return }
        setLastBet(betAmount)
        playSound('tick')
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
            if (multiplier >= 8) {
                playSound('bigwin')
                setBigWin({ trigger: Date.now(), profit, multiplier })
            } else {
                playSound(returnAmount > 0 ? 'win' : 'loss')
            }
            session.record({ id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, label: `${hits}/5`, profit, betAmount, multiplier, meta: { picked: selected, drawn: next } })
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
            <div className="lottery-stage">
                <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />
                <div className={`lot-tumbler ${drawing ? 'shaking' : ''}`}>
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
                <div className="lot-grid">
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
            </div>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={8} />
            <EducationPanel definition={definition} betAmount={5} winProbability={1 / 376992} payoutMultiplier={5000} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
