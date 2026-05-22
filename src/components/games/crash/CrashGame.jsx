// Stake/Rainbet-style Crash game built on the shared shell.
// Player picks an auto-cashout target. Multiplier rises until the round busts.
// If the player cashes out before the bust, profit = bet × multiplier - bet.
// House edge baked into the bust distribution (1% house edge approximation).
//
// Visuals: canvas chart with rocket/exhaust sprites + explosion GIF on crash.
// A small simulated "other players" strip is sampled per round.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits, clamp } from '../../../utils/simulationMath'
import { nextRoll } from '../../../utils/fairRng'
import { useTremor, triggerTremor } from '../../../utils/tremor'
import { useCancellableTimeouts } from '../../../utils/scheduling'
import { BetPanel, BigWinOverlay, GameShell, HistoryDrawer, RecentResultsStrip, StatsOverlay, useGameSession } from '../primitives'
import { Particles } from '../../fx'
import EducationPanel from '../../EducationPanel'
import CrashChart from './CrashChart'
import PlayerStrip from './PlayerStrip'
import './crash.css'

const HOUSE_EDGE = 0.01
const TARGET_PRESETS = [1.25, 1.5, 2, 3, 5, 10, 25, 50, 100]

function rollCrashMultiplier(uniform) {
    const u = Math.max(1e-9, Math.min(1 - 1e-9, uniform))
    if (u < HOUSE_EDGE) return 1.0
    const m = (1 - HOUSE_EDGE) / (1 - u)
    return Math.max(1.0, Math.floor(m * 100) / 100)
}

// Time → multiplier curve. ~1.06× per second.
function multiplierAt(t) {
    return Math.max(1, Math.pow(1.06, t))
}

const SIM_NAMES = ['Lyra', 'Reno', 'Kaia', 'Ozzy', 'Nia', 'Vex', 'Mika', 'Juno', 'Sable', 'Rune', 'Pixie', 'Quark', 'Tess', 'Echo', 'Wynn', 'Zev', 'Mira', 'Lev', 'Kit', 'Rhea']
const SIM_COLORS = ['#ff7ab6', '#6db7ff', '#ffcf5a', '#9bf08a', '#c08bff', '#ff9457', '#5be0d4', '#41d6ff', '#ffe680', '#7bd389']

