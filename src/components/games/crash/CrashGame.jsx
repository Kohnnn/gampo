// Stake/Rainbet-style Crash game built on the shared shell.
// Player picks an auto-cashout target. Multiplier rises until the round busts.
// If the player cashes out before the bust, profit = bet × multiplier - bet.
// House edge baked into the bust distribution (1% house edge approximation).
//
// Visuals: canvas chart with rocket/exhaust sprites + explosion GIF on crash.
// A small simulated "other players" strip is sampled per round.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { useSfx } from '../../../audio/useSfx'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits, clamp } from '../../../utils/simulationMath'
import { nextRoll } from '../../../utils/fairRng'
import { useTremor, triggerTremor } from '../../../utils/tremor'
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
    buildEvents,
    useRoundMachine,
} from '../primitives'
import { useOriginalsPreloader } from '../../games/resources/useOriginalsPreloader'
import { Particles } from '../../fx'
import EducationPanel from '../../EducationPanel'
import CrashChart from './CrashChart'
import './crash.css'
import { useGameBgm } from '../../../audio/useBgm'

const HOUSE_EDGE = 0.01
const TARGET_PRESETS = [1.25, 1.5, 2, 3, 5, 10, 25, 50, 100]
const BETTING_OPEN_MS = 3500

function rollCrashMultiplier(uniform) {
    const u = Math.max(1e-9, Math.min(1 - 1e-9, uniform))
    if (u < HOUSE_EDGE) return 1.0
    const m = (1 - HOUSE_EDGE) / (1 - u)
    return Math.max(1.0, Math.floor(m * 100) / 100)
}

// Time → multiplier curve, Rainbet-style. Slow ease-in for first 5s
// (~1.07× per second) then accelerates (~1.10× per second) so big rounds
// build tension faster.
function multiplierAt(t) {
    if (t <= 0) return 1
    if (t < 5) return Math.pow(1.07, t)
    return Math.pow(1.07, 5) * Math.pow(1.10, t - 5)
}

// Inverse of multiplierAt. Used to bake a deterministic event timeline
// when we know the bust target up front.
function solveBustTimeSec(bust) {
    if (bust <= 1) return 0
    const fiveSecPeak = Math.pow(1.07, 5)
    if (bust <= fiveSecPeak) {
        return Math.log(bust) / Math.log(1.07)
    }
    return 5 + Math.log(bust / fiveSecPeak) / Math.log(1.10)
}

const SIM_NAMES = ['Lyra', 'Reno', 'Kaia', 'Ozzy', 'Nia', 'Vex', 'Mika', 'Juno', 'Sable', 'Rune', 'Pixie', 'Quark', 'Tess', 'Echo', 'Wynn', 'Zev', 'Mira', 'Lev', 'Kit', 'Rhea']
const SIM_COLORS = ['#ff7ab6', '#6db7ff', '#ffcf5a', '#9bf08a', '#c08bff', '#ff9457', '#5be0d4', '#41d6ff', '#ffe680', '#7bd389']

// Wave 28: bigger sim crowd (10–16 players) with persona biases.
function simulatePlayers(bust) {
    const n = 10 + Math.floor(Math.random() * 7)
    const out = []
    for (let i = 0; i < n; i++) {
        // Persona bias: roughly 30% cautious (low target), 50% mid, 15% gambler, 5% whale.
        const r = Math.random()
        let target
        if (r < 0.3) target = 1.2 + Math.random() * 0.8           // cautious 1.2-2.0
        else if (r < 0.8) target = 1.8 + Math.random() * 3.2     // mid 1.8-5.0
        else if (r < 0.95) target = 4 + Math.random() * 12       // gambler 4-16
        else target = 12 + Math.random() * 40                    // whale 12-52
        // Bet sizes vary by persona too (rough proxy via target band)
        const bet = r < 0.3 ? Math.round((1 + Math.random() * 9) * 100) / 100
            : r < 0.8 ? Math.round((2 + Math.random() * 28) * 100) / 100
            : r < 0.95 ? Math.round((10 + Math.random() * 60) * 100) / 100
            : Math.round((50 + Math.random() * 250) * 100) / 100
        const cashed = bust >= target
        out.push({
            id: `${i}-${Math.random().toString(16).slice(2, 6)}`,
            name: SIM_NAMES[(i + Math.floor(Math.random() * SIM_NAMES.length)) % SIM_NAMES.length],
            color: SIM_COLORS[i % SIM_COLORS.length],
            bet, target: Number(target.toFixed(2)), cashed, cashedAt: cashed ? Number(target.toFixed(2)) : 0,
        })
    }
    return out
}

