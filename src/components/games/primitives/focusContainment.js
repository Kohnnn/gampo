// focusContainment — forward/reverse Tab containment for a container.
//
// This lives in its own module, separate from `useNativeDialog`, so non-hook
// consumers can import the rule without pulling a React hook module into their
// chunk. The sportsbook dialogs (SearchOverlay, OddsCoach, the mobile bet slip)
// need it because they nest: Chromium's native focus containment does not apply
// to a dialog nested inside another modal dialog, so reverse Tab from the first
// control escapes to <body>. Escape then reaches no owning handler, and native
// `cancel` closes every open layer at once.
//
// `useNativeDialog` re-exports these so existing importers keep working.

const FOCUSABLE = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',')

export function focusableWithin(dialog) {
    if (!dialog) return []
    return [...dialog.querySelectorAll(FOCUSABLE)].filter(
        (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement,
    )
}

/**
 * Forward/reverse Tab containment for a container.
 *
 * A Tab from outside the container is treated as coming from the edge it is
 * moving toward, so focus that has already escaped is pulled back in on the
 * next Tab rather than being left on <body>.
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
