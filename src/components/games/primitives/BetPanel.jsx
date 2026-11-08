// Stake/Rainbet-style bet panel with Manual / Auto / Strategy tabs.
// Drives any game's bet flow. Provides:
//   - Bet amount with ½ / 2× / Max controls
//   - Quick actions: ½, 2×, Max, Min, Rebet last
//   - Auto tab: bet count, stop on profit/loss, single-win-greater-than,
//     bet adjustments on win/loss
//   - Strategy tab: simple Martingale / Reverse / Flat presets
//   - Auto-play loop integration via onPlay callback

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Play, Pause, ChevronsRight, Settings, Sliders, RotateCcw } from 'lucide-react'
import { formatCredits } from '../../../utils/simulationMath'
import { withTimeout } from '../../../utils/scheduling'
import { claimEscape } from '../../../utils/escapeClaims'
import { accountAutoRound } from './autoAccounting'
import { isOpenDialogPresent } from './HotkeyHelp'

// QA028: a shortcut may only start or change a paid action when the keystroke is
// a genuine, unheld press aimed at the page itself. Extracted from the effect so
// the guard can be pinned by a test without mounting a DOM.
export function shouldHandleShortcut(event, { dialogOpen = false } = {}) {
    if (!event) return false
    if (event.ctrlKey || event.metaKey || event.altKey) return false
    // A held/repeating key must not fire a second paid action.
    if (event.repeat) return false
    const tag = (event.target?.tagName || '').toLowerCase()
    // A focused interactive control owns Space natively (Game tools, Mute,
    // choices, dialog buttons). Never start a paid round from it.
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button' || tag === 'a') return false
    if (event.target?.isContentEditable) return false
    // While a dialog is open its controls own Space; the panel must not start a
    // paid round underneath it.
    if (dialogOpen) return false
    return true
}

const TABS = ['manual', 'auto', 'strategy']

