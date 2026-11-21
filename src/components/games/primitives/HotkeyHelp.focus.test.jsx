import { afterEach, expect, it, vi } from 'vitest'
import { claimEscape, dispatchEscape, resetEscapeClaims } from '../../../utils/escapeClaims'
import WelcomeModal from '../../WelcomeModal'
import FairnessDrawer from './FairnessDrawer'
import GameToolbar from './GameToolbar'
import HotkeyHelp from './HotkeyHelp'
import OddsPopup from './OddsPopup'

const hooks = vi.hoisted(() => ({}))

const sameDeps = (previous, next) => next && next.length === previous?.length
    && next.every((value, index) => Object.is(value, previous[index]))

function fixtureMemo(create, deps) {
    const index = hooks.memoIndex++
    const previous = hooks.memos[index]
    if (previous && sameDeps(previous.deps, deps)) return previous.value
    const value = create()
    hooks.memos[index] = { value, deps }
    return value
}

vi.mock('react', async (importOriginal) => ({
    ...await importOriginal(),
    useState(initial) {
        const index = hooks.stateIndex++
        const slot = hooks.states[index] ??= {
            value: typeof initial === 'function' ? initial() : initial,
            set(next) {
                const value = typeof next === 'function' ? next(slot.value) : next
                if (Object.is(value, slot.value)) return
                slot.value = value
                hooks.dirty = true
            },
        }
        return [slot.value, slot.set]
    },
    useMemo: (create, deps) => fixtureMemo(create, deps),
    useCallback: (callback, deps) => fixtureMemo(() => callback, deps),
    useRef: initial => hooks.refs[hooks.refIndex++] ??= { current: initial },
    useEffect: (effect, deps) => hooks.effects.push({ effect, deps }),
    useLayoutEffect: (effect, deps) => hooks.layout.push({ effect, deps }),
}))
vi.mock('react-dom', () => ({ createPortal: (node, host) => { hooks.portalHost = host; return node } }))
vi.mock('../../../hooks/useOnboarding', () => ({
    useOnboarding: () => ({ seen: hooks.welcomeSeen, completeOnboarding: hooks.completeOnboarding }),
}))
vi.mock('../../../audio/AudioProvider', () => ({ useAudio: () => ({ muted: false }) }))
vi.mock('../../fx', () => ({ useReduceMotion: () => [false] }))

function* elements(node) {
    if (Array.isArray(node)) {
        for (const child of node) yield* elements(child)
    } else if (node?.props) {
        yield node
        yield* elements(node.props.children)
    }
}

let cleanupFixture