export default function CrashGame() {
    const definition = findGameDefinition('crash') || { name: 'Crash', category: 'Originals' }
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const sfx = useSfx('crash')
    const session = useGameSession('crash-shell')
    const preloader = useOriginalsPreloader('crash')

    const [phase, setPhase] = useState('idle')
    const [multiplier, setMultiplier] = useState(1)
    const [elapsed, setElapsed] = useState(0)
    const [target, setTarget] = useState(2)
    const [crashedAt, setCrashedAt] = useState(null)
    const [cashedAt, setCashedAt] = useState(null)
    const [missedAt, setMissedAt] = useState(null)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [burstKey, setBurstKey] = useState(0)
    const [lastBet, setLastBet] = useState(null)
    const [players, setPlayers] = useState(() => simulatePlayers(2.2))
    const [bettingMs, setBettingMs] = useState(0)
    const [pendingBet, setPendingBet] = useState(null)
    const [toast, setToast] = useState(null)

    const tickRef = useRef(null)
    const startTsRef = useRef(0)
    const bustRef = useRef(0)
    const settleRef = useRef(null)
    const cashoutRef = useRef(null)
    const stakeRef = useRef(0)
    const screenRef = useTremor()
    const lastTickMultRef = useRef(1)
    const bettingDeadlineRef = useRef(0)
    const bettingTickRef = useRef(null)
    const pendingResolveRef = useRef(null)
    const { schedule, cancelAll } = useCancellableTimeouts()
    const crashBgmMode = phase === 'running' && multiplier >= 5 ? 'bonus' : 'idle'
    useGameBgm('crash', crashBgmMode)

    // Wave 2 deterministic round machine. Crash drives the multiplier
    // through pre-baked events: betting countdown, ramp checkpoints, bust
    // marker, result. The 60fps rAF still drives smooth multiplier
    // animation on top of the event timeline so the chart stays smooth.
    const handleEvent = useCallback((ev) => {
        if (!ev) return
        switch (ev.type) {
            case ROUND_EVENTS.ANIMATION_CHECKPOINT:
                if (ev.payload?.kind === 'tick') sfx.play('tick')
                break
            case ROUND_EVENTS.ROUND_RESULT: {
                const { kind, profit, multiplier: m } = ev.payload || {}
                if (kind === 'cashed') {
                    setToast({ kind: 'cashout', amount: profit, multiplier: m, message: 'Cashed out' })
                    sfx.play('cashout')
                } else if (kind === 'bust') {
                    setToast({ kind: 'lose', amount: -Math.abs(profit), message: `Crashed ${m.toFixed(2)}x` })
                    sfx.play('lose')
                }
                break
            }
            default:
                break
        }
    }, [sfx])
    const machine = useRoundMachine({ onEvent: handleEvent })

    useEffect(() => () => {
        if (tickRef.current) window.cancelAnimationFrame(tickRef.current)
    }, [])

    // QA v4: visibility recovery. Browsers throttle requestAnimationFrame to
    // ~1Hz when the tab is backgrounded. Without this, returning to the tab
    // mid-round leaves the multiplier stuck. We snapshot the wall-clock and
    // when the tab returns, fast-forward to the live multiplier (capped at
    // bust + 2s to avoid surprise huge bust reveal).
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState !== 'visible') return
            if (phase !== 'running' || !settleRef.current) return
            const t = (performance.now() - startTsRef.current) / 1000
            const m = multiplierAt(t)
            if (m >= bustRef.current) {
                setMultiplier(bustRef.current)
                setCrashedAt(bustRef.current)
                settleRef.current?.({ cashed: false, effective: bustRef.current, profit: -stakeRef.current })
            }
        }
        document.addEventListener('visibilitychange', onVisible)
        return () => document.removeEventListener('visibilitychange', onVisible)
    }, [phase])

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (phase === 'running' || phase === 'cashed' || phase === 'betting') { resolve({ profit: 0 }); return }
        if (!placeBet(betAmount, 'Crash')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            resolve({ profit: 0 }); return
        }
        cancelAll()
        setLastBet(betAmount)
        stakeRef.current = betAmount
        const { roll } = nextRoll('crash')
        const bust = rollCrashMultiplier(roll)
        bustRef.current = bust
        setPlayers(simulatePlayers(bust))
        setCrashedAt(null)
        setCashedAt(null)
        setMissedAt(null)
        setMultiplier(1)
        setElapsed(0)
        setPendingBet(betAmount)
        setToast(null)
        cashoutRef.current = null
        // Start a Rainbet-style "Betting open" countdown. Sim players visibly
        // queue bets during this window. The actual round (rocket flight)
        // doesn't start until the countdown elapses.
        setPhase('betting')
        bettingDeadlineRef.current = performance.now() + BETTING_OPEN_MS
        setBettingMs(BETTING_OPEN_MS)
        playSound('tick')
        sfx.play('click')
        pendingResolveRef.current = resolve

        // Wave 2 deterministic event timeline. The bust point and result
        // are computed up front; visual rAF below renders the smooth
        // multiplier on top of these events.
        const bustTimeSec = solveBustTimeSec(bust)
        const busts = bustTimeSec * 1000
        const events = buildEvents(api => {
            api.push(ROUND_EVENTS.ROUND_START, { bust, betAmount, target }, 0)
            api.push(ROUND_EVENTS.INPUT_LOCK, {}, 0)
            api.push(ROUND_EVENTS.BET_ACCEPTED, { betAmount, bettingMs: BETTING_OPEN_MS }, 0)
            // Periodic checkpoints so audio + replay tooling can scrub.
            const checkpointEvery = 350
            for (let off = checkpointEvery; off < busts; off += checkpointEvery) {
                const tSec = off / 1000
                api.push(ROUND_EVENTS.MULTIPLIER_UPDATE, { value: multiplierAt(tSec) }, BETTING_OPEN_MS + off)
                api.push(ROUND_EVENTS.ANIMATION_CHECKPOINT, { kind: 'tick' }, BETTING_OPEN_MS + off)
            }
            api.push(ROUND_EVENTS.RNG_REVEAL, { bust }, BETTING_OPEN_MS + busts)
        })
        machine.start(events, { autoFinish: false })

        const beat = () => {
            const remaining = Math.max(0, bettingDeadlineRef.current - performance.now())
            setBettingMs(remaining)
            if (remaining <= 0) {
                if (bettingTickRef.current) { window.cancelAnimationFrame(bettingTickRef.current); bettingTickRef.current = null }
                startRound()
                return
            }
            bettingTickRef.current = window.requestAnimationFrame(beat)
        }
        bettingTickRef.current = window.requestAnimationFrame(beat)

        const startRound = () => {
            setPhase('running')
            setBettingMs(0)
            setPendingBet(null)
            const betAmount = stakeRef.current
            const bust = bustRef.current
            startTsRef.current = performance.now()

            settleRef.current = (outcome) => {
                settleRef.current = null
                if (tickRef.current) { window.cancelAnimationFrame(tickRef.current); tickRef.current = null }
                const profit = outcome.profit
                const eff = outcome.effective
                session.record({
                    id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
                    label: outcome.cashed ? `Cashed ${eff.toFixed(2)}×` : `Bust ${bust.toFixed(2)}×`,
                    profit, betAmount,
                    multiplier: outcome.cashed ? eff : 0,
                    meta: { bust, cashedAt: outcome.cashed ? eff : null },
                })
                if (outcome.cashed) {
                    if (eff >= 5) {
                        playSound('bigwin')
                        setBigWin({ trigger: Date.now(), profit, multiplier: eff })
                        triggerTremor(screenRef, 'lg')
                    } else {
                        playSound('win')
                    }
                } else {
                    playSound('explode')
                    triggerTremor(screenRef, 'lg')
                    setPhase('crashed')
                }
                showToast(profit >= 0 ? 'win' : 'loss', outcome.cashed ? 'Cashed out' : 'Crashed', `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
                machine.finish({
                    kind: outcome.cashed ? 'cashed' : 'bust',
                    profit,
                    multiplier: eff,
                    bust,
                })
                schedule(() => setPhase('idle'), 1400)
                cashoutRef.current = null
                pendingResolveRef.current = null
                resolve({ profit })
            }

            const cashRound = (m) => {
                if (cashoutRef.current || !settleRef.current) return false
                const effective = Number(m.toFixed(2))
                const profit = stakeRef.current * (effective - 1)
                cashoutRef.current = { effective, profit }
                setCashedAt(effective)
                setPhase('cashed')
                addWinnings(stakeRef.current * effective, 'Crash return')
                session.record({
                    id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
                    label: `Cashed ${effective.toFixed(2)}×`,
                    profit,
                    betAmount,
                    multiplier: effective,
                    meta: { bust, cashedAt: effective },
                })
                if (effective >= 5) {
                    playSound('bigwin')
                    setBigWin({ trigger: Date.now(), profit, multiplier: effective })
                    triggerTremor(screenRef, 'lg')
                } else {
                    playSound('win')
                }
                setBurstKey(k => k + 1)
                showToast('win', 'Cashed out', `+${formatCredits(profit)}`)
                return true
            }

            const tick = () => {
                const now = performance.now()
                const t = (now - startTsRef.current) / 1000
                const m = multiplierAt(t)
                setElapsed(t)
                if (!cashoutRef.current && m >= target && target > 1.0 && bustRef.current >= target) {
                    cashRound(target)
                }
                if (m >= bustRef.current) {
                    setMultiplier(bustRef.current)
                    setCrashedAt(bustRef.current)
                    if (cashoutRef.current) {
                        setMissedAt(bustRef.current)
                        playSound('explode')
                        settleRef.current = null
                        if (tickRef.current) { window.cancelAnimationFrame(tickRef.current); tickRef.current = null }
                        schedule(() => setPhase('idle'), 2200)
                        const cashedProfit = cashoutRef.current.profit
                        cashoutRef.current = null
                        pendingResolveRef.current = null
                        resolve({ profit: cashedProfit })
                    } else {
                        settleRef.current?.({ cashed: false, effective: bustRef.current, profit: -stakeRef.current })
                    }
                    return
                }
                // Per-0.1× tick audio for tactile feel.
                if (m - lastTickMultRef.current >= 0.1) {
                    lastTickMultRef.current = m
                    playSound('tick')
                }
                setMultiplier(m)
                tickRef.current = window.requestAnimationFrame(tick)
            }
            lastTickMultRef.current = 1
            tickRef.current = window.requestAnimationFrame(tick)
        }
    })

    const cashOut = () => {
        if (phase !== 'running') return
        const m = multiplier
        const effective = Number(m.toFixed(2))
        if (cashoutRef.current || !settleRef.current) return
        const profit = stakeRef.current * (effective - 1)
        cashoutRef.current = { effective, profit }
        setCashedAt(effective)
        setPhase('cashed')
        addWinnings(stakeRef.current * effective, 'Crash return')
        session.record({
            id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
            label: `Cashed ${effective.toFixed(2)}×`,
            profit,
            betAmount: stakeRef.current,
            multiplier: effective,
            meta: { bust: bustRef.current, cashedAt: effective },
        })
        if (effective >= 5) {
            playSound('bigwin')
            setBigWin({ trigger: Date.now(), profit, multiplier: effective })
            triggerTremor(screenRef, 'lg')
        } else {
            playSound('win')
        }
        setBurstKey(k => k + 1)
        showToast('win', 'Cashed out', `+${formatCredits(profit)}`)
        machine.finish({ kind: 'cashed', profit, multiplier: effective, bust: bustRef.current })
    }

    const recentProfit = session.history.slice(0, 12).reduce((s, i) => s + (i.profit || 0), 0)
    const inRound = phase === 'running' || phase === 'cashed' || phase === 'betting'
    const tagText = phase === 'crashed' ? 'BUST' : phase === 'cashed' ? 'CASHED - STILL FLYING' : phase === 'betting' ? 'BETTING OPEN' : null
    const bettingSeconds = (bettingMs / 1000).toFixed(1)

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#ff7ab6"
            backdrop="/assets/games/backdrops/backdrop-stars.png"
            variant="stake"
            panel={
                <BetPanel
                    balance={balance}
                    initialBet={5}
                    runningRound={false}
                    actionLabel="Place Bet"
                    mobilePlayLabel={inRound ? `Cash ${multiplier.toFixed(2)}x` : 'Bet'}
                    onPlay={performPlay}
                    lastBet={lastBet}
                    playPhase={inRound ? 'in-round' : null}
                    playLabel={inRound ? `Cashout ${multiplier.toFixed(2)}×` : 'Place Bet'}
                    onPlayPhaseAction={cashOut}
                >
                    <div className="bp-section">
                        <label className="bp-label" htmlFor="crash-auto-cashout">Auto Cashout (×)</label>
                        <input
                            id="crash-auto-cashout"
                            type="number"
                            min="1.01"
                            max="1000"
                            step="0.1"
                            value={target}
                            disabled={inRound}
                            onChange={e => setTarget(clamp(Number(e.target.value) || 1.01, 1.01, 1000))}
                            className="bp-bet-input"
                        />
                        <div className="bp-quick-actions">
                            {TARGET_PRESETS.map(t => (
                                <button key={t} onClick={() => !inRound && setTarget(t)}>{t}×</button>
                            ))}
                        </div>
                    </div>
                    <div className="bp-bal-line">
                        <span>Hit chance</span>
                        <strong>{((1 - HOUSE_EDGE) / target * 100).toFixed(1)}%</strong>
                    </div>
                    <div className="crash-odds-card">
                        <div><span>Target</span><strong>{target.toFixed(2)}×</strong></div>
                        <div><span>Profit on 5 GC</span><strong>+{formatCredits(5 * (target - 1))}</strong></div>
                        <div><span>Bust risk</span><strong>{(100 - ((1 - HOUSE_EDGE) / target * 100)).toFixed(1)}%</strong></div>
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
            <CoreStageFrame minHeight={580} maxWidth={960} loading={!preloader.ready} className="crash-stage-frame" mobileScrollable>
                <div className={`crash-stage phase-${phase}`}>
                    <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />
                    <div className="crash-mobile-targets" data-mobile-critical-surface>
                        <span>Auto cashout {target.toFixed(2)}×</span>
                        <div className="crash-mobile-target-row">
                            {TARGET_PRESETS.map(t => (
                                <button key={t} type="button" className={target === t ? 'active' : ''} disabled={inRound} onClick={() => setTarget(t)}>
                                    {t}×
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="crash-deck">
                        <div ref={screenRef} className={`crash-screen ${phase === 'crashed' ? 'busted' : ''} ${phase === 'cashed' ? 'cashed' : ''} ${phase === 'betting' ? 'betting' : ''}`}>
                            <CrashChart phase={phase === 'betting' ? 'idle' : phase} multiplier={multiplier} elapsedTime={elapsed} players={players} />
                            <div className="crash-mult">
                                {phase === 'betting' ? (
                                    <>
                                        <span className="crash-countdown">{bettingSeconds}s</span>
                                        <span className="crash-tag">BETTING OPEN</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="crash-mult-num">{multiplier.toFixed(2)}<span className="crash-mult-x">×</span></span>
                                        {tagText && <span className={`crash-tag ${phase === 'cashed' ? 'good' : ''}`}>{tagText}</span>}
                                        {cashedAt && phase === 'cashed' && <span className="crash-missed">You locked {cashedAt.toFixed(2)}×. Current miss: {Math.max(0, multiplier - cashedAt).toFixed(2)}×</span>}
                                        {missedAt && <span className="crash-missed danger">Missed runway: {missedAt.toFixed(2)}×</span>}
                                    </>
                                )}
                            </div>
                            {burstKey > 0 && phase === 'cashed' && <Particles key={burstKey} count={20} color="#ff7ab6" />}
                        </div>
                        <aside className="crash-side-rail" aria-label="Live crash players">
                            <div className="crash-rail-head">
                                <span>Live bets</span>
                                <strong>{players.length}</strong>
                            </div>
                            <ul>
                                {players.map(p => {
                                    const liveCashed = (phase === 'running' || phase === 'cashed') && p.cashed && multiplier >= p.target
                                    const isBetting = phase === 'betting'
                                    const state = isBetting ? 'pending' : liveCashed ? 'cashed' : phase === 'crashed' ? (p.cashed ? 'cashed' : 'busted') : 'flying'
                                    return (
                                        <li key={p.id} className={state}>
                                            <span className="crash-rail-dot" style={{ background: p.color }} />
                                            <span className="crash-rail-name">{p.name}</span>
                                            <span className="crash-rail-bet">{p.bet.toFixed(2)}</span>
                                            <span className="crash-rail-target">@{p.target.toFixed(2)}×</span>
                                            <strong>
                                                {isBetting ? 'queued'
                                                    : state === 'cashed' ? `+${(p.bet * (p.cashedAt - 1)).toFixed(2)}`
                                                    : state === 'busted' ? `-${p.bet.toFixed(2)}`
                                                    : 'live'}
                                            </strong>
                                        </li>
                                    )
                                })}
                            </ul>
                        </aside>
                    </div>
                    <div className="crash-meta">
                        <MultiplierBadge label="Target" value={target} state={inRound ? 'active' : 'idle'} size="sm" />
                        <span>{phase === 'betting' ? `Round opens in ${bettingSeconds}s` : phase === 'crashed' ? `Last bust ${crashedAt?.toFixed(2)}×` : phase === 'cashed' ? `Cashed ${cashedAt?.toFixed(2)}×` : phase === 'running' ? `Live ${multiplier.toFixed(2)}×` : 'Stable'}</span>
                    </div>
                    <ActionLockOverlay active={phase === 'crashed'} label="Bust" />
                    <ResultToast result={toast} onDismiss={() => setToast(null)} />
                </div>
            </CoreStageFrame>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={getBigWinThreshold('crash')} />
            <EducationPanel definition={definition} betAmount={5} winProbability={(1 - HOUSE_EDGE) / target} payoutMultiplier={target} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
