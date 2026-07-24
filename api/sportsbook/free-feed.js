import { loadProviderFeed } from '../../server/sportsbookProviderProxy.js'

const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
}

function publicFeed(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { errors: [], quotas: {} }
    const feed = { ...value }
    delete feed.errors
    delete feed.quotas
    return { ...feed, errors: [], quotas: {} }
}

export function createFreeFeedHandler({ loadFeed = loadProviderFeed, env = process.env } = {}) {
    return async function fetch(request) {
        if (request.method !== 'GET') {
            return Response.json({ errors: ['method not allowed'] }, { status: 405, headers: { ...headers, allow: 'GET' } })
        }

        try {
            return Response.json(publicFeed(await loadFeed(env)), { status: 200, headers })
        } catch {
            return Response.json({ errors: ['sportsbook provider proxy failed'] }, { status: 502, headers })
        }
    }
}

export const config = { runtime: 'edge' }

export default createFreeFeedHandler()
