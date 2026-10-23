// Stake-style Tome of Life (Wave 4 Batch 4B).
//
// 3-page progressive reveal. Symbols Sun / Moon / Star / Skull. Sun and
// Moon advance the round and add to the running multiplier; Star
// doubles the next page; Skull busts. Player can cash out after page 1
// or page 2 to lock partial winnings; reaching page 3 auto-resolves.
//
// Distinct from any other game in the catalog: per-page reveal with a
// wild that affects only the *next* draw.

import { useCallback, useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { useSfx } from '../../../audio/useSfx'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits, round2 } from '../../../utils/simulationMath'
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
    StageActionButton,
} from '../primitives'
import { useOriginalsPreloader } from '../../games/resources/useOriginalsPreloader'
import { useCancellableTimeouts } from '../../../utils/scheduling'
import EducationPanel from '../../EducationPanel'
import './tomeoflife.css'
import { useGameBgm } from '../../../audio/useBgm'

const REVEAL_DELAY_MS = 380
const PAGE_COUNT = 3

// Symbol values are calibrated so OPTIMAL play (cash out whenever the current
// accumulated multiple beats the expected value of reading on) returns 0.96
// RTP. Weights: Sun 38%, Moon 26%, Star 14%, Skull 22%. Sun and Moon add their
// face value; Skull busts the round; Star doubles the next page only.
// (Previously Sun 1.4 / Moon 2.2 made optimal play ~226% RTP — every reachable
// state was +EV. Values were solved via a cash-out DP against the 0.96 target.)
const SYMBOLS = [
    { id: 'sun', icon: '☀️', name: 'Sun', value: 0.6, weight: 38 },
    { id: 'moon', icon: '🌙', name: 'Moon', value: 0.93, weight: 26 },
    { id: 'star', icon: '⭐', name: 'Star', value: 0, weight: 14 },
    { id: 'skull', icon: '💀', name: 'Skull', value: 0, weight: 22 },
]

function pickSymbol() {
    const total = SYMBOLS.reduce((s, x) => s + x.weight, 0)
    const r = nextRoll('tomeoflife').roll * total
    let acc = 0
    for (const x of SYMBOLS) {
        acc += x.weight
        if (r < acc) return x
    }
    return SYMBOLS[SYMBOLS.length - 1]
}

