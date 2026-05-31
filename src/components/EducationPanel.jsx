import { formatCredits, bankrollRisk, expectedValue } from '../utils/simulationMath'
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
}) {
    const rtp = definition?.rtp ?? 0.99
    const edge = definition?.houseEdge ?? (1 - rtp)
    const probability = winProbability ?? rtp / Math.max(1.01, payoutMultiplier || 2)
    const multiplier = payoutMultiplier || (rtp / Math.max(0.01, probability))
    const ev = expectedValue({ betAmount, winProbability: probability, payoutMultiplier: multiplier })
    const ruin = bankrollRisk({
        bankroll: balance,
        betAmount,
        lossProbability: 1 - probability,
        trials: 20,
    })
    const details = getGameEducation(definition)

    return (
        <aside className="education-panel">
            <div className="education-panel-header">
                <span>Probability Lab</span>
                <strong>{definition?.name || 'Simulator'}</strong>
            </div>

            <div className="education-grid">
                <div>
                    <span>RTP</span>
                    <strong>{percent(rtp)}</strong>
                </div>
                <div>
                    <span>House edge</span>
                    <strong>{percent(edge)}</strong>
                </div>
                <div>
                    <span>Win chance</span>
                    <strong>{percent(probability)}</strong>
                </div>
                <div>
                    <span>EV per play</span>
                    <strong className={ev >= 0 ? 'positive' : 'negative'}>{formatCredits(ev)}</strong>
                </div>
                <div>
                    <span>Volatility</span>
                    <strong>{definition?.volatility || 'Variable'}</strong>
                </div>
                <div>
                    <span>20-play risk</span>
                    <strong>{percent(ruin)}</strong>
                </div>
            </div>

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
