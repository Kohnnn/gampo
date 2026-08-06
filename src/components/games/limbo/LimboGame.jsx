// Stake/Rainbet-style Limbo on the shared shell.
//
// Wave 2 retrofit: drives multiplier ramp + result toast + sfx through the
// round event machine. Math (limboWinChance, target multiplier) unchanged.

import { useCallback, useRef, useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { useSfx } from '../../../audio/useSfx'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { clamp, formatCredits, limboWinChance, round2 } from '../../../utils/simulationMath'
import { useCancellableTimeouts } from '../../../utils/scheduling'
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
    SimBetStrip,
    makeInitialSimBetRows,
    makeSimBetRow,
    prependSimBetRow,
    ROUND_EVENTS,
    buildEvents,
    useRoundMachine,
} from '../primitives'
import { useOriginalsPreloader } from '../../games/resources/useOriginalsPreloader'
import { NumberRoll, Particles } from '../../fx'
import EducationPanel from '../../EducationPanel'
import './limbo.css'
import { useGameBgm } from '../../../audio/useBgm'

const RAMP_DURATION_MS = 720
const RAMP_TICKS = 8

export default function LimboGame() {
    useGameBgm('limbo', 'idle')
    const definition = findGameDefinition('limbo')
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const sfx = useSfx('limbo')
    const session = useGameSession('limbo')
    const preloader = useOriginalsPreloader('limbo')

    const [target, setTarget] = useState(2)
    const [last, setLast] = useState(null)
    const [lastWon, setLastWon] = useState(null)
    const [running, setRunning] = useState(false)
    const [burstKey, setBurstKey] = useState(0)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [lastBet, setLastBet] = useState(null)
    const [toast, setToast] = useState(null)
    const [simFeed, setSimFeed] = useState(() => makeInitialSimBetRows('limbo', { count: 9, cap: 10 }))
    const { schedule } = useCancellableTimeouts()
    const simSeqRef = useRef(0)
    const chance = limboWinChance(target)

    const handleEvent = useCallback((ev) => {
        if (!ev) return
        switch (ev.type) {
            case ROUND_EVENTS.INPUT_LOCK:
                setRunning(true)
                break
            case ROUND_EVENTS.MULTIPLIER_UPDATE: {
                const m = ev.payload?.value
                if (Number.isFinite(m)) {
                    setLast(m)
                    sfx.play('tick')
                }
                break
            }
            case ROUND_EVENTS.ROUND_RESULT: {
                const { won, multiplier, profit } = ev.payload || {}
                setLast(multiplier)
                setLastWon(!!won)
                setBurstKey(k => k + 1)
                setToast({
                    kind: won ? 'win' : 'lose',
                    multiplier: won ? multiplier : null,
                    amount: profit,
                    message: won ? 'Target cleared' : 'Below target',
                })
                if (won) sfx.play('win'); else sfx.play('lose')
                break
            }
            case ROUND_EVENTS.INPUT_UNLOCK:
                setRunning(false)
                break
            default:
                break
        }
    }, [sfx])

    const machine = useRoundMachine({ onEvent: handleEvent })

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (!placeBet(betAmount, 'Limbo')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            resolve({ profit: 0 })
            return
        }
        setLastBet(betAmount)
        setToast(null)
        setLastWon(null)
        playSound('tick')
        sfx.play('click')

        const { roll: r } = nextRoll('limbo')
        const won = r < chance
        // Reveal multiplier: on win the actual payout target; on loss a
        // value below target proportional to how close the random roll
        // was to the win threshold.
        const multiplier = won
            ? target
            : 1 + (1 - Math.min(0.999, r)) * Math.max(0.1, target - 1)
        const returnAmount = won ? round2(betAmount * target) : 0
        const profit = round2(returnAmount - betAmount)

        const events = buildEvents(api => {
            api.push(ROUND_EVENTS.ROUND_START, { target }, 0)
            api.push(ROUND_EVENTS.INPUT_LOCK, {}, 0)
            api.push(ROUND_EVENTS.BET_ACCEPTED, { betAmount, target }, 0)
            for (let i = 1; i <= RAMP_TICKS; i += 1) {
                const t = i / (RAMP_TICKS + 1)
                const ramp = 1 + (multiplier - 1) * t
                api.push(ROUND_EVENTS.MULTIPLIER_UPDATE, { value: ramp, tick: i }, Math.round(RAMP_DURATION_MS * t))
            }
            api.push(ROUND_EVENTS.RNG_REVEAL, { roll: r, won }, RAMP_DURATION_MS - 80)
            api.push(ROUND_EVENTS.ROUND_RESULT, {
                won,
                profit,
                multiplier,
                target,
            }, RAMP_DURATION_MS)
            api.push(ROUND_EVENTS.PAYOUT_PREVIEW, { amount: returnAmount }, RAMP_DURATION_MS + 16)
            api.push(ROUND_EVENTS.INPUT_UNLOCK, {}, RAMP_DURATION_MS + 240)
        })
        machine.start(events, { autoFinish: false })

        if (won) addWinnings(returnAmount, 'Limbo return')
        if (won && target >= 5) {
            playSound('bigwin')
            setBigWin({ trigger: Date.now(), profit, multiplier: target })
        } else {
            playSound(won ? 'win' : 'loss')
        }
        session.record({ id: crypto.randomUUID(), label: `${multiplier.toFixed(2)}×`, profit, betAmount, multiplier: won ? target : 0, meta: { target } })
        showToast(won ? 'win' : 'loss', won ? 'Target cleared' : 'Below target', `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
        simSeqRef.current += 1
        setSimFeed(prev => prependSimBetRow(prev, makeSimBetRow('limbo', {
            seed: `limbo:${simSeqRef.current}:${target}:${multiplier.toFixed(2)}`,
        }), 10))

        schedule(() => resolve({ profit }), RAMP_DURATION_MS + 260)
    })

    const gaugePct = last ? Math.min(100, ((last - 1) / Math.max(0.01, target - 1)) * 90) : 0
    const recentProfit = session.history.slice(0, 12).reduce((sum, item) => sum + (item.profit || 0), 0)

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#41d6ff"
            backdrop="/assets/games/backdrops/backdrop-stars.png"
            variant="stake"
            panel={
                <BetPanel
                    balance={balance}
                    initialBet={5}
                    runningRound={running}
                    actionLabel="Run Limbo"
                    mobilePlayLabel="Run"
                    onPlay={performPlay}
                    lastBet={lastBet}
                >
                    <div className="bp-section">
                        <label className="bp-label" htmlFor="limbo-target-multiplier">Target Multiplier</label>
                        <input id="limbo-target-multiplier" type="number" min="1.01" max="100" step="0.1" value={target} onChange={event => setTarget(clamp(Number(event.target.value) || 1.01, 1.01, 100))} className="bp-bet-input" disabled={running} />
                    </div>
                    <div className="bp-quick-actions">
                        {[1.5, 2, 5, 10, 50, 100].map(t => (
                            <button key={t} disabled={running} onClick={() => setTarget(t)}>{t}×</button>
                        ))}
                    </div>
                    <div className="bp-bal-line">
                        <span>Estimated hit chance</span>
                        <strong>{(chance * 100).toFixed(2)}%</strong>
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
            <CoreStageFrame minHeight={520} maxWidth={920} loading={!preloader.ready} className="limbo-stage-frame">
                <div className={`limbo-stage ${lastWon === true ? 'win-flash' : lastWon === false ? 'loss-flash' : ''}`}>
                    <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />
                    <SimBetStrip rows={simFeed} title="Sim limbo" />
                    <div className="limbo-stars-bg" />
                    <div className="limbo-target-label">
                        <MultiplierBadge label="Target" value={target} state={running ? 'active' : lastWon === true ? 'win' : lastWon === false ? 'bust' : 'idle'} size="sm" />
                        <span>Hit chance {(chance * 100).toFixed(2)}%</span>
                    </div>
                    <div className="limbo-rocket-row">
                        <div className="limbo-gauge" data-mobile-critical-surface>
                            <div className="limbo-gauge-fill" style={{ height: `${gaugePct}%`, background: lastWon === false ? 'linear-gradient(0deg, #ed4245, #ffcf5a)' : 'linear-gradient(0deg, #00e701, #41d6ff)' }} />
                            <div className="limbo-gauge-target" />
                        </div>
                        <div className={`limbo-ring ${lastWon === true ? 'won' : lastWon === false ? 'lost' : ''}`}>
                            <span><NumberRoll value={last === null ? 1 : Number(last.toFixed(2))} format={v => `${v.toFixed(2)}×`} /></span>
                        </div>
                        {lastWon && burstKey > 0 && <Particles key={burstKey} count={18} color="#41d6ff" />}
                    </div>
                    <ActionLockOverlay active={running} label="Climbing..." />
                    <ResultToast result={toast} onDismiss={() => setToast(null)} />
                </div>
            </CoreStageFrame>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={getBigWinThreshold('limbo')} />
            <EducationPanel definition={definition} betAmount={5} winProbability={chance} payoutMultiplier={target} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
