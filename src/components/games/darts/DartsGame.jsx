// Stake-style Darts (Wave 3, plausible mechanic).
//
// Player picks a sector (or Bullseye). Dart lands with a weighted-bias
// distribution: 60% chance to hit the chosen sector, 25% chance to hit a
// neighbor, 15% chance to miss elsewhere. Bullseye is a separate pick
// with lower hit chance and bigger payout.

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
    buildEvents,
    useRoundMachine,
} from '../primitives'
import { useOriginalsPreloader } from '../../games/resources/useOriginalsPreloader'
import EducationPanel from '../../EducationPanel'
import './darts.css'
import { useGameBgm } from '../../../audio/useBgm'

const THROW_MS = 720
const SECTOR_COUNT = 12
const SECTOR_PAYOUT = 1.6
const NEIGHBOR_PAYOUT = 0
const BULLSEYE_PAYOUT = 12
const BULL_HIT_CHANCE = 0.078
// Engine bias distribution for a sector pick: the dart lands on the chosen
// sector SECTOR_HIT_CHANCE of the time (the only paying outcome), a neighbor
// NEIGHBOR_HIT_CHANCE of the time, otherwise it misses elsewhere. These are the
// authoritative win odds used both by sampleHit and the Probability Lab.
const SECTOR_HIT_CHANCE = 0.6
const NEIGHBOR_HIT_CHANCE = 0.25

function sampleHit({ sector }) {
    const r = nextRoll('darts').roll
    if (sector === 'bull') {
        if (r < BULL_HIT_CHANCE) return { kind: 'bull' }
        return { kind: 'miss', hitSector: Math.floor(nextRoll('darts').roll * SECTOR_COUNT) }
    }
    if (r < SECTOR_HIT_CHANCE) return { kind: 'sector', hitSector: sector }
    if (r < SECTOR_HIT_CHANCE + NEIGHBOR_HIT_CHANCE) {
        const dir = nextRoll('darts').roll < 0.5 ? -1 : 1
        const neighbor = ((sector + dir) + SECTOR_COUNT) % SECTOR_COUNT
        return { kind: 'neighbor', hitSector: neighbor }
    }
    let hit = sector
    while (hit === sector) hit = Math.floor(nextRoll('darts').roll * SECTOR_COUNT)
    return { kind: 'miss', hitSector: hit }
}

