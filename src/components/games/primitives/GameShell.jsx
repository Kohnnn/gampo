// Shared Stake/Rainbet-style 3-pane game shell. Bet panel left, playfield center,
// stats + history right. Title bar at top. Glass-bevel theme.

import { Link } from 'react-router-dom'
import { formatCredits } from '../../../utils/simulationMath'
import GameToolbar from './GameToolbar'

export default function GameShell({
    definition,
    balance,
    accent = '#00e701',
    backdrop,
    title,
    panel,
    children,
    aside,
    titleBarExtras,
    helpHref,
}) {
    const extras = titleBarExtras !== undefined ? titleBarExtras : <GameToolbar helpHref={helpHref} />
    return (
        <div className="game-shell" style={{ '--accent': accent, '--shell-backdrop': backdrop ? `url("${backdrop}")` : 'none' }}>
            <div className="gs-titlebar">
                <div>
                    <Link to="/" className="gs-back">‹ Hub</Link>
                    <h1>{title || definition?.name}</h1>
                    <small>{definition?.category}</small>
                </div>
                <div className="gs-titlebar-extras">{extras}</div>
                <div className="gs-balance">
                    <span>Balance</span>
                    <strong>{formatCredits(balance || 0)}</strong>
                </div>
            </div>
            <div className="gs-layout">
                <div className="gs-panel">{panel}</div>
                <div className="gs-playfield">{children}</div>
                <div className="gs-aside">{aside}</div>
            </div>
        </div>
    )
}
