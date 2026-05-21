// Stake-style Plinko on the shared shell with real canvas physics.
//
// QA v3 update: drops are non-blocking. The play button never disables on a
// running drop; rapid-fire spam works and each ball settles its own promise
// via the engine's `ballId`. Per-ball image/colour propagates so a Ruby ball
// dropped beside a Sapphire ball keeps its own art.

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits } from '../../../utils/simulationMath'
import { nextRoll } from '../../../utils/fairRng'
import { BetPanel, BigWinOverlay, GameShell, HistoryDrawer, RecentResultsStrip, StatsOverlay, useGameSession } from '../primitives'
import EducationPanel from '../../EducationPanel'
import './plinko.css'

// Engine and outcomes table are imported lazily so the ~16MB outcomes module
// is split into its own chunk (only loaded on /plinko).
let enginePromise = null
function loadEngine() {
    if (!enginePromise) {
        enginePromise = import('./engine/PlinkoEngine.js').then(m => ({
            PlinkoEngine: m.default,
            constants: import('./engine/constants.js'),
        }))
    }
    return enginePromise
}

const HOUSE_EDGE = 0.01
const ROW_OPTIONS = [8, 10, 12, 14, 16]
const RISK_OPTIONS = ['low', 'medium', 'high']

const BALL_TYPES = {
    normal:   { id: 'normal',   name: 'Basic',    color: '#ff4d4f', image: '/images/coins/coin_original.svg', cost: 1,  bonus: 1  },
    bronze:   { id: 'bronze',   name: 'Bronze',   color: '#cd7f32', image: '/images/coins/coin_bronze.svg',   cost: 2,  bonus: 2  },
    silver:   { id: 'silver',   name: 'Silver',   color: '#bdc3c7', image: '/images/coins/coin_silver.svg',   cost: 3,  bonus: 3  },
    emerald:  { id: 'emerald',  name: 'Emerald',  color: '#2ecc71', image: '/images/coins/coin_emerald.svg',  cost: 5,  bonus: 5  },
    ruby:     { id: 'ruby',     name: 'Ruby',     color: '#e74c3c', image: '/images/coins/coin_ruby.svg',     cost: 10, bonus: 10 },
    sapphire: { id: 'sapphire', name: 'Sapphire', color: '#3498db', image: '/images/coins/coin_sapphire.svg', cost: 20, bonus: 20 },
}

function expectedReturn(payouts) {
    const n = payouts.length - 1
    const sum = payouts.reduce((acc, m, k) => {
        let coeff = 1
        for (let j = 1; j <= k; j++) coeff *= (n - j + 1) / j
        return acc + (coeff / Math.pow(2, n)) * m
    }, 0)
    return sum * (1 - HOUSE_EDGE)
}