function setup({ controlled = false, nested = false, welcome = false, native = true, toolbar = false } = {}) {
    Object.assign(hooks, { open: false, refs: [], states: [], memos: [] })
    hooks.welcomeSeen = !welcome
    const completeOnboarding = vi.fn(() => { hooks.welcomeSeen = true })
    hooks.completeOnboarding = completeOnboarding
    const windowTarget = new EventTarget()
    Object.assign(windowTarget, { innerWidth: 1024, setInterval, clearInterval })
    const documentCapture = new EventTarget()
    const ownerDocument = {
        body: {},
        defaultView: windowTarget,
        contains: node => node === ownerDocument.body || Boolean(node?.isConnected),
        addEventListener(type, listener, capture) {
            if (capture) documentCapture.addEventListener(type, listener)
        },
        removeEventListener(type, listener, capture) {
            if (capture) documentCapture.removeEventListener(type, listener)
        },
    }
    const modals = new Set()
    function modal() {
        const dialog = Object.assign(new EventTarget(), {
            ownerDocument,
            open: false,
            contains: element => element?.modal === dialog,
            showModal: vi.fn(() => { dialog.open = true; modals.add(dialog) }),
            close: vi.fn(() => {
                dialog.open = false
                modals.delete(dialog)
                if (dialog.contains(ownerDocument.activeElement)) ownerDocument.activeElement = ownerDocument.body
            }),
        })
        return dialog
    }
    const topModal = () => [...modals].at(-1)
    const autoplayDialog = modal()
    if (nested) autoplayDialog.showModal()
    const helpDialog = modal()
    helpDialog.querySelectorAll = () => [closeButton]
    if (!native) {
        delete helpDialog.showModal
        delete helpDialog.close
    }
    function focusable(modal) {
        const element = { tagName: 'BUTTON', isConnected: true, offsetWidth: 20, modal }
        element.closest = selector => selector === 'dialog[open]' && modal?.open ? modal : null
        element.focus = () => {
            const activeModal = topModal()
            if (!element.isConnected || element.disabled || (activeModal && activeModal !== modal)) return
            ownerDocument.activeElement = element
        }
        return element
    }
    const paidControl = focusable(autoplayDialog)
    paidControl.click = vi.fn()
    paidControl.onKeyDown = vi.fn()
    paidControl.onKeyUp = vi.fn()
    const toolsTrigger = focusable()
    toolsTrigger.getBoundingClientRect = () => ({ right: 500, bottom: 40 })
    const closeButton = focusable(helpDialog)
    const welcomeButton = focusable()
    welcomeButton.offsetParent = ownerDocument.body
    const welcomeCard = { querySelectorAll: () => [welcomeButton] }
    let closeNode
    closeButton.blur = () => {
        ownerDocument.activeElement = ownerDocument.body
        closeNode.props.onBlur?.()
    }
    ownerDocument.querySelector = () => toolsTrigger
    const onOpenChange = vi.fn(next => { hooks.open = next })
    vi.stubGlobal('window', windowTarget)
    vi.stubGlobal('document', ownerDocument)
    if (toolbar) vi.stubGlobal('localStorage', undefined)
    paidControl.focus()

    const menuItems = new Map()
    const toolbarDialogs = new Map()
    const layers = new Map(toolbar ? [FairnessDrawer, OddsPopup].map(Component => {
        const dialog = modal()
        const close = focusable(dialog)
        dialog.querySelectorAll = () => [close]
        return [Component, { dialog, close }]
    }) : [])

    function renderToolbar() {
        const nodes = [...elements(GameToolbar({}))]
        const trigger = nodes.find(node => node.props['aria-label'] === 'Game tools' && node.type === 'button')
        trigger.ref.current = toolsTrigger
        toolsTrigger.click = trigger.props.onClick

        const visibleItems = new Set()
        for (const node of nodes.filter(node => node.props.role === 'menuitem' && node.type === 'button')) {
            const label = [...elements(node)].find(child => child.type === 'span').props.children
            const control = menuItems.get(label) ?? focusable()
            control.click = node.props.onClick
            menuItems.set(label, control)
            visibleItems.add(label)
        }
        for (const [label, control] of menuItems) {
            if (visibleItems.has(label)) continue
            control.isConnected = false
            if (ownerDocument.activeElement === control) ownerDocument.activeElement = ownerDocument.body
            menuItems.delete(label)
        }

        let help
        toolbarDialogs.clear()
        // Evaluate the real JSX children in their rendered order. The simulated
        // top layer changes only when their actual dialog effects show/close it.
        for (const node of nodes) {
            if (node.type === HotkeyHelp) help = node.type(node.props)
            const layer = layers.get(node.type)
            if (!layer) continue
            const portal = node.type(node.props)
            layer.close.isConnected = Boolean(portal)
            if (!portal) continue
            portal.ref.current = layer.dialog
            const closeNode = [...elements(portal)].find(child => child.type === 'button' && child.props['aria-label']?.startsWith('Close '))
            layer.close.click = closeNode.props.onClick
            toolbarDialogs.set(portal.props['aria-label'], layer)
        }
        return help
    }

    let committedEffects = []
    function commitRender() {
        hooks.dirty = false
        hooks.effects = []
        hooks.layout = []
        hooks.refIndex = hooks.stateIndex = hooks.memoIndex = 0
        const tree = toolbar ? renderToolbar() : HotkeyHelp(controlled ? { controlledOpen: hooks.open, onOpenChange } : {})
        const backdropNode = tree.props.children
        const cardNode = backdropNode?.props?.children
        closeNode = cardNode?.props.children[0].props.children[1]
        const welcomeNode = welcome ? WelcomeModal() : null
        if (welcomeNode) welcomeNode.props.children.ref.current = welcomeCard
        if (backdropNode?.type === 'dialog' && backdropNode.ref) backdropNode.ref.current = helpDialog
        if (closeNode?.ref) closeNode.ref.current = closeButton
        closeButton.click = closeNode?.props.onClick
        closeButton.onKeyDown = closeNode?.props.onKeyDown
        closeButton.onKeyUp = closeNode?.props.onKeyUp
        helpDialog.onKeyDown = backdropNode?.props?.onKeyDown
        helpDialog.onCancel = backdropNode?.props?.onCancel
        committedEffects = [...hooks.layout, ...hooks.effects].map(({ effect, deps }, index) => {
            const previous = committedEffects[index]
            if (previous && sameDeps(previous.deps, deps)) return previous
            previous?.cleanup?.()
            return { deps, cleanup: effect() }
        })
        return { backdropNode, cardNode, closeNode, welcomeNode }
    }
    function render() {
        for (let attempt = 0; attempt < 10; attempt++) {
            const view = commitRender()
            if (!hooks.dirty) return view
        }
        throw new Error('Focus fixture did not settle')
    }
    function unmount() {
        for (const { cleanup } of committedEffects) cleanup?.()
        committedEffects = []
    }
    cleanupFixture = unmount
    function press(key, { type = 'keydown', repeat = false, code = key, location = 0, keyCode = 0, shiftKey = false } = {}) {
        const target = ownerDocument.activeElement
        const event = new Event(type, { cancelable: true })
        let stopped = false
        Object.defineProperties(event, {
            key: { value: key }, code: { value: code }, location: { value: location }, keyCode: { value: keyCode },
            repeat: { value: repeat }, shiftKey: { value: shiftKey }, target: { value: target },
            stopPropagation: { value: () => { stopped = true; Event.prototype.stopPropagation.call(event) } },
        })
        documentCapture.dispatchEvent(event)
        const legacyEnter = key === 'Unidentified' && keyCode === 13
        if (!stopped) {
            // React translates legacy Enter; document capture sees the raw event.
            const reactEvent = legacyEnter ? {
                nativeEvent: event, key: 'Enter', code, location, keyCode, repeat,
                preventDefault: () => event.preventDefault(),
                stopPropagation: () => event.stopPropagation(),
            } : event
            target?.[type === 'keydown' ? 'onKeyDown' : 'onKeyUp']?.(reactEvent)
        }
        if (!stopped && type === 'keydown') target?.modal?.dispatchEvent(event)
        if (!stopped && type === 'keydown') target?.modal?.onKeyDown?.(event)
        if (!stopped) {
            // Sidebar routes Escape at document bubble, before the native cancel default.
            if (type === 'keydown' && key === 'Escape' && !event.defaultPrevented && dispatchEscape(event)) event.preventDefault()
            windowTarget.dispatchEvent(event)
        }
        if (!event.defaultPrevented && key === 'Escape' && type === 'keydown' && target?.modal?.showModal && target.modal.open) cancel(target.modal)
        // Model the native button defaults: Enter clicks on down, Space on up.
        if (!event.defaultPrevented && (((key === 'Enter' || legacyEnter) && type === 'keydown') || (key === ' ' && type === 'keyup'))) {
            target?.click?.()
        }
        return event
    }
    function cancel(dialog) {
        const event = new Event('cancel', { cancelable: true })
        dialog.dispatchEvent(event)
        dialog.onCancel?.(event)
        if (!event.defaultPrevented) dialog.close()
        return event
    }
    return { ownerDocument, paidControl, toolsTrigger, closeButton, onOpenChange, render, unmount, press, autoplayDialog, helpDialog, completeOnboarding, modal, focusable, cancel, menuItems, toolbarDialogs, topModal }
}

