// AudioSettings — full audio panel for the Settings page.
//
// Surfaces the three independent mute states (master / music / effects) and
// their volume sliders in one place so players don't have to open a game to
// reach the in-game VolumeMixer. Subscribes to the shared audio context so it
// always reflects changes made from the header or the in-game mixer.

import { useEffect, useState } from 'react'
import { Volume2, VolumeX, Music2, Wand2 } from 'lucide-react'
import {
    getVolumes, setVolume,
    isMuted, setMuted,
    isBgmMuted, setBgmMuted,
    isSfxMuted, setSfxMuted,
    unlockAudio, subscribeAudio,
} from '../audio/audioContext'

export default function AudioSettings() {
    const [state, setState] = useState(() => ({
        volumes: getVolumes(),
        master: isMuted(),
        bgm: isBgmMuted(),
        sfx: isSfxMuted(),
    }))

    useEffect(() => {
        const sync = () => setState({
            volumes: getVolumes(),
            master: isMuted(),
            bgm: isBgmMuted(),
            sfx: isSfxMuted(),
        })
        sync()
        return subscribeAudio(sync)
    }, [])

    const onVolume = (bus) => (e) => setVolume(bus, Number(e.target.value))

    const toggleMaster = () => {
        const next = !state.master
        setMuted(next)
        if (!next) unlockAudio()
    }
    const toggleBgm = () => {
        const next = !state.bgm
        setBgmMuted(next)
        if (!next) unlockAudio()
    }
    const toggleSfx = () => {
        const next = !state.sfx
        setSfxMuted(next)
        if (!next) unlockAudio()
    }

    return (
        <section className="settings-card" data-ux-surface="controls">
            <h2><Volume2 size={16} /> Audio</h2>
            <p className="settings-help">
                Master mute silences everything. Music is off by default — toggle it on below.
                Changes here sync with the in-game audio menu.
            </p>

            <label className="settings-switch">
                <input type="checkbox" checked={!state.master} onChange={toggleMaster} />
                <span className="settings-switch-track" aria-hidden="true"><span className="settings-switch-thumb" /></span>
                <span className="settings-switch-label">
                    <strong>{state.master ? 'Sound off' : 'Sound on'}</strong>
                    <small>Master mute for all game audio.</small>
                </span>
            </label>

            <div className="settings-audio-row">
                <button
                    type="button"
                    className={`settings-audio-mute ${state.bgm ? 'muted' : ''}`}
                    onClick={toggleBgm}
                    aria-pressed={!state.bgm}
                    aria-label={state.bgm ? 'Turn music on' : 'Turn music off'}
                >
                    {state.bgm ? <VolumeX size={15} /> : <Music2 size={15} />}
                </button>
                <span className="settings-audio-label">Music</span>
                <input
                    type="range" min="0" max="1" step="0.05"
                    value={state.volumes.bgm}
                    onChange={onVolume('bgm')}
                    aria-label="Music volume"
                    disabled={state.master}
                />
                <em>{Math.round(state.volumes.bgm * 100)}%</em>
            </div>

            <div className="settings-audio-row">
                <button
                    type="button"
                    className={`settings-audio-mute ${state.sfx ? 'muted' : ''}`}
                    onClick={toggleSfx}
                    aria-pressed={!state.sfx}
                    aria-label={state.sfx ? 'Turn effects on' : 'Turn effects off'}
                >
                    {state.sfx ? <VolumeX size={15} /> : <Wand2 size={15} />}
                </button>
                <span className="settings-audio-label">Effects</span>
                <input
                    type="range" min="0" max="1" step="0.05"
                    value={state.volumes.sfx}
                    onChange={onVolume('sfx')}
                    aria-label="Effects volume"
                    disabled={state.master}
                />
                <em>{Math.round(state.volumes.sfx * 100)}%</em>
            </div>

            <div className="settings-audio-row">
                <span className="settings-audio-mute" aria-hidden="true"><Volume2 size={15} /></span>
                <span className="settings-audio-label">Master</span>
                <input
                    type="range" min="0" max="1" step="0.05"
                    value={state.volumes.master}
                    onChange={onVolume('master')}
                    aria-label="Master volume"
                    disabled={state.master}
                />
                <em>{Math.round(state.volumes.master * 100)}%</em>
            </div>
        </section>
    )
}
