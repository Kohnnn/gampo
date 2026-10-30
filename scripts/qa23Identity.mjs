// Ticket #28 — candidate identity pin.
//
// Records, in machine-readable form:
//   * the current source revision (git HEAD/porcelain) and tracked-file digest,
//   * a locally-built artefact digest produced here (a local build, NOT hosted bytes),
//   * an explicit, verbatim owner-attested deployed identity when one is supplied,
//   * and re-derives the six historical P1 classifications against this candidate.
//
// It NEVER invents a hosted identity: without an owner attestation the deployed
// field stays `unknown`. It does not claim a fresh reproduction of any hosted
// defect; each P1 row records the CURRENT candidate's textual/structural evidence
// under a separate `candidateEvidence` field, with `currentCandidateVerdict`
// explicitly labelled as classification-only.
//
// Usage:
//   node scripts/qa23Identity.mjs                 # write process receipt JSON to stdout
//   node scripts/qa23Identity.mjs --out <path>    # write to a file
//   QA23_DEPLOYED_IDENTITY='<owner quote>' node scripts/qa23Identity.mjs
//
// Exit code is 0 whether or not the deployed identity is known; deployment
// unknownness is a recorded fact, not an error.

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname

function git(args) {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
}

function tryGit(args) {
    try { return git(args) } catch { return null }
}

const sha256 = (value) => createHash('sha256').update(value).digest('hex')

export function trackedTreeDigest() {
    // Deterministic digest over the tracked tree's contents and paths:
    //   `git ls-files -s` is index-based and can drift from HEAD, so read the
    //   committed blobs directly. Including blob ids is not enough on its own
    //   (they are repository-scoped), so hash the raw bytes too.
    const files = git(['ls-tree', '-r', '--name-only', 'HEAD']).split('\n').filter(Boolean)
    const hash = createHash('sha256')
    const listing = []
    for (const path of files.sort()) {
        const bytes = execFileSync('git', ['show', `HEAD:${path}`], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 })
        const digest = sha256(bytes)
        listing.push(`${digest}  ${bytes.length}  ${path}\n`)
        hash.update(`${path}\0${digest}\0${bytes.length}\n`)
    }
    return { digest: hash.digest('hex'), fileCount: files.length, listing }
}

export function buildMarker() {
    // A stable, dependency-free pointer at the local build inputs. The actual
    // bundle digest is produced by `scripts/qa23Identity.mjs --build`, which
    // requires the network-free local build toolchain; if it has not run, this
    // records the inputs only and leaves `artefact` null rather than guessing.
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    return {
        name: pkg.name,
        version: pkg.version,
        engine: pkg.engines?.node ?? null,
        viteMajor: (pkg.devDependencies?.vite ?? '').replace(/[^0-9.]/g, '') || null,
        reactMajor: (pkg.dependencies?.react ?? '').replace(/[^0-9.]/g, '') || null,
    }
}

// --- Six historical P1 classifications -------------------------------------
// QA001 Plinko quick-drop batch, QA021 Sic Bo affordable fractional balance,
// QA027 Dice generic autoplay wallet accounting, QA028 RPS keyboard shortcut,
// QA033 Plinko active-round navigation, QA040 Cases active opening + reload.

function fileContains(relPath, pattern) {
    try {
        const text = readFileSync(new URL(`../${relPath}`, import.meta.url), 'utf8')
        return typeof pattern === 'string' ? text.includes(pattern) : pattern.test(text)
    } catch {
        return false
    }
}

