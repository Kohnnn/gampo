import { useMemo, useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits } from '../../../utils/simulationMath'
import { nextRoll } from '../../../utils/fairRng'
import { BetPanel, GameShell, HistoryDrawer, StatsOverlay, useGameSession } from '../primitives'
import { BOARD_NUMBERS, WHEEL_ORDER, colorOf, makeBet } from './layout'
import EducationPanel from '../../EducationPanel'
import './roulette.css'

const CHIP_VALUES = [1, 5, 25, 100, 500]

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
    const [history, setHistory] = useState([])
    const [lastWon, setLastWon] = useState(null)

    const totalStake = bets.reduce((sum, b) => sum + b.amount, 0)

    const addBet = (type, params = {}) => {
        if (spinning) return
        if (chip <= 0) return
        setBets(prev => [...prev, bestBetForCell(makeBet(type, params).numbers, chip, type, params)])
    }

    const undo = () => setBets(prev => prev.slice(0, -1))
    const clear = () => setBets([])

    const performPlay = () => new Promise(resolve => {
        if (!bets.length) {
            showToast('error', 'No bets', 'Place at least one chip on the board')
            resolve({ profit: 0 })
            return
        }
        if (!placeBet(totalStake, 'Roulette')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(totalStake)}`)
            resolve({ profit: 0 })
            return
        }
        playSound('tick')
        setSpinning(true)
        const { roll: r } = nextRoll('roulette')
        const number = Math.floor(r * 37)
        const idx = WHEEL_ORDER.indexOf(number)
        const segAngle = 360 / 37
        const targetAngle = idx * segAngle
        setWheelRotation(prev => prev + 360 * 5 + targetAngle)
        setBallRotation(prev => prev - 360 * 8 - targetAngle)
        window.setTimeout(() => {
            // settle
            let totalReturn = 0
            for (const bet of bets) {
                const m = makeBet(bet.type, bet.params)
                if (m.numbers.includes(number)) totalReturn += bet.amount * m.payout
            }
            const profit = totalReturn - totalStake
            if (totalReturn > 0) addWinnings(totalReturn, 'Roulette return')
            setResult(number)
            setLastWon(profit > 0)
            setSpinning(false)
            setHistory(prev => [number, ...prev].slice(0, 18))
            playSound(profit > 0 ? 'win' : 'loss')
            session.record({
                id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
                label: `${number} ${colorOf(number)}`,
                profit, betAmount: totalStake,
                meta: { number, color: colorOf(number), legs: bets.length },
            })
            showToast(profit >= 0 ? 'win' : 'loss', `Roulette ${number}`, `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
            setBets([]) // clear placed bets after spin
            resolve({ profit })
        }, 2400)
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
                <div className="rou-wheel-area">
                    <div className="rou-wheel" style={{ transform: `rotate(${wheelRotation}deg)`, transition: spinning ? 'transform 2.3s cubic-bezier(0.16, 1, 0.3, 1)' : 'none' }}>
                        {WHEEL_ORDER.map((n, i) => {
                            const angle = i * (360 / 37)
                            return (
                                <span key={n} className={`rou-seg ${colorOf(n)}`} style={{ transform: `rotate(${angle}deg) translateY(-90px)` }}>{n}</span>
                            )
                        })}
                    </div>
                    <div className="rou-ball-track" style={{ transform: `rotate(${ballRotation}deg)`, transition: spinning ? 'transform 2.3s cubic-bezier(0.16, 1, 0.3, 1)' : 'none' }}>
                        <span className="rou-ball" />
                    </div>
                    <div className={`rou-num-pop ${meta?.color || ''}`}>{result === null ? '--' : result}</div>
                </div>

                <div className="rou-history">
                    {history.length === 0 ? <span className="sim-muted">No history</span> : history.map((n, i) => (
                        <span key={i} className={`rou-history-pill ${colorOf(n)}`}>{n}</span>
                    ))}
                </div>

                <div className="rou-board">
                    <div className="rou-cell zero" data-bet={cellBet(0) || ''}
                        onClick={() => addBet('straight', { n: 0 })}
                        style={cellBet(0) ? {} : {}}
                        data-has={cellBet(0) ? 'yes' : ''}
                    >0</div>
                    <div className="rou-bottom">
                        {[0, 1, 2].map(rowIdx => (
                            BOARD_NUMBERS[rowIdx].map(n => (
                                <div key={n}
                                    className={`rou-cell ${colorOf(n)} ${cellBet(n) ? 'has-bet' : ''}`}
                                    data-bet={cellBet(n) || ''}
                                    onClick={() => addBet('straight', { n })}
                                >{n}</div>
                            ))
                        ))}
                    </div>
                </div>

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
            </div>
            <EducationPanel definition={definition} betAmount={chip} winProbability={18 / 37} payoutMultiplier={2} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
