// Lightweight hotkey help modal. Toggles when the user presses '?'.
// Wave 17: also accepts external control via `controlledOpen` + `onOpenChange`.

import { useEffect, useState } from 'react'
import { claimEscape } from '../../../utils/escapeClaims'
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

export function isEditableHotkeyTarget(target) {
    for (let element = target; element; element = element.parentElement) {
        const tag = (element.tagName || '').toLowerCase()
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || element.isContentEditable || element.getAttribute?.('role') === 'textbox') return true
    }
    return false
}

// True when a modal dialog layer is mounted and on screen. Hotkey layers that
// are not dialog-owned must defer to it: Space/Enter belong to the dialog's
// own focused control, not to a paid game action behind it.
export function isOpenDialogPresent(root = typeof document !== 'undefined' ? document : null) {
    if (!root) return false
    const dialogs = root.querySelectorAll('[role="dialog"], [aria-modal="true"]')
    for (const dialog of dialogs) {
        if (dialog.getAttribute('aria-hidden') === 'true') continue
        // A portaled layer can stay mounted at opacity 0 / pointer-events none
        // while collapsed; that is not an open dialog. The mobile bet sheet is
        // exactly this: rendered whenever `isMobile`, always `role="dialog"`,
        // collapsed by CSS only. Without the opacity check it reads as open on
        // every mobile viewport, and BetPanel then ignores S/Space entirely.
        const style = dialog.ownerDocument?.defaultView?.getComputedStyle?.(dialog)
        if (style && (style.display === 'none' || style.visibility === 'hidden')) continue
        if (style && (Number(style.opacity) === 0 || style.pointerEvents === 'none')) continue
        return true
    }
    return false
}

export default function HotkeyHelp({ controlledOpen, onOpenChange }) {
    const [open, setOpen] = useState(false)
    const isOpen = controlledOpen !== undefined ? controlledOpen : open
    const requestOpen = (next) => {
        if (controlledOpen !== undefined) onOpenChange?.(next)
        else setOpen(next)
    }

    useEffect(() => {
        const onKey = (e) => {
            if (isEditableHotkeyTarget(e.target) || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
            if (e.key !== '?') return
            e.preventDefault()
            requestOpen(!isOpen)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [isOpen, controlledOpen, onOpenChange])

    // Own Escape while this panel is up. Registering a HANDLER rather than a
    // flag is what keeps one Escape to one layer: the router asks the topmost
    // registered layer first, and only that one closes. This effect must not
    // keep its own Escape branch — with two overlays open, two independent
    // `window` listeners both saw the same key and both closed.
    useEffect(() => {
        if (!isOpen) return undefined
        return claimEscape(() => {
            requestOpen(false)
            return true
        })
    }, [isOpen, controlledOpen, onOpenChange])

    const dismiss = () => requestOpen(false)

    return (
        <>
            {isOpen && (
                <div className="hotkey-backdrop" onClick={dismiss}>
                    <div className="hotkey-card" role="dialog" aria-label="Keyboard shortcuts" onClick={e => e.stopPropagation()}>
                        <header className="hotkey-head">
                            <h2><Keyboard size={16} /> Keyboard shortcuts</h2>
                            <button type="button" className="hotkey-close" onClick={dismiss} aria-label="Close shortcuts"><X size={14} /></button>
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
