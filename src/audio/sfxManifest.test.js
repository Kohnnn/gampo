import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveSfx, sfxManifest } from './sfxManifest'

const ROOT = process.cwd()
const PUBLIC_ROOT = join(ROOT, 'public')
const THIRD_PARTY = readFileSync(join(PUBLIC_ROOT, 'audio', 'THIRD_PARTY.md'), 'utf8')

function publicFile(url) {
    return join(PUBLIC_ROOT, url.replace(/^\//, ''))
}

const improvedGames = {
    tarot: ['click', 'deal', 'reveal', 'major', 'bonus', 'win', 'lose'],
    blackjack: ['click', 'chip', 'deal', 'reveal', 'shuffle', 'win', 'lose'],
    baccarat: ['click', 'chip', 'deal', 'reveal', 'win', 'lose'],
    videopoker: ['click', 'deal', 'reveal', 'shuffle', 'win', 'lose'],
    hilo: ['click', 'flip', 'reveal', 'win', 'lose'],
    war: ['click', 'deal', 'reveal', 'win', 'lose'],
    roulette: ['click', 'chip', 'spin', 'tick', 'land', 'win', 'lose'],
}

describe('sfxManifest', () => {
    it('has concrete local SFX roles for the improved card and roulette games', () => {
        for (const [slug, roles] of Object.entries(improvedGames)) {
            for (const role of roles) {
                const url = resolveSfx(slug, role)
                expect(url, `${slug}.${role}`).toMatch(/^\/audio\//)
                expect(existsSync(publicFile(url)), `${slug}.${role} file ${url}`).toBe(true)
            }
        }
    })

    it('documents every imported Kenney audio file used by the manifest', () => {
        const kenneyUrls = Object.values(sfxManifest)
            .flatMap(game => Object.values(game || {}))
            .filter(url => typeof url === 'string' && url.includes('/audio/kenney/'))

        expect(kenneyUrls.length).toBeGreaterThan(0)
        for (const url of new Set(kenneyUrls)) {
            const fileName = url.split('/').pop()
            expect(THIRD_PARTY, fileName).toContain(fileName)
        }
    })
})
