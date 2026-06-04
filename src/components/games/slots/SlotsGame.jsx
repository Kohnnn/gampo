import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Flame, Gauge, Info, Play, RotateCcw, Sparkles, Square, Ticket, TrendingUp, X, Zap } from 'lucide-react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { useBgm } from '../../../audio/useBgm'
import { useSfx } from '../../../audio/useSfx'
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
import WinPathOverlay from '../primitives/WinPathOverlay'
import { getFeatureContract } from '../../../data/slotFeatureContracts'
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
import {
    SLOT_RETRIGGER_FLY_MS,
    buildCascadeTraceCells,
    buildHoldTileStates,
    buildRetriggerFlyers,
    buildSlotFeatureDemoState,
} from './slotsMotion'
import './slots.css'

const FEATURE_LABELS = {
    'coin-meter': 'Coin meter',
    'free-spins': 'Free spins',
    wilds: 'Wild pulse',
    cascade: 'Cascade',
    'money-collect': 'Money collect',
    mystery: 'Mystery',
    'multiplier-zone': 'Multiplier zone',
    'multiplier-wheel': 'Wheel',
    'hold-and-respin': 'Hold & respin',
}

const AUTOPLAY_COUNTS = [10, 25, 50, 100]

// Cubic-out easing for per-column stop delays.
function cubicOut(t) {
    return 1 - Math.pow(1 - t, 3)
}

function evaluationLabel(evaluation) {
    if (evaluation === 'cluster') return 'Cluster pays'
    if (evaluation === 'megaways') return 'Megaways'
    if (evaluation === 'pay-anywhere') return 'Pay anywhere'
    if (evaluation === 'ways') return 'Ways pays'
    return 'Line pays'
}

