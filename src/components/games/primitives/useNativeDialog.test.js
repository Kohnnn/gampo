// QA026: the Mummy Autoplay configuration is a native modal <dialog> driven by
// `useNativeDialog`. The historical finding was Escape leaving it open with
// Close focused. That behaviour lives in this hook, not in SlotsGame, so it is
// proved here against a fake dialog/document: Escape → close, Tab containment
// at both boundaries, backdrop click → close, inner click → no close, and focus
// restored to the opener. Real browser modality (background isolation) is
// platform-provided by `showModal()` and is NOT claimed by this file.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({ effects: [], refs: [], refCursor: 0, effectCursor: 0 }))
vi.mock('react', async () => ({
    ...await vi.importActual('react'),
    useRef(initial) { const index = fixture.refCursor++; return fixture.refs[index] ||= { current: initial } },
    useEffect: effect => { fixture.effects[fixture.effectCursor++] = effect },
}))

const { default: useNativeDialog } = await import('./useNativeDialog')

function fakeDocument(activeElement) {
    return { activeElement, contains: () => true }
}

function fakeDialog() {
    const listeners = new Map()
    const closeButton = { offsetWidth: 40, offsetHeight: 20, focus: vi.fn() }
    const card = { offsetWidth: 400, offsetHeight: 300 }
    const dialog = {
        open: false,
        focus: vi.fn(),
        showModal: vi.fn(() => { dialog.open = true }),
        close: vi.fn(() => { dialog.open = false }),
        querySelectorAll: () => [closeButton],
        contains: node => node === closeButton || node === card,
        addEventListener: (type, handler) => listeners.set(type, handler),
        removeEventListener: (type) => listeners.delete(type),
        emit(type, event = {}) { listeners.get(type)?.({ preventDefault: vi.fn(), stopPropagation: vi.fn(), ...event }) },
    }
    return { dialog, closeButton, card, listeners }
}

function mount({ open = true, opener } = {}) {
    const openerButton = { focus: vi.fn() }
    const previousFocus = { focus: vi.fn() }
    vi.stubGlobal('document', fakeDocument(previousFocus))
    const parts = fakeDialog()
    const onClose = vi.fn()
    fixture.refCursor = 0; fixture.effectCursor = 0; fixture.refs = []; fixture.effects = []
    const ref = useNativeDialog(open, onClose, opener === undefined ? { current: openerButton } : { current: opener })
    ref.current = parts.dialog
    return { ...parts, onClose, openerButton, previousFocus }
}

beforeEach(() => { fixture.refCursor = 0; fixture.effectCursor = 0 })
afterEach(() => { vi.unstubAllGlobals() })

describe('native overlay dialog lifecycle', () => {
    it('opens as a real modal and puts focus on its first control', () => {
        const { dialog, closeButton } = mount()
        fixture.effects[0]()
        expect(dialog.showModal).toHaveBeenCalledOnce()
        expect(closeButton.focus).toHaveBeenCalledOnce()
    })

    it('dismisses on Escape without acting on anything else', () => {
        const { dialog, onClose, listeners } = mount()
        fixture.effects[0]()
        let prevented = false
        listeners.get('keydown')({ key: 'Escape', preventDefault: () => { prevented = true } })
        // Escape must only dismiss: no other handler in the layer can fire, and
        // the event is consumed so an outer Escape (fullscreen exit) is not
        // also triggered by the same keypress.
        expect(prevented).toBe(true)
        expect(onClose).toHaveBeenCalledOnce()
        expect(dialog.showModal).toHaveBeenCalledOnce()
    })

    it('contains Tab at both boundaries instead of leaking to the page', () => {
        const { closeButton, listeners } = mount()
        fixture.effects[0]()
        const onKey = listeners.get('keydown')
        const forward = { key: 'Tab', shiftKey: false, preventDefault: vi.fn() }
        document.activeElement = closeButton
        onKey(forward)
        expect(forward.preventDefault).toHaveBeenCalledOnce()
        expect(closeButton.focus).toHaveBeenCalledTimes(2) // entry focus + wrap
        const backward = { key: 'Tab', shiftKey: true, preventDefault: vi.fn() }
        onKey(backward)
        expect(backward.preventDefault).toHaveBeenCalledOnce()
        // A Tab outside the dialog is pulled back in on the same keypress.
        const escaped = { key: 'Tab', shiftKey: false, preventDefault: vi.fn() }
        document.activeElement = { focus: vi.fn() }
        onKey(escaped)
        expect(escaped.preventDefault).toHaveBeenCalledOnce()
    })

    it('closes on a backdrop click but not on a click inside the dialog', () => {
        const { dialog, card, onClose } = mount()
        fixture.effects[0]()
        dialog.emit('click', { target: card })
        expect(onClose).not.toHaveBeenCalled()
        dialog.emit('click', { target: dialog })
        expect(onClose).toHaveBeenCalledOnce()
    })

    it('restores focus to the persistent opener when the dialog closes', () => {
        const { dialog, openerButton, previousFocus } = mount()
        const cleanup = fixture.effects[0]()
        dialog.emit('close')
        expect(openerButton.focus).toHaveBeenCalledOnce()
        // Opening control may be gone by then; the supplied opener ref wins over
        // a detached previously-focused node.
        previousFocus.focus.mockClear()
        cleanup()
        expect(previousFocus.focus).not.toHaveBeenCalled()
    })

    it('closes an open dialog when it unmounts', () => {
        const { dialog } = mount()
        const cleanup = fixture.effects[0]()
        cleanup()
        expect(dialog.close).toHaveBeenCalledOnce()
        expect(dialog.open).toBe(false)
    })
})