afterEach(() => {
    cleanupFixture?.()
    cleanupFixture = undefined
    resetEscapeClaims()
    vi.unstubAllGlobals()
})

it.each([false, true])('moves focus from a paid control into Help and restores it after Escape (controlled: %s)', controlled => {
    const { ownerDocument, paidControl, closeButton, onOpenChange, render, press } = setup({ controlled })
    const lowerEscape = vi.fn(() => true)
    render()

    expect(press('?').defaultPrevented).toBe(true)
    render()
    claimEscape(lowerEscape) // A lower celebration may claim Escape after Help opens.
    expect(ownerDocument.activeElement).toBe(closeButton)

    for (const shiftKey of [false, true]) {
        expect(press('Tab', { shiftKey }).defaultPrevented).toBe(true)
        expect(ownerDocument.activeElement).toBe(closeButton)
    }

    expect(press('Escape').defaultPrevented).toBe(true)
    expect(lowerEscape).not.toHaveBeenCalled()
    expect(render().cardNode).toBeUndefined()
    expect(ownerDocument.activeElement).toBe(paidControl)
    if (controlled) expect(onOpenChange.mock.calls).toEqual([[true], [false]])

    expect(press('Escape', { repeat: true }).defaultPrevented).toBe(true)
    expect(lowerEscape).not.toHaveBeenCalled()
    press('Escape', { type: 'keyup' })
    expect(press('Escape').defaultPrevented).toBe(true)
    expect(lowerEscape).toHaveBeenCalledOnce()
})

