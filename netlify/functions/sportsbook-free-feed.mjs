import { loadProviderFeed } from '../../server/sportsbookProviderProxy.js'

const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
}

const SENSITIVE_VALUE_PATTERN = /((?:api[_-]?key|token|authorization|password|secret)\s*[=:]\s*)([^\s&,;]+)/gi
const BEARER_PATTERN = /(bearer\s+)[a-z0-9._~+/=-]+/gi
const URL_SECRET_PATTERN = /([?&](?:api[_-]?key|token|authorization|password|secret)=)[^&\s]+/gi
const OPAQUE_SECRET_PATTERN = /\b[a-z0-9_-]{32,}\b/gi

export function sanitizeUpstreamFailure(error, env = {}) {
    let message = typeof error?.message === 'string' ? error.message : 'upstream request failed'
    const secretNames = [
        'ODDS_API_KEYS',
        'SPORTSGAMEODDS_TOKEN',
        'PANDASCORE_TOKEN',
        'ODDS_API_IO_TOKEN',
        'API_FOOTBALL_TOKEN',
        'SportsGameOdds_token',
        'pandascore_token',
        'odds-api_token',
        'api-football_token',
    ]
    for (const name of secretNames) {
        for (const value of String(env?.[name] || '').split(',').map(part => part.trim()).filter(Boolean)) {
            message = message.split(value).join('[redacted]')
        }
    }
    message = message
        .replace(BEARER_PATTERN, '$1[redacted]')
        .replace(URL_SECRET_PATTERN, '$1[redacted]')
        .replace(SENSITIVE_VALUE_PATTERN, '$1[redacted]')
        .replace(OPAQUE_SECRET_PATTERN, '[redacted]')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 240)

    const name = typeof error?.name === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(error.name)
        ? error.name
        : 'Error'
    const code = typeof error?.code === 'string' && /^[A-Z0-9_-]{1,32}$/.test(error.code)
        ? error.code
        : undefined
    return { name, ...(code ? { code } : {}), message }
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
    } catch (error) {
        console.error('sportsbook upstream failure', sanitizeUpstreamFailure(error, process.env))
        return {
            statusCode: 502,
            headers,
            body: JSON.stringify({ errors: ['sportsbook provider proxy failed'] }),
        }
    }
}
