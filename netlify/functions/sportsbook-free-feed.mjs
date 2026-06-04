import { loadProviderFeed } from '../../server/sportsbookProviderProxy.js'

const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
}

export async function handler(event) {
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ errors: ['method not allowed'] }),
        }
    }

    try {
        const feed = await loadProviderFeed(process.env)
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(feed),
        }
    } catch {
        return {
            statusCode: 502,
            headers,
            body: JSON.stringify({ errors: ['sportsbook provider proxy failed'] }),
        }
    }
}
