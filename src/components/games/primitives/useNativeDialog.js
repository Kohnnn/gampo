// useNativeDialog — native <dialog> lifecycle for the shared game overlays.
//
// The fairness drawer and odds popup are opened from a menu button that
// unmounts as soon as the overlay opens, so focus would otherwise be dropped
// to <body> with nothing to restore to. This hook owns the whole lifecycle so
// both overlays get the same behaviour without duplicating it:
//
//   - `showModal()` gives us a real top-layer dialog: focus entry, Escape
//     handling, and background inertness come from the platform.
//   - On open we focus the first focusable control inside the dialog (its
//     close button), which is the visible focus-entry control.
//   - On close we return focus to the element that was focused before opening,
//     falling back to an `opener` the caller supplies.
//
// The hook deliberately does not implement Tab containment itself: `showModal`
// is modal, so the platform already keeps focus inside the dialog, and a
// hand-rolled Tab loop would only fight it. `containTab` is therefore exported
// for the contract test and any future non-modal use, not wired into the
// modal path.

import { useEffect, useRef } from 'react'

const FOCUSABLE = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusableWithin(dialog) {
    if (!dialog) return []
    return [...dialog.querySelectorAll(FOCUSABLE)].filter(
        (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement,
    )
}

/**
 * Forward/reverse Tab containment for a container.
 *
 * Exported and unit-tested. The modal path relies on `showModal()` instead;
 * this is the explicit boundary rule the AC5 contract names.
 */
export function containTab(event, dialog) {
    if (!dialog || event.key !== 'Tab') return
    const items = focusableWithin(dialog)
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault()
        last.focus()
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault()
        first.focus()
    }
}

/**
 * Bind a native <dialog> element to an `open` flag.
 *
 * Returns a ref to attach to the <dialog>. The caller keeps rendering the
 * dialog's children; this hook only drives show/close and focus.
 */
export default function useNativeDialog(open, onClose, openerRef) {
    const dialogRef = useRef(null)

    useEffect(() => {
        const dialog = dialogRef.current
        if (!dialog) return undefined

        if (!open) {
            if (dialog.open) dialog.close()
            return undefined
        }

        // Remember where focus came from before the dialog takes it. Read it
        // synchronously: by the time the effect runs the opener may already be
        // unmounting, so `document.activeElement` is the last reliable source.
        const returnTo = document.activeElement

        if (!dialog.open) {
            if (typeof dialog.showModal === 'function') dialog.showModal()
            else dialog.setAttribute('open', '')
        }

        const items = focusableWithin(dialog)
        ;(items[0] || dialog).focus?.()

        const onKey = (event) => {
            if (event.key === 'Escape') {
                // Native cancel already closes; keep React state in step and
                // stop the event so an outer Escape handler does not also fire.
                event.preventDefault()
                onClose?.()
                return
            }
            containTab(event, dialog)
        }
        dialog.addEventListener('keydown', onKey)

        // Backdrop click: the <dialog> element itself receives clicks outside
        // the inner card, which is the dismissal surface.
        const onClick = (event) => {
            if (event.target === dialog) onClose?.()
        }
        dialog.addEventListener('click', onClick)

        return () => {
            dialog.removeEventListener('keydown', onKey)
            dialog.removeEventListener('click', onClick)
            if (dialog.open) dialog.close()
            const target = returnTo || openerRef?.current
            if (target && typeof target.focus === 'function' && document.contains(target)) {
                target.focus()
            }
        }
    }, [open, onClose, openerRef])

    return dialogRef
}
