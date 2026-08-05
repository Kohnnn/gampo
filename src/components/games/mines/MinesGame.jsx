// Stake/Rainbet-style Mines game on the shared shell.
// Player picks how many bombs are on a 5x5 grid, places a bet, then reveals tiles.
// Each safe reveal raises the multiplier; cashing out pays bet × multiplier.
// Hitting a bomb ends the round at -bet. Pure JS, deterministic via fairRng.
//
// Wave 2 retrofit: drives toast/lock/sfx through the round event machine.
// Math is unchanged; events are emitted alongside the existing engine so a
// future deterministic replay can read the round transcript.

import { useCallback, useMemo, useRef, useState } from 'react'
import { useScrollActionIntoView } from '../../../hooks/useScrollActionIntoView'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { useSfx } from '../../../audio/useSfx'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits } from '../../../utils/simulationMath'
import { nextRoll } from '../../../utils/fairRng'
import { useCancellableTimeouts } from '../../../utils/scheduling'
import { getBigWinThreshold,
    BetPanel,
    BigWinOverlay,
    GameShell,
    HistoryDrawer,
    RecentResultsStrip,
    StatsOverlay,
    useGameSession,
    MultiplierBadge,
    ResultToast,
    ActionLockOverlay,
    CoreStageFrame,
    SimBetStrip,
    makeInitialSimBetRows,
    makeSimBetRow,
    prependSimBetRow,
    ROUND_EVENTS,
    useRoundMachine,
} from '../primitives'
import { useOriginalsPreloader } from '../../games/resources/useOriginalsPreloader'
import { Particles } from '../../fx'
import EducationPanel from '../../EducationPanel'
import './mines.css'
import { useGameBgm } from '../../../audio/useBgm'

const GRID = 25
const HOUSE_EDGE = 0.01

// Multiplier after k safe picks given m bombs (no edge); we apply (1 - edge) at output.
function multiplierFor(picks, bombs) {
    if (picks <= 0) return 1
    let m = 1
    for (let i = 0; i < picks; i++) {
        m *= (GRID - i) / (GRID - bombs - i)
    }
    return Number((m * (1 - HOUSE_EDGE)).toFixed(4))
}

function placeBombs(bombs) {
    const cells = Array.from({ length: GRID }, (_, i) => i)
    const out = new Set()
    while (out.size < bombs) {
        const { roll } = nextRoll('mines')
        const idx = Math.floor(roll * cells.length)
        const v = cells.splice(idx, 1)[0]
        if (v != null) out.add(v)
    }
    return out
}

