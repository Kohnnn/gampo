import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Settings as SettingsIcon, Palette, Maximize2, Eye, Download, Upload, RotateCcw, Volume2 } from 'lucide-react'
import { useSettings } from '../hooks/useSettings'
import { useLocalSave } from '../hooks/useLocalSave'
import { useReduceMotion } from '../components/fx'
import '../styles/settings.css'

export default function SettingsPage() {
    const settings = useSettings()
    const { exportSave, importSave, keyCount } = useLocalSave()
    const [, setReduceMotionFx] = useReduceMotion()
    const fileRef = useRef(null)
    const [notice, setNotice] = useState(null)

    const onReduceMotion = (value) => {
        settings.setReduceMotion(value) // persists in gampo_settings_v1 + applies class
        setReduceMotionFx(value)          // keep the legacy fx hook key in sync
    }

    const onExport = () => {
        exportSave()
        setNotice({ tone: 'ok', text: `Exported ${keyCount} saved items to a JSON file.` })
    }

    const onPickFile = () => fileRef.current?.click()

    const onFile = async (e) => {
        const file = e.target.files?.[0]
        if (!file) return
        try {
            const result = await importSave(file, { reload: false })
            setNotice({ tone: 'ok', text: `Restored ${result.restored} items. Reloading…` })
            setTimeout(() => { if (typeof window !== 'undefined') window.location.reload() }, 900)
        } catch (err) {
            setNotice({ tone: 'err', text: err.message || 'Could not import that file.' })
        } finally {
            e.target.value = ''
        }
    }

    return (
        <div className="settings-page" data-ux-surface="stage">
            <section className="settings-hero" data-ux-surface="stage">
                <span className="settings-kicker"><SettingsIcon size={18} /> Settings</span>
                <h1>Display, accessibility & save data</h1>
                <p>Personalise the look, tune accessibility, and back up your local progress. Everything stays on this device.</p>
            </section>

            <div className="settings-sections">
                <section className="settings-card" data-ux-surface="controls">
                    <h2><Palette size={16} /> Accent theme</h2>
                    <p className="settings-help">Recolours buttons and highlights across the app.</p>
                    <div className="settings-accents" role="radiogroup" aria-label="Accent theme">
                        {settings.accentThemes.map(t => (
                            <button
                                key={t.id}
                                type="button"
                                role="radio"
                                aria-checked={settings.accent === t.id}
                                className={`settings-accent ${settings.accent === t.id ? 'active' : ''}`}
                                style={{ '--swatch': t.value }}
                                onClick={() => settings.setAccent(t.id)}
                            >
                                <span className="settings-accent-dot" />
                                <span>{t.name}</span>
                            </button>
                        ))}
                    </div>
                </section>

                <section className="settings-card" data-ux-surface="controls">
                    <h2><Maximize2 size={16} /> Density</h2>
                    <p className="settings-help">Compact tightens spacing — handy on small screens.</p>
                    <div className="settings-toggle-group" role="radiogroup" aria-label="UI density">
                        {settings.densities.map(d => (
                            <button
                                key={d.id}
                                type="button"
                                role="radio"
                                aria-checked={settings.density === d.id}
                                className={`settings-seg ${settings.density === d.id ? 'active' : ''}`}
                                onClick={() => settings.setDensity(d.id)}
                            >
                                <strong>{d.name}</strong>
                                <small>{d.detail}</small>
                            </button>
                        ))}
                    </div>
                </section>

                <section className="settings-card" data-ux-surface="controls">
                    <h2><Eye size={16} /> Accessibility</h2>
                    <label className="settings-switch">
                        <input
                            type="checkbox"
                            checked={settings.reduceMotion}
                            onChange={e => onReduceMotion(e.target.checked)}
                        />
                        <span className="settings-switch-track" aria-hidden="true"><span className="settings-switch-thumb" /></span>
                        <span className="settings-switch-label">
                            <strong>Reduce motion</strong>
                            <small>Disables non-essential animations, particles, and screen shake.</small>
                        </span>
                    </label>
                    <p className="settings-help">
                        <Volume2 size={13} style={{ verticalAlign: '-2px' }} /> Audio volume lives in the in-game audio menu.
                    </p>
                </section>

                <section className="settings-card" data-ux-surface="controls">
                    <h2><Download size={16} /> Save data</h2>
                    <p className="settings-help">
                        No account needed. Export your progress ({keyCount} items: credits, XP, achievements,
                        collections, settings) to a file, and import it on any device or browser.
                    </p>
                    <div className="settings-actions">
                        <button type="button" className="settings-btn primary" onClick={onExport}>
                            <Download size={15} /> Export save file
                        </button>
                        <button type="button" className="settings-btn" onClick={onPickFile}>
                            <Upload size={15} /> Import save file
                        </button>
                        <input
                            ref={fileRef}
                            type="file"
                            accept="application/json,.json"
                            onChange={onFile}
                            style={{ display: 'none' }}
                            aria-hidden="true"
                            tabIndex={-1}
                        />
                    </div>
                    {notice && (
                        <p className={`settings-notice ${notice.tone}`} role="status">{notice.text}</p>
                    )}
                    <button
                        type="button"
                        className="settings-reset"
                        onClick={() => { settings.resetSettings(); setReduceMotionFx(false); setNotice({ tone: 'ok', text: 'Display settings reset to defaults.' }) }}
                    >
                        <RotateCcw size={13} /> Reset display settings
                    </button>
                </section>
            </div>

            <footer className="settings-foot">
                <Link to="/">← Back to lobby</Link>
            </footer>
        </div>
    )
}
