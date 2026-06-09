import { useEffect, useMemo, useRef, useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { useSfx } from '../../../audio/useSfx'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits } from '../../../utils/simulationMath'
import { nextRoll } from '../../../utils/fairRng'
import { useScrollActionIntoView } from '../../../hooks/useScrollActionIntoView'
import { BetPanel, BigWinOverlay, CoreStageFrame, GameShell, HistoryDrawer, RecentResultsStrip, StatsOverlay, useGameSession } from '../primitives'
import { BOARD_NUMBERS, WHEEL_ORDER, buildRouletteCoverage, colorOf, makeBet } from './layout'
import EducationPanel from '../../EducationPanel'
import './roulette.css'
import { useGameBgm } from '../../../audio/useBgm'

const CHIP_VALUES = [1, 5, 25, 100, 500]
const SIM_NAMES = ['Kira', 'Reno', 'Mika', 'Jules', 'Vex', 'Nia', 'Sable', 'Ozzy', 'Tess', 'Rune']
const BETTING_OPEN_MS = 6000

const SPIN_PHASE_LABELS = {
    idle: 'Ready',
    betting: 'Betting open',
    launch: 'Launch',
    rolling: 'Rolling',
    drop: 'Ball drop',
    settled: 'Settled',
}

function makeSimPlayers(number = null) {
    return Array.from({ length: 8 }, (_, i) => {
        const bet = [1, 5, 10, 25, 50][Math.floor(Math.random() * 5)]
        const pickType = Math.random()
        const type = pickType < 0.5 ? 'color' : pickType < 0.75 ? 'dozen' : 'straight'
        const colorPick = Math.random() < 0.5 ? 'red' : 'black'
        const straight = Math.floor(Math.random() * 37)
        const label = type === 'color' ? colorPick : type === 'dozen' ? `${1 + Math.floor(Math.random() * 3)}st 12`.replace('1st', '1st').replace('2st', '2nd').replace('3st', '3rd') : `${straight}`
        const won = number === null ? null : type === 'color' ? colorOf(number) === colorPick : type === 'dozen' ? number > 0 && Math.ceil(number / 12) === Number(label[0]) : number === straight
        const payout = won ? bet * (type === 'straight' ? 35 : type === 'dozen' ? 3 : 2) : 0
        return {
            id: `${i}-${Math.random().toString(16).slice(2, 6)}`,
            name: SIM_NAMES[(i + Math.floor(Math.random() * SIM_NAMES.length)) % SIM_NAMES.length],
            bet,
            label,
            won,
            payout,
        }
    })
}

// Bet type ids: stored as { id, type, params, amount }
function bestBetForCell(numbers, amount, type, params) {
    return { id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, type, params, amount }
}

function betLabel(type, params = {}) {
    if (type === 'straight') return `Number ${params.n}`
    if (type === 'dozen1') return '1st 12'
    if (type === 'dozen2') return '2nd 12'
    if (type === 'dozen3') return '3rd 12'
    if (type === 'col1') return 'Column 1'
    if (type === 'col2') return 'Column 2'
    if (type === 'col3') return 'Column 3'
    if (type === 'low') return '1-18'
    if (type === 'high') return '19-36'
    if (type === 'zeroNeighbours') return 'Zero Neighbours'
    if (type === 'tier') return 'Tier'
    if (type === 'voisins') return 'Voisins'
    if (type === 'orphelins') return 'Orphelins'
    return type.charAt(0).toUpperCase() + type.slice(1)
}