export default function PlinkoGame() {
    const definition = findGameDefinition('plinko') || { name: 'Plinko', category: 'Originals' }
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const session = useGameSession('plinko-shell')

    const canvasRef = useRef(null)
    const engineRef = useRef(null)
    // Map of ballId -> settle fn so concurrent drops resolve their own promise.
    const settleByIdRef = useRef(new Map())
    const lastBigWinAtRef = useRef(0)

    const [risk, setRisk] = useState('medium')
    const [rows, setRows] = useState(12)
    const [ballType, setBallType] = useState('normal')
    const [activeDrops, setActiveDrops] = useState(0)
    const [lastBet, setLastBet] = useState(null)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [highlightBin, setHighlightBin] = useState(null)
    const [payouts, setPayouts] = useState(null)
    const [binColors, setBinColors] = useState(null)
    const [engineReady, setEngineReady] = useState(false)

    useEffect(() => {
        if (!canvasRef.current) return
        let cancelled = false
        loadEngine().then(async ({ PlinkoEngine, constants }) => {
            if (cancelled) return
            const { BIN_PAYOUTS, getBinColors } = await constants
            const engine = new PlinkoEngine(canvasRef.current, {
                rowCount: rows,
                riskLevel: risk,
                betAmount: 1,
                onBallEnterBin: ({ ballId, binIndex, payout }) => {
                    const settle = settleByIdRef.current.get(ballId)
                    if (settle) {
                        settleByIdRef.current.delete(ballId)
                        settle({ binIndex, multiplier: payout.multiplier })
                    }
                    setHighlightBin(binIndex)
                    window.setTimeout(() => setHighlightBin(null), 800)
                },
                onBalanceChange: () => { },
            })
            engine.start()
            engineRef.current = engine
            setPayouts(BIN_PAYOUTS[rows][risk])
            setBinColors(getBinColors(rows))
            setEngineReady(true)
        })
        return () => {
            cancelled = true
            if (engineRef.current) engineRef.current.stop()
            engineRef.current = null
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        const engine = engineRef.current
        if (!engine) return
        engine.updateRowCount(rows)
        engine.updateRiskLevel(risk)
        loadEngine().then(async ({ constants }) => {
            const { BIN_PAYOUTS, getBinColors } = await constants
            setPayouts(BIN_PAYOUTS[rows][risk])
            setBinColors(getBinColors(rows))
        })
    }, [rows, risk])

    // The selected default ball image is preserved as engine-wide style for
    // any ball dropped without explicit per-drop overrides.
    useEffect(() => {
        const engine = engineRef.current
        if (!engine) return
        const ball = BALL_TYPES[ballType]
        engine.updateBallStyle(ball.color, ball.image)
    }, [ballType])

    // Drop a ball — non-blocking. Uses per-ball image so concurrent drops of
    // different types each keep their own art.
    //
    // QA v4 short-circuit: when called from the BetPanel autoplay loop
    // (mode === 'auto'), resolve the promise immediately after dropping the
    // ball so the loop ticks at its 500ms cadence and we get a continuous
    // shower instead of one-ball-at-a-time. Settlement still resolves stats /
    // bigwin via the per-ball settle map below.
    const performPlay = useCallback(({ betAmount, mode }) => new Promise(resolve => {
        const engine = engineRef.current
        if (!engine || !payouts) { resolve({ profit: 0 }); return }
        const ball = BALL_TYPES[ballType]
        const cost = betAmount * ball.cost
        if (!placeBet(cost, 'Plinko')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(cost)}`)
            resolve({ profit: 0 })
            return
        }
        setLastBet(betAmount)
        setActiveDrops(n => n + 1)
        playSound('tick')

        // Galton walk to determine the bin via fair RNG.
        let binIndex = 0
        for (let i = 0; i < rows; i++) {
            const { roll } = nextRoll('plinko')
            if (roll >= 0.5) binIndex += 1
        }

        engine.updateBetAmount(betAmount)
        const droppedBall = engine.dropBall(binIndex, ballType, { color: ball.color, image: ball.image })
        const ballId = droppedBall.id

        // For autoplay, resolve right away so the loop drops the next ball.
        // Settlement runs async via the settle map below.
        if (mode === 'auto') {
            resolve({ profit: 0 })
        }

        settleByIdRef.current.set(ballId, ({ binIndex: bi, multiplier: rawMult, cancelled }) => {
            // Engine emits cancelled events when row count changes mid-flight.
            if (cancelled) {
                setActiveDrops(n => Math.max(0, n - 1))
                if (mode !== 'auto') resolve({ profit: 0 })
                return
            }
            const mult = Number((rawMult * ball.bonus * (1 - HOUSE_EDGE)).toFixed(4))
            const returnAmount = betAmount * mult
            const profit = returnAmount - cost
            if (returnAmount > 0) addWinnings(returnAmount, 'Plinko return')
            session.record({
                id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
                label: `${mult.toFixed(2)}× bin ${bi}`,
                profit, betAmount: cost, multiplier: mult,
                meta: { rows, risk, ballType, binIndex: bi },
            })
            const now = Date.now()
            if (mult >= 15 && now - lastBigWinAtRef.current > 4500) {
                lastBigWinAtRef.current = now
                playSound('bigwin')
                setBigWin({ trigger: now, profit, multiplier: mult })
            } else {
                playSound(profit > 0 ? 'win' : 'loss')
            }
            showToast(profit >= 0 ? 'win' : 'loss', `Plinko ${mult.toFixed(2)}×`, `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
            setActiveDrops(n => Math.max(0, n - 1))
            if (mode !== 'auto') resolve({ profit })
        })
    }), [payouts, ballType, rows, risk, placeBet, addWinnings, playSound, showToast, session])

    // Quick-drop button — schedules N drops at 500ms each, regardless of the
    // BetPanel's autoplay tab. Lets the player spam-drop a Ruby/Sapphire run
    // without micromanaging autoplay.
    const quickDrop = useCallback((count, betAmount = 1) => {
        let dropped = 0
        const tick = () => {
            if (dropped >= count) return
            performPlay({ betAmount, mode: 'auto' })
            dropped += 1
            window.setTimeout(tick, 500)
        }
        tick()
    }, [performPlay])

    const lastResult = session.history[0]
    const lastMultiplier = lastResult?.multiplier ?? null
    const recentProfit = session.history.slice(0, 12).reduce((s, i) => s + (i.profit || 0), 0)
    const expected = useMemo(() => payouts ? expectedReturn(payouts) : 0, [payouts])
    const ball = BALL_TYPES[ballType]

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#ffcf5a"
            backdrop="/assets/games/backdrops/backdrop-felt-navy.png"
            panel={
                <BetPanel
                    balance={balance}
                    initialBet={5}
                    runningRound={!engineReady}
                    actionLabel={engineReady ? 'Drop Ball' : 'Loading…'}
                    onPlay={performPlay}
                    lastBet={lastBet}
                    autoIntervalMs={500}
                    autoTimeoutMs={6000}
                >
                    <div className="bp-section">
                        <label className="bp-label">Rows</label>
                        <div className="bp-row">
                            {ROW_OPTIONS.map(r => (
                                <button key={r} className={`bp-bet-btn ${rows === r ? 'active' : ''}`} disabled={activeDrops > 0} onClick={() => setRows(r)}>{r}</button>
                            ))}
                        </div>
                    </div>
                    <div className="bp-section">
                        <label className="bp-label">Risk</label>
                        <div className="bp-row">
                            {RISK_OPTIONS.map(r => (
                                <button key={r} className={`bp-bet-btn ${risk === r ? 'active' : ''}`} disabled={activeDrops > 0} onClick={() => setRisk(r)}>{r}</button>
                            ))}
                        </div>
                    </div>
                    <div className="bp-section">
                        <label className="bp-label">Ball ({ball.name} · {ball.cost}× cost / {ball.bonus}× payout)</label>
                        <div className="plinko-ball-grid">
                            {Object.values(BALL_TYPES).map(b => (
                                <button
                                    key={b.id}
                                    className={`plinko-ball-chip ${ballType === b.id ? 'active' : ''}`}
                                    title={`${b.name} · cost ${b.cost}× · bonus ${b.bonus}×`}
                                    onClick={() => setBallType(b.id)}
                                >
                                    <img src={b.image} alt={b.name} />
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="bp-section">
                        <label className="bp-label">Quick drop (500ms each)</label>
                        <div className="bp-row">
                            <button className="bp-bet-btn" type="button" onClick={() => quickDrop(5, 1)}>+5</button>
                            <button className="bp-bet-btn" type="button" onClick={() => quickDrop(10, 1)}>+10</button>
                            <button className="bp-bet-btn" type="button" onClick={() => quickDrop(25, 1)}>+25</button>
                        </div>
                    </div>
                    <div className="bp-bal-line"><span>Avg return</span><strong>{expected.toFixed(2)}×</strong></div>
                    <div className="bp-bal-line"><span>In flight</span><strong>{activeDrops}</strong></div>
                </BetPanel>
            }
            aside={
                <>
                    <StatsOverlay stats={session.stats} definition={definition} />
                    <HistoryDrawer history={session.history} onClear={session.clear} />
                </>
            }
        >
            <div className="plinko-stage">
                <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />
                <div className="plinko-canvas-wrap">
                    <canvas ref={canvasRef} className="plinko-canvas" />
                    {payouts && binColors && (
                        <div className="plinko-bins" style={{ '--bins': payouts.length }}>
                            {payouts.map((m, i) => (
                                <div
                                    key={i}
                                    className={`plinko-bin-chip ${i === highlightBin ? 'hit' : ''}`}
                                    style={{ background: binColors.background[i], boxShadow: `0 4px 0 ${binColors.shadow[i]}` }}
                                >
                                    {m}{m < 100 ? '×' : ''}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="plinko-meta">
                    <span>Last <strong>{lastMultiplier ? `${Number(lastMultiplier).toFixed(2)}×` : '—'}</strong></span>
                    <span>Rows <strong>{rows}</strong></span>
                    <span>Risk <strong>{risk}</strong></span>
                </div>
            </div>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={15} />
            <EducationPanel definition={definition} betAmount={5} winProbability={0.5} payoutMultiplier={expected} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
