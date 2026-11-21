import { useMemo } from 'react'
import EducationPanel from '../../EducationPanel'
import { formatCredits } from '../../../utils/simulationMath'
import { drawDistribution, precisePercent, twentyPlayRisk } from './drawEducationMath'

export default function DrawEducation({ game, picks, stake, balance, definition, recentProfit }) {
    const distribution = useMemo(() => drawDistribution(game, picks, stake), [game, picks, stake])
    const risk = useMemo(() => twentyPlayRisk(distribution, stake, balance), [distribution, stake, balance])
    if (!distribution) return <aside className="education-panel" id="game-info"><p>Select {game === 'keno' ? '1–10' : 'exactly 5'} numbers and a positive stake to see a payout quote.</p></aside>
    return <>
        <EducationPanel definition={definition} betAmount={stake} balance={balance} recentProfit={recentProfit}
            expectedGrossMultiplier={distribution.effectiveRtp} effectiveRtp={distribution.effectiveRtp}
            rtpLabel="RTP (this stake)" rtpNote="Full hypergeometric draw distribution; gross returns include the stake and are rounded to cents before calculating expected return. Paying is not the same as profit. See every hit count below." />
        <section className="education-panel" aria-label={`${definition?.name || game} payout distribution`}>
            <h3>Selected payout distribution · {picks} picks</h3>
            <p>Stake: {formatCredits(stake)} · Expected gross return: {formatCredits(distribution.expectedReturn)} · Paying probability: {precisePercent(distribution.payingProbability)}</p>
            <p>Nominal RTP before cent rounding: {precisePercent(distribution.nominalRtp)}</p>
            <table>
                <caption>{game === 'keno' ? 'Draw 10 from 40' : 'Draw 5 from 36'} · all hit counts, including nonpaying outcomes</caption>
                <thead><tr><th scope="col">Hits</th><th scope="col">Probability</th><th scope="col">Gross multiplier</th><th scope="col">Gross return</th></tr></thead>
                <tbody>{distribution.outcomes.map(row => <tr key={row.hits}><th scope="row">{row.hits}</th><td>{precisePercent(row.probability)}</td><td>{row.multiplier}×</td><td>{formatCredits(row.returnAmount)}</td></tr>)}</tbody>
            </table>
            <p>20-play funding risk: {risk === null ? 'Not quoted: wallet/stake is invalid or the exact calculation exceeds the interactive state limit.' : precisePercent(risk)}</p>
            <p>Probability your current wallet cannot fund one of the next 20 plays. Assumes independent fair draws, unchanged picks and fixed stake, cent-rounded returns reinvested, and no deposits, withdrawals, bonuses or other play. Stops when the wallet cannot cover the next stake; does not count inability to fund play 21. This is not a prediction or a guarantee.</p>
        </section>
    </>
}