// QA v4: bigger sim crowd (8–12 players) so the strip feels alive at the new
// canvas size.
function simulatePlayers(bust) {
    const n = 8 + Math.floor(Math.random() * 5)
    const out = []
    for (let i = 0; i < n; i++) {
        // Long-tail target distribution biased toward 1.5×–4× with rare moonshots.
        const r = Math.random()
        const target = r < 0.55 ? 1.3 + Math.random() * 1.6
            : r < 0.85 ? 2.5 + Math.random() * 5
            : 8 + Math.random() * 25
        const bet = Math.round((1 + Math.random() * 49) * 100) / 100
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
    const session = useGameSession('crash-shell')

    const [phase, setPhase] = useState('idle')
    const [multiplier, setMultiplier] = useState(1)
    const [elapsed, setElapsed] = useState(0)
    const [target, setTarget] = useState(2)
    const [crashedAt, setCrashedAt] = useState(null)
    const [cashedAt, setCashedAt] = useState(null)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [burstKey, setBurstKey] = useState(0)
    const [lastBet, setLastBet] = useState(null)
    const [players, setPlayers] = useState(() => simulatePlayers(2.2))

    const tickRef = useRef(null)
    const startTsRef = useRef(0)
    const bustRef = useRef(0)
    const settleRef = useRef(null)
    const stakeRef = useRef(0)
    const screenRef = useTremor()
    const lastTickMultRef = useRef(1)
    const { schedule, cancelAll } = useCancellableTimeouts()

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
        if (phase === 'running') { resolve({ profit: 0 }); return }
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
        setMultiplier(1)
        setElapsed(0)
        setPhase('running')
        startTsRef.current = performance.now()
        playSound('tick')

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
                addWinnings(betAmount * eff, 'Crash return')
                if (eff >= 5) {
                    playSound('bigwin')
                    setBigWin({ trigger: Date.now(), profit, multiplier: eff })
                    triggerTremor(screenRef, 'lg')
                } else {
                    playSound('win')
                }
                setBurstKey(k => k + 1)
                setPhase('cashed')
            } else {
                playSound('explode')
                triggerTremor(screenRef, 'lg')
                setPhase('crashed')
            }
            showToast(profit >= 0 ? 'win' : 'loss', outcome.cashed ? 'Cashed out' : 'Crashed', `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
            schedule(() => setPhase('idle'), 1400)
            resolve({ profit })
        }

        const tick = () => {
            const now = performance.now()
            const t = (now - startTsRef.current) / 1000
            const m = multiplierAt(t)
            setElapsed(t)
            if (m >= target && target > 1.0 && bustRef.current >= target) {
                setMultiplier(target)
                setCashedAt(target)
                const profit = stakeRef.current * (target - 1)
                settleRef.current?.({ cashed: true, effective: target, profit })
                return
            }
            if (m >= bustRef.current) {
                setMultiplier(bustRef.current)
                setCrashedAt(bustRef.current)
                settleRef.current?.({ cashed: false, effective: bustRef.current, profit: -stakeRef.current })
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
    })

    const cashOut = () => {
        if (phase !== 'running') return
        const m = multiplier
        setCashedAt(m)
        const profit = stakeRef.current * (m - 1)
        settleRef.current?.({ cashed: true, effective: m, profit })
    }

    const recentProfit = session.history.slice(0, 12).reduce((s, i) => s + (i.profit || 0), 0)
    const inRound = phase === 'running'
    const tagText = phase === 'crashed' ? 'BUST' : phase === 'cashed' ? 'CASHED' : null

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#ff7ab6"
            backdrop="/assets/games/backdrops/backdrop-stars.png"
            panel={
                <BetPanel
                    balance={balance}
                    initialBet={5}
                    runningRound={false}
                    actionLabel="Place Bet"
                    onPlay={performPlay}
                    lastBet={lastBet}
                    playPhase={inRound ? 'in-round' : null}
                    playLabel={inRound ? `Cashout ${multiplier.toFixed(2)}×` : 'Place Bet'}
                    onPlayPhaseAction={cashOut}
                >
                    <div className="bp-section">
                        <label className="bp-label">Auto Cashout (×)</label>
                        <input
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
            <div className={`crash-stage phase-${phase}`}>
                <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />
                <div ref={screenRef} className={`crash-screen ${phase === 'crashed' ? 'busted' : ''} ${phase === 'cashed' ? 'cashed' : ''}`}>
                    <CrashChart phase={phase} multiplier={multiplier} elapsedTime={elapsed} />
                    <div className="crash-mult">
                        <span className="crash-mult-num">{multiplier.toFixed(2)}<span className="crash-mult-x">×</span></span>
                        {tagText && <span className={`crash-tag ${phase === 'cashed' ? 'good' : ''}`}>{tagText}</span>}
                    </div>
                    {burstKey > 0 && phase === 'cashed' && <Particles key={burstKey} count={20} color="#ff7ab6" />}
                </div>
                <div className="crash-meta">
                    <span>Target <strong>{target.toFixed(2)}×</strong></span>
                    <span>{phase === 'crashed' ? `Last bust ${crashedAt?.toFixed(2)}×` : phase === 'cashed' ? `Cashed ${cashedAt?.toFixed(2)}×` : phase === 'running' ? `Live ${multiplier.toFixed(2)}×` : 'Stable'}</span>
                </div>
                <PlayerStrip players={players} phase={phase} multiplier={multiplier} />
            </div>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={5} />
            <EducationPanel definition={definition} betAmount={5} winProbability={(1 - HOUSE_EDGE) / target} payoutMultiplier={target} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
