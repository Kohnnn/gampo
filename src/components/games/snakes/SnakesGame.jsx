// Stake-style Snakes (Wave 3 Batch 3C, distinct mechanic).
//
// Vertical 3-wide ladder. The hidden snakes are placed at round start.
// Player taps a cell on the current rung to advance: safe rungs raise
// the multiplier, snake rungs end the round at -bet. Cashout any time.
//
// Distinct from Tower (per-row pick, fixed difficulty) and Mines
// (single-grid sequential reveal): Snakes uses a column choice on each
// rung and a separate snake-density slider.

import { useCallback, useMemo, useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { useSfx } from '../../../audio/useSfx'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits } from '../../../utils/simulationMath'
import { nextRoll } from '../../../utils/fairRng'
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
    ROUND_EVENTS,
    useRoundMachine,
} from '../primitives'
import { useOriginalsPreloader } from '../../games/resources/useOriginalsPreloader'
import EducationPanel from '../../EducationPanel'
import './snakes.css'
import { useGameBgm } from '../../../audio/useBgm'

const COLS = 3
const ROWS = 8
const HOUSE_EDGE = 0.04

// Layered ladder. Rung index 0 is the top of the visible ladder so the
// player climbs upward by tapping. Snakes per rung is configurable.
function buildLadder(snakesPerRow) {
    const ladder = []
    for (let r = 0; r < ROWS; r += 1) {
        const cells = Array.from({ length: COLS }, () => false)
        let placed = 0
        let safety = 0
        while (placed < snakesPerRow && safety < 30) {
            const idx = Math.floor(nextRoll('snakes').roll * COLS)
            if (!cells[idx]) { cells[idx] = true; placed += 1 }
            safety += 1
        }
        ladder.push(cells)
    }
    return ladder
}

function multiplierFor(safeRungs, snakesPerRow) {
    if (safeRungs <= 0) return 1
    const survivalProb = (COLS - snakesPerRow) / COLS
    const fairMultiplier = Math.pow(1 / survivalProb, safeRungs)
    return Number((fairMultiplier * (1 - HOUSE_EDGE)).toFixed(4))
}

