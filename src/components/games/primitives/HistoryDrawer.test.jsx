import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { historyRowKey } from './HistoryDrawer'

const source = readFileSync(new URL('./HistoryDrawer.jsx', import.meta.url), 'utf8')

describe('HistoryDrawer', () => {
    it('keeps legacy duplicate ids unique by row', () => {
        const first = historyRowKey({ id: 'undefined-vault', label: 'Vault', profit: 1 }, 0)
        const second = historyRowKey({ id: 'undefined-vault', label: 'Vault', profit: 1 }, 1)

        expect(first).not.toBe(second)
        expect(first).toContain('undefined-vault')
    })

    it('should keep History disclosure summary-owned while Clear is a sibling button', () => {
        const summary = source.slice(source.indexOf('<summary'), source.indexOf('</summary>'))
        expect(summary).not.toContain('hd-clear')
        expect(source).toContain('<button type="button" className="hd-clear" onClick={onClear}>Clear</button>')
        expect(source.indexOf('hd-clear')).toBeGreaterThan(source.indexOf('</summary>'))
        expect(source).toContain('history.length > 0 &&')
    })
})
