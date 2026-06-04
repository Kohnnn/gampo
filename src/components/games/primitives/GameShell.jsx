// Shared Stake/Rainbet-style 3-pane game shell. Bet panel left, playfield center,
// stats + history right. Title bar at top. Glass-bevel theme.
//
// `variant` controls top-level skin tokens. `stake` is the default and matches
// the implementation guide. `rainbet` polish is borrowed into the default skin
// rather than a separate switch (per Wave plan 2026-05-23).

import { Link } from 'react-router-dom'
import { formatCredits } from '../../../utils/simulationMath'
import GameToolbar from './GameToolbar'
import AudioToggle from './AudioToggle'

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
    variant = 'stake',
}) {
    const extras = titleBarExtras !== undefined
        ? titleBarExtras
        : (
            <>
                <GameToolbar helpHref={helpHref} definition={definition} />
                <AudioToggle />
            </>
        )
    const safeVariant = variant === 'rainbet' ? 'rainbet' : 'stake'
    const playfieldLabel = `${title || definition?.name || 'Game'} playfield`
    return (
        <div
            className={`game-shell gs-variant-${safeVariant}`}
            data-variant={safeVariant}
            style={{ '--accent': accent, '--shell-backdrop': backdrop ? `url("${backdrop}")` : 'none' }}
        >
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
                <div className="gs-playfield" role="region" aria-label={playfieldLabel} tabIndex={0} data-mobile-scroll-surface>{children}</div>
                <div className="gs-aside">{aside}</div>
            </div>
        </div>
    )
}
