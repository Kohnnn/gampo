// Stake-style Slide (Wave 3, plausible mechanic).
//
// Player picks a target window width on a 0-100 track. The marker
// slides to a uniform-random landing point. Hitting inside the target
// pays a multiplier inversely proportional to the window width.

import { useCallback, useMemo, useState } from 'react'
import { useCredits } from '../../../context/CreditContext'
import { useAudio } from '../../../audio/AudioProvider'
import { useSfx } from '../../../audio/useSfx'
import { findGameDefinition } from '../../../data/gameDefinitions'
import { clamp, formatCredits } from '../../../utils/simulationMath'
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
import './slide.css'
import { useGameBgm } from '../../../audio/useBgm'

const TRAVEL_MS = 720
const HOUSE_EDGE = 0.04

export default function SlideGame() {
    useGameBgm('slide', 'idle')
    const definition = findGameDefinition('slide') || { name: 'Slide', category: 'Arcade originals' }
    const { balance, placeBet, addWinnings, showToast } = useCredits()
    const { play: playSound } = useAudio()
    const sfx = useSfx('slide')
    const session = useGameSession('slide')
    const preloader = useOriginalsPreloader('slide')

    const [targetWidth, setTargetWidth] = useState(30) // 5..80
    const [targetCenter, setTargetCenter] = useState(50) // 0..100
    const [marker, setMarker] = useState(50)
    const [running, setRunning] = useState(false)
    const [lastWon, setLastWon] = useState(null)
    const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
    const [lastBet, setLastBet] = useState(null)
    const [toast, setToast] = useState(null)

    const winChance = useMemo(() => Math.max(0.05, Math.min(0.95, targetWidth / 100)), [targetWidth])
    const payout = useMemo(() => Math.max(1.05, ((1 - HOUSE_EDGE) / winChance)), [winChance])
    const left = clamp(targetCenter - targetWidth / 2, 0, 100 - targetWidth)
    const right = left + targetWidth

    const handleEvent = useCallback((ev) => {
        if (!ev) return
        switch (ev.type) {
            case ROUND_EVENTS.INPUT_LOCK:
                setRunning(true)
                break
            case ROUND_EVENTS.RNG_REVEAL:
                if (Number.isFinite(ev.payload?.position)) {
                    setMarker(ev.payload.position)
                    sfx.play('reveal')
                }
                break
            case ROUND_EVENTS.ROUND_RESULT: {
                const { won, multiplier, profit } = ev.payload || {}
                setLastWon(!!won)
                setToast({
                    kind: won ? 'win' : 'lose',
                    multiplier: won ? multiplier : null,
                    amount: profit,
                    message: won ? 'Slide hit' : 'Slide miss',
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
        if (!placeBet(betAmount, 'Slide')) {
            showToast('error', 'Not enough credits', `Need ${formatCredits(betAmount)}`)
            resolve({ profit: 0 })
            return
        }
        setLastBet(betAmount)
        setLastWon(null)
        setToast(null)
        playSound('click')
        sfx.play('click')

        const { roll } = nextRoll('slide')
        const position = Math.round(roll * 1000) / 10 // 0..100 with 0.1 precision
        const won = position >= left && position <= right
        const returnAmount = won ? betAmount * payout : 0
        const profit = returnAmount - betAmount

        const events = buildEvents(api => {
            api.push(ROUND_EVENTS.ROUND_START, { left, right }, 0)
            api.push(ROUND_EVENTS.INPUT_LOCK, {}, 0)
            api.push(ROUND_EVENTS.BET_ACCEPTED, { betAmount, targetWidth, targetCenter }, 0)
            api.push(ROUND_EVENTS.RNG_REVEAL, { position }, TRAVEL_MS - 80)
            api.push(ROUND_EVENTS.ROUND_RESULT, {
                won,
                profit,
                multiplier: payout,
                position,
                left,
                right,
            }, TRAVEL_MS)
            api.push(ROUND_EVENTS.PAYOUT_PREVIEW, { amount: returnAmount }, TRAVEL_MS + 16)
            api.push(ROUND_EVENTS.INPUT_UNLOCK, {}, TRAVEL_MS + 220)
        })
        machine.start(events, { autoFinish: false })

        if (returnAmount > 0) addWinnings(returnAmount, 'Slide return')
        if (won && payout >= 5) {
            playSound('bigwin')
            setBigWin({ trigger: Date.now(), profit, multiplier: payout })
        } else {
            playSound(won ? 'win' : 'loss')
        }
        session.record({
            id: crypto.randomUUID(),
            label: `${won ? 'Hit' : 'Miss'} ${position.toFixed(1)}`,
            profit, betAmount, multiplier: won ? payout : 0,
            meta: { position, left, right, targetWidth, targetCenter },
        })
        showToast(won ? 'win' : 'loss', won ? 'Slide hit' : 'Slide miss', `${profit >= 0 ? '+' : ''}${formatCredits(profit)}`)

        setTimeout(() => resolve({ profit }), TRAVEL_MS + 240)
    })

    const recentProfit = session.history.slice(0, 12).reduce((sum, item) => sum + (item.profit || 0), 0)

    return (
        <GameShell
            definition={definition}
            balance={balance}
            accent="#4cc9f0"
            backdrop="/assets/games/backdrops/backdrop-felt-navy.png"
            variant="stake"
            panel={
                <BetPanel
                    balance={balance}
                    initialBet={5}
                    runningRound={running}
                    actionLabel="Slide"
                    onPlay={performPlay}
                    lastBet={lastBet}
                >
                    <div className="bp-section">
                        <label className="bp-label" htmlFor="slide-target-width">Target width: {targetWidth}%</label>
                        <input id="slide-target-width" type="range" min="5" max="80" step="1" value={targetWidth} disabled={running} onChange={e => setTargetWidth(Number(e.target.value))} className="dice-slider" />
                    </div>
                    <div className="bp-section">
                        <label className="bp-label" htmlFor="slide-target-center">Target center: {targetCenter}</label>
                        <input id="slide-target-center" type="range" min="0" max="100" step="1" value={targetCenter} disabled={running} onChange={e => setTargetCenter(Number(e.target.value))} className="dice-slider" />
                    </div>
                    <div className="bp-bal-line">
                        <span>Hit chance</span>
                        <strong>{(winChance * 100).toFixed(0)}%</strong>
                    </div>
                    <div className="bp-bal-line">
                        <span>Payout</span>
                        <strong>{payout.toFixed(2)}×</strong>
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
            <CoreStageFrame minHeight={520} maxWidth={840} loading={!preloader.ready} className="slide-stage-frame">
                <div className="slide-stage">
                    <RecentResultsStrip results={session.stats.lastResults} mode="multiplier" />
                    <div className="slide-track" data-mobile-critical-surface>
                        <div className="slide-target" style={{ left: `${left}%`, width: `${right - left}%` }} />
                        <div className={`slide-marker ${lastWon === true ? 'win' : lastWon === false ? 'lose' : ''}`} style={{ left: `${marker}%` }} />
                    </div>
                    <div className="slide-rule">
                        <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
                    </div>
                    <MultiplierBadge label="Payout" value={payout} state={running ? 'active' : lastWon === true ? 'win' : lastWon === false ? 'bust' : 'idle'} size="sm" />
                    <ActionLockOverlay active={running} label="Sliding..." />
                    <ResultToast result={toast} onDismiss={() => setToast(null)} />
                </div>
            </CoreStageFrame>
            <BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={getBigWinThreshold('slide')} />
            <EducationPanel definition={definition} betAmount={5} winProbability={winChance} payoutMultiplier={payout} balance={balance} recentProfit={recentProfit} />
        </GameShell>
    )
}
