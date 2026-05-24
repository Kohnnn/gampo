// Audio mute toggle for the game toolbar / shell.
//
// Persists mute state via localStorage (handled by audioContext). Calling
// the toggle also unlocks the audio context so the next play() works
// without an extra user gesture.

import { useEffect, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { isMuted, setMuted, unlockAudio } from '../../../audio/audioContext'

export default function AudioToggle({ className = '' }) {
    const [muted, setLocalMuted] = useState(isMuted())

    useEffect(() => {
        // Sync once after mount in case storage changed in another tab.
        setLocalMuted(isMuted())
    }, [])

    const toggle = async () => {
        const next = !muted
        setMuted(next)
        setLocalMuted(next)
        if (!next) {
            await unlockAudio()
        }
    }

    return (
        <button
            type="button"
            className={`audio-toggle ${muted ? 'muted' : ''} ${className}`}
            onClick={toggle}
            aria-label={muted ? 'Unmute audio' : 'Mute audio'}
            title={muted ? 'Unmute audio' : 'Mute audio'}
        >
            {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
    )
}