export default function RouletteGame() {
    useGameBgm('roulette', 'idle')
    const definition = findGameDefinition('roulette')
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const sfx = useSfx('roulette')
    const session = useGameSession('roulette')

    const [chip, setChip] = useState(5)
    const [bets, setBets] = useState([]) // [{ id, type, params, amount }]
    const [result, setResult] = useState(null)
    const [spinning, setSpinning] = useState(false)
    const [spinPhase, setSpinPhase] = useState('idle')
    const [wheelRotation, setWheelRotation] = useState(0)
    const [ballRotation, setBallRotation] = useState(0)
    const [ballRadius, setBallRadius] = useState('46%')
    const [bettingMs, setBettingMs] = useState(0)
    const bettingTickRef = useRef(null)
    const wheelAreaRef = useRef(null)
    const [history, setHistory] = useState([])
    const [lastWon, setLastWon] = useState(null)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [simPlayers, setSimPlayers] = useState(() => makeSimPlayers())
    // Snapshot of last placed chips, kept across spins for Rebet + Auto re-bet.
    const [lastChips, setLastChips] = useState([])
    const [lastTotal, setLastTotal] = useState(null)

    const roundLocked = spinning || bettingMs > 0
    const totalStake = bets.reduce((sum, b) => sum + b.amount, 0)

    // When the wheel starts spinning, bring the wheel/result area into view so
    // mobile players see the spin and the landed number instead of it firing
    // far below the betting board. Same class as the Poker action-bar fix.
    useScrollActionIntoView(wheelAreaRef, spinning, [spinning], { block: 'nearest' })

    const addBet = (type, params = {}) => {
        if (roundLocked) return
        if (chip <= 0) return
        setBets(prev => [...prev, bestBetForCell(makeBet(type, params).numbers, chip, type, params)])
        sfx.play('chip', { volume: type === 'straight' ? 0.42 : 0.56 })
    }

    const undo = () => {
        sfx.play('click', { volume: 0.28 })
        setBets(prev => prev.slice(0, -1))
    }
    const clear = () => {
        sfx.play('click', { volume: 0.28 })
        setBets([])
    }

    const restoreLastChips = () => {
        if (!lastChips.length) {
            showToast('error', 'No previous bets', 'Place chips to seed Rebet')
            return
        }
        sfx.play('chip', { volume: 0.5 })
        setBets(lastChips.map(b => ({ ...b, id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}` })))
    }

    const performPlay = ({ mode } = {}) => new Promise(resolve => {
        // If auto-loop or rebet fired without chips on the felt, restore the last snapshot.
        let activeBets = bets
        if (!activeBets.length && lastChips.length && (mode === 'auto' || mode === 'manual')) {
            activeBets = lastChips.map(b => ({ ...b, id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}` }))
            setBets(activeBets)
        }
        if (!activeBets.length) {
            showToast('error', 'No bets', 'Place at least one chip on the board')
            resolve({ profit: 0 })
            return
        }
        const stake = activeBets.reduce((sum, b) => sum + b.amount, 0)
        if (!placeBet(stake, 'Roulette')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(stake)}`)
            resolve({ profit: 0 })
            return
        }
        // Snapshot for Rebet/Auto.
        setLastChips(activeBets.map(b => ({ type: b.type, params: b.params, amount: b.amount })))
        setLastTotal(stake)
        playSound('tick')
        sfx.play('click', { volume: 0.35 })

        // Pre-roll: simulated bettors are populated immediately so the
        // table feels live during the betting countdown. The actual wheel
        // result is rolled now (RNG is fair) but the spin animation only
        // begins after the 6s betting countdown elapses.
        const { roll: r } = nextRoll('roulette')
        const number = Math.floor(r * 37)
        setSimPlayers(makeSimPlayers(number))

        // Begin spin animation.
        const beginSpin = () => {
            setSpinning(true)
            setSpinPhase('launch')
            sfx.play('spin', { volume: 0.52 })
            const idx = WHEEL_ORDER.indexOf(number)
            const segAngle = 360 / 37
            const targetAngle = 360 - idx * segAngle
            const reducedMotion = Boolean(
                window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
                || document.documentElement.classList.contains('gampo-reduce-motion'),
            )
            const spinMs = reducedMotion ? 120 : 3200
            setBallRadius('46%')
            setWheelRotation(prev => prev + 360 * 6 + 96)
            setBallRotation(prev => prev - 360 * 9 + targetAngle + 4)
            window.setTimeout(() => {
                setSpinPhase('rolling')
                sfx.play('tick', { volume: 0.38 })
            }, reducedMotion ? 20 : 160)
            window.setTimeout(() => {
                setSpinPhase('drop')
                setBallRadius('28%')
                sfx.play('tick', { volume: 0.58 })
            }, reducedMotion ? 40 : 1500)
            window.setTimeout(() => {
                // settle
                let totalReturn = 0
                for (const bet of activeBets) {
                    const m = makeBet(bet.type, bet.params)
                    if (m.numbers.includes(number)) totalReturn += bet.amount * m.payout
                }
                const profit = totalReturn - stake
                if (totalReturn > 0) addWinnings(totalReturn, 'Roulette return')
                const effectiveMult = stake > 0 ? totalReturn / stake : 0
                setResult(number)
                setLastWon(profit > 0)
                setSpinning(false)
                setSpinPhase('settled')
                sfx.play('land', { volume: 0.78 })
                setHistory(prev => [number, ...prev].slice(0, 18))
                if (effectiveMult >= 5) {
                    playSound('bigwin')
                    setBigWin({ trigger: Date.now(), profit, multiplier: effectiveMult })
                } else {
                    playSound(profit > 0 ? 'win' : 'loss')
                }
                sfx.play(profit > 0 ? 'win' : 'lose', { volume: profit > 0 ? 0.72 : 0.5 })
                session.record({
                    id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
                    label: `${number} ${colorOf(number)}`,
                    profit, betAmount: stake,
                    meta: { number, color: colorOf(number), legs: activeBets.length },
                })
                showToast(profit >= 0 ? 'win' : 'loss', `Roulette ${number}`, `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
                setBets([]) // clear placed bets after spin; lastChips snapshot keeps Auto/Rebet alive
                window.setTimeout(() => setSpinPhase('idle'), 900)
                resolve({ profit })
            }, spinMs)
        }

        // Trigger 6s betting open countdown if mode is manual; auto-loop
        // skips the countdown to keep the loop tight.
        if (mode === 'auto') {
            beginSpin()
        } else {
            setBettingMs(BETTING_OPEN_MS)
            setSpinPhase('betting')
            const start = performance.now()
            const beat = () => {
                const remaining = Math.max(0, BETTING_OPEN_MS - (performance.now() - start))
                setBettingMs(remaining)
                if (remaining <= 0) {
                    setBettingMs(0)
                    beginSpin()
                    return
                }
                bettingTickRef.current = window.requestAnimationFrame(beat)
            }
            bettingTickRef.current = window.requestAnimationFrame(beat)
        }
    })

    const meta = result === null ? null : { color: colorOf(result) }
    const recentProfit = session.history.slice(0, 12).reduce((s, i) => s + (i.profit || 0), 0)

    const betTotal = (type, params = {}) => bets
        .filter(b => b.type === type && JSON.stringify(b.params) === JSON.stringify(params))
        .reduce((s, b) => s + b.amount, 0)

    const coverageMap = useMemo(() => buildRouletteCoverage(bets), [bets])
    const cellBet = (n) => coverageMap.get(n)?.straightAmount || 0
    const cellCoverage = (n) => coverageMap.get(n)
    const cellCoverLabel = (coverage) => (coverage?.bets || [])
        .filter(b => !b.isStraight)
        .map(b => `${betLabel(b.type, b.params)} ${formatCredits(b.amount)}`)
        .join(', ')
    const groupedBets = useMemo(() => {
        const map = new Map()
        for (const bet of bets) {
            const key = `${bet.type}:${JSON.stringify(bet.params || {})}`
            const current = map.get(key) || {
                label: betLabel(bet.type, bet.params),
                amount: 0,
                count: 0,
                payout: makeBet(bet.type, bet.params).payout,
            }
            current.amount += bet.amount
            current.count += 1
            map.set(key, current)
        }
        return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, 6)
    }, [bets])
    const resultText = result === null
        ? (bettingMs > 0 ? 'Bets closing' : 'Ready')
        : `${result} ${colorOf(result)}`
    const spinPhaseText = SPIN_PHASE_LABELS[spinPhase] || resultText
    const cellClassName = (n, extra = '') => {
        const coverage = cellCoverage(n)
        return [
            'rou-cell',
            extra,
            colorOf(n),
            cellBet(n) ? 'has-bet' : '',
            coverage?.coverCount ? 'covered-bet' : '',
            result === n ? 'winner' : '',
        ].filter(Boolean).join(' ')
    }
    const cellTitle = (n) => {
        const coverage = cellCoverage(n)
        const labels = cellCoverLabel(coverage)
        const pieces = [`Number ${n}`]
        if (coverage?.straightAmount) pieces.push(`Straight ${formatCredits(coverage.straightAmount)}`)
        if (labels) pieces.push(`Covered by ${labels}`)
        return pieces.join(' · ')
    }

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#9f252a"
            backdrop="/assets/games/roulette/roulette-felt.png"
            panel={
                <BetPanel
                    balance={balance}
                    initialBet={5}
                    runningRound={roundLocked}
                    actionLabel={`Spin (${formatCredits(totalStake)} on ${bets.length} bets)`}
                    mobilePlayLabel="Spin"
                    onPlay={performPlay}
                    disableAuto={false}
                    lastBet={lastTotal}
                >
                    <div className="bp-section">
                        <label className="bp-label">Chip Value</label>
                        <div className="rou-controls">
                            {CHIP_VALUES.map(v => (
                                <button key={v} className={`rou-chip ${chip === v ? 'active' : ''}`} onClick={() => setChip(v)}>{v}</button>
                            ))}
                        </div>
                    </div>
                    <div className="bp-row">
                        <button className="rou-undo" onClick={undo} disabled={!bets.length}>Undo</button>
                        <button className="rou-clear" onClick={clear} disabled={!bets.length}>Clear</button>
                        <button className="rou-undo" onClick={restoreLastChips} disabled={!lastChips.length}>Repeat</button>
                    </div>
                    <div className="rou-summary">
                        <span>Total: <strong>{formatCredits(totalStake)}</strong></span>
                        <span>Legs: <strong>{bets.length}</strong></span>
                    </div>
                    {!bets.length && (
                        <div className="rou-empty-hint">
                            Pick a chip, tap the felt, then spin.
                        </div>
                    )}
                </BetPanel>
            }
            aside={
                <>
                    <StatsOverlay stats={session.stats} definition={definition} />
                    <HistoryDrawer history={session.history} onClear={session.clear} />
                </>
            }
        >
            <CoreStageFrame minHeight={520} maxWidth={1040} mobileScrollable className="roulette-stage-frame">
            <div className={`roulette-stage spin-phase-${spinPhase} ${lastWon === true ? 'win-flash' : lastWon === false ? 'loss-flash' : ''}`}>
                <RecentResultsStrip results={session.stats.lastResults} />
                <div className={`rou-state-card ${meta?.color || 'idle'}`}>
                    <div>
                        <span>Wheel state</span>
                        <strong>{roundLocked || spinPhase !== 'idle' ? spinPhaseText : resultText}</strong>
                    </div>
                    <div>
                        <span>Ticket</span>
                        <strong>{bets.length ? `${formatCredits(totalStake)} on ${bets.length} leg${bets.length === 1 ? '' : 's'}` : 'No active chips'}</strong>
                    </div>
                    <div>
                        <span>Last result</span>
                        <strong>{result === null ? '—' : `${result} ${colorOf(result)}`}</strong>
                    </div>
                </div>
                <a className="rou-bet-jump" href="#roulette-bet-board" aria-label="Jump to the roulette betting table">
                    <span>Place your bets</span>
                    <strong>Tap the felt ↓</strong>
                </a>
                <div className="rou-top-deck">
                    <div className={`rou-wheel-area spin-phase-${spinPhase}`} ref={wheelAreaRef} style={{ '--ball-radius': ballRadius }}>
                        <div
                            className={`rou-wheel ${spinning ? 'is-spinning' : 'is-idle'}`}
                            style={spinning
                                ? { transform: `rotate(${wheelRotation}deg)`, transition: 'transform 3.2s cubic-bezier(0.08, 0.72, 0.12, 1)' }
                                : {
                                    '--rou-idle-start': `${wheelRotation}deg`,
                                    '--rou-idle-end': `${wheelRotation + 360}deg`,
                                }}
                        >
                            <img className="rou-wheel-texture" src="/images/generated/roulette-wheel-premium.png" alt="" />
                            <div className="rou-pocket-ring">
                                {WHEEL_ORDER.map((n, i) => {
                                    const angle = i * (360 / 37)
                                    return (
                                        <span key={n} className={`rou-seg ${colorOf(n)} ${result === n ? 'winner' : ''}`} style={{ transform: `rotate(${angle}deg) translateY(-44%) rotate(${-angle}deg)` }}>{n}</span>
                                    )
                                })}
                            </div>
                            <div className="rou-spindle" />
                        </div>
                        <div className={`rou-ball-track spin-phase-${spinPhase}`} style={{ transform: `rotate(${ballRotation}deg)` }}>
                            <span className={`rou-ball ${spinning ? 'spinning' : ''} spin-phase-${spinPhase}`} />
                        </div>
                        <div className={`rou-num-pop ${meta?.color || ''} ${result === null ? 'idle' : ''}`}>
                            {result === null ? <span aria-hidden="true">⟳</span> : result}
                        </div>
                    </div>
                    <div className="rou-recent-rail-col">
                        <div className="rou-live-head"><span>Recent spins</span><strong>{spinning ? spinPhaseText : bettingMs > 0 ? `Betting ${(bettingMs / 1000).toFixed(1)}s` : result === null ? 'Open' : `${result} ${colorOf(result)}`}</strong></div>
                        <div className="rou-recent-rail">
                            {history.length === 0 ? <span className="sim-muted">No spins yet</span> : history.map((n, i) => (
                                <span key={i} className={`rou-history-pill ${colorOf(n)}`}>{n}</span>
                            ))}
                        </div>
                        {bettingMs > 0 && (
                            <div className="rou-bet-banner">
                                <span>BETTING OPEN</span>
                                <strong>{(bettingMs / 1000).toFixed(1)}s</strong>
                            </div>
                        )}
                    </div>
                    <div className="rou-feed-col">
                        <div className="rou-live-head"><span>Live table</span><strong>{simPlayers.length} bettors</strong></div>
                        <ul className="rou-player-feed" aria-label="Simulated roulette players">
                            {simPlayers.map(p => (
                                <li key={p.id} className={p.won === null ? 'pending' : p.won ? 'won' : 'lost'}>
                                    <span title={p.name}>{p.name}</span>
                                    <em title={p.label}>{p.label}</em>
                                    <strong title={p.won === null ? `${p.bet} GC` : p.won ? `+${p.payout.toFixed(2)} GC` : `-${p.bet} GC`}>
                                        {p.won === null ? `${p.bet} GC` : p.won ? `+${p.payout.toFixed(2)}` : `-${p.bet}`}
                                    </strong>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                <div className="rou-ticket-strip" aria-label="Current roulette bet slip">
                    <div className="rou-ticket-head">
                        <span>Bet slip</span>
                        <strong>{formatCredits(totalStake)}</strong>
                    </div>
                    <div className="rou-ticket-list">
                        {groupedBets.length === 0 ? (
                            <span className="rou-ticket-empty">Tap a number, outside group, or racetrack sector.</span>
                        ) : groupedBets.map(item => (
                            <span key={item.label} className="rou-ticket-chip">
                                <b>{item.label}</b>
                                <em>{formatCredits(item.amount)} · {item.payout.toFixed(2)}x</em>
                            </span>
                        ))}
                    </div>
                </div>

                <div className="rou-board" id="roulette-bet-board" aria-label="Roulette betting table" data-mobile-critical-surface>
                    <div className={cellClassName(0, 'zero')} data-bet={cellBet(0) || ''}
                        data-cover={cellCoverage(0)?.coverCount || ''}
                        data-cover-label={cellCoverLabel(cellCoverage(0))}
                        title={cellTitle(0)}
                        onClick={() => addBet('straight', { n: 0 })}
                        data-has={cellBet(0) ? 'yes' : ''}
                    >0</div>
                    <div className="rou-bottom">
                        {[0, 1, 2].map(rowIdx => (
                            BOARD_NUMBERS[rowIdx].map(n => (
                                <div key={n}
                                    className={cellClassName(n)}
                                    data-bet={cellBet(n) || ''}
                                    data-cover={cellCoverage(n)?.coverCount || ''}
                                    data-cover-label={cellCoverLabel(cellCoverage(n))}
                                    title={cellTitle(n)}
                                    onClick={() => addBet('straight', { n })}
                                >{n}</div>
                            ))
                        ))}
                    </div>
                </div>

                <details className="rou-advanced" open>
                    <summary>Advanced bets</summary>
                    <div className="rou-extra-row">
                        {[
                            { type: 'dozen1', label: '1st 12' },
                            { type: 'dozen2', label: '2nd 12' },
                            { type: 'dozen3', label: '3rd 12' },
                            { type: 'col1', label: 'Col 1' },
                            { type: 'col2', label: 'Col 2' },
                            { type: 'col3', label: 'Col 3' },
                        ].map(row => (
                            <div key={row.type}
                                className={`rou-extra-cell ${betTotal(row.type) ? 'has-bet' : ''}`}
                                onClick={() => addBet(row.type)}
                            >{row.label}{betTotal(row.type) ? ` · ${formatCredits(betTotal(row.type))}` : ''}</div>
                        ))}
                    </div>
                    <div className="rou-extra-row">
                        {[
                            { type: 'low', label: '1-18' },
                            { type: 'even', label: 'Even' },
                            { type: 'red', label: 'Red' },
                            { type: 'black', label: 'Black' },
                            { type: 'odd', label: 'Odd' },
                            { type: 'high', label: '19-36' },
                        ].map(row => (
                            <div key={row.type}
                                className={`rou-extra-cell ${betTotal(row.type) ? 'has-bet' : ''}`}
                                onClick={() => addBet(row.type)}
                            >{row.label}{betTotal(row.type) ? ` · ${formatCredits(betTotal(row.type))}` : ''}</div>
                        ))}
                    </div>
                    <div className="rou-racetrack">
                        {[
                            { type: 'voisins', label: 'Voisins 17' },
                            { type: 'tier', label: 'Tier 12' },
                            { type: 'orphelins', label: 'Orphelins 8' },
                            { type: 'zeroNeighbours', label: 'Zero 7' },
                        ].map(row => (
                            <div key={row.type}
                                className={`rou-track-cell ${betTotal(row.type) ? 'has-bet' : ''}`}
                                onClick={() => addBet(row.type)}
                            >{row.label}{betTotal(row.type) ? ` · ${formatCredits(betTotal(row.type))}` : ''}</div>
                        ))}
                    </div>
                </details>
            </div>
            </CoreStageFrame>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={5} />
            <EducationPanel definition={definition} betAmount={chip} winProbability={18 / 37} payoutMultiplier={2} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
