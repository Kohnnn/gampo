import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Flame, Gauge, Info, Play, RotateCcw, Sparkles, Square, Ticket, TrendingUp, X } from 'lucide-react'
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
import { recordFeatureEvent } from '../../../hooks/useProgress'
import { useSettings } from '../../../hooks/useSettings'
import { isFunMode, FUN_PAYOUT_BOOST } from '../../../utils/funMode'
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
import { getBonusCinematic, BONUS_CINEMATIC_MS } from './slotBonusCinematics'
import { winTier, SLOT_BIG_WIN_THRESHOLD, deriveEducationEv, rollupDurationMs, rollupFrame } from './slotWinPresentation'
import { buildPaytable } from './slotPaytable'
import { describePaylines } from './slotPaylines'
import { buildSparkline } from './slotSparkline'
import './slots.css'

const FEATURE_LABELS = {
    'coin-meter': 'Coin meter',
    'coin-meter-fill': 'Vault burst',
    'free-spins': 'Free spins',
    wilds: 'Wild pulse',
    'expanding-wilds': 'Expanding wild',
    'stacked-wild': 'Wild reel',
    'scarab-respin': 'Scarab respin',
    jackpot: 'Jackpot',
    'persistent-multiplier': 'Persistent ×',
    cascade: 'Cascade',
    'money-collect': 'Money collect',
    mystery: 'Mystery',
    'multiplier-zone': 'Multiplier zone',
    'multiplier-wheel': 'Wheel',
    'hold-and-respin': 'Hold & respin',
}

const AUTOPLAY_COUNTS = [10, 25, 50, 100]

// Spin resolve speed cycle: Normal (full animation) → Turbo (sped-up reels) →
// Instant (no reel animation, immediate result).
const SPIN_MODE_ORDER = ['normal', 'turbo', 'instant']
const SPIN_MODE_LABELS = { normal: 'Normal', turbo: 'Turbo', instant: 'Instant' }

// Cubic-out easing for per-column stop delays.
function cubicOut(t) {
    return 1 - Math.pow(1 - t, 3)
}

// Segmented spin-speed control: Normal / Turbo / Instant shown as three labeled
// options with an active state, so the current mode AND the alternatives are
// visible at a glance (replaces the old single cycling button). Renders on both
// desktop (panel + in-stage quick controls) and the mobile options sheet. Keeps
// `data-slot-spin-mode` on the wrapper for any external probes.
function SpinModeControl({ value, onChange, disabled = false, className = '' }) {
    return (
        <div
            className={`slot-spin-mode-seg ${className}`.trim()}
            role="group"
            aria-label="Spin speed"
            data-slot-spin-mode={value}
        >
            {SPIN_MODE_ORDER.map(mode => (
                <button
                    key={mode}
                    type="button"
                    className={value === mode ? 'active' : ''}
                    onClick={() => onChange(mode)}
                    disabled={disabled}
                    aria-pressed={value === mode}
                    data-slot-spin-mode-option={mode}
                >
                    {SPIN_MODE_LABELS[mode]}
                </button>
            ))}
        </div>
    )
}

