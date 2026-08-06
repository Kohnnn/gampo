import { useCallback, useRef, useState } from 'react'
import { useScrollActionIntoView } from '../../../hooks/useScrollActionIntoView'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { useSfx } from '../../../audio/useSfx'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits, round2 } from '../../../utils/simulationMath'
import { nextRoll } from '../../../utils/fairRng'
import { useCancellableTimeouts } from '../../../utils/scheduling'
import { getBigWinThreshold,
    BetPanel,
    BigWinOverlay,
    GameShell,
    HistoryDrawer,
    RecentResultsStrip,
    StatsOverlay,
    useGameSession,
    MultiplierBadge,
    ResultToast,
    ActionLockOverlay,
    CoreStageFrame,
    ROUND_EVENTS,
    useRoundMachine,
    StageActionButton,
} from '../primitives'
import { useOriginalsPreloader } from '../../games/resources/useOriginalsPreloader'
import { Particles } from '../../fx'
import EducationPanel from '../../EducationPanel'
import './chickencross.css'
import { useGameBgm } from '../../../audio/useBgm'

// RTP-locked growth: per-step EV = safe × growth = CHICKEN_RTP (was fixed
// growth → easy 100.3% player-favourable, hard 89.9% too stingy).
const CHICKEN_RTP = 0.98
const PRESETS = {
    easy: { safe: 0.85, growth: Number((CHICKEN_RTP / 0.85).toFixed(4)), label: 'Easy' },
    medium: { safe: 0.72, growth: Number((CHICKEN_RTP / 0.72).toFixed(4)), label: 'Medium' },
    hard: { safe: 0.58, growth: Number((CHICKEN_RTP / 0.58).toFixed(4)), label: 'Hard' },
}
const LANES = 12