it('uses the focused Escape path without showModal and falls back to Game tools when the opener is disabled', () => {
    const { ownerDocument, paidControl, toolsTrigger, closeButton, helpDialog, render, press } = setup({ native: false })
    render()
    expect(press('?').defaultPrevented).toBe(true)
    expect(render().cardNode).toBeDefined()
    expect(helpDialog.open).toBe(true)
    expect(ownerDocument.activeElement).toBe(closeButton)

    paidControl.disabled = true
    expect(press('Escape').defaultPrevented).toBe(true)
    expect(render().cardNode).toBeUndefined()
    expect(helpDialog.open).toBe(false)
    expect(ownerDocument.activeElement).toBe(toolsTrigger)
})

it('leaves Escape to a different focused native dialog', () => {
    const { ownerDocument, closeButton, helpDialog, render, press, modal, focusable } = setup()
    render()
    press('?')
    expect(render().cardNode).toBeDefined()

    const otherDialog = modal()
    const otherClose = focusable(otherDialog)
    otherDialog.showModal()
    otherClose.focus()
    expect(ownerDocument.activeElement).toBe(otherClose)

    // No custom key handler: the focused dialog needs its native cancel default.
    expect(press('Escape').defaultPrevented).toBe(false)
    expect(otherDialog.open).toBe(false)
    expect(helpDialog.open).toBe(true)
    expect(render().cardNode).toBeDefined()

    closeButton.focus()
    expect(press('Escape').defaultPrevented).toBe(true)
    expect(render().cardNode).toBeUndefined()
})

it('returns to Game tools when the controlled menu opener has been removed', () => {
    const { ownerDocument, toolsTrigger, closeButton, onOpenChange, render } = setup({ controlled: true })
    render()
    ownerDocument.activeElement = ownerDocument.body
    onOpenChange(true)

    const { closeNode } = render()
    expect(ownerDocument.activeElement).toBe(closeButton)
    closeNode.props.onClick()
    expect(render().cardNode).toBeUndefined()
    expect(ownerDocument.activeElement).toBe(toolsTrigger)
})

it.each([
    ['Provably fair', 'Provably-fair drawer'],
    ['Odds & RTP', 'Game odds and probability'],
])('stacks Help over %s and restores focus one Escape at a time', (menuLabel, dialogLabel) => {
    const { ownerDocument, toolsTrigger, closeButton, helpDialog, menuItems, toolbarDialogs, topModal, render, press } = setup({ toolbar: true })
    render()
    toolsTrigger.focus()
    toolsTrigger.click()
    render()
    const item = menuItems.get(menuLabel)
    item.focus()
    item.click()
    render()

    const { dialog, close } = toolbarDialogs.get(dialogLabel)
    expect(menuItems.size).toBe(0)
    expect(dialog.open).toBe(true)
    expect(topModal()).toBe(dialog)
    expect(ownerDocument.activeElement).toBe(close)

    expect(press('?').defaultPrevented).toBe(true)
    expect(render().cardNode).toBeDefined()
    expect(dialog.open).toBe(true)
    expect(helpDialog.open).toBe(true)
    expect(topModal()).toBe(helpDialog)
    expect(ownerDocument.activeElement).toBe(closeButton)
    for (const shiftKey of [false, true]) {
        expect(press('Tab', { shiftKey }).defaultPrevented).toBe(true)
        expect(ownerDocument.activeElement).toBe(closeButton)
    }

    expect(press('Escape').defaultPrevented).toBe(true)
    expect(render().cardNode).toBeUndefined()
    expect(dialog.open).toBe(true)
    expect(topModal()).toBe(dialog)
    expect(ownerDocument.activeElement).toBe(close)
    press('Escape', { type: 'keyup' })

    expect(press('Escape').defaultPrevented).toBe(true)
    render()
    expect(toolbarDialogs.has(dialogLabel)).toBe(false)
    expect(dialog.open).toBe(false)
    expect(topModal()).toBeUndefined()
    expect(ownerDocument.activeElement).toBe(toolsTrigger)
})

