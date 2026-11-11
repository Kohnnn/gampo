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
import { formatCredits, round2 } from '../../../utils/simulationMath'
import { nextRoll } from '../../../utils/fairRng'
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
import { useCancellableTimeouts } from '../../../utils/scheduling'
import { nextStepQuote } from '../primitives/autoAccounting'
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
    const [selectedStake, setSelectedStake] = useState(5)
    const [toast, setToast] = useState(null)
    const { schedule } = useCancellableTimeouts()

    const machine = useRoundMachine({})

    const multiplierAt = count => (count === 0 ? 1 : Number(Math.pow(STEP_RAMP, count).toFixed(4)))
    const currentMult = multiplierAt(pumps)
    const nextMult = pumps >= MAX_PUMPS ? currentMult : multiplierAt(pumps + 1)
    const inRound = phase === 'playing'
    // QA030: the lesson describes the step the player is on. Outside a round that
    // is the first pump; inside one it is the next pump at `pumps + 1`, and the
    // banked multiplier is offered as the cash-out alternative.
    // Outside a round `pumps` still holds the finished round's count (burst and
    // cashout reset the phase but not the counter), so idle must read step 0 or
    // the lesson quotes a step of a round that no longer exists.
    // When the cap is reached the next pump is a deterministic cashout, not a
    // risky next step: quote nothing risky; the cashout alternative holds.
    const livePumps = inRound ? pumps : 0
    const atCap = inRound && pumps >= MAX_PUMPS
    const educationDecision = atCap
        ? { label: 'Cashout', probability: 1, payoutMultiplier: currentMult, cashoutMultiplier: currentMult }
        : nextStepQuote({
            probability: 1 - STEP_BUST_CHANCE,
            payoutMultiplier: multiplierAt(livePumps + 1),
            // Only a live round with a banked step has something to cash out.
            cashoutMultiplier: livePumps > 0 ? multiplierAt(livePumps) : undefined,
        })
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
                id: crypto.randomUUID(),
                label: `Burst ${pumps + 1}`,
                profit: -stake, betAmount: stake, multiplier: 0,
                meta: { pumps: pumps + 1 },
            })
            machine.finish({ kind: 'bust', profit: -stake, multiplier: 0, pumps: pumps + 1 })
            showToast('loss', 'Pump burst', `-${formatCredits(stake)}`)
            setPhase('busted')
            schedule(() => setPhase('idle'), 1100)
            return
        }
        const next = pumps + 1
        setPumps(next)
        sfx.play('reveal')
    }

    const cashOut = useCallback(() => {
        if (!inRound || pumps === 0) return
        const m = currentMult
        const totalReturn = round2(stake * m)
        const profit = round2(totalReturn - stake)
        addWinnings(totalReturn, 'Pump return')
        setToast({ kind: 'cashout', multiplier: m, amount: profit, message: 'Cashed out' })
        if (m >= 5) {
            playSound('bigwin')
            setBigWin({ trigger: Date.now(), profit, multiplier: m })
        } else {
            playSound('win')
        }
        sfx.play('cashout')
        session.record({
            id: crypto.randomUUID(),
            label: `${m.toFixed(2)}× cashout`,
            profit, betAmount: stake, multiplier: m,
            meta: { pumps },
        })
        machine.finish({ kind: 'cashed', profit, multiplier: m, pumps })
        showToast('win', 'Pump cashed out', `+${formatCredits(profit)}`)
        setPhase('cashed')
        schedule(() => setPhase('idle'), 1100)
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
                    onStakeChange={setSelectedStake}
                    playPhase={inRound && pumps > 0 ? 'in-round' : null}
                    playLabel={inRound && pumps > 0 ? `Cashout ${currentMult.toFixed(2)}×` : 'Place Bet'}
                    onPlayPhaseAction={cashOut}
                >
                    <div className="bp-bal-line">
                        <span>Step ramp</span>
                        <strong>{STEP_RAMP.toFixed(2)}×</strong>
                    </div>
                    <div className="bp-bal-line">
                        <span>Bust per risky pump</span>
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
                    <div data-mobile-critical-surface className={`pump-balloon ${busted ? 'busted' : ''}`} style={{ width: `${balloonSize}px`, height: `${balloonSize}px` }}>
                        {pumps === 0 ? '0' : `${pumps}`}
                    </div>
                    <div className="pump-meter">
                        {Array.from({ length: MAX_PUMPS }, (_, i) => (
                            <span key={i} className={i < pumps ? 'filled' : ''} />
                        ))}
                    </div>
                    <div className="pump-actions">
                        <StageActionButton disabled={!inRound || busted} onClick={pumpOnce}>Pump</StageActionButton>
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
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={getBigWinThreshold('pump')} />
            <EducationPanel
                definition={{ ...definition, lesson: 'Each risky pump increases the multiplier by about 1.09× with a 12% chance to burst. At the cap, Pump or Cashout pays the banked amount.' }}
                betAmount={inRound ? stake : selectedStake}
                rtpLabel="RTP per risky pump"
                rtpNote={atCap ? `Cap reached: Pump and Cashout both immediately return the banked ${currentMult.toFixed(4)}× multiplier without a burst. RTP and house edge describe a risky pump, not this cashout or a whole round.` : undefined}
                conditionalDecision={educationDecision}
                balance={balance}
                recentProfit={recentProfit}
            />
        </GameShell>
    )
}
