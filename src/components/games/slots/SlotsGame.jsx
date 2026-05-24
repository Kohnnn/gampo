import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Gauge, Info, Play, RotateCcw, Sparkles, Ticket, Zap } from 'lucide-react'
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
    const [betAmount, setBetAmount] = useState(5)
    const [grid, setGrid] = useState(() => makeInitialGrid(startTemplate))
    const [running, setRunning] = useState(false)
    const [spinPhase, setSpinPhase] = useState('idle')
    const [stoppedCols, setStoppedCols] = useState(startTemplate.layout.cols)
    const [winningCells, setWinningCells] = useState([])
    const [lastResult, setLastResult] = useState(null)
    const [lastStake, setLastStake] = useState(5)
    const [turbo, setTurbo] = useState(false)
    const [bonusBuy, setBonusBuy] = useState(false)
    const [freeSpins, setFreeSpins] = useState(0)
    const [coinMeter, setCoinMeter] = useState(0)
    const [showIntro, setShowIntro] = useState(Boolean(startTemplate.features?.introOverlay))
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [autoNote, setAutoNote] = useState(false)
    const timers = useRef([])
    const ticker = useRef(null)
    const stoppedColsRef = useRef(startTemplate.layout.cols)

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
        setBonusBuy(false)
        setFreeSpins(0)
        setCoinMeter(0)
        setShowIntro(Boolean(config.features?.introOverlay))
    }, [clearTimers, config, setStoppedColumnState])

    useEffect(() => () => clearTimers(), [clearTimers])

    const paylineMode = config.layout.evaluation === 'cluster'
        ? 'Cluster pays'
        : config.layout.evaluation === 'ways'
            ? 'Ways pays'
            : 'Line pays'

    const bonusCostMultiplier = config.features?.buyBonus?.costMultiplier || 0
    const effectiveStake = round2(betAmount * (bonusBuy && config.controls.buyBonus ? bonusCostMultiplier : 1))
    const canUseFreeSpin = freeSpins > 0

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
        resolve({ profit, multiplier: result.multiplier })
    }, [addWinnings, clearTimers, config, playSound, session, showToast])

    const performSpin = useCallback(({ source = 'manual', bet = betAmount, buy = bonusBuy, free = canUseFreeSpin } = {}) => (
        new Promise(resolve => {
            if (running) {
                resolve({ profit: 0, skipped: true })
                return
            }
            const baseBet = round2(Number(bet) || betAmount)
            const usedFreeSpin = Boolean(freeSpins > 0 && free)
            const usedBonusBuy = Boolean(!usedFreeSpin && buy && config.controls.buyBonus)
            const stake = usedFreeSpin ? 0 : round2(baseBet * (usedBonusBuy ? bonusCostMultiplier : 1))

            if (!usedFreeSpin && !placeBet(stake, `${config.title} ${usedBonusBuy ? 'bonus buy' : 'spin'}`)) {
                showToast('error', 'Not enough credits', `Need ${formatCredits(stake)}`)
                resolve({ profit: 0, error: 'balance' })
                return
            }

            clearTimers()
            const result = resolveSlotSpin(config, { bonusBuy: usedBonusBuy, freeSpin: usedFreeSpin })
            const stopDelay = turbo ? 95 : 230
            const settleDelay = turbo ? 180 : 360
            const totalDelay = (stopDelay * config.layout.cols) + settleDelay

            setLastStake(stake)
            setRunning(true)
            setSpinPhase(source === 'stage' ? 'stage-spin' : 'spinning')
            setWinningCells([])
            setLastResult(null)
            setStoppedColumnState(0)
            playSound('tick')

            ticker.current = window.setInterval(() => {
                setGrid(prev => prev.map((cell, index) => {
                    const col = index % config.layout.cols
                    if (col < stoppedColsRef.current) return cell
                    return randomVisualSymbol(config)
                }))
            }, turbo ? 55 : 85)

            for (let col = 1; col <= config.layout.cols; col += 1) {
                timers.current.push(window.setTimeout(() => {
                    playSound('flip')
                    setStoppedColumnState(col)
                    setGrid(prev => prev.map((cell, index) => {
                        const itemCol = index % config.layout.cols
                        return itemCol < col ? result.cells[index] : cell
                    }))
                }, stopDelay * col))
            }

            timers.current.push(window.setTimeout(() => {
                finishRound({ result, baseBet, stake, usedFreeSpin, usedBonusBuy, resolve })
            }, totalDelay))
        })
    ), [betAmount, bonusBuy, bonusCostMultiplier, canUseFreeSpin, clearTimers, config, finishRound, freeSpins, placeBet, playSound, running, setStoppedColumnState, showToast, turbo])

    const triggerStageSpin = useCallback(() => {
        performSpin({ source: 'stage', bet: betAmount, buy: bonusBuy, free: canUseFreeSpin })
    }, [betAmount, bonusBuy, canUseFreeSpin, performSpin])

    const recentProfit = session.history.slice(0, 12).reduce((sum, item) => sum + (item.profit || 0), 0)
    const meterTarget = config.features?.coinMeter?.target || 0
    const meterPercent = meterTarget ? Math.round((coinMeter / meterTarget) * 100) : 0

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
                            disabled={running}
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
                                disabled={running}
                                onChange={event => setBet(event.target.value)}
                            />
                            <button type="button" onClick={() => setBet(betAmount / 2)} disabled={running}>1/2</button>
                            <button type="button" onClick={() => setBet(betAmount * 2)} disabled={running}>2x</button>
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
                            className={autoNote ? 'active' : ''}
                            onClick={() => setAutoNote(value => !value)}
                            disabled={running}
                            title="Autoplay contract placeholder; spin loop remains manual in this educational build."
                        >
                            <RotateCcw size={15} /> Auto plan
                        </button>
                        {config.controls.buyBonus && (
                            <button
                                type="button"
                                className={bonusBuy ? 'active danger' : ''}
                                onClick={() => setBonusBuy(value => !value)}
                                disabled={running || canUseFreeSpin}
                            >
                                <Ticket size={15} /> Buy {bonusCostMultiplier}x
                            </button>
                        )}
                    </div>

                    <button className="slot-panel-spin" type="button" onClick={() => performSpin({ source: 'panel', bet: betAmount, buy: bonusBuy, free: canUseFreeSpin })} disabled={running}>
                        <Play size={18} />
                        {canUseFreeSpin ? 'Play Free Spin' : bonusBuy ? 'Buy Feature' : 'Spin'}
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
            <div className={`slot-factory-stage skin-${config.skin} phase-${spinPhase}`} style={{ '--slot-accent': config.accent }}>
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
                        <div className="slot-reel-grid" style={{ gridTemplateColumns: `repeat(${config.layout.cols}, minmax(0, 1fr))` }}>
                            {grid.map((item, index) => {
                                const col = index % config.layout.cols
                                const spinning = running && col >= stoppedCols
                                const winning = winningCells.includes(index)
                                return (
                                    <div
                                        key={`${index}-${item.id}`}
                                        className={`slot-symbol-cell type-${item.type || 'pay'} ${spinning ? 'spinning' : ''} ${winning ? 'winning' : ''}`}
                                        style={{ animationDelay: `${col * 45}ms` }}
                                    >
                                        <Asset src={item.asset} alt={item.label} fallback={<strong>{item.label}</strong>} />
                                        <em>{item.label}</em>
                                    </div>
                                )
                            })}
                        </div>
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
                    </div>
                </div>

                <div className="slot-stage-controls">
                    <button type="button" className="slot-mini-btn" onClick={() => setBet(betAmount / 2)} disabled={running}>-</button>
                    <div className="slot-bet-readout">
                        <small>{canUseFreeSpin ? 'Free spin' : bonusBuy ? 'Feature cost' : 'Bet'}</small>
                        <strong>{formatCredits(effectiveStake)}</strong>
                    </div>
                    <button type="button" className="slot-spin-btn" onClick={triggerStageSpin} disabled={running} aria-label="Spin slot">
                        <RotateCcw size={34} />
                    </button>
                    <button type="button" className="slot-mini-btn" onClick={() => setBet(betAmount * 2)} disabled={running}>+</button>
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