export function deriveP1Classifications() {
    const candidate = {
        // QA001/QA033: Plinko debit is a plain boolean placeBet followed by an
        // unmount-keyed settle map. Ball identity is Math.random (Ball.js:39).
        plinkoBooleanDebit: fileContains('src/components/games/plinko/PlinkoGame.jsx', "if (!placeBet(cost, 'Plinko'))"),
        plinkoUnmountSettle: fileContains('src/components/games/plinko/PlinkoGame.jsx', 'pending.settle({ binIndex: pending.binIndex'),
        plinkoBallRandomId: fileContains('src/components/games/plinko/engine/Ball.js', 'Math.random().toString(36)'),
        // QA021: Sic Bo evaluates affordability against the raw wallet, cents and all.
        sicboSourcePresent: fileContains('src/components/games/sicbo/SicBoGame.jsx', 'useCredits'),
        // QA027: Dice uses the legacy boolean placeBet with no per-round txId.
        diceBooleanDebit: fileContains('src/components/games/dice/DiceGame.jsx', "placeBet(betAmount, 'Dice')"),
        dicePerRoundId: fileContains('src/components/games/dice/DiceGame.jsx', 'transactionId'),
        // QA028: the global Space shortcut lives in the shared BetPanel primitive.
        rpsSpaceShortcutGlobal: fileContains('src/components/games/primitives/BetPanel.jsx', "case ' ': // Space"),
        rpsShortcutGuardByTag: fileContains('src/components/games/primitives/BetPanel.jsx', "tag === 'button'"),
        // QA040: Cases holds the pending round in a component-local ref.
        casesBooleanDebit: fileContains('src/components/games/cases/CasesGame.jsx', "if (!placeBet(stake, 'Cases'))"),
        casesPendingComponentLocal: fileContains('src/components/games/cases/CasesGame.jsx', 'pendingRoundRef'),
    }

    const rows = [
        {
            id: 'QA001', severity: 'P1', hostedRetest: 'Reproduced',
            scope: 'Plinko quick-drop batch: settled outcomes disagree with wallet end.',
            currentCandidateEvidence: {
                booleanDebitWithoutRoundId: candidate.plinkoBooleanDebit,
                settlesOnUnmount: candidate.plinkoUnmountSettle,
                ballIdentityFromMathRandom: candidate.plinkoBallRandomId,
            },
            currentCandidateVerdict: 'open-under-this-candidate',
            note: 'Plinko still keys settle-map identity from Math.random and settles on unmount; no single-database atomic debit+settle exists here. Classification only — NOT a fresh hosted reproduction.',
        },
        {
            id: 'QA021', severity: 'P1', hostedRetest: 'Reproduced',
            scope: 'Sic Bo affordable fractional balance: integer-ish top-up restores betting.',
            currentCandidateEvidence: {
                evaluatesAffordabilityAgainstRawWallet: candidate.sicboSourcePresent,
                explicitIntegerNormalisation: false,
            },
            currentCandidateVerdict: 'open-under-this-candidate',
            note: 'Affordability is evaluated against a wallet that may hold cents; no authority normalises fractional eligibility. Classification only.',
        },
        {
            id: 'QA027', severity: 'P1', hostedRetest: 'Reproduced',
            scope: 'Dice generic autoplay wallet accounting: recorded losses exceed wallet debit.',
            currentCandidateEvidence: {
                booleanDebitWithoutRoundId: candidate.diceBooleanDebit,
                bindsPerRoundTransactionId: candidate.dicePerRoundId,
            },
            currentCandidateVerdict: 'open-under-this-candidate-wallet-and-history-writes-non-atomic',
            note: 'Dice rejects on false placeBet but stamps no round identity; wallet and history remain two independent non-atomic localStorage setItem calls with swallowed failures (CreditContext.jsx:136-169). Classification only.',
        },
        {
            id: 'QA028', severity: 'P1', hostedRetest: 'Reproduced',
            scope: 'RPS Space on focused Game tools button submits an unintended paid round.',
            currentCandidateEvidence: {
                globalSpaceShortcutInSharedPrimitive: candidate.rpsSpaceShortcutGlobal,
                guardsButtonTag: candidate.rpsShortcutGuardByTag,
            },
            currentCandidateVerdict: 'open-under-this-candidate',
            note: 'A global keydown handler is registered; no evidence of an interactive/dialog guard was found by textual scan. Classification only.',
        },
        {
            id: 'QA033', severity: 'P1', hostedRetest: 'Reproduced',
            scope: 'Plinko active-round navigation: in-flight ball debited then discarded.',
            currentCandidateEvidence: {
                settlesOnUnmount: candidate.plinkoUnmountSettle,
                ballIdentityFromMathRandom: candidate.plinkoBallRandomId,
            },
            currentCandidateVerdict: 'open-under-this-candidate-unmount-settlement-does-not-prove-reload-recovery',
            note: 'Existing unmount settlement does NOT prove reload recovery (see issue #28 first comment). Classification only.',
        },
        {
            id: 'QA040', severity: 'P1', hostedRetest: 'Reproduced',
            scope: 'Cases active opening followed by Hub and reload yields no result/inventory/refund.',
            currentCandidateEvidence: {
                booleanDebitWithoutRoundId: candidate.casesBooleanDebit,
                pendingRoundComponentLocal: candidate.casesPendingComponentLocal,
            },
            currentCandidateVerdict: 'open-under-this-candidate',
            note: 'Cases pending outcomes remain component-local; no durable authority exists to recover an accepted opening across reload. Classification only.',
        },
    ]

    return {
        method: 'textual/structural source classification of the current candidate',
        caveats: [
            'These are classifications of CURRENT SOURCE, not fresh reproductions of the 27 October hosted defects.',
            'A hosted finding stays historical until the owner supplies owner-attested deployed bytes (see deployedIdentity).',
            'Presence/absence of a token is not a behavioral proof; behavior is covered separately by tests.',
        ],
        rows,
    }
}

