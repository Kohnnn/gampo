import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Gauge, Info, Play, RotateCcw, Sparkles, Square, Ticket, Zap } from 'lucide-react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits, round2 } from '../../../utils/simulationMath'
import {
    Asset,
    BigWinOverlay,
    GameShell,
    HistoryDrawer,
    RecentResultsStrip,
    StatsOverlay,
    useGameSession,
} from '../primitives'
import EducationPanel from '../../EducationPanel'
import {
    SLOT_TEMPLATES,
    getBuyTiers,
    getCellPositions,
    getColumnRows,
    getSlotTemplate,
    makeInitialGrid,
    randomVisualSymbol,
    resolveSlotSpin,
} from './slotFactory'
import './slots.css'

const FEATURE_LABELS = {
    'coin-meter': 'Coin meter',
    'free-spins': 'Free spins',
    wilds: 'Wild pulse',
    cascade: 'Cascade',
    'money-collect': 'Money collect',
    mystery: 'Mystery',
}

const AUTOPLAY_COUNTS = [10, 25, 50, 100]
// Cubic-out easing for per-column stop delays.
function cubicOut(t) {
    return 1 - Math.pow(1 - t, 3)
}

export default function SlotsGame({ initialTemplateId } = {}) {
    const definition = findGameDefinition('slots')
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const session = useGameSession('slots')

    const startId = useMemo(() => {
        if (initialTemplateId && SLOT_TEMPLATES.some(t => t.id === initialTemplateId)) return initialTemplateId
        return SLOT_TEMPLATES[0].id
    }, [initialTemplateId])
    const startTemplate = useMemo(() => getSlotTemplate(startId), [startId])

    const [templateId, setTemplateId] = useState(startId)
    const config = useMemo(() => getSlotTemplate(templateId), [templateId])
    const cellPositions = useMemo(() => getCellPositions(config), [config])
    const [betAmount, setBetAmount] = useState(5)
    const [grid, setGrid] = useState(() => makeInitialGrid(startTemplate))
    const [running, setRunning] = useState(false)
    const [spinPhase, setSpinPhase] = useState('idle')
    const [stoppedCols, setStoppedCols] = useState(startTemplate.layout.cols)
    const [winningCells, setWinningCells] = useState([])
    const [lastResult, setLastResult] = useState(null)
    const [lastStake, setLastStake] = useState(5)
    const [turbo, setTurbo] = useState(false)
    const [bonusBuyTierId, setBonusBuyTierId] = useState(null)
    const [showBuyModal, setShowBuyModal] = useState(false)
    const [freeSpins, setFreeSpins] = useState(0)
    const [coinMeter, setCoinMeter] = useState(0)
    const [showIntro, setShowIntro] = useState(Boolean(startTemplate.features?.introOverlay))
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [showAutoplayDrawer, setShowAutoplayDrawer] = useState(false)
    const [autoplayCount, setAutoplayCount] = useState(10)
    const [autoplayInfinite, setAutoplayInfinite] = useState(false)
    const [autoplayActive, setAutoplayActive] = useState(false)
    const [autoplayRemaining, setAutoplayRemaining] = useState(0)
    const [advancedStops, setAdvancedStops] = useState({
        stopOnFeature: false,
        stopOnBigWin: false,
        bigWinThreshold: 10,
        stopOnLoss: false,
        lossPercent: 25,
        stopOnGain: false,
        gainPercent: 50,
    })
    const [anticipating, setAnticipating] = useState(false)
    const [mysteryReveal, setMysteryReveal] = useState(null)

    const timers = useRef([])
    const ticker = useRef(null)
    const stoppedColsRef = useRef(startTemplate.layout.cols)
    const autoplayBaselineRef = useRef(null)
    const autoplayRemainingRef = useRef(0)
    const autoplayInfiniteRef = useRef(false)
    const autoplayPendingRef = useRef(false)
    const stopsRef = useRef(advancedStops)
    const buyTierIdRef = useRef(null)

    useEffect(() => { stopsRef.current = advancedStops }, [advancedStops])
    useEffect(() => { buyTierIdRef.current = bonusBuyTierId }, [bonusBuyTierId])

    const clearTimers = useCallback(() => {
        timers.current.forEach(id => window.clearTimeout(id))
        timers.current = []
        if (ticker.current) {
            window.clearInterval(ticker.current)
            ticker.current = null
        }
    }, [])

    const setStoppedColumnState = useCallback((value) => {
        stoppedColsRef.current = value
        setStoppedCols(value)
    }, [])

    useEffect(() => {
        clearTimers()
        setGrid(makeInitialGrid(config))
        setRunning(false)
        setSpinPhase('idle')
        setStoppedColumnState(config.layout.cols)
        setWinningCells([])
        setLastResult(null)
        setBonusBuyTierId(null)
        setShowBuyModal(false)
        setFreeSpins(0)
        setCoinMeter(0)
        setShowIntro(Boolean(config.features?.introOverlay))
        setAutoplayActive(false)
        setAutoplayRemaining(0)
        autoplayPendingRef.current = false
        setAnticipating(false)
        setMysteryReveal(null)
    }, [clearTimers, config, setStoppedColumnState])

    useEffect(() => () => clearTimers(), [clearTimers])

    const paylineMode = config.layout.evaluation === 'cluster'
        ? 'Cluster pays'
        : config.layout.evaluation === 'megaways'
            ? 'Megaways'
            : config.layout.evaluation === 'pay-anywhere'
                ? 'Pay anywhere'
                : config.layout.evaluation === 'ways'
                    ? 'Ways pays'
                    : 'Line pays'

    const buyTiers = useMemo(() => getBuyTiers(config), [config])
    const activeBuyTier = useMemo(() => buyTiers.find(t => t.id === bonusBuyTierId) || null, [buyTiers, bonusBuyTierId])
    const canUseFreeSpin = freeSpins > 0
    const effectiveStake = round2(betAmount * (activeBuyTier && config.controls?.buyBonus ? activeBuyTier.costMultiplier : 1))

    const setBet = useCallback((value) => {
        const next = Math.max(0.1, Math.min(10000, Number(value) || 0.1))
        setBetAmount(round2(next))
    }, [])

    const finishRound = useCallback(({ result, baseBet, stake, usedFreeSpin, usedBonusBuy, resolve }) => {
        clearTimers()
        const returnAmount = round2(baseBet * result.multiplier)
        const profit = round2(returnAmount - stake)

        setGrid(result.cells)
        setWinningCells(result.winningIndexes)
        setLastResult({ ...result, profit, returnAmount, stake, baseBet, usedFreeSpin, usedBonusBuy })
        setRunning(false)
        setSpinPhase(result.multiplier > 0 ? 'win' : 'settled')
        setAnticipating(false)
        setMysteryReveal(result.mysteryReveal || null)

        if (returnAmount > 0) addWinnings(returnAmount, `${config.title} return`)
        if (usedFreeSpin) setFreeSpins(value => Math.max(0, value - 1))

        const freeSpinEvent = result.featureEvents.find(item => item.type === 'free-spins')
        if (freeSpinEvent?.freeSpins) setFreeSpins(value => value + freeSpinEvent.freeSpins)

        const coinTarget = config.features?.coinMeter?.target || 0
        if (coinTarget && result.coinHits) {
            setCoinMeter(value => Math.min(coinTarget, value + result.coinHits))
        }

        const label = result.multiplier > 0 ? `${result.multiplier.toFixed(2)}x` : 'MISS'
        session.record({
            id: `${Date.now()}-${config.id}`,
            label,
            profit,
            betAmount: stake,
            multiplier: result.multiplier,
            meta: {
                slotTemplate: config.id,
                benchmark: config.benchmark,
                freeSpin: usedFreeSpin,
                bonusBuy: usedBonusBuy,
                features: result.featureEvents.map(item => item.type),
            },
        })

        if (profit > 0 && (result.multiplier >= 8 || profit >= baseBet * 8)) {
            playSound('bigwin')
            setBigWin({ trigger: Date.now(), profit, multiplier: result.multiplier })
        } else {
            playSound(profit > 0 ? 'win' : 'loss')
        }

        showToast(
            profit > 0 ? 'win' : profit < 0 ? 'loss' : 'info',
            `${config.title} ${label}`,
            `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`,
        )
        resolve({ profit, multiplier: result.multiplier, featureEvents: result.featureEvents })
    }, [addWinnings, clearTimers, config, playSound, session, showToast])

    const performSpin = useCallback(({ source = 'manual', bet = betAmount, free = canUseFreeSpin, tierId = null } = {}) => (
        new Promise(resolve => {
            if (running) {
                resolve({ profit: 0, skipped: true })
                return
            }
            const baseBet = round2(Number(bet) || betAmount)
            const usedFreeSpin = Boolean(freeSpins > 0 && free)
            const tier = !usedFreeSpin && tierId ? (buyTiers.find(t => t.id === tierId) || null) : null
            const usedBonusBuy = Boolean(tier && config.controls.buyBonus)
            const stake = usedFreeSpin ? 0 : round2(baseBet * (usedBonusBuy ? tier.costMultiplier : 1))

            if (!usedFreeSpin && !placeBet(stake, `${config.title} ${usedBonusBuy ? 'bonus buy' : 'spin'}`)) {
                showToast('error', 'Not enough credits', `Need ${formatCredits(stake)}`)
                resolve({ profit: 0, error: 'balance' })
                return
            }

            clearTimers()
            const result = resolveSlotSpin(config, { bonusBuy: usedBonusBuy, buyTier: tier, freeSpin: usedFreeSpin })
            const cols = config.layout.cols
            const totalSettleDelay = turbo ? 180 : 360
            const baseStop = turbo ? 80 : 200
            // Compute per-column delays with cubic-out easing.
            const colDelays = []
            for (let col = 1; col <= cols; col += 1) {
                const ratio = col / cols
                colDelays.push(Math.round(baseStop * cols * cubicOut(ratio)))
            }
            // Anticipation: when ≥ scatterMin scatters land in the first stopped columns, slow remaining columns.
            const scatterId = config.features?.scatter?.symbolId
            const scatterMin = config.features?.anticipation?.scatterMin ?? 2
            // Pre-count how many scatters appear in result before the last 2 columns.
            let scatterEarlyCount = 0
            if (scatterId) {
                let cellCursor = 0
                for (let col = 0; col < cols - 2; col += 1) {
                    const colRows = getColumnRows(config, col)
                    for (let row = 0; row < colRows; row += 1) {
                        if (result.cells[cellCursor + row]?.id === scatterId) scatterEarlyCount += 1
                    }
                    cellCursor += colRows
                }
            }
            const willAnticipate = scatterEarlyCount >= scatterMin
            const anticipationFromCol = cols - 2

            setLastStake(stake)
            setRunning(true)
            setSpinPhase(source === 'stage' ? 'stage-spin' : 'spinning')
            setWinningCells([])
            setLastResult(null)
            setStoppedColumnState(0)
            setMysteryReveal(null)
            setAnticipating(false)
            playSound('tick')

            ticker.current = window.setInterval(() => {
                setGrid(prev => prev.map((cell, index) => {
                    const { col } = cellPositions[index]
                    if (col < stoppedColsRef.current) return cell
                    return randomVisualSymbol(config)
                }))
            }, turbo ? 55 : 85)

            // Build per-col cumulative delays (with anticipation slowdown).
            let cumulative = 0
            for (let col = 1; col <= cols; col += 1) {
                const delta = colDelays[col - 1] - (col >= 2 ? colDelays[col - 2] : 0)
                const slow = willAnticipate && col >= anticipationFromCol + 1
                const adjusted = slow ? Math.round(delta * 1.65) : delta
                cumulative += adjusted
                const captureCol = col
                timers.current.push(window.setTimeout(() => {
                    playSound('flip')
                    if (willAnticipate && captureCol === anticipationFromCol + 1) {
                        setAnticipating(true)
                    }
                    setStoppedColumnState(captureCol)
                    setGrid(prev => prev.map((cell, index) => {
                        const { col: itemCol } = cellPositions[index]
                        return itemCol < captureCol ? result.cells[index] : cell
                    }))
                }, cumulative))
            }

            const totalDelay = cumulative + totalSettleDelay
            timers.current.push(window.setTimeout(() => {
                finishRound({ result, baseBet, stake, usedFreeSpin, usedBonusBuy, resolve })
            }, totalDelay))
        })
    ), [betAmount, buyTiers, canUseFreeSpin, cellPositions, clearTimers, config, finishRound, freeSpins, placeBet, playSound, running, setStoppedColumnState, showToast, turbo])

    const triggerStageSpin = useCallback(() => {
        const tierId = canUseFreeSpin ? null : buyTierIdRef.current
        performSpin({ source: 'stage', bet: betAmount, free: canUseFreeSpin, tierId })
    }, [betAmount, canUseFreeSpin, performSpin])

    // Autoplay loop
    const startAutoplay = useCallback(() => {
        if (autoplayActive || running) return
        autoplayBaselineRef.current = balance
        autoplayInfiniteRef.current = autoplayInfinite
        autoplayRemainingRef.current = autoplayInfinite ? Infinity : autoplayCount
        autoplayPendingRef.current = false
        setAutoplayActive(true)
        setAutoplayRemaining(autoplayInfinite ? Infinity : autoplayCount)
        setShowAutoplayDrawer(false)
    }, [autoplayActive, autoplayCount, autoplayInfinite, balance, running])

    const stopAutoplay = useCallback(() => {
        setAutoplayActive(false)
        setAutoplayRemaining(0)
        autoplayRemainingRef.current = 0
        autoplayInfiniteRef.current = false
        autoplayPendingRef.current = false
    }, [])

    useEffect(() => {
        if (!autoplayActive || running || autoplayPendingRef.current) return
        if (autoplayRemainingRef.current === Infinity) {
            // continue
        } else if (autoplayRemainingRef.current <= 0) {
            stopAutoplay()
            return
        }
        autoplayPendingRef.current = true
        const tierId = canUseFreeSpin ? null : buyTierIdRef.current
        const id = window.setTimeout(() => {
            performSpin({ source: 'auto', bet: betAmount, free: canUseFreeSpin, tierId }).then(outcome => {
                autoplayPendingRef.current = false
                if (!autoplayActive) return
                if (autoplayRemainingRef.current !== Infinity) {
                    autoplayRemainingRef.current = Math.max(0, autoplayRemainingRef.current - 1)
                    setAutoplayRemaining(autoplayRemainingRef.current)
                }
                const stops = stopsRef.current
                const baseline = autoplayBaselineRef.current ?? balance
                if (stops.stopOnFeature && outcome?.featureEvents?.length) stopAutoplay()
                else if (stops.stopOnBigWin && outcome?.multiplier >= stops.bigWinThreshold) stopAutoplay()
                else if (stops.stopOnLoss && balance <= baseline * (1 - stops.lossPercent / 100)) stopAutoplay()
                else if (stops.stopOnGain && balance >= baseline * (1 + stops.gainPercent / 100)) stopAutoplay()
                else if (autoplayRemainingRef.current <= 0 && autoplayRemainingRef.current !== Infinity) stopAutoplay()
            })
        }, 220)
        timers.current.push(id)
    }, [autoplayActive, betAmount, balance, canUseFreeSpin, performSpin, running, stopAutoplay])

    const recentProfit = session.history.slice(0, 12).reduce((sum, item) => sum + (item.profit || 0), 0)
    const meterTarget = config.features?.coinMeter?.target || 0
    const meterPercent = meterTarget ? Math.round((coinMeter / meterTarget) * 100) : 0

    const handleBuyButton = useCallback(() => {
        if (!buyTiers.length) return
        if (canUseFreeSpin) return
        setShowBuyModal(true)
    }, [buyTiers.length, canUseFreeSpin])

    const handlePickTier = useCallback((tier) => {
        setBonusBuyTierId(tier.id)
        setShowBuyModal(false)
    }, [])

    const handleClearTier = useCallback(() => {
        setBonusBuyTierId(null)
    }, [])

    return (
        <GameShell
            definition={definition}
            balance={balance}
            title="Gampo Slot Factory"
            accent={config.accent}
            backdrop={config.backdrop}
            panel={
                <div className="slot-factory-panel">
                    <div className="slot-panel-section">
                        <label className="slot-panel-label" htmlFor="slot-template">Template</label>
                        <select
                            id="slot-template"
                            className="slot-template-select"
                            value={templateId}
                            disabled={running || autoplayActive}
                            onChange={event => setTemplateId(event.target.value)}
                        >
                            {SLOT_TEMPLATES.map(template => (
                                <option key={template.id} value={template.id}>
                                    {template.title}
                                </option>
                            ))}
                        </select>
                        <p className="slot-panel-note">Benchmarked against {config.benchmark}; assets are Gampo-owned placeholders.</p>
                    </div>

                    <div className="slot-panel-section">
                        <label className="slot-panel-label" htmlFor="slot-bet">Bet Amount</label>
                        <div className="slot-bet-row">
                            <input
                                id="slot-bet"
                                type="number"
                                min="0.1"
                                step="0.5"
                                value={betAmount}
                                disabled={running || autoplayActive}
                                onChange={event => setBet(event.target.value)}
                            />
                            <button type="button" onClick={() => setBet(betAmount / 2)} disabled={running || autoplayActive}>1/2</button>
                            <button type="button" onClick={() => setBet(betAmount * 2)} disabled={running || autoplayActive}>2x</button>
                        </div>
                        <div className="slot-panel-kpis">
                            <span><small>Stake</small><strong>{formatCredits(effectiveStake)}</strong></span>
                            <span><small>RTP target</small><strong>{Math.round(config.rtpTarget * 100)}%</strong></span>
                        </div>
                    </div>

                    <div className="slot-panel-section slot-feature-switches">
                        <button
                            type="button"
                            className={turbo ? 'active' : ''}
                            onClick={() => setTurbo(value => !value)}
                            disabled={running}
                        >
                            <Zap size={15} /> Turbo
                        </button>
                        <button
                            type="button"
                            className={showAutoplayDrawer ? 'active' : ''}
                            onClick={() => setShowAutoplayDrawer(value => !value)}
                            disabled={running}
                        >
                            <RotateCcw size={15} /> Autoplay
                        </button>
                        {buyTiers.length > 0 && (
                            <button
                                type="button"
                                className={activeBuyTier ? 'active danger' : ''}
                                onClick={activeBuyTier ? handleClearTier : handleBuyButton}
                                disabled={running || canUseFreeSpin || autoplayActive}
                                title={activeBuyTier ? `Buy active: ${activeBuyTier.label}` : 'Pick a buy tier'}
                            >
                                <Ticket size={15} /> {activeBuyTier ? `Buy: ${activeBuyTier.label}` : 'Buy Bonus'}
                            </button>
                        )}
                    </div>

                    <button
                        className="slot-panel-spin"
                        type="button"
                        onClick={() => performSpin({ source: 'panel', bet: betAmount, free: canUseFreeSpin, tierId: canUseFreeSpin ? null : bonusBuyTierId })}
                        disabled={running || autoplayActive}
                    >
                        <Play size={18} />
                        {canUseFreeSpin ? 'Play Free Spin' : activeBuyTier ? `Buy ${activeBuyTier.label}` : 'Spin'}
                    </button>

                    <div className="slot-panel-section">
                        <div className="slot-panel-label">Feature contract</div>
                        <p className="slot-panel-note">{config.featureText}</p>
                        <div className="slot-tag-row">
                            <span>{paylineMode}</span>
                            <span>{config.volatility}</span>
                            {config.features?.scatter && <span>Scatter bonus</span>}
                            {config.features?.coinMeter && <span>Coin collect</span>}
                            {config.features?.expandingWilds && <span>Wild pulse</span>}
                            {config.features?.cascade && <span>Cascade ladder</span>}
                            {config.features?.mysterySymbol && <span>Mystery</span>}
                        </div>
                    </div>
                </div>
            }
            aside={
                <>
                    <StatsOverlay stats={session.stats} definition={definition} />
                    <HistoryDrawer history={session.history} onClear={session.clear} />
                </>
            }
        >
            <div className={`slot-factory-stage skin-${config.skin} phase-${spinPhase} ${anticipating ? 'is-anticipating' : ''}`} style={{ '--slot-accent': config.accent }}>
                <div className="slot-stage-top">
                    <div>
                        <span className="slot-benchmark">Benchmark: {config.benchmark}</span>
                        <h2>{config.title}</h2>
                    </div>
                    <div className="slot-stage-stats">
                        <span><Gauge size={14} /> {config.volatility}</span>
                        <span>{config.layout.cols}x{config.layout.rows}</span>
                        <span>{paylineMode}</span>
                    </div>
                </div>

                <div className="slot-stage-body">
                    <div className="slot-character-panel">
                        <span>{config.skin}</span>
                        <strong>{config.title.split(' ')[0]}</strong>
                    </div>

                    <div className="slot-reel-frame">
                        {config.layout.evaluation === 'megaways' ? (
                            <div className="slot-megaways-grid" style={{ gridTemplateColumns: `repeat(${config.layout.cols}, minmax(0, 1fr))` }}>
                                {Array.from({ length: config.layout.cols }).map((_, col) => {
                                    const colRows = getColumnRows(config, col)
                                    const cellsInCol = []
                                    let cursor = 0
                                    for (let c = 0; c < col; c += 1) cursor += getColumnRows(config, c)
                                    for (let r = 0; r < colRows; r += 1) cellsInCol.push({ index: cursor + r })
                                    return (
                                        <div key={`col-${col}`} className={`slot-megaways-col ${anticipating && col >= config.layout.cols - 2 ? 'anticipating' : ''}`}>
                                            {cellsInCol.map(({ index }) => {
                                                const item = grid[index]
                                                const spinning = running && col >= stoppedCols
                                                const winning = winningCells.includes(index)
                                                const moneyValue = lastResult?.moneyValues?.find(m => m.index === index)?.value
                                                return (
                                                    <div
                                                        key={`${index}-${item?.id || 'na'}`}
                                                        className={`slot-symbol-cell type-${item?.type || 'pay'} ${spinning ? 'spinning' : ''} ${winning ? 'winning' : ''}`}
                                                    >
                                                        <Asset src={item?.asset} alt={item?.label} fallback={<strong>{item?.label}</strong>} />
                                                        <em>{item?.label}</em>
                                                        {moneyValue ? <i className="money-chip">{formatCredits(moneyValue)}</i> : null}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )
                                })}
                            </div>
                        ) : (
                            <div className="slot-reel-grid" style={{ gridTemplateColumns: `repeat(${config.layout.cols}, minmax(0, 1fr))` }}>
                                {grid.map((item, index) => {
                                    const { col } = cellPositions[index]
                                    const spinning = running && col >= stoppedCols
                                    const winning = winningCells.includes(index)
                                    const inAnticipationCol = anticipating && col >= config.layout.cols - 2 && spinning
                                    const moneyValue = lastResult?.moneyValues?.find(m => m.index === index)?.value
                                    return (
                                        <div
                                            key={`${index}-${item.id}`}
                                            className={`slot-symbol-cell type-${item.type || 'pay'} ${spinning ? 'spinning' : ''} ${winning ? 'winning' : ''} ${inAnticipationCol ? 'anticipating' : ''}`}
                                            style={{ animationDelay: `${col * 45}ms` }}
                                        >
                                            <Asset src={item.asset} alt={item.label} fallback={<strong>{item.label}</strong>} />
                                            <em>{item.label}</em>
                                            {moneyValue ? <i className="money-chip">{formatCredits(moneyValue)}</i> : null}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>

                    <div className="slot-feature-panel">
                        {meterTarget > 0 ? (
                            <div className="slot-meter">
                                <span>Coin meter</span>
                                <strong>{coinMeter}/{meterTarget}</strong>
                                <div><i style={{ width: `${meterPercent}%` }} /></div>
                            </div>
                        ) : (
                            <div className="slot-meter quiet">
                                <span>Feature</span>
                                <strong>{config.features?.scatter ? 'Scatter' : 'Cluster'}</strong>
                                <div><i style={{ width: lastResult?.featureEvents?.length ? '100%' : '28%' }} /></div>
                            </div>
                        )}
                        <div className="slot-free-spins">
                            <Ticket size={16} />
                            <span>{freeSpins} free spins</span>
                        </div>
                        {autoplayActive && (
                            <div className="slot-auto-indicator">
                                <span>Autoplay</span>
                                <strong>{autoplayRemaining === Infinity ? '∞' : autoplayRemaining}</strong>
                                <button type="button" onClick={stopAutoplay}><Square size={12} /> Stop</button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="slot-stage-controls">
                    <button type="button" className="slot-mini-btn" onClick={() => setBet(betAmount / 2)} disabled={running || autoplayActive}>-</button>
                    <div className="slot-bet-readout">
                        <small>{canUseFreeSpin ? 'Free spin' : activeBuyTier ? 'Feature cost' : 'Bet'}</small>
                        <strong>{formatCredits(effectiveStake)}</strong>
                    </div>
                    <button type="button" className="slot-spin-btn" onClick={triggerStageSpin} disabled={running || autoplayActive} aria-label="Spin slot">
                        <RotateCcw size={34} />
                    </button>
                    <button type="button" className="slot-mini-btn" onClick={() => setBet(betAmount * 2)} disabled={running || autoplayActive}>+</button>
                    <div className="slot-win-readout">
                        <small>Win</small>
                        <strong>{formatCredits(lastResult?.returnAmount || 0)}</strong>
                    </div>
                </div>

                {showIntro && (
                    <div className="slot-intro-overlay">
                        <Sparkles size={28} />
                        <h3>{config.title}</h3>
                        <p>{config.featureText}</p>
                        <button type="button" onClick={() => setShowIntro(false)}>Spin it</button>
                    </div>
                )}

                {mysteryReveal && !running && (
                    <div className="slot-mystery-overlay" key={mysteryReveal.id}>
                        <span>Mystery reveals</span>
                        <strong>{mysteryReveal.label}</strong>
                    </div>
                )}

                {lastResult?.multiplier > 0 && !running && (
                    <div className={`slot-result-banner ${config.features?.darkWinOverlay ? 'dark' : ''}`}>
                        <span>Total win</span>
                        <strong>{formatCredits(lastResult.returnAmount)}</strong>
                        <em>{lastResult.multiplier.toFixed(2)}x</em>
                    </div>
                )}

                {lastResult?.featureEvents?.length > 0 && !running && (
                    <div className="slot-feature-events">
                        {lastResult.featureEvents.map((event, index) => (
                            <span key={`${event.type}-${index}`}>
                                {FEATURE_LABELS[event.type] || event.type}: {event.label}
                            </span>
                        ))}
                    </div>
                )}

                {showAutoplayDrawer && !running && (
                    <div className="slot-autoplay-drawer" role="dialog" aria-label="Autoplay configuration">
                        <header>
                            <strong>Autoplay</strong>
                            <button type="button" onClick={() => setShowAutoplayDrawer(false)}>Close</button>
                        </header>
                        <p className="slot-auto-banner">Practice credits only. Autoplay never spends real money.</p>
                        <div className="slot-auto-counts">
                            {AUTOPLAY_COUNTS.map(count => (
                                <button
                                    key={count}
                                    type="button"
                                    className={!autoplayInfinite && autoplayCount === count ? 'active' : ''}
                                    onClick={() => { setAutoplayCount(count); setAutoplayInfinite(false) }}
                                >
                                    {count}
                                </button>
                            ))}
                            <button
                                type="button"
                                className={autoplayInfinite ? 'active' : ''}
                                onClick={() => setAutoplayInfinite(value => !value)}
                            >∞</button>
                        </div>
                        <details className="slot-auto-advanced">
                            <summary>Advanced stop conditions</summary>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={advancedStops.stopOnFeature}
                                    onChange={e => setAdvancedStops(s => ({ ...s, stopOnFeature: e.target.checked }))}
                                />
                                Stop on feature trigger
                            </label>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={advancedStops.stopOnBigWin}
                                    onChange={e => setAdvancedStops(s => ({ ...s, stopOnBigWin: e.target.checked }))}
                                />
                                Stop on win &ge;
                                <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={advancedStops.bigWinThreshold}
                                    onChange={e => setAdvancedStops(s => ({ ...s, bigWinThreshold: Number(e.target.value) || 1 }))}
                                />x
                            </label>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={advancedStops.stopOnLoss}
                                    onChange={e => setAdvancedStops(s => ({ ...s, stopOnLoss: e.target.checked }))}
                                />
                                Stop if balance drops by
                                <input
                                    type="number"
                                    min="1"
                                    max="99"
                                    step="1"
                                    value={advancedStops.lossPercent}
                                    onChange={e => setAdvancedStops(s => ({ ...s, lossPercent: Number(e.target.value) || 1 }))}
                                />%
                            </label>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={advancedStops.stopOnGain}
                                    onChange={e => setAdvancedStops(s => ({ ...s, stopOnGain: e.target.checked }))}
                                />
                                Stop if balance grows by
                                <input
                                    type="number"
                                    min="1"
                                    max="500"
                                    step="1"
                                    value={advancedStops.gainPercent}
                                    onChange={e => setAdvancedStops(s => ({ ...s, gainPercent: Number(e.target.value) || 1 }))}
                                />%
                            </label>
                        </details>
                        <div className="slot-auto-actions">
                            <button type="button" className="slot-auto-start" onClick={startAutoplay} disabled={autoplayActive}>
                                <Play size={14} /> Start autoplay
                            </button>
                            <button type="button" className="slot-auto-stop" onClick={stopAutoplay} disabled={!autoplayActive}>
                                <Square size={14} /> Stop
                            </button>
                        </div>
                    </div>
                )}

                {showBuyModal && (
                    <div className="slot-buy-modal" role="dialog" aria-label="Buy bonus tier">
                        <header>
                            <strong>Buy Bonus</strong>
                            <button type="button" onClick={() => setShowBuyModal(false)}>Close</button>
                        </header>
                        <p>Pick a tier; cost multiplier applies to your current bet.</p>
                        <div className="slot-buy-tiers">
                            {buyTiers.map(tier => (
                                <button key={tier.id} type="button" onClick={() => handlePickTier(tier)}>
                                    <strong>{tier.label}</strong>
                                    <span>{tier.costMultiplier}x bet</span>
                                    {tier.guaranteedScatters && <em>{tier.guaranteedScatters} scatters guaranteed</em>}
                                    {tier.persistentMultiplier ? <em>+{tier.persistentMultiplier}x persistent</em> : null}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />

                <div className="slot-benchmark-notes">
                    <Info size={15} />
                    <span>
                        Local fake-credit slot. Reference pack drives layout and timing only; math, art, and resources are Gampo-owned.
                    </span>
                </div>
            </div>

            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={8} />
            <EducationPanel
                definition={definition}
                betAmount={lastStake || betAmount}
                winProbability={0.28}
                payoutMultiplier={lastResult?.multiplier || 2.4}
                balance={balance}
                recentProfit={recentProfit}
            />
        </GameShell>
    )
}