it.each(['Space', 'native cancel'])('keeps an open autoplay dialog behind Help through a rerender and %s dismissal', key => {
    const { ownerDocument, paidControl, closeButton, render, press, autoplayDialog, helpDialog, cancel } = setup({ controlled: true, nested: true })
    render()
    expect(press('?').defaultPrevented).toBe(true)
    render()
    expect(ownerDocument.activeElement).toBe(closeButton)
    expect(hooks.portalHost).toBe(ownerDocument.body)
    expect(helpDialog.showModal).toHaveBeenCalledOnce()

    for (const shiftKey of [true, false]) {
        expect(press('Tab', { shiftKey }).defaultPrevented).toBe(true)
        expect(ownerDocument.activeElement).toBe(closeButton)
    }
    if (key === 'Space') {
        expect(press(' ').defaultPrevented).toBe(false)
        expect(press(' ', { type: 'keyup' }).defaultPrevented).toBe(false)
    } else {
        expect(cancel(helpDialog).defaultPrevented).toBe(true)
    }
    expect(render().cardNode).toBeUndefined()
    expect(helpDialog.open).toBe(false)
    expect(autoplayDialog.open).toBe(true)
    expect(paidControl.click).not.toHaveBeenCalled()
    expect(ownerDocument.activeElement).toBe(paidControl)
})

it('closes only Help on native Space release without passing keydown to Big Win', () => {
    const { ownerDocument, paidControl, closeButton, onOpenChange, render, unmount, press } = setup({ controlled: true })
    const windowTarget = ownerDocument.defaultView
    const dismissBigWin = vi.fn()
    // BigWinOverlay dismisses on Space at window without checking defaultPrevented.
    const onBigWinKeyDown = event => {
        if (event.key === ' ') dismissBigWin()
    }
    windowTarget.addEventListener('keydown', onBigWinKeyDown)
    try {
        render()
        press('?')
        render()
        expect(ownerDocument.activeElement).toBe(closeButton)

        expect(press(' ', { code: 'Space' }).defaultPrevented).toBe(false)
        expect(dismissBigWin).not.toHaveBeenCalled()
        expect(onOpenChange.mock.calls).toEqual([[true]])
        expect(ownerDocument.activeElement).toBe(closeButton)

        expect(press(' ', { type: 'keyup', code: 'Space' }).defaultPrevented).toBe(false)
        expect(onOpenChange.mock.calls).toEqual([[true], [false]])
        expect(render().cardNode).toBeUndefined()
        expect(ownerDocument.activeElement).toBe(paidControl)
        expect(paidControl.click).not.toHaveBeenCalled()
    } finally {
        windowTarget.removeEventListener('keydown', onBigWinKeyDown)
        unmount()
    }
})

