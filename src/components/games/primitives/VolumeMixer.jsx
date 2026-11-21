// VolumeMixer — Wave 29 volume sliders for master / BGM / SFX buses.
//
// Renders a portal-rendered popover (parity with the Game Tools popover)
// anchored under the trigger button. Sliders write through `setVolume`
// from the audio context, which persists to localStorage.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Music2, Sliders, Volume2, VolumeX, Wand2 } from 'lucide-react'
import {
    getVolumes, setVolume,
    isBgmMuted, setBgmMuted,
    isSfxMuted, setSfxMuted,
    unlockAudio, subscribeAudio,
} from '../../../audio/audioContext'
import { claimEscape } from '../../../utils/escapeClaims'

export default function VolumeMixer() {
    const [open, setOpen] = useState(false)
    const triggerRef = useRef(null)
    const popoverRef = useRef(null)
    const [volumes, setVolumesState] = useState(() => getVolumes())
    const [bgmMuted, setBgmMutedState] = useState(() => isBgmMuted())
    const [sfxMuted, setSfxMutedState] = useState(() => isSfxMuted())
    const [pos, setPos] = useState({ top: 0, left: 0, ready: false })

    // Re-sync from the audio context whenever any control mutates state, so the
    // mixer's mute icons + sliders never drift from the header/settings toggles.
    useEffect(() => {
        const sync = () => {
            setVolumesState(getVolumes())
            setBgmMutedState(isBgmMuted())
            setSfxMutedState(isSfxMuted())
        }
        sync()
        return subscribeAudio(sync)
    }, [])

    const reposition = useCallback(() => {
        if (!triggerRef.current) return
        const r = triggerRef.current.getBoundingClientRect()
        const popoverWidth = 240
        let left = r.right - popoverWidth
        const maxLeft = window.innerWidth - popoverWidth - 8
        if (left > maxLeft) left = maxLeft
        if (left < 8) left = 8
        const top = r.bottom + 8
        setPos({ top, left, ready: true })
    }, [])

    useLayoutEffect(() => {
        if (!open) return undefined
        reposition()
        window.addEventListener('resize', reposition)
        window.addEventListener('scroll', reposition, true)
        return () => {
            window.removeEventListener('resize', reposition)
            window.removeEventListener('scroll', reposition, true)
        }
    }, [open, reposition])

    useEffect(() => {
        if (!open) return undefined
        const onDown = (e) => {
            const popover = popoverRef.current
            const trigger = triggerRef.current
            if (popover && popover.contains(e.target)) return
            if (trigger && trigger.contains(e.target)) return
            setOpen(false)
        }
        window.addEventListener('mousedown', onDown)
        return () => {
            window.removeEventListener('mousedown', onDown)
        }
    }, [open])

    // Escape-to-close is registered with the Escape-claim registry rather than
    // handled by a second window listener. The mixer popover is portaled to the
    // body, so it is not a DOM descendant of any layer that would otherwise
    // notice it: as a bare window listener it dismissed alongside the mobile
    // drawer, so one Escape closed both. Registering a handler makes it the
    // single owner when it is the topmost layer.
    useEffect(() => {
        if (!open) return undefined
        return claimEscape(() => {
            setOpen(false)
            return true
        })
    }, [open])

    const onChange = (bus) => (e) => {
        const v = Number(e.target.value)
        setVolume(bus, v)
        setVolumesState(getVolumes())
    }

    const toggleBgm = () => {
        const next = !bgmMuted
        setBgmMuted(next)
        setBgmMutedState(next)
        if (!next) unlockAudio()
    }

    const toggleSfx = () => {
        const next = !sfxMuted
        setSfxMuted(next)
        setSfxMutedState(next)
        if (!next) unlockAudio()
    }

    const popover = open && pos.ready && createPortal(
        <div
            ref={popoverRef}
            className="gt-popover gt-popover-portal volmix-popover"
            role="dialog"
            aria-label="Volume mixer"
            style={{ top: pos.top, left: pos.left, minWidth: 240 }}
        >
            <div className="volmix-row">
                <Volume2 size={14} /> <label>Master</label>
                <input type="range" min="0" max="1" step="0.05" value={volumes.master} onChange={onChange('master')} />
                <em>{Math.round(volumes.master * 100)}%</em>
            </div>
            <div className="volmix-row">
                <button
                    type="button"
                    className={`gt-btn volmix-mute ${bgmMuted ? 'muted' : ''}`}
                    onClick={toggleBgm}
                    aria-label={bgmMuted ? 'Unmute music' : 'Mute music'}
                    title={bgmMuted ? 'Unmute music' : 'Mute music'}
                >
                    {bgmMuted ? <VolumeX size={14} /> : <Music2 size={14} />}
                </button>
                <label>Music</label>
                <input type="range" min="0" max="1" step="0.05" value={volumes.bgm} onChange={onChange('bgm')} />
                <em>{Math.round(volumes.bgm * 100)}%</em>
            </div>
            <div className="volmix-row">
                <button
                    type="button"
                    className={`gt-btn volmix-mute ${sfxMuted ? 'muted' : ''}`}
                    onClick={toggleSfx}
                    aria-label={sfxMuted ? 'Unmute effects' : 'Mute effects'}
                    title={sfxMuted ? 'Unmute effects' : 'Mute effects'}
                >
                    {sfxMuted ? <VolumeX size={14} /> : <Wand2 size={14} />}
                </button>
                <label>Effects</label>
                <input type="range" min="0" max="1" step="0.05" value={volumes.sfx} onChange={onChange('sfx')} />
                <em>{Math.round(volumes.sfx * 100)}%</em>
            </div>
        </div>,
        document.body,
    )

    return (
        <>
            <button
                ref={triggerRef}
                className={`gt-btn gt-volmix-trigger ${open ? 'open' : ''}`}
                aria-label="Volume mixer"
                aria-haspopup="dialog"
                aria-expanded={open}
                title="Volume mixer"
                onClick={() => setOpen(v => !v)}
            >
                <Sliders size={14} />
            </button>
            {popover}
        </>
    )
}
