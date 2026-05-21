// Compact toolbar mounted in GameShell.titleBarExtras for every game.
// Provides Sound mute toggle, Reduce-motion toggle, Fullscreen toggle, Fairness drawer,
// and a keyboard-shortcut help modal (toggle with '?').
// Each game gets the same toolbar without rolling its own.

import { useCallback, useEffect, useState } from 'react'
import { Volume2, VolumeX, Eye, EyeOff, Maximize2, Minimize2, Shield, HelpCircle } from 'lucide-react'
import { useAudio } from '../../../audio/AudioProvider'
import { useReduceMotion } from '../../fx'
import FairnessDrawer from './FairnessDrawer'
import HotkeyHelp from './HotkeyHelp'

export default function GameToolbar({ helpHref }) {
    const { muted, toggle: toggleMute } = useAudio()
    const [reduceMotion, setReduceMotion] = useReduceMotion()
    const [fullscreen, setFullscreen] = useState(() => Boolean(document.fullscreenElement))
    const [fairOpen, setFairOpen] = useState(false)

    useEffect(() => {
        const sync = () => setFullscreen(Boolean(document.fullscreenElement))
        document.addEventListener('fullscreenchange', sync)
        return () => document.removeEventListener('fullscreenchange', sync)
    }, [])

    const toggleFullscreen = useCallback(() => {
        try {
            if (document.fullscreenElement) {
                document.exitFullscreen?.()
            } else {
                document.documentElement.requestFullscreen?.()
            }
        } catch { /* ignore */ }
    }, [])

    return (
        <>
            <div className="gt-toolbar">
                <button className="gt-btn" aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute (audio off)' : 'Mute (audio on)'} onClick={toggleMute}>
                    {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
                <button className="gt-btn" aria-label={reduceMotion ? 'Enable motion' : 'Reduce motion'} title={reduceMotion ? 'Reduced motion (on)' : 'Reduced motion (off)'} onClick={() => setReduceMotion(v => !v)}>
                    {reduceMotion ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button className="gt-btn" aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} title={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} onClick={toggleFullscreen}>
                    {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>
                <button className="gt-btn" aria-label="Provably fair" title="Provably fair" onClick={() => setFairOpen(true)}>
                    <Shield size={14} />
                </button>
                <HotkeyHelp />
                {helpHref && (
                    <a className="gt-btn" href={helpHref} target="_blank" rel="noreferrer noopener" title="Game help">
                        <HelpCircle size={14} />
                    </a>
                )}
            </div>
            <FairnessDrawer open={fairOpen} onClose={() => setFairOpen(false)} />
        </>
    )
}