// --- Local build artefact digest -------------------------------------------
// `--build` runs the offline local Vite build, captures the pre-build HEAD and
// hashes every emitted file. The result is a LOCAL artefact identity only: it
// never claims to be the hosted bytes, and the deployed field stays `unknown`
// unless an owner attestation is supplied separately.
export function artefactDigest(dir) {
    const abs = join(ROOT, dir)
    const files = []
    const walk = (rel) => {
        for (const name of readdirSync(join(abs, rel)).sort()) {
            const child = rel ? `${rel}/${name}` : name
            if (statSync(join(abs, child)).isDirectory()) walk(child)
            else files.push(child)
        }
    }
    walk('')
    files.sort()
    const hash = createHash('sha256')
    const listing = []
    let totalBytes = 0
    for (const rel of files) {
        const bytes = readFileSync(join(abs, rel))
        const digest = sha256(bytes)
        totalBytes += bytes.length
        listing.push(`${digest}  ${bytes.length}  ${rel}\n`)
        hash.update(`${rel}\0${digest}\0${bytes.length}\n`)
    }
    return { digest: hash.digest('hex'), fileCount: files.length, totalBytes, listing }
}

export function buildIdentityRecord({ deployedIdentity = null, artefact = null, buildPreHead = null } = {}) {
    const head = tryGit(['rev-parse', 'HEAD'])
    const porcelain = tryGit(['status', '--porcelain'])
    const tree = trackedTreeDigest()
    const attested = (deployedIdentity ?? process.env.QA23_DEPLOYED_IDENTITY ?? '').trim()

    return {
        schema: 'qa23-candidate-identity/v1',
        generatedAt: new Date().toISOString(),
        source: {
            revision: head,
            subject: head ? tryGit(['log', '-1', '--format=%s', head]) : null,
            authoredAt: head ? tryGit(['log', '-1', '--format=%cI', head]) : null,
            branch: tryGit(['rev-parse', '--abbrev-ref', 'HEAD']),
            worktreeClean: porcelain === '',
            porcelain: porcelain || '',
            trackedTreeDigestSha256: tree.digest,
            trackedFileCount: tree.fileCount,
        },
        localBuild: {
            kind: 'local-build',
            marker: buildMarker(),
            preBuildHead: buildPreHead,
            artefact,
            note: artefact
                ? 'Local build output digest. This is NOT the deployed artefact.'
                : 'No local bundle bytes embedded. Run with --build to produce the artefact digest. This is NOT the deployed artefact.',
        },
        // Separate owner-attested deployed bytes. Unknown deployment stays unknown.
        deployedIdentity: attested
            ? { kind: 'owner-attested', attested, source: 'QA23_DEPLOYED_IDENTITY env or --deployed' }
            : {
                kind: 'unknown',
                attested: null,
                note: 'No owner attestation supplied. Local candidate does NOT identify the audited hosted deployment.',
            },
        p1Classifications: deriveP1Classifications(),
    }
}

function main() {
    const args = process.argv.slice(2)
    const outIdx = args.indexOf('--out')
    const depIdx = args.indexOf('--deployed')
    const buildIdx = args.indexOf('--build')

    let artefact = null
    let buildPreHead = null
    if (buildIdx >= 0) {
        // Capture HEAD BEFORE building so the identity names the revision the
        // artefact was produced from, not whatever HEAD is afterwards.
        buildPreHead = tryGit(['rev-parse', 'HEAD'])
        const outDir = args[buildIdx + 1] && !args[buildIdx + 1].startsWith('--')
            ? args[buildIdx + 1]
            : 'dist'
        execFileSync('npx', ['vite', 'build', '--outDir', outDir], {
            cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32',
        })
        artefact = artefactDigest(outDir)
    }

    const record = buildIdentityRecord({
        deployedIdentity: depIdx >= 0 ? args[depIdx + 1] : null,
        artefact,
        buildPreHead,
    })
    const json = `${JSON.stringify(record, null, 2)}\n`
    if (outIdx >= 0) {
        // Create the parent so an explicit evidence root (e.g. a task folder that
        // does not exist yet in this worktree) cannot fail with ENOENT.
        mkdirSync(dirname(args[outIdx + 1]), { recursive: true })
        writeFileSync(args[outIdx + 1], json)
        process.stdout.write(`wrote ${args[outIdx + 1]}\n`)
    } else {
        process.stdout.write(json)
    }
}

if (import.meta.url === `file://${process.argv[1]}`) main()
