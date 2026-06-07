import { afterEach, describe, expect, it, vi } from 'vitest'
import { resumeWithTimeout } from './audioContext'

function installStorage(seed = {}) {
    const store = { ...seed }
    globalThis.window = {}
    globalThis.localStorage = {
        getItem: key => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
        setItem: (key, value) => { store[key] = String(value) },
        removeItem: key => { delete store[key] },
        clear: () => {
            for (const key of Object.keys(store)) delete store[key]
        },
    }
    return store
}

afterEach(() => {
    vi.resetModules()
    delete globalThis.window
    delete globalThis.localStorage
})

describe('resumeWithTimeout', () => {
    it('resolves when a browser blocks AudioContext.resume indefinitely', async () => {
        const start = Date.now()
        await resumeWithTimeout(new Promise(() => {}), 1)

        expect(Date.now() - start).toBeLessThan(100)
    })

    it('waits for a normal resume promise when it resolves first', async () => {
        await expect(resumeWithTimeout(Promise.resolve('running'), 100)).resolves.toBe('running')
    })

    it('persists independent master, bgm, and sfx bus volumes', async () => {
        const store = installStorage()
        vi.resetModules()
        const audio = await import('./audioContext.js')

        audio.setVolume('master', 1.5)
        audio.setVolume('bgm', 0.25)
        audio.setVolume('sfx', 0.35)

        expect(audio.getVolumes()).toEqual({ master: 1, bgm: 0.25, sfx: 0.35 })
        expect(JSON.parse(store['gampo:audio:volumes'])).toEqual({ master: 1, bgm: 0.25, sfx: 0.35 })

        vi.resetModules()
        const reloaded = await import('./audioContext.js')
        expect(reloaded.getVolumes()).toEqual({ master: 1, bgm: 0.25, sfx: 0.35 })
    })

    it('defaults to master+sfx audible and bgm muted on first run', async () => {
        installStorage()
        vi.resetModules()
        const audio = await import('./audioContext.js')

        expect(audio.isMuted()).toBe(false)
        expect(audio.isSfxMuted()).toBe(false)
        expect(audio.isBgmMuted()).toBe(true)
    })

    it('persists per-bus mute toggles and restores them on reload', async () => {
        const store = installStorage()
        vi.resetModules()
        const audio = await import('./audioContext.js')

        audio.setMuted(true)
        audio.setBgmMuted(false)
        audio.setSfxMuted(true)

        expect(store['gampo:audio:muted']).toBe('1')
        expect(store['gampo:audio:bgmMuted']).toBe('0')
        expect(store['gampo:audio:sfxMuted']).toBe('1')

        vi.resetModules()
        const reloaded = await import('./audioContext.js')
        expect(reloaded.isMuted()).toBe(true)
        expect(reloaded.isBgmMuted()).toBe(false)
        expect(reloaded.isSfxMuted()).toBe(true)
    })

    it('collapses repeated sounds within the dedupe window', async () => {
        installStorage()
        vi.resetModules()
        const audio = await import('./audioContext.js')

        expect(audio.shouldFire('outcome')).toBe(true)
        expect(audio.shouldFire('outcome')).toBe(false)
        expect(audio.shouldFire('other')).toBe(true)
    })
})
