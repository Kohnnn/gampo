import { describe, expect, it } from 'vitest'
import { sanitizeUpstreamFailure } from '../../netlify/functions/sportsbook-free-feed.mjs'

describe('sportsbook upstream failure sanitization', () => {
    it('keeps useful failure context while redacting configured provider secrets', () => {
        const secret = 'provider-token-value-that-must-never-appear'
        const context = sanitizeUpstreamFailure(
            Object.assign(new Error(`pandascore failed for token=${secret}`), { code: 'ETIMEDOUT' }),
            { PANDASCORE_TOKEN: secret },
        )

        expect(context).toEqual({
            name: 'Error',
            code: 'ETIMEDOUT',
            message: 'pandascore failed for token=[redacted]',
        })
        expect(JSON.stringify(context)).not.toContain(secret)
    })

    it('redacts authorization values, URL credentials, and opaque token-like strings', () => {
        const context = sanitizeUpstreamFailure(new Error(
            'GET https://provider.test/feed?apiKey=abc123 authorization=Bearer abc.def.ghi token=abcdefghijklmnopqrstuvwxyz1234567890',
        ))

        expect(context.message).toContain('apiKey=[redacted]')
        expect(context.message).toContain('authorization=[redacted]')
        expect(context.message).toContain('token=[redacted]')
        expect(context.message).not.toContain('abc123')
        expect(context.message).not.toContain('abc.def.ghi')
        expect(context.message).not.toContain('abcdefghijklmnopqrstuvwxyz1234567890')
    })

    it('bounds untrusted messages and rejects unsafe metadata fields', () => {
        const context = sanitizeUpstreamFailure({
            name: 'Error\nforged-log-line',
            code: 'unsafe code',
            message: `provider failed ${'x'.repeat(400)}`,
        })

        expect(context.name).toBe('Error')
        expect(context).not.toHaveProperty('code')
        expect(context.message.length).toBeLessThanOrEqual(240)
        expect(context.message).not.toContain('\n')
    })
})
