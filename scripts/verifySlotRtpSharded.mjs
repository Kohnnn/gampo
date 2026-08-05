import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultConcurrency = 6
const verifierArgs = ['--loader', './scripts/extResolve.mjs', 'scripts/verifySlotRtp.mjs']

function parseVerdict(id, stdout) {
    const row = new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(\\d+\\.\\d+)\\s+(\\d+\\.\\d+)\\s+(ok|!! OFF)\\s*$`, 'm').exec(stdout)
    if (!row) return null
    return {
        target: Number(row[1]),
        realRtp: Number(row[2]),
        verdict: row[3],
        summary: stdout.includes('ALL TEMPLATES WITHIN TOLERANCE') ? 'all-within-tolerance' : null,
    }
}

function enumerateTemplateIds() {
    const source = "import { SLOT_TEMPLATES } from './src/components/games/slots/slotFactory.js'; console.log(JSON.stringify(SLOT_TEMPLATES.map(template => template.id)))"
    const result = spawnSync(process.execPath, ['--loader', './scripts/extResolve.mjs', '--input-type=module', '--eval', source], {
        cwd: repoRoot,
        encoding: 'utf8',
        env: process.env,
    })
    if (result.status !== 0) throw new Error(`Template enumeration failed: ${result.stderr || result.stdout}`)
    const line = result.stdout.trim().split(/\r?\n/).at(-1)
    const ids = JSON.parse(line)
    if (!Array.isArray(ids) || !ids.every(id => typeof id === 'string')) throw new Error('Template enumeration returned an invalid ID list')
    return ids
}

export async function runShardedVerifier({
    templateIds,
    concurrency = defaultConcurrency,
    command = process.execPath,
    argsForTemplate = () => verifierArgs,
    envForTemplate = (id) => ({ ...process.env, SLOT_VER_ONLY: id }),
    outputPath = resolve(repoRoot, 'output', 'slot-rtp-sharded-report.json'),
    onStart,
    onExit,
} = {}) {
    if (!Array.isArray(templateIds) || templateIds.length === 0) throw new Error('At least one template ID is required')
    if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('Concurrency must be a positive integer')

    const startedAt = new Date().toISOString()
    const startedMs = performance.now()
    const pending = [...templateIds]
    const results = []
    const ownedChildren = new Set()
    let interrupted = false

    const interrupt = () => {
        interrupted = true
        for (const child of ownedChildren) child.kill('SIGTERM')
    }
    process.once('SIGINT', interrupt)

    function runOne(id) {
        return new Promise((resolveResult) => {
            const elapsedStart = performance.now()
            const child = spawn(command, argsForTemplate(id), {
                cwd: repoRoot,
                env: envForTemplate(id),
                shell: false,
                windowsHide: true,
            })
            ownedChildren.add(child)
            onStart?.(id, child.pid)
            let stdout = ''
            let stderr = ''
            let spawnError = null
            child.stdout.on('data', chunk => { stdout += chunk })
            child.stderr.on('data', chunk => { stderr += chunk })
            child.on('error', error => { spawnError = error })
            child.on('close', (exitCode, signal) => {
                ownedChildren.delete(child)
                const parsedVerdict = parseVerdict(id, stdout)
                const passed = !spawnError && exitCode === 0 && signal === null && parsedVerdict?.verdict === 'ok' && parsedVerdict.summary === 'all-within-tolerance'
                const result = {
                    id,
                    command: [command, ...argsForTemplate(id)],
                    exitCode,
                    signal,
                    stdout,
                    stderr,
                    elapsedMs: Math.round(performance.now() - elapsedStart),
                    parsedVerdict,
                    passed,
                    spawnError: spawnError?.message ?? null,
                }
                results.push(result)
                onExit?.(result)
                resolveResult()
            })
        })
    }

    async function worker() {
        while (!interrupted && pending.length > 0) await runOne(pending.shift())
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker))
    process.removeListener('SIGINT', interrupt)

    for (const id of pending.splice(0)) {
        results.push({ id, command: [command, ...argsForTemplate(id)], exitCode: null, signal: null, stdout: '', stderr: '', elapsedMs: 0, parsedVerdict: null, passed: false, spawnError: interrupted ? 'Launcher interrupted before spawn' : 'Launcher queue failure' })
    }
    results.sort((a, b) => templateIds.indexOf(a.id) - templateIds.indexOf(b.id))
    const aggregate = {
        startedAt,
        finishedAt: new Date().toISOString(),
        totalElapsedMs: Math.round(performance.now() - startedMs),
        concurrency,
        templateCount: templateIds.length,
        interrupted,
        passed: !interrupted && results.length === templateIds.length && results.every(result => result.passed),
        results,
    }
    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, `${JSON.stringify(aggregate, null, 2)}\n`)
    return aggregate
}

function selectedIds(ids, argv) {
    const only = argv.find(arg => arg.startsWith('--only='))?.slice('--only='.length)
    if (!only) return ids
    const selected = only.split(',').map(id => id.trim()).filter(Boolean)
    if (selected.length === 0 || selected.some(id => !ids.includes(id))) throw new Error(`Unknown template in --only=${only}`)
    return selected
}

async function main() {
    const ids = selectedIds(enumerateTemplateIds(), process.argv.slice(2))
    const aggregate = await runShardedVerifier({ templateIds: ids })
    for (const result of aggregate.results) {
        console.log(`${result.id}\t${result.parsedVerdict?.target ?? '-'}\t${result.parsedVerdict?.realRtp ?? '-'}\t${result.parsedVerdict?.verdict ?? 'unverifiable'}\t${result.passed ? 'pass' : 'FAIL'}\t${result.elapsedMs}ms`)
    }
    console.log(`aggregate=${aggregate.passed ? 'PASS' : 'FAIL'} templates=${aggregate.templateCount} concurrency=${aggregate.concurrency} elapsed=${aggregate.totalElapsedMs}ms output=output/slot-rtp-sharded-report.json`)
    process.exitCode = aggregate.passed ? 0 : 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
    console.error(error.stack || error.message)
    process.exitCode = 1
})
