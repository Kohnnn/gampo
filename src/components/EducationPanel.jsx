import { formatCredits, bankrollRisk, expectedValue, round2 } from '../utils/simulationMath'
import { getGameEducation } from '../data/gameEducation'
import '../styles/education.css'

function percent(value) {
    return `${((Number(value) || 0) * 100).toFixed(2)}%`
}

function EducationPanel({
    definition,
    betAmount = 1,
    winProbability,
    payoutMultiplier,
    recentProfit = 0,
    balance = 0,
    effectiveRtp,
    // Expected gross return divided by the total charged betAmount, not a win payoff.
    expectedGrossMultiplier,
    // Conditional next action: probability, gross payoutMultiplier on success,
    // optional cashoutMultiplier available now, label, or settled: true.
    conditionalDecision,
    rtpLabel = 'RTP',
    rtpNote,
}) {
    const rtp = Number.isFinite(effectiveRtp) ? effectiveRtp : (definition?.rtp ?? 0.99)
    const edge = Number.isFinite(effectiveRtp) ? 1 - effectiveRtp : (definition?.houseEdge ?? (1 - rtp))
    const decision = conditionalDecision && !conditionalDecision.settled ? conditionalDecision : null
    const settled = conditionalDecision?.settled === true
    const probability = decision?.probability ?? winProbability
    const hasProbability = Number.isFinite(probability) && probability >= 0 && probability <= 1
    const distribution = Number.isFinite(expectedGrossMultiplier)
    const successReturn = decision ? round2(betAmount * decision.payoutMultiplier) : 0
    const cashoutReturn = decision?.cashoutMultiplier != null ? round2(betAmount * decision.cashoutMultiplier) : null
    const ev = settled ? null : decision
        ? round2(probability * successReturn - (cashoutReturn ?? betAmount))
        : distribution
            ? round2((expectedGrossMultiplier - 1) * betAmount)
            : Number.isFinite(effectiveRtp) || !hasProbability
                ? round2((rtp - 1) * betAmount)
                : expectedValue({ betAmount, winProbability: probability, payoutMultiplier: payoutMultiplier ?? (rtp / Math.max(0.01, probability)) })
    const ruin = hasProbability && !conditionalDecision && !distribution ? bankrollRisk({
        bankroll: balance,
        betAmount,
        lossProbability: 1 - probability,
        trials: 20,
    }) : null
    const details = getGameEducation(definition)

    return (
        <aside className="education-panel" id="game-info">
            <a className="education-scroll-hint" href="#game-info" data-scroll-hint>
                Game Info below
            </a>
            <div className="education-panel-header">
                <span>How to Play</span>
                <strong>{definition?.name || 'Game'}</strong>
            </div>

            <div className="education-grid">
                <div>
                    <span>{rtpLabel}</span>
                    <strong>{percent(rtp)}</strong>
                </div>
                <div>
                    <span>House edge</span>
                    <strong>{percent(edge)}</strong>
                </div>
                {!settled && <div>
                    <span>{decision ? `${decision.label || 'Next action'} success` : 'Win chance'}</span>
                    <strong>{hasProbability ? percent(probability) : 'Variable'}</strong>
                </div>}
                {decision && <>
                    <div>
                        <span>Round stake</span>
                        <strong>{formatCredits(betAmount)}</strong>
                    </div>
                    <div>
                        <span>Return on success</span>
                        <strong>{formatCredits(successReturn)} · {decision.payoutMultiplier.toFixed(2)}×</strong>
                    </div>
                    {decision.cashoutMultiplier != null && <div>
                        <span>Cashout now</span>
                        <strong>{formatCredits(cashoutReturn)}</strong>
                    </div>}
                </>}
                {ev !== null && <div>
                    <span>{decision ? (decision.cashoutMultiplier != null ? 'EV vs cashout' : 'First action EV') : 'EV per play'}</span>
                    <strong className={ev >= 0 ? 'positive' : 'negative'}>{formatCredits(ev)}</strong>
                </div>}
                <div>
                    <span>Volatility</span>
                    <strong>{definition?.volatility || 'Variable'}</strong>
                </div>
                {ruin !== null && <div>
                    <span>20-play risk</span>
                    <strong>{percent(ruin)}</strong>
                </div>}
            </div>
            {rtpNote && <p className="education-note">{rtpNote}</p>}
            {conditionalDecision && <p className="education-note">
                {settled ? 'Round settled. Start a new round for the next decision.' : decision.cashoutMultiplier != null
                    ? 'Conditional on reaching this point: compare the next action with cashing out now. A failure returns 0 GC.'
                    : 'First action after starting: success returns the amount shown; failure returns 0 GC. EV is relative to the round stake.'}
            </p>}

            <div className="education-note">
                <strong>Lesson</strong>
                <p>{definition?.lesson || 'Short-run results can diverge sharply from long-run expectation.'}</p>
            </div>

            <div className="education-details" aria-label={`${definition?.name || 'Game'} detailed explanation`}>
                <div>
                    <span>How to play</span>
                    <p>{details.objective}</p>
                </div>
                <div>
                    <span>Payout model</span>
                    <p>{details.payout}</p>
                </div>
                <div>
                    <span>Decision cue</span>
                    <p>{details.strategy}</p>
                </div>
                <div>
                    <span>Risk note</span>
                    <p>{details.risk}</p>
                </div>
            </div>

            <div className="education-note compact">
                <span>Recent session P/L</span>
                <strong className={recentProfit >= 0 ? 'positive' : 'negative'}>{formatCredits(recentProfit)}</strong>
            </div>
        </aside>
    )
}

export default EducationPanel
