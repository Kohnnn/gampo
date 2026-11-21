// Lightweight hotkey help modal. Toggles when the user presses '?'.
// Wave 17: also accepts external control via `controlledOpen` + `onOpenChange`.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { claimEscape } from '../../../utils/escapeClaims'
import { Keyboard, X } from 'lucide-react'
import { containTab } from './focusContainment'

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

const INTERACTIVE_HOTKEY_ROLES = new Set([
    'button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'option',
    'menuitem', 'menuitemcheckbox', 'menuitemradio', 'slider', 'combobox', 'listbox',
])

export function isEditableHotkeyTarget(target) {
    for (let element = target; element; element = element.parentElement) {
        const tag = (element.tagName || '').toLowerCase()
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || element.isContentEditable || element.getAttribute?.('role') === 'textbox') return true
    }
    return false
}

export function isInteractiveHotkeyTarget(target) {
    if (isEditableHotkeyTarget(target)) return true
    for (let element = target; element; element = element.parentElement) {
        const tag = (element.tagName || '').toLowerCase()
        if (tag === 'button' || tag === 'a' || tag === 'summary') return true
        const roles = element.getAttribute?.('role')
        if (roles?.split(/\s+/).some(role => INTERACTIVE_HOTKEY_ROLES.has(role))) return true
    }
    return false
}