export default function TomeOfLifeGame() {
    useGameBgm('tomeoflife', 'idle')
    const definition = findGameDefinition('tomeoflife') || { name: 'Tome of Life', category: 'Arcade originals' }
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const sfx = useSfx('tomeoflife')
    const session = useGameSession('tomeoflife')
    const preloader = useOriginalsPreloader('tomeoflife')

    const [phase, setPhase] = useState('idle') // idle | playing | busted | cashed
    const [pageIndex, setPageIndex] = useState(0)
    const [pages, setPages] = useState([null, null, null])
    const [running, setRunning] = useState(false) // mid-reveal
    const [stake, setStake] = useState(0)
    const [selectedStake, setSelectedStake] = useState(5)
    const [settledResult, setSettledResult] = useState(null)
    const [accumMult, setAccumMult] = useState(0) // sum of completed page contributions
    const [pendingDouble, setPendingDouble] = useState(false) // Star wild armed
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [lastBet, setLastBet] = useState(null)
    const [toast, setToast] = useState(null)
    const { schedule } = useCancellableTimeouts()

    const machine = useRoundMachine({})

    const inRound = phase === 'playing'

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (inRound) { resolve({ profit: 0 }); return }
        if (!placeBet(betAmount, 'Tome of Life')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            resolve({ profit: 0 })
            return
        }
        setLastBet(betAmount)
        setStake(betAmount)
        setSettledResult(null)
        setPageIndex(0)
        setPages([null, null, null])
        setAccumMult(0)
        setPendingDouble(false)
        setToast(null)
        playSound('click')
        sfx.play('click')
        machine.start([
            { index: 0, type: ROUND_EVENTS.ROUND_START, payload: { betAmount }, at: 0 },
            { index: 1, type: ROUND_EVENTS.INPUT_LOCK, payload: {}, at: 0 },
            { index: 2, type: ROUND_EVENTS.BET_ACCEPTED, payload: { betAmount }, at: 0 },
        ], { autoFinish: false })
        setPhase('playing')
        // Auto-reveal page 0 immediately so the player has feedback.
        schedule(() => revealPage(0, betAmount, 0, false), REVEAL_DELAY_MS)
        resolve({ profit: 0 })
    })

    const revealPage = (idx, currentStake, currentAccum, currentPendingDouble) => {
        const pick = pickSymbol()
        const contribution = pick.id === 'sun' || pick.id === 'moon' ? pick.value * (currentPendingDouble ? 2 : 1) : 0
        setPages(prev => {
            const out = [...prev]
            out[idx] = { ...pick, contribution }
            return out
        })
        setRunning(false)
        sfx.play('reveal')

        if (pick.id === 'skull') {
            // Bust the round.
            sfx.play('lose')
            playSound('explode')
            setSettledResult({ multiplier: 0, state: 'bust' })
            setPendingDouble(false)
            setToast({ kind: 'lose', amount: -currentStake, message: `Skull on page ${idx + 1}` })
            session.record({
                id: crypto.randomUUID(),
                label: `Skull page ${idx + 1}`,
                profit: -currentStake, betAmount: currentStake, multiplier: 0,
                meta: { pageIndex: idx + 1 },
            })
            machine.finish({ kind: 'bust', profit: -currentStake, multiplier: 0, pageIndex: idx + 1 })
            showToast('loss', 'Tome bust', `-${formatCredits(currentStake)}`)
            setPhase('busted')
            schedule(() => setPhase('idle'), 1200)
            return
        }

        if (pick.id === 'star') {
            // Star consumes this page and arms one double; consecutive Stars do not stack.
            setPendingDouble(idx < PAGE_COUNT - 1)
            advanceOrFinish(idx, currentAccum, true, currentStake)
            return
        }

        // Sun or Moon: add to accum, applying pending double from prior Star.
        // contribution is also retained on the revealed page for truthful display.
        const nextAccum = currentAccum + contribution
        setAccumMult(nextAccum)
        setPendingDouble(false)
        advanceOrFinish(idx, nextAccum, false, currentStake)
    }

    const advanceOrFinish = (idx, currentAccum, justSetPendingDouble, currentStake) => {
        if (idx >= PAGE_COUNT - 1) {
            // Last page reached: auto cashout.
            finishRound(currentAccum, idx + 1, currentStake)
            return
        }
        // Mid-round; player can choose to read next or cash out.
        setPageIndex(idx + 1)
    }

    const readNextPage = () => {
        if (!inRound || running) return
        if (pageIndex >= PAGE_COUNT) return
        // If the current page is null we must reveal it first.
        const idx = pageIndex
        if (pages[idx] !== null) return
        setRunning(true)
        sfx.play('click')
        schedule(() => revealPage(idx, stake, accumMult, pendingDouble), REVEAL_DELAY_MS)
    }

    const cashOut = useCallback(() => {
        if (!inRound) return
        if (accumMult <= 0) return
        finishRound(accumMult, pageIndex, stake)
    }, [inRound, accumMult, pageIndex, stake])

    const finishRound = (mult, page, currentStake) => {
        // Round the paid return once; present the gross multiplier actually credited.
        const totalReturn = round2(currentStake * mult)
        const profit = round2(totalReturn - currentStake)
        const settledMultiplier = currentStake > 0 ? totalReturn / currentStake : 0
        setSettledResult({ multiplier: settledMultiplier, state: totalReturn > 0 ? 'win' : 'bust' })
        setPendingDouble(false)
        addWinnings(totalReturn, 'Tome of Life return')
        setToast({ kind: totalReturn > 0 ? 'cashout' : 'lose', multiplier: settledMultiplier, amount: profit, message: totalReturn > 0 ? `Tome ${settledMultiplier.toFixed(2)}×` : 'No payout' })
        if (mult >= 5) {
            playSound('bigwin')
            setBigWin({ trigger: Date.now(), profit, multiplier: mult })
        } else if (profit > 0) {
            playSound('win')
        } else {
            playSound('loss')
        }
        sfx.play(profit > 0 ? 'win' : 'lose')
        session.record({
            id: crypto.randomUUID(),
            label: `${settledMultiplier.toFixed(2)}× page ${page}`,
            profit, betAmount: currentStake, multiplier: settledMultiplier,
            meta: { pageReached: page },
        })
        machine.finish({ kind: profit > 0 ? 'cashed' : 'lose', profit, multiplier: settledMultiplier, pageReached: page })
        showToast(profit > 0 ? 'win' : 'loss', `Tome ${settledMultiplier.toFixed(2)}×`, `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
        setPhase('cashed')
        schedule(() => setPhase('idle'), 1200)
    }

    const recentProfit = session.history.slice(0, 12).reduce((sum, item) => sum + (item.profit || 0), 0)

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#ffd166"
            backdrop="/assets/games/backdrops/backdrop-stars.png"
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
                    onStakeChange={setSelectedStake}
                    playPhase={inRound && accumMult > 0 ? 'in-round' : null}
                    playLabel={inRound && accumMult > 0 ? `Cashout ${accumMult.toFixed(2)}×` : 'Place Bet'}
                    onPlayPhaseAction={cashOut}
                >
                    <div className="bp-bal-line">
                        <span>Pages</span>
                        <strong>{pageIndex} / {PAGE_COUNT}</strong>
                    </div>
                    <div className="bp-bal-line">
                        <span>Pending double</span>
                        <strong>{pendingDouble ? 'YES' : 'no'}</strong>
                    </div>
                    <div className="bp-bal-line">
                        <span>Top reach</span>
                        <strong>{(Math.max(...SYMBOLS.map(symbol => symbol.value)) * PAGE_COUNT).toFixed(2)}×</strong>
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
            <CoreStageFrame minHeight={620} maxWidth={760} loading={!preloader.ready} className="tome-stage-frame">
                <div className="tome-stage">
                    <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />
                    <div className="tome-pages" data-mobile-critical-surface>
                        {pages.map((p, idx) => {
                            const isActive = inRound && idx === pageIndex && p === null
                            const isRevealed = p !== null
                            const cls = [
                                isActive ? 'active' : '',
                                isRevealed ? 'revealed' : '',
                                p?.id === 'skull' ? 'skull' : '',
                                p?.id === 'star' ? 'star' : '',
                            ].join(' ')
                            return (
                                <div key={idx} className={`tome-page ${cls}`}>
                                    {p ? (
                                        <>
                                            <span className="tome-symbol">{p.icon}</span>
                                            <span className="tome-name">{p.name}</span>
                                            <span className="tome-mult">
                                                {p.id === 'skull' ? 'Bust' : p.id === 'star' ? (idx === PAGE_COUNT - 1 ? 'No next page' : '×2 next Sun/Moon') : `+${p.contribution.toFixed(2)}×`}
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="tome-symbol">{idx === pageIndex && inRound ? '?' : '·'}</span>
                                            <span className="tome-name">Page {idx + 1}</span>
                                        </>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                    <div className="tome-actions">
                        <StageActionButton disabled={!inRound || running || pageIndex >= PAGE_COUNT} onClick={readNextPage}>
                            {pageIndex >= PAGE_COUNT ? 'Reading complete' : `Read page ${pageIndex + 1}`}
                        </StageActionButton>
                    </div>
                    <div className="tome-paytable">
                        {SYMBOLS.map(symbol => <span key={symbol.id}>{`${symbol.icon} ${symbol.name} ${symbol.id === 'skull' ? 'Bust' : symbol.id === 'star' ? '×2 next Sun/Moon · no stacking' : `+${symbol.value.toFixed(2)}×`}`}</span>)}
                    </div>
                    {inRound || settledResult ? <MultiplierBadge label={inRound ? 'Accum' : 'Result'} value={inRound ? accumMult : settledResult.multiplier} state={inRound ? 'active' : settledResult.state} size="md" /> : <p className="bp-hint">Place a bet to reveal the first page.</p>}
                    <ActionLockOverlay active={running} label="Reading..." />
                    <ResultToast result={toast} onDismiss={() => setToast(null)} />
                </div>
            </CoreStageFrame>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={getBigWinThreshold('tomeoflife')} />
            <EducationPanel definition={definition} betAmount={inRound ? stake : selectedStake} rtpNote="Nominal RTP assumes optimal cashout decisions. Star adds no value, consumes a page, and doubles the next Sun or Moon only; it cannot stack or help after the final page." balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
