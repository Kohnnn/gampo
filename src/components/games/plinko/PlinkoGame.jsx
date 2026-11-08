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
    SimBetStrip,
    makeInitialSimBetRows,
    makeSimBetRow,
    prependSimBetRow,
    ROUND_EVENTS,
    useRoundMachine,
} from '../primitives'
import { useOriginalsPreloader } from '../../games/resources/useOriginalsPreloader'
import { useCancellableTimeouts } from '../../../utils/scheduling'
import { plinkoBackingSize } from './frameSize'
import { plinkoSettlementRtp } from './plinkoRtp'
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

// QA008: keep the canvas backing store equal to the rendered CSS box × clamped
// DPR, so the fixed 760×570 model art never drifts out of its frame.
function sizeCanvasToFrame(engine, canvas) {
    if (!engine || !canvas) return
    const rect = canvas.getBoundingClientRect?.()
    const size = plinkoBackingSize(rect?.width || canvas.clientWidth, rect?.height || canvas.clientHeight, window.devicePixelRatio)
    // A hidden or unlaid-out canvas reports 0×0; leave the buffer alone rather
    // than collapsing it to nothing.
    if (!size.width || !size.height) return
    if (canvas.width === size.width && canvas.height === size.height) return
    engine.handleResize?.()
}

const BALL_TYPES = {
    normal:   { id: 'normal',   name: 'Basic',    color: '#ff4d4f', image: '/images/coins/coin_original.svg', cost: 1,  bonus: 1  },
    bronze:   { id: 'bronze',   name: 'Bronze',   color: '#cd7f32', image: '/images/coins/coin_bronze.svg',   cost: 2,  bonus: 2  },
    silver:   { id: 'silver',   name: 'Silver',   color: '#bdc3c7', image: '/images/coins/coin_silver.svg',   cost: 3,  bonus: 3  },
    emerald:  { id: 'emerald',  name: 'Emerald',  color: '#2ecc71', image: '/images/coins/coin_emerald.svg',  cost: 5,  bonus: 5  },
    ruby:     { id: 'ruby',     name: 'Ruby',     color: '#e74c3c', image: '/images/coins/coin_ruby.svg',     cost: 10, bonus: 10 },
    sapphire: { id: 'sapphire', name: 'Sapphire', color: '#3498db', image: '/images/coins/coin_sapphire.svg', cost: 20, bonus: 20 },
}

export function expectedReturn(payouts) {
    const n = payouts.length - 1
    return payouts.reduce((acc, m, k) => {
        let coeff = 1
        for (let j = 1; j <= k; j++) coeff *= (n - j + 1) / j
        return acc + (coeff / Math.pow(2, n)) * m
    }, 0)
}

