// Shared Stake/Rainbet-style 3-pane game shell. Bet panel left, playfield center,
// stats + history right. Title bar at top. Glass-bevel theme.
//
// `variant` controls top-level skin tokens. `stake` is the default and matches
// the implementation guide. `rainbet` polish is borrowed into the default skin
// rather than a separate switch (per Wave plan 2026-05-23).

import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { formatCredits } from '../../../utils/simulationMath'
import { resolveImage } from '../../../utils/assetPaths'
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
    primaryStage = false,
    secondary,
    titleBarExtras,
    helpHref = '#game-info',
    variant = 'stake',
    // Live selection owned by the game (see OddsPopup). Optional: games that
    // cannot state authoritative conditions leave these undefined and the popup
    // reports "Unavailable" rather than inventing figures.
    odds,
    betAmount,
}) {
    const shellRef = useRef(null)
    const titlebarRef = useRef(null)
    const playfieldRef = useRef(null)

    useEffect(() => {
        if (!primaryStage) return undefined
        const shell = shellRef.current
        const playfield = playfieldRef.current
        if (!shell || !playfield) return undefined
        let frame = 0
        let height = ''
        let reserve = ''
        const observedDocks = new Set()
        const dockSelector = '[data-mobile-action-dock], [data-slot-mobile-dock], .mobile-bottom-nav'
        const measure = () => {
            frame = 0
            const shellRect = shell.getBoundingClientRect()
            // Scroll position must not change the primary stage's own budget.
            const top = playfield.getBoundingClientRect().top + shell.scrollTop
            const viewportBottom = window.visualViewport
                ? window.visualViewport.offsetTop + window.visualViewport.height
                : window.innerHeight
            let bottom = Math.min(shellRect.bottom, viewportBottom)
            const docks = new Set(document.querySelectorAll(dockSelector))
            observedDocks.forEach(dock => {
                if (!docks.has(dock)) {
                    observer.unobserve(dock)
                    observedDocks.delete(dock)
                }
            })
            docks.forEach(dock => {
                if (!observedDocks.has(dock)) {
                    observer.observe(dock)
                    observedDocks.add(dock)
                }
                const rect = dock.getBoundingClientRect()
                if (rect.width > 0 && rect.height > 0 && rect.top < bottom && rect.bottom > shellRect.top) {
                    bottom = rect.top
                }
            })
            const gap = parseFloat(getComputedStyle(shell).rowGap) || 0
            const nextHeight = `${Math.max(0, bottom - top - gap)}px`
            const nextReserve = `${Math.max(0, shellRect.bottom - bottom)}px`
            if (height !== nextHeight) {
                height = nextHeight
                shell.style.setProperty('--gs-primary-height', height)
            }
            if (reserve !== nextReserve) {
                reserve = nextReserve
                shell.style.setProperty('--gs-bottom-reserve', reserve)
            }
        }
        const schedule = () => { if (!frame) frame = requestAnimationFrame(measure) }
        const observer = new ResizeObserver(schedule)
        observer.observe(shell)
        observer.observe(titlebarRef.current)
        observer.observe(shell.parentElement)
        window.addEventListener('resize', schedule)
        window.visualViewport?.addEventListener('resize', schedule)
        schedule()
        return () => {
            observer.disconnect()
            window.removeEventListener('resize', schedule)
            window.visualViewport?.removeEventListener('resize', schedule)
            if (frame) cancelAnimationFrame(frame)
            shell.style.removeProperty('--gs-primary-height')
            shell.style.removeProperty('--gs-bottom-reserve')
        }
    }, [primaryStage])

    const extras = titleBarExtras !== undefined
        ? titleBarExtras
        : (
            <>
                <GameToolbar helpHref={helpHref} definition={definition} balance={balance} odds={odds} betAmount={betAmount} />
                <AudioToggle />
            </>
        )
    const safeVariant = variant === 'rainbet' ? 'rainbet' : 'stake'
    const playfieldLabel = `${title || definition?.name || 'Game'} playfield`
    const backdropSrc = resolveImage(backdrop)
    return (
        <div
            className={`game-shell gs-variant-${safeVariant}`}
            ref={shellRef}
            data-primary-stage={primaryStage || undefined}
            data-variant={safeVariant}
            data-ux-surface="shell"
            style={{ '--accent': accent, '--shell-backdrop': backdropSrc ? `url("${backdropSrc}")` : 'none' }}
        >
            <div className="gs-titlebar" ref={titlebarRef} data-ux-surface="shell">
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
                <div className="gs-panel" data-ux-surface="controls">{panel}</div>
                <div className="gs-playfield" ref={playfieldRef} role="region" aria-label={playfieldLabel} tabIndex={0} data-mobile-scroll-surface data-ux-surface="stage">{children}</div>
                <div className="gs-aside" data-ux-surface="aside">{aside}</div>
            </div>
            {secondary && <div className="gs-secondary" data-ux-surface="aside">{secondary}</div>}
        </div>
    )
}
