import { describe, expect, it } from 'vitest'
import { resumeWithTimeout } from './audioContext'

describe('resumeWithTimeout', () => {
    it('resolves when a browser blocks AudioContext.resume indefinitely', async () => {
        const start = Date.now()
        await resumeWithTimeout(new Promise(() => {}), 1)

        expect(Date.now() - start).toBeLessThan(100)
    })

    it('waits for a normal resume promise when it resolves first', async () => {
        await expect(resumeWithTimeout(Promise.resolve('running'), 100)).resolves.toBe('running')
    })
})
