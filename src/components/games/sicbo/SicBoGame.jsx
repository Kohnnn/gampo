import { useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits } from '../../../utils/simulationMath'
import { nextRoll } from '../../../utils/fairRng'
import { useCancellableTimeouts } from '../../../utils/scheduling'
import { BetPanel, BigWinOverlay, GameShell, HistoryDrawer, RecentResultsStrip, StatsOverlay, useGameSession } from '../primitives'
import { Particles } from '../../fx'
import { evaluate, rollDice } from './bets'
import SicBoDie from './SicBoDie'
import EducationPanel from '../../EducationPanel'
import './SicBoDie.css'
import './sicbo.css'
import { useGameBgm } from '../../../audio/useBgm'

export default function SicBoGame() {
    useGameBgm('sicbo', 'idle')
    const definition = findGameDefinition('sicbo')
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const session = useGameSession('sicbo')

    const [chip, setChip] = useState(5)
    const [bets, setBets] = useState({}) // key: 'big', 'total:8', 'single:3', 'pair:5', 'triple:any', 'triple:6', 'combo:1-2'
    const [dice, setDice] = useState([1, 2, 3])
    // QA v4: dice start revealed so the user always sees a real pip face
    // pre-roll instead of "?" placeholders.
    const [revealed, setRevealed] = useState([true, true, true])
    const [shaking, setShaking] = useState(false)
    const [running, setRunning] = useState(false)
    const [lastWon, setLastWon] = useState(null)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [burstKey, setBurstKey] = useState(0)
    const [lastChips, setLastChips] = useState({})
    const [lastTotal, setLastTotal] = useState(null)
    const { schedule, cancelAll } = useCancellableTimeouts()

    const totalStake = Object.values(bets).reduce((s, v) => s + v, 0)
    const addBet = (key) => setBets(prev => ({ ...prev, [key]: (prev[key] || 0) + chip }))
    const clear = () => setBets({})
    const restoreLast = () => {
        if (!Object.keys(lastChips).length) {
            showToast('error', 'No previous bets', 'Place chips to seed Repeat')
            return
        }
        setBets({ ...lastChips })
    }

    const settleBet = (key, d) => {
        if (key === 'big' || key === 'small' || key === 'odd' || key === 'even') return evaluate(d, key)
        if (key === 'triple-any') return evaluate(d, 'any-triple')
        if (key.startsWith('triple-')) return evaluate(d, 'specific-triple', { n: Number(key.split('-')[1]) })
        if (key.startsWith('pair-')) return evaluate(d, 'specific-double', { n: Number(key.split('-')[1]) })
        if (key.startsWith('single-')) return evaluate(d, 'single-dice', { n: Number(key.split('-')[1]) })
        if (key.startsWith('total-')) return evaluate(d, 'total', { t: Number(key.split('-')[1]) })
        if (key.startsWith('combo-')) {
            const [a, b] = key.split('-').slice(1).map(Number)
            return evaluate(d, 'two-dice-combo', { a, b })
        }
        return 0
    }

    const performPlay = ({ mode } = {}) => new Promise(resolve => {
        let activeBets = bets
        let stake = totalStake
        if (stake <= 0 && Object.keys(lastChips).length && (mode === 'auto' || mode === 'manual')) {
            activeBets = { ...lastChips }
            stake = Object.values(activeBets).reduce((s, v) => s + v, 0)
            setBets(activeBets)
        }
        if (stake <= 0) { showToast('error', 'No bets', 'Place chips first'); resolve({ profit: 0 }); return }
        if (!placeBet(stake, 'Sic Bo')) { showToast('error', 'Not enough credits', `Need ${formatCredits(stake)}`); resolve({ profit: 0 }); return }
        cancelAll()
        setLastChips({ ...activeBets })
        setLastTotal(stake)
        playSound('tick')
        setRunning(true)
        setShaking(true)
        setRevealed([false, false, false])
        const next = rollDice(() => nextRoll('sicbo').roll)
        schedule(() => {
            setShaking(false)
            setDice(next)
            playSound('flip')
            setRevealed([true, false, false])
            schedule(() => { playSound('flip'); setRevealed([true, true, false]) }, 250)
            schedule(() => {
                playSound('flip')
                setRevealed([true, true, true])
                let totalReturn = 0
                for (const [k, amount] of Object.entries(activeBets)) {
                    const mult = settleBet(k, next)
                    if (mult) totalReturn += amount * mult
                }
                const profit = totalReturn - stake
                if (totalReturn > 0) addWinnings(totalReturn, 'Sic Bo return')
                const effectiveMult = stake > 0 ? totalReturn / stake : 0
                setLastWon(profit > 0)
                setBurstKey(k => k + 1)
                if (effectiveMult >= 8) {
                    playSound('bigwin')
                    setBigWin({ trigger: Date.now(), profit, multiplier: effectiveMult })
                } else {
                    playSound(profit > 0 ? 'win' : 'loss')
                }
                session.record({
                    id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
                    label: `${next.join('+')}=${next.reduce((a, b) => a + b, 0)}`,
                    profit, betAmount: stake,
                    meta: { dice: next, total: next.reduce((a, b) => a + b, 0) },
                })
                showToast(profit >= 0 ? 'win' : 'loss', `Sic Bo ${next.reduce((a, b) => a + b, 0)}`, `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
                setBets({})
                setRunning(false)
                resolve({ profit })
            }, 520)
        }, 800)
    })

    const recentProfit = session.history.slice(0, 12).reduce((s, i) => s + (i.profit || 0), 0)
    const cellOn = (key) => bets[key] > 0

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#ff8f3d"
            backdrop="/assets/games/backdrops/backdrop-felt-green.png"
            panel={
                <BetPanel
                    balance={balance}
                    initialBet={5}
                    runningRound={running}
                    actionLabel={`Roll Dice (${formatCredits(totalStake)})`}
                    onPlay={performPlay}
                    lastBet={lastTotal}
                >
                    <div className="bp-section">
                        <label className="bp-label">Chip</label>
                        <div className="bp-row">
                            {[1, 5, 25, 100, 500].map(v => (
                                <button key={v} className={`bp-bet-btn ${chip === v ? 'active' : ''}`} onClick={() => setChip(v)}>{v}</button>
                            ))}
                        </div>
                    </div>
                    <div className="bp-row">
                        <button className="bp-bet-btn" onClick={clear} disabled={!totalStake}>Clear</button>
                        <button className="bp-bet-btn" onClick={restoreLast} disabled={!Object.keys(lastChips).length}>Repeat</button>
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
            <div className={`sb-stage ${lastWon === true ? 'win-flash' : lastWon === false ? 'loss-flash' : ''}`}>
                <RecentResultsStrip results={session.stats.lastResults} />
                {shaking ? (
                    <div className="sb-cup-area">
                        <div className="sb-cup shaking">
                            <SicBoDie value={null} revealed={false} />
                            <SicBoDie value={null} revealed={false} />
                            <SicBoDie value={null} revealed={false} />
                        </div>
                    </div>
                ) : (
                    <div className="sb-dice">
                        {dice.map((v, i) => (
                            <SicBoDie
                                key={i}
                                value={v}
                                revealed={revealed[i]}
                                className={revealed[i] && lastWon && bets['triple-any'] ? 'triple-win' : ''}
                            />
                        ))}
                    </div>
                )}
                <div className="sb-total">Total <strong>{dice.reduce((a, b) => a + b, 0)}</strong></div>

                <div className="sb-board" data-mobile-critical-surface>
                    <div className="sb-row-label">Even-money / Odd-Even / Big-Small</div>
                    <div className="sb-row even-money">
                        {[
                            { key: 'small', label: 'Small (4–10) 2×' },
                            { key: 'big', label: 'Big (11–17) 2×' },
                            { key: 'odd', label: 'Odd 2×' },
                            { key: 'even', label: 'Even 2×' },
                        ].map(b => (
                            <div key={b.key} className={`sb-cell ${cellOn(b.key) ? 'has-bet' : ''}`} onClick={() => addBet(b.key)}>{b.label}{cellOn(b.key) ? ` · ${formatCredits(bets[b.key])}` : ''}</div>
                        ))}
                    </div>

                    <div className="sb-row-label">Three-Dice Total</div>
                    <div className="sb-row totals">
                        {[4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map(t => (
                            <div key={t} className={`sb-cell ${cellOn(`total-${t}`) ? 'has-bet' : ''}`} onClick={() => addBet(`total-${t}`)}>
                                {t}
                                {cellOn(`total-${t}`) && <span className="sb-payout">{formatCredits(bets[`total-${t}`])}</span>}
                            </div>
                        ))}
                    </div>

                    <div className="sb-row-label">Single Dice <small>· pays 2× for 1, 3× for 2, 4× for 3 of a kind</small></div>
                    <div className="sb-row singles">
                        {[1, 2, 3, 4, 5, 6].map(n => (
                            <div key={n} className={`sb-cell ${cellOn(`single-${n}`) ? 'has-bet' : ''}`} onClick={() => addBet(`single-${n}`)} title="Pays 2×/3×/4× for 1, 2, or 3 of this number">
                                {n}
                                {cellOn(`single-${n}`) && <span className="sb-payout">{formatCredits(bets[`single-${n}`])}</span>}
                            </div>
                        ))}
                    </div>

                    <div className="sb-row-label">Specific Pair (11×)</div>
                    <div className="sb-row pairs">
                        {[1, 2, 3, 4, 5, 6].map(n => (
                            <div key={n} className={`sb-cell ${cellOn(`pair-${n}`) ? 'has-bet' : ''}`} onClick={() => addBet(`pair-${n}`)}>
                                {n}-{n}
                                {cellOn(`pair-${n}`) && <span className="sb-payout">{formatCredits(bets[`pair-${n}`])}</span>}
                            </div>
                        ))}
                    </div>

                    <div className="sb-row-label">Triple</div>
                    <div className="sb-row triples">
                        <div className={`sb-cell ${cellOn('triple-any') ? 'has-bet' : ''}`} onClick={() => addBet('triple-any')}>Any 31×{cellOn('triple-any') && ` · ${formatCredits(bets['triple-any'])}`}</div>
                        {[1, 2, 3, 4, 5, 6].map(n => (
                            <div key={n} className={`sb-cell ${cellOn(`triple-${n}`) ? 'has-bet' : ''}`} onClick={() => addBet(`triple-${n}`)}>
                                {n}-{n}-{n}
                                <span className="sb-payout">181×</span>
                                {cellOn(`triple-${n}`) && <span className="sb-payout">{formatCredits(bets[`triple-${n}`])}</span>}
                            </div>
                        ))}
                    </div>
                </div>

                {lastWon && burstKey > 0 && <Particles key={burstKey} count={16} color="#ff8f3d" />}
            </div>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={8} />
            <EducationPanel definition={definition} betAmount={chip} winProbability={0.486} payoutMultiplier={2} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