export default function BetPanel({
    balance,
    minBet = 0.01,
    maxBet = 10000,
    initialBet = 5,
    fixedBetAmount = null,
    // Table games quote the complete next ticket; the amount input remains the
    // independent selection/Auto amount. A resolver preserves repeat semantics.
    ticketStake = null,
    betLabel = 'Bet Amount',
    onPlay,
    onStop,
    runningRound,
    actionLabel = 'Play',
    mobilePlayLabel = null,
    disableAuto = false,
    children, // game-specific controls injected into manual tab body
    afterPlayChildren, // optional lower-priority controls shown after the primary CTA
    dockExtras = null, // optional compact controls rendered inside the portaled mobile dock
    autoChildren, // optional extra auto controls
    lastBet = null,
    // Reports the *currently selected* stake upward so shell-level surfaces that
    // explain the bet (e.g. the odds popup's EV / risk) use what the player is
    // editing now, not the amount of the previous settled round.
    onStakeChange = null,
    // Mid-round CTA support: when playPhase is set, BetPanel hides the bet input
    // controls (or marks them disabled) and the bp-play button becomes the in-round
    // primary action ("Climb", "Cashout", "Draw", etc).
    playPhase = null, // null | 'idle' | 'in-round'
    playLabel = null, // optional override for bp-play label
    onPlayPhaseAction = null, // called instead of onPlay when playPhase === 'in-round'
    // QA v4: per-game timeout budget for the autoplay loop. Stops a stuck
    // round from hanging the loop forever.
    autoTimeoutMs = 15000,
    // QA v4: gap between consecutive auto-play rounds. Plinko sets this to 500
    // so multiple balls drop at a clean cadence.
    autoIntervalMs = 120,
    playButtonProps = {},
}) {
    const panelId = useId()
    const rebetReasonId = `${panelId}-rebet-reason`
    const [tab, setTab] = useState('manual')
    const [mobileControlsOpen, setMobileControlsOpen] = useState(false)
    const [portalRoot, setPortalRoot] = useState(null)
    // Canonical mobile breakpoint (matches index.css nav metrics + browserSmoke
    // + SportsbookShell). On mobile the betting sheet must be portaled to <body>
    // alongside the dock/scrim so the global z-index ordering (scrim < dock <
    // sheet) actually applies. Rendered in-flow on desktop.
    const [isMobile, setIsMobile] = useState(false)
    // The mobile dock is portaled to <body>, so the game's --accent (set on
    // .game-shell) does not cascade to it and the play button rendered with a
    // transparent background. Capture the accent at mount and re-apply it inline.
    const [dockAccent, setDockAccent] = useState(null)
    const panelRef = useRef(null)
    const [betAmount, setBetAmount] = useState(initialBet)
    // Auto state
    const [autoCount, setAutoCount] = useState(10)
    const [autoInfinite, setAutoInfinite] = useState(false)
    const [autoBetAmount, setAutoBetAmount] = useState(null)
    const [stopProfit, setStopProfit] = useState('')
    const [stopLoss, setStopLoss] = useState('')
    const [stopBigWin, setStopBigWin] = useState('')
    const [onWinPct, setOnWinPct] = useState(0)
    const [onWinReset, setOnWinReset] = useState(true)
    const [onLossPct, setOnLossPct] = useState(0)
    const [onLossReset, setOnLossReset] = useState(true)
    // Strategy presets
    const [strategy, setStrategy] = useState('flat')
    const hasFixedBet = Number.isFinite(Number(fixedBetAmount)) && Number(fixedBetAmount) > 0
    const effectiveBetAmount = hasFixedBet ? Number(fixedBetAmount) : betAmount
    const quotedBetAmount = tab === 'auto' && autoBetAmount !== null ? autoBetAmount : effectiveBetAmount
    const hasTicketStake = ticketStake !== null
    const quotedTicketStake = typeof ticketStake === 'function'
        ? ticketStake({ mode: tab, betAmount: quotedBetAmount })
        : ticketStake
    const ticketIsFunded = Number.isFinite(quotedTicketStake) && quotedTicketStake > 0
        && Number.isFinite(balance) && quotedTicketStake <= balance

    // Publish the live selection so the shell can describe the *current* bet.
    useEffect(() => {
        onStakeChange?.(effectiveBetAmount)
    }, [effectiveBetAmount, onStakeChange])

    const autoRunning = useRef(false)
    const autoLeft = useRef(0)
    const autoBaseBet = useRef(initialBet)
    const sessionProfit = useRef(0)
    // The retained Auto loop must quote and play the same current table ticket.
    const latestAutoPlay = useRef({ onPlay, ticketStake, balance })
    latestAutoPlay.current.onPlay = onPlay
    latestAutoPlay.current.ticketStake = ticketStake
    latestAutoPlay.current.balance = balance

    const half = useCallback(() => setBetAmount(v => Math.max(minBet, Number((v / 2).toFixed(2)))), [minBet])
    const double = useCallback(() => setBetAmount(v => Math.min(maxBet, Number((v * 2).toFixed(2)))), [maxBet])
    // Wave 2: 1/4 chip for fast halving chains (1x → 1/4x in two taps).
    const quarter = useCallback(() => setBetAmount(v => Math.max(minBet, Number((v / 4).toFixed(2)))), [minBet])
    const reset = useCallback(() => setBetAmount(initialBet), [initialBet])
    const max = useCallback(() => setBetAmount(Math.max(minBet, Number(Math.min(maxBet, balance || 0).toFixed(2)))), [balance, maxBet, minBet])
    const min = useCallback(() => setBetAmount(minBet), [minBet])
    const rebet = useCallback(() => {
        if (lastBet && Number.isFinite(lastBet) && lastBet > 0) {
            setBetAmount(Math.max(minBet, Math.min(maxBet, lastBet)))
        }
    }, [lastBet, maxBet, minBet])

    const stopAuto = useCallback(() => {
        autoRunning.current = false
        autoLeft.current = 0
        sessionProfit.current = 0
        setAutoBetAmount(null)
        if (onStop) onStop()
    }, [onStop])

    const handlePlay = useCallback(async () => {
        if (playPhase === 'in-round') {
            if (onPlayPhaseAction) await onPlayPhaseAction()
            return
        }
        // A locked round blocks a fresh paid start for every game, not only the
        // ticket games. The Auto loop is the one caller allowed through.
        if (!(tab === 'auto' && autoRunning.current) && (runningRound || (hasTicketStake && !ticketIsFunded))) return
        if (tab === 'manual') {
            if (!onPlay) return
            await onPlay({ betAmount: effectiveBetAmount, mode: 'manual' })
            return
        }
        if (tab === 'strategy') {
            // Strategy is just a single play with the strategy hint passed through
            if (!onPlay) return
            await onPlay({ betAmount: effectiveBetAmount, mode: 'strategy', strategy })
            return
        }
        if (autoRunning.current) {
            stopAuto()
            return
        }
        autoRunning.current = true
        autoLeft.current = autoInfinite ? Infinity : Math.max(1, Number(autoCount) || 1)
        autoBaseBet.current = effectiveBetAmount
        sessionProfit.current = 0
        // One reconciliation state for the whole loop. Only a `committed`
        // round counts and moves session profit; a refusal must not consume
        // the configured count or trip a stop threshold.
        let autoState = { rounds: 0, refusals: 0, sessionProfit: 0, lastProfit: 0, lastKind: null, limitProfit: Number(stopProfit), limitLoss: Number(stopLoss), limitBigWin: Number(stopBigWin) }
        if (hasTicketStake) setAutoBetAmount(effectiveBetAmount)
        let currentBet = effectiveBetAmount
        while (autoRunning.current && autoLeft.current > 0) {
            // Table eligibility follows the same complete ticket as its quote.
            const livePlay = hasTicketStake ? latestAutoPlay.current.onPlay : onPlay
            const liveTicketStake = hasTicketStake ? latestAutoPlay.current.ticketStake : ticketStake
            const liveBalance = hasTicketStake ? latestAutoPlay.current.balance : balance
            const charge = typeof liveTicketStake === 'function'
                ? liveTicketStake({ mode: 'auto', betAmount: currentBet })
                : hasTicketStake ? liveTicketStake : currentBet
            if ((hasTicketStake && (!Number.isFinite(charge) || charge <= 0 || !Number.isFinite(liveBalance))) || (liveBalance || 0) < charge) {
                stopAuto()
                break
            }
            // QA v4: race the round against a timeout so a stuck game
            // can't hang the autoplay loop. The game's own state should
            // recover on its next render; we just unblock the loop.
            const raced = await withTimeout(
                Promise.resolve(livePlay({ betAmount: currentBet, mode: 'auto' })),
                autoTimeoutMs,
            )
            if (raced.timedOut) {
                // eslint-disable-next-line no-console
                console.warn('[BetPanel] autoplay round timed out after', autoTimeoutMs, 'ms')
                stopAuto()
                break
            }
            // Reconcile through the shared six-kind contract. A refused round
            // (insufficient funds, in-round, gate-closed) resolves a
            // non-`committed` kind and must neither consume the count nor move
            // session profit — `{profit:0}` alone is ambiguous.
            const step = accountAutoRound(autoState, raced.value)
            autoState = step.state
            const { lastKind, lastProfit: profit, sessionProfit } = autoState
            sessionProfit.current = sessionProfit
            if (step.stop) { stopAuto(); break }
            if (!step.accepted) {
                // A refusal is not a round: retry the same stake, but do not
                // spin forever on a persistent refusal — the eligibility guard
                // above already stopped the loop when the balance ran out.
                if (lastKind === 'unknown' || lastKind === 'aborted') { stopAuto(); break }
                await new Promise(res => setTimeout(res, autoIntervalMs))
                continue
            }
            // bet adjust on the accepted result only
            if (profit > 0) {
                if (onWinReset) currentBet = autoBaseBet.current
                else if (onWinPct) currentBet = Math.max(minBet, Number((currentBet * (1 + onWinPct / 100)).toFixed(2)))
            } else if (profit < 0) {
                if (onLossReset) currentBet = autoBaseBet.current
                else if (onLossPct) currentBet = Math.max(minBet, Number((currentBet * (1 + onLossPct / 100)).toFixed(2)))
            }
            currentBet = Math.min(maxBet, currentBet)
            if (hasTicketStake) setAutoBetAmount(currentBet)
            if (autoLeft.current !== Infinity) autoLeft.current -= 1
            // Configurable cadence between rounds. Plinko uses 500 so balls
            // drop in a continuous shower. Default 120 keeps every other game
            // feeling snappy.
            await new Promise(res => setTimeout(res, autoIntervalMs))
        }
        autoRunning.current = false
        if (hasTicketStake) setAutoBetAmount(null)
    }, [tab, onPlay, effectiveBetAmount, autoInfinite, autoCount, stopProfit, stopLoss, stopBigWin, onWinPct, onWinReset, onLossPct, onLossReset, balance, maxBet, minBet, strategy, stopAuto, playPhase, onPlayPhaseAction, autoIntervalMs, autoTimeoutMs, ticketStake, hasTicketStake, ticketIsFunded, runningRound])

    useEffect(() => () => { autoRunning.current = false }, [])

    useEffect(() => {
        setPortalRoot(document.body)
    }, [])

    // Track the mobile breakpoint so the betting sheet can be portaled to <body>
    // on mobile (escaping the .game-shell stacking context that would otherwise
    // trap it below the body-level dismiss scrim).
    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return undefined
        const mq = window.matchMedia('(max-width: 768px)')
        const sync = () => setIsMobile(mq.matches)
        sync()
        if (mq.addEventListener) {
            mq.addEventListener('change', sync)
            return () => mq.removeEventListener('change', sync)
        }
        mq.addListener(sync)
        return () => mq.removeListener(sync)
    }, [])

    // Collapse the open sheet when we transition back to desktop so a stale
    // mobile-open state can't leave the desktop panel in a weird mode.
    useEffect(() => {
        if (!isMobile && mobileControlsOpen) setMobileControlsOpen(false)
    }, [isMobile, mobileControlsOpen])

    // Resolve the game accent from the nearest .game-shell (or :root fallback)
    // so the portaled mobile dock can re-apply it inline. The shell's inline
    // --accent may not be committed on the first frame, so retry across a few
    // animation frames until a non-empty value resolves.
    useEffect(() => {
        let raf = null
        let attempts = 0
        const resolve = () => {
            const shell = panelRef.current?.closest('.game-shell')
            const source = shell || document.documentElement
            const accent = getComputedStyle(source).getPropertyValue('--accent').trim()
            if (accent) {
                setDockAccent(accent)
                return
            }
            if (attempts++ < 8) raf = requestAnimationFrame(resolve)
        }
        resolve()
        return () => { if (raf) cancelAnimationFrame(raf) }
    }, [])

    // Keyboard shortcuts. Disabled when typing in any input/textarea, when modifiers
    // (ctrl/cmd/alt) are held, and when an auto round is in progress to keep things safe.
    useEffect(() => {
        const onKey = (e) => {
            if (!shouldHandleShortcut(e, { dialogOpen: isOpenDialogPresent() })) return
            switch (e.key) {
                case ' ': // Space: play / stop autobet / in-round CTA
                    e.preventDefault()
                    handlePlay()
                    break
                case 's':
                case 'S':
                    if (autoRunning.current) {
                        e.preventDefault()
                        stopAuto()
                    }
                    break
                case 'r':
                case 'R':
                    if (lastBet) {
                        e.preventDefault()
                        rebet()
                    }
                    break
                case 'h':
                case 'H':
                    e.preventDefault()
                    half()
                    break
                case 'd':
                case 'D':
                    e.preventDefault()
                    double()
                    break
                case '+':
                case '=':
                    e.preventDefault()
                    setBetAmount(v => Math.min(maxBet, Number((v + Math.max(0.01, v * 0.1)).toFixed(2))))
                    break
                case '-':
                case '_':
                    e.preventDefault()
                    setBetAmount(v => Math.max(minBet, Number((v - Math.max(0.01, v * 0.1)).toFixed(2))))
                    break
                default:
                    break
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [handlePlay, stopAuto, lastBet, rebet, half, double, maxBet, minBet])

    const isAutoLive = tab === 'auto' && autoRunning.current
    const inRound = playPhase === 'in-round'
    const playButtonLabel = (() => {
        if (inRound) return playLabel || 'Continue'
        if (isAutoLive) return 'Stop Autobet'
        return tab === 'auto' ? 'Start Autobet' : (playLabel || actionLabel)
    })()
    const dockSummary = inRound
        ? 'Round action'
        : hasTicketStake
            ? 'Ticket stake'
            : hasFixedBet
                ? 'Fixed stake'
                : `${tab.charAt(0).toUpperCase()}${tab.slice(1)} stake`
    const dockValue = inRound
        ? playButtonLabel
        : formatCredits(hasTicketStake ? quotedTicketStake : effectiveBetAmount)
    const playDisabled = !isAutoLive && !inRound && (runningRound || (hasTicketStake && !ticketIsFunded))
    const mobileButtonLabel = mobilePlayLabel || playButtonLabel
    const playContent = isAutoLive ? <><Pause size={16} /> Stop Autobet</> : <><Play size={16} /> {playButtonLabel}</>
    const mobilePlayContent = isAutoLive ? <><Pause size={16} /> Stop</> : <><Play size={16} /> {mobileButtonLabel}</>

    // The dock's labeled opener exposes every game-specific setup control.
    const hasSetupControls = Boolean(children)
    const settingsLabel = hasSetupControls ? 'Bet & options' : 'Bet settings'
    const openMobileControls = () => setMobileControlsOpen(true)

    const sheetRef = useRef(null)
    const sheetTriggerRef = useRef(null)

    // While the mobile sheet is open it owns Escape, so the mobile drawer
    // beneath it defers rather than consuming the key and stranding the sheet.
    useEffect(() => {
        if (!isMobile || !mobileControlsOpen) return undefined
        // Registered as a handler, not a flag, so only the topmost layer acts
        // on one Escape. The sheet's own listener below handles the Tab trap.
        return claimEscape(() => {
            setMobileControlsOpen(false)
            return true
        })
    }, [isMobile, mobileControlsOpen])

    // Accessibility for the portaled mobile sheet: trap Tab focus inside the
    // open sheet, close on Escape, move focus into the sheet on open, and
    // restore focus to the trigger on close.
    useEffect(() => {
        if (!isMobile || !mobileControlsOpen) return undefined
        const sheet = sheetRef.current
        if (!sheet) return undefined

        const focusables = () => Array.from(
            sheet.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
        ).filter(el => !el.disabled && el.offsetParent !== null)

        // Move focus into the sheet (first control) on open.
        const first = focusables()[0]
        if (first) first.focus()

        const onKey = (e) => {
            // Escape is routed through the claim registry (see the claim effect
            // above), so this listener handles only the Tab focus trap. A second
            // Escape branch here would close this sheet and, independently,
            // whichever layer was registered above it.
            if (e.key !== 'Tab') return
            const items = focusables()
            if (items.length === 0) return
            const firstEl = items[0]
            const lastEl = items[items.length - 1]
            if (e.shiftKey && document.activeElement === firstEl) {
                e.preventDefault()
                lastEl.focus()
            } else if (!e.shiftKey && document.activeElement === lastEl) {
                e.preventDefault()
                firstEl.focus()
            }
        }
        document.addEventListener('keydown', onKey, true)
        return () => {
            document.removeEventListener('keydown', onKey, true)
            // Restore focus to the trigger when the sheet closes.
            const trigger = sheetTriggerRef.current
            if (trigger && typeof trigger.focus === 'function') trigger.focus()
        }
    }, [isMobile, mobileControlsOpen])

    const sheetContent = (
        <div
            className="bp-content"
            id={`${panelId}-mobile-controls`}
            ref={sheetRef}
            role={isMobile ? 'dialog' : undefined}
            aria-modal={isMobile && mobileControlsOpen ? 'true' : undefined}
            aria-label={isMobile ? settingsLabel : undefined}
        >
                <button
                    type="button"
                    className="bp-mobile-close"
                    aria-label="Close betting controls"
                    onClick={() => setMobileControlsOpen(false)}
                >
                    Close
                </button>

                <div className="bp-tabs">
                {TABS.filter(t => t !== 'auto' || !disableAuto).map(t => (
                    <button key={t} className={`bp-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
                        {t === 'manual' ? <ChevronsRight size={14} /> : t === 'auto' ? <Settings size={14} /> : <Sliders size={14} />}
                        <span>{t}</span>
                    </button>
                ))}
                </div>

                <div className="bp-section">
                <label className="bp-label" htmlFor={`${panelId}-bet-amount`}>{betLabel}</label>
                <div className="bp-bet-row" data-mobile-stepper-chips="primary" data-stepper-touch-floor="44">
                    <input id={`${panelId}-bet-amount`} type="number" className="bp-bet-input" min={minBet} max={maxBet} step={0.5}
                        value={effectiveBetAmount}
                        disabled={hasFixedBet}
                        onChange={e => setBetAmount(Math.max(minBet, Number(e.target.value) || 0))}
                    />
                    <button className="bp-bet-btn" onClick={quarter} disabled={hasFixedBet} data-bet-chip="quarter" aria-label="Quarter current bet">1/4</button>
                    <button className="bp-bet-btn" onClick={half} disabled={hasFixedBet} data-bet-chip="half" aria-label="Half current bet">½</button>
                    <button className="bp-bet-btn" onClick={double} disabled={hasFixedBet} data-bet-chip="double" aria-label="Double current bet">2×</button>
                    <button className="bp-bet-btn" onClick={max} disabled={hasFixedBet} data-bet-chip="max" aria-label="Bet the maximum">Max</button>
                </div>
                <div className="bp-quick-actions" data-mobile-stepper-chips="secondary">
                    <button onClick={min} disabled={hasFixedBet} data-bet-chip="min">Min</button>
                    <button onClick={reset} disabled={hasFixedBet} data-bet-chip="reset" aria-label={`Reset to default bet ${formatCredits(initialBet)}`}>1×</button>
                    <button
                        onClick={rebet}
                        disabled={hasFixedBet || !lastBet}
                        title={!lastBet ? 'Place your first bet to enable Rebet' : hasFixedBet ? 'Rebet is locked during this round' : 'Repeat last bet amount'}
                        data-disabled-reason={!lastBet ? 'Place your first bet to enable Rebet' : hasFixedBet ? 'Rebet is locked during this round' : undefined}
                        aria-describedby={!lastBet || hasFixedBet ? rebetReasonId : undefined}
                    >
                        <RotateCcw size={11} style={{ marginRight: 3 }} />Rebet
                    </button>
                </div>
                {(!lastBet || hasFixedBet) && (
                    <p className="bp-disabled-reason" id={rebetReasonId} role="note">
                        {!lastBet ? 'Place your first bet to enable Rebet' : 'Rebet is locked during this round'}
                    </p>
                )}
                <div className="bp-bal-line">
                    <span>Balance</span>
                    <strong>{formatCredits(balance || 0)}</strong>
                </div>
                </div>

                {tab === 'manual' && children && <div className="bp-section">{children}</div>}

                {tab === 'auto' && (
                    <>
                    <div className="bp-section">
                        <label className="bp-label" htmlFor={`${panelId}-auto-count`}>Number of Bets</label>
                        <div className="bp-row">
                            <input id={`${panelId}-auto-count`} type="number" min="1" className="bp-bet-input" value={autoInfinite ? 0 : autoCount} disabled={autoInfinite} onChange={e => setAutoCount(Math.max(1, Number(e.target.value) || 1))} />
                            <button className={`bp-bet-btn ${autoInfinite ? 'active' : ''}`} onClick={() => setAutoInfinite(v => !v)}>∞</button>
                        </div>
                    </div>
                    <div className="bp-section">
                        <span className="bp-label" id={`${panelId}-on-win-label`}>On Win</span>
                        <div className="bp-row" role="group" aria-labelledby={`${panelId}-on-win-label`}>
                            <button className={`bp-bet-btn ${onWinReset ? 'active' : ''}`} onClick={() => setOnWinReset(true)}>Reset</button>
                            <button className={`bp-bet-btn ${!onWinReset ? 'active' : ''}`} onClick={() => setOnWinReset(false)}>Increase</button>
                            {!onWinReset && <input className="bp-bet-input" type="number" placeholder="%" aria-label="On win increase percentage" value={onWinPct} onChange={e => setOnWinPct(Number(e.target.value) || 0)} />}
                        </div>
                    </div>
                    <div className="bp-section">
                        <span className="bp-label" id={`${panelId}-on-loss-label`}>On Loss</span>
                        <div className="bp-row" role="group" aria-labelledby={`${panelId}-on-loss-label`}>
                            <button className={`bp-bet-btn ${onLossReset ? 'active' : ''}`} onClick={() => setOnLossReset(true)}>Reset</button>
                            <button className={`bp-bet-btn ${!onLossReset ? 'active' : ''}`} onClick={() => setOnLossReset(false)}>Increase</button>
                            {!onLossReset && <input className="bp-bet-input" type="number" placeholder="%" aria-label="On loss increase percentage" value={onLossPct} onChange={e => setOnLossPct(Number(e.target.value) || 0)} />}
                        </div>
                    </div>
                    <div className="bp-section">
                        <label className="bp-label" htmlFor={`${panelId}-stop-profit`}>Stop on Profit</label>
                        <input id={`${panelId}-stop-profit`} className="bp-bet-input" type="number" placeholder="0 = off" value={stopProfit} onChange={e => setStopProfit(e.target.value)} />
                    </div>
                    <div className="bp-section">
                        <label className="bp-label" htmlFor={`${panelId}-stop-loss`}>Stop on Loss</label>
                        <input id={`${panelId}-stop-loss`} className="bp-bet-input" type="number" placeholder="0 = off" value={stopLoss} onChange={e => setStopLoss(e.target.value)} />
                    </div>
                    <div className="bp-section">
                        <label className="bp-label" htmlFor={`${panelId}-stop-big-win`}>Stop on Single Win ≥</label>
                        <input id={`${panelId}-stop-big-win`} className="bp-bet-input" type="number" placeholder="0 = off" value={stopBigWin} onChange={e => setStopBigWin(e.target.value)} />
                    </div>
                    {autoChildren}
                    </>
                )}

                {tab === 'strategy' && (
                    <div className="bp-section">
                    <label className="bp-label">Strategy</label>
                    <div className="bp-row">
                        {['flat', 'martingale', 'reverse'].map(s => (
                            <button key={s} className={`bp-bet-btn ${strategy === s ? 'active' : ''}`} onClick={() => setStrategy(s)}>{s}</button>
                        ))}
                    </div>
                    <p className="bp-hint">Strategy is educational only. Negative EV applies the same as manual play.</p>
                    </div>
                )}

                <button className={`bp-play ${isAutoLive ? 'stop' : ''} ${runningRound ? 'busy' : ''} ${inRound ? 'in-round' : ''}`}
                    disabled={playDisabled}
                    onClick={handlePlay}
                    data-ux-primary-action
                    {...playButtonProps}
                >
                    {playContent}
                </button>
                {afterPlayChildren}
            </div>
    )

    const mobileDock = (
        <div
            className={`bp-mobile-layer ${mobileControlsOpen ? 'mobile-open' : ''}`}
            style={dockAccent ? { '--accent': dockAccent } : undefined}
        >
            <div className="bp-mobile-dock" data-mobile-action-dock data-ux-surface="dock">
                <button
                    type="button"
                    className="bp-mobile-settings"
                    onClick={openMobileControls}
                    ref={sheetTriggerRef}
                    aria-expanded={mobileControlsOpen}
                    aria-controls={`${panelId}-mobile-controls`}
                    aria-label={settingsLabel}
                    data-mobile-settings-toggle
                >
                    <Settings size={16} />
                    <span>{settingsLabel}</span>
                </button>
                <div className="bp-mobile-summary">
                    <span>{dockSummary}</span>
                    <strong>{dockValue}</strong>
                </div>
                <button
                    type="button"
                    className={`bp-mobile-play ${isAutoLive ? 'stop' : ''} ${runningRound ? 'busy' : ''} ${inRound ? 'in-round' : ''}`}
                    disabled={playDisabled}
                    onClick={handlePlay}
                    data-mobile-primary-action
                    data-mobile-hit-target="primary"
                    data-ux-primary-action
                    {...playButtonProps}
                >
                    {mobilePlayContent}
                </button>
                {dockExtras && (
                    <div className="bp-mobile-dock-extras" data-mobile-dock-extras>
                        {dockExtras}
                    </div>
                )}
            </div>

            {mobileControlsOpen && (
                <button
                    type="button"
                    className="bp-mobile-scrim"
                    aria-label="Close betting controls"
                    onClick={() => setMobileControlsOpen(false)}
                />
            )}

            {/* On mobile the sheet is portaled alongside the dock/scrim so the
                body-level z-index ordering (scrim 1390 < dock 1400 < sheet 1410)
                actually applies. Without this the sheet stays trapped inside the
                .game-shell stacking context (z:1) and is painted under the scrim,
                appearing "blurred out" and intercepting every tap. */}
            {isMobile && sheetContent}
        </div>
    )

    return (
        <div className={`bp-panel ${mobileControlsOpen ? 'mobile-open' : ''}`} ref={panelRef} data-ux-surface="controls">
            {portalRoot ? createPortal(mobileDock, portalRoot) : mobileDock}

            {/* Desktop renders the sheet in-flow (display:contents). On mobile it
                is rendered through the portal above instead, so skip it here. */}
            {!isMobile && sheetContent}
        </div>
    )
}