it('holds Help and its focus through repeated Enter downs and dismisses once on the matching release', () => {
    const { ownerDocument, paidControl, closeButton, onOpenChange, render, press, autoplayDialog, helpDialog } = setup({ controlled: true, nested: true })
    render()
    press('?')
    render()

    const prevented = [false, true, true].map(repeat => {
        const event = press('Enter', { repeat })
        render()
        return event.defaultPrevented
    })
    expect(paidControl.click).not.toHaveBeenCalled()
    expect(prevented).toEqual([true, true, true])
    expect(helpDialog.open).toBe(true)
    expect(ownerDocument.activeElement).toBe(closeButton)

    expect(press('Enter', { code: 'NumpadEnter' }).defaultPrevented).toBe(true)
    expect(press('Enter', { type: 'keyup', code: 'NumpadEnter' }).defaultPrevented).toBe(true)
    expect(onOpenChange.mock.calls).toEqual([[true]])
    expect(press('Enter', { type: 'keyup' }).defaultPrevented).toBe(true)
    press('Enter', { type: 'keyup' })
    expect(onOpenChange.mock.calls).toEqual([[true], [false]])
    expect(render().cardNode).toBeUndefined()
    expect(helpDialog.close).toHaveBeenCalledOnce()
    expect(autoplayDialog.open).toBe(true)
    expect(ownerDocument.activeElement).toBe(paidControl)
    expect(paidControl.click).not.toHaveBeenCalled()
})

it.each([
    ['', 'Unidentified'],
    ['Unidentified', ''],
])('dismisses Help on Enter release without a physical code (%j down, %j up)', (downCode, upCode) => {
    const { ownerDocument, paidControl, closeButton, onOpenChange, render, press } = setup({ controlled: true })
    render()
    press('?')
    render()

    expect(press('Enter', { code: downCode }).defaultPrevented).toBe(true)
    expect(render().cardNode).toBeDefined()
    expect(ownerDocument.activeElement).toBe(closeButton)
    expect(press('Escape', { code: upCode, type: 'keyup' }).defaultPrevented).toBe(false)
    expect(press('Enter', { code: upCode, type: 'keyup' }).defaultPrevented).toBe(true)
    expect(render().cardNode).toBeUndefined()
    expect(ownerDocument.activeElement).toBe(paidControl)
    expect(onOpenChange.mock.calls).toEqual([[true], [false]])
    expect(paidControl.click).not.toHaveBeenCalled()
})

it.each(['Unidentified', 'NumpadEnter'])('dismisses Help on legacy keypad Enter release (up code: %s)', upCode => {
    const { ownerDocument, paidControl, closeButton, onOpenChange, render, press } = setup({ controlled: true })
    render()
    press('?')
    render()

    expect(press('Unidentified', { code: '', location: 3, keyCode: 13 }).defaultPrevented).toBe(true)
    expect(render().cardNode).toBeDefined()
    expect(ownerDocument.activeElement).toBe(closeButton)
    expect(press('Unidentified', { code: '', location: 3, keyCode: 27, type: 'keyup' }).defaultPrevented).toBe(false)
    expect(press('Unidentified', { code: upCode, location: 3, keyCode: 13, type: 'keyup' }).defaultPrevented).toBe(true)
    expect(render().cardNode).toBeUndefined()
    expect(ownerDocument.activeElement).toBe(paidControl)
    expect(onOpenChange.mock.calls).toEqual([[true], [false]])
    expect(paidControl.click).not.toHaveBeenCalled()
})

it('swallows an Enter repeat on Close without arming a dismissal if the press started elsewhere', () => {
    const { ownerDocument, closeButton, render, press } = setup()
    render()
    press('?')
    render()

    expect(press('Enter', { type: 'keyup' }).defaultPrevented).toBe(false)
    expect(press('Enter', { repeat: true }).defaultPrevented).toBe(true)
    expect(press('Enter', { type: 'keyup' }).defaultPrevented).toBe(true)
    expect(render().cardNode).toBeDefined()
    expect(ownerDocument.activeElement).toBe(closeButton)
})

