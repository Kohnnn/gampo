import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, TrendingUp, TrendingDown, Flame, Snowflake } from 'lucide-react'
import { useGlobalPnl } from '../hooks/useGlobalPnl'
import { buildSessionInsights, rtpConfidenceBand } from '../utils/sessionInsights'
import { findGameDefinition } from '../data/gameDefinitions'
import { formatCredits } from '../utils/simulationMath'
import '../styles/insights.css'

function pct(v) {
    if (v == null) return '—'
    return `${(v * 100).toFixed(1)}%`
}

export default function InsightsPage() {
    const { history } = useGlobalPnl()

    const allTime = useMemo(() => buildSessionInsights(history.alltime), [history.alltime])
    const session = useMemo(() => buildSessionInsights(history.session), [history.session])

    // Wager-weighted theoretical RTP across the games actually played, and the
    // 95% variance band around it for the current sample size.
    const theoretical = useMemo(() => {
        let wagered = 0
        let weighted = 0
        for (const g of allTime.games) {
            const def = findGameDefinition(g.gameId)
            const rtp = Number.isFinite(def?.rtp) ? def.rtp : 0.97
            wagered += g.wagered
            weighted += rtp * g.wagered
        }
        const rtp = wagered > 0 ? weighted / wagered : null
        const band = rtp != null ? rtpConfidenceBand(rtp, allTime.count) : null
        return { rtp, band }
    }, [allTime.games, allTime.count])

    const empty = allTime.count === 0

    return (
        <div className="insights-page" data-ux-surface="stage">
            <section className="insights-hero" data-ux-surface="stage">
                <span className="insights-kicker"><BarChart3 size={18} /> Session insight</span>
                <h1>Your variance, in numbers</h1>
                <p>
                    Realized return, swings, and streaks across everything you've played — so you can see
                    the difference between luck and the underlying math.
                </p>
            </section>

            {empty ? (
                <div className="insights-empty">
                    <BarChart3 size={32} />
                    <p>Play a few rounds and your stats will appear here.</p>
                    <Link to="/originals" className="insights-cta" data-ux-primary-action>Browse games →</Link>
                </div>
            ) : (
                <>
                    <div className="insights-scope-grid">
                        <ScopeCard title="This session" data={session} />
                        <ScopeCard title="All time" data={allTime} highlight />
                    </div>

                    <section className="insights-panel" data-ux-surface="aside">
                        <h2>Realized vs expected return</h2>
                        <p className="insights-help">
                            Realized RTP is what you actually got back per credit wagered. Over a small
                            sample it swings wildly; the more you play, the closer it drifts toward each
                            game's built-in house edge.
                        </p>
                        <div className="insights-rtp-row">
                            <div className="insights-rtp-figure" data-tone={(allTime.realizedRtp ?? 1) >= 1 ? 'pos' : 'neg'}>
                                <span>Realized RTP (all time)</span>
                                <strong>{pct(allTime.realizedRtp)}</strong>
                                <em>{allTime.reliable ? `${allTime.count} rounds — meaningful sample` : `${allTime.count} rounds — still mostly luck`}</em>
                            </div>
                            <div className="insights-rtp-figure">
                                <span>House take (all time)</span>
                                <strong>{formatCredits(allTime.houseTake)}</strong>
                                <em>What the edge has cost across {formatCredits(allTime.wagered)} wagered</em>
                            </div>
                        </div>
                        {theoretical.band && (
                            <p className="insights-band">
                                Expected return for these games is <strong>{pct(theoretical.rtp)}</strong>.
                                This Illustrative 95% estimate uses a simplified variance model: with {allTime.count} rounds, results between{' '}
                                <strong>{pct(theoretical.band.lower)}</strong> and <strong>{pct(theoretical.band.upper)}</strong>{' '}
                                are just normal variance. Your <strong>{pct(allTime.realizedRtp)}</strong> is{' '}
                                {allTime.realizedRtp != null && (allTime.realizedRtp < theoretical.band.lower || allTime.realizedRtp > theoretical.band.upper)
                                    ? 'outside that band — an unusual run, but it converges with more play.'
                                    : 'right where the math expects it.'}
                            </p>
                        )}
                        <p className="insights-realstakes">
                            At a real <strong>$1 / credit</strong> stake, your {formatCredits(allTime.wagered)} of
                            volume would mean a net of{' '}
                            <strong className={allTime.realStakes.net >= 0 ? 'pos' : 'neg'}>
                                {allTime.realStakes.net >= 0 ? '+' : ''}${Math.abs(allTime.realStakes.net).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </strong>
                            . Virtual balance only — no real money is ever at risk.
                        </p>
                    </section>

                    <section className="insights-panel" data-ux-surface="aside">
                        <h2>Streaks & swings</h2>
                        <div className="insights-stat-grid">
                            <Stat icon={<Flame size={15} />} label="Longest win streak" value={allTime.streaks.bestWin} />
                            <Stat icon={<Snowflake size={15} />} label="Longest losing streak" value={allTime.streaks.bestLoss} />
                            <Stat icon={<TrendingUp size={15} />} label="Biggest win" value={formatCredits(allTime.biggestWin)} tone="pos" />
                            <Stat icon={<TrendingDown size={15} />} label="Biggest loss" value={formatCredits(allTime.biggestLoss)} tone="neg" />
                            <Stat label="Win rate" value={pct(allTime.winRate)} />
                            <Stat label="Average bet" value={formatCredits(allTime.avgBet)} />
                        </div>
                    </section>

                    <section className="insights-panel" data-ux-surface="aside">
                        <h2>By game</h2>
                        <div className="insights-table" role="table" aria-label="Per-game breakdown">
                            <div className="insights-tr insights-th" role="row">
                                <span role="columnheader">Game</span>
                                <span role="columnheader">Rounds</span>
                                <span role="columnheader">RTP</span>
                                <span role="columnheader">Net</span>
                            </div>
                            {allTime.games.slice(0, 12).map(g => {
                                const def = findGameDefinition(g.gameId)
                                return (
                                    <div className="insights-tr" role="row" key={g.gameId}>
                                        <span role="cell">{def?.name || g.gameId}</span>
                                        <span role="cell">{g.count}</span>
                                        <span role="cell">{pct(g.rtp)}</span>
                                        <span role="cell" className={g.profit >= 0 ? 'pos' : 'neg'}>
                                            {g.profit >= 0 ? '+' : ''}{formatCredits(g.profit)}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    </section>
                </>
            )}

            <footer className="insights-foot">
                <Link to="/sandbox" data-ux-primary-action>Try the challenges →</Link>
            </footer>
        </div>
    )
}

function ScopeCard({ title, data, highlight }) {
    return (
        <div className={`insights-scope ${highlight ? 'highlight' : ''}`}>
            <h3>{title}</h3>
            <div className="insights-scope-net" data-tone={data.profit >= 0 ? 'pos' : 'neg'}>
                {data.profit >= 0 ? '+' : ''}{formatCredits(data.profit)}
            </div>
            <div className="insights-scope-meta">
                <span>{data.count} rounds</span>
                <span>{data.wins}W / {data.losses}L</span>
                <span>RTP {pct(data.realizedRtp)}</span>
            </div>
        </div>
    )
}

function Stat({ icon, label, value, tone = '' }) {
    return (
        <div className="insights-stat">
            <span>{icon}{label}</span>
            <strong className={tone}>{value}</strong>
        </div>
    )
}