// True when a modal dialog layer is mounted and on screen. Hotkey layers that
// are not dialog-owned must defer to it: Space/Enter belong to the dialog's
// own focused control, not to a paid game action behind it.
export function isOpenDialogPresent(root = typeof document !== 'undefined' ? document : null) {
    if (!root) return false
    const dialogs = root.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog[open]')
    for (const dialog of dialogs) {
        if (dialog.getAttribute('aria-hidden') === 'true') continue
        // Closed mobile sheets stay mounted but cannot receive pointer input.
        // An opening dialog may also be at opacity 0 for its first frame, so
        // distinguish a live opacity animation from a permanently hidden layer.
        const style = dialog.ownerDocument?.defaultView?.getComputedStyle?.(dialog)
        if (style && (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none')) continue
        if (style && Number(style.opacity) === 0 && !dialog.getAnimations?.().some(animation =>
            animation.playState !== 'finished' && animation.playState !== 'idle'
            && animation.effect?.getKeyframes?.().some(frame => parseFloat(frame.opacity) > 0))) continue
        return true
    }
    return false
}

function getEnterPressCode({ key, code, location, keyCode }) {
    if (code === 'Enter' || code === 'NumpadEnter') return code
    const legacyEnter = (!key || key === 'Unidentified') && keyCode === 13
    if (key !== 'Enter' && !legacyEnter) return null
    if (code && code !== 'Unidentified') return code
    // DOM_KEY_LOCATION_NUMPAD is 3, even when the physical code is missing.
    return location === 3 ? 'NumpadEnter' : 'Enter'
}

export default function HotkeyHelp({ controlledOpen, onOpenChange }) {
    const [open, setOpen] = useState(false)
    const dialogRef = useRef(null)
    const closeRef = useRef(null)
    const enterGuardRef = useRef(null)
    const isOpen = controlledOpen !== undefined ? controlledOpen : open
    const requestOpen = (next) => {
        if (!next) enterGuardRef.current?.disarm()
        if (controlledOpen !== undefined) onOpenChange?.(next)
        else setOpen(next)
    }
    const dismiss = () => requestOpen(false)

    useLayoutEffect(() => {
        if (!isOpen) return undefined
        const dialog = dialogRef.current
        const { ownerDocument } = dialog
        const previousFocus = ownerDocument.activeElement
        const toolsTrigger = ownerDocument.querySelector('.gt-toolbar .gt-btn-tools')
        if (typeof dialog.showModal === 'function') dialog.showModal()
        else dialog.open = true
        closeRef.current.focus({ preventScroll: true })

        return () => {
            enterGuardRef.current?.disarm()
            const heldFocus = ownerDocument.activeElement === ownerDocument.body || dialog.contains(ownerDocument.activeElement)
            if (dialog.open) dialog.close?.()
            if (!heldFocus) return
            if (previousFocus?.isConnected && previousFocus !== ownerDocument.body) {
                previousFocus.focus({ preventScroll: true })
                if (ownerDocument.activeElement === previousFocus) return
            }
            if (toolsTrigger?.isConnected) toolsTrigger.focus({ preventScroll: true })
        }
    }, [isOpen])

    // The guard can outlive the dialog, but not the component.
    useLayoutEffect(() => () => enterGuardRef.current?.cleanup(), [])

    useLayoutEffect(() => {
        // Keep the current controlled callback, without rearming a canceled dismissal.
        const guard = enterGuardRef.current
        if (guard) guard.dismiss = dismiss
    })

    useEffect(() => {
        const onKey = (e) => {
            if (e.defaultPrevented || isEditableHotkeyTarget(e.target) || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
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

    const onCloseKeyDown = (event) => {
        const nativeEvent = event.nativeEvent ?? event
        const code = getEnterPressCode(nativeEvent)
        if (code === null) return
        // Native Enter clicks on keydown. Keep focus here until release so a
        // held key can't repeat on the game control that regains focus.
        event.preventDefault()
        event.stopPropagation()
        if (nativeEvent.repeat) return

        const activeGuard = enterGuardRef.current
        if (activeGuard) {
            activeGuard.codes.add(code)
            // A second key is guarded, but does not take over dismissal.
            activeGuard.dismissCode ??= code
            return
        }

        const { ownerDocument } = dialogRef.current
        const { defaultView } = ownerDocument
        const codes = new Set()
        codes.add(code)
        const onPressEvent = (nativeEvent) => {
            const pressedCode = getEnterPressCode(nativeEvent)
            if (!codes.has(pressedCode)) return
            const isRelease = nativeEvent.type === 'keyup'
            if (isRelease || nativeEvent.repeat) {
                nativeEvent.preventDefault()
                nativeEvent.stopPropagation()
                if (!isRelease) return
            }

            const closeButton = closeRef.current
            const shouldDismiss = isRelease && guard.dismissCode === pressedCode
                && nativeEvent.target === closeButton && ownerDocument.activeElement === closeButton
            // A fresh nonrepeat down also retires this code if its keyup was missed.
            codes.delete(pressedCode)
            if (guard.dismissCode === pressedCode) disarm()
            if (codes.size === 0) cleanup()
            if (shouldDismiss) guard.dismiss()
        }
        const disarm = () => { guard.dismissCode = null }
        const cleanup = () => {
            ownerDocument.removeEventListener('keydown', onPressEvent, true)
            ownerDocument.removeEventListener('keyup', onPressEvent, true)
            defaultView?.removeEventListener('blur', disarm)
            enterGuardRef.current = null
        }
        const guard = { codes, dismissCode: code, dismiss, disarm, cleanup }
        enterGuardRef.current = guard
        // Capture held Enter keys before they reach a restored focus target.
        ownerDocument.addEventListener('keydown', onPressEvent, true)
        ownerDocument.addEventListener('keyup', onPressEvent, true)
        defaultView?.addEventListener('blur', disarm)
    }

    return (
        <>
            {isOpen && createPortal(
                <dialog
                    ref={dialogRef}
                    className="hotkey-backdrop"
                    style={{ width: '100%', height: '100%', maxWidth: 'none', maxHeight: 'none', margin: 0, border: 0, padding: 0 }}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Keyboard shortcuts"
                    onKeyDown={event => containTab(event, dialogRef.current)}
                    onCancel={event => {
                        event.preventDefault()
                        event.stopPropagation()
                        dismiss()
                    }}
                    onClick={dismiss}
                >
                    <div className="hotkey-card" onClick={event => event.stopPropagation()}>
                        <header className="hotkey-head">
                            <h2><Keyboard size={16} /> Keyboard shortcuts</h2>
                            <button type="button" className="hotkey-close" ref={closeRef} aria-label="Close shortcuts"
                                onClick={dismiss}
                                onKeyDown={onCloseKeyDown}
                                onBlur={() => enterGuardRef.current?.disarm()}
                            >
                                <X size={14} />
                            </button>
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
                </dialog>,
                document.body,
            )}
        </>
    )
}
