import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./useGameSession.js', import.meta.url), 'utf8')

describe('useGameSession record id contract', () => {
    it('persists and deduplicates record ids without forwarding them to payout aggregators', () => {
        expect(source).toContain('const next = [{ ...entry, ts: Date.now() }, ...prev].slice(0, HISTORY_LIMIT)')
        expect(source).toContain('const mirrorId = `${gameId}:${entry.id || entry.ts || entry.label}`')

        const aggregatorSection = source.slice(source.indexOf('recordPnl({'), source.indexOf('} catch { /* ignore */ }'))
        expect(aggregatorSection).not.toMatch(/\bid\s*:/)
    })
})
