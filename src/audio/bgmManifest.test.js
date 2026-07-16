import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bgmManifest, resolveBgm } from './bgmManifest'
import { gameBgmManifest, resolveGameBgm } from './gameBgmManifest'

function publicFile(url) {
    return join(process.cwd(), 'public', url.replace(/^\//, ''))
}

describe('BGM manifests', () => {
    it('maps every non-null skin and game track to a committed asset', () => {
        for (const [id, entry] of [...Object.entries(bgmManifest), ...Object.entries(gameBgmManifest)]) {
            for (const [mode, url] of Object.entries(entry)) {
                if (!url) continue
                expect(url, `${id}.${mode}`).not.toContain('casino-lounge')
                expect(existsSync(publicFile(url)), `${id}.${mode} ${url}`).toBe(true)
            }
        }
    })

    it('uses committed family tracks and null loss modes', () => {
        for (const [family, entry] of Object.entries(bgmManifest)) {
            expect(entry.idle).toBe(`/audio/bgm/${family}/idle.wav`)
            expect(entry.bonus).toBe(`/audio/bgm/${family}/bonus.wav`)
            expect(entry.loss).toBeNull()
            expect(resolveBgm(family, 'loss')).toBeNull()
        }
        for (const [gameId, entry] of Object.entries(gameBgmManifest)) {
            expect(entry.loss, gameId).toBeNull()
            expect(resolveGameBgm(gameId, 'loss')).toBeNull()
        }
    })
})
