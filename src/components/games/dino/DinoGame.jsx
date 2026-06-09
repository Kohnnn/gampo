// Dino — survival run on the shared shell. Each "step" the dino faces a
// procedurally-rolled obstacle whose survival chance depends on the chosen
// difficulty. Cleared steps multiply the bet; cashout banks the current
// multiplier; failure ends the run at -bet.
//
// Visual core uses an in-canvas engine (DinoEngine) driven by the Chrome
// dino sprite atlas at /dino-assets/sprites/dino-atlas.png.

import { useEffect, useRef, useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits } from '../../../utils/simulationMath'
import { nextRoll } from '../../../utils/fairRng'
import { useCancellableTimeouts } from '../../../utils/scheduling'
import { BetPanel, BigWinOverlay, CoreStageFrame, GameShell, HistoryDrawer, RecentResultsStrip, StatsOverlay, useGameSession } from '../primitives'
import { Particles } from '../../fx'
import EducationPanel from '../../EducationPanel'
import DinoEngine from './engine/DinoEngine'
import './dino.css'
import { useGameBgm } from '../../../audio/useBgm'

// Growth per preset is locked to TARGET_RTP / safe so each surviving step has
// an expected value of exactly TARGET_RTP (no preset is ever +EV). Previously
// `easy` used a fixed growth of 1.18 against safe 0.86 → 1.0148 per step, i.e.
// player-favorable and uncapped — optimal play was "never cash out".
// TARGET_RTP matches Dino's advertised 99% (gameDefinitions: rtp 0.99).
const TARGET_RTP = 0.99
const lockGrowth = safe => Number((TARGET_RTP / safe).toFixed(4))
const PRESETS = {
    easy:    { safe: 0.86, growth: lockGrowth(0.86), label: 'Easy',    speed: 240 },
    medium:  { safe: 0.72, growth: lockGrowth(0.72), label: 'Medium',  speed: 290 },
    hard:    { safe: 0.58, growth: lockGrowth(0.58), label: 'Hard',    speed: 340 },
    extreme: { safe: 0.42, growth: lockGrowth(0.42), label: 'Extreme', speed: 400 },
}

export default function DinoGame() {
    useGameBgm('dino', 'idle')
    const definition = findGameDefinition('dino') || { name: 'Dino', category: 'Originals' }
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const session = useGameSession('dino-shell')

    const canvasRef = useRef(null)
    const engineRef = useRef(null)

    const [difficulty, setDifficulty] = useState('medium')
    const [phase, setPhase] = useState('idle') // idle | running | crashed | cashed
    const [steps, setSteps] = useState(0)
    const [stake, setStake] = useState(0)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [burstKey, setBurstKey] = useState(0)
    const [lastBet, setLastBet] = useState(null)
    const { schedule, cancelAll } = useCancellableTimeouts()

    const config = PRESETS[difficulty]
    const multiplier = Number(Math.pow(config.growth, steps).toFixed(2))
    const inRound = phase === 'running'

    // Mount engine
    useEffect(() => {
        if (!canvasRef.current) return
        const engine = new DinoEngine(canvasRef.current, {
            onStep: () => { /* obstacle cleared visually; betting step is rolled by jump() below */ },
            onDie:  () => { /* engine-detected death; not used since betting drives phase */ },
        })
        engine.start()
        engineRef.current = engine
        return () => { engine.stop(); engineRef.current = null }
    }, [])

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (inRound) { resolve({ profit: 0 }); return }
        if (!placeBet(betAmount, 'Dino')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            resolve({ profit: 0 }); return
        }
        setLastBet(betAmount)
        setStake(betAmount)
        setSteps(0)
        engineRef.current?.beginRun(config.speed)
        setPhase('running')
        playSound('click')
        resolve({ profit: 0 })
    })

    const jump = () => {
        if (!inRound) return
        const { roll } = nextRoll('dino')
        const survive = roll < config.safe
        engineRef.current?.jump(survive ? 1.0 : 0.55)
        if (survive) {
            playSound('flip')
            setSteps(prev => prev + 1)
            return
        }
        playSound('explode')
        engineRef.current?.die()
        session.record({
            id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
            label: `Crashed step ${steps}`,
            profit: -stake, betAmount: stake,
            meta: { difficulty, steps },
        })
        showToast('loss', 'Dino fell', `-${formatCredits(stake)}`)
        setPhase('crashed')
        schedule(() => {
            setPhase('idle'); setSteps(0)
            engineRef.current?.endRun()
        }, 1300)
    }

    const cashOut = () => {
        if (!inRound || steps === 0) return
        const m = Number(Math.pow(config.growth, steps).toFixed(2))
        const profit = stake * m - stake
        addWinnings(stake * m, 'Dino return')
        if (m >= 5) {
            playSound('bigwin')
            setBigWin({ trigger: Date.now(), profit, multiplier: m })
        } else {
            playSound('win')
        }
        setBurstKey(k => k + 1)
        session.record({
            id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
            label: `${m.toFixed(2)}× cashout`,
            profit, betAmount: stake, multiplier: m,
            meta: { difficulty, steps },
        })
        showToast('win', 'Dino cashed out', `+${formatCredits(profit)}`)
        setPhase('cashed')
        schedule(() => {
            setPhase('idle'); setSteps(0)
            engineRef.current?.endRun()
        }, 1300)
    }

    const recentProfit = session.history.slice(0, 12).reduce((s, i) => s + (i.profit || 0), 0)

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#9bf08a"
            backdrop="/assets/games/backdrops/backdrop-felt-green.png"
            panel={
                <BetPanel
                    balance={balance}
                    initialBet={5}
                    runningRound={false}
                    actionLabel="Start Run"
                    onPlay={performPlay}
                    disableAuto
                    lastBet={lastBet}
                    playPhase={inRound && steps > 0 ? 'in-round' : null}
                    playLabel={inRound && steps > 0 ? `Cashout ${multiplier.toFixed(2)}×` : 'Start Run'}
                    onPlayPhaseAction={cashOut}
                >
                    <div className="bp-section">
                        <label className="bp-label">Difficulty</label>
                        <div className="bp-row">
                            {Object.entries(PRESETS).map(([k, p]) => (
                                <button key={k} disabled={inRound} className={`bp-bet-btn ${difficulty === k ? 'active' : ''}`} onClick={() => setDifficulty(k)}>{p.label}</button>
                            ))}
                        </div>
                    </div>
                    <div className="bp-bal-line"><span>Step</span><strong>{steps}</strong></div>
                    <div className="bp-bal-line"><span>Multiplier</span><strong>{multiplier.toFixed(2)}×</strong></div>
                </BetPanel>
            }
            aside={
                <>
                    <StatsOverlay stats={session.stats} definition={definition} />
                    <HistoryDrawer history={session.history} onClear={session.clear} />
                </>
            }
        >
            <CoreStageFrame minHeight={380} maxWidth={760} className="dino-stage-frame">
            <div className={`dino-stage phase-${phase}`}>
                <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />
                <div className="dino-scene">
                    <canvas ref={canvasRef} className="dino-canvas" aria-label="Dino runner" />
                </div>
                <div className="dino-action-row">
                    <button className="dino-jump" disabled={!inRound} onClick={jump}>Jump · safe {(config.safe * 100).toFixed(0)}%</button>
                </div>
                {phase === 'cashed' && burstKey > 0 && <Particles key={burstKey} count={16} color="#9bf08a" />}
            </div>
            </CoreStageFrame>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={5} />
            <EducationPanel definition={definition} betAmount={5} winProbability={config.safe} payoutMultiplier={multiplier || config.growth} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
