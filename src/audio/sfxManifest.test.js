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

    it('falls back to a common sample for explicitly-null (silent placeholder) roles', () => {
        // 2026-06-11 audio migration: games whose per-game role is null must
        // still resolve to a real common sample via useSfx, instead of silence.
        for (const slug of ['flip', 'diamonds', 'darts', 'pump', 'slide', 'moles', 'snakes', 'tower', 'chickencross', 'drill', 'packs', 'tomeoflife']) {
            for (const role of ['click', 'win', 'lose']) {
                const url = resolveSfx(slug, role)
                expect(url, `${slug}.${role}`).toMatch(/^\/audio\//)
                expect(existsSync(publicFile(url)), `${slug}.${role} file ${url}`).toBe(true)
            }
        }
    })

    it('aliases legacy event names (loss/flip/deal/explode/tick) to common samples', () => {
        expect(resolveSfx('color', 'loss')).toBe(resolveSfx('common', 'lose'))
        expect(resolveSfx('color', 'tick')).toMatch(/^\/audio\//)
        expect(resolveSfx('color', 'flip')).toMatch(/^\/audio\//)
        expect(resolveSfx('color', 'explode')).toMatch(/^\/audio\//)
    })

    it('wires the dino game onto real samples (was the only unmigrated game)', () => {
        for (const role of ['click', 'flip', 'explode', 'win', 'bigwin', 'lose']) {
            const url = resolveSfx('dino', role)
            expect(url, `dino.${role}`).toMatch(/^\/audio\//)
            expect(existsSync(publicFile(url)), `dino.${role} file ${url}`).toBe(true)
        }
    })
})
