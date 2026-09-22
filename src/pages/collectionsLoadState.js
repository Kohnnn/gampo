// Page-local request-attempt coordinator for the Collections page.
//
// Why a separate pure module: `vite.config.js` sets Vitest `environment: 'node'`
// and no DOM test harness is installed (`@testing-library/react`, `jsdom`,
// `happy-dom`, `react-test-renderer` are all absent), so a state/race proof
// cannot be written against rendered React. Isolating the transitions here keeps
// them deterministically testable without adding a dependency, a shared hook, or
// a renderer — and this module is intentionally private to Collections.
//
// Contract: each resource owns `idle | loading | success | error` plus a
// monotonic attempt id. Only the newest attempt may publish a terminal state, so
// a late response from a superseded request (rapid retry, unmount, or React
// StrictMode effect replay) cannot overwrite current UI.

export const IDLE = 'idle'
export const LOADING = 'loading'
export const SUCCESS = 'success'
export const ERROR = 'error'

export const CASES_RESOURCE = 'cases'
export const CATALOG_RESOURCE = 'catalog'

// The user-facing copy is frozen by the plan's Public Contracts table. Failures
// stay generic and never echo response details.
export const RESOURCE_COPY = {
    [CASES_RESOURCE]: {
        loading: 'Loading cases...',
        error: 'Couldn’t load cases.',
        retry: 'Retry cases',
    },
    [CATALOG_RESOURCE]: {
        loading: 'Loading full item catalog...',
        error: 'Couldn’t load items.',
        retry: 'Retry items',
    },
}

export function initialResource() {
    return { status: IDLE, data: null, error: null, attempt: 0 }
}

export function initialResources() {
    return {
        [CASES_RESOURCE]: initialResource(),
        [CATALOG_RESOURCE]: initialResource(),
    }
}

// Starting an attempt moves the resource to `loading` and drops any previously
// rendered data or error, so a retry cannot show stale content beside its own
// loading state. The attempt id is allocated by the caller and passed in: the
// id must be known synchronously, before any awaited response can resolve.
export function startAttempt(resources, resource, attempt) {
    return {
        ...resources,
        [resource]: { status: LOADING, data: null, error: null, attempt },
    }
}

// Invalidate without loading: an unmount or a superseding attempt advances the
// id so an in-flight response can no longer commit, while the visible state is
// left alone. The new id is allocated by the caller from the same allocator
// `startAttempt` uses, so the two can never drift apart.
export function invalidateAttempt(resources, resource, attempt) {
    return {
        ...resources,
        [resource]: { ...(resources[resource] || initialResource()), attempt },
    }
}

function isCurrent(resources, resource, attempt) {
    return (resources[resource]?.attempt ?? -1) === attempt
}

// A successful response publishes only when its attempt is still current, so an
// older success cannot overwrite a newer one. An empty array is a legitimate
// success and must stay distinct from an error.
export function succeed(resources, resource, attempt, data) {
    if (!isCurrent(resources, resource, attempt)) return resources
    return {
        ...resources,
        [resource]: { status: SUCCESS, data, error: null, attempt },
    }
}

// Rejections and `!response.ok` collapse to the same generic error. Response
// details are deliberately not surfaced.
export function fail(resources, resource, attempt) {
    if (!isCurrent(resources, resource, attempt)) return resources
    return {
        ...resources,
        [resource]: {
            status: ERROR,
            data: null,
            error: RESOURCE_COPY[resource]?.error || 'Couldn’t load.',
            attempt,
        },
    }
}

// Reads a response's JSON only when it succeeded. `!ok` is normalized to a
// rejection so both paths reach the same `fail`, and a non-ok body is never
// parsed.
export async function readJsonResponse(response) {
    if (!response || !response.ok) throw new Error('response not ok')
    return response.json()
}
