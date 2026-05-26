import { useCallback, useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { useSfx } from '../../../audio/useSfx'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits } from '../../../utils/simulationMath'
import { nextRoll } from '../../../utils/fairRng'
import { useCancellableTimeouts } from '../../../utils/scheduling'
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
import { Particles } from '../../fx'
import EducationPanel from '../../EducationPanel'
import './tower.css'

const PRESETS = {
    easy: { safe: 0.85, growth: 1.18, label: 'Easy' },
    medium: { safe: 0.7, growth: 1.28, label: 'Medium' },
    hard: { safe: 0.55, growth: 1.55, label: 'Hard' },
}

const HEIGHT = 8

export default function TowerGame() {
    const definition = findGameDefinition('tower')
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const sfx = useSfx('tower')
    const session = useGameSession('tower')
    const preloader = useOriginalsPreloader('tower')

    const [risk, setRisk] = useState('medium')
    const [level, setLevel] = useState(0)
    const [activeBet, setActiveBet] = useState(0)
    const [phase, setPhase] = useState('idle') // idle | climbing
    const [fellAt, setFellAt] = useState(null)
    const [burstKey, setBurstKey] = useState(0)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [lastBet, setLastBet] = useState(null)
    const [toast, setToast] = useState(null)
    const [ladderPulseKey, setLadderPulseKey] = useState(0)
    const { schedule, cancelAll } = useCancellableTimeouts()

    const machine = useRoundMachine({})

    const config = PRESETS[risk]
    const multiplier = Number(Math.pow(config.growth, level).toFixed(2))

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (phase === 'climbing') { resolve({ profit: 0 }); return }
        if (!placeBet(betAmount, 'Tower Climb')) { showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`); resolve({ profit: 0 }); return }
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
        setLevel(0)
        setLadderPulseKey(0)
        setFellAt(null)
        setPhase('climbing')
        // Resolves when player cashes out or falls.
        // We resolve immediately so autoplay doesn't queue a second start.
        // Autoplay isn't used for Tower since it's interactive.
        resolve({ profit: 0 })
    })

    const climb = () => {
        if (phase !== 'climbing') return
        const safe = nextRoll('tower').roll < config.safe
        if (safe) {
            playSound('flip')
            sfx.play('reveal')
            setLevel(prev => prev + 1)
            setLadderPulseKey(key => key + 1)
            return
        }
        playSound('explode')
        sfx.play('lose')
        setFellAt(level)
        session.record({
            id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
            label: `Fall L${level}`,
            profit: -activeBet, betAmount: activeBet,
            meta: { risk, level },
        })
        setToast({ kind: 'lose', amount: -activeBet, message: `Fell at level ${level}` })
        machine.finish({ kind: 'bust', profit: -activeBet, multiplier: 0, level })
        showToast('loss', 'Tower fell', `-${formatCredits(activeBet)}`)
        schedule(() => {
            setPhase('idle')
            setActiveBet(0)
            setLevel(0)
            setFellAt(null)
        }, 700)
    }

    const cashout = useCallback(() => {
        if (level === 0) return
        const returnAmount = activeBet * multiplier
        const profit = returnAmount - activeBet
        addWinnings(returnAmount, 'Tower return')
        if (multiplier >= 5) {
            playSound('bigwin')
            setBigWin({ trigger: Date.now(), profit, multiplier })
        } else {
            playSound('win')
        }
        sfx.play('cashout')
        setBurstKey(k => k + 1)
        session.record({
            id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
            label: `${multiplier}×`,
            profit, betAmount: activeBet, multiplier,
            meta: { risk, level },
        })
        setToast({ kind: 'cashout', multiplier, amount: profit, message: 'Tower cashed out' })
        machine.finish({ kind: 'cashed', profit, multiplier, level })
        showToast('win', 'Tower cashed out', `+${formatCredits(profit)}`)
        setPhase('idle')
        setActiveBet(0)
        schedule(() => setLevel(0), 800)
    }, [activeBet, addWinnings, level, machine, multiplier, playSound, risk, schedule, session, sfx, showToast])

    const recentProfit = session.history.slice(0, 12).reduce((s, i) => s + (i.profit || 0), 0)

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#41d6ff"
            backdrop="/assets/games/backdrops/backdrop-felt-navy.png"
            variant="stake"
            panel={
                <BetPanel
                    balance={balance}
                    initialBet={5}
                    runningRound={false}
                    actionLabel="Start Tower"
                    onPlay={performPlay}
                    disableAuto
                    lastBet={lastBet}
                    playPhase={phase === 'climbing' && level > 0 ? 'in-round' : null}
                    playLabel={phase === 'climbing' && level > 0 ? `Cashout ${multiplier.toFixed(2)}×` : 'Start Tower'}
                    onPlayPhaseAction={cashout}
                >
                    <div className="bp-section">
                        <label className="bp-label">Difficulty</label>
                        <div className="bp-row">
                            {Object.entries(PRESETS).map(([k, p]) => (
                                <button key={k} disabled={phase === 'climbing'} className={`bp-bet-btn ${risk === k ? 'active' : ''}`} onClick={() => setRisk(k)}>{p.label}</button>
                            ))}
                        </div>
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
            <CoreStageFrame minHeight={620} maxWidth={760} loading={!preloader.ready} className="tower-stage-frame">
                <div className={`tower-stage ${fellAt !== null ? 'loss-flash' : ''}`}>
                    <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />
                    <div className="tower-stack" style={{ transform: `translateY(${level * 4}px)` }}>
                        {Array.from({ length: HEIGHT }, (_, index) => {
                            const tileLevel = HEIGHT - index
                            const isCurrent = tileLevel === level + 1 && phase === 'climbing'
                            const isLit = index < level
                            const isFallen = fellAt !== null && index === fellAt
                            return (
                                <span
                                    key={`${index}-${ladderPulseKey}`}
                                    className={`tower-tile ${isLit ? 'lit ladder-reveal' : ''} ${isCurrent ? 'current' : ''} ${isFallen ? 'fallen' : ''}`}
                                    style={{ '--tower-reveal-delay': `${index * 60}ms` }}
                                >
                                    {tileLevel}
                                </span>
                            )
                        })}
                    </div>
                    <p className="bp-bal-line" style={{ color: 'var(--text-secondary)' }}>Level <strong>{level}</strong> · Multiplier <strong>{multiplier.toFixed(2)}×</strong></p>
                    <MultiplierBadge label="Climb" value={multiplier} state={phase === 'climbing' ? 'active' : fellAt !== null ? 'bust' : 'idle'} size="sm" />
                    <div className="tower-action-btns">
                        <button disabled={phase !== 'climbing'} onClick={climb}>Climb up</button>
                    </div>
                    {burstKey > 0 && phase === 'idle' && session.history[0]?.profit > 0 && <Particles key={burstKey} count={18} color="#41d6ff" />}
                    <ActionLockOverlay active={fellAt !== null} label="Fell" />
                    <ResultToast result={toast} onDismiss={() => setToast(null)} />
                </div>
            </CoreStageFrame>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={5} />
            <EducationPanel definition={definition} betAmount={5} winProbability={Math.pow(config.safe, Math.max(1, level + 1))} payoutMultiplier={Math.max(1.28, multiplier)} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
