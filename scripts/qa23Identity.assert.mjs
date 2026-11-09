// Ticket #28 — E1: enforcing assertion wrapper for the AC01/PG-01 identity receipt.
//
// `qa23Identity.mjs` only serializes the identity record and exits 0. Its PG-01
// predicates were asserted in prose, so a violated receipt satisfied the gate.
// This wrapper reads a receipt and exits NON-ZERO on any violation, including
// `worktreeClean !== true`, which the producer only records.
//
// No network, no build, no writes. The receipt must already exist.
//
// Usage:
//   node scripts/qa23Identity.assert.mjs [receipt.json]
// Default receipt: /tmp/qa23-identity-clean-31-10-26.json
//
// Exit 0 only if every predicate passes; exit 1 otherwise.

import { readFileSync } from 'node:fs'

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

main()
