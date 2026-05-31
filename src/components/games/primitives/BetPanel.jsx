// Stake/Rainbet-style bet panel with Manual / Auto / Strategy tabs.
// Drives any game's bet flow. Provides:
//   - Bet amount with ½ / 2× / Max controls
//   - Quick actions: ½, 2×, Max, Min, Rebet last
//   - Auto tab: bet count, stop on profit/loss, single-win-greater-than,
//     bet adjustments on win/loss
//   - Strategy tab: simple Martingale / Reverse / Flat presets
//   - Auto-play loop integration via onPlay callback

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Play, Pause, ChevronsRight, Settings, Sliders, RotateCcw } from 'lucide-react'
import { formatCredits } from '../../../utils/simulationMath'
import { withTimeout } from '../../../utils/scheduling'

const TABS = ['manual', 'auto', 'strategy']

export default function BetPanel({
    balance,
    minBet = 0.01,
    maxBet = 10000,
    initialBet = 5,
    fixedBetAmount = null,
    betLabel = 'Bet Amount',
    onPlay,
    onStop,
    runningRound,
    actionLabel = 'Play',
    disableAuto = false,
    children, // game-specific controls injected into manual tab body
    afterPlayChildren, // optional lower-priority controls shown after the primary CTA
    autoChildren, // optional extra auto controls
    lastBet = null,
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
    const [tab, setTab] = useState('manual')
    const [betAmount, setBetAmount] = useState(initialBet)
    // Auto state
    const [autoCount, setAutoCount] = useState(10)
    const [autoInfinite, setAutoInfinite] = useState(false)
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

    const autoRunning = useRef(false)
    const autoLeft = useRef(0)
    const autoBaseBet = useRef(initialBet)
    const sessionProfit = useRef(0)

    const half = useCallback(() => setBetAmount(v => Math.max(minBet, Number((v / 2).toFixed(2)))), [minBet])
    const double = useCallback(() => setBetAmount(v => Math.min(maxBet, Number((v * 2).toFixed(2)))), [maxBet])
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
        if (onStop) onStop()
    }, [onStop])

    const handlePlay = useCallback(async () => {
        if (playPhase === 'in-round') {
            if (onPlayPhaseAction) await onPlayPhaseAction()
            return
        }
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
        let currentBet = effectiveBetAmount
        const limitProfit = Number(stopProfit)
        const limitLoss = Number(stopLoss)
        const limitBigWin = Number(stopBigWin)
        while (autoRunning.current && autoLeft.current > 0) {
            // safety: stop if balance can't cover bet
            if ((balance || 0) < currentBet) {
                stopAuto()
                break
            }
            // QA v4: race the round against a timeout so a stuck game
            // can't hang the autoplay loop. The game's own state should
            // recover on its next render; we just unblock the loop.
            const raced = await withTimeout(
                Promise.resolve(onPlay({ betAmount: currentBet, mode: 'auto' })),
                autoTimeoutMs,
            )
            if (raced.timedOut) {
                // eslint-disable-next-line no-console
                console.warn('[BetPanel] autoplay round timed out after', autoTimeoutMs, 'ms')
                stopAuto()
                break
            }
            const result = raced.value || {}
            const profit = Number(result?.profit) || 0
            sessionProfit.current += profit
            // stop conditions
            if (Number.isFinite(limitProfit) && limitProfit > 0 && sessionProfit.current >= limitProfit) { stopAuto(); break }
            if (Number.isFinite(limitLoss) && limitLoss > 0 && sessionProfit.current <= -limitLoss) { stopAuto(); break }
            if (Number.isFinite(limitBigWin) && limitBigWin > 0 && profit >= limitBigWin) { stopAuto(); break }
            // bet adjust
            if (profit > 0) {
                if (onWinReset) currentBet = autoBaseBet.current
                else if (onWinPct) currentBet = Math.max(minBet, Number((currentBet * (1 + onWinPct / 100)).toFixed(2)))
            } else if (profit < 0) {
                if (onLossReset) currentBet = autoBaseBet.current
                else if (onLossPct) currentBet = Math.max(minBet, Number((currentBet * (1 + onLossPct / 100)).toFixed(2)))
            }
            currentBet = Math.min(maxBet, currentBet)
            if (autoLeft.current !== Infinity) autoLeft.current -= 1
            // Configurable cadence between rounds. Plinko uses 500 so balls
            // drop in a continuous shower. Default 120 keeps every other game
            // feeling snappy.
            await new Promise(res => setTimeout(res, autoIntervalMs))
        }
        autoRunning.current = false
    }, [tab, onPlay, effectiveBetAmount, autoInfinite, autoCount, stopProfit, stopLoss, stopBigWin, onWinPct, onWinReset, onLossPct, onLossReset, balance, maxBet, minBet, strategy, stopAuto, playPhase, onPlayPhaseAction, autoIntervalMs, autoTimeoutMs])

    useEffect(() => () => { autoRunning.current = false }, [])

    // Keyboard shortcuts. Disabled when typing in any input/textarea, when modifiers
    // (ctrl/cmd/alt) are held, and when an auto round is in progress to keep things safe.
    useEffect(() => {
        const onKey = (e) => {
            if (e.ctrlKey || e.metaKey || e.altKey) return
            const tag = (e.target?.tagName || '').toLowerCase()
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return
            if (e.target?.isContentEditable) return
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

    return (
        <div className="bp-panel">
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
                <div className="bp-bet-row">
                    <input id={`${panelId}-bet-amount`} type="number" className="bp-bet-input" min={minBet} max={maxBet} step={0.5}
                        value={effectiveBetAmount}
                        disabled={hasFixedBet}
                        onChange={e => setBetAmount(Math.max(minBet, Number(e.target.value) || 0))}
                    />
                    <button className="bp-bet-btn" onClick={half} disabled={hasFixedBet}>½</button>
                    <button className="bp-bet-btn" onClick={double} disabled={hasFixedBet}>2×</button>
                    <button className="bp-bet-btn" onClick={max} disabled={hasFixedBet}>Max</button>
                </div>
                <div className="bp-quick-actions">
                    <button onClick={min} disabled={hasFixedBet}>Min</button>
                    <button onClick={() => setBetAmount(initialBet)} disabled={hasFixedBet}>Reset</button>
                    <button onClick={rebet} disabled={hasFixedBet || !lastBet}><RotateCcw size={11} style={{ marginRight: 3 }} />Rebet</button>
                </div>
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
                disabled={runningRound && !isAutoLive && !inRound}
                onClick={handlePlay}
                {...playButtonProps}
            >
                {isAutoLive ? <><Pause size={16} /> Stop Autobet</> : <><Play size={16} /> {playButtonLabel}</>}
            </button>
            {afterPlayChildren}
        </div>
    )
}