it.each(['pointer', 'Escape'])('guards the first Enter repeat through %s dismissal and reopening', dismissal => {
    const { ownerDocument, paidControl, closeButton, render, press } = setup({ controlled: true })
    render()
    press('?')
    render()
    expect(ownerDocument.activeElement).toBe(closeButton)

    expect(press('Enter', { repeat: true }).defaultPrevented).toBe(true)
    expect(render().cardNode).toBeDefined()
    if (dismissal === 'pointer') closeButton.click()
    else expect(press('Escape').defaultPrevented).toBe(true)
    expect(render().cardNode).toBeUndefined()
    expect(ownerDocument.activeElement).toBe(paidControl)
    const keyDownsBeforeRepeat = paidControl.onKeyDown.mock.calls.length

    expect(press('Enter', { repeat: true }).defaultPrevented).toBe(true)
    expect(paidControl.onKeyDown).toHaveBeenCalledTimes(keyDownsBeforeRepeat)
    expect(paidControl.onKeyUp).not.toHaveBeenCalled()
    expect(paidControl.click).not.toHaveBeenCalled()

    press('?')
    expect(render().cardNode).toBeDefined()
    expect(ownerDocument.activeElement).toBe(closeButton)
    expect(press('Enter', { repeat: true }).defaultPrevented).toBe(true)
    expect(press('Enter', { type: 'keyup' }).defaultPrevented).toBe(true)
    expect(render().cardNode).toBeDefined()
    expect(ownerDocument.activeElement).toBe(closeButton)

    expect(press('Enter').defaultPrevented).toBe(true)
    expect(render().cardNode).toBeDefined()
    expect(press('Enter', { type: 'keyup' }).defaultPrevented).toBe(true)
    expect(render().cardNode).toBeUndefined()
    expect(ownerDocument.activeElement).toBe(paidControl)
    expect(paidControl.click).not.toHaveBeenCalled()
    expect(press('Enter').defaultPrevented).toBe(false)
    expect(paidControl.click).toHaveBeenCalledOnce()
})

it.each([
    { opener: 'Spin', nested: false, dismissal: 'click', first: { code: 'Enter' }, second: { code: 'NumpadEnter', location: 3 } },
    { opener: 'Spin', nested: false, dismissal: 'Escape', first: { code: 'NumpadEnter', location: 3 }, second: { code: 'Enter' } },
    { opener: 'Autoplay Start', nested: true, dismissal: 'click', first: { code: 'NumpadEnter', location: 3 }, second: { code: 'Enter' } },
    { opener: 'Autoplay Start', nested: true, dismissal: 'Escape', first: { code: 'Enter' }, second: { code: 'NumpadEnter', location: 3 } },
    { opener: 'Spin', nested: false, dismissal: 'click', first: { code: '', location: 0 }, second: { code: 'Unidentified', location: 3 } },
    { opener: 'Autoplay Start', nested: true, dismissal: 'Escape', first: { code: 'Unidentified', location: 3 }, second: { code: '', location: 0 } },
])('blocks both held Enter keys on $opener after $dismissal ($first.code, $second.code)', ({ nested, dismissal, first, second }) => {
    const { ownerDocument, paidControl, closeButton, render, press, autoplayDialog } = setup({ controlled: true, nested })
    render()
    press('?')
    render()

    expect(press('Enter', first).defaultPrevented).toBe(true)
    expect(press('Enter', second).defaultPrevented).toBe(true)
    expect(render().cardNode).toBeDefined()
    expect(ownerDocument.activeElement).toBe(closeButton)
    if (dismissal === 'click') closeButton.click()
    else expect(press('Escape').defaultPrevented).toBe(true)
    expect(render().cardNode).toBeUndefined()
    expect(ownerDocument.activeElement).toBe(paidControl)
    expect(autoplayDialog.open).toBe(nested)

    const keyDownsBeforeRepeats = paidControl.onKeyDown.mock.calls.length
    expect(press('Enter', { ...first, repeat: true }).defaultPrevented).toBe(true)
    expect(press('Enter', { ...second, repeat: true }).defaultPrevented).toBe(true)
    expect(press('Enter', { ...first, type: 'keyup' }).defaultPrevented).toBe(true)
    expect(press('Enter', { ...second, repeat: true }).defaultPrevented).toBe(true)
    expect(paidControl.click).not.toHaveBeenCalled()
    expect(paidControl.onKeyDown).toHaveBeenCalledTimes(keyDownsBeforeRepeats)
    expect(press('Enter', { ...second, type: 'keyup' }).defaultPrevented).toBe(true)

    expect(press('Enter', second).defaultPrevented).toBe(false)
    expect(press('Enter', { ...second, type: 'keyup' }).defaultPrevented).toBe(false)
    expect(paidControl.click).toHaveBeenCalledOnce()
})

