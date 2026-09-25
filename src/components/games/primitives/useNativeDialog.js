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
import { containTab, focusableWithin } from './focusContainment'

// Re-exported so existing importers (the AC5 contract test, and any overlay
// that needs the rule without the hook) keep a single canonical source.
export { containTab, focusableWithin }

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
        // A popover item opener is detached by the time the dialog closes, so
        // the caller's `openerRef` (a persistent trigger) is the better target.
        const returnTo = document.activeElement
        const restoreFocus = () => {
            const candidates = [openerRef?.current, returnTo]
            const target = candidates.find(
                (node) => node && typeof node.focus === 'function' && document.contains(node)
            )
            if (target) target.focus()
        }

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

        // Escape drops focus to <body> before this effect's cleanup runs, so
        // restoring there loses the player's place. The `close` event fires
        // after the dialog has actually closed, which is the reliable point.
        const onCloseEvent = () => restoreFocus()
        dialog.addEventListener('close', onCloseEvent)

        // Backdrop click: the <dialog> element itself receives clicks outside
        // the inner card, which is the dismissal surface.
        const onClick = (event) => {
            if (event.target === dialog) onClose?.()
        }
        dialog.addEventListener('click', onClick)

        return () => {
            dialog.removeEventListener('keydown', onKey)
            dialog.removeEventListener('close', onCloseEvent)
            dialog.removeEventListener('click', onClick)
            if (dialog.open) dialog.close()
            restoreFocus()
        }
    }, [open, onClose, openerRef])

    return dialogRef
}
