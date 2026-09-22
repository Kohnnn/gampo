import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isEditableHotkeyTarget } from './HotkeyHelp'
import { containTab } from './useNativeDialog'

const hotkeySource = readFileSync(new URL('./HotkeyHelp.jsx', import.meta.url), 'utf8')
const toolbarSource = readFileSync(new URL('./GameToolbar.jsx', import.meta.url), 'utf8')
const shellSource = readFileSync(new URL('./GameShell.jsx', import.meta.url), 'utf8')
const fairnessSource = readFileSync(new URL('./FairnessDrawer.jsx', import.meta.url), 'utf8')
const oddsSource = readFileSync(new URL('./OddsPopup.jsx', import.meta.url), 'utf8')
const dialogSource = readFileSync(new URL('./useNativeDialog.js', import.meta.url), 'utf8')

const target = (tagName, options = {}) => ({
    tagName,
    isContentEditable: options.isContentEditable,
    getAttribute: name => options[name],
    parentElement: options.parentElement,
})

describe('game accessibility contract', () => {
    it('should request the desired help state only for supported keyboard targets', () => {
        expect(isEditableHotkeyTarget(target('INPUT'))).toBe(true)
        expect(isEditableHotkeyTarget(target('DIV', { role: 'textbox' }))).toBe(true)
        expect(isEditableHotkeyTarget(target('SPAN', { parentElement: target('DIV', { isContentEditable: true }) }))).toBe(true)
        expect(isEditableHotkeyTarget(target('BUTTON'))).toBe(false)
        expect(hotkeySource).toContain('requestOpen(!isOpen)')
        expect(hotkeySource).toContain("e.key === '?'")
        expect(hotkeySource).toContain('e.repeat || e.ctrlKey || e.metaKey || e.altKey')
        expect(hotkeySource).toContain("e.key === 'Escape' && isOpen")
        expect(hotkeySource).toContain('<button type="button" className="hotkey-close"')
        expect(hotkeySource.match(/window\.addEventListener\('keydown', onKey\)/g)).toHaveLength(1)
    })

    it('keeps the toolbar help link native and defaults shared shells to game info', () => {
        expect(toolbarSource).toContain('<HotkeyHelp controlledOpen={hotkeyOpen} onOpenChange={setHotkeyOpen} />')
        expect(toolbarSource).toContain('href={helpHref}')
        expect(toolbarSource).not.toContain('target="_blank"')
        expect(shellSource).toContain("helpHref = '#game-info'")
    })

    it('drives both shared overlays from a native modal dialog', () => {
        // AC5: entry, containment and restoration are platform behaviour only
        // when the overlay is a real <dialog> opened with showModal().
        expect(fairnessSource).toContain('<dialog')
        expect(fairnessSource).toContain('ref={dialogRef}')
        expect(oddsSource).toContain('<dialog')
        expect(oddsSource).toContain('ref={dialogRef}')
        expect(dialogSource).toContain('dialog.showModal()')
        // Focus entry: the first focusable control inside the dialog.
        expect(dialogSource).toContain('(items[0] || dialog).focus?.()')
        // Restoration: focus returns to whatever held it before opening.
        expect(dialogSource).toContain('const returnTo = document.activeElement')
        expect(dialogSource).toContain('target.focus()')
    })

    it('keeps Tab inside the dialog at both boundaries', () => {
        const focusables = [
            { offsetWidth: 10, offsetHeight: 10, focus() { this.focused = true } },
            { offsetWidth: 10, offsetHeight: 10, focus() { this.focused = true } },
        ]
        const dialog = {
            querySelectorAll: () => focusables,
            contains: (el) => focusables.includes(el),
        }

        // Forward Tab on the last control wraps to the first.
        globalThis.document = { activeElement: focusables[1] }
        let prevented = false
        containTab({ key: 'Tab', shiftKey: false, preventDefault() { prevented = true } }, dialog)
        expect(prevented).toBe(true)
        expect(focusables[0].focused).toBe(true)

        // Reverse Tab on the first control wraps to the last.
        focusables[1].focused = false
        globalThis.document = { activeElement: focusables[0] }
        prevented = false
        containTab({ key: 'Tab', shiftKey: true, preventDefault() { prevented = true } }, dialog)
        expect(prevented).toBe(true)
        expect(focusables[1].focused).toBe(true)

        // A Tab in the middle is left to the platform.
        globalThis.document = { activeElement: focusables[0] }
        prevented = false
        containTab({ key: 'Tab', shiftKey: false, preventDefault() { prevented = true } }, dialog)
        expect(prevented).toBe(false)

        // Non-Tab keys are never intercepted.
        prevented = false
        containTab({ key: 'a', shiftKey: false, preventDefault() { prevented = true } }, dialog)
        expect(prevented).toBe(false)
    })
})
