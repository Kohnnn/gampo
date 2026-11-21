// Shared Stake/Rainbet-style 3-pane game shell. Bet panel left, playfield center,
// stats + history right. Title bar at top. Glass-bevel theme.
//
// `variant` controls top-level skin tokens. `stake` is the default and matches
// the implementation guide. `rainbet` polish is borrowed into the default skin
// rather than a separate switch (per Wave plan 2026-05-23).

import { useLayoutEffect, useRef } from 'react'
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

    useLayoutEffect(() => {
        if (!primaryStage) return undefined
        const shell = shellRef.current
        const playfield = playfieldRef.current
        if (!shell || !playfield) return undefined
        let frame = 0
        let height = ''
        let reserve = ''
        const observedDocks = new Set()
        const landscape = window.matchMedia('(min-width: 561px) and (max-width: 768px) and (max-height: 520px) and (orientation: landscape)')
        const clearDockRail = dock => {
            dock.removeAttribute('data-primary-landscape-dock')
            for (const name of ['left', 'width', 'bottom']) dock.style.removeProperty(`--gs-controls-${name}`)
        }
        const dockSelector = '[data-mobile-action-dock], [data-slot-mobile-dock], .mobile-bottom-nav'
        const measure = () => {
            frame = 0
            const shellRect = shell.getBoundingClientRect()
            // Scroll position must not change the primary stage's own budget.
            const fieldRect = playfield.getBoundingClientRect()
            const top = fieldRect.top + shell.scrollTop
            const viewportBottom = window.visualViewport
                ? window.visualViewport.offsetTop + window.visualViewport.height
                : window.innerHeight
            let bottom = Math.min(shellRect.bottom, viewportBottom)
            const shellStyle = getComputedStyle(shell)
            const gap = parseFloat(shellStyle.rowGap) || 0
            const nav = document.querySelector('.mobile-bottom-nav')?.getBoundingClientRect()
            const rail = titlebarRef.current.getBoundingClientRect()
            const railBottom = nav?.width > 0 && nav?.height > 0 ? nav.top : viewportBottom
            const docks = new Set(document.querySelectorAll(dockSelector))
            observedDocks.forEach(dock => {
                if (!docks.has(dock)) {
                    observer.unobserve(dock)
                    clearDockRail(dock)
                    observedDocks.delete(dock)
                }
            })
            docks.forEach(dock => {
                if (!observedDocks.has(dock)) {
                    observer.observe(dock)
                    observedDocks.add(dock)
                }
                if (landscape.matches && !dock.matches('.mobile-bottom-nav')) {
                    dock.setAttribute('data-primary-landscape-dock', '')
                    const values = {
                        left: rail.left,
                        width: rail.width,
                        bottom: Math.max(0, viewportBottom - railBottom + gap),
                    }
                    for (const [name, value] of Object.entries(values)) {
                        const property = `--gs-controls-${name}`
                        if (dock.style.getPropertyValue(property) !== `${value}px`) dock.style.setProperty(property, `${value}px`)
                    }
                } else {
                    clearDockRail(dock)
                }
                const rect = dock.getBoundingClientRect()
                const crossesPlayer = rect.right > fieldRect.left && rect.left < fieldRect.right
                if (crossesPlayer && rect.width > 0 && rect.height > 0 && rect.top < bottom && rect.bottom > shellRect.top) {
                    bottom = rect.top
                }
            })
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
        // Fullscreen removes and recreates the slot portal without resizing
        // the shell. Observe only body-level portal identity changes.
        const portals = new MutationObserver(records => {
            for (const record of records) {
                for (const node of [...record.addedNodes, ...record.removedNodes]) {
                    if (node.nodeType === 1 && (node.matches(dockSelector) || node.querySelector(dockSelector))) {
                        schedule()
                        return
                    }
                }
            }
        })
        portals.observe(document.body, { childList: true })
        window.addEventListener('resize', schedule)
        window.visualViewport?.addEventListener('resize', schedule)
        schedule()
        return () => {
            observer.disconnect()
            portals.disconnect()
            window.removeEventListener('resize', schedule)
            window.visualViewport?.removeEventListener('resize', schedule)
            if (frame) cancelAnimationFrame(frame)
            shell.style.removeProperty('--gs-primary-height')
            shell.style.removeProperty('--gs-bottom-reserve')
            observedDocks.forEach(clearDockRail)
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
