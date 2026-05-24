// Stake-style Drill (Wave 4 Batch 4A).
//
// Vertical mineshaft. Round starts at the surface (depth 0). Each tap
// drills through one of LAYERS configured rock types. Each layer has:
//   - A multiplier you'd lock in if you cashed out.
//   - A bust chance (collapse) that scales with depth.
//
// The deeper layers pay more but each tap is a separate fairRng draw,
// so risk compounds quickly. Cashout any time. Hitting a collapse on a
// layer ends the round at -bet.
//
// Distinct from Mines / Tower / Pump:
//   - Mines: grid pick, multi-cell.
//   - Tower: per-row pick, fixed difficulty.
//   - Pump: single counter, geometric ramp.
//   - Drill: layered ramp where each layer has a different bust chance,
//     so the EV-optimal stop is a function of depth, not just the
//     multiplier reached.

import { useCallback, useMemo, useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { useSfx } from '../../../audio/useSfx'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { formatCredits } from '../../../utils/simulationMath'
import { nextRoll } from '../../../utils/fairRng'
import {
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
import './drill.css'

// 8-layer shaft. Multipliers are baked at design time so the layer
// labels and rewards are stable. Bust chance climbs roughly linearly,
// keeping the cumulative survival product near a 96% RTP target across
// the full descent.
const LAYERS = [
    { name: 'Topsoil', multiplier: 1.10, bustChance: 0.06 },
    { name: 'Clay', multiplier: 1.30, bustChance: 0.10 },
    { name: 'Sandstone', multiplier: 1.65, bustChance: 0.14 },
    { name: 'Granite', multiplier: 2.20, bustChance: 0.18 },
    { name: 'Iron Vein', multiplier: 3.20, bustChance: 0.22 },
    { name: 'Crystal Layer', multiplier: 4.80, bustChance: 0.26 },
    { name: 'Magma Pocket', multiplier: 8.00, bustChance: 0.32 },
    { name: 'Bedrock Core', multiplier: 18.0, bustChance: 0.38 },
]

export default function DrillGame() {
    const definition = findGameDefinition('drill') || { name: 'Drill', category: 'Arcade originals' }
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const sfx = useSfx('drill')
    const session = useGameSession('drill')
    const preloader = useOriginalsPreloader('drill')

    const [phase, setPhase] = useState('idle') // idle | playing | busted | cashed
    const [depth, setDepth] = useState(0) // layers cleared (0..LAYERS.length)
    const [bustHit, setBustHit] = useState(null) // layer index where it busted
    const [stake, setStake] = useState(0)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [lastBet, setLastBet] = useState(null)
    const [toast, setToast] = useState(null)

    const machine = useRoundMachine({})

    const inRound = phase === 'playing'
    const currentMult = depth === 0 ? 1 : LAYERS[depth - 1].multiplier
    const nextLayer = depth < LAYERS.length ? LAYERS[depth] : null

    const performPlay = ({ betAmount }) => new Promise(resolve => {
        if (inRound) { resolve({ profit: 0 }); return }
        if (!placeBet(betAmount, 'Drill')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            resolve({ profit: 0 })
            return
        }
        setLastBet(betAmount)
        setStake(betAmount)
        setDepth(0)
        setBustHit(null)
        setToast(null)
        playSound('click')
        sfx.play('click')
        machine.start([
            { index: 0, type: ROUND_EVENTS.ROUND_START, payload: { betAmount }, at: 0 },
            { index: 1, type: ROUND_EVENTS.INPUT_LOCK, payload: {}, at: 0 },
            { index: 2, type: ROUND_EVENTS.BET_ACCEPTED, payload: { betAmount }, at: 0 },
        ], { autoFinish: false })
        setPhase('playing')
        resolve({ profit: 0 })
    })

    const drillStep = () => {
        if (!inRound) return
        if (depth >= LAYERS.length) { cashOut(); return }
        const layer = LAYERS[depth]
        const { roll } = nextRoll('drill')
        if (roll < layer.bustChance) {
            // Collapse.
            sfx.play('lose')
            playSound('explode')
            setBustHit(depth)
            setPhase('busted')
            setToast({ kind: 'lose', amount: -stake, message: `Collapse at ${layer.name}` })
            session.record({
                id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
                label: `Collapse ${layer.name}`,
                profit: -stake, betAmount: stake, multiplier: 0,
                meta: { layer: layer.name, depth: depth + 1 },
            })
            machine.finish({ kind: 'bust', profit: -stake, multiplier: 0, depth: depth + 1 })
            showToast('loss', 'Drill collapse', `-${formatCredits(stake)}`)
            window.setTimeout(() => setPhase('idle'), 1200)
            return
        }
        const nextDepth = depth + 1
        setDepth(nextDepth)
        sfx.play('reveal')
        if (nextDepth >= LAYERS.length) {
            // Auto cashout at the bottom.
            cashOut(nextDepth)
        }
    }

    const cashOut = useCallback((overrideDepth) => {
        if (!inRound) return
        const d = Number.isFinite(overrideDepth) ? overrideDepth : depth
        if (d === 0) return
        const m = LAYERS[d - 1].multiplier
        const profit = stake * m - stake
        addWinnings(stake * m, 'Drill return')
        setToast({ kind: 'cashout', multiplier: m, amount: profit, message: 'Cashed out' })
        if (m >= 5) {
            playSound('bigwin')
            setBigWin({ trigger: Date.now(), profit, multiplier: m })
        } else {
            playSound('win')
        }
        sfx.play('cashout')
        session.record({
            id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
            label: `${m.toFixed(2)}× ${LAYERS[d - 1].name}`,
            profit, betAmount: stake, multiplier: m,
            meta: { depth: d, layer: LAYERS[d - 1].name },
        })
        machine.finish({ kind: 'cashed', profit, multiplier: m, depth: d })
        showToast('win', 'Drill cashed out', `+${formatCredits(profit)}`)
        setPhase('cashed')
        window.setTimeout(() => setPhase('idle'), 1200)
    }, [inRound, depth, stake, addWinnings, playSound, sfx, session, machine, showToast])

    const recentProfit = session.history.slice(0, 12).reduce((sum, item) => sum + (item.profit || 0), 0)

    const expectedNext = useMemo(() => {
        if (!nextLayer) return 0
        const survival = 1 - nextLayer.bustChance
        return Number((survival * nextLayer.multiplier).toFixed(3))
    }, [nextLayer])

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#ffd166"
            backdrop="/assets/games/backdrops/backdrop-felt-navy.png"
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
                    playPhase={inRound && depth > 0 ? 'in-round' : null}
                    playLabel={inRound && depth > 0 ? `Cashout ${currentMult.toFixed(2)}×` : 'Place Bet'}
                    onPlayPhaseAction={() => cashOut()}
                >
                    <div className="bp-bal-line">
                        <span>Current</span>
                        <strong>{currentMult.toFixed(2)}×</strong>
                    </div>
                    <div className="bp-bal-line">
                        <span>Next layer</span>
                        <strong>{nextLayer ? `${nextLayer.multiplier.toFixed(2)}× · ${(nextLayer.bustChance * 100).toFixed(0)}%` : '—'}</strong>
                    </div>
                    <div className="bp-bal-line">
                        <span>Next EV</span>
                        <strong>{expectedNext.toFixed(2)}×</strong>
                    </div>
                    <div className="bp-bal-line">
                        <span>Bedrock</span>
                        <strong>{LAYERS[LAYERS.length - 1].multiplier.toFixed(0)}×</strong>
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
            <CoreStageFrame minHeight={620} maxWidth={760} loading={!preloader.ready} className="drill-stage-frame">
                <div className="drill-stage">
                    <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />
                    <div className="drill-shaft">
                        {LAYERS.map((layer, idx) => {
                            const cleared = idx < depth
                            const current = inRound && idx === depth
                            const bust = bustHit === idx
                            const cls = [
                                cleared ? 'cleared' : '',
                                current ? 'current' : '',
                                bust ? 'bust' : '',
                            ].join(' ')
                            return (
                                <div key={idx} className={`drill-layer ${cls}`}>
                                    <span>{layer.name}</span>
                                    <span className="mult">{layer.multiplier.toFixed(2)}×</span>
                                </div>
                            )
                        })}
                    </div>
                    <div className="drill-actions">
                        <button className="drill-action-chip" disabled={!inRound} onClick={drillStep}>
                            {inRound && nextLayer ? `Drill (${(nextLayer.bustChance * 100).toFixed(0)}%)` : 'Drill'}
                        </button>
                        {inRound && depth > 0 && (
                            <button className="drill-action-chip cashout" onClick={() => cashOut()}>Cashout {currentMult.toFixed(2)}×</button>
                        )}
                    </div>
                    <div>
                        <MultiplierBadge label="Current" value={currentMult} state={inRound ? 'active' : phase === 'cashed' ? 'win' : phase === 'busted' ? 'bust' : 'idle'} size="md" />
                        {nextLayer && inRound && (
                            <span style={{ marginLeft: 10 }}>
                                <MultiplierBadge label="Next" value={nextLayer.multiplier} size="sm" />
                            </span>
                        )}
                    </div>
                    <ActionLockOverlay active={phase === 'busted'} label="Collapse" />
                    <ResultToast result={toast} onDismiss={() => setToast(null)} />
                </div>
            </CoreStageFrame>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={5} />
            <EducationPanel definition={definition} betAmount={5} winProbability={(LAYERS[0] ? 1 - LAYERS[0].bustChance : 0.94)} payoutMultiplier={currentMult || 1} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
