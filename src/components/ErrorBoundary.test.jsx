import { afterEach, describe, expect, it, vi } from 'vitest'
import ErrorBoundary from './ErrorBoundary'

function createBrowser({ storageFails = false } = {}) {
    let stored = null
    return {
        sessionStorage: {
            getItem: vi.fn(() => {
                if (storageFails) throw new Error('storage unavailable')
                return stored
            }),
            setItem: vi.fn(() => {
                if (storageFails) throw new Error('storage unavailable')
                stored = '1'
            }),
        },
        location: { reload: vi.fn() },
    }
}

afterEach(() => {
    delete globalThis.window
    vi.restoreAllMocks()
})

describe('ErrorBoundary recovery behavior', () => {
    it('automatically reloads once for recognized chunk failures', () => {
        const boundary = new ErrorBoundary({})
        const browser = createBrowser()
        globalThis.window = browser
        const error = new Error('Loading chunk 2 failed')
        vi.spyOn(console, 'error').mockImplementation(() => {})

        boundary.componentDidCatch(error, {})

        expect(browser.location.reload).toHaveBeenCalledTimes(1)
        expect(console.error).not.toHaveBeenCalled()
    })

    it('does not auto-reload ordinary errors and keeps them retryable in place', () => {
        const boundary = new ErrorBoundary({})
        const browser = createBrowser()
        globalThis.window = browser
        const error = new Error('ordinary game error')
        boundary.state = { error }
        boundary.setState = vi.fn()
        vi.spyOn(console, 'error').mockImplementation(() => {})

        boundary.componentDidCatch(error, {})
        boundary.reset()

        expect(browser.location.reload).not.toHaveBeenCalled()
        expect(console.error).toHaveBeenCalledWith('GamePo route error:', error, {})
        expect(boundary.setState).toHaveBeenCalledWith({ error: null })
    })

    it('keeps Retry local when automatic recovery cannot run or was already guarded', () => {
        const boundary = new ErrorBoundary({})
        const error = new Error('Loading chunk 2 failed')
        boundary.state = { error }
        boundary.setState = vi.fn()
        vi.spyOn(console, 'error').mockImplementation(() => {})

        boundary.componentDidCatch(error, {})
        boundary.reset()
        expect(boundary.setState).toHaveBeenCalledWith({ error: null })

        const browser = createBrowser()
        globalThis.window = browser
        boundary.setState.mockClear()
        boundary.componentDidCatch(error, {})
        boundary.reset()

        expect(browser.location.reload).toHaveBeenCalledTimes(1)
        expect(boundary.setState).toHaveBeenCalledWith({ error: null })
    })
})
