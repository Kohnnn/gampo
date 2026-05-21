// Lightweight simulated player strip for the Crash game. Renders ephemeral
// rows that mirror what other "players" did this round: their bet, target,
// and whether they cashed out before the bust point.
//
// Pure presentational: parent passes `players` from the round simulation.

export default function PlayerStrip({ players = [], phase = 'idle', multiplier = 1 }) {
    if (!players.length) return null
    return (
        <ul className="crash-player-strip" aria-label="Other players">
            {players.map(p => {
                const liveCashed = phase === 'running' && p.cashed && multiplier >= p.target
                const pending = phase === 'running' && !liveCashed
                const rowState = pending ? 'pending' : p.cashed ? 'cashed' : 'busted'
                return (
                <li key={p.id} className={`crash-player-row ${rowState}`}>
                    <span className="crash-player-name">
                        <span className="crash-player-dot" style={{ background: p.color }} />
                        {p.name}
                    </span>
                    <span className="crash-player-bet">{p.bet.toFixed(2)}</span>
                    <span className="crash-player-target">@{p.target.toFixed(2)}×</span>
                    <span className="crash-player-result">
                        {pending ? 'live' : p.cashed ? `+${(p.bet * (p.cashedAt - 1)).toFixed(2)}` : `-${p.bet.toFixed(2)}`}
                    </span>
                </li>
                )
            })}
        </ul>
    )
}
