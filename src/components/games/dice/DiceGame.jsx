import { useCallback, useRef, useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { useSfx } from '../../../audio/useSfx'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { dicePayout, formatCredits } from '../../../utils/simulationMath'
import { nextRoll } from '../../../utils/fairRng'
import {
    BetPanel,
    BigWinOverlay,
    GameShell,
    HistoryDrawer,
    RecentResultsStrip,
    StatsOverlay,
    useGameSession,
    SegmentedModeTabs,
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
import { createRoundRng } from '../../../utils/roundRng'
import { NumberRoll, Particles } from '../../fx'
import EducationPanel from '../../EducationPanel'
import './dice.css'

// Wave 1 pilot game. Drives all UI motion from the deterministic round
// event machine. Pre-existing synth audio (`useAudio`) stays in place;
// Wave 1 also wires the new `useSfx('dice')` channel which is silent until
// audio batch waves drop 16-bit PCM .wav files into
// `public/audio/originals/dice/`.

const DICE_ROLL_DURATION_MS = 720

export default function DiceGame() {
    const definition = findGameDefinition('dice')
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const sfx = useSfx('dice')
    const session = useGameSession('dice')
    const preloader = useOriginalsPreloader('dice')

    const [winChance, setWinChance] = useState(50)
    const [rollMode, setRollMode] = useState('under')
    const [lastRoll, setLastRoll] = useState(null)
    const [lastWon, setLastWon] = useState(null)
    const [running, setRunning] = useState(false)
    const [burstKey, setBurstKey] = useState(0)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [lastBet, setLastBet] = useState(null)
    const [toast, setToast] = useState(null)
    const [simFeed, setSimFeed] = useState(() => makeInitialSimBetRows('dice', { count: 9, cap: 10 }))
    const simSeqRef = useRef(0)
    const payout = dicePayout(winChance / 100)

    const handleEvent = useCallback((ev) => {
        if (!ev) return
        switch (ev.type) {
            case ROUND_EVENTS.INPUT_LOCK:
                setRunning(true)
                break
            case ROUND_EVENTS.RNG_REVEAL:
                if (Number.isFinite(ev.payload?.roll)) {
                    setLastRoll(ev.payload.roll)
                }
                sfx.play('tick')
                break
            case ROUND_EVENTS.ANIMATION_CHECKPOINT:
                sfx.play('tick')
                break
            case ROUND_EVENTS.ROUND_RESULT: {
                const { roll, won, profit, multiplier } = ev.payload || {}
                if (Number.isFinite(roll)) setLastRoll(roll)
                setLastWon(!!won)
                setBurstKey(k => k + 1)
                setToast({
                    kind: won ? (multiplier >= 5 ? 'win' : 'win') : 'lose',
                    multiplier: won ? multiplier : null,
                    amount: profit,
                    message: won ? 'Dice hit' : 'Dice miss',
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
        if (!placeBet(betAmount, 'Dice')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            resolve({ profit: 0 })
            return
        }
        setLastBet(betAmount)
        setLastWon(null)
        sfx.play('roll')
        playSound('tick')

        const rng = createRoundRng()
        const rollFloat = nextRoll('dice').roll
        const roll = rollFloat * 100
        const won = rollMode === 'under' ? roll < winChance : roll > (100 - winChance)
        const returnAmount = won ? betAmount * payout : 0
        const profit = returnAmount - betAmount
        if (won) addWinnings(returnAmount, 'Dice return')

        // Pre-roll ticks -> reveal -> result. Drives both visuals and SFX
        // from a single deterministic event list.
        const events = buildEvents(api => {
            api.push(ROUND_EVENTS.ROUND_START, { seed: rng.seed }, 0)
            api.push(ROUND_EVENTS.INPUT_LOCK, {}, 0)
            api.push(ROUND_EVENTS.BET_ACCEPTED, { betAmount, mode: rollMode, target: winChance }, 16)
            const ticks = 6
            for (let i = 1; i <= ticks; i += 1) {
                api.push(ROUND_EVENTS.ANIMATION_CHECKPOINT, { tick: i }, Math.round(DICE_ROLL_DURATION_MS * (i / (ticks + 1))))
            }
            api.push(ROUND_EVENTS.RNG_REVEAL, { roll }, DICE_ROLL_DURATION_MS - 80)
            api.push(ROUND_EVENTS.ROUND_RESULT, {
                roll,
                won,
                profit,
                multiplier: payout,
                winChance,
                rollMode,
            }, DICE_ROLL_DURATION_MS)
            api.push(ROUND_EVENTS.PAYOUT_PREVIEW, { amount: returnAmount }, DICE_ROLL_DURATION_MS + 16)
            api.push(ROUND_EVENTS.INPUT_UNLOCK, {}, DICE_ROLL_DURATION_MS + 240)
        })
        machine.start(events, { autoFinish: false })

        // Big-win overlay still uses the existing flow.
        if (won) {
            const tier = payout >= 50 ? 'mega' : payout >= 15 ? 'huge' : payout >= 5 ? 'big' : null
            if (tier) {
                playSound('bigwin')
                setBigWin({ trigger: Date.now(), profit, multiplier: payout })
            } else {
                playSound('win')
            }
        } else {
            playSound('loss')
        }

        // Session record + toast still fire immediately so totals stay accurate
        // even if the user navigates away during the animation.
        session.record({ id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, label: roll.toFixed(2), profit, betAmount, multiplier: won ? payout : 0, meta: { winChance, rollMode } })
        showToast(won ? 'win' : 'loss', won ? 'Dice hit' : 'Dice miss', `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
        simSeqRef.current += 1
        setSimFeed(prev => prependSimBetRow(prev, makeSimBetRow('dice', {
            seed: `dice:${simSeqRef.current}:${roll.toFixed(2)}:${winChance}:${rollMode}`,
        }), 10))

        // Resolve to the BetPanel autoplay loop after the animation budget.
        setTimeout(() => resolve({ profit }), DICE_ROLL_DURATION_MS + 260)
    })

    const recentProfit = session.history.slice(0, 12).reduce((sum, item) => sum + (item.profit || 0), 0)
    const targetValue = rollMode === 'under' ? winChance : (100 - winChance)

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#00e701"
            backdrop="/assets/games/backdrops/backdrop-felt-navy.png"
            variant="stake"
            panel={
                <BetPanel
                    balance={balance}
                    initialBet={5}
                    runningRound={running}
                    actionLabel="Roll Dice"
                    onPlay={performPlay}
                    lastBet={lastBet}
                >
                    <div className="bp-section">
                        <label className="bp-label">Win Chance: {winChance}%</label>
                        <input type="range" min="2" max="95" value={winChance} onChange={e => setWinChance(Number(e.target.value))} className="dice-slider" disabled={running} />
                    </div>
                    <div className="bp-section">
                        <SegmentedModeTabs
                            options={[
                                { value: 'under', label: 'Roll Under' },
                                { value: 'over', label: 'Roll Over' },
                            ]}
                            value={rollMode}
                            onChange={mode => !running && setRollMode(mode)}
                            size="sm"
                        />
                    </div>
                    <div className="bp-bal-line">
                        <span>Multiplier</span>
                        <strong>{payout.toFixed(2)}×</strong>
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
            <CoreStageFrame minHeight={460} maxWidth={920} loading={!preloader.ready} className="dice-stage-frame">
                <div className={`dice-stage ${lastWon === true ? 'win-flash' : lastWon === false ? 'loss-flash' : ''}`}>
                    <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />
                    <SimBetStrip rows={simFeed} title="Sim dice" />
                    <div className="dice-pips" aria-label="Last 4 rolls">
                        {Array.from({ length: 4 }, (_, i) => {
                            const item = session.history[i]
                            const empty = !item
                            const won = !empty && (item.profit || 0) >= 0
                            const label = empty ? '?' : (item.label || '—')
                            return (
                                <div key={i} className={`dice-pip ${empty ? 'empty' : won ? 'won' : 'lost'}`}>
                                    <span className="dice-pip-label">{label}</span>
                                    <span className="dice-pip-tag">{empty ? 'roll' : won ? 'win' : 'loss'}</span>
                                </div>
                            )
                        })}
                    </div>
                    <div className="dice-outcome-wrap">
                        <div className={`dice-big ${lastWon === true ? 'win' : lastWon === false ? 'loss' : ''}`}>
                            <NumberRoll value={lastRoll === null ? 0 : Number(lastRoll.toFixed(2))} format={v => lastRoll === null ? '--.--' : v.toFixed(2)} />
                        </div>
                        {lastWon && burstKey > 0 && <Particles key={burstKey} count={20} color="#00e701" />}
                    </div>
                    <div className="dice-track">
                        <div className="dice-rule">{Array.from({ length: 11 }, (_, i) => <span key={i} data-n={i * 10} style={{ left: `${i * 10}%` }} />)}</div>
                        <div className="dice-safe-zone" style={rollMode === 'under' ? { width: `${winChance}%` } : { left: `${100 - winChance}%`, width: `${winChance}%` }} />
                        <div className={`dice-marker ${lastWon === true ? 'won' : lastWon === false ? 'lost' : ''}`} style={{ left: `${lastRoll ?? 50}%` }}>
                            <span />
                        </div>
                    </div>
                    <div className="dice-meta-row">
                        <div className="dice-meta-card target">
                            <span>{rollMode === 'under' ? 'Roll Under' : 'Roll Over'}</span>
                            <strong>{targetValue.toFixed(2)}</strong>
                        </div>
                        <div className="dice-meta-card chance">
                            <span>Win Chance</span>
                            <strong>{winChance.toFixed(2)}%</strong>
                        </div>
                        <MultiplierBadge label="Multiplier" value={payout} state={running ? 'active' : (lastWon === true ? 'win' : lastWon === false ? 'bust' : 'idle')} size="md" />
                    </div>
                    <ActionLockOverlay active={running} label="Rolling..." />
                    <ResultToast result={toast} onDismiss={() => setToast(null)} />
                </div>
            </CoreStageFrame>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={5} />
            <EducationPanel definition={definition} betAmount={5} winProbability={winChance / 100} payoutMultiplier={payout} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
