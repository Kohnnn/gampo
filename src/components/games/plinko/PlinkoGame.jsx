// Stake-style Plinko on the shared shell with real canvas physics.
//
// QA v3 update: drops are non-blocking. The play button never disables on a
// running drop; rapid-fire spam works and each ball settles its own promise
// via the engine's `ballId`. Per-ball image/colour propagates so a Ruby ball
// dropped beside a Sapphire ball keeps its own art.

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useScrollActionIntoView } from '../../../hooks/useScrollActionIntoView'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { useSfx } from '../../../audio/useSfx'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits } from '../../../utils/simulationMath'
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
    useRoundMachine,
} from '../primitives'
import { useOriginalsPreloader } from '../../games/resources/useOriginalsPreloader'
import EducationPanel from '../../EducationPanel'
import './plinko.css'
import { useGameBgm } from '../../../audio/useBgm'

// Engine code is lazy-loaded; per-row outcome data is fetched separately as
// static JSON only when the selected Plinko board needs it.
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
    return payouts.reduce((acc, m, k) => {
        let coeff = 1
        for (let j = 1; j <= k; j++) coeff *= (n - j + 1) / j
        return acc + (coeff / Math.pow(2, n)) * m
    }, 0)
}


export default function PlinkoGame() {
    useGameBgm('plinko', 'idle')
    const definition = findGameDefinition('plinko') || { name: 'Plinko', category: 'Originals' }
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const sfx = useSfx('plinko')
    const session = useGameSession('plinko')
    const preloader = useOriginalsPreloader('plinko')

    const canvasRef = useRef(null)
    const engineRef = useRef(null)
    // Map of ballId -> settle fn so concurrent drops resolve their own promise.
    const settleByIdRef = useRef(new Map())
    const lastBigWinAtRef = useRef(0)
    const simSeqRef = useRef(0)

    const [risk, setRisk] = useState('medium')
    const [rows, setRows] = useState(12)
    const [ballType, setBallType] = useState('normal')
    const [activeDrops, setActiveDrops] = useState(0)
    const boardRef = useRef(null)
    // Bring the board into view when balls are in flight (mobile reachability).
    useScrollActionIntoView(boardRef, activeDrops > 0, [activeDrops > 0], { block: 'nearest' })
    const [lastBet, setLastBet] = useState(null)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [highlightBin, setHighlightBin] = useState(null)
    const [payouts, setPayouts] = useState(null)
    const [binColors, setBinColors] = useState(null)
    const [engineReady, setEngineReady] = useState(false)
    const [toast, setToast] = useState(null)
    const [simFeed, setSimFeed] = useState(() => makeInitialSimBetRows('plinko', { count: 12, cap: 14 }))

    // Wave 2 lightweight machine. Emits round-start on each drop and
    // round-result on each ball settlement; sim feed and physics flow
    // unchanged.
    const machine = useRoundMachine({})

    // 2026-06-11: keep the sim-drops feed alive even when the player is idle, so
    // the board always feels busy. A new simulated drop ticks in every ~2.4–4s.
    useEffect(() => {
        let timer = null
        const schedule = () => {
            // gampo:allow-math-random-visual — visual drop cadence jitter only; settle is keyed by per-ball id.
            const delay = 2400 + Math.random() * 1600
            timer = window.setTimeout(() => {
                simSeqRef.current += 1
                setSimFeed(prev => prependSimBetRow(prev, makeSimBetRow('plinko', {
                    seed: `plinko-idle:${simSeqRef.current}:${Date.now()}`,
                }), 14))
                schedule()
            }, delay)
        }
        schedule()
        return () => { if (timer) window.clearTimeout(timer) }
    }, [])

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
        sfx.play('click')

        // Galton walk to determine the bin via fair RNG.
        let binIndex = 0
        for (let i = 0; i < rows; i++) {
            const { roll } = nextRoll('plinko')
            if (roll >= 0.5) binIndex += 1
        }

        engine.updateBetAmount(betAmount)
        const droppedBall = engine.dropBall(binIndex, ballType, { color: ball.color, image: ball.image })
        const ballId = droppedBall.id

        // Lightweight Wave 2 round events: start + lock at drop time. The
        // result event fires at bucket-hit settlement below.
        machine.start([
            { index: 0, type: ROUND_EVENTS.ROUND_START, payload: { ballId, rows, risk, ballType, betAmount }, at: 0 },
            { index: 1, type: ROUND_EVENTS.INPUT_LOCK, payload: { ballId }, at: 0 },
            { index: 2, type: ROUND_EVENTS.BET_ACCEPTED, payload: { betAmount: cost, ballId }, at: 0 },
        ], { autoFinish: false })

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
            const mult = Number((rawMult * ball.bonus).toFixed(4))

            const returnAmount = betAmount * mult
            const profit = returnAmount - cost
            if (returnAmount > 0) addWinnings(returnAmount, 'Plinko return')
            session.record({
                id: crypto.randomUUID(),
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
            sfx.play(profit > 0 ? 'win' : 'lose')
            machine.finish({ won: profit > 0, profit, multiplier: mult, binIndex: bi })
            setToast({
                kind: profit > 0 ? 'win' : 'lose',
                multiplier: mult,
                amount: profit,
                message: `Plinko bin ${bi}`,
            })
            showToast(profit >= 0 ? 'win' : 'loss', `Plinko ${mult.toFixed(2)}×`, `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
            simSeqRef.current += 1
            setSimFeed(prev => prependSimBetRow(prev, makeSimBetRow('plinko', {
                seed: `plinko:${simSeqRef.current}:${rows}:${risk}:${bi}:${mult}`,
            }), 14))
            setActiveDrops(n => Math.max(0, n - 1))
            if (mode !== 'auto') resolve({ profit })
        })
    }), [payouts, ballType, rows, risk, placeBet, addWinnings, playSound, sfx, showToast, session, machine])

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
            variant="stake"
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
            <CoreStageFrame minHeight={580} maxWidth={920} loading={!preloader.ready || !engineReady} className="plinko-stage-frame">
                <div className="plinko-stage" ref={boardRef}>
                    <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />
                    <SimBetStrip rows={simFeed} title="Sim drops" />
                    <div className="plinko-canvas-wrap" data-mobile-critical-surface>
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
                        <MultiplierBadge label="Last" value={Number(lastMultiplier) || 0} state={lastMultiplier && lastMultiplier > 1 ? 'win' : 'idle'} size="sm" />
                        <span>Rows <strong>{rows}</strong></span>
                        <span>Risk <strong>{risk}</strong></span>
                        <span>In flight <strong>{activeDrops}</strong></span>
                    </div>
                    <ResultToast result={toast} onDismiss={() => setToast(null)} />
                    <ActionLockOverlay active={!engineReady} label="Loading..." />
                </div>
            </CoreStageFrame>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={getBigWinThreshold('plinko')} />
            <EducationPanel definition={definition} betAmount={5} winProbability={0.5} payoutMultiplier={expected} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