export default function MinesGame() {
    const definition = findGameDefinition('mines') || { name: 'Mines', category: 'Originals' }
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const sfx = useSfx('mines')
    const session = useGameSession('mines')
    const preloader = useOriginalsPreloader('mines')

    const [bombs, setBombs] = useState(3)
    const [phase, setPhase] = useState('idle') // idle | playing | busted | cashed
    const [bombSet, setBombSet] = useState(null)
    const [revealed, setRevealed] = useState([])
    const [stake, setStake] = useState(0)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [burstKey, setBurstKey] = useState(0)
    const [lastBet, setLastBet] = useState(null)
    const [toast, setToast] = useState(null)
    const [autoCashoutPicks, setAutoCashoutPicks] = useState(3)
    const [simFeed, setSimFeed] = useState(() => makeInitialSimBetRows('mines', { bombs: 3, count: 9, cap: 10 }))
    const simSeqRef = useRef(0)
    const stageRef = useRef(null)
    // Bring the mine grid into view when a round starts (mobile reachability).
    useScrollActionIntoView(stageRef, phase === 'playing', [phase], { block: 'nearest' })
    const { schedule, cancelAll } = useCancellableTimeouts()

    // Imperative round machine. Mines emits events as the player interacts
    // (per-pick) rather than a fully pre-baked event list, so we use the
    // machine's `finish` for bust/cashout and start with an empty event list.
    const machine = useRoundMachine({})

    const picks = revealed.length
    const currentMult = useMemo(() => multiplierFor(picks, bombs), [picks, bombs])
    const nextMult = useMemo(() => multiplierFor(picks + 1, bombs), [picks, bombs])
    const inRound = phase === 'playing'
    const minesBgmMode = inRound && currentMult >= 3 ? 'bonus' : 'idle'
    useGameBgm('mines', minesBgmMode)

    const performPlay = ({ betAmount, mode }) => new Promise(resolve => {
        if (inRound) { resolve({ profit: 0 }); return }
        if (!placeBet(betAmount, 'Mines')) { showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`); resolve({ profit: 0 }); return }
        cancelAll()
        setLastBet(betAmount)
        setStake(betAmount)
        const nextBombSet = placeBombs(bombs)
        setBombSet(nextBombSet)
        setRevealed([])
        setPhase('playing')
        setToast(null)
        playSound('click')
        sfx.play('click')
        // Emit round start through the machine. We don't pre-bake a full
        // event list because Mines is per-pick.
        machine.start([
            { index: 0, type: ROUND_EVENTS.ROUND_START, payload: { bombs, betAmount }, at: 0 },
            { index: 1, type: ROUND_EVENTS.INPUT_LOCK, payload: {}, at: 0 },
            { index: 2, type: ROUND_EVENTS.BET_ACCEPTED, payload: { betAmount, bombs }, at: 0 },
        ], { autoFinish: false })
        if (mode === 'auto') {
            const targetPicks = Math.max(1, Math.min(autoCashoutPicks, GRID - bombs))
            const remaining = Array.from({ length: GRID }, (_, i) => i)
            const picked = []
            let hit = null
            for (let i = 0; i < targetPicks; i++) {
                const { roll } = nextRoll('mines-auto')
                const nextIndex = Math.floor(roll * remaining.length)
                const cell = remaining.splice(nextIndex, 1)[0]
                picked.push(cell)
                if (nextBombSet.has(cell)) {
                    hit = cell
                    break
                }
            }
            schedule(() => {
                setRevealed(picked)
                setBurstKey(k => k + 1)
                if (hit !== null) {
                    playSound('explode')
                    sfx.play('lose')
                    session.record({
                        id: crypto.randomUUID(),
                        label: `Auto bust ${picked.length} picks`,
                        profit: -betAmount,
                        betAmount,
                        meta: { bombs, hit, autoCashoutPicks: targetPicks },
                    })
                    showToast('loss', 'Mines auto bust', `-${formatCredits(betAmount)}`)
                    setToast({ kind: 'lose', amount: -betAmount, message: 'Mines auto bust' })
                    machine.finish({ won: false, profit: -betAmount, picks: picked.length, hit })
                    pushSimResult({ bombs, outcome: 'auto-bust' })
                    setPhase('busted')
                    schedule(() => {
                        setPhase('idle')
                        resolve({ profit: -betAmount })
                    }, 420)
                    return
                }
                const m = multiplierFor(picked.length, bombs)
                const profit = betAmount * m - betAmount
                addWinnings(betAmount * m, 'Mines auto return')
                playSound(m >= 5 ? 'bigwin' : 'win')
                sfx.play('cashout')
                session.record({
                    id: crypto.randomUUID(),
                    label: `Auto ${m.toFixed(2)}×`,
                    profit,
                    betAmount,
                    multiplier: m,
                    meta: { bombs, picks: picked.length, autoCashoutPicks: targetPicks },
                })
                showToast('win', 'Mines auto cashout', `+${formatCredits(profit)}`)
                setToast({ kind: 'cashout', amount: profit, multiplier: m, message: 'Mines auto cashout' })
                machine.finish({ won: true, profit, multiplier: m, picks: picked.length })
                pushSimResult({ bombs, outcome: 'auto-cashout' })
                setPhase('cashed')
                schedule(() => {
                    setPhase('idle')
                    resolve({ profit })
                }, 420)
            }, 160)
            return
        }
        resolve({ profit: 0 })
    })

    const pushSimResult = useCallback((context = {}) => {
        simSeqRef.current += 1
        const row = makeSimBetRow('mines', {
            bombs: context.bombs ?? bombs,
            seed: `mines:${simSeqRef.current}:${context.outcome || phase}`,
        })
        setSimFeed(prev => prependSimBetRow(prev, row, 10))
    }, [bombs, phase])

    const reveal = (idx) => {
        if (!inRound || revealed.includes(idx) || !bombSet) return
        if (bombSet.has(idx)) {
            const next = [...revealed, idx]
            setRevealed(next)
            playSound('explode')
            sfx.play('lose')
            setBurstKey(k => k + 1)
            session.record({
                id: crypto.randomUUID(),
                label: `Bust ${next.length} picks`,
                profit: -stake, betAmount: stake,
                meta: { bombs, hit: idx },
            })
            showToast('loss', 'Mines bust', `-${formatCredits(stake)}`)
            setToast({ kind: 'lose', amount: -stake, message: 'Mines bust' })
            machine.finish({ won: false, profit: -stake, picks: next.length, hit: idx })
            pushSimResult({ bombs, outcome: 'bust' })
            setPhase('busted')
            schedule(() => setPhase('idle'), 1100)
            return
        }
        const next = [...revealed, idx]
        setRevealed(next)
        playSound('flip')
        sfx.play('reveal')
        // Sparkle burst on every safe diamond reveal (Phase F game-feel).
        setBurstKey(k => k + 1)
        // If the player has cleared every safe square, auto-cashout.
        if (next.length >= GRID - bombs) cashOut(next)
    }

    const cashOut = useCallback((revealedOverride) => {
        const list = revealedOverride || revealed
        if (!inRound || list.length === 0) return
        const m = multiplierFor(list.length, bombs)
        const profit = stake * m - stake
        addWinnings(stake * m, 'Mines return')
        if (m >= 5) {
            playSound('bigwin')
            setBigWin({ trigger: Date.now(), profit, multiplier: m })
        } else {
            playSound('win')
        }
        sfx.play('cashout')
        setBurstKey(k => k + 1)
        session.record({
            id: crypto.randomUUID(),
            label: `${m.toFixed(2)}× cashout`,
            profit, betAmount: stake, multiplier: m,
            meta: { bombs, picks: list.length },
        })
        showToast('win', 'Mines cashed out', `+${formatCredits(profit)}`)
        setToast({ kind: 'cashout', amount: profit, multiplier: m, message: 'Mines cashed out' })
        machine.finish({ won: true, profit, multiplier: m, picks: list.length })
        pushSimResult({ bombs, outcome: 'cashout' })
        setPhase('cashed')
        schedule(() => setPhase('idle'), 1100)
    }, [revealed, inRound, bombs, stake, addWinnings, playSound, sfx, session, showToast, machine, schedule])

    const recentProfit = session.history.slice(0, 12).reduce((s, i) => s + (i.profit || 0), 0)

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#6db7ff"
            backdrop="/assets/games/backdrops/backdrop-felt-navy.png"
            variant="stake"
            panel={
                <BetPanel
                    balance={balance}
                    initialBet={5}
                    runningRound={false}
                    actionLabel="Place Bet"
                    mobilePlayLabel={inRound && picks > 0 ? `Cash ${currentMult.toFixed(2)}x` : 'Bet'}
                    onPlay={performPlay}
                    autoChildren={
                        <div className="bp-section">
                            <label className="bp-label" htmlFor="mines-auto-cashout">Auto cashout after safe picks</label>
                            <input
                                id="mines-auto-cashout"
                                type="range"
                                min="1"
                                max={Math.max(1, GRID - bombs)}
                                value={Math.min(autoCashoutPicks, GRID - bombs)}
                                onChange={event => setAutoCashoutPicks(Number(event.target.value))}
                                className="dice-slider"
                            />
                            <div className="bp-quick-actions">
                                {[1, 2, 3, 5, 8].filter(value => value <= GRID - bombs).map(value => (
                                    <button key={value} type="button" onClick={() => setAutoCashoutPicks(value)}>{value}</button>
                                ))}
                            </div>
                        </div>
                    }
                    lastBet={lastBet}
                    playPhase={inRound && picks > 0 ? 'in-round' : null}
                    playLabel={inRound && picks > 0 ? `Cashout ${currentMult.toFixed(2)}×` : 'Place Bet'}
                    onPlayPhaseAction={() => cashOut()}
                >
                    <div className="bp-section">
                        <label className="bp-label" htmlFor="mines-bomb-count">Bombs ({bombs})</label>
                        <input id="mines-bomb-count" type="range" min="1" max="24" value={bombs} disabled={inRound} onChange={e => setBombs(Number(e.target.value))} className="dice-slider" />
                        <div className="bp-quick-actions">
                            {[1, 3, 5, 10, 24].map(b => (
                                <button key={b} onClick={() => !inRound && setBombs(b)}>{b}</button>
                            ))}
                        </div>
                    </div>
                    <div className="bp-bal-line">
                        <span>Current</span>
                        <strong>{currentMult.toFixed(2)}×</strong>
                    </div>
                    <div className="bp-bal-line">
                        <span>Next pick</span>
                        <strong>{nextMult.toFixed(2)}×</strong>
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
            <CoreStageFrame minHeight={520} maxWidth={920} loading={!preloader.ready} className="mines-stage-frame">
                <div className={`mines-stage phase-${phase}`}>
                    <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />
                    <SimBetStrip rows={simFeed} title="Sim mines" />
                    <div className="mines-multiplier-row">
                        <MultiplierBadge label="Current" value={currentMult} state={inRound ? 'active' : phase === 'cashed' ? 'win' : phase === 'busted' ? 'bust' : 'idle'} size="sm" />
                        <MultiplierBadge label="Next pick" value={nextMult} size="sm" />
                    </div>
                    <div className="mines-grid" data-mobile-critical-surface ref={stageRef}>
                        {Array.from({ length: GRID }, (_, i) => {
                            const isRevealed = revealed.includes(i)
                            const isBomb = bombSet?.has(i)
                            const showBomb = (phase === 'busted' || phase === 'cashed') && isBomb
                            const isHit = phase === 'busted' && isBomb && revealed[revealed.length - 1] === i
                            const flipped = isRevealed || showBomb
                            return (
                                <button
                                    key={i}
                                    disabled={!inRound}
                                    className={`mines-cell ${flipped ? 'flipped' : ''} ${isRevealed ? 'revealed' : ''} ${showBomb ? 'bomb' : ''} ${isHit ? 'hit' : ''}`}
                                    onClick={() => reveal(i)}
                                    aria-label={flipped ? (isBomb ? 'Bomb' : 'Diamond') : 'Hidden cell'}
                                >
                                    <span className="mines-face mines-face-back" aria-hidden="true" />
                                    <span className="mines-face mines-face-front" aria-hidden="true">
                                        {isBomb ? (
                                            <>
                                                <img src="/images/mines/bomb.svg" alt="" className="mines-art" />
                                                {isHit && <img src="/images/mines/bomb_effect.gif" alt="" className="mines-burst" />}
                                            </>
                                        ) : (
                                            <img src="/images/mines/diamond.svg" alt="" className="mines-art" />
                                        )}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                    {(phase === 'cashed' || phase === 'playing') && burstKey > 0 && <Particles key={burstKey} count={phase === 'cashed' ? 22 : 8} color={phase === 'cashed' ? '#6db7ff' : '#9bf08a'} />}
                    <ActionLockOverlay active={phase === 'busted'} label="Bust" />
                    <ResultToast result={toast} onDismiss={() => setToast(null)} />
                </div>
            </CoreStageFrame>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={getBigWinThreshold('mines')} />
            <EducationPanel definition={definition} betAmount={5} winProbability={(GRID - bombs) / GRID} payoutMultiplier={currentMult} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