// Shared feature-contract body: full paytable ladder + mechanics + bonus flow.
// Rendered both inside the desktop panel (gated behind the showInfo toggle) and
// inside the mobile paytable modal, so both surfaces derive identical data from
// the same buildPaytable / getFeatureContract calls — no drift between views.
function FeatureContractBody({ config, paylineMode }) {
    const contract = getFeatureContract(config.id)
    const fullPaytable = buildPaytable(config)
    // Prefer the engine's real max-win cap; fall back to an indicative estimate
    // only when the template has no cap.
    const topPay = fullPaytable.rows[0]?.pays?.slice(-1)[0]?.multiplier || 0
    const featureFactor = config.features?.multiplierWheel ? 60
        : config.features?.persistentMultiplier ? 50
        : config.features?.cascade ? 40
        : config.features?.holdAndRespin ? 30
        : 20
    const estMaxWin = topPay > 0 ? Math.round(topPay * featureFactor) : 0
    const maxWin = fullPaytable.maxWin || estMaxWin
    const maxWinExact = Boolean(fullPaytable.maxWin)
    return (
        <div className="slot-feature-contract">
            <p className="slot-panel-note">{contract?.summary || config.featureText}</p>
            <div className="slot-contract-stats">
                <span><small>RTP</small><strong>{Math.round(config.rtpTarget * 100)}%</strong></span>
                <span><small>Volatility</small><strong>{config.volatility}</strong></span>
                <span><small>Grid</small><strong>{config.layout.cols}×{config.layout.rows}</strong></span>
                <span><small>Max win</small><strong>{maxWin ? `${maxWinExact ? '' : '~'}${maxWin.toLocaleString()}×` : '—'}</strong></span>
            </div>
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
            {fullPaytable.rows.length > 0 && (
                <div className="slot-contract-block">
                    <h4>Paytable</h4>
                    <div className="slot-paytable-ladder">
                        <div className="slot-paytable-head">
                            <span>Symbol</span>
                            {fullPaytable.rungs.map(c => <em key={c}>{c}{fullPaytable.mode === 'cluster' || fullPaytable.mode === 'pay-anywhere' ? '+' : '×'}</em>)}
                        </div>
                        {fullPaytable.rows.map(row => (
                            <div className="slot-paytable-row" key={row.id}>
                                <span className="slot-paytable-sym">
                                    <Asset src={row.asset} alt={row.label} fallback={<strong>{row.label}</strong>} />
                                    <small>{row.label}</small>
                                </span>
                                {row.pays.map(p => <em key={p.count}>{p.multiplier}×</em>)}
                            </div>
                        ))}
                    </div>
                    <div className="slot-paytable-special">
                        {fullPaytable.wild && <span><strong>Wild</strong> substitutes for pay symbols</span>}
                        {fullPaytable.scatter && (
                            <span><strong>Scatter</strong> {fullPaytable.scatter.trigger}+ triggers{fullPaytable.scatter.awardFreeSpins ? ` ${fullPaytable.scatter.awardFreeSpins} free spins` : ' the feature'}</span>
                        )}
                    </div>
                </div>
            )}
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
    const { reduceMotion } = useSettings()
    // "Fast bonus": reduced-motion players skip the full bonus-entry cinematic.
    const bonusCineMs = reduceMotion ? 450 : BONUS_CINEMATIC_MS
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
    // Spin resolve mode: 'normal' (full animation), 'turbo' (sped-up reels),
    // 'instant' (no reel animation — result lands immediately). Distinct from
    // slam-stop, which interrupts an in-flight animated spin. `turbo`/`instant`
    // are derived so the existing speed branches read unchanged.
    const [spinMode, setSpinMode] = useState('normal')
    const turbo = spinMode === 'turbo' || spinMode === 'instant'
    const instant = spinMode === 'instant'
    // Graduated win-tier rollup: count-up of the banner total for nice/good/
    // great (and bigger) tiers. `{ amount }` is the live displayed value.
    const [winRollup, setWinRollup] = useState({ trigger: 0, amount: 0, target: 0, tierId: 'none' })
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
        // Absolute currency caps (SessionGuard-style): stop once cumulative net
        // loss/gain since autoplay start crosses the cap, or a single spin's
        // profit exceeds the single-win cap. 0/blank = disabled.
        stopOnLossAbs: false,
        lossAbs: 100,
        stopOnGainAbs: false,
        gainAbs: 200,
        stopOnSingleWin: false,
        singleWinAbs: 250,
    })
    const [anticipating, setAnticipating] = useState(false)
    const [anticipationScatters, setAnticipationScatters] = useState({ have: 0, need: 0 })
    const [mysteryReveal, setMysteryReveal] = useState(null)
    const [persistentMultiplier, setPersistentMultiplier] = useState(0)
    const [persistRamp, setPersistRamp] = useState(false)
    const [eventFlash, setEventFlash] = useState(null)
    const [bonusCine, setBonusCine] = useState(null)
    const [nearMiss, setNearMiss] = useState(null)
    const [showInfo, setShowInfo] = useState(false)
    // a11y: polite live-region message announcing the latest spin outcome
    // (win tier + multiplier, or "No win").
    const [liveAnnounce, setLiveAnnounce] = useState('')
    const [showMobileBet, setShowMobileBet] = useState(false)
    // Mobile-only: full paytable / feature-contract bottom-sheet modal. On
    // desktop the same content lives inline in the panel (showInfo); on phones
    // that panel reflows off-screen behind the dock, so we surface it as a
    // proper dismissible overlay instead.
    const [showMobileInfo, setShowMobileInfo] = useState(false)
    const [showPaylines, setShowPaylines] = useState(false)
    const [dockPortal, setDockPortal] = useState(null)
    useEffect(() => { setDockPortal(document.body) }, [])
    // Focus management for the mobile paytable modal: remember the element that
    // opened it, move focus into the sheet on open, restore it on close, and
    // trap Tab within the sheet while it is open.
    const mobileInfoSheetRef = useRef(null)
    const mobileInfoReturnRef = useRef(null)
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
    // Slam-stop: holds the in-flight round so a second tap can resolve it now.
    const pendingFinishRef = useRef(null)
    const autoplayBaselineRef = useRef(null)
    const autoplayRemainingRef = useRef(0)
    const autoplayInfiniteRef = useRef(false)
    const autoplayPendingRef = useRef(false)
    const stopsRef = useRef(advancedStops)
    const buyTierIdRef = useRef(null)
    const persistentMultiplierRef = useRef(0)
    const reelFrameRef = useRef(null)
    const templateResetRef = useRef(startTemplate.id)
    // rAF handle + start timestamp for the win-tier rollup count-up.
    const rollupRafRef = useRef(null)

    useEffect(() => { stopsRef.current = advancedStops }, [advancedStops])
    useEffect(() => { buyTierIdRef.current = bonusBuyTierId }, [bonusBuyTierId])
    useEffect(() => { persistentMultiplierRef.current = persistentMultiplier }, [persistentMultiplier])

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

    // Cancel any in-flight win-rollup animation frame on unmount.
    useEffect(() => () => {
        if (rollupRafRef.current) {
            cancelAnimationFrame(rollupRafRef.current)
            rollupRafRef.current = null
        }
    }, [])

    // Mobile paytable modal a11y: focus-trap + Escape-to-close + focus restore.
    useEffect(() => {
        if (!showMobileInfo) return undefined
        if (typeof document !== 'undefined') {
            mobileInfoReturnRef.current = document.activeElement
        }
        // Move focus into the sheet once it mounts.
        const focusTimer = window.setTimeout(() => {
            const sheet = mobileInfoSheetRef.current
            if (!sheet) return
            const first = sheet.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
            ;(first || sheet).focus()
        }, 0)
        const onKey = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault()
                setShowMobileInfo(false)
                return
            }
            if (e.key !== 'Tab') return
            const sheet = mobileInfoSheetRef.current
            if (!sheet) return
            const focusables = Array.from(
                sheet.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
            ).filter(el => !el.disabled && el.offsetParent !== null)
            if (focusables.length === 0) return
            const first = focusables[0]
            const last = focusables[focusables.length - 1]
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault()
                last.focus()
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault()
                first.focus()
            }
        }
        document.addEventListener('keydown', onKey)
        return () => {
            window.clearTimeout(focusTimer)
            document.removeEventListener('keydown', onKey)
            // Restore focus to the trigger when the sheet closes.
            const ret = mobileInfoReturnRef.current
            if (ret && typeof ret.focus === 'function') ret.focus()
        }
    }, [showMobileInfo])

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
    const paylinesInfo = useMemo(() => describePaylines(config), [config])
    const sparkline = useMemo(() => buildSparkline(session.history, { width: 120, height: 30 }), [session.history])
    const buyTiers = useMemo(() => getBuyTiers(config), [config])
    const activeBuyTier = useMemo(() => buyTiers.find(t => t.id === bonusBuyTierId) || null, [buyTiers, bonusBuyTierId])
    const canUseFreeSpin = freeSpins > 0
    const effectiveStake = round2(betAmount * (activeBuyTier && config.controls?.buyBonus ? activeBuyTier.costMultiplier : 1))

    // Probability-Lab inputs derived from the ACTIVE template's calibrated
    // economics (rtpTarget + volatility-implied hit frequency), blended with the
    // most recent real win multiplier. Replaces the old fixed 0.28 / 2.4.
    const educationEv = useMemo(() => deriveEducationEv({
        rtpTarget: config.rtpTarget ?? definition?.rtp,
        volatility: config.volatility,
        lastMultiplier: lastResult?.multiplier,
    }), [config.rtpTarget, config.volatility, definition?.rtp, lastResult?.multiplier])

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

        // Graduated win-tier rollup + a11y announcement. Drive a count-up of the
        // banner total for any tiered win (nice/good/great and the big tiers),
        // so mid wins below the BigWinOverlay threshold still get a satisfying
        // ramp rather than a static number. Reduced-motion lands instantly.
        const tier = winTier(result.multiplier)
        if (rollupRafRef.current) {
            cancelAnimationFrame(rollupRafRef.current)
            rollupRafRef.current = null
        }
        if (result.multiplier > 0) {
            setLiveAnnounce(`${tier.label || 'Win'}, ${result.multiplier.toFixed(2)}× — ${formatCredits(returnAmount)}`)
        } else {
            setLiveAnnounce('No win')
        }
        const rollTrigger = Date.now()
        const duration = rollupDurationMs(tier.id, reduceMotion)
        if (returnAmount > 0 && duration > 0 && typeof requestAnimationFrame !== 'undefined') {
            setWinRollup({ trigger: rollTrigger, amount: 0, target: returnAmount, tierId: tier.id })
            const startedAt = (typeof performance !== 'undefined' ? performance.now() : Date.now())
            const step = () => {
                const now = (typeof performance !== 'undefined' ? performance.now() : Date.now())
                const elapsed = now - startedAt
                const amount = rollupFrame(returnAmount, elapsed, duration, reduceMotion)
                setWinRollup(prev => (prev.trigger === rollTrigger ? { ...prev, amount } : prev))
                if (elapsed < duration) {
                    rollupRafRef.current = requestAnimationFrame(step)
                } else {
                    rollupRafRef.current = null
                }
            }
            rollupRafRef.current = requestAnimationFrame(step)
        } else {
            // Reduced-motion, instant, or no win: show the final value immediately.
            setWinRollup({ trigger: rollTrigger, amount: returnAmount, target: returnAmount, tierId: tier.id })
        }

        // "Truly slots" tension: near-miss framing. When the bonus scatter lands
        // exactly one short of its trigger count and no bonus fired, flash a
        // "bonus just missed" callout — the classic so-close moment that makes a
        // miss still feel eventful. Purely cosmetic; no effect on math.
        const scatterCfg = config.features?.scatter
        const triggeredBonus = result.triggeredFreeSpins
            || result.featureEvents.some(item => item.type === 'free-spins' || item.type === 'coin-meter-fill')
        if (scatterCfg?.symbolId && scatterCfg.trigger > 1 && !triggeredBonus) {
            const scatterHits = result.cells.reduce((n, cell) => n + (cell?.id === scatterCfg.symbolId ? 1 : 0), 0)
            if (scatterHits === scatterCfg.trigger - 1) {
                setNearMiss({ trigger: Date.now(), hits: scatterHits, need: scatterCfg.trigger })
                slotSfx.play('anticipation', { volume: 0.5 })
            } else {
                setNearMiss(null)
            }
        } else {
            setNearMiss(null)
        }
        // Wave 9: surface wheel + hold cinematic state
        const revealTrigger = Date.now()
        // Phase C: jackpot / vault-burst full-stage flash + persistent ramp pulse.
        const jackpotEvent = result.featureEvents.find(item => item.type === 'jackpot')
        const burstEvent = result.featureEvents.find(item => item.type === 'coin-meter-fill')
        if (jackpotEvent) {
            setEventFlash({ trigger: revealTrigger, label: 'JACKPOT' })
            slotSfx.play('bigwin', { volume: 0.95 })
        } else if (burstEvent) {
            setEventFlash({ trigger: revealTrigger, label: 'VAULT BURST' })
            slotSfx.play('bonusEnter', { volume: 0.9 })
            // Bespoke bonus-entry cinematic for the vault-style burst entry.
            const burstFs = result.featureEvents.find(item => item.type === 'free-spins')?.freeSpins || 0
            setBonusCine({
                trigger: revealTrigger,
                ...getBonusCinematic(config.id, {
                    kind: 'coin-meter-fill',
                    freeSpins: burstFs,
                    accent: config.accent,
                }),
            })
            timers.current.push(window.setTimeout(() => {
                setBonusCine(current => (current && current.trigger === revealTrigger ? null : current))
            }, bonusCineMs))
        }
        if (result.featureEvents.some(item => item.type === 'persistent-multiplier')) {
            setPersistRamp(true)
            timers.current.push(window.setTimeout(() => setPersistRamp(false), 520))
        }
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
                // Keep a compact per-spin trail so the bonus reads as an arc:
                // win contribution + the persistent multiplier in force.
                const trail = [...(prev.trail || []), {
                    win: returnAmount,
                    mult: result.multiplier || 0,
                    persist: persistentMultiplierRef.current || 0,
                }].slice(-24)
                return {
                    ...prev,
                    played: updatedPlayed,
                    totalWin: updatedWin,
                    trail,
                }
            })
        }

        const freeSpinEvent = result.featureEvents.find(item => item.type === 'free-spins')
        if (freeSpinEvent?.freeSpins) {
            slotSfx.play('bonusEnter', { volume: 0.92 })
            // Bespoke bonus-entry cinematic on the initial bonus open (not on
            // retriggers, and not when the vault-burst path already played it).
            if (!freeSpinSession && !burstEvent) {
                setBonusCine({
                    trigger: revealTrigger,
                    ...getBonusCinematic(config.id, {
                        kind: 'free-spins',
                        freeSpins: freeSpinEvent.freeSpins,
                        accent: config.accent,
                    }),
                })
                timers.current.push(window.setTimeout(() => {
                    setBonusCine(current => (current && current.trigger === revealTrigger ? null : current))
                }, bonusCineMs))
            }
            // Progression: count a bonus trigger (only on the initial entry, not
            // retriggers) plus the free spins awarded for achievement tracking.
            recordFeatureEvent({
                type: freeSpinSession ? 'retrigger' : 'free-spins',
                freeSpins: freeSpinEvent.freeSpins,
            })
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

        // During a free-spin session, each cascade chain bumps the persistent
        // multiplier by 1 (capped) — the classic escalating-bonus feel.
        if (config.features?.persistentMultiplier && usedFreeSpin && result.cascadeSteps > 0) {
            const cap = config.features?.persistentMultiplierCap || 10
            setPersistentMultiplier(value => Math.min(cap, Math.max(1, value) + 1))
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

        if (profit > 0 && (result.multiplier >= SLOT_BIG_WIN_THRESHOLD || profit >= baseBet * SLOT_BIG_WIN_THRESHOLD)) {
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
    }, [addWinnings, cellPositions, clearTimers, config, freeSpinSession, playSound, reduceMotion, session, showToast, slotSfx])

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
            // Fun Mode (free-play only) inflates the calibrated scalar so wins
            // land bigger/more often. Off by default; never a real-casino mode.
            const funScalar = isFunMode() ? (config.rtpScalar ?? 1) * FUN_PAYOUT_BOOST : undefined
            const result = resolveSlotSpin(config, {
                bonusBuy: usedBonusBuy,
                buyTier: tier,
                freeSpin: usedFreeSpin,
                stickyWilds,
                // Persistent multiplier only applies during a free-spin session.
                persistentMultiplier: usedFreeSpin ? Math.max(1, persistentMultiplierRef.current) : 1,
                ...(funScalar != null ? { rtpScalar: funScalar } : {}),
            })
            const cols = config.layout.cols
            // Instant resolve: skip the reel animation entirely and land the
            // result immediately. Distinct from slam-stop (which interrupts an
            // already-animating spin). We still flip `running` true→false and
            // mount the result so the smoke contract stays satisfiable
            // (cells>0 plus data-slot-spinning briefly / result banner).
            if (instant) {
                setLastStake(stake)
                setRunning(true)
                setSpinPhase(source === 'stage' ? 'stage-spin' : 'spinning')
                setWinningCells([])
                setLastResult(null)
                setMysteryReveal(null)
                setRetriggerFlyers([])
                setEventFlash(null)
                setNearMiss(null)
                setAnticipating(false)
                // Snap every reel straight to its resolved cell — no scrolling.
                setStoppedColumnState(cols)
                setGrid(result.cells)
                playSound('tick')
                slotSfx.play('spinStart', { volume: 0.7 })
                pendingFinishRef.current = () => {
                    finishRound({ result, baseBet, stake, usedFreeSpin, usedBonusBuy, resolve })
                }
                timers.current.push(window.setTimeout(() => {
                    if (!pendingFinishRef.current) return
                    const finish = pendingFinishRef.current
                    pendingFinishRef.current = null
                    finish()
                }, 0))
                return
            }
            // Reduced-motion shortens the reel spin/settle the same way turbo
            // does, so motion-sensitive players get a quick, low-movement spin.
            const fast = turbo || reduceMotion
            const totalSettleDelay = fast ? 180 : 360
            const baseStop = fast ? 80 : 200
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
            const scatterTrigger = config.features?.scatter?.triggerCount ?? config.features?.freeSpins?.triggerCount ?? (scatterMin + 1)

            setLastStake(stake)
            setRunning(true)
            setSpinPhase(source === 'stage' ? 'stage-spin' : 'spinning')
            setWinningCells([])
            setLastResult(null)
            setStoppedColumnState(0)
            setMysteryReveal(null)
            setRetriggerFlyers([])
            setEventFlash(null)
            setNearMiss(null)
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
            }, fast ? 55 : 85)

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
                        setAnticipationScatters({ have: scatterEarlyCount, need: scatterTrigger })
                    }
                    setStoppedColumnState(captureCol)
                    setGrid(prev => prev.map((cell, index) => {
                        const { col: itemCol } = cellPositions[index]
                        return itemCol < captureCol ? result.cells[index] : cell
                    }))
                }, cumulative))
            }

            const totalDelay = cumulative + totalSettleDelay
            // Capture the resolution so a second tap (slam-stop) can finish now.
            pendingFinishRef.current = () => {
                finishRound({ result, baseBet, stake, usedFreeSpin, usedBonusBuy, resolve })
            }
            timers.current.push(window.setTimeout(() => {
                if (!pendingFinishRef.current) return
                const finish = pendingFinishRef.current
                pendingFinishRef.current = null
                finish()
            }, totalDelay))
        })
    ), [betAmount, buyTiers, canUseFreeSpin, cellPositions, clearTimers, config, finishRound, freeSpins, instant, placeBet, playSound, reduceMotion, running, setStoppedColumnState, showToast, slotSfx, stickyWilds, turbo])

    const slamStop = useCallback(() => {
        // Resolve an in-flight spin immediately: snap all reels to their final
        // cells, cancel pending timers, and run the captured finish.
        const finish = pendingFinishRef.current
        if (!finish) return
        pendingFinishRef.current = null
        clearTimers()
        finish()
    }, [clearTimers])

    const triggerStageSpin = useCallback(() => {
        if (running) { slamStop(); return }
        const tierId = canUseFreeSpin ? null : buyTierIdRef.current
        performSpin({ source: 'stage', bet: betAmount, free: canUseFreeSpin, tierId })
    }, [betAmount, canUseFreeSpin, performSpin, running, slamStop])

    // a11y: Space spins (and slam-stops an in-flight animated spin), mirroring
    // BetPanel's Space handler but scoped to slots. Skips when typing in an
    // input/textarea/select, when modifiers are held, when autoplay owns the
    // loop, or when a real spin button is focused (so the button's own click
    // handles it — no double-fire). preventDefault stops page scroll.
    useEffect(() => {
        if (typeof window === 'undefined') return undefined
        const onKey = (e) => {
            if (e.key !== ' ' && e.code !== 'Space') return
            if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
            const el = e.target
            const tag = (el?.tagName || '').toLowerCase()
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return
            if (el?.isContentEditable) return
            // The spin button (button/[role=button]) handles its own Space via
            // native activation — don't double-fire if it's the focused element.
            if (el?.closest?.('[data-slot-action="spin"]')) return
            if (autoplayActive) return
            e.preventDefault()
            triggerStageSpin()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [autoplayActive, triggerStageSpin])

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

    // Compact list of the currently-armed stop conditions, surfaced on the dock
    // pill (not only inside the drawer) so a running session shows its guardrails.
    const activeStopChips = useMemo(() => {
        const s = advancedStops
        const chips = []
        if (s.stopOnFeature) chips.push('Feature')
        if (s.stopOnBigWin) chips.push(`≥${s.bigWinThreshold}×`)
        if (s.stopOnLoss) chips.push(`−${s.lossPercent}%`)
        if (s.stopOnGain) chips.push(`+${s.gainPercent}%`)
        if (s.stopOnLossAbs && s.lossAbs > 0) chips.push(`−${formatCredits(s.lossAbs)}`)
        if (s.stopOnGainAbs && s.gainAbs > 0) chips.push(`+${formatCredits(s.gainAbs)}`)
        if (s.stopOnSingleWin && s.singleWinAbs > 0) chips.push(`win ${formatCredits(s.singleWinAbs)}`)
        return chips
    }, [advancedStops])

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
                const net = balance - baseline
                const spinProfit = Number(outcome?.profit) || 0
                if (stops.stopOnFeature && outcome?.featureEvents?.length) stopAutoplay()
                else if (stops.stopOnBigWin && outcome?.multiplier >= stops.bigWinThreshold) stopAutoplay()
                else if (stops.stopOnLoss && balance <= baseline * (1 - stops.lossPercent / 100)) stopAutoplay()
                else if (stops.stopOnGain && balance >= baseline * (1 + stops.gainPercent / 100)) stopAutoplay()
                else if (stops.stopOnLossAbs && stops.lossAbs > 0 && net <= -stops.lossAbs) stopAutoplay()
                else if (stops.stopOnGainAbs && stops.gainAbs > 0 && net >= stops.gainAbs) stopAutoplay()
                else if (stops.stopOnSingleWin && stops.singleWinAbs > 0 && spinProfit >= stops.singleWinAbs) stopAutoplay()
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
        // Reduced-motion: skip the animated cascade trace dots entirely.
        if (!lastResult?.cascadeSteps || running || reduceMotion) return []
        return buildCascadeTraceCells({
            indexes: lastResult.winningIndexes || [],
            cellPositions,
            layout: config.layout,
        })
    }, [cellPositions, config.layout, lastResult, running, reduceMotion])
    const visibleFeatureEvents = useMemo(() => {
        if (running || !lastResult?.featureEvents?.length) return []
        return lastResult.featureEvents.slice(0, 3)
    }, [lastResult, running])
    const cover = useMemo(() => `/images/covers/generated/${config.id}.png`, [config.id])
    const displayGrid = useMemo(() => {
        if (grid.length === cellPositions.length && grid.every(Boolean)) return grid
        return makeInitialGrid(config)
    }, [cellPositions.length, config, grid])

    // Columns that became full wild this round (expanding / stacked-wild reels)
    // so the reel renderer can glow them.
    const wildColumns = useMemo(() => {
        const cols = new Set()
        for (const ev of lastResult?.featureEvents || []) {
            if ((ev.type === 'expanding-wilds' || ev.type === 'stacked-wild') && Array.isArray(ev.columns)) {
                ev.columns.forEach(c => cols.add(c))
            }
        }
        return cols
    }, [lastResult])
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

                    <div className="slot-panel-card slot-panel-speed">
                        <label className="slot-panel-label">Spin speed</label>
                        <SpinModeControl
                            value={spinMode}
                            onChange={setSpinMode}
                            disabled={running}
                            className="in-panel"
                        />
                    </div>

                    <div className="slot-panel-card slot-feature-switches">
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
                        data-ux-primary-action
                    >
                        <Play size={18} />
                        {slotSpinLabel}
                    </button>

                    <div className="slot-panel-card">
                        <button type="button" className="slot-panel-info-toggle" onClick={() => setShowInfo(v => !v)}>
                            <Info size={14} /> Feature contract <ChevronDown size={14} className={showInfo ? 'rot' : ''} />
                        </button>
                        {showInfo && <FeatureContractBody config={config} paylineMode={paylineMode} />}
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
                data-slot-spinning={running ? 'true' : undefined}
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
                            <button
                                type="button"
                                className={`slot-howpay-toggle ${showPaylines ? 'active' : ''}`}
                                onClick={() => setShowPaylines(v => !v)}
                                aria-pressed={showPaylines}
                            >
                                <Info size={11} /> How it pays
                            </button>
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
                            <div className={`slot-pill slot-pill-mult slot-pill-persist ${persistRamp ? 'is-ramping' : ''}`}>
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
                    <div
                        className="slot-reel-frame-v2"
                        ref={reelFrameRef}
                        role="group"
                        aria-label={`Slot reels, ${config.layout.cols} by ${config.layout.rows}`}
                        aria-busy={running ? 'true' : undefined}
                    >
                        {config.layout.evaluation === 'megaways' ? (
                            <div className="slot-megaways-grid" style={{ gridTemplateColumns: `repeat(${config.layout.cols}, minmax(0, 1fr))` }}>
                                {Array.from({ length: config.layout.cols }).map((_, col) => {
                                    const colRows = getColumnRows(config, col)
                                    const cellsInCol = []
                                    let cursor = 0
                                    for (let c = 0; c < col; c += 1) cursor += getColumnRows(config, c)
                                    for (let r = 0; r < colRows; r += 1) cellsInCol.push({ index: cursor + r })
                                    return (
                                        <div key={`col-${col}`} className={`slot-megaways-col ${anticipating && col >= config.layout.cols - 2 ? 'anticipating' : ''} ${!running && wildColumns.has(col) ? 'wild-column' : ''}`}>
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
                                            className={`slot-cell type-${item.type || 'pay'} symbol-${item.id} ${spinning ? 'spinning' : ''} ${winning ? 'winning' : ''} ${inAnticipationCol ? 'anticipating' : ''} ${isSticky ? 'sticky' : ''} ${!spinning && wildColumns.has(col) ? 'wild-column' : ''}`}
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
                        {showPaylines && !running && (
                            <div className="slot-howpay-overlay" aria-live="polite">
                                {paylinesInfo.groups.length > 0 && (
                                    <div className="slot-howpay-lines">
                                        {paylinesInfo.groups.map((group, gi) => (
                                            <span
                                                key={gi}
                                                className="slot-howpay-line"
                                                style={{ '--line-top': `${((gi + 0.5) / paylinesInfo.groups.length) * 100}%` }}
                                            />
                                        ))}
                                    </div>
                                )}
                                <p className="slot-howpay-explain">{paylinesInfo.explain}</p>
                            </div>
                        )}
                        {anticipating && running && (
                            <div className="slot-anticipation-callout" aria-live="polite">
                                <span>Scatter watch</span>
                                {anticipationScatters.need > 0 ? (
                                    <strong>
                                        {anticipationScatters.have}/{anticipationScatters.need}
                                        {' · '}
                                        {Math.max(1, anticipationScatters.need - anticipationScatters.have)} to go
                                    </strong>
                                ) : (
                                    <strong>reels slowing</strong>
                                )}
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

                {/* a11y: polite live region announcing each spin's outcome
                    (win tier + multiplier, or "No win") for screen readers. */}
                <div className="slot-sr-only" role="status" aria-live="polite" aria-atomic="true">
                    {liveAnnounce}
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
                        className={`slot-control-spin ${running ? 'slam' : ''}`}
                        onClick={triggerStageSpin}
                        disabled={autoplayActive}
                        aria-label={running ? 'Skip animation' : 'Spin'}
                        data-slot-action="spin"
                        data-ux-primary-action
                    >
                        <span className="slot-control-spin-inner">
                            {running ? <Square size={24} /> : <Play size={28} />}
                        </span>
                    </button>
                    <div className="slot-control-quick">
                        <SpinModeControl
                            value={spinMode}
                            onChange={setSpinMode}
                            disabled={running}
                            className="in-stage"
                        />
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

                {bonusCine && !running && (
                    <div
                        className={`slot-bonus-cine cine-${bonusCine.family}`}
                        key={`cine-${bonusCine.trigger}`}
                        style={bonusCine.accent ? { '--slot-accent': bonusCine.accent } : undefined}
                        aria-hidden="true"
                    >
                        <div className="slot-bonus-cine-veil" />
                        <div className="slot-bonus-cine-gate slot-bonus-cine-gate-left" />
                        <div className="slot-bonus-cine-gate slot-bonus-cine-gate-right" />
                        <div className="slot-bonus-cine-sweep" />
                        <div className="slot-bonus-cine-core">
                            <span className="slot-bonus-cine-glyph">{bonusCine.glyph}</span>
                            <span className="slot-bonus-cine-eyebrow">{bonusCine.eyebrow}</span>
                            <strong className="slot-bonus-cine-title">{bonusCine.title}</strong>
                            <em className="slot-bonus-cine-caption">{bonusCine.caption}</em>
                            <i className="slot-bonus-cine-spins">{bonusCine.spinsLabel}</i>
                        </div>
                    </div>
                )}

                {eventFlash && !running && (
                    <div className="slot-event-flash" key={`flash-${eventFlash.trigger}`} aria-hidden="true">
                        <strong>{eventFlash.label}</strong>
                    </div>
                )}

                {nearMiss && !running && (
                    <div className="slot-near-miss" key={`near-${nearMiss.trigger}`} aria-hidden="true">
                        <span>So close</span>
                        <strong>{nearMiss.hits} / {nearMiss.need}</strong>
                        <em>bonus just missed</em>
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
                        {freeSpinSession.trail?.length > 0 && (
                            <div className="slot-fs-trail" aria-hidden>
                                {freeSpinSession.trail.map((step, i) => (
                                    <span
                                        key={i}
                                        className={`slot-fs-trail-step ${step.win > 0 ? 'hit' : 'miss'}`}
                                        title={step.win > 0 ? `${formatCredits(step.win)} (${step.mult.toFixed(1)}×)` : 'no win'}
                                        style={{ '--bar': `${Math.min(100, Math.max(8, (step.mult || 0) * 8))}%` }}
                                    />
                                ))}
                                {persistentMultiplier > 0 && (
                                    <em className="slot-fs-trail-persist">×{persistentMultiplier}</em>
                                )}
                            </div>
                        )}
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

                {lastResult?.multiplier > 0 && !running && (() => {
                    // Use the live rollup amount only while it's tracking THIS
                    // result (matched by target); otherwise show the final total.
                    const rollupActive = winRollup.target === lastResult.returnAmount && winRollup.amount < winRollup.target
                    const shownWin = rollupActive ? winRollup.amount : lastResult.returnAmount
                    return (
                    <div className={`slot-result-banner ${config.features?.darkWinOverlay ? 'dark' : ''} tier-${winTier(lastResult.multiplier).id} ${rollupActive ? 'is-rolling' : ''}`}>
                        {winTier(lastResult.multiplier).label && (
                            <i className="slot-win-tier">{winTier(lastResult.multiplier).label}</i>
                        )}
                        <span>Total win</span>
                        <strong>{formatCredits(shownWin)}</strong>
                        <em>{lastResult.multiplier.toFixed(2)}×</em>
                        {moneyTotal > 0 && <i className="result-money">+{formatCredits(moneyTotal)} collected</i>}
                    </div>
                    )
                })()}

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
                            <div className="slot-auto-section">Absolute limits</div>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={advancedStops.stopOnLossAbs}
                                    onChange={e => setAdvancedStops(s => ({ ...s, stopOnLossAbs: e.target.checked }))}
                                />
                                Stop after losing
                                <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={advancedStops.lossAbs}
                                    onChange={e => setAdvancedStops(s => ({ ...s, lossAbs: Math.max(0, Number(e.target.value) || 0) }))}
                                />
                                credits
                            </label>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={advancedStops.stopOnGainAbs}
                                    onChange={e => setAdvancedStops(s => ({ ...s, stopOnGainAbs: e.target.checked }))}
                                />
                                Stop after winning
                                <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={advancedStops.gainAbs}
                                    onChange={e => setAdvancedStops(s => ({ ...s, gainAbs: Math.max(0, Number(e.target.value) || 0) }))}
                                />
                                credits
                            </label>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={advancedStops.stopOnSingleWin}
                                    onChange={e => setAdvancedStops(s => ({ ...s, stopOnSingleWin: e.target.checked }))}
                                />
                                Stop on a single win over
                                <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={advancedStops.singleWinAbs}
                                    onChange={e => setAdvancedStops(s => ({ ...s, singleWinAbs: Math.max(0, Number(e.target.value) || 0) }))}
                                />
                                credits
                            </label>
                        </details>
                        {activeStopChips.length > 0 && (
                            <div className="slot-auto-stopsummary" aria-label="Active stop conditions">
                                <span>Stops:</span>
                                {activeStopChips.map(chip => <em key={chip}>{chip}</em>)}
                            </div>
                        )}
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
                        {activeStopChips.length > 0 && (
                            <span className="slot-autoplay-stops" aria-label="Active stop conditions">
                                {activeStopChips.join(' · ')}
                            </span>
                        )}
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
                            {buyTiers.map(tier => {
                                const cost = round2(betAmount * tier.costMultiplier)
                                const spins = config.features?.scatter?.awardFreeSpins || config.features?.freeSpins?.count || 0
                                const indicativeReturn = round2(cost * (config.rtpTarget || definition.rtp || 0.95))
                                return (
                                    <button key={tier.id} type="button" onClick={() => handlePickTier(tier)}>
                                        <div className="slot-buy-tier-head">
                                            <strong>{tier.label}</strong>
                                            <span>{tier.costMultiplier}× bet</span>
                                        </div>
                                        <div className="slot-buy-tier-meta">
                                            {tier.guaranteedScatters && <em>{tier.guaranteedScatters} scatters{spins ? ` → ~${spins} spins` : ''}</em>}
                                            {tier.persistentMultiplier ? <em>+{tier.persistentMultiplier}× persistent</em> : null}
                                            <em>cost {formatCredits(cost)}</em>
                                        </div>
                                        <div className="slot-buy-tier-ev">
                                            Indicative return ~{formatCredits(indicativeReturn)} ({Math.round((config.rtpTarget || definition.rtp || 0.95) * 100)}% RTP). Buying the bonus doesn't beat the house edge.
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                )}

                <div className="slot-stage-foot">
                    {sparkline.points.length > 1 && (
                        <div className={`slot-bankroll-spark ${sparkline.net >= 0 ? 'pos' : 'neg'}`} title="Session net profit trail">
                            <svg viewBox="0 0 120 30" preserveAspectRatio="none" aria-hidden>
                                <line x1="0" y1={sparkline.zeroY} x2="120" y2={sparkline.zeroY} className="slot-spark-zero" />
                                <path d={sparkline.path} className="slot-spark-line" fill="none" />
                            </svg>
                            <div className="slot-bankroll-spark-meta">
                                <small>Session</small>
                                <strong>{sparkline.net >= 0 ? '+' : ''}{formatCredits(sparkline.net)}</strong>
                            </div>
                        </div>
                    )}
                    <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />
                </div>
            </div>

            {(() => {
              const dock = (
                <div
                    className="slot-mobile-dock"
                    style={{ '--slot-accent': config.accent }}
                    data-slot-mobile-dock
                    data-mobile-critical-surface
                    data-ux-surface="dock"
                >
                <button
                    type="button"
                    className="slot-mobile-readout slot-mobile-bet"
                    onClick={() => setShowMobileBet(true)}
                    disabled={running || autoplayActive || canUseFreeSpin}
                    aria-label="Edit bet"
                    aria-haspopup="dialog"
                >
                    <span>{canUseFreeSpin ? 'Free' : 'Bet'}</span>
                    <strong>{formatCredits(effectiveStake)}</strong>
                </button>
                <div className="slot-mobile-readout">
                    <span>Win</span>
                    <strong>{formatCredits(lastResult?.returnAmount || 0)}</strong>
                </div>
                <button
                    type="button"
                    className="slot-mobile-icon"
                    onClick={() => setShowMobileInfo(true)}
                    aria-label="View paytable and rules"
                    aria-haspopup="dialog"
                >
                    <Info size={16} />
                    <span>Info</span>
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
                    disabled={autoplayActive}
                    data-slot-action="spin"
                    data-mobile-hit-target="primary"
                    data-ux-primary-action
                >
                    <Play size={18} />
                    {running ? 'Skip' : slotSpinLabel}
                </button>
              </div>
              )
              return dockPortal ? createPortal(dock, dockPortal) : dock
            })()}

            {showMobileBet && (
                <div
                    className="slot-mobile-bet-sheet-backdrop"
                    onClick={() => setShowMobileBet(false)}
                    role="dialog"
                    aria-label="Adjust bet"
                >
                    <div className="slot-mobile-bet-sheet" onClick={e => e.stopPropagation()}>
                        <header>
                            <strong>Bet amount</strong>
                            <button type="button" onClick={() => setShowMobileBet(false)} aria-label="Close"><X size={16} /></button>
                        </header>
                        <div className="slot-mobile-bet-value">{formatCredits(betAmount)}</div>
                        <div className="slot-mobile-bet-steppers">
                            <button type="button" onClick={() => setBet(0.1)} disabled={running || autoplayActive}>Min</button>
                            <button type="button" onClick={() => setBet(betAmount / 2)} disabled={running || autoplayActive}>½</button>
                            <button type="button" onClick={() => setBet(betAmount * 2)} disabled={running || autoplayActive}>2×</button>
                            <button type="button" onClick={() => setBet(Math.min(10000, balance || 10000))} disabled={running || autoplayActive}>Max</button>
                        </div>
                        <input
                            type="number"
                            className="slot-mobile-bet-input"
                            min="0.1"
                            max="10000"
                            step="0.5"
                            value={betAmount}
                            onChange={e => setBet(e.target.value)}
                            disabled={running || autoplayActive}
                            aria-label="Bet amount"
                        />
                        <div className="slot-mobile-bet-speed">
                            <span className="slot-mobile-bet-speed-label">Spin speed</span>
                            <SpinModeControl
                                value={spinMode}
                                onChange={setSpinMode}
                                disabled={running}
                            />
                        </div>
                        <button
                            type="button"
                            className="slot-mobile-bet-info"
                            onClick={() => { setShowMobileBet(false); setShowMobileInfo(true) }}
                        >
                            <Info size={14} /> View paytable &amp; rules
                        </button>
                    </div>
                </div>
            )}

            {showMobileInfo && (
                <div
                    className="slot-mobile-info-backdrop"
                    onClick={() => setShowMobileInfo(false)}
                >
                    <div
                        className="slot-mobile-info-sheet"
                        ref={mobileInfoSheetRef}
                        onClick={e => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-label={`${config.title} paytable and rules`}
                        tabIndex={-1}
                        style={{ '--slot-accent': config.accent }}
                    >
                        <header className="slot-mobile-info-head">
                            <strong>Paytable &amp; rules</strong>
                            <button type="button" onClick={() => setShowMobileInfo(false)} aria-label="Close"><X size={16} /></button>
                        </header>
                        <div className="slot-mobile-info-body">
                            <FeatureContractBody config={config} paylineMode={paylineMode} />
                        </div>
                    </div>
                </div>
            )}

            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={SLOT_BIG_WIN_THRESHOLD} />
            <EducationPanel
                definition={definition}
                betAmount={lastStake || betAmount}
                winProbability={educationEv.winProbability}
                payoutMultiplier={educationEv.payoutMultiplier}
                balance={balance}
                recentProfit={recentProfit}
            />
        </GameShell>
    )
}
