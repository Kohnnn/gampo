import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FlaskConical, Play, RotateCcw, TrendingDown } from 'lucide-react'
import { runStrategySandbox, STRATEGIES } from '../utils/strategySandbox'
import { gameDefinitions } from '../data/gameDefinitions'
import { formatCredits } from '../utils/simulationMath'
import { recordLearningEvent } from '../hooks/useProgress'
import '../styles/sandbox.css'

const PRESETS = [
    { id: 'cointoss', name: 'Coin toss (≈50/50)', winChance: 0.495, payoutMultiplier: 2 },
    { id: 'evenroulette', name: 'Roulette even-money', winChance: 18 / 37, payoutMultiplier: 2 },
    { id: 'dice-2x', name: 'Dice 2× (49.5%)', winChance: 0.495, payoutMultiplier: 2 },
    { id: 'highrisk', name: 'High risk 5× (19%)', winChance: 0.19, payoutMultiplier: 5 },
]

function pct(v) { return `${((Number(v) || 0) * 100).toFixed(1)}%` }

export default function StrategySandboxPage() {
    const [strategy, setStrategy] = useState('flat')
    const [preset, setPreset] = useState('cointoss')
    const [startBalance, setStartBalance] = useState(1000)
    const [baseBet, setBaseBet] = useState(10)
    const [rounds, setRounds] = useState(200)
    const [runs, setRuns] = useState(2000)
    const [pctOfBankroll, setPctOfBankroll] = useState(5)
    const [result, setResult] = useState(null)
    const [running, setRunning] = useState(false)

    const activePreset = PRESETS.find(p => p.id === preset) || PRESETS[0]
    const activeStrategy = STRATEGIES.find(s => s.id === strategy) || STRATEGIES[0]

    const run = () => {
        setRunning(true)
        // Defer so the button shows its pressed state before the synchronous sim.
        setTimeout(() => {
            const r = runStrategySandbox({
                strategy,
                startBalance: Number(startBalance) || 1000,
                baseBet: Number(baseBet) || 10,
                winChance: activePreset.winChance,
                payoutMultiplier: activePreset.payoutMultiplier,
                rounds: Number(rounds) || 200,
                runs: Number(runs) || 2000,
                pctOfBankroll: Number(pctOfBankroll) || 5,
                seed: Math.floor(Math.random() * 1e9),
            })
            setResult(r)
            setRunning(false)
            recordLearningEvent('sandbox')
        }, 20)
    }

    const maxBucket = useMemo(() => {
        if (!result) return 1
        return Math.max(1, ...result.histogram.map(b => b.count))
    }, [result])

    return (
        <div className="sandbox-page" data-ux-surface="stage">
            <section className="sandbox-hero" data-ux-surface="stage">
                <div>
                    <span className="sandbox-kicker"><FlaskConical size={18} /> Strategy sandbox</span>
                    <h1>Test any betting system, risk-free</h1>
                    <p>
                        Simulate thousands of sessions of a staking strategy against a chosen game's
                        true odds. See where the bankroll actually ends up — no system beats a negative edge.
                    </p>
                </div>
            </section>

            <div className="sandbox-grid">
                <form
                    className="sandbox-controls"
                    data-ux-surface="controls"
                    onSubmit={(e) => { e.preventDefault(); run() }}
                >
                    <label className="sandbox-field">
                        <span>Game odds</span>
                        <select value={preset} onChange={e => setPreset(e.target.value)}>
                            {PRESETS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <small>{pct(activePreset.winChance)} to win · {activePreset.payoutMultiplier}× payout</small>
                    </label>

                    <label className="sandbox-field">
                        <span>Strategy</span>
                        <select value={strategy} onChange={e => setStrategy(e.target.value)}>
                            {STRATEGIES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <small>{activeStrategy.detail}</small>
                    </label>

                    <div className="sandbox-row">
                        <label className="sandbox-field">
                            <span>Start balance</span>
                            <input type="number" min="1" value={startBalance} onChange={e => setStartBalance(e.target.value)} />
                        </label>
                        <label className="sandbox-field">
                            <span>Base bet</span>
                            <input type="number" min="1" value={baseBet} onChange={e => setBaseBet(e.target.value)} />
                        </label>
                    </div>

                    {strategy === 'percentage' && (
                        <label className="sandbox-field">
                            <span>% of bankroll</span>
                            <input type="number" min="0.1" max="100" value={pctOfBankroll} onChange={e => setPctOfBankroll(e.target.value)} />
                        </label>
                    )}

                    <div className="sandbox-row">
                        <label className="sandbox-field">
                            <span>Rounds / session</span>
                            <input type="number" min="1" max="5000" value={rounds} onChange={e => setRounds(e.target.value)} />
                        </label>
                        <label className="sandbox-field">
                            <span>Sessions</span>
                            <input type="number" min="1" max="20000" value={runs} onChange={e => setRuns(e.target.value)} />
                        </label>
                    </div>

                    <button type="submit" className="sandbox-run" disabled={running} data-ux-primary-action>
                        {running ? <><RotateCcw size={16} className="spin" /> Simulating…</> : <><Play size={16} /> Run {Number(runs).toLocaleString()} sessions</>}
                    </button>
                    <p className="sandbox-disclaimer">Educational simulation with practice credits. Results are random each run.</p>
                </form>

                <div className="sandbox-results" data-ux-surface="aside">
                    {!result ? (
                        <div className="sandbox-empty">
                            <TrendingDown size={32} />
                            <p>Run a simulation to see the bankroll outcome distribution.</p>
                        </div>
                    ) : (
                        <>
                            <div className="sandbox-verdict" data-tone={result.expectedNetPerRun >= 0 ? 'pos' : 'neg'}>
                                <span>Average end balance after {result.input.rounds} rounds</span>
                                <strong>{formatCredits(result.meanFinal)}</strong>
                                <em>
                                    {result.expectedNetPerRun >= 0 ? '+' : ''}{formatCredits(result.expectedNetPerRun)} vs your {formatCredits(result.input.startBalance)} start
                                </em>
                            </div>

                            <div className="sandbox-stats">
                                <Stat label="Median end" value={formatCredits(result.medianFinal)} />
                                <Stat label="Went bust" value={pct(result.bustRate)} tone={result.bustRate > 0.2 ? 'neg' : ''} />
                                <Stat label="Ended ahead" value={pct(result.profitableRate)} />
                                <Stat label="Worst 5%" value={formatCredits(result.p05)} tone="neg" />
                                <Stat label="Best 5%" value={formatCredits(result.p95)} tone="pos" />
                                <Stat label="Biggest single bet" value={formatCredits(result.maxBetSeen)} />
                            </div>

                            <div className="sandbox-hist" aria-label="Distribution of final balances">
                                <span className="sandbox-hist-title">Where {Number(result.runs).toLocaleString()} sessions ended up</span>
                                <div className="sandbox-bars">
                                    {result.histogram.map((b, i) => (
                                        <div key={i} className="sandbox-bar-col" title={`${formatCredits(b.from)}–${formatCredits(b.to)}: ${b.count}`}>
                                            <div
                                                className="sandbox-bar"
                                                style={{ height: `${(b.count / maxBucket) * 100}%` }}
                                                data-zero={b.from <= result.input.startBalance && b.to >= result.input.startBalance ? 'true' : undefined}
                                            />
                                        </div>
                                    ))}
                                </div>
                                <div className="sandbox-hist-axis">
                                    <span>{formatCredits(result.histogram[0].from)}</span>
                                    <span>final balance →</span>
                                    <span>{formatCredits(result.histogram[result.histogram.length - 1].to)}</span>
                                </div>
                            </div>

                            <p className="sandbox-lesson">
                                <strong>Lesson:</strong> the house edge is {pct(1 - (activePreset.winChance * activePreset.payoutMultiplier))} per round.
                                Staking systems change the <em>shape</em> of the distribution (more busts, bigger swings) but
                                can't move the average above your starting bankroll on a negative-edge game.
                            </p>
                        </>
                    )}
                </div>
            </div>

            <footer className="sandbox-foot">
                <Link to="/learn">← Back to learn</Link>
            </footer>
        </div>
    )
}

function Stat({ label, value, tone = '' }) {
    return (
        <div className="sandbox-stat">
            <span>{label}</span>
            <strong className={tone}>{value}</strong>
        </div>
    )
}
