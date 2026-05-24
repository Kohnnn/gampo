// Compact toolbar mounted in GameShell.titleBarExtras for every game.
// Wave 17: keeps Display controls (mute / motion / fullscreen) inline and
// pushes provably-fair, keyboard help, and odds info into a single
// "Game tools" popover so the titlebar stays clean.

import { useCallback, useEffect, useRef, useState } from 'react'
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

export default function GameToolbar({ helpHref, definition }) {
    const { muted, toggle: toggleMute } = useAudio()
    const [reduceMotion, setReduceMotion] = useReduceMotion()
    const [fullscreen, setFullscreen] = useState(() => Boolean(document.fullscreenElement))
    const [fairOpen, setFairOpen] = useState(false)
    const [hotkeyOpen, setHotkeyOpen] = useState(false)
    const [oddsOpen, setOddsOpen] = useState(false)
    const [popoverOpen, setPopoverOpen] = useState(false)
    const popoverRef = useRef(null)

    useEffect(() => {
        const sync = () => setFullscreen(Boolean(document.fullscreenElement))
        document.addEventListener('fullscreenchange', sync)
        return () => document.removeEventListener('fullscreenchange', sync)
    }, [])

    // Close the popover when clicking outside or pressing escape.
    useEffect(() => {
        if (!popoverOpen) return
        const onDown = (e) => {
            if (!popoverRef.current) return
            if (popoverRef.current.contains(e.target)) return
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

    return (
        <>
            <div className="gt-toolbar">
                <div className="gt-group" role="group" aria-label="Display">
                    <button className="gt-btn" aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute (audio off)' : 'Mute (audio on)'} onClick={toggleMute}>
                        {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                    </button>
                    <button className="gt-btn" aria-label={reduceMotion ? 'Enable motion' : 'Reduce motion'} title={reduceMotion ? 'Reduced motion (on)' : 'Reduced motion (off)'} onClick={() => setReduceMotion(v => !v)}>
                        {reduceMotion ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button className="gt-btn" aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} title={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} onClick={toggleFullscreen}>
                        {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    </button>
                </div>
                <span className="gt-divider" aria-hidden="true" />
                <div className="gt-group gt-tools-group" role="group" aria-label="Game tools" ref={popoverRef}>
                    <button
                        className={`gt-btn gt-btn-tools ${popoverOpen ? 'open' : ''}`}
                        aria-label="Game tools"
                        aria-haspopup="menu"
                        aria-expanded={popoverOpen}
                        title="Game tools"
                        onClick={() => setPopoverOpen(v => !v)}
                    >
                        <Wrench size={14} />
                    </button>
                    {popoverOpen && (
                        <div className="gt-popover" role="menu" aria-label="Game tools menu">
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
                        </div>
                    )}
                </div>
            </div>
            <FairnessDrawer open={fairOpen} onClose={() => setFairOpen(false)} />
            <HotkeyHelp controlledOpen={hotkeyOpen} onClose={() => setHotkeyOpen(false)} />
            <OddsPopup open={oddsOpen} onClose={() => setOddsOpen(false)} definition={definition} />
        </>
    )
}
