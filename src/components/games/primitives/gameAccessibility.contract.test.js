import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isEditableHotkeyTarget } from './HotkeyHelp'

const hotkeySource = readFileSync(new URL('./HotkeyHelp.jsx', import.meta.url), 'utf8')
const toolbarSource = readFileSync(new URL('./GameToolbar.jsx', import.meta.url), 'utf8')
const shellSource = readFileSync(new URL('./GameShell.jsx', import.meta.url), 'utf8')

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
})
