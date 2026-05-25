// Compact toolbar mounted in GameShell.titleBarExtras for every game.
// Wave 21: Game tools popover now portals into a fixed positioned layer
// anchored under the trigger so it visually escapes the titlebar grid
// (parity with Odds popup). Backdrop closes on click; Escape closes too.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
    Volume2, VolumeX,
    Eye, EyeOff,
    Maximize2, Minimize2,
    Shield, HelpCircle, BarChart3, Wrench, X,
} from 'lucide-react'
import { useAudio } from '../../../audio/AudioProvider'
import { useReduceMotion } from '../../fx'
import FairnessDrawer from './FairnessDrawer'
import HotkeyHelp from './HotkeyHelp'
import OddsPopup from './OddsPopup'
import VolumeMixer from './VolumeMixer'

export default function GameToolbar({ helpHref, definition }) {
    const { muted, toggle: toggleMute } = useAudio()
    const [reduceMotion, setReduceMotion] = useReduceMotion()
    const [fullscreen, setFullscreen] = useState(() => Boolean(document.fullscreenElement))
    const [fairOpen, setFairOpen] = useState(false)
    const [hotkeyOpen, setHotkeyOpen] = useState(false)
    const [oddsOpen, setOddsOpen] = useState(false)
    const [popoverOpen, setPopoverOpen] = useState(false)
    const triggerRef = useRef(null)
    const popoverRef = useRef(null)
    const [pos, setPos] = useState({ top: 0, left: 0, ready: false })

    useEffect(() => {
        const sync = () => setFullscreen(Boolean(document.fullscreenElement))
        document.addEventListener('fullscreenchange', sync)
        return () => document.removeEventListener('fullscreenchange', sync)
    }, [])

    // Reposition the popover under the trigger whenever it opens or the
    // viewport changes. The popover is fixed-positioned (portal) so it
    // escapes any titlebar overflow/clipping.
    const reposition = useCallback(() => {
        if (!triggerRef.current) return
        const r = triggerRef.current.getBoundingClientRect()
        const popoverWidth = 230
        // Anchor at the right edge of the trigger; clamp within viewport.
        let left = r.right - popoverWidth
        const maxLeft = window.innerWidth - popoverWidth - 8
        if (left > maxLeft) left = maxLeft
        if (left < 8) left = 8
        const top = r.bottom + 8
        setPos({ top, left, ready: true })
    }, [])

    useLayoutEffect(() => {
        if (!popoverOpen) return undefined
        reposition()
        window.addEventListener('resize', reposition)
        window.addEventListener('scroll', reposition, true)
        return () => {
            window.removeEventListener('resize', reposition)
            window.removeEventListener('scroll', reposition, true)
        }
    }, [popoverOpen, reposition])

    // Close the popover on outside click or Escape. Trigger button is
    // outside the portal so we exclude it from the outside-click test.
    useEffect(() => {
        if (!popoverOpen) return undefined
        const onDown = (e) => {
            const popover = popoverRef.current
            const trigger = triggerRef.current
            if (popover && popover.contains(e.target)) return
            if (trigger && trigger.contains(e.target)) return
            setPopoverOpen(false)
        }
        const onKey = (e) => {
            if (e.key === 'Escape') setPopoverOpen(false)
        }
        window.addEventListener('mousedown', onDown)
        window.addEventListener('keydown', onKey)
        return () => {
            window.removeEventListener('mousedown', onDown)
            window.removeEventListener('keydown', onKey)
        }
    }, [popoverOpen])

    const toggleFullscreen = useCallback(() => {
        try {
            if (document.fullscreenElement) {
                document.exitFullscreen?.()
            } else {
                document.documentElement.requestFullscreen?.()
            }
        } catch { /* ignore */ }
    }, [])

    const openFairness = () => { setFairOpen(true); setPopoverOpen(false) }
    const openHotkeys = () => { setHotkeyOpen(true); setPopoverOpen(false) }
    const openOdds = () => { setOddsOpen(true); setPopoverOpen(false) }

    const popover = popoverOpen && pos.ready && createPortal(
        <div
            ref={popoverRef}
            className="gt-popover gt-popover-portal"
            role="menu"
            aria-label="Game tools menu"
            style={{ top: pos.top, left: pos.left }}
        >
            <button type="button" className="gt-popover-item" role="menuitem" onClick={openFairness}>
                <Shield size={14} />
                <span>Provably fair</span>
            </button>
            <button type="button" className="gt-popover-item" role="menuitem" onClick={openOdds}>
                <BarChart3 size={14} />
                <span>Odds &amp; RTP</span>
            </button>
            <button type="button" className="gt-popover-item" role="menuitem" onClick={openHotkeys}>
                <HelpCircle size={14} />
                <span>Keyboard shortcuts</span>
            </button>
            {helpHref && (
                <a className="gt-popover-item" role="menuitem" href={helpHref} target="_blank" rel="noreferrer noopener">
                    <HelpCircle size={14} />
                    <span>Game help</span>
                </a>
            )}
            <button type="button" className="gt-popover-close" onClick={() => setPopoverOpen(false)} aria-label="Close menu">
                <X size={12} />
            </button>
        </div>,
        document.body,
    )

    return (
        <>
            <div className="gt-toolbar">
                <div className="gt-group" role="group" aria-label="Display">
                    <button className="gt-btn" aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute (audio off)' : 'Mute (audio on)'} onClick={toggleMute}>
                        {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                    </button>
                    <VolumeMixer />
                    <button className="gt-btn" aria-label={reduceMotion ? 'Enable motion' : 'Reduce motion'} title={reduceMotion ? 'Reduced motion (on)' : 'Reduced motion (off)'} onClick={() => setReduceMotion(v => !v)}>
                        {reduceMotion ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button className="gt-btn" aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} title={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} onClick={toggleFullscreen}>
                        {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    </button>
                </div>
                <span className="gt-divider" aria-hidden="true" />
                <div className="gt-group gt-tools-group" role="group" aria-label="Game tools">
                    <button
                        ref={triggerRef}
                        className={`gt-btn gt-btn-tools ${popoverOpen ? 'open' : ''}`}
                        aria-label="Game tools"
                        aria-haspopup="menu"
                        aria-expanded={popoverOpen}
                        title="Game tools"
                        onClick={() => setPopoverOpen(v => !v)}
                    >
                        <Wrench size={14} />
                    </button>
                </div>
            </div>
            {popover}
            <FairnessDrawer open={fairOpen} onClose={() => setFairOpen(false)} />
            <HotkeyHelp controlledOpen={hotkeyOpen} onClose={() => setHotkeyOpen(false)} />
            <OddsPopup open={oddsOpen} onClose={() => setOddsOpen(false)} definition={definition} />
        </>
    )
}
