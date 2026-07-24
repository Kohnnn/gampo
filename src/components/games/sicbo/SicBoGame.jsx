import { useRef, useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits } from '../../../utils/simulationMath'
import { nextRoll } from '../../../utils/fairRng'
import { useCancellableTimeouts } from '../../../utils/scheduling'
import { useScrollActionIntoView } from '../../../hooks/useScrollActionIntoView'
import { useSfx } from '../../../audio/useSfx'
import { getBigWinThreshold, BetPanel, BigWinOverlay, CoreStageFrame, GameShell, HistoryDrawer, RecentResultsStrip, StatsOverlay, useGameSession, ResultToast, ActionLockOverlay } from '../primitives'
import { Particles } from '../../fx'
import { evaluate, rollDice } from './bets'
import SicBoDie from './SicBoDie'
import EducationPanel from '../../EducationPanel'
import './SicBoDie.css'
import './sicbo.css'
import { useGameBgm } from '../../../audio/useBgm'

export const canAddSicBoBet = (running, totalStake, chip, balance) => !running && Number.isInteger(balance) && totalStake + chip <= balance

export default function SicBoGame() {
    useGameBgm('sicbo', 'idle')
    const definition = findGameDefinition('sicbo')
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const sfx = useSfx('sicbo')
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
    const [toast, setToast] = useState(null)
    const { schedule, cancelAll } = useCancellableTimeouts()
    const stageRef = useRef(null)

    // When the dice roll starts, bring the dice/result stage into view so mobile
    // players see the shake + reveal instead of it firing below the bet board.
    useScrollActionIntoView(stageRef, running, [running], { block: 'nearest' })

    const totalStake = Object.values(bets).reduce((s, v) => s + v, 0)
    const addBet = (key) => {
        if (!canAddSicBoBet(running, totalStake, chip, balance)) return
        setBets(prev => ({ ...prev, [key]: (prev[key] || 0) + chip }))
    }
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
        setToast(null)
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
                    sfx.play('win')
                    setBigWin({ trigger: Date.now(), profit, multiplier: effectiveMult })
                } else {
                    playSound(profit > 0 ? 'win' : 'loss')
                    if (profit > 0) sfx.play('win'); else sfx.play('lose')
                }
                setToast({
                    kind: profit > 0 ? 'win' : profit === 0 ? 'push' : 'lose',
                    multiplier: effectiveMult > 0 ? effectiveMult : null,
                    amount: profit,
                    message: `Rolled ${next.join('+')} = ${next.reduce((a, b) => a + b, 0)}`,
                })
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
                    mobilePlayLabel={totalStake > 0 ? `Roll ${formatCredits(totalStake)}` : 'Roll'}
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
            <CoreStageFrame minHeight={560} maxWidth={900} mobileScrollable className="sicbo-stage-frame">
            <div ref={stageRef} className={`sb-stage ${lastWon === true ? 'win-flash' : lastWon === false ? 'loss-flash' : ''}`} data-mobile-scroll-surface>
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
                <ActionLockOverlay active={running} label="Rolling..." />
                <ResultToast result={toast} onDismiss={() => setToast(null)} />

                <div className="sb-board" data-mobile-critical-surface>
                    <div className="sb-row-label">Even-money / Odd-Even / Big-Small</div>
                    <div className="sb-row even-money">
                        {[
                            { key: 'small', label: 'Small (4–10) 2×' },
                            { key: 'big', label: 'Big (11–17) 2×' },
                            { key: 'odd', label: 'Odd 2×' },
                            { key: 'even', label: 'Even 2×' },
                        ].map(b => {
                            const selected = cellOn(b.key)
                            const canAddBet = canAddSicBoBet(running, totalStake, chip, balance)
                            return <button key={b.key} type="button" className={`sb-cell ${selected ? 'has-bet' : ''}`} aria-pressed={selected} disabled={!canAddBet} onClick={() => addBet(b.key)}>{b.label}{selected ? ` · ${formatCredits(bets[b.key])}` : ''}</button>
                        })}
                    </div>

                    <div className="sb-row-label">Three-Dice Total</div>
                    <div className="sb-row totals">
                        {[4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map(t => {
                            const key = `total-${t}`
                            const selected = cellOn(key)
                            const canAddBet = canAddSicBoBet(running, totalStake, chip, balance)
                            return <button key={t} type="button" className={`sb-cell ${selected ? 'has-bet' : ''}`} aria-label={selected ? undefined : `Total ${t} wager`} aria-pressed={selected} disabled={!canAddBet} onClick={() => addBet(key)}>
                                {t}
                                {selected && <span className="sb-payout">{formatCredits(bets[key])}</span>}
                            </button>
                        })}
                    </div>

                    <div className="sb-row-label">Single Dice <small>· pays 2× for 1, 3× for 2, 4× for 3 of a kind</small></div>
                    <div className="sb-row singles">
                        {[1, 2, 3, 4, 5, 6].map(n => {
                            const key = `single-${n}`
                            const selected = cellOn(key)
                            const canAddBet = canAddSicBoBet(running, totalStake, chip, balance)
                            return <button key={n} type="button" className={`sb-cell ${selected ? 'has-bet' : ''}`} aria-label={selected ? undefined : `Single dice ${n} wager`} aria-pressed={selected} disabled={!canAddBet} onClick={() => addBet(key)} title="Pays 2×/3×/4× for 1, 2, or 3 of this number">
                                {n}
                                {selected && <span className="sb-payout">{formatCredits(bets[key])}</span>}
                            </button>
                        })}
                    </div>

                    <div className="sb-row-label">Specific Pair (11×)</div>
                    <div className="sb-row pairs">
                        {[1, 2, 3, 4, 5, 6].map(n => {
                            const key = `pair-${n}`
                            const selected = cellOn(key)
                            const canAddBet = canAddSicBoBet(running, totalStake, chip, balance)
                            return <button key={n} type="button" className={`sb-cell ${selected ? 'has-bet' : ''}`} aria-label={selected ? undefined : `Pair ${n}-${n} wager`} aria-pressed={selected} disabled={!canAddBet} onClick={() => addBet(key)}>
                                {n}-{n}
                                {selected && <span className="sb-payout">{formatCredits(bets[key])}</span>}
                            </button>
                        })}
                    </div>

                    <div className="sb-row-label">Triple</div>
                    <div className="sb-row triples">
                        <button type="button" className={`sb-cell ${cellOn('triple-any') ? 'has-bet' : ''}`} aria-pressed={cellOn('triple-any')} disabled={!canAddSicBoBet(running, totalStake, chip, balance)} onClick={() => addBet('triple-any')}>Any 31×{cellOn('triple-any') && ` · ${formatCredits(bets['triple-any'])}`}</button>
                        {[1, 2, 3, 4, 5, 6].map(n => {
                            const key = `triple-${n}`
                            const selected = cellOn(key)
                            const canAddBet = canAddSicBoBet(running, totalStake, chip, balance)
                            return <button key={n} type="button" className={`sb-cell ${selected ? 'has-bet' : ''}`} aria-label={selected ? undefined : `Triple ${n}-${n}-${n} wager`} aria-pressed={selected} disabled={!canAddBet} onClick={() => addBet(key)}>
                                {n}-{n}-{n}
                                <span className="sb-payout">181×</span>
                                {selected && <span className="sb-payout">{formatCredits(bets[key])}</span>}
                            </button>
                        })}
                    </div>

                    <div className="sb-row-label">Two-Dice Combos (6×)</div>
                    <div className="sb-row combos">
                        {[
                            [1, 2], [1, 3], [1, 4], [1, 5], [1, 6],
                            [2, 3], [2, 4], [2, 5], [2, 6],
                            [3, 4], [3, 5], [3, 6],
                            [4, 5], [4, 6], [5, 6],
                        ].map(([a, b]) => {
                            const key = `combo-${a}-${b}`
                            const selected = cellOn(key)
                            const canAddBet = canAddSicBoBet(running, totalStake, chip, balance)
                            return <button key={`${a}-${b}`} type="button" className={`sb-cell ${selected ? 'has-bet' : ''}`} aria-label={selected ? undefined : `Two-dice combo ${a}-${b} wager`} aria-pressed={selected} disabled={!canAddBet} onClick={() => addBet(key)}>
                                {a}-{b}
                                <span className="sb-payout">6×</span>
                                {selected && <span className="sb-payout">{formatCredits(bets[key])}</span>}
                            </button>
                        })}
                    </div>
                </div>

                {lastWon && burstKey > 0 && <Particles key={burstKey} count={16} color="#ff8f3d" />}
            </div>
            </CoreStageFrame>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={getBigWinThreshold('sicbo')} />
            <EducationPanel definition={definition} betAmount={chip} winProbability={0.486} payoutMultiplier={2} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