export default function DartsGame() {
    useGameBgm('darts', 'idle')
    const definition = findGameDefinition('darts') || { name: 'Darts', category: 'Arcade originals' }
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const sfx = useSfx('darts')
    const session = useGameSession('darts')
    const preloader = useOriginalsPreloader('darts')

    const [target, setTarget] = useState('bull') // 'bull' | sector index 0..11
    const [running, setRunning] = useState(false)
    const [hit, setHit] = useState(null) // { kind, hitSector } | null
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [lastBet, setLastBet] = useState(null)
    const [toast, setToast] = useState(null)
    const [pointer, setPointer] = useState({ x: 0, y: 0 })

    const handleEvent = useCallback((ev) => {
        if (!ev) return
        switch (ev.type) {
            case ROUND_EVENTS.INPUT_LOCK:
                setRunning(true)
                break
            case ROUND_EVENTS.STAGE_SELECT:
                if (ev.payload?.kind === 'aim') sfx.play('reveal')
                break
            case ROUND_EVENTS.RNG_REVEAL:
                if (ev.payload?.outcome) setHit(ev.payload.outcome)
                break
            case ROUND_EVENTS.ROUND_RESULT: {
                const { won, multiplier, profit, label } = ev.payload || {}
                setToast({
                    kind: won ? 'win' : 'lose',
                    multiplier: won ? multiplier : null,
                    amount: profit,
                    message: label,
                })
                if (won) sfx.play('win'); else sfx.play('lose')
                break
            }
            case ROUND_EVENTS.INPUT_UNLOCK:
                setRunning(false)
                break
            default:
                break
        }
    }, [sfx])

    const machine = useRoundMachine({ onEvent: handleEvent })

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (running) { resolve({ profit: 0 }); return }
        if (!placeBet(betAmount, 'Darts')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            resolve({ profit: 0 })
            return
        }
        setLastBet(betAmount)
        setHit(null)
        setToast(null)
        playSound('tick')
        sfx.play('click')

        const outcome = sampleHit({ sector: target === 'bull' ? 'bull' : Number(target) })
        let multiplier = 0
        let label = 'Miss'
        if (outcome.kind === 'bull') { multiplier = BULLSEYE_PAYOUT; label = 'Bullseye' }
        else if (outcome.kind === 'sector') { multiplier = SECTOR_PAYOUT; label = `Sector ${(outcome.hitSector + 1)}` }
        else if (outcome.kind === 'neighbor') { multiplier = NEIGHBOR_PAYOUT; label = 'Neighbor' }
        const won = multiplier > 0
        const returnAmount = won ? betAmount * multiplier : 0
        const profit = returnAmount - betAmount

        // Pointer position: place dart inside the chosen sector ring.
        const sectorIdx = outcome.kind === 'bull' ? 0 : (outcome.hitSector ?? 0)
        const angle = (sectorIdx / SECTOR_COUNT) * Math.PI * 2 - Math.PI / 2
        const radius = outcome.kind === 'bull' ? 0 : 88
        const x = Math.cos(angle) * radius
        const y = Math.sin(angle) * radius

        const events = buildEvents(api => {
            api.push(ROUND_EVENTS.ROUND_START, { target }, 0)
            api.push(ROUND_EVENTS.INPUT_LOCK, {}, 0)
            api.push(ROUND_EVENTS.BET_ACCEPTED, { betAmount, target }, 0)
            api.push(ROUND_EVENTS.STAGE_SELECT, { kind: 'aim' }, 60)
            api.push(ROUND_EVENTS.RNG_REVEAL, { outcome }, THROW_MS - 80)
            api.push(ROUND_EVENTS.ROUND_RESULT, {
                won, profit, multiplier, label, target, outcome,
            }, THROW_MS)
            api.push(ROUND_EVENTS.PAYOUT_PREVIEW, { amount: returnAmount }, THROW_MS + 16)
            api.push(ROUND_EVENTS.INPUT_UNLOCK, {}, THROW_MS + 220)
        })
        machine.start(events, { autoFinish: false })

        // Schedule pointer visual at the same wallclock as the reveal so
        // the dart "lands" with the events.
        setTimeout(() => setPointer({ x, y }), THROW_MS - 80)

        if (returnAmount > 0) addWinnings(returnAmount, 'Darts return')
        if (won && multiplier >= 12) {
            playSound('bigwin')
            setBigWin({ trigger: Date.now(), profit, multiplier })
        } else {
            playSound(won ? 'win' : 'loss')
        }
        session.record({
            id: crypto.randomUUID(),
            label,
            profit, betAmount, multiplier: won ? multiplier : 0,
            meta: { target, outcome },
        })
        showToast(won ? 'win' : 'loss', label, `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)

        setTimeout(() => resolve({ profit }), THROW_MS + 240)
    })

    const recentProfit = session.history.slice(0, 12).reduce((sum, item) => sum + (item.profit || 0), 0)
    const sectorOptions = useMemo(() => Array.from({ length: SECTOR_COUNT }, (_, i) => ({ value: String(i), label: String(i + 1) })), [])

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#ff7a7c"
            backdrop="/assets/games/backdrops/backdrop-felt-navy.png"
            variant="stake"
            panel={
                <BetPanel
                    balance={balance}
                    initialBet={5}
                    runningRound={running}
                    actionLabel="Throw Dart"
                    onPlay={performPlay}
                    lastBet={lastBet}
                >
                    <div className="bp-section">
                        <label className="bp-label">Target</label>
                        <div className="bp-row">
                            <button className={`bp-bet-btn ${target === 'bull' ? 'active' : ''}`} disabled={running} onClick={() => setTarget('bull')}>Bullseye 12×</button>
                        </div>
                    </div>
                    <div className="bp-section">
                        <label className="bp-label">Sector</label>
                        <div className="darts-sector-row">
                            {sectorOptions.map(s => (
                                <button
                                    key={s.value}
                                    className={`darts-sector-chip ${target === s.value ? 'active' : ''}`}
                                    disabled={running}
                                    onClick={() => setTarget(s.value)}
                                >{s.label}</button>
                            ))}
                        </div>
                    </div>
                    <div className="bp-bal-line"><span>Sector pay</span><strong>{SECTOR_PAYOUT.toFixed(2)}×</strong></div>
                    <div className="bp-bal-line"><span>Bullseye pay</span><strong>{BULLSEYE_PAYOUT.toFixed(2)}×</strong></div>
                </BetPanel>
            }
            aside={
                <>
                    <StatsOverlay stats={session.stats} definition={definition} />
                    <HistoryDrawer history={session.history} onClear={session.clear} />
                </>
            }
        >
            <CoreStageFrame minHeight={520} maxWidth={840} loading={!preloader.ready} className="darts-stage-frame">
                <div className="darts-stage">
                    <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />
                    <div className="darts-board" data-mobile-critical-surface aria-label="Dart board">
                        <span className="darts-bull" />
                        <span className="darts-pointer" style={{ transform: `translate(${pointer.x}px, ${pointer.y}px)` }} />
                    </div>
                    <div>
                        <MultiplierBadge label={target === 'bull' ? 'Bullseye' : `Sector ${Number(target) + 1}`} value={target === 'bull' ? BULLSEYE_PAYOUT : SECTOR_PAYOUT} state={running ? 'active' : 'idle'} size="sm" />
                    </div>
                    <ActionLockOverlay active={running} label="Throwing..." />
                    <ResultToast result={toast} onDismiss={() => setToast(null)} />
                </div>
            </CoreStageFrame>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={getBigWinThreshold('darts')} />
            {/* Win odds derived from the engine's sampleHit thresholds for the
                currently-selected target. Only the chosen sector (or the bull)
                pays — neighbor lands at NEIGHBOR_PAYOUT=0 — so the paying chance
                is exactly SECTOR_HIT_CHANCE (0.6 → 1.6× = 0.96 RTP) or
                BULL_HIT_CHANCE (0.078 → 12× = 0.936 RTP). */}
            <EducationPanel
                definition={definition}
                betAmount={5}
                winProbability={target === 'bull' ? BULL_HIT_CHANCE : SECTOR_HIT_CHANCE}
                payoutMultiplier={target === 'bull' ? BULLSEYE_PAYOUT : SECTOR_PAYOUT}
                balance={balance}
                recentProfit={recentProfit}
            />
        </GameShell>
    )
}
