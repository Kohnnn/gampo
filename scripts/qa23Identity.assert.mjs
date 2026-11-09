// Ticket #28 — E1: enforcing assertion wrapper for the AC01/PG-01 identity receipt.
//
// `qa23Identity.mjs` only serializes the identity record and exits 0. Its PG-01
// predicates were asserted in prose, so a violated receipt satisfied the gate.
// This wrapper reads a receipt and exits NON-ZERO on any violation, including
// `worktreeClean !== true`, which the producer only records.
//
// No network, no build, no writes. Receipt mode requires an existing file;
// report self-check mode invokes the producer and inspects its JSON output.
//
// Usage:
//   node scripts/qa23Identity.assert.mjs [receipt.json]
//   node scripts/qa23Identity.assert.mjs --self-check-report
// Default receipt: /tmp/qa23-identity-clean-31-10-26.json
//
// Exit 0 only if every predicate passes; exit 1 otherwise.

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const DEFAULT_RECEIPT = '/tmp/qa23-identity-clean-31-10-26.json'

// 64 lowercase hex chars.
const DIGEST_RE = /^[0-9a-f]{64}$/

function main() {
    const arg = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : DEFAULT_RECEIPT
    const results = []
    const check = (name, ok, detail) => {
        results.push({ name, ok })
        console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` - ${detail}`}`)
    }

    let receipt
    try {
        receipt = JSON.parse(readFileSync(arg, 'utf8'))
    } catch (error) {
        // A missing or unparseable receipt is itself a gate failure, not a crash.
        console.log(`FAIL receipt-readable - ${arg}: ${error.message}`)
        process.exitCode = 1
        return
    }
    check('receipt-readable', true, '')

    // --- The six predicates -------------------------------------------------
    const localBuild = receipt.localBuild ?? {}
    const artefact = localBuild.artefact ?? null
    const source = receipt.source ?? {}

    check(
        'localBuild.kind',
        localBuild.kind === 'local-build',
        `expected 'local-build', got ${JSON.stringify(localBuild.kind)}`,
    )

    check(
        'localBuild.artefact.fileCount',
        artefact !== null && Number.isInteger(artefact.fileCount) && artefact.fileCount >= 1,
        artefact === null
            ? 'artefact is null/absent (run --build to produce it)'
            : `expected integer >= 1, got ${JSON.stringify(artefact.fileCount)}`,
    )

    check(
        'localBuild.artefact.digest',
        artefact !== null && typeof artefact.digest === 'string' && DIGEST_RE.test(artefact.digest),
        artefact === null
            ? 'artefact is null/absent'
            : `expected 64 lowercase hex chars, got ${JSON.stringify(artefact.digest)}`,
    )

    check(
        'localBuild.preBuildHead === source.revision',
        typeof localBuild.preBuildHead === 'string' &&
            localBuild.preBuildHead.length > 0 &&
            localBuild.preBuildHead === source.revision,
        `preBuildHead ${JSON.stringify(localBuild.preBuildHead)} !== source.revision ${JSON.stringify(source.revision)}`,
    )

    // `deployedIdentity.kind === 'unknown'` unless an attestation was supplied.
    // An owner-attested deployment is the ONLY other accepted kind here; an
    // absent/blank field is a violation because the record must state one or
    // the other explicitly.
    const deployed = receipt.deployedIdentity ?? {}
    const deployedOk = deployed.kind === 'unknown' || deployed.kind === 'owner-attested'
    check(
        'deployedIdentity.kind',
        deployedOk,
        `expected 'unknown' or 'owner-attested', got ${JSON.stringify(deployed.kind)}`,
    )

    check(
        'source.worktreeClean',
        source.worktreeClean === true,
        `expected true, got ${JSON.stringify(source.worktreeClean)}`,
    )

    const failed = results.filter((r) => !r.ok)
    if (failed.length > 0) {
        console.log(`\n${failed.length} predicate(s) failed for ${arg}`)
        process.exitCode = 1
    } else {
        console.log(`\nall ${results.length} predicates passed for ${arg}`)
    }
}

function selfCheckReport() {
    const script = fileURLToPath(new URL('./qa23Identity.mjs', import.meta.url))
    const output = execFileSync(process.execPath, [script], {
        encoding: 'utf8',
        env: { ...process.env, QA23_DEPLOYED_IDENTITY: '' },
    })
    const report = JSON.parse(output)
    const qa028 = report.p1Classifications.rows.find((row) => row.id === 'QA028')
    assert.ok(qa028, 'report includes QA028')
    assert.equal(qa028.currentCandidateEvidence.guardsButtonTag, true, 'candidate scan finds button guard')
    assert.match(qa028.note, /(?:button.*guard|guard.*button)/i, 'note acknowledges the button guard')
    assert.doesNotMatch(qa028.note, /no evidence.*(?:interactive|dialog).*guard/i, 'note does not deny observed guards')
    assert.match(qa028.note, /native/i, 'note separates native verification from textual evidence')
    assert.match(qa028.currentCandidateVerdict, /^open/, 'classification remains open pending verification')
    assert.equal(report.deployedIdentity.kind, 'unknown', 'local report does not identify hosted bytes')
    assert.ok(report.p1Classifications.caveats.some((caveat) => /not fresh reproductions/i.test(caveat)))
    console.log('PASS QA028 report evidence and verification status')
}

if (process.argv[2] === '--self-check-report') selfCheckReport()
else main()
