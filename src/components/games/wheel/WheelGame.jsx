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
    buildEvents,
    useRoundMachine,
} from '../primitives'
import { useOriginalsPreloader } from '../../games/resources/useOriginalsPreloader'
import { Particles } from '../../fx'
import EducationPanel from '../../EducationPanel'
import './wheel.css'

// Wave 2 retrofit. Spin animation timing stays at 2.2s; events emit at
// the matching wallclock so sfx + toast stay in sync with the visible
// wheel landing.

const SPIN_DURATION_MS = 2200
const TICK_COUNT = 8

const wheelPresets = {
    low: [0, 1.2, 1.2, 1.5, 0, 2, 1.2, 1.5, 0, 2, 1.2, 3],
    medium: [0, 0, 1.5, 0, 2, 0, 3, 0, 1.5, 0, 5, 0],
    high: [0, 0, 0, 2, 0, 0, 5, 0, 0, 10, 0, 25],
}

export default function WheelGame() {
    const definition = findGameDefinition('wheel')
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const sfx = useSfx('wheel')
    const session = useGameSession('wheel')
    const preloader = useOriginalsPreloader('wheel')

    const [risk, setRisk] = useState('medium')
    const [rotation, setRotation] = useState(0)
    const [last, setLast] = useState(null)
    const [lastWon, setLastWon] = useState(null)
    const [spinning, setSpinning] = useState(false)
    const [burstKey, setBurstKey] = useState(0)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [lastBet, setLastBet] = useState(null)
    const [toast, setToast] = useState(null)
    const segments = wheelPresets[risk]

    const handleEvent = useCallback((ev) => {
        if (!ev) return
        switch (ev.type) {
            case ROUND_EVENTS.INPUT_LOCK:
                setSpinning(true)
                break
            case ROUND_EVENTS.ANIMATION_CHECKPOINT:
                sfx.play('tick')
                break
            case ROUND_EVENTS.ROUND_RESULT: {
                const { won, multiplier, profit, segmentLabel } = ev.payload || {}
                setLast(multiplier)
                setLastWon(!!won)
                setBurstKey(k => k + 1)
                setToast({
                    kind: won ? (multiplier >= 5 ? 'win' : 'win') : 'lose',
                    multiplier,
                    amount: profit,
                    message: segmentLabel || (won ? 'Wheel hit' : 'Wheel miss'),
                })
                if (won) sfx.play('win'); else sfx.play('lose')
                break
            }
            case ROUND_EVENTS.INPUT_UNLOCK:
                setSpinning(false)
                break
            default:
                break
        }
    }, [sfx])

    const machine = useRoundMachine({ onEvent: handleEvent })

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (!placeBet(betAmount, 'Wheel')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            resolve({ profit: 0 })
            return
        }
        setLastBet(betAmount)
        setLastWon(null)
        setToast(null)
        playSound('tick')
        sfx.play('click')

        const { roll: r } = nextRoll('wheel')
        const idx = Math.floor(r * segments.length)
        const multiplier = segments[idx]
        const returnAmount = betAmount * multiplier
        const profit = returnAmount - betAmount
        const won = multiplier > 1
        const segmentLabel = `Segment ${idx + 1} · ${multiplier.toFixed(2)}×`
        const segAngle = 360 / segments.length
        const target = 6 * 360 + (360 - idx * segAngle - segAngle / 2)
        setRotation(prev => prev + (target - (prev % 360)))

        const events = buildEvents(api => {
            api.push(ROUND_EVENTS.ROUND_START, { risk, segments }, 0)
            api.push(ROUND_EVENTS.INPUT_LOCK, {}, 0)
            api.push(ROUND_EVENTS.BET_ACCEPTED, { betAmount, risk }, 0)
            for (let i = 1; i <= TICK_COUNT; i += 1) {
                const t = i / (TICK_COUNT + 1)
                api.push(ROUND_EVENTS.ANIMATION_CHECKPOINT, { tick: i }, Math.round(SPIN_DURATION_MS * t))
            }
            api.push(ROUND_EVENTS.RNG_REVEAL, { idx, multiplier }, SPIN_DURATION_MS - 80)
            api.push(ROUND_EVENTS.ROUND_RESULT, {
                won,
                profit,
                multiplier,
                segmentIndex: idx,
                segmentLabel,
                risk,
            }, SPIN_DURATION_MS)
            api.push(ROUND_EVENTS.PAYOUT_PREVIEW, { amount: returnAmount }, SPIN_DURATION_MS + 16)
            api.push(ROUND_EVENTS.INPUT_UNLOCK, {}, SPIN_DURATION_MS + 240)
        })
        machine.start(events, { autoFinish: false })

        window.setTimeout(() => {
            if (returnAmount > 0) addWinnings(returnAmount, 'Wheel return')
            if (won && multiplier >= 5) {
                playSound('bigwin')
                setBigWin({ trigger: Date.now(), profit, multiplier })
            } else {
                playSound(won ? 'win' : 'loss')
            }
            session.record({ id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, label: `${multiplier}×`, profit, betAmount, multiplier, meta: { risk } })
            showToast(profit >= 0 ? 'win' : 'loss', `Wheel ${multiplier}×`, `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
            resolve({ profit })
        }, SPIN_DURATION_MS + 260)
    })

    const hitChance = segments.filter(item => item > 0).length / segments.length
    const avgMultiplier = segments.reduce((sum, item) => sum + item, 0) / segments.length
    const recentProfit = session.history.slice(0, 12).reduce((sum, item) => sum + (item.profit || 0), 0)

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
                    runningRound={spinning}
                    actionLabel="Spin Wheel"
                    onPlay={performPlay}
                    lastBet={lastBet}
                >
                    <div className="bp-section">
                        <label className="bp-label">Risk</label>
                        <div className="bp-row">
                            {Object.keys(wheelPresets).map(r => (
                                <button key={r} className={`bp-bet-btn ${risk === r ? 'active' : ''}`} onClick={() => !spinning && setRisk(r)}>{r}</button>
                            ))}
                        </div>
                    </div>
                    <div className="bp-bal-line">
                        <span>Average return</span>
                        <strong>{avgMultiplier.toFixed(2)}×</strong>
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
            <CoreStageFrame minHeight={520} maxWidth={920} loading={!preloader.ready} className="wheel-stage-frame">
                <div className={`wheel-stage ${lastWon === true ? 'win-flash' : lastWon === false ? 'loss-flash' : ''}`}>
                    <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />
                    <div className="wheel-pointer" />
                    <div className={`wheel-disc ${spinning ? 'spinning' : ''}`} style={{ transform: `rotate(${rotation}deg)` }}>
                        {segments.map((segment, i) => (
                            <span key={`${segment}-${i}`} className={segment > 0 ? 'paying' : 'blank'} style={{ transform: `rotate(${i * (360 / segments.length)}deg)` }}>
                                {segment}×
                            </span>
                        ))}
                    </div>
                    <div className="wheel-last">
                        <MultiplierBadge label="Last" value={last === null ? 0 : last} state={lastWon === true ? 'win' : lastWon === false ? 'bust' : 'idle'} size="sm" />
                    </div>
                    {lastWon && burstKey > 0 && <Particles key={burstKey} count={20} color="#ffcf5a" />}
                    <ActionLockOverlay active={spinning} label="Spinning..." />
                    <ResultToast result={toast} onDismiss={() => setToast(null)} />
                </div>
            </CoreStageFrame>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={5} />
            <EducationPanel definition={definition} betAmount={5} winProbability={hitChance} payoutMultiplier={avgMultiplier} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