export function plinkoReturn(betAmount, multiplier, cost) {
    const returnAmount = round2(betAmount * multiplier)
    return { returnAmount, profit: round2(returnAmount - cost) }
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
    const mountedRef = useRef(false)
    const engineRef = useRef(null)
    // Each ball keeps its resolver and selected outcome until it settles.
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
    const [selectedBet, setSelectedBet] = useState(5)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [highlightBin, setHighlightBin] = useState(null)
    const [payouts, setPayouts] = useState(null)
    const [binColors, setBinColors] = useState(null)
    const [engineReady, setEngineReady] = useState(false)
    const [toast, setToast] = useState(null)
    const [simFeed, setSimFeed] = useState(() => makeInitialSimBetRows('plinko', { count: 12, cap: 14 }))
    const { schedule } = useCancellableTimeouts()

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
        let resizeObserver = null
        let dprQuery = null
        let dprCleanup = null
        function armDpr() {
            if (typeof window.matchMedia !== 'function') return
            dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
            dprQuery.addEventListener?.('change', onDprChange)
            dprCleanup = () => dprQuery?.removeEventListener?.('change', onDprChange)
        }
        // A DPR change (drag to another display, browser zoom) re-reads the new
        // ratio before resizing, then re-arms the query so it can fire again.
        const onDprChange = () => {
            sizeCanvasToFrame(engineRef.current, canvasRef.current)
            dprCleanup?.()
            armDpr()
        }
        mountedRef.current = true
        loadEngine().then(async ({ PlinkoEngine, constants }) => {
            if (cancelled) return
            const { BIN_PAYOUTS, getBinColors } = await constants
            if (cancelled) return
            const engine = new PlinkoEngine(canvasRef.current, {
                rowCount: rows,
                riskLevel: risk,
                betAmount: 1,
                onBallEnterBin: ({ ballId, binIndex, payout }) => {
                    const pending = settleByIdRef.current.get(ballId)
                    if (pending) {
                        settleByIdRef.current.delete(ballId)
                        pending.settle({ binIndex, multiplier: payout.multiplier })
                    }
                    if (!mountedRef.current) return
                    setHighlightBin(binIndex)
                    schedule(() => setHighlightBin(null), 800)
                },
                onBalanceChange: () => { },
            })
            engine.start()
            engineRef.current = engine
            // QA008: the backing store is sized from the rendered box, so it has
            // to follow the frame (rotation, window resize, panel reflow) and
            // DPR changes. Without this the buffer kept its mount size and the
            // board drifted out of its CSS frame.
            sizeCanvasToFrame(engine, canvasRef.current)
            if (typeof ResizeObserver !== 'undefined' && canvasRef.current) {
                resizeObserver = new ResizeObserver(() => sizeCanvasToFrame(engine, canvasRef.current))
                resizeObserver.observe(canvasRef.current)
            }
            armDpr()
            setPayouts(BIN_PAYOUTS[rows][risk])
            setBinColors(getBinColors(rows))
            setEngineReady(true)
        })
        return () => {
            cancelled = true
            mountedRef.current = false
            if (resizeObserver) resizeObserver.disconnect()
            resizeObserver = null
            if (dprCleanup) dprCleanup()
            dprCleanup = null
            dprQuery = null
            if (engineRef.current) engineRef.current.stop()
            engineRef.current = null
            // Each accepted drop already has its fair bin. Finish its accounting
            // on navigation rather than abandoning the return with the canvas.
            for (const [ballId, pending] of settleByIdRef.current) {
                settleByIdRef.current.delete(ballId)
                pending.settle({ binIndex: pending.binIndex, multiplier: pending.multiplier, background: true })
            }
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

        const settle = ({ binIndex: bi, multiplier: rawMult, cancelled, background = false }) => {
            // Engine emits cancelled events when row count changes mid-flight.
            if (cancelled) {
                setActiveDrops(n => Math.max(0, n - 1))
                if (mode !== 'auto') resolve({ profit: 0 })
                return
            }
            const mult = Number((rawMult * ball.bonus).toFixed(4))

            const { returnAmount, profit } = plinkoReturn(betAmount, mult, cost)
            if (returnAmount > 0) addWinnings(returnAmount, 'Plinko return')
            session.record({
                id: crypto.randomUUID(),
                label: `${mult.toFixed(2)}× bin ${bi}`,
                profit, betAmount: cost, multiplier: mult,
                meta: { rows, risk, ballType, binIndex: bi },
            })
            if (background) {
                if (mode !== 'auto') resolve({ profit })
                return
            }
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
        }
        settleByIdRef.current.set(ballId, { settle, binIndex, multiplier: payouts[binIndex] })
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
            schedule(tick, 500)
        }
        tick()
    }, [performPlay])

    const lastResult = session.history[0]
    const lastMultiplier = lastResult?.multiplier ?? null
    const recentProfit = session.history.slice(0, 12).reduce((s, i) => s + (i.profit || 0), 0)
    const ball = BALL_TYPES[ballType]
    // QA007: the quoted RTP must be what the player is actually credited, which
    // depends on the accepted stake - `plinkoReturn` rounds to 0.01 GC, which turns
    // some bins into pushes and half-bins into full refunds at small stakes. The
    // binomial table is the board's payout schedule; `plinkoSettlementRtp` weights
    // the real settlement over it at this stake, ball and row count.
    const quote = useMemo(() => plinkoSettlementRtp({
        rows,
        risk,
        betAmount: selectedBet,
        ballId: ballType,
    }), [rows, risk, selectedBet, ballType])

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#ffcf5a"
            backdrop="/assets/games/backdrops/backdrop-felt-navy.png"
            variant="stake"
            primaryStage
            secondary={
                <>
                    <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />
                    <SimBetStrip rows={simFeed} title="Sim drops" />
                    <EducationPanel
                        definition={definition}
                        betAmount={selectedBet * ball.cost}
                        winProbability={quote?.settlementWinChance}
                        effectiveRtp={quote?.settlementRtp}
                        rtpLabel="RTP (this stake)"
                        rtpNote={quote
                            ? `${rows} rows · ${risk} risk · ${ball.name} ball at ${formatCredits(selectedBet * ball.cost)}. ${(quote.pushChance * 100).toFixed(1)}% of drops return exactly the stake. Measured after rounding, not a theoretical ratio.`
                            : undefined}
                        balance={balance}
                        recentProfit={recentProfit}
                    />
                </>
            }
            panel={
                <BetPanel
                    balance={balance}
                    initialBet={5}
                    runningRound={!engineReady}
                    actionLabel={engineReady ? 'Drop Ball' : 'Loading…'}
                    onPlay={performPlay}
                    lastBet={lastBet}
                    onStakeChange={setSelectedBet}
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
                    <div className="bp-bal-line"><span>Avg return</span><strong>{quote ? `${(quote.expectedReturnGc / quote.cost).toFixed(2)}×` : '—'}</strong></div>
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
            <CoreStageFrame maxWidth={920} loading={!preloader.ready || !engineReady} className="plinko-stage-frame gs-primary-stage">
                <div className="plinko-stage" ref={boardRef}>
                    <div className="plinko-board-viewport">
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
        </GameShell>
    )
}
