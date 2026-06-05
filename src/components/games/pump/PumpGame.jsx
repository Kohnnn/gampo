// Stake-style Pump (Wave 3, plausible mechanic).
//
// Each pump multiplies the running multiplier by ~1.18x and faces a
// ~12% bust risk. Player can cash out any time before the balloon
// pops; one bad pump ends the round at -bet. Deterministic round
// events drive the in-round CTA + result toast.

import { useCallback, useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { useSfx } from '../../../audio/useSfx'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits } from '../../../utils/simulationMath'
import { nextRoll } from '../../../utils/fairRng'
import {
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
} from '../primitives'
import { useOriginalsPreloader } from '../../games/resources/useOriginalsPreloader'
import EducationPanel from '../../EducationPanel'
import './pump.css'
import { useGameBgm } from '../../../audio/useBgm'

const STEP_BUST_CHANCE = 0.12
// RTP-lock the growth: per-step EV = survival × ramp must equal the target RTP
// so every pump carries the house edge (was a flat 1.18 → 103.8%/step, +EV).
const PUMP_RTP = 0.96
const STEP_RAMP = Number(((PUMP_RTP) / (1 - STEP_BUST_CHANCE)).toFixed(4))
const MAX_PUMPS = 10
const BASE_SIZE = 128

export default function PumpGame() {
    useGameBgm('pump', 'idle')
    const definition = findGameDefinition('pump') || { name: 'Pump', category: 'Arcade originals' }
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const sfx = useSfx('pump')
    const session = useGameSession('pump')
    const preloader = useOriginalsPreloader('pump')

    const [phase, setPhase] = useState('idle') // idle | playing | busted | cashed
    const [pumps, setPumps] = useState(0)
    const [stake, setStake] = useState(0)
    const [busted, setBusted] = useState(false)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [lastBet, setLastBet] = useState(null)
    const [toast, setToast] = useState(null)

    const machine = useRoundMachine({})

    const currentMult = pumps === 0 ? 1 : Number(Math.pow(STEP_RAMP, pumps).toFixed(4))
    const nextMult = pumps >= MAX_PUMPS ? currentMult : Number(Math.pow(STEP_RAMP, pumps + 1).toFixed(4))
    const inRound = phase === 'playing'

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (inRound) { resolve({ profit: 0 }); return }
        if (!placeBet(betAmount, 'Pump')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            resolve({ profit: 0 })
            return
        }
        setLastBet(betAmount)
        setStake(betAmount)
        setPumps(0)
        setBusted(false)
        setToast(null)
        playSound('click')
        sfx.play('click')
        machine.start([
            { index: 0, type: ROUND_EVENTS.ROUND_START, payload: { betAmount }, at: 0 },
            { index: 1, type: ROUND_EVENTS.INPUT_LOCK, payload: {}, at: 0 },
            { index: 2, type: ROUND_EVENTS.BET_ACCEPTED, payload: { betAmount }, at: 0 },
        ], { autoFinish: false })
        setPhase('playing')
        resolve({ profit: 0 })
    })

    const pumpOnce = () => {
        if (!inRound) return
        if (pumps >= MAX_PUMPS) { cashOut(); return }
        const { roll } = nextRoll('pump')
        if (roll < STEP_BUST_CHANCE) {
            // Burst.
            playSound('explode')
            sfx.play('lose')
            setBusted(true)
            setToast({ kind: 'lose', amount: -stake, message: `Burst at ${pumps + 1} pumps` })
            session.record({
                id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
                label: `Burst ${pumps + 1}`,
                profit: -stake, betAmount: stake, multiplier: 0,
                meta: { pumps: pumps + 1 },
            })
            machine.finish({ kind: 'bust', profit: -stake, multiplier: 0, pumps: pumps + 1 })
            showToast('loss', 'Pump burst', `-${formatCredits(stake)}`)
            setPhase('busted')
            window.setTimeout(() => setPhase('idle'), 1100)
            return
        }
        const next = pumps + 1
        setPumps(next)
        sfx.play('reveal')
    }

    const cashOut = useCallback(() => {
        if (!inRound || pumps === 0) return
        const m = currentMult
        const profit = stake * m - stake
        addWinnings(stake * m, 'Pump return')
        setToast({ kind: 'cashout', multiplier: m, amount: profit, message: 'Cashed out' })
        if (m >= 5) {
            playSound('bigwin')
            setBigWin({ trigger: Date.now(), profit, multiplier: m })
        } else {
            playSound('win')
        }
        sfx.play('cashout')
        session.record({
            id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
            label: `${m.toFixed(2)}× cashout`,
            profit, betAmount: stake, multiplier: m,
            meta: { pumps },
        })
        machine.finish({ kind: 'cashed', profit, multiplier: m, pumps })
        showToast('win', 'Pump cashed out', `+${formatCredits(profit)}`)
        setPhase('cashed')
        window.setTimeout(() => setPhase('idle'), 1100)
    }, [inRound, pumps, currentMult, stake, addWinnings, playSound, sfx, session, machine, showToast])

    const recentProfit = session.history.slice(0, 12).reduce((sum, item) => sum + (item.profit || 0), 0)
    const balloonSize = BASE_SIZE + pumps * 16

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#ff8ad4"
            backdrop="/assets/games/backdrops/backdrop-felt-navy.png"
            variant="stake"
            panel={
                <BetPanel
                    balance={balance}
                    initialBet={5}
                    runningRound={false}
                    actionLabel="Place Bet"
                    onPlay={performPlay}
                    disableAuto
                    lastBet={lastBet}
                    playPhase={inRound && pumps > 0 ? 'in-round' : null}
                    playLabel={inRound && pumps > 0 ? `Cashout ${currentMult.toFixed(2)}×` : 'Place Bet'}
                    onPlayPhaseAction={cashOut}
                >
                    <div className="bp-bal-line">
                        <span>Step ramp</span>
                        <strong>{STEP_RAMP.toFixed(2)}×</strong>
                    </div>
                    <div className="bp-bal-line">
                        <span>Bust per pump</span>
                        <strong>{(STEP_BUST_CHANCE * 100).toFixed(0)}%</strong>
                    </div>
                    <div className="bp-bal-line">
                        <span>Cap</span>
                        <strong>{MAX_PUMPS}</strong>
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
            <CoreStageFrame minHeight={520} maxWidth={840} loading={!preloader.ready} className="pump-stage-frame">
                <div className="pump-stage">
                    <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />
                    <div className={`pump-balloon ${busted ? 'busted' : ''}`} style={{ width: `${balloonSize}px`, height: `${balloonSize}px` }}>
                        {pumps === 0 ? '0' : `${pumps}`}
                    </div>
                    <div className="pump-meter">
                        {Array.from({ length: MAX_PUMPS }, (_, i) => (
                            <span key={i} className={i < pumps ? 'filled' : ''} />
                        ))}
                    </div>
                    <div className="pump-actions">
                        <button className="pump-action-chip" disabled={!inRound || busted} onClick={pumpOnce}>Pump</button>
                        {inRound && pumps > 0 && (
                            <button className="pump-action-chip cashout" onClick={cashOut}>Cashout {currentMult.toFixed(2)}×</button>
                        )}
                    </div>
                    <div>
                        <MultiplierBadge label={inRound ? 'Current' : 'Ready'} value={inRound ? currentMult : 1} state={inRound ? 'active' : phase === 'cashed' ? 'win' : phase === 'busted' ? 'bust' : 'idle'} size="md" />
                        {inRound && pumps < MAX_PUMPS && (
                            <span style={{ marginLeft: 10 }}>
                                <MultiplierBadge label="Next" value={nextMult} size="sm" />
                            </span>
                        )}
                    </div>
                    <ActionLockOverlay active={phase === 'busted'} label="Burst" />
                    <ResultToast result={toast} onDismiss={() => setToast(null)} />
                </div>
            </CoreStageFrame>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={5} />
            <EducationPanel definition={definition} betAmount={5} winProbability={1 - STEP_BUST_CHANCE} payoutMultiplier={STEP_RAMP} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
