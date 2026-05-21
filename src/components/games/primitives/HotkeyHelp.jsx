// Lightweight hotkey help modal. Toggles when the user presses '?'.
// Designed to be mounted once at the GameShell title bar so every shell game
// surfaces the same shortcut reference.

import { useEffect, useState } from 'react'
import { Keyboard, X } from 'lucide-react'

const SHORTCUTS = [
    { key: 'Space', desc: 'Play / Stop autobet / In-round CTA (e.g. Cashout)' },
    { key: 'S', desc: 'Stop autobet' },
    { key: 'R', desc: 'Rebet last amount' },
    { key: 'H', desc: 'Halve current bet' },
    { key: 'D', desc: 'Double current bet' },
    { key: '+ / -', desc: 'Nudge bet up / down by 10%' },
    { key: 'Esc', desc: 'Dismiss overlays / drawers' },
    { key: '?', desc: 'Toggle this help overlay' },
]

export default function HotkeyHelp() {
    const [open, setOpen] = useState(false)

    useEffect(() => {
        const onKey = (e) => {
            const tag = (e.target?.tagName || '').toLowerCase()
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return
            if (e.target?.isContentEditable) return
            if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                e.preventDefault()
                setOpen(o => !o)
            } else if (e.key === 'Escape' && open) {
                setOpen(false)
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open])

    return (
        <>
            <button
                className="gt-btn"
                aria-label="Keyboard shortcuts"
                title="Keyboard shortcuts (?)"
                onClick={() => setOpen(true)}
            >
                <Keyboard size={14} />
            </button>
            {open && (
                <div className="hotkey-backdrop" onClick={() => setOpen(false)}>
                    <div className="hotkey-card" role="dialog" aria-label="Keyboard shortcuts" onClick={e => e.stopPropagation()}>
                        <header className="hotkey-head">
                            <h2><Keyboard size={16} /> Keyboard shortcuts</h2>
                            <button className="hotkey-close" onClick={() => setOpen(false)} aria-label="Close shortcuts"><X size={14} /></button>
                        </header>
                        <ul className="hotkey-list">
                            {SHORTCUTS.map(s => (
                                <li key={s.key}>
                                    <kbd>{s.key}</kbd>
                                    <span>{s.desc}</span>
                                </li>
                            ))}
                        </ul>
                        <p className="hotkey-foot">Shortcuts disable when typing in inputs.</p>
                    </div>
                </div>
            )}
        </>
    )
}
