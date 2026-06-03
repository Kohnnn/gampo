import { describe, expect, it } from 'vitest'
import { historyRowKey } from './HistoryDrawer'

describe('HistoryDrawer', () => {
    it('keeps legacy duplicate ids unique by row', () => {
        const first = historyRowKey({ id: 'undefined-vault', label: 'Vault', profit: 1 }, 0)
        const second = historyRowKey({ id: 'undefined-vault', label: 'Vault', profit: 1 }, 1)

        expect(first).not.toBe(second)
        expect(first).toContain('undefined-vault')
    })
})