it.each([
    ['Enter', 'Enter'],
    ['', 'Unidentified'],
])('lets unrelated Enter through and accepts a fresh press after a missed keyup (%j down, %j next)', (downCode, nextCode) => {
    const { closeButton, paidControl, render, press } = setup()
    render()
    press('?')
    render()
    press('Enter', { code: downCode })
    closeButton.click()
    render()

    expect(press('Enter', { code: 'NumpadEnter' }).defaultPrevented).toBe(false)
    expect(press('Enter', { code: 'NumpadEnter', repeat: true }).defaultPrevented).toBe(false)
    expect(press('Enter', { code: 'NumpadEnter', type: 'keyup' }).defaultPrevented).toBe(false)
    expect(paidControl.click).toHaveBeenCalledTimes(2)
    expect(press('Enter', { code: nextCode, repeat: true }).defaultPrevented).toBe(true)
    expect(paidControl.click).toHaveBeenCalledTimes(2)

    // The original Enter is released while this window can't receive its keyup.
    window.dispatchEvent(new Event('blur'))
    expect(press('Enter', { code: nextCode }).defaultPrevented).toBe(false)
    expect(press('Enter', { code: nextCode, type: 'keyup' }).defaultPrevented).toBe(false)
    expect(paidControl.click).toHaveBeenCalledTimes(3)
})

it('removes the pending release guard when the whole Help component unmounts', () => {
    const { closeButton, paidControl, render, unmount, press } = setup()
    render()
    press('?')
    render()
    press('Enter')
    closeButton.click()
    render()
    expect(press('Enter', { repeat: true }).defaultPrevented).toBe(true)

    unmount()
    expect(press('Enter', { type: 'keyup' }).defaultPrevented).toBe(false)
    expect(paidControl.click).not.toHaveBeenCalled()
})

it.each(['blur', 'window blur', 'external close'])('does not dismiss on release after %s interrupts the Close gesture', interruption => {
    const { closeButton, onOpenChange, render, press } = setup({ controlled: true })
    render()
    press('?')
    render()
    expect(press('Enter').defaultPrevented).toBe(true)

    if (interruption === 'blur') {
        closeButton.blur()
        closeButton.focus()
    } else if (interruption === 'window blur') {
        window.dispatchEvent(new Event('blur'))
    } else {
        onOpenChange(false)
        render()
        onOpenChange(true)
        render()
    }

    expect(press('Enter', { type: 'keyup' }).defaultPrevented).toBe(true)
    expect(render().cardNode).toBeDefined()
})

it('allows a different Enter to dismiss after window blur while still guarding the first press', () => {
    const { paidControl, render, press } = setup()
    render()
    press('?')
    render()

    expect(press('Enter').defaultPrevented).toBe(true)
    window.dispatchEvent(new Event('blur'))
    expect(press('Enter', { code: 'NumpadEnter' }).defaultPrevented).toBe(true)
    expect(render().cardNode).toBeDefined()
    expect(press('Enter', { code: 'NumpadEnter', type: 'keyup' }).defaultPrevented).toBe(true)
    expect(render().cardNode).toBeUndefined()
    expect(press('Enter', { repeat: true }).defaultPrevented).toBe(true)
    expect(press('Enter', { type: 'keyup' }).defaultPrevented).toBe(true)
    expect(paidControl.click).not.toHaveBeenCalled()
})

it('lets Welcome claim ? before Help and releases the shortcut after onboarding closes', () => {
    const { completeOnboarding, onOpenChange, render, press } = setup({ welcome: true, controlled: true })
    expect(render().welcomeNode).toBeTruthy()

    expect(press('?').defaultPrevented).toBe(true)
    expect(render().cardNode).toBeUndefined()
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(completeOnboarding).not.toHaveBeenCalled()

    expect(press('Escape').defaultPrevented).toBe(true)
    expect(completeOnboarding).toHaveBeenCalledOnce()
    expect(render().welcomeNode).toBeNull()

    expect(press('?').defaultPrevented).toBe(true)
    expect(render().cardNode).toBeDefined()
})
