import { strict as assert } from 'node:assert'
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { isAbsolute, relative, resolve, sep, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'

const schemaVersion = 1
const defaultBaselinePath = 'scripts/lintRatchetBaseline.json'
const repoRoot = process.cwd()

function toPosix(value) {
    return value.split(sep).join('/').replace(/\\/g, '/')
}

function canonicalPath(filePath, root = repoRoot) {
    const raw = String(filePath)
    const absolute = isAbsolute(raw) || win32.isAbsolute(raw)
    const candidate = absolute ? relative(root, raw) : raw
    const normalized = toPosix(candidate).replace(/^\.\//, '')
    if (!normalized || normalized === '..' || normalized.startsWith('../')) {
        throw new Error(`Diagnostic path is outside the repository: ${filePath}`)
    }
    return normalized
}

function messageIdentity(message) {
    return message.messageId == null ? `text:${message.message}` : `id:${message.messageId}|text:${message.message}`
}

export function normalizeResults(results, root = repoRoot) {
    return results
        .flatMap((result) => result.messages.map((message) => ({
            filePath: canonicalPath(result.filePath, root),
            line: message.line ?? 0,
            column: message.column ?? 0,
            ruleId: message.ruleId ?? null,
            severity: message.severity,
            messageId: message.messageId ?? null,
            message: message.message,
            messageIdentity: messageIdentity(message),
        })))
        .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
}

function diagnosticKey(diagnostic) {
    return JSON.stringify([
        diagnostic.filePath,
        diagnostic.ruleId,
        diagnostic.severity,
        diagnostic.messageIdentity ?? messageIdentity(diagnostic),
    ])
}

function locationKey(diagnostic) {
    return JSON.stringify([diagnostic.line, diagnostic.column])
}

function groupByKey(diagnostics) {
    const groups = new Map()
    for (const diagnostic of diagnostics) {
        const key = diagnosticKey(diagnostic)
        const group = groups.get(key) ?? []
        group.push(diagnostic)
        groups.set(key, group)
    }
    return groups
}

export function compareDiagnostics(baselineDiagnostics, currentDiagnostics) {
    const baselineGroups = groupByKey(baselineDiagnostics)
    const currentGroups = groupByKey(currentDiagnostics)
    const newFindings = []
    const resolvedFindings = []
    const relocatedFindings = []
    let retained = 0

    for (const key of new Set([...baselineGroups.keys(), ...currentGroups.keys()])) {
        const baseline = [...(baselineGroups.get(key) ?? [])]
        const current = [...(currentGroups.get(key) ?? [])]
        const baselineByLocation = new Map(baseline.map((diagnostic) => [locationKey(diagnostic), diagnostic]))
        const remainingCurrent = []

        for (const diagnostic of current) {
            const location = locationKey(diagnostic)
            if (baselineByLocation.delete(location)) retained++
            else remainingCurrent.push(diagnostic)
        }

        const remainingBaseline = [...baselineByLocation.values()]
        const relocatedCount = Math.min(remainingBaseline.length, remainingCurrent.length)
        for (let index = 0; index < relocatedCount; index++) {
            retained++
            relocatedFindings.push({ from: remainingBaseline[index], to: remainingCurrent[index] })
        }
        newFindings.push(...remainingCurrent.slice(relocatedCount))
        resolvedFindings.push(...remainingBaseline.slice(relocatedCount))
    }

    return { newFindings, retained, resolvedFindings, relocatedFindings }
}

function formatDiagnostic(diagnostic) {
    return `${diagnostic.filePath}:${diagnostic.line}:${diagnostic.column} [${diagnostic.ruleId ?? 'fatal'}/${diagnostic.severity}] ${diagnostic.message}`
}

export function printComparison(comparison) {
    console.log(`lint-ratchet: new=${comparison.newFindings.length} baseline-retained=${comparison.retained} baseline-resolved=${comparison.resolvedFindings.length} relocated=${comparison.relocatedFindings.length}`)
    for (const diagnostic of comparison.newFindings) console.log(`NEW: ${formatDiagnostic(diagnostic)}`)
    for (const diagnostic of comparison.resolvedFindings) console.log(`RESOLVED: ${formatDiagnostic(diagnostic)}`)
    for (const relocation of comparison.relocatedFindings) {
        console.log(`RELOCATED: ${formatDiagnostic(relocation.from)} => ${relocation.to.line}:${relocation.to.column}`)
    }
}

function parseArgs(argv) {
    const args = new Map()
    for (let index = 0; index < argv.length; index++) {
        const value = argv[index]
        if (!value.startsWith('--')) continue
        const [name, inline] = value.slice(2).split('=', 2)
        args.set(name, inline ?? argv[index + 1])
        if (inline === undefined && argv[index + 1] && !argv[index + 1].startsWith('--')) index++
    }
    return args
}

function runEslint() {
    const eslintBin = resolve(repoRoot, 'node_modules', 'eslint', 'bin', 'eslint.js')
    const result = spawnSync(process.execPath, [eslintBin, '.', '-f', 'json'], {
        cwd: repoRoot,
        encoding: 'utf8',
        maxBuffer: 20 * 1024 * 1024,
    })
    if (result.error) throw result.error
    if (result.status !== 0 && result.status !== 1) throw new Error(result.stderr || `ESLint exited ${result.status}`)
    return JSON.parse(result.stdout)
}

function readEslintResults(path) {
    return JSON.parse(readFileSync(resolve(repoRoot, path), 'utf8'))
}

function readBaseline(path) {
    const baseline = JSON.parse(readFileSync(resolve(repoRoot, path), 'utf8'))
    assert.equal(baseline.schemaVersion, schemaVersion, `Unsupported baseline schema in ${path}`)
    assert.ok(Array.isArray(baseline.diagnostics), `Baseline diagnostics missing in ${path}`)
    return baseline
}

export function createBaseline(diagnostics) {
    return {
        schemaVersion,
        provenance: {
            generator: 'node scripts/lintRatchet.mjs --write-baseline',
            source: 'node node_modules/eslint/bin/eslint.js . -f json',
            messageIdentity: 'messageId when present; otherwise exact message text',
            ownership: 'Lint baseline updates require reviewed raw ESLint output and comparator fixture evidence; never hand-edit diagnostics.',
        },
        diagnostics,
    }
}

function main() {
    const args = parseArgs(process.argv.slice(2))
    const baselinePath = args.get('baseline') ?? defaultBaselinePath
    const currentResults = args.has('current') ? readEslintResults(args.get('current')) : runEslint()
    const currentDiagnostics = normalizeResults(currentResults)

    if (args.has('write-baseline')) {
        writeFileSync(resolve(repoRoot, baselinePath), `${JSON.stringify(createBaseline(currentDiagnostics), null, 2)}\n`)
        console.log(`lint-ratchet: wrote ${currentDiagnostics.length} diagnostic(s) to ${baselinePath}`)
        return
    }

    const baseline = readBaseline(baselinePath)
    const comparison = compareDiagnostics(baseline.diagnostics, currentDiagnostics)
    printComparison(comparison)
    process.exitCode = comparison.newFindings.length ? 1 : 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main()
