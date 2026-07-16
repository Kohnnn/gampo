import { readFile } from 'node:fs/promises'
import path from 'node:path'

const ROW_FILE = /^\/data\/plinko\/outcomes\/rows-(8|9|10|11|12|13|14|15|16)\.json$/
const EXPORT_PREFIX = 'export default '

export function extractPlinkoOutcomesJson(source, sourcePath = 'Plinko outcomes source') {
    const exportOffset = source.indexOf(EXPORT_PREFIX)
    if (exportOffset < 0) throw new Error(`Missing default export in ${sourcePath}`)
    const jsonText = source
        .slice(exportOffset + EXPORT_PREFIX.length)
        .trim()
        .replace(/;$/, '')
    JSON.parse(jsonText)
    return jsonText
}

export function plinkoOutcomesStaticPlugin({ root = process.cwd() } = {}) {
    const sourceDir = path.join(root, 'src', 'components', 'games', 'plinko', 'engine', 'outcomes')
    const cache = new Map()

    async function loadRow(rowCount) {
        if (!cache.has(rowCount)) {
            const sourcePath = path.join(sourceDir, `rows-${rowCount}.js`)
            cache.set(rowCount, readFile(sourcePath, 'utf8').then(source => (
                extractPlinkoOutcomesJson(source, sourcePath)
            )).catch(error => {
                cache.delete(rowCount)
                throw error
            }))
        }
        return cache.get(rowCount)
    }

    return {
        name: 'gampo-plinko-outcomes-static-json',
        configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
                const pathname = new URL(req.url || '/', 'http://localhost').pathname
                const match = ROW_FILE.exec(pathname)
                if (!match) return next()
                try {
                    const json = await loadRow(Number(match[1]))
                    res.statusCode = 200
                    res.setHeader('content-type', 'application/json; charset=utf-8')
                    res.setHeader('cache-control', 'public, max-age=3600')
                    res.end(json)
                } catch (error) {
                    next(error)
                }
            })
        },
        async generateBundle() {
            for (let rowCount = 8; rowCount <= 16; rowCount += 1) {
                this.emitFile({
                    type: 'asset',
                    fileName: `data/plinko/outcomes/rows-${rowCount}.json`,
                    source: await loadRow(rowCount),
                })
            }
        },
    }
}
