// Public CLI regression controls for the local identity receipt gate.
// Run: node scripts/qa23Identity.assert.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const gate = fileURLToPath(new URL('./qa23Identity.assert.mjs', import.meta.url))
const directory = mkdtempSync(join(tmpdir(), 'qa23-identity-gate-'))
const receiptPath = join(directory, 'identity.json')
const revision = '0123456789abcdef0123456789abcdef01234567'
const otherRevision = 'fedcba9876543210fedcba9876543210fedcba98'
const receipt = {
    source: { revision: '0123456789abcdef0123456789abcdef01234567', worktreeClean: true },
    localBuild: {
        kind: 'local-build',
        preBuildHead: '0123456789abcdef0123456789abcdef01234567',
        artefact: { fileCount: 2, digest: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' },
    },
    deployedIdentity: { kind: 'unknown' },
}

function run(args, expectedStatus, label) {
    const result = spawnSync(process.execPath, [gate, ...args], { cwd: directory, encoding: 'utf8' })
    assert.ifError(result.error)
    assert.equal(result.status, expectedStatus, `${label}: ${result.stdout}${result.stderr}`)
    return result.stdout + result.stderr
}

try {
    writeFileSync(receiptPath, JSON.stringify(receipt))
    const passingOutput = run([receiptPath, revision], 0, 'matching explicit revision')
    assert.match(passingOutput, /all \d+ predicates passed/)

    const staleOutput = run([receiptPath, otherRevision], 1, 'self-consistent stale receipt')
    assert.match(staleOutput, /source\.revision.*expected|expected.*source\.revision/i)

    const noArguments = run([], 1, 'missing receipt path and revision')
    assert.match(noArguments, /usage/i)
    assert.doesNotMatch(noArguments, /qa23-identity-clean-31-10-26/)
    assert.match(run([receiptPath], 1, 'missing expected revision'), /usage/i)
    assert.match(run([revision], 1, 'missing receipt path'), /usage/i)
    assert.match(run([receiptPath, revision, 'extra'], 1, 'unexpected extra argument'), /usage/i)

    for (const invalidRevision of [
        '',
        '0123456789abcdef0123456789abcdef0123456',
        'gggggggggggggggggggggggggggggggggggggggg',
    ]) {
        run([receiptPath, invalidRevision], 1, 'malformed expected revision')
    }

    writeFileSync(receiptPath, JSON.stringify({
        ...receipt,
        source: { worktreeClean: true },
        localBuild: { ...receipt.localBuild, preBuildHead: null },
    }))
    run([receiptPath, revision], 1, 'missing receipt revision')

    writeFileSync(receiptPath, JSON.stringify({
        ...receipt,
        localBuild: { ...receipt.localBuild, preBuildHead: otherRevision },
    }))
    run([receiptPath, revision], 1, 'pre-build revision mismatch')

    assert.match(passingOutput, /deployment not verified/i)
    console.log('identity receipt gate CLI controls passed')
} finally {
    rmSync(directory, { recursive: true, force: true })
}
