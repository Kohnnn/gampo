import { strict as assert } from 'node:assert'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

const repoRoot = process.cwd()
const comparatorPath = join(repoRoot, 'scripts', 'lintRatchet.mjs')
const tempRoot = mkdtempSync(join(tmpdir(), 'gampo-lint-ratchet-'))

function diagnostic({ line = 1, column = 1, ruleId = 'no-unused-vars', severity = 2, messageId = 'unusedVar', message = 'unused value' } = {}) {
    return {
        filePath: join(repoRoot, 'src', 'fixture.js'),
        messages: [{ line, column, ruleId, severity, messageId, message }],
    }
}

function baseline(diagnostics) {
    return {
        schemaVersion: 1,
        provenance: { fixture: true },
        diagnostics: diagnostics.map((entry) => ({
            filePath: 'src/fixture.js',
            line: entry.messages[0].line,
            column: entry.messages[0].column,
            ruleId: entry.messages[0].ruleId,
            severity: entry.messages[0].severity,
            messageId: entry.messages[0].messageId,
            message: entry.messages[0].message,
            messageIdentity: `id:${entry.messages[0].messageId}|text:${entry.messages[0].message}`,
        })),
    }
}

function run(name, frozen, current) {
    const baselinePath = join(tempRoot, `${name}-baseline.json`)
    const currentPath = join(tempRoot, `${name}-current.json`)
    writeFileSync(baselinePath, JSON.stringify(baseline(frozen)))
    writeFileSync(currentPath, JSON.stringify(current))
    return spawnSync(process.execPath, [comparatorPath, '--baseline', relative(repoRoot, baselinePath), '--current', relative(repoRoot, currentPath)], {
        cwd: repoRoot,
        encoding: 'utf8',
    })
}

try {
    const exact = run('exact', [diagnostic()], [diagnostic()])
    assert.equal(exact.status, 0, exact.stdout + exact.stderr)
    assert.match(exact.stdout, /new=0 baseline-retained=1 baseline-resolved=0/)

    const introduced = run('introduced', [diagnostic()], [diagnostic(), diagnostic({ line: 2, column: 3 })])
    assert.notEqual(introduced.status, 0, introduced.stdout + introduced.stderr)
    assert.match(introduced.stdout, /new=1 baseline-retained=1 baseline-resolved=0/)
    assert.match(introduced.stdout, /NEW: src\/fixture\.js:2:3/)

    const resolved = run('resolved', [diagnostic()], [])
    assert.equal(resolved.status, 0, resolved.stdout + resolved.stderr)
    assert.match(resolved.stdout, /new=0 baseline-retained=0 baseline-resolved=1/)
    assert.match(resolved.stdout, /RESOLVED: src\/fixture\.js:1:1/)

    console.log('lint-ratchet: exact pass, synthetic new failure, and baseline-only resolved report passed')
} finally {
    rmSync(tempRoot, { recursive: true, force: true })
}
