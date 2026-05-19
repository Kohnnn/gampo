import { useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits, kenoPayout, sampleUniqueNumbers } from '../../../utils/simulationMath'
import { nextRoll } from '../../../utils/fairRng'
import { BetPanel, GameShell, HistoryDrawer, StatsOverlay, useGameSession } from '../primitives'
import { Particles } from '../../fx'
import EducationPanel from '../../EducationPanel'
import './keno.css'

export default function KenoGame() {
    const definition = findGameDefinition('keno')
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const session = useGameSession('keno')

    const [selected, setSelected] = useState([4, 8, 15, 16, 23])
    const [drawAnim, setDrawAnim] = useState([])
    const [drawing, setDrawing] = useState(false)
    const [burstKey, setBurstKey] = useState(0)

    const toggle = (n) => {
        if (drawing) return
        setSelected(prev => prev.includes(n) ? prev.filter(x => x !== n) : prev.length < 10 ? [...prev, n].sort((a, b) => a - b) : prev)
    }

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (selected.length === 0) { resolve({ profit: 0 }); return }
        if (!placeBet(betAmount, 'Keno')) { showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`); resolve({ profit: 0 }); return }
        playSound('tick')
        setDrawing(true); setDrawAnim([])
        const picks = sampleUniqueNumbers({ max: 40, count: 10, random: () => nextRoll('keno').roll })
        picks.forEach((n, i) => window.setTimeout(() => { playSound('flip'); setDrawAnim(prev => [...prev, n]) }, 200 + i * 220))
        const hits = selected.filter(n => picks.includes(n)).length
        const multiplier = kenoPayout(selected.length, hits)
        const returnAmount = betAmount * multiplier
        const profit = returnAmount - betAmount
        window.setTimeout(() => {
            if (returnAmount > 0) addWinnings(returnAmount, 'Keno return')
            setBurstKey(k => k + 1); setDrawing(false)
            playSound(returnAmount > 0 ? 'win' : 'loss')
            session.record({ id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, label: `${hits}/${selected.length}`, profit, betAmount, multiplier })
            showToast(profit >= 0 ? 'win' : 'loss', `Keno ${hits} hits`, `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
            resolve({ profit })
        }, 200 + picks.length * 220 + 200)
    })

    const recentProfit = session.history.slice(0, 12).reduce((s, i) => s + (i.profit || 0), 0)
    const estimatedChance = selected.length ? selected.length / 40 : 0

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#ffcf5a"
            backdrop="/assets/games/backdrops/backdrop-felt-navy.png"
            panel={
                <BetPanel balance={balance} initialBet={5} runningRound={drawing} actionLabel="Draw Keno" onPlay={performPlay}>
                    <button className="bp-bet-btn" disabled={drawing} onClick={() => setSelected(sampleUniqueNumbers({ max: 40, count: 5, random: () => nextRoll('keno').roll }))}>Quick pick 5</button>
                    <div className="bp-bal-line"><span>Selected</span><strong>{selected.length}/10</strong></div>
                </BetPanel>
            }
            aside={<><StatsOverlay stats={session.stats} definition={definition} /><HistoryDrawer history={session.history} onClear={session.clear} /></>}
        >
            <div className="keno-stage">
                <div className="keno-grid">
                    {Array.from({ length: 40 }, (_, i) => i + 1).map(n => {
                        const isSel = selected.includes(n)
                        const isDr = drawAnim.includes(n)
                        const isHit = isSel && isDr
                        const idx = isDr ? drawAnim.indexOf(n) : -1
                        return (
                            <button key={n}
                                className={`${isSel ? 'selected' : ''} ${isDr ? 'drawn' : ''} ${isHit ? 'hit' : ''}`}
                                style={isDr ? { animationDelay: `${idx * 30}ms` } : undefined}
                                onClick={() => toggle(n)}>{n}</button>
                        )
                    })}
                </div>
                {burstKey > 0 && session.history[0]?.profit > 0 && <Particles key={burstKey} count={16} color="#ffcf5a" />}
            </div>
            <EducationPanel definition={definition} betAmount={5} winProbability={estimatedChance} payoutMultiplier={kenoPayout(Math.max(1, selected.length), Math.max(1, Math.ceil(selected.length / 2)))} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
