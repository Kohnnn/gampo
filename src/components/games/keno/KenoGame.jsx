// Stake/Rainbet-style Keno on the shared shell.
//
// Wave 2 retrofit: drives draw animation + result toast + sfx through the
// round event machine. Math (kenoPayout) is unchanged.

import { useCallback, useRef, useState } from 'react'
import { useScrollActionIntoView } from '../../../hooks/useScrollActionIntoView'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { useSfx } from '../../../audio/useSfx'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits, kenoPayout, sampleUniqueNumbers } from '../../../utils/simulationMath'
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
    SimBetStrip,
    makeInitialSimBetRows,
    makeSimBetRow,
    prependSimBetRow,
    ROUND_EVENTS,
    buildEvents,
    useRoundMachine,
} from '../primitives'
import { useOriginalsPreloader } from '../../games/resources/useOriginalsPreloader'
import { Particles } from '../../fx'
import EducationPanel from '../../EducationPanel'
import './keno.css'
import { useGameBgm } from '../../../audio/useBgm'

const DRAW_INTERVAL_MS = 220
const DRAW_DELAY_MS = 200

export default function KenoGame() {
    useGameBgm('keno', 'idle')
    const definition = findGameDefinition('keno')
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const sfx = useSfx('keno')
    const session = useGameSession('keno')
    const preloader = useOriginalsPreloader('keno')

    const [selected, setSelected] = useState([4, 8, 15, 16, 23])
    const [drawAnim, setDrawAnim] = useState([])
    const [drawing, setDrawing] = useState(false)
    const [burstKey, setBurstKey] = useState(0)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [lastBet, setLastBet] = useState(null)
    const [toast, setToast] = useState(null)
    const [lastMultiplier, setLastMultiplier] = useState(null)
    const [simFeed, setSimFeed] = useState(() => makeInitialSimBetRows('keno', { count: 9, cap: 10 }))
    const simSeqRef = useRef(0)
    const stageRef = useRef(null)
    // Bring the draw grid into view when a round starts (mobile reachability).
    useScrollActionIntoView(stageRef, drawing, [drawing], { block: 'nearest' })

    const handleEvent = useCallback((ev) => {
        if (!ev) return
        switch (ev.type) {
            case ROUND_EVENTS.RNG_REVEAL: {
                const n = ev.payload?.number
                if (Number.isFinite(n)) {
                    sfx.play('reveal')
                    setDrawAnim(prev => prev.includes(n) ? prev : [...prev, n])
                }
                break
            }
            case ROUND_EVENTS.ROUND_RESULT: {
                const { won, multiplier, profit, hits, total } = ev.payload || {}
                setLastMultiplier(multiplier || 0)
                setToast({
                    kind: won ? 'win' : 'lose',
                    multiplier: multiplier > 0 ? multiplier : null,
                    amount: profit,
                    message: `Keno ${hits}/${total}`,
                })
                if (won) sfx.play('win'); else sfx.play('lose')
                break
            }
            default:
                break
        }
    }, [sfx])

    const machine = useRoundMachine({ onEvent: handleEvent })

    const toggle = (n) => {
        if (drawing) return
        setSelected(prev => prev.includes(n) ? prev.filter(x => x !== n) : prev.length < 10 ? [...prev, n].sort((a, b) => a - b) : prev)
    }

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (selected.length === 0) { resolve({ profit: 0 }); return }
        if (!placeBet(betAmount, 'Keno')) { showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`); resolve({ profit: 0 }); return }
        setLastBet(betAmount)
        setToast(null)
        playSound('tick')
        sfx.play('click')
        setDrawing(true); setDrawAnim([])
        const picks = sampleUniqueNumbers({ max: 40, count: 10, random: () => nextRoll('keno').roll })
        const hits = selected.filter(n => picks.includes(n)).length
        const multiplier = kenoPayout(selected.length, hits)
        const returnAmount = betAmount * multiplier
        const profit = returnAmount - betAmount
        const totalDuration = DRAW_DELAY_MS + picks.length * DRAW_INTERVAL_MS + 200

        const events = buildEvents(api => {
            api.push(ROUND_EVENTS.ROUND_START, { selected }, 0)
            api.push(ROUND_EVENTS.INPUT_LOCK, {}, 0)
            api.push(ROUND_EVENTS.BET_ACCEPTED, { betAmount, selected }, 0)
            picks.forEach((n, i) => {
                api.push(ROUND_EVENTS.RNG_REVEAL, { number: n, drawIndex: i }, DRAW_DELAY_MS + i * DRAW_INTERVAL_MS)
            })
            api.push(ROUND_EVENTS.ROUND_RESULT, {
                won: profit > 0,
                profit,
                multiplier,
                hits,
                total: selected.length,
                drawn: picks,
                selected,
            }, totalDuration)
            api.push(ROUND_EVENTS.PAYOUT_PREVIEW, { amount: returnAmount }, totalDuration + 16)
            api.push(ROUND_EVENTS.INPUT_UNLOCK, {}, totalDuration + 240)
        })
        machine.start(events, { autoFinish: false })

        // Real engine effects fire at the same wallclock as the events so
        // visuals stay synchronized.
        window.setTimeout(() => {
            if (returnAmount > 0) addWinnings(returnAmount, 'Keno return')
            setBurstKey(k => k + 1); setDrawing(false)
            if (multiplier >= 8) {
                playSound('bigwin')
                setBigWin({ trigger: Date.now(), profit, multiplier })
            } else {
                playSound(returnAmount > 0 ? 'win' : 'loss')
            }
            session.record({ id: crypto.randomUUID(), label: `${hits}/${selected.length}`, profit, betAmount, multiplier })
            showToast(profit >= 0 ? 'win' : 'loss', `Keno ${hits} hits`, `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)
            simSeqRef.current += 1
            setSimFeed(prev => prependSimBetRow(prev, makeSimBetRow('keno', {
                seed: `keno:${simSeqRef.current}:${selected.length}:${hits}:${multiplier}`,
            }), 10))
            resolve({ profit })
        }, totalDuration)
    })

    const recentProfit = session.history.slice(0, 12).reduce((s, i) => s + (i.profit || 0), 0)
    const estimatedChance = selected.length ? selected.length / 40 : 0

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#ffcf5a"
            backdrop="/assets/games/backdrops/backdrop-felt-navy.png"
            variant="stake"
            panel={
                <BetPanel balance={balance} initialBet={5} runningRound={drawing} actionLabel="Draw Keno" mobilePlayLabel="Draw" onPlay={performPlay} lastBet={lastBet}>
                    <button className="bp-bet-btn" disabled={drawing} onClick={() => setSelected(sampleUniqueNumbers({ max: 40, count: 5, random: () => nextRoll('keno').roll }))}>Quick pick 5</button>
                    <div className="bp-bal-line"><span>Selected</span><strong>{selected.length}/10</strong></div>
                    {Number.isFinite(lastMultiplier) && lastMultiplier > 0 && (
                        <div className="bp-section">
                            <MultiplierBadge label="Last multiplier" value={lastMultiplier} state="win" size="sm" />
                        </div>
                    )}
                </BetPanel>
            }
            aside={<><StatsOverlay stats={session.stats} definition={definition} /><HistoryDrawer history={session.history} onClear={session.clear} /></>}
        >
            <CoreStageFrame minHeight={520} maxWidth={920} loading={!preloader.ready} className="keno-stage-frame" mobileScrollable>
                <div className="keno-stage" ref={stageRef}>
                    <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />
                    <SimBetStrip rows={simFeed} title="Sim keno" />
                    <div className="keno-grid" data-mobile-critical-surface>
                        {Array.from({ length: 40 }, (_, i) => i + 1).map(n => {
                            const isSel = selected.includes(n)
                            const isDr = drawAnim.includes(n)
                            const isHit = isSel && isDr
                            const idx = isDr ? drawAnim.indexOf(n) : -1
                            return (
                                <button key={n}
                                    className={`${isSel ? 'selected' : ''} ${isDr ? 'drawn' : ''} ${isHit ? 'hit' : ''}`}
                                    style={isDr ? { animationDelay: `${idx * 30}ms` } : undefined}
                                    onClick={() => toggle(n)}>{n}</button>
                            )
                        })}
                    </div>
                    {burstKey > 0 && session.history[0]?.profit > 0 && <Particles key={burstKey} count={16} color="#ffcf5a" />}
                    <ActionLockOverlay active={drawing} label="Drawing..." />
                    <ResultToast result={toast} onDismiss={() => setToast(null)} />
                </div>
            </CoreStageFrame>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={getBigWinThreshold('keno')} />
            <EducationPanel definition={definition} betAmount={5} winProbability={estimatedChance} payoutMultiplier={kenoPayout(Math.max(1, selected.length), Math.max(1, Math.ceil(selected.length / 2)))} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
