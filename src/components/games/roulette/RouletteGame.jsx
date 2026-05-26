import { useEffect, useMemo, useRef, useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits } from '../../../utils/simulationMath'
import { nextRoll } from '../../../utils/fairRng'
import { BetPanel, BigWinOverlay, GameShell, HistoryDrawer, RecentResultsStrip, StatsOverlay, useGameSession } from '../primitives'
import { BOARD_NUMBERS, WHEEL_ORDER, colorOf, makeBet } from './layout'
import EducationPanel from '../../EducationPanel'
import './roulette.css'

const CHIP_VALUES = [1, 5, 25, 100, 500]
const SIM_NAMES = ['Kira', 'Reno', 'Mika', 'Jules', 'Vex', 'Nia', 'Sable', 'Ozzy', 'Tess', 'Rune']
const BETTING_OPEN_MS = 6000

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

export default function RouletteGame() {
    const definition = findGameDefinition('roulette')
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const session = useGameSession('roulette')

    const [chip, setChip] = useState(5)
    const [bets, setBets] = useState([]) // [{ id, type, params, amount }]
    const [result, setResult] = useState(null)
    const [spinning, setSpinning] = useState(false)
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

    const totalStake = bets.reduce((sum, b) => sum + b.amount, 0)

    const addBet = (type, params = {}) => {
        if (spinning) return
        if (chip <= 0) return
        setBets(prev => [...prev, bestBetForCell(makeBet(type, params).numbers, chip, type, params)])
    }

    const undo = () => setBets(prev => prev.slice(0, -1))
    const clear = () => setBets([])

    const restoreLastChips = () => {
        if (!lastChips.length) {
            showToast('error', 'No previous bets', 'Place chips to seed Rebet')
            return
        }
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
            const idx = WHEEL_ORDER.indexOf(number)
            const segAngle = 360 / 37
            const targetAngle = 360 - idx * segAngle
            setBallRadius('46%')
            setWheelRotation(prev => prev + 360 * 6 + 96)
            setBallRotation(prev => prev - 360 * 9 + targetAngle + 4)
            window.setTimeout(() => setBallRadius('28%'), 1500)
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
                setHistory(prev => [number, ...prev].slice(0, 18))
                if (effectiveMult >= 5) {
                    playSound('bigwin')
                    setBigWin({ trigger: Date.now(), profit, multiplier: effectiveMult })
                } else {
                    playSound(profit > 0 ? 'win' : 'loss')
                }
                session.record({
                    id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
                    label: `${number} ${colorOf(number)}`,
                    profit, betAmount: stake,
                    meta: { number, color: colorOf(number), legs: activeBets.length },
                })
                showToast(profit >= 0 ? 'win' : 'loss', `Roulette ${number}`, `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
                setBets([]) // clear placed bets after spin; lastChips snapshot keeps Auto/Rebet alive
                resolve({ profit })
            }, 3200)
        }

        // Trigger 6s betting open countdown if mode is manual; auto-loop
        // skips the countdown to keep the loop tight.
        if (mode === 'auto') {
            beginSpin()
        } else {
            setBettingMs(BETTING_OPEN_MS)
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

    const cellBet = (n) => betTotal('straight', { n })

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
                    runningRound={spinning}
                    actionLabel={`Spin (${formatCredits(totalStake)} on ${bets.length} bets)`}
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
                </BetPanel>
            }
            aside={
                <>
                    <StatsOverlay stats={session.stats} definition={definition} />
                    <HistoryDrawer history={session.history} onClear={session.clear} />
                </>
            }
        >
            <div className={`roulette-stage ${lastWon === true ? 'win-flash' : lastWon === false ? 'loss-flash' : ''}`}>
                <RecentResultsStrip results={session.stats.lastResults} />
                <div className="rou-top-deck">
                    <div className="rou-wheel-area" ref={wheelAreaRef} style={{ '--ball-radius': ballRadius }}>
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
                                        <span key={n} className={`rou-seg ${colorOf(n)}`} style={{ transform: `rotate(${angle}deg) translateY(-44%) rotate(${-angle}deg)` }}>{n}</span>
                                    )
                                })}
                            </div>
                            <div className="rou-spindle" />
                        </div>
                        <div className="rou-ball-track" style={{ transform: `rotate(${ballRotation}deg)` }}>
                            <span className={`rou-ball ${spinning ? 'spinning' : ''}`} />
                        </div>
                        <div className={`rou-num-pop ${meta?.color || ''} ${result === null ? 'idle' : ''}`}>
                            {result === null ? <span aria-hidden="true">⟳</span> : result}
                        </div>
                    </div>
                    <div className="rou-recent-rail-col">
                        <div className="rou-live-head"><span>Recent spins</span><strong>{spinning ? 'Rolling' : bettingMs > 0 ? `Betting ${(bettingMs / 1000).toFixed(1)}s` : result === null ? 'Open' : `${result} ${colorOf(result)}`}</strong></div>
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
                                    <span>{p.name}</span>
                                    <em>{p.label}</em>
                                    <strong>{p.won === null ? `${p.bet} GC` : p.won ? `+${p.payout.toFixed(2)}` : `-${p.bet}`}</strong>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                <div className="rou-board" aria-label="Roulette betting table">
                    <div className={`rou-cell zero ${result === 0 ? 'winner' : ''}`} data-bet={cellBet(0) || ''}
                        onClick={() => addBet('straight', { n: 0 })}
                        style={cellBet(0) ? {} : {}}
                        data-has={cellBet(0) ? 'yes' : ''}
                    >0</div>
                    <div className="rou-bottom">
                        {[0, 1, 2].map(rowIdx => (
                            BOARD_NUMBERS[rowIdx].map(n => (
                                <div key={n}
                                    className={`rou-cell ${colorOf(n)} ${cellBet(n) ? 'has-bet' : ''} ${result === n ? 'winner' : ''}`}
                                    data-bet={cellBet(n) || ''}
                                    onClick={() => addBet('straight', { n })}
                                >{n}</div>
                            ))
                        ))}
                    </div>
                </div>

                <details className="rou-advanced">
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
                            { type: 'voisins', label: 'Voisins du Zéro (17 nums)' },
                            { type: 'tier', label: 'Tier (12 nums)' },
                            { type: 'orphelins', label: 'Orphelins (8 nums)' },
                            { type: 'zeroNeighbours', label: 'Zero Neighbours (7)' },
                        ].map(row => (
                            <div key={row.type}
                                className={`rou-track-cell ${betTotal(row.type) ? 'has-bet' : ''}`}
                                onClick={() => addBet(row.type)}
                            >{row.label}{betTotal(row.type) ? ` · ${formatCredits(betTotal(row.type))}` : ''}</div>
                        ))}
                    </div>
                </details>
            </div>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={5} />
            <EducationPanel definition={definition} betAmount={chip} winProbability={18 / 37} payoutMultiplier={2} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