export default function ChickenCrossGame() {
    useGameBgm('chickencross', 'idle')
    const definition = findGameDefinition('chickencross')
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const sfx = useSfx('chickencross')
    const session = useGameSession('chickencross')
    const preloader = useOriginalsPreloader('chickencross')

    const [risk, setRisk] = useState('medium')
    const [lane, setLane] = useState(0)
    const [activeBet, setActiveBet] = useState(0)
    const [phase, setPhase] = useState('idle') // idle | crossing
    const roadRef = useRef(null)
    // Bring the road into view when a crossing starts (mobile reachability).
    useScrollActionIntoView(roadRef, phase === 'crossing', [phase], { block: 'nearest' })
    const [splat, setSplat] = useState(false)
    const [carKey, setCarKey] = useState(0)
    const [burstKey, setBurstKey] = useState(0)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [lastBet, setLastBet] = useState(null)
    const [toast, setToast] = useState(null)
    const [laneFx, setLaneFx] = useState({ key: 0, from: 0, to: 0 })
    const { schedule, cancelAll } = useCancellableTimeouts()

    const machine = useRoundMachine({})

    const config = PRESETS[risk]
    const multiplier = Number(Math.pow(config.growth, lane).toFixed(2))

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (phase === 'crossing') { resolve({ profit: 0 }); return }
        if (!placeBet(betAmount, 'Chicken Cross')) { showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`); resolve({ profit: 0 }); return }
        setLastBet(betAmount)
        setToast(null)
        playSound('click')
        sfx.play('click')
        machine.start([
            { index: 0, type: ROUND_EVENTS.ROUND_START, payload: { betAmount, risk }, at: 0 },
            { index: 1, type: ROUND_EVENTS.INPUT_LOCK, payload: {}, at: 0 },
            { index: 2, type: ROUND_EVENTS.BET_ACCEPTED, payload: { betAmount, risk }, at: 0 },
        ], { autoFinish: false })
        setActiveBet(betAmount)
        setLane(0)
        setLaneFx({ key: 0, from: 0, to: 0 })
        setSplat(false)
        setPhase('crossing')
        resolve({ profit: 0 })
    })

    const cross = () => {
        if (lane >= LANES) { cashout(); return }
        // Cosmetic-only car flyby (independent of game outcome).
        // gampo:allow-math-random-visual — triggers a decorative car sprite, not the lane result.
        if (Math.random() < 0.3) setCarKey(k => k + 1)
        const safe = nextRoll('chickencross').roll < config.safe
        if (safe) {
            playSound('flip')
            sfx.play('reveal')
            const nextLane = lane + 1
            setLane(nextLane)
            setLaneFx(prev => ({ key: prev.key + 1, from: lane, to: nextLane }))
            return
        }
        playSound('explode')
        sfx.play('lose')
        setSplat(true)
        session.record({ id: crypto.randomUUID(), label: `Splat L${lane}`, profit: -activeBet, betAmount: activeBet, meta: { risk, lane } })
        setToast({ kind: 'lose', amount: -activeBet, message: `Splat lane ${lane}` })
        machine.finish({ kind: 'bust', profit: -activeBet, multiplier: 0, lane })
        showToast('loss', 'Chicken hit', `-${formatCredits(activeBet)}`)
        schedule(() => {
            setPhase('idle')
            setActiveBet(0)
            setLane(0)
            setSplat(false)
        }, 800)
    }

    const cashout = useCallback(() => {
        if (lane === 0) return
        const returnAmount = round2(activeBet * multiplier)
        const profit = round2(returnAmount - activeBet)
        addWinnings(returnAmount, 'Chicken Cross return')
        if (multiplier >= 5) {
            playSound('bigwin')
            setBigWin({ trigger: Date.now(), profit, multiplier })
        } else {
            playSound('win')
        }
        sfx.play('cashout')
        setBurstKey(k => k + 1)
        session.record({ id: crypto.randomUUID(), label: `${multiplier}×`, profit, betAmount: activeBet, multiplier, meta: { risk, lane } })
        setToast({ kind: 'cashout', multiplier, amount: profit, message: 'Cashed out' })
        machine.finish({ kind: 'cashed', profit, multiplier, lane })
        showToast('win', 'Chicken cashed out', `+${formatCredits(profit)}`)
        setPhase('idle')
        setActiveBet(0)
        schedule(() => setLane(0), 800)
    }, [activeBet, addWinnings, lane, machine, multiplier, playSound, risk, schedule, session, sfx, showToast])

    const recentProfit = session.history.slice(0, 12).reduce((s, i) => s + (i.profit || 0), 0)

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#ffcf5a"
            backdrop="/assets/games/backdrops/backdrop-felt-navy.png"
            variant="stake"
            panel={
                <BetPanel
                    balance={balance}
                    initialBet={5}
                    runningRound={false}
                    actionLabel="Start Crossing"
                    onPlay={performPlay}
                    disableAuto
                    lastBet={lastBet}
                    playPhase={phase === 'crossing' && lane > 0 ? 'in-round' : null}
                    playLabel={phase === 'crossing' && lane > 0 ? `Cashout ${multiplier.toFixed(2)}×` : 'Start Crossing'}
                    onPlayPhaseAction={cashout}
                >
                    <div className="bp-section">
                        <label className="bp-label">Difficulty</label>
                        <div className="bp-row">
                            {Object.entries(PRESETS).map(([k, p]) => (
                                <button key={k} disabled={phase === 'crossing'} className={`bp-bet-btn ${risk === k ? 'active' : ''}`} onClick={() => setRisk(k)}>{p.label}</button>
                            ))}
                        </div>
                    </div>
                </BetPanel>
            }
            aside={<><StatsOverlay stats={session.stats} definition={definition} /><HistoryDrawer history={session.history} onClear={session.clear} /></>}
        >
            <CoreStageFrame minHeight={580} maxWidth={920} loading={!preloader.ready} className="cc-stage-frame">
                <div className="cc-stage">
                    <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />
                    <div className="cc-road" ref={roadRef} data-mobile-critical-surface>
                        {Array.from({ length: LANES + 1 }, (_, i) => {
                            const isFadeFrom = laneFx.key > 0 && i === laneFx.from
                            const isFadeTo = laneFx.key > 0 && i === laneFx.to
                            return (
                                <div
                                    key={`${i}-${isFadeFrom || isFadeTo ? laneFx.key : 0}`}
                                    className={`cc-lane ${i === lane ? 'current' : ''} ${i < lane ? 'crossed' : ''} ${splat && i === lane ? 'splat' : ''} ${isFadeFrom ? 'fade-out' : ''} ${isFadeTo ? 'fade-in' : ''}`}
                                >
                                    {i === 0 && phase === 'idle' && (
                                        <span className="cc-chicken idle" aria-hidden="true">{'\uD83D\uDC25'}</span>
                                    )}
                                    {i === lane && phase === 'crossing' && (
                                        <span className={`cc-chicken ${splat ? 'splatted' : 'hopping'}`}>{splat ? '\uD83D\uDCA5' : '\uD83D\uDC25'}</span>
                                    )}
                                    <span className="cc-mult">{Math.pow(config.growth, i).toFixed(2)}×</span>
                                </div>
                            )
                        })}
                        {carKey > 0 && phase === 'crossing' && <span key={`car-${carKey}`} className="cc-car" />}
                    </div>
                    <div className="cc-action-btns">
                        <StageActionButton disabled={phase !== 'crossing'} onClick={cross}>Cross next</StageActionButton>
                    </div>
                    <p className="bp-bal-line" style={{ color: 'var(--text-secondary)' }}>Lane <strong>{lane}/{LANES}</strong></p>
                    <MultiplierBadge label="Current" value={multiplier} state={phase === 'crossing' ? 'active' : 'idle'} size="sm" />
                    {burstKey > 0 && phase === 'idle' && session.history[0]?.profit > 0 && <Particles key={burstKey} count={18} color="#ffcf5a" />}
                    <ActionLockOverlay active={splat} label="Splat" />
                    <ResultToast result={toast} onDismiss={() => setToast(null)} />
                </div>
            </CoreStageFrame>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={getBigWinThreshold('chickencross')} />
            <EducationPanel definition={definition} betAmount={5} winProbability={Math.pow(config.safe, Math.max(1, lane + 1))} payoutMultiplier={Math.max(1, multiplier)} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
