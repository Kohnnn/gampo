import { describe, expect, it } from 'vitest'
import { DEFAULT_ZROK_DEV_HOST, resolveZrokDevAllowedHosts } from './devAllowedHosts'

describe('resolveZrokDevAllowedHosts', () => {
    it('uses one exact secure default in development', () => {
        expect(resolveZrokDevAllowedHosts('development')).toEqual([DEFAULT_ZROK_DEV_HOST])
    })

    it('accepts only an exact zrok share hostname', () => {
        expect(resolveZrokDevAllowedHosts('development', 'My-Demo.share.zrok.io')).toEqual([
            'my-demo.share.zrok.io',
        ])
    })

    it.each([
        '*.share.zrok.io',
        'https://demo.share.zrok.io',
        'demo.share.zrok.io.attacker.example',
        'localhost',
        'demo.zrok.io',
    ])('falls back instead of broadening trust for %s', configuredHost => {
        expect(resolveZrokDevAllowedHosts('development', configuredHost)).toEqual([
            DEFAULT_ZROK_DEV_HOST,
        ])
    })

    it('does not grant the development host in non-development modes', () => {
        expect(resolveZrokDevAllowedHosts('production', 'demo.share.zrok.io')).toEqual([])
    })
})