export default function SnakesGame() {
    useGameBgm('snakes', 'idle')
    const definition = findGameDefinition('snakes') || { name: 'Snakes', category: 'Arcade originals' }
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const sfx = useSfx('snakes')
    const session = useGameSession('snakes')
    const preloader = useOriginalsPreloader('snakes')

    const [snakesPerRow, setSnakesPerRow] = useState(1)
    const [phase, setPhase] = useState('idle') // idle | playing | busted | cashed
    const [rung, setRung] = useState(0) // index of next rung to tap (0..ROWS-1)
    const [ladder, setLadder] = useState(null)
    const [revealedRows, setRevealedRows] = useState([]) // rows fully revealed for cosmetic display
    const [stake, setStake] = useState(0)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [lastBet, setLastBet] = useState(null)
    const [toast, setToast] = useState(null)
    const [bustHit, setBustHit] = useState(null) // { row, col }

    const machine = useRoundMachine({})

    const inRound = phase === 'playing'
    const currentMult = multiplierFor(rung, snakesPerRow)
    const nextMult = multiplierFor(rung + 1, snakesPerRow)

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (inRound) { resolve({ profit: 0 }); return }
        if (!placeBet(betAmount, 'Snakes')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            resolve({ profit: 0 })
            return
        }
        setLastBet(betAmount)
        setStake(betAmount)
        setLadder(buildLadder(snakesPerRow))
        setRung(0)
        setRevealedRows([])
        setBustHit(null)
        setToast(null)
        playSound('click')
        sfx.play('click')
        machine.start([
            { index: 0, type: ROUND_EVENTS.ROUND_START, payload: { snakesPerRow }, at: 0 },
            { index: 1, type: ROUND_EVENTS.INPUT_LOCK, payload: {}, at: 0 },
            { index: 2, type: ROUND_EVENTS.BET_ACCEPTED, payload: { betAmount, snakesPerRow }, at: 0 },
        ], { autoFinish: false })
        setPhase('playing')
        resolve({ profit: 0 })
    })

    const stepOn = (col) => {
        if (!inRound || !ladder) return
        const row = ROWS - 1 - rung // bottom-up
        const isSnake = ladder[row][col]
        if (isSnake) {
            sfx.play('lose')
            playSound('explode')
            setBustHit({ row, col })
            setRevealedRows(prev => [...prev, row])
            setPhase('busted')
            setToast({ kind: 'lose', amount: -stake, message: `Snake at rung ${rung + 1}` })
            session.record({
                id: crypto.randomUUID(),
                label: `Snake at ${rung + 1}`,
                profit: -stake, betAmount: stake, multiplier: 0,
                meta: { rung: rung + 1, snakesPerRow },
            })
            machine.finish({ kind: 'bust', profit: -stake, multiplier: 0, rung: rung + 1 })
            showToast('loss', 'Snake bite', `-${formatCredits(stake)}`)
            window.setTimeout(() => setPhase('idle'), 1100)
            return
        }
        sfx.play('reveal')
        setRevealedRows(prev => [...prev, row])
        if (rung + 1 >= ROWS) {
            // Reached the top: auto cashout at full ladder
            cashOut(rung + 1)
            return
        }
        setRung(rung + 1)
    }

    const cashOut = useCallback((overrideRung) => {
        if (!inRound) return
        const r = Number.isFinite(overrideRung) ? overrideRung : rung
        if (r === 0) return
        const m = multiplierFor(r, snakesPerRow)
        const profit = stake * m - stake
        addWinnings(stake * m, 'Snakes return')
        setToast({ kind: 'cashout', multiplier: m, amount: profit, message: 'Cashed out' })
        if (m >= 5) {
            playSound('bigwin')
            setBigWin({ trigger: Date.now(), profit, multiplier: m })
        } else {
            playSound('win')
        }
        sfx.play('cashout')
        session.record({
            id: crypto.randomUUID(),
            label: `${m.toFixed(2)}× rung ${r}`,
            profit, betAmount: stake, multiplier: m,
            meta: { rung: r, snakesPerRow },
        })
        machine.finish({ kind: 'cashed', profit, multiplier: m, rung: r })
        showToast('win', 'Snakes cashed out', `+${formatCredits(profit)}`)
        setPhase('cashed')
        window.setTimeout(() => setPhase('idle'), 1100)
    }, [inRound, rung, snakesPerRow, stake, addWinnings, playSound, sfx, session, machine, showToast])

    const recentProfit = session.history.slice(0, 12).reduce((sum, item) => sum + (item.profit || 0), 0)

    const ladderRows = useMemo(() => {
        // Render top-down so r=0 is at the top.
        return Array.from({ length: ROWS }, (_, displayIndex) => {
            const realRow = ROWS - 1 - displayIndex
            return realRow
        })
    }, [])

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#7bd389"
            backdrop="/assets/games/backdrops/backdrop-felt-green.png"
            variant="stake"
            panel={
                <BetPanel
                    balance={balance}
                    initialBet={5}
                    runningRound={false}
                    actionLabel="Place Bet"
                    onPlay={performPlay}
                    disableAuto
                    lastBet={lastBet}
                    playPhase={inRound && rung > 0 ? 'in-round' : null}
                    playLabel={inRound && rung > 0 ? `Cashout ${currentMult.toFixed(2)}×` : 'Place Bet'}
                    onPlayPhaseAction={() => cashOut()}
                >
                    <div className="bp-section">
                        <label className="bp-label">Snakes per rung</label>
                        <div className="bp-row">
                            {[1, 2].map(n => (
                                <button key={n} className={`bp-bet-btn ${snakesPerRow === n ? 'active' : ''}`} disabled={inRound} onClick={() => setSnakesPerRow(n)}>{n}</button>
                            ))}
                        </div>
                    </div>
                    <div className="bp-bal-line">
                        <span>Current</span>
                        <strong>{currentMult.toFixed(2)}×</strong>
                    </div>
                    <div className="bp-bal-line">
                        <span>Next rung</span>
                        <strong>{nextMult.toFixed(2)}×</strong>
                    </div>
                    <div className="bp-bal-line">
                        <span>Top reward</span>
                        <strong>{multiplierFor(ROWS, snakesPerRow).toFixed(2)}×</strong>
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
            <CoreStageFrame minHeight={620} maxWidth={840} loading={!preloader.ready} className="snakes-stage-frame">
                <div className="snakes-stage">
                    <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />
                    <div className="snakes-ladder" data-mobile-critical-surface>
                        {ladderRows.map(realRow => (
                            Array.from({ length: COLS }, (_, c) => {
                                const isCurrent = inRound && (ROWS - 1 - rung) === realRow
                                const isCleared = revealedRows.includes(realRow) && !ladder?.[realRow]?.[c]
                                const isSnake = revealedRows.includes(realRow) && ladder?.[realRow]?.[c]
                                const isBust = bustHit && bustHit.row === realRow && bustHit.col === c
                                const cls = [
                                    isCurrent ? 'current' : '',
                                    isCleared ? 'cleared' : '',
                                    isSnake ? 'snake' : '',
                                    !isCurrent && !isCleared && !isSnake ? 'disabled' : '',
                                ].join(' ')
                                return (
                                    <button
                                        key={`${realRow}-${c}`}
                                        className={`snakes-rung ${cls}`}
                                        disabled={!isCurrent}
                                        onClick={() => stepOn(c)}
                                        aria-label={`Rung ${ROWS - realRow}, column ${c + 1}`}
                                    >
                                        {isSnake ? '🐍' : isCleared ? '✓' : isCurrent ? '?' : ''}
                                        {isBust ? ' !' : ''}
                                    </button>
                                )
                            })
                        ))}
                    </div>
                    <div className="snakes-meta">
                        <MultiplierBadge label="Current" value={currentMult} state={inRound ? 'active' : phase === 'cashed' ? 'win' : phase === 'busted' ? 'bust' : 'idle'} size="md" />
                        {inRound && rung < ROWS && (
                            <MultiplierBadge label="Next" value={nextMult} size="sm" />
                        )}
                    </div>
                    <ActionLockOverlay active={phase === 'busted'} label="Snake bite" />
                    <ResultToast result={toast} onDismiss={() => setToast(null)} />
                </div>
            </CoreStageFrame>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={getBigWinThreshold('snakes')} />
            <EducationPanel definition={definition} betAmount={5} winProbability={(COLS - snakesPerRow) / COLS} payoutMultiplier={currentMult || 1} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