export default function SlotsGame({ initialTemplateId } = {}) {
    const definition = findGameDefinition('slots')
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const slotSfx = useSfx('slots')
    const session = useGameSession('slots')

    const startId = useMemo(() => {
        if (initialTemplateId && SLOT_TEMPLATES.some(t => t.id === initialTemplateId)) return initialTemplateId
        return SLOT_TEMPLATES[0].id
    }, [initialTemplateId])
    const startTemplate = useMemo(() => getSlotTemplate(startId), [startId])

    const [templateId, setTemplateId] = useState(startId)
    const config = useMemo(() => getSlotTemplate(templateId), [templateId])
    useEffect(() => {
        setTemplateId(current => current === startId ? current : startId)
    }, [startId])

    // Wave 29 + Wave 32: per-skin BGM. The actual `useBgm()` call is deferred
    // until after `freeSpinSession` is declared so we can swap between
    // `idle` and `bonus` loops when the bonus is live.
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
    const [persistentMultiplier, setPersistentMultiplier] = useState(0)
    const [showInfo, setShowInfo] = useState(false)
    // Wave 9: sticky wild lock during free-spin sessions and feature cinematics
    const [stickyWilds, setStickyWilds] = useState([])
    const [wheelReveal, setWheelReveal] = useState(null)
    const [holdReveal, setHoldReveal] = useState(null)
    const [retriggerFlyers, setRetriggerFlyers] = useState([])
    const [slotAssetsReady, setSlotAssetsReady] = useState(false)
    // Wave 10: free-spin session tracking
    const [freeSpinSession, setFreeSpinSession] = useState(null) // { totalAwarded, played, totalWin, baseBet }
    const [bonusEndBanner, setBonusEndBanner] = useState(null) // { trigger, totalWin, played }

    // Wave 32 follow-up: switch BGM track based on bonus state.
    const bgmMode = (freeSpinSession || freeSpins > 0) ? 'bonus' : 'idle'
    useBgm(config.skin, bgmMode)

    const timers = useRef([])
    const ticker = useRef(null)
    const stoppedColsRef = useRef(startTemplate.layout.cols)
    const autoplayBaselineRef = useRef(null)
    const autoplayRemainingRef = useRef(0)
    const autoplayInfiniteRef = useRef(false)
    const autoplayPendingRef = useRef(false)
    const stopsRef = useRef(advancedStops)
    const buyTierIdRef = useRef(null)
    const reelFrameRef = useRef(null)
    const templateResetRef = useRef(startTemplate.id)

    useEffect(() => { stopsRef.current = advancedStops }, [advancedStops])
    useEffect(() => { buyTierIdRef.current = bonusBuyTierId }, [bonusBuyTierId])

    // Wave 10: when the free-spin counter drops to 0 mid-session, emit the end banner
    // and reset the session. This fires after finishRound has decremented freeSpins.
    useEffect(() => {
        if (freeSpins === 0 && freeSpinSession && freeSpinSession.played > 0) {
            setBonusEndBanner({
                trigger: Date.now(),
                totalWin: freeSpinSession.totalWin,
                played: freeSpinSession.played,
                totalAwarded: freeSpinSession.totalAwarded,
                retriggers: freeSpinSession.retriggers || 0,
                baseBet: freeSpinSession.baseBet,
            })
            setFreeSpinSession(null)
            setPersistentMultiplier(0)
            // Auto-dismiss the banner after 6 seconds.
            const id = window.setTimeout(() => {
                setBonusEndBanner(null)
            }, 6000)
            return () => window.clearTimeout(id)
        }
        return undefined
    }, [freeSpins, freeSpinSession])

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

    const resetSlotTemplate = useCallback((nextConfig, { clearStats = false } = {}) => {
        clearTimers()
        setGrid(makeInitialGrid(nextConfig))
        setRunning(false)
        setSpinPhase('idle')
        setStoppedColumnState(nextConfig.layout.cols)
        setWinningCells([])
        setLastResult(null)
        setBonusBuyTierId(null)
        setShowBuyModal(false)
        setFreeSpins(0)
        setCoinMeter(0)
        setShowIntro(Boolean(nextConfig.features?.introOverlay))
        setAutoplayActive(false)
        setAutoplayRemaining(0)
        autoplayRemainingRef.current = 0
        autoplayInfiniteRef.current = false
        autoplayPendingRef.current = false
        setAnticipating(false)
        setMysteryReveal(null)
        setPersistentMultiplier(0)
        setStickyWilds([])
        setWheelReveal(null)
        setHoldReveal(null)
        setRetriggerFlyers([])
        setFreeSpinSession(null)
        setBonusEndBanner(null)
        if (clearStats) session.clear()
    }, [clearTimers, session.clear, setStoppedColumnState])

    useEffect(() => {
        const clearStats = templateResetRef.current !== config.id
        resetSlotTemplate(config, { clearStats })
        templateResetRef.current = config.id
    }, [config, resetSlotTemplate])

    useEffect(() => () => clearTimers(), [clearTimers])

    useEffect(() => {
        if (typeof window === 'undefined') return undefined
        const forceBonusState = () => {
            const trigger = Date.now()
            const lastIndex = Math.max(0, cellPositions.length - 1)
            const scatterIndexes = Array.from(new Set([0, Math.min(7, lastIndex), Math.min(14, lastIndex)]))
            const demo = buildSlotFeatureDemoState({
                layout: config.layout,
                cellPositions,
                scatterIndexes,
                retriggerAmount: 5,
                wheelValue: 10,
                trigger,
            })
            const visibleScatters = demo.scatterCells.map(cell => cell.index)
            const scatterSymbol = config.symbols.find(symbol => symbol.id === config.features?.scatter?.symbolId) || config.symbols.find(symbol => symbol.type === 'scatter')
            const demoGrid = grid.map((cell, index) => (scatterSymbol && visibleScatters.includes(index)) ? scatterSymbol : cell)
            const holdBoard = {
                size: 12,
                startFilled: 3,
                finalFilled: 7,
                filledIndexes: demo.holdTiles.filter(tile => tile.filled).map(tile => tile.index),
                newFillIndexes: demo.holdTiles.filter(tile => tile.fresh).map(tile => tile.index),
            }
            const featureEvents = [
                { type: 'free-spins', count: 8 },
                { type: 'retrigger', amount: 5 },
                { type: 'multiplier-wheel', value: demo.wheel.value },
                { type: 'hold-and-respin', award: { name: 'Locked prize', multiplier: demo.wheel.value }, board: holdBoard },
                { type: 'cascade', steps: 2 },
                { type: 'money-collect', amount: round2(betAmount * 5) },
            ]
            setRunning(false)
            setSpinPhase('win')
            setAnticipating(false)
            setGrid(demoGrid)
            setWinningCells(visibleScatters)
            setWheelReveal({ trigger, value: demo.wheel.value })
            setHoldReveal({ trigger, award: { name: 'Locked prize', multiplier: demo.wheel.value }, board: holdBoard })
            setRetriggerFlyers(demo.retriggerFlyers)
            setFreeSpins(8)
            setFreeSpinSession({ totalAwarded: 8, played: 0, totalWin: 0, baseBet: betAmount, retriggers: 1 })
            setLastResult({
                cells: demoGrid,
                wins: [],
                winningIndexes: visibleScatters,
                wildIndexes: [],
                featureEvents,
                multiplier: demo.wheel.value,
                profit: round2(betAmount * (demo.wheel.value - 1)),
                returnAmount: round2(betAmount * demo.wheel.value),
                stake: betAmount,
                baseBet: betAmount,
                cascadeSteps: 2,
                moneyTotal: round2(betAmount * 5),
                moneyValues: visibleScatters.map((index, order) => ({ index, value: round2(betAmount * (order + 1)) })),
                triggeredFreeSpins: 8,
            })
            return { templateId: config.id, featureEvents }
        }
        const api = { forceBonusState }
        window.__gampoSlotQa = { ...(window.__gampoSlotQa || {}), [config.id]: api, forceBonusState }
        window.dispatchEvent(new CustomEvent('gampo:slot-qa-ready', { detail: { templateId: config.id } }))
        return () => {
            if (window.__gampoSlotQa?.[config.id] === api) delete window.__gampoSlotQa[config.id]
            if (window.__gampoSlotQa?.forceBonusState === forceBonusState) delete window.__gampoSlotQa.forceBonusState
        }
    }, [betAmount, cellPositions, config, grid])

    const paylineMode = evaluationLabel(config.layout.evaluation)
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
        setRetriggerFlyers([])

        // Wave 9: surface wheel + hold cinematic state
        const revealTrigger = Date.now()
        const wheelEvent = result.featureEvents.find(item => item.type === 'multiplier-wheel')
        if (wheelEvent) {
            setWheelReveal({ trigger: revealTrigger, value: wheelEvent.value })
            slotSfx.play('wheelLand', { volume: 0.85 })
        } else {
            setWheelReveal(null)
        }
        const holdEvent = result.featureEvents.find(item => item.type === 'hold-and-respin')
        if (holdEvent) {
            setHoldReveal({ trigger: revealTrigger, award: holdEvent.award, board: holdEvent.board })
            slotSfx.play('holdFill', { volume: 0.85 })
        } else {
            setHoldReveal(null)
        }
        if (result.mysteryReveal) slotSfx.play('mysteryReveal', { volume: 0.78 })
        if (result.cascadeSteps > 0) slotSfx.play('cascadeStep', { volume: 0.72 })
        if (result.featureEvents.some(item => item.type === 'money-collect')) slotSfx.play('moneyCollect', { volume: 0.85 })

        // Wave 9: sticky-wild lock — accumulate wild positions during free-spin sessions, drop on session end.
        if (config.features?.stackedWildReel?.sticky || config.features?.stickyWild) {
            if (usedFreeSpin || result.triggeredFreeSpins) {
                setStickyWilds(prev => Array.from(new Set([...prev, ...(result.wildIndexes || [])])))
                if (result.wildIndexes?.length) slotSfx.play('stickyLock', { volume: 0.76 })
            }
        }

        if (returnAmount > 0) addWinnings(returnAmount, `${config.title} return`)
        if (usedFreeSpin) {
            setFreeSpins(value => {
                const next = Math.max(0, value - 1)
                // End of free-spin session — clear sticky wilds.
                if (next === 0) setStickyWilds([])
                return next
            })
            // Wave 10: track free-spin session aggregates and emit end banner.
            setFreeSpinSession(prev => {
                if (!prev) return prev
                const updatedWin = round2(prev.totalWin + returnAmount)
                const updatedPlayed = prev.played + 1
                return {
                    ...prev,
                    played: updatedPlayed,
                    totalWin: updatedWin,
                }
            })
        }

        const freeSpinEvent = result.featureEvents.find(item => item.type === 'free-spins')
        if (freeSpinEvent?.freeSpins) {
            slotSfx.play('bonusEnter', { volume: 0.92 })
            if (freeSpinSession && freeSpinEvent.indexes?.length) {
                const flyers = buildRetriggerFlyers({
                    indexes: freeSpinEvent.indexes,
                    cellPositions,
                    layout: config.layout,
                    amount: freeSpinEvent.freeSpins,
                    trigger: revealTrigger,
                })
                setRetriggerFlyers(flyers)
                timers.current.push(window.setTimeout(() => {
                    setRetriggerFlyers([])
                }, SLOT_RETRIGGER_FLY_MS + 260))
            }
            setFreeSpins(value => value + freeSpinEvent.freeSpins)
            setFreeSpinSession(prev => {
                if (prev) {
                    // Retrigger: extend session count.
                    return {
                        ...prev,
                        totalAwarded: prev.totalAwarded + freeSpinEvent.freeSpins,
                        retriggers: (prev.retriggers || 0) + 1,
                    }
                }
                return {
                    totalAwarded: freeSpinEvent.freeSpins,
                    played: 0,
                    totalWin: 0,
                    baseBet,
                    retriggers: 0,
                    startedAt: Date.now(),
                }
            })
            if (config.features?.persistentMultiplier) {
                setPersistentMultiplier(value => Math.max(value, freeSpinEvent.persistentMultiplier || config.features.persistentMultiplier) + (value > 0 ? 1 : 0))
            }
        }

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
            slotSfx.play('bigwin', { volume: 0.9 })
            playSound('bigwin')
            setBigWin({ trigger: Date.now(), profit, multiplier: result.multiplier })
        } else {
            slotSfx.play(profit > 0 ? 'win' : 'lose', { volume: profit > 0 ? 0.78 : 0.66 })
            playSound(profit > 0 ? 'win' : 'loss')
        }

        showToast(
            profit > 0 ? 'win' : profit < 0 ? 'loss' : 'info',
            `${config.title} ${label}`,
            `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`,
        )
        resolve({ profit, multiplier: result.multiplier, featureEvents: result.featureEvents })
    }, [addWinnings, cellPositions, clearTimers, config, freeSpinSession, playSound, session, showToast, slotSfx])

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
            const result = resolveSlotSpin(config, { bonusBuy: usedBonusBuy, buyTier: tier, freeSpin: usedFreeSpin, stickyWilds })
            const cols = config.layout.cols
            const totalSettleDelay = turbo ? 180 : 360
            const baseStop = turbo ? 80 : 200
            const colDelays = []
            for (let col = 1; col <= cols; col += 1) {
                const ratio = col / cols
                colDelays.push(Math.round(baseStop * cols * cubicOut(ratio)))
            }
            const scatterId = config.features?.scatter?.symbolId
            const scatterMin = config.features?.anticipation?.scatterMin ?? 2
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
            setRetriggerFlyers([])
            setAnticipating(false)
            playSound('tick')
            slotSfx.play('spinStart', { volume: 0.85 })
            slotSfx.play('reelTick', { volume: 0.42 })

            ticker.current = window.setInterval(() => {
                setGrid(prev => prev.map((cell, index) => {
                    const { col } = cellPositions[index]
                    if (col < stoppedColsRef.current) return cell
                    return randomVisualSymbol(config)
                }))
            }, turbo ? 55 : 85)

            let cumulative = 0
            for (let col = 1; col <= cols; col += 1) {
                const delta = colDelays[col - 1] - (col >= 2 ? colDelays[col - 2] : 0)
                const slow = willAnticipate && col >= anticipationFromCol + 1
                const adjusted = slow ? Math.round(delta * 1.65) : delta
                cumulative += adjusted
                const captureCol = col
                timers.current.push(window.setTimeout(() => {
                    playSound('flip')
                    slotSfx.play('reelStop', { volume: 0.62 })
                    if (willAnticipate && captureCol === anticipationFromCol + 1) {
                        slotSfx.play('anticipation', { volume: 0.72 })
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
    ), [betAmount, buyTiers, canUseFreeSpin, cellPositions, clearTimers, config, finishRound, freeSpins, placeBet, playSound, running, setStoppedColumnState, showToast, slotSfx, stickyWilds, turbo])

    const triggerStageSpin = useCallback(() => {
        const tierId = canUseFreeSpin ? null : buyTierIdRef.current
        performSpin({ source: 'stage', bet: betAmount, free: canUseFreeSpin, tierId })
    }, [betAmount, canUseFreeSpin, performSpin])

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
        if (!buyTiers.length || canUseFreeSpin) return
        setShowBuyModal(true)
    }, [buyTiers.length, canUseFreeSpin])

    const handlePickTier = useCallback((tier) => {
        setBonusBuyTierId(tier.id)
        setShowBuyModal(false)
    }, [])

    const handleClearTier = useCallback(() => {
        setBonusBuyTierId(null)
    }, [])

    const cascadeSteps = lastResult?.cascadeSteps || 0
    const moneyTotal = lastResult?.moneyTotal || 0
    const holdTiles = useMemo(() => holdReveal ? buildHoldTileStates(holdReveal.board) : [], [holdReveal])
    const cascadeTraceCells = useMemo(() => {
        if (!lastResult?.cascadeSteps || running) return []
        return buildCascadeTraceCells({
            indexes: lastResult.winningIndexes || [],
            cellPositions,
            layout: config.layout,
        })
    }, [cellPositions, config.layout, lastResult, running])
    const visibleFeatureEvents = useMemo(() => {
        if (running || !lastResult?.featureEvents?.length) return []
        return lastResult.featureEvents.slice(0, 3)
    }, [lastResult, running])
    const cover = useMemo(() => `/images/covers/generated/${config.id}.png`, [config.id])
    const displayGrid = useMemo(() => {
        if (grid.length === cellPositions.length && grid.every(Boolean)) return grid
        return makeInitialGrid(config)
    }, [cellPositions.length, config, grid])
    const slotSpinLabel = canUseFreeSpin
        ? `Free Spin (${freeSpins})`
        : activeBuyTier
            ? `Buy ${activeBuyTier.costMultiplier}x`
            : 'Spin'

    useEffect(() => {
        if (typeof window === 'undefined' || typeof Image === 'undefined') {
            setSlotAssetsReady(true)
            return undefined
        }

        let cancelled = false
        setSlotAssetsReady(false)
        const urls = Array.from(new Set([
            cover,
            ...(config.symbols || []).map(item => item.asset),
        ].filter(Boolean)))

        const timeout = window.setTimeout(() => {
            if (!cancelled) setSlotAssetsReady(true)
        }, 2400)

        Promise.allSettled(urls.map(url => new Promise(resolve => {
            const image = new Image()
            image.onload = resolve
            image.onerror = resolve
            image.src = url
        }))).then(() => {
            if (!cancelled) setSlotAssetsReady(true)
        })

        return () => {
            cancelled = true
            window.clearTimeout(timeout)
        }
    }, [config.symbols, cover])

    return (
        <GameShell
            definition={definition}
            balance={balance}
            title="Gampo Slot Factory"
            accent={config.accent}
            backdrop={config.backdrop}
            panel={
                <div className="slot-panel-v2" style={{ '--slot-accent': config.accent }}>
                    <div className="slot-panel-card slot-panel-template">
                        <label className="slot-panel-label" htmlFor="slot-template">Template</label>
                        <div className="slot-template-row">
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
                            <ChevronDown size={14} />
                        </div>
                        <p className="slot-panel-note">Benchmarked against {config.benchmark}.</p>
                    </div>

                    <div className="slot-panel-card">
                        <label className="slot-panel-label" htmlFor="slot-bet">Bet</label>
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
                            <button type="button" onClick={() => setBet(betAmount / 2)} disabled={running || autoplayActive}>½</button>
                            <button type="button" onClick={() => setBet(betAmount * 2)} disabled={running || autoplayActive}>2×</button>
                        </div>
                        <div className="slot-panel-kpis">
                            <span><small>Stake</small><strong>{formatCredits(effectiveStake)}</strong></span>
                            <span><small>RTP</small><strong>{Math.round(config.rtpTarget * 100)}%</strong></span>
                        </div>
                    </div>

                    <div className="slot-panel-card slot-feature-switches">
                        <button
                            type="button"
                            className={turbo ? 'active' : ''}
                            onClick={() => setTurbo(value => !value)}
                            disabled={running}
                        >
                            <Zap size={14} /> Turbo
                        </button>
                        <button
                            type="button"
                            className={showAutoplayDrawer ? 'active' : ''}
                            onClick={() => setShowAutoplayDrawer(value => !value)}
                            disabled={running}
                        >
                            <RotateCcw size={14} /> Autoplay
                        </button>
                        {buyTiers.length > 0 && (
                            <button
                                type="button"
                                className={activeBuyTier ? 'active danger' : ''}
                                onClick={activeBuyTier ? handleClearTier : handleBuyButton}
                                disabled={running || canUseFreeSpin || autoplayActive}
                            >
                                <Ticket size={14} /> {activeBuyTier ? `Buy: ${activeBuyTier.label}` : 'Buy'}
                            </button>
                        )}
                    </div>

                    <button
                        className="slot-panel-spin"
                        type="button"
                        onClick={() => performSpin({ source: 'panel', bet: betAmount, free: canUseFreeSpin, tierId: canUseFreeSpin ? null : bonusBuyTierId })}
                        disabled={running || autoplayActive}
                        data-slot-action="spin"
                    >
                        <Play size={18} />
                        {slotSpinLabel}
                    </button>

                    <div className="slot-panel-card">
                        <button type="button" className="slot-panel-info-toggle" onClick={() => setShowInfo(v => !v)}>
                            <Info size={14} /> Feature contract <ChevronDown size={14} className={showInfo ? 'rot' : ''} />
                        </button>
                        {showInfo && (() => {
                            const contract = getFeatureContract(config.id)
                            return (
                                <div className="slot-feature-contract">
                                    <p className="slot-panel-note">{contract?.summary || config.featureText}</p>
                                    <div className="slot-tag-row">
                                        <span>{paylineMode}</span>
                                        <span>{config.volatility}</span>
                                        {config.features?.scatter && <span>Scatter</span>}
                                        {config.features?.coinMeter && <span>Coin collect</span>}
                                        {config.features?.cascade && <span>Cascade</span>}
                                        {config.features?.mysterySymbol && <span>Mystery</span>}
                                        {config.features?.persistentMultiplier && <span>Persistent ×</span>}
                                        {config.features?.holdAndRespin && <span>Hold &amp; respin</span>}
                                        {config.features?.multiplierWheel && <span>Wheel</span>}
                                        {config.features?.stackedWildReel && <span>Stacked wilds</span>}
                                    </div>
                                    {contract?.mechanics && (
                                        <div className="slot-contract-block">
                                            <h4>Mechanics</h4>
                                            <ul>
                                                {contract.mechanics.map((m, i) => (
                                                    <li key={i}>
                                                        <strong>{m.name}.</strong> <span>{m.detail}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {contract?.bonusEntry && (
                                        <div className="slot-contract-block">
                                            <h4>Bonus entry</h4>
                                            <p>{contract.bonusEntry}</p>
                                            {contract.bonusFlow?.length > 0 && (
                                                <ul className="slot-contract-flow">
                                                    {contract.bonusFlow.map((b, i) => <li key={i}>{b}</li>)}
                                                </ul>
                                            )}
                                        </div>
                                    )}
                                    {contract?.volatility && (
                                        <p className="slot-contract-note"><strong>Math:</strong> {contract.volatility}</p>
                                    )}
                                    {contract?.buyBonus && (
                                        <p className="slot-contract-note"><strong>Bonus buy:</strong> {contract.buyBonus}</p>
                                    )}
                                </div>
                            )
                        })()}
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
            <div
                className={`slot-stage-v2 slot-template-${config.id} skin-${config.skin} phase-${spinPhase} ${anticipating ? 'is-anticipating' : ''} ${freeSpinSession || freeSpins > 0 ? 'is-bonus-active' : ''} ${lastResult?.featureEvents?.length ? 'has-feature-event' : ''} ${slotAssetsReady ? '' : 'is-loading'}`}
                style={{
                    '--slot-accent': config.accent,
                    '--slot-cover': `url(${cover})`,
                    '--slot-rows': config.layout.rows,
                    '--slot-cols': config.layout.cols,
                }}
            >
                {!slotAssetsReady && (
                    <div className="slot-stage-loader" data-route-fallback="loading" role="status" aria-live="polite">
                        <div className="route-spinner" />
                        <span>Loading lab...</span>
                    </div>
                )}
                <header className="slot-stage-header">
                    <div className="slot-stage-title">
                        <span className="slot-benchmark-badge">Benchmark · {config.benchmark}</span>
                        <h2>{config.title}</h2>
                        <div className="slot-stage-meta">
                            <span><Gauge size={12} /> {config.volatility}</span>
                            <span>{config.layout.cols}×{config.layout.rows}</span>
                            <span>{paylineMode}</span>
                        </div>
                    </div>
                    <div className="slot-stage-pills">
                        {freeSpins > 0 && (
                            <div className={`slot-pill slot-pill-fs ${retriggerFlyers.length ? 'is-retriggering' : ''}`}>
                                <Ticket size={14} />
                                <strong>{freeSpins}</strong>
                                <small>free spins</small>
                            </div>
                        )}
                        {persistentMultiplier > 0 && (
                            <div className="slot-pill slot-pill-mult">
                                <TrendingUp size={14} />
                                <strong>{persistentMultiplier}×</strong>
                                <small>persistent</small>
                            </div>
                        )}
                        {meterTarget > 0 && (
                            <div className="slot-pill slot-pill-meter">
                                <Sparkles size={14} />
                                <strong>{coinMeter}/{meterTarget}</strong>
                                <small>coins</small>
                                <span className="slot-pill-fill" style={{ width: `${meterPercent}%` }} />
                            </div>
                        )}
                        {cascadeSteps > 0 && (
                            <div className="slot-pill slot-pill-cascade">
                                <Flame size={14} />
                                <strong>×{cascadeSteps + 1}</strong>
                                <small>cascade</small>
                            </div>
                        )}
                    </div>
                </header>

                <div className="slot-reel-wrap">
                    <div className="slot-reel-frame-v2" ref={reelFrameRef}>
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
                                                const item = displayGrid[index] || config.symbols?.[0]
                                                const spinning = running && col >= stoppedCols
                                                const winning = winningCells.includes(index)
                                                const moneyValue = lastResult?.moneyValues?.find(m => m.index === index)?.value
                                                return (
                                                    <div
                                                        key={`${index}-${item?.id || 'na'}`}
                                                        className={`slot-cell type-${item?.type || 'pay'} symbol-${item?.id || 'na'} ${spinning ? 'spinning' : ''} ${winning ? 'winning' : ''}`}
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
                            <div
                                className="slot-reel-grid"
                                style={{
                                    gridTemplateColumns: `repeat(${config.layout.cols}, minmax(0, 1fr))`,
                                    gridTemplateRows: `repeat(${config.layout.rows}, minmax(0, 1fr))`,
                                }}
                            >
                                {cellPositions.map(({ col }, index) => {
                                    const item = displayGrid[index] || config.symbols?.[0]
                                    if (!item) return null
                                    const spinning = running && col >= stoppedCols
                                    const winning = winningCells.includes(index)
                                    const inAnticipationCol = anticipating && col >= config.layout.cols - 2 && spinning
                                    const moneyValue = lastResult?.moneyValues?.find(m => m.index === index)?.value
                                    const isSticky = stickyWilds.includes(index)
                                    return (
                                        <div
                                            key={`${index}-${item.id}`}
                                            className={`slot-cell type-${item.type || 'pay'} symbol-${item.id} ${spinning ? 'spinning' : ''} ${winning ? 'winning' : ''} ${inAnticipationCol ? 'anticipating' : ''} ${isSticky ? 'sticky' : ''}`}
                                            style={{ animationDelay: `${col * 45}ms` }}
                                        >
                                            <Asset src={item.asset} alt={item.label} fallback={<strong>{item.label}</strong>} />
                                            <em>{item.label}</em>
                                            {moneyValue ? <i className="money-chip">{formatCredits(moneyValue)}</i> : null}
                                            {isSticky && <span className="slot-cell-sticky-badge" aria-hidden>★</span>}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                        {cascadeTraceCells.length > 0 && (
                            <div className="slot-cascade-trace-layer" aria-hidden>
                                {cascadeTraceCells.map(cell => (
                                    <span
                                        key={cell.id}
                                        className="slot-cascade-trace-dot"
                                        style={{
                                            '--trace-x': `${cell.x}%`,
                                            '--trace-y': `${cell.y}%`,
                                            '--trace-delay': `${cell.delayMs}ms`,
                                        }}
                                    />
                                ))}
                            </div>
                        )}
                        {retriggerFlyers.length > 0 && (
                            <div className="slot-retrigger-flyers" aria-hidden>
                                {retriggerFlyers.map(flyer => (
                                    <span
                                        key={flyer.id}
                                        className="slot-retrigger-flyer"
                                        style={{
                                            '--from-x': `${flyer.fromX}%`,
                                            '--from-y': `${flyer.fromY}%`,
                                            '--to-x': `${flyer.toX}%`,
                                            '--to-y': `${flyer.toY}%`,
                                            '--fly-delay': `${flyer.delayMs}ms`,
                                        }}
                                    >
                                        +{flyer.amount}
                                    </span>
                                ))}
                            </div>
                        )}
                        {!running && lastResult?.wins?.length > 0 && (
                            <WinPathOverlay
                                wins={lastResult.wins}
                                cellPositions={cellPositions}
                                layout={config.layout}
                                gridRef={reelFrameRef}
                                accent={config.accent}
                            />
                        )}
                        {anticipating && running && (
                            <div className="slot-anticipation-callout" aria-live="polite">
                                <span>Scatter watch</span>
                                <strong>reels slowing</strong>
                            </div>
                        )}
                        {visibleFeatureEvents.length > 0 && (
                            <div className="slot-feature-callouts" aria-live="polite">
                                {visibleFeatureEvents.map((event, index) => (
                                    <span key={`${event.type}-${index}`} className={`slot-feature-callout type-${event.type}`}>
                                        <em>{FEATURE_LABELS[event.type] || event.type}</em>
                                        <strong>{event.label || (event.freeSpins ? `+${event.freeSpins} spins` : 'Feature hit')}</strong>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="slot-controls-v2">
                    <div className="slot-control-readout">
                        <small>{canUseFreeSpin ? 'Free' : activeBuyTier ? 'Feature cost' : 'Bet'}</small>
                        <strong>{formatCredits(effectiveStake)}</strong>
                    </div>
                    <div className="slot-control-bet-stepper">
                        <button type="button" onClick={() => setBet(betAmount / 2)} disabled={running || autoplayActive} aria-label="Halve bet">½</button>
                        <button type="button" onClick={() => setBet(betAmount * 2)} disabled={running || autoplayActive} aria-label="Double bet">2×</button>
                    </div>
                    <button
                        type="button"
                        className="slot-control-spin"
                        onClick={triggerStageSpin}
                        disabled={running || autoplayActive}
                        aria-label="Spin"
                        data-slot-action="spin"
                    >
                        <span className="slot-control-spin-inner">
                            {running ? <RotateCcw size={28} /> : <Play size={28} />}
                        </span>
                    </button>
                    <div className="slot-control-quick">
                        <button
                            type="button"
                            onClick={() => setTurbo(value => !value)}
                            className={turbo ? 'active' : ''}
                            disabled={running}
                            aria-label="Toggle turbo"
                        ><Zap size={16} /></button>
                        <button
                            type="button"
                            onClick={() => setShowAutoplayDrawer(v => !v)}
                            className={autoplayActive ? 'active' : ''}
                            disabled={running}
                            aria-label="Autoplay"
                        ><RotateCcw size={16} /></button>
                    </div>
                    <div className="slot-control-readout right">
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
                    <div
                        className={`slot-mystery-overlay ${config.id === 'wanted-revelation' ? 'is-wanted-poster' : ''}`}
                        key={mysteryReveal.id}
                    >
                        {config.id === 'wanted-revelation' ? (
                            <>
                                <span className="slot-wanted-eyebrow">WANTED</span>
                                <strong className="slot-wanted-name">{mysteryReveal.label}</strong>
                                <em className="slot-wanted-reward">REVEALED</em>
                            </>
                        ) : (
                            <>
                                <span>Mystery reveals</span>
                                <strong>{mysteryReveal.label}</strong>
                            </>
                        )}
                    </div>
                )}

                {wheelReveal && !running && (
                    <div className="slot-wheel-overlay" key={`wheel-${wheelReveal.trigger}`}>
                        <span>Multiplier wheel</span>
                        <div className="slot-wheel-disc" aria-hidden>
                            <i className="slot-wheel-pointer" />
                            <strong>{wheelReveal.value}×</strong>
                        </div>
                        <em>added to spin</em>
                    </div>
                )}

                {bonusEndBanner && (
                    <div className="slot-bonus-end-banner" key={bonusEndBanner.trigger}>
                        <span>Bonus complete</span>
                        <strong>{formatCredits(bonusEndBanner.totalWin)}</strong>
                        <em>{bonusEndBanner.played} of {bonusEndBanner.totalAwarded} spins{bonusEndBanner.retriggers > 0 ? ` · ${bonusEndBanner.retriggers}× retrigger` : ''}</em>
                        {bonusEndBanner.baseBet > 0 && (
                            <i>{(bonusEndBanner.totalWin / bonusEndBanner.baseBet).toFixed(2)}× of bet</i>
                        )}
                    </div>
                )}

                {freeSpinSession && (
                    <div className="slot-bonus-banner-strip" aria-label="Free spin session">
                        <span>FREE SPINS</span>
                        <strong>{freeSpinSession.totalAwarded - freeSpins}/{freeSpinSession.totalAwarded}</strong>
                        <em>WON {formatCredits(freeSpinSession.totalWin)}</em>
                        {freeSpinSession.retriggers > 0 && <i>+{freeSpinSession.retriggers} retrigger</i>}
                    </div>
                )}

                {holdReveal && !running && (
                    <div className="slot-hold-overlay" key={`hold-${holdReveal.trigger}`}>
                        <header>
                            <span>Hold &amp; Respin</span>
                            <strong>{holdReveal.award.name}</strong>
                            <em>{holdReveal.award.multiplier}×</em>
                        </header>
                        <div className="slot-hold-board">
                            {holdTiles.map(tile => (
                                <div
                                    key={tile.index}
                                    className={`slot-hold-slot ${tile.filled ? 'filled' : ''} ${tile.fresh ? 'new-fill' : ''}`}
                                    style={{ animationDelay: `${tile.delayMs}ms` }}
                                />
                            ))}
                        </div>
                        <div className="slot-hold-meta">
                            <span>{holdReveal.board.startFilled} → {holdReveal.board.finalFilled} / {holdReveal.board.size}</span>
                            <span>{holdReveal.board.respins} respins</span>
                        </div>
                    </div>
                )}

                {/* Wave 20: bayou money-collect cinematic — when a money symbol
                    pays out and the result includes moneyTotal, show an angler
                    ribbon collecting the total. */}
                {moneyTotal > 0 && !running && (config.id === 'bass-bayou' || config.skin === 'bayou') && (
                    <div className="slot-collect-overlay" key={`collect-${lastResult?.multiplier ?? 0}`}>
                        <span>Angler collects</span>
                        <strong>+{formatCredits(moneyTotal)}</strong>
                        <em>{lastResult?.moneyValues?.length || 0} prize symbols</em>
                    </div>
                )}

                {/* Wave 20: gummy/bassline cluster cascade ladder — show the
                    cascade ladder on the side when at least 2 cascades happen. */}
                {cascadeSteps >= 2 && !running && (
                    <div className="slot-cascade-overlay" key={`cascade-${cascadeSteps}`}>
                        <span>Cascade chain</span>
                        <strong>×{cascadeSteps + 1}</strong>
                        <em>tumbles paid</em>
                    </div>
                )}

                {lastResult?.multiplier > 0 && !running && (
                    <div className={`slot-result-banner ${config.features?.darkWinOverlay ? 'dark' : ''}`}>
                        <span>Total win</span>
                        <strong>{formatCredits(lastResult.returnAmount)}</strong>
                        <em>{lastResult.multiplier.toFixed(2)}×</em>
                        {moneyTotal > 0 && <i className="result-money">+{formatCredits(moneyTotal)} collected</i>}
                    </div>
                )}

                {lastResult?.featureEvents?.length > 0 && !running && (
                    <div className="slot-feature-events">
                        {lastResult.featureEvents.map((event, index) => (
                            <span key={`${event.type}-${index}`}>
                                <strong>{FEATURE_LABELS[event.type] || event.type}</strong>
                                {event.label}
                            </span>
                        ))}
                    </div>
                )}

                {showAutoplayDrawer && !running && (
                    <div className="slot-autoplay-drawer" role="dialog" aria-label="Autoplay configuration">
                        <header>
                            <strong>Autoplay</strong>
                            <button type="button" onClick={() => setShowAutoplayDrawer(false)} aria-label="Close"><X size={16} /></button>
                        </header>
                        <p className="slot-auto-banner">Practice credits only. No real money.</p>
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
                                />×
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
                                <Play size={14} /> Start
                            </button>
                            <button type="button" className="slot-auto-stop" onClick={stopAutoplay} disabled={!autoplayActive}>
                                <Square size={14} /> Stop
                            </button>
                        </div>
                    </div>
                )}

                {autoplayActive && (
                    <div className="slot-autoplay-pill">
                        <RotateCcw size={14} />
                        <strong>{autoplayRemaining === Infinity ? '∞' : autoplayRemaining}</strong>
                        <span>autoplay</span>
                        <button type="button" onClick={stopAutoplay} aria-label="Stop autoplay"><Square size={12} /></button>
                    </div>
                )}

                {showBuyModal && (
                    <div className="slot-buy-modal" role="dialog" aria-label="Buy bonus tier">
                        <header>
                            <strong>Buy Bonus</strong>
                            <button type="button" onClick={() => setShowBuyModal(false)} aria-label="Close"><X size={16} /></button>
                        </header>
                        <p>Pick a tier; cost multiplier applies to current bet.</p>
                        <div className="slot-buy-tiers">
                            {buyTiers.map(tier => (
                                <button key={tier.id} type="button" onClick={() => handlePickTier(tier)}>
                                    <div className="slot-buy-tier-head">
                                        <strong>{tier.label}</strong>
                                        <span>{tier.costMultiplier}× bet</span>
                                    </div>
                                    <div className="slot-buy-tier-meta">
                                        {tier.guaranteedScatters && <em>{tier.guaranteedScatters} scatters</em>}
                                        {tier.persistentMultiplier ? <em>+{tier.persistentMultiplier}× persistent</em> : null}
                                        <em>cost {formatCredits(round2(betAmount * tier.costMultiplier))}</em>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="slot-stage-foot">
                    <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />
                </div>
            </div>

            <div
                className="slot-mobile-dock"
                style={{ '--slot-accent': config.accent }}
                data-slot-mobile-dock
                data-mobile-critical-surface
            >
                <div className="slot-mobile-readout">
                    <span>Bet</span>
                    <strong>{formatCredits(effectiveStake)}</strong>
                </div>
                <div className="slot-mobile-readout">
                    <span>Win</span>
                    <strong>{formatCredits(lastResult?.returnAmount || 0)}</strong>
                </div>
                <button
                    type="button"
                    className={turbo ? 'slot-mobile-icon active' : 'slot-mobile-icon'}
                    onClick={() => setTurbo(value => !value)}
                    disabled={running}
                    aria-label="Toggle turbo"
                >
                    <Zap size={16} />
                    <span>Quick</span>
                </button>
                <button
                    type="button"
                    className={autoplayActive || showAutoplayDrawer ? 'slot-mobile-icon active' : 'slot-mobile-icon'}
                    onClick={() => setShowAutoplayDrawer(v => !v)}
                    disabled={running}
                    aria-label="Autoplay"
                >
                    <RotateCcw size={16} />
                    <span>Auto</span>
                </button>
                <button
                    type="button"
                    className="slot-mobile-spin"
                    onClick={triggerStageSpin}
                    disabled={running || autoplayActive}
                    data-slot-action="spin"
                    data-mobile-hit-target="primary"
                >
                    <Play size={18} />
                    {running ? 'Spinning' : slotSpinLabel}
                </button>
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
