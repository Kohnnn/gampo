import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./ChatDock.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('./ChatDock.css', import.meta.url), 'utf8')

describe('ChatDock contract', () => {
    it('preserves tab order and desktop width', () => {
        const stats = source.indexOf('aria-label="Stats"')
        const progress = source.indexOf('aria-label="Progress"')
        const chat = source.indexOf('aria-label="Chat"')
        const race = source.indexOf('aria-label="Race"')

        expect(stats).toBeGreaterThan(-1)
        expect(progress).toBeGreaterThan(stats)
        expect(chat).toBeGreaterThan(progress)
        expect(race).toBeGreaterThan(chat)
        expect(css).toMatch(/\.chat-dock\s*\{[^}]*width:\s*400px/s)
        expect(css).toMatch(/\.chat-dock\.w-locked\s*\{[^}]*width:\s*400px/s)
    })

    it('supports query-opened stats/progress and minimizes transient panels on navigation', () => {
        expect(source).toContain("new URLSearchParams(location.search).get('dock')")
        expect(source).toContain('transientDockRef.current')
        expect(source).toContain("['stats', 'progress'].includes")
        expect(source).toContain("event.key !== 'Escape'")
        expect(source).toContain("setState('minimized')")
    })

    it('uses game-safe placement for Stats and Progress without changing locked width', () => {
        expect(source).toContain('GAME_SAFE_PATHS')
        expect(source).toContain("'game-safe'")
        expect(css).toMatch(/\.chat-dock\.game-safe\s*\{[^}]*width:\s*400px/s)
        expect(css).toMatch(/\.chat-dock\.game-safe\s*\{[^}]*max-height:\s*min\(46vh,\s*390px\)/s)
    })
})
