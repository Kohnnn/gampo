import { afterEach, expect, it, vi } from 'vitest'
import { claimEscape, dispatchEscape, resetEscapeClaims } from '../../../utils/escapeClaims'
import WelcomeModal from '../../WelcomeModal'
import HotkeyHelp from './HotkeyHelp'

const hooks = vi.hoisted(() => ({ open: false, effects: [], layout: [], refs: [], refIndex: 0 }))

vi.mock('react', async (importOriginal) => ({
    ...await importOriginal(),
    useState: () => [hooks.open, next => { hooks.open = next }],
    useRef: initial => hooks.refs[hooks.refIndex++] ??= { current: initial },
    useEffect: (effect, deps) => hooks.effects.push({ effect, deps }),
    useLayoutEffect: (effect, deps) => hooks.layout.push({ effect, deps }),
}))
vi.mock('react-dom', () => ({ createPortal: (node, host) => { hooks.portalHost = host; return node } }))
vi.mock('../../../hooks/useOnboarding', () => ({
    useOnboarding: () => ({ seen: hooks.welcomeSeen, completeOnboarding: hooks.completeOnboarding }),
}))

function setup({ controlled = false, nested = false, welcome = false } = {}) {
    hooks.open = false
    hooks.refs = []
    hooks.welcomeSeen = !welcome
    const completeOnboarding = vi.fn(() => { hooks.welcomeSeen = true })
    hooks.completeOnboarding = completeOnboarding
    const windowTarget = new EventTarget()
    const documentCapture = new EventTarget()
    const ownerDocument = {
        body: {},
        defaultView: windowTarget,
        addEventListener(type, listener, capture) {
            if (capture) documentCapture.addEventListener(type, listener)
        },
        removeEventListener(type, listener, capture) {
            if (capture) documentCapture.removeEventListener(type, listener)
        },
    }
    const autoplayDialog = { open: nested }
    let activeModal = nested ? autoplayDialog : null
    const helpDialog = {
        ownerDocument,
        open: false,
        showModal: vi.fn(() => { helpDialog.open = true; activeModal = helpDialog }),
        close: vi.fn(() => { helpDialog.open = false; activeModal = nested ? autoplayDialog : null }),
        contains: element => element === closeButton,
        querySelectorAll: () => [closeButton],
    }
    function focusable(modal) {
        const element = { tagName: 'BUTTON', isConnected: true, offsetWidth: 20 }
        element.focus = () => {
            if (!activeModal || activeModal === modal) ownerDocument.activeElement = element
        }
        return element
    }
    const paidControl = focusable(autoplayDialog)
    paidControl.click = vi.fn()
    paidControl.onKeyDown = vi.fn()
    const toolsTrigger = focusable()
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
    paidControl.focus()

    let committedEffects = []
    function render() {
        hooks.effects = []
        hooks.layout = []
        hooks.refIndex = 0
        const tree = HotkeyHelp(controlled ? { controlledOpen: hooks.open, onOpenChange } : {})
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
        committedEffects = [...hooks.layout, ...hooks.effects].map(({ effect, deps }, index) => {
            const previous = committedEffects[index]
            if (previous && deps?.every((value, slot) => Object.is(value, previous.deps[slot]))) return previous
            previous?.cleanup?.()
            return { deps, cleanup: effect() }
        })
        return { backdropNode, cardNode, closeNode, welcomeNode }
    }
    function unmount() {
        for (const { cleanup } of committedEffects) cleanup?.()
        committedEffects = []
    }
    function press(key, { type = 'keydown', repeat = false, code = key, location = 0, keyCode = 0 } = {}) {
        const target = ownerDocument.activeElement
        const event = new Event(type, { cancelable: true })
        let stopped = false
        Object.defineProperties(event, {
            key: { value: key }, code: { value: code }, location: { value: location }, keyCode: { value: keyCode },
            repeat: { value: repeat }, target: { value: target },
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
        if (!stopped) {
            // Sidebar routes Escape at document bubble, before the native cancel default.
            if (type === 'keydown' && key === 'Escape' && !event.defaultPrevented && dispatchEscape(event)) event.preventDefault()
            windowTarget.dispatchEvent(event)
        }
        // Model the native button defaults: Enter clicks on down, Space on up.
        if (!event.defaultPrevented && (((key === 'Enter' || legacyEnter) && type === 'keydown') || (key === ' ' && type === 'keyup'))) {
            target?.click?.()
        }
        return event
    }
    return { ownerDocument, paidControl, toolsTrigger, closeButton, onOpenChange, render, unmount, press, autoplayDialog, helpDialog, completeOnboarding }
}

afterEach(() => {
    resetEscapeClaims()
    vi.unstubAllGlobals()
})

it.each([false, true])('moves focus from a paid control into Help and restores it after Escape (controlled: %s)', controlled => {
    const { ownerDocument, paidControl, closeButton, onOpenChange, render, press } = setup({ controlled })
    const lowerEscape = vi.fn(() => true)
    claimEscape(lowerEscape)
    render()

    expect(press('?').defaultPrevented).toBe(true)
    const { backdropNode } = render()
    expect(ownerDocument.activeElement).toBe(closeButton)

    for (const shiftKey of [false, true]) {
        const event = { key: 'Tab', shiftKey, preventDefault: vi.fn() }
        backdropNode.props.onKeyDown(event)
        expect(event.preventDefault).toHaveBeenCalledOnce()
        expect(ownerDocument.activeElement).toBe(closeButton)
    }

    expect(dispatchEscape()).toBe(true)
    expect(lowerEscape).not.toHaveBeenCalled()
    expect(render().cardNode).toBeUndefined()
    expect(ownerDocument.activeElement).toBe(paidControl)
    if (controlled) expect(onOpenChange.mock.calls).toEqual([[true], [false]])
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

it.each(['Space', 'Escape'])('keeps an open autoplay dialog behind Help through a rerender and %s dismissal', key => {
    const { ownerDocument, paidControl, closeButton, render, press, autoplayDialog, helpDialog } = setup({ controlled: true, nested: true })
    render()
    expect(press('?').defaultPrevented).toBe(true)
    render()
    expect(ownerDocument.activeElement).toBe(closeButton)
    const { backdropNode } = render()
    expect(hooks.portalHost).toBe(ownerDocument.body)
    expect(helpDialog.showModal).toHaveBeenCalledOnce()

    for (const shiftKey of [true, false]) {
        const event = { key: 'Tab', shiftKey, preventDefault: vi.fn() }
        backdropNode.props.onKeyDown(event)
        expect(event.preventDefault).toHaveBeenCalledOnce()
        expect(ownerDocument.activeElement).toBe(closeButton)
    }
    if (key === 'Space') {
        expect(press(' ').defaultPrevented).toBe(false)
        expect(press(' ', { type: 'keyup' }).defaultPrevented).toBe(false)
    } else {
        const cancel = { preventDefault: vi.fn(), stopPropagation: vi.fn() }
        backdropNode.props.onCancel(cancel)
        expect(cancel.preventDefault).toHaveBeenCalledOnce()
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
    expect(press('Enter', { type: 'keyup' }).defaultPrevented).toBe(false)
    expect(render().cardNode).toBeDefined()
    expect(ownerDocument.activeElement).toBe(closeButton)
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
