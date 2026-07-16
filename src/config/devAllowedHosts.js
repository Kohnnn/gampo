const DEFAULT_ZROK_DEV_HOST = 'vdklbvkzbd1g.share.zrok.io'
const ZROK_SHARE_HOST = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.share\.zrok\.io$/

export function resolveZrokDevAllowedHosts(mode, configuredHost) {
    if (mode !== 'development') return []
    const candidate = String(configuredHost || '').trim().toLowerCase()
    if (!candidate) return [DEFAULT_ZROK_DEV_HOST]
    return ZROK_SHARE_HOST.test(candidate)
        ? [candidate]
        : [DEFAULT_ZROK_DEV_HOST]
}

export { DEFAULT_ZROK_DEV_HOST }
