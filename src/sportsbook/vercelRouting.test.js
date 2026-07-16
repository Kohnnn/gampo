import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const vercelConfig = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'))

describe('Vercel SPA routing', () => {
    it('preserves build configuration and uses one namespace-reserving SPA fallback', () => {
        expect(vercelConfig).toMatchObject({
            framework: 'vite',
            buildCommand: 'npm run build',
            outputDirectory: 'dist',
        })
        expect(vercelConfig.rewrites).toHaveLength(1)
        expect(vercelConfig.rewrites[0]).toEqual({
            source: '/((?!api(?:/|$)|assets(?:/|$)|data(?:/|$)|audio(?:/|$)).*)',
            destination: '/index.html',
        })
    })

    it('excludes server and static namespace roots and descendants while retaining application fallback', () => {
        const source = vercelConfig.rewrites[0].source
        const expression = new RegExp(`^${source.slice(1)}$`)

        for (const path of ['/api', '/api/not-found', '/assets', '/assets/not-found.js', '/data', '/data/not-found.json', '/audio', '/audio/not-found.wav']) {
            expect(expression.test(path.slice(1))).toBe(false)
        }
        expect(expression.test('sportsbook/soccer')).toBe(true)
        expect(vercelConfig.rewrites[0].destination).toBe('/index.html')
    })
})
