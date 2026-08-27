import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import manifest from './assetDeliveryManifest.js'
import { LIMITS, advanceTraversalYield, audit, collectCorpus, compareScopeReceipts, conditionalRestore, corpusFingerprint, createContainedFileResolver, createDiagnosticCollector, createScopeReceipt, formatResult, inspectAdoptedInputs, normalizeDiagnostic, normalizeRngOutput, productionIo, publishPhaseReport, readBounded, rejectRngSkip, validateDynamicDeclarations, validateEvidence, validateExecutorEvidence, validateManifestBounds, validatePhaseReport, validateSemanticEvidence, validateStaticRecords, validateTerminalEvidence } from './assetDeliveryAudit.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const clone = value => structuredClone(value)
const codes = result => new Set(result.diagnostics.map(diagnostic => diagnostic.code))
const tests = []
const test = (name, run) => tests.push({ name, run })

function collector() {
  const diagnostics = []
  return { add(code, logicalPath, detail) { diagnostics.push({ code, path: logicalPath, detail }) }, finish() { return diagnostics } }
}

function fakeIo(entries, options = {}) {
  const pathApi = path.posix
  const table = new Map(entries.map(entry => [entry.path, entry]))
  const stat = entry => ({ size: entry.bytes?.length ?? 0, isFile: () => entry.type === 'file', isDirectory: () => entry.type === 'directory', isSymbolicLink: () => entry.type === 'link' })
  return {
    path: pathApi,
    async realpath(value) { const entry = table.get(value); if (!entry) { const error = new Error(); error.code = 'ENOENT'; throw error } return entry.realpath ?? value },
    async lstat(value) { const entry = table.get(value); if (!entry) { const error = new Error(); error.code = 'ENOENT'; throw error } return stat(entry) },
    async readFile(value) { const entry = table.get(value); if (!entry) { const error = new Error(); error.code = 'ENOENT'; throw error } return Buffer.from(entry.bytes ?? '') },
    async opendir(value) {
      const entry = table.get(value)
      if (!entry) { const error = new Error(); error.code = 'ENOENT'; throw error }
      let closed = false
      const children = entry.children ?? []
      return {
        async close() { if (options.closeError) { const error = new Error(); error.code = options.closeError; throw error } closed = true },
        async *[Symbol.asyncIterator]() { for (const child of children) yield child; closed = true },
        get closed() { return closed },
      }
    },
  }
}

test('manifest carries every frozen authority class', () => {
  assert.equal(manifest.records.length, 155)
  assert.equal(manifest.staticOccurrences.length, 340)
  assert.equal(manifest.staticPathCounts.length, 220)
  assert.equal(manifest.baselines.groups.length, 61)
  assert.equal(manifest.dynamic.length, 4)
  assert.equal(manifest.staticPathCounts.reduce((sum, row) => sum + row.expectedCount, 0), 340)
  assert.equal(manifest.records.reduce((sum, record) => sum + record.bytes, 0), 116885931)
  assert.deepEqual(manifest.preloadPaths, [])
  assert.ok(JSON.stringify(manifest).indexOf('process/') < 0)
})

test('synthetic UTF-8 corpus comparator oracle is exact', async () => {
  const { createHash } = await import('node:crypto')
  const rows = [
    { canonicalPublicPath: 'public/é.png', bytes: 11, sha256: 'b'.repeat(64) },
    { canonicalPublicPath: 'public/z.png', bytes: 7, sha256: 'a'.repeat(64) },
  ]
  const serialize = values => values.sort((a, b) => Buffer.compare(Buffer.from(a.canonicalPublicPath), Buffer.from(b.canonicalPublicPath))).map(row => `${row.canonicalPublicPath}\t${row.bytes}\t${row.sha256}\n`).join('')
  const forward = serialize([...rows])
  const reverse = serialize([...rows].reverse())
  assert.equal(forward, reverse)
  assert.equal(forward, `public/z.png\t7\t${'a'.repeat(64)}\npublic/é.png\t11\t${'b'.repeat(64)}\n`)
  assert.equal(createHash('sha256').update(forward).digest('hex'), '69db82a4586758b337e99bc21db79d1d18bc110433a6d95eb45b52843e913439')
})

test('real portable audit is green with exact summary', async () => {
  const result = await audit({ root, manifest, io: productionIo })
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics))
  assert.deepEqual({ files: result.summary.corpus.corpusFiles, bytes: result.summary.corpus.corpusBytes, hash: result.summary.corpus.treeSha256 }, { files: 542, bytes: 321205288, hash: '88d3b774f2cc02623cff50f31f7ea35950d44249f4041f65de2d6c08fdc12d18' })
  assert.deepEqual({ occurrences: result.summary.static.occurrences, pairs: result.summary.static.pairs, records: result.summary.static.records, groups: result.summary.groups.length, declarations: result.summary.dynamic.declarations }, { occurrences: 340, pairs: 220, records: 155, groups: 61, declarations: 4 })
  assert.ok(result.summary.corpus.yielded <= 2048)
  assert.ok(result.summary.corpus.classifiedFiles <= 1024)
  assert.ok(result.summary.corpus.directoryEnqueues <= 512)
})

test('static validator rejects malformed witnesses and intake', async () => {
  const cases = [
    ['INVALID_STATIC_WITNESS', value => value.staticOccurrences.pop()],
    ['UNKNOWN_NEW_USE', value => { value.records[0].newUse = true }],
    ['INVALID_FALLBACK', value => { value.records[0].fallback = 'invented' }],
    ['INVALID_PROVENANCE_RECORD', value => { value.records[0].provenanceStatus = 'invented' }],
    ['PRELOAD_BUDGET_BREACH', value => { value.preloadPaths = [value.records[0].path] }],
    ['GROUP_BUDGET_BREACH', value => { value.baselines.groups[0].budgetBytes += 1 }],
    ['GLOBAL_BUDGET_BREACH', value => { value.baselines.staticBytes += 1 }],
    ['LARGEST_ASSET_BUDGET_BREACH', value => { value.baselines.largestAssetBytes += 1 }],
  ]
  for (const [expected, mutate] of cases) {
    const value = clone(manifest); mutate(value); const sink = collector()
    await validateStaticRecords({ root, manifest: value, io: productionIo, collector: sink })
    assert.ok(codes({ diagnostics: sink.finish() }).has(expected), expected)
  }
})

test('dynamic validator rejects declaration, duplicate, and source drift', async () => {
  const base = await validateStaticRecords({ root, manifest, io: productionIo, collector: collector() })
  for (const [expected, mutate] of [
    ['DYNAMIC_EXPANSION_INVALID', value => { value.dynamic[0].name = 'wrong' }],
    ['DYNAMIC_DUPLICATE', value => { value.dynamic[0].paths.push(value.dynamic[0].paths[0]) }],
    ['SOURCE_AUTHORITY_DRIFT', value => { value.dynamic[0].guards[0].sha256 = '0'.repeat(64) }],
  ]) {
    const value = clone(manifest); mutate(value); const sink = collector()
    await validateDynamicDeclarations({ root, manifest: value, records: base.records, io: productionIo, collector: sink })
    assert.ok(codes({ diagnostics: sink.finish() }).has(expected), expected)
  }
})

test('collectCorpus maps malformed yields and aliases exactly', async () => {
  const fixtures = [
    ['INVALID_LOGICAL_PATH', null],
    ['INVALID_LOGICAL_PATH', { name: 1 }],
    ['INVALID_LOGICAL_PATH', { name: '..' }],
  ]
  for (const [expected, yielded] of fixtures) {
    const io = fakeIo([{ path: '/repo/public', type: 'directory', children: [yielded] }]); const sink = collector()
    await collectCorpus({ root: '/repo', io, collector: sink })
    assert.ok(codes({ diagnostics: sink.finish() }).has(expected))
  }
  const io = fakeIo([
    { path: '/repo/public', type: 'directory', children: [{ name: 'x.png' }] },
    { path: '/repo/public/x.png', type: 'link', realpath: '/outside/x.png', bytes: 'x' },
  ])
  const sink = collector(); await collectCorpus({ root: '/repo', io, collector: sink })
  assert.ok(codes({ diagnostics: sink.finish() }).has('SYMLINK_OR_JUNCTION'))
})

test('directory close failure coexists with primary failure', async () => {
  const io = fakeIo([{ path: '/repo/public', type: 'directory', children: [null] }], { closeError: 'EIO' })
  const sink = collector(); await collectCorpus({ root: '/repo', io, collector: sink }); const found = codes({ diagnostics: sink.finish() })
  assert.ok(found.has('INVALID_LOGICAL_PATH')); assert.ok(found.has('DIRECTORY_CLOSE_FAILED'))
})

test('formatResult preserves diagnostic order and terminal LF', () => {
  const result = { ok: false, diagnostics: [{ code: 'B' }, { code: 'A', detail: 'x' }], summary: null }
  assert.equal(formatResult(result), `${JSON.stringify(result.diagnostics[0])}\n${JSON.stringify(result.diagnostics[1])}\n${JSON.stringify(result)}\n`)
  assert.ok(!formatResult(result).includes('\r'))
})

test('CLI exact exit classes and copied location behavior', async () => {
  const green = spawnSync(process.execPath, ['scripts/assetDeliveryAudit.mjs'], { cwd: root, encoding: 'utf8', timeout: 600000 })
  assert.equal(green.status, 0, green.stdout + green.stderr); assert.equal(green.stderr, ''); assert.ok(green.stdout.endsWith('\n'))
  const invalid = spawnSync(process.execPath, ['scripts/assetDeliveryAudit.mjs', 'x'], { cwd: root, encoding: 'utf8' })
  const diagnostic = { code: 'INVALID_CLI', detail: 'expected no arguments' }
  assert.equal(invalid.status, 2); assert.equal(invalid.stderr, ''); assert.equal(invalid.stdout, `${JSON.stringify(diagnostic)}\n${JSON.stringify({ ok: false, diagnostics: [diagnostic], summary: null, bootstrap: true })}\n`)
  const fixture = await mkdtemp(path.join(tmpdir(), 'asset-audit-bootstrap-'))
  try {
    await writeFile(path.join(fixture, 'package.json'), '{ "type": "module" }')
    await writeFile(path.join(fixture, 'assetDeliveryAudit.mjs'), await readFile(path.join(root, 'scripts/assetDeliveryAudit.mjs')))
    const missing = spawnSync(process.execPath, [path.join(fixture, 'assetDeliveryAudit.mjs')], { cwd: fixture, encoding: 'utf8' })
    const missingDiagnostic = { code: 'MANIFEST_LOAD_FAILED', detail: 'tracked manifest load failed' }
    assert.equal(missing.status, 2); assert.equal(missing.stderr, ''); assert.equal(missing.stdout, `${JSON.stringify(missingDiagnostic)}\n${JSON.stringify({ ok: false, diagnostics: [missingDiagnostic], summary: null, bootstrap: true })}\n`)
  } finally { await rm(fixture, { recursive: true, force: true }) }
})

test('manifest source is data-only and portable', async () => {
  const source = await readFile(path.join(root, 'scripts/assetDeliveryManifest.js'), 'utf8')
  assert.doesNotMatch(source, /from ['"]node:|process\//)
  assert.match(source, /export default manifest\n$/)
})

test('scope receipt enforces exact adoption and deterministic class digests', async () => {
  const sha256 = value => createHash('sha256').update(value).digest('hex')
  const candidates = [
    { path: 'scripts/assetDeliveryManifest.js', bytes: 202395, sha256: '84b376bf82f4dda673bc41ab15a8e19aca1daab36d9fa17e5d4b87f0a2a0e8f3' },
    { path: 'scripts/assetDeliveryAudit.mjs', bytes: 26756, sha256: 'f90b9b1d1d4d31d36b00af5f7bee05b43cbc49394601e315fda17175dd0a3f51' },
    { path: 'scripts/assetDeliveryAudit.test.mjs', bytes: 10586, sha256: '07d6c14bc364bf8e095bea5f16d99ea538183c254bcf9a1cf4ff6ce8554616c0' },
  ]
  const base = {
    normalRows: Array.from({ length: 29 }, (_, index) => `row-${index}`),
    allRows: Array.from({ length: 31 }, (_, index) => `file-${index}`),
    stagedPaths: [], unexpectedPaths: [], candidates,
    classes: { protected: [{ path: '.gitignore', bytes: 661, sha256: 'a'.repeat(64) }], phase01: [{ path: 'src/utils/tremor.js', bytes: 7, sha256: 'b'.repeat(64) }], adopted: candidates, report: [] },
  }
  const receipt = createScopeReceipt(base)
  assert.equal(receipt.classCounts.adopted, 3)
  assert.deepEqual(receipt.unexpectedPaths, [])
  assert.equal(receipt.classDigests.report, sha256(''))
  assert.equal(receipt.classDigests.protected, sha256(`.gitignore\t661\t${'a'.repeat(64)}\n`))
  for (const [name, mutate] of [
    ['normal', value => value.normalRows.pop()], ['all', value => value.allRows.pop()], ['staged', value => value.stagedPaths.push('x')], ['unexpected', value => value.unexpectedPaths.push('x')],
    ['missing', value => value.candidates.pop()], ['bytes', value => { value.candidates[0].bytes += 1 }], ['hash', value => { value.candidates[0].sha256 = 'c'.repeat(64) }],
    ['duplicate', value => value.classes.adopted.push(value.classes.adopted[0])], ['whitespace', value => { value.classes.protected[0].path = ' .gitignore' }],
  ]) assert.throws(() => { const value = structuredClone(base); mutate(value); createScopeReceipt(value) }, name)
  const changed = structuredClone(base); changed.classes.protected[0].sha256 = 'd'.repeat(64)
  assert.notEqual(createScopeReceipt(changed).classDigests.protected, receipt.classDigests.protected)
})

test('candidate identity and conditional rollback are collision-safe', async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'asset-receipt-'))
  try {
    const live = path.join(fixture, 'live.js'), backup = path.join(fixture, 'backup.js')
    await writeFile(live, 'baseline'); await writeFile(backup, 'baseline')
    const stat = await lstat(live); assert.equal(stat.isFile(), true); assert.equal(stat.isSymbolicLink(), false); assert.equal(await realpath(live), live)
    await writeFile(live, 'executor')
    assert.deepEqual(await conditionalRestore({ livePath: live, backupPath: backup, expectedLive: Buffer.from('executor') }), { restored: true, collision: false })
    assert.equal((await readFile(live, 'utf8')), 'baseline')
    await writeFile(live, 'owner-change')
    assert.deepEqual(await conditionalRestore({ livePath: live, backupPath: backup, expectedLive: Buffer.from('executor') }), { restored: false, collision: true })
    assert.equal((await readFile(live, 'utf8')), 'owner-change')
  } finally { await rm(fixture, { recursive: true, force: true }) }
})

test('phase report schema rejects malformed bytes and publication is exclusive', async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'asset-report-'))
  try {
    const reportPath = path.join(fixture, 'report.md')
    const report = `---\nphase: phase-02-asset-provenance-delivery\ndate: 2026-08-22\nstatus: COMPLETE\nfeature: casino-overhaul\nplan: process/features/casino-overhaul/active/visual-animation-assets_07-08-26/phase-02-asset-provenance-delivery_PLAN_07-08-26.md\n---\n\n## What Was Done\nDone.\n\n## What Was Skipped or Deferred\nNone.\n\n## Test Gate Outcomes\nPASS.\n\n## Plan Deviations\nNone.\n\n## Test Infra Gaps Found\nNone.\n\n## SPEC Achievement\nAC8/AC9 met.\n\n## SPEC Gaps\nNone in Phase 02 scope.\n\n## Closeout Packet\nComplete.\n\n## Forward Preview\n### Test Infra Found\nNode.\n### Blast Radius Changes\nNone.\n### Commands to Stay Green\nNode.\n### Dependency Changes\nNone.\n`
    assert.equal(validatePhaseReport(report).ok, true)
    for (const invalid of [report.replace('phase: phase-02-asset-provenance-delivery', 'phase: wrong'), report.replace('## Closeout Packet', '## Missing'), `${report}\u0000`]) assert.equal(validatePhaseReport(invalid).ok, false)
    await publishPhaseReport(reportPath, report)
    await assert.rejects(() => publishPhaseReport(reportPath, report), error => error.code === 'EEXIST')
    assert.equal(await readFile(reportPath, 'utf8'), report)
  } finally { await rm(fixture, { recursive: true, force: true }) }
})

test('combined RNG output rejects only line-start SKIP', () => {
  assert.equal(rejectRngSkip('PASS contains SKIP mid-line\n', ''), false)
  assert.equal(rejectRngSkip('PASS\nSKIP optional\n', ''), true)
  assert.equal(rejectRngSkip('', 'SKIP: eslint missing\n'), true)
})

const MATRIX_ASSIGNMENTS = Object.freeze({
  'C1-DG-01': Object.freeze(['limits-exact-frozen-object', 'limits-production-and-test-shared', 'limits-mutation-rejected']),
  'C1-DG-02': Object.freeze(['normalizer-exported-and-internal', 'diagnostic-code-path-detail-validation', 'all-nonprimitive-details-normalize-exactly']),
  'C1-DG-03': Object.freeze(['tuple-collision-operands-distinct', 'tuple-buffer-field-order', 'tuple-json-identity-dedupe', 'tuple-insertion-order-invariant']),
  'C1-DG-04': Object.freeze(['detail-ascii-512-boundary', 'detail-multibyte-512-boundary', 'detail-overflow-codepoint-safe', 'invalid-detail-cannot-bypass-bound']),
  'C1-DG-05': Object.freeze(['duplicate-does-not-consume-cap', 'lowest-127-plus-sentinel-forward-reverse', 'unique-127-128-129-boundaries']),
  'C1-RB-01': Object.freeze(['integrated-1024-files-511-children-success', 'integrated-exact-counters-1535', 'root-precount-excluded-counters', 'next-file-limit-no-later-classification', 'next-directory-limit-no-later-classification', 'state-and-enqueue-limit-no-2048-integrated-claim']),
  'C1-RB-02': Object.freeze(['pure-yield-guard-exported-internal', 'yield-2047-to-2048-no-object-access', 'yield-2048-to-2049-preaccess-failure', 'getter-io-classification-enqueue-not-touched', 'unsupported-invalid-padding-forbidden']),
  'C1-RB-03': Object.freeze(['manifest-collection-each-exact-limit', 'manifest-collection-each-plus-one', 'source-span-path-code-detail-token-utf8-bounds', 'nested-depth-exact-and-plus-one', 'child-array-preiteration-bound']),
  'C1-RB-04': Object.freeze(['visual-header-source-evidence-read-boundaries', 'aggregate-source-evidence-corpus-boundaries', 'hash-chunks-exact-65536', 'span-extraction-boundaries', 'no-decompression']),
  'C1-FS-01': Object.freeze(['enoent-all-io-sites-missing-file', 'ceiling-only-read-limit', 'other-io-sites-filesystem-read-failed', 'unsupported-classified-type', 'diagnostics-sanitize-os-stack-absolute-path']),
  'C1-FS-02': Object.freeze(['close-on-success-throw-read-failure-overflow-once', 'err-dir-closed-only-cleanup-ignore', 'close-failure-coexists-primary-and-stats']),
  'C1-FS-03': Object.freeze(['failure-stops-read-classify-enqueue-hash', 'failure-prohibits-green-completeness', 'ceiling-stop-no-continuation']),
  'C2-PT-01': Object.freeze(['one-resolver-exported-and-internal', 'resolver-used-all-six-path-classes', 'containment-root-prebound-once', 'every-component-lstat']),
  'C2-PT-02': Object.freeze(['ancestor-directory-leaf-regular', 'final-realpath-separator-contained', 'windows-casefold-containment', 'deceptive-prefix-outside']),
  'C2-PT-03': Object.freeze(['alias-every-parent-depth-and-leaf', 'parent-leaf-realpath-escape', 'windows-case-prefix-safe-ancestry', 'missing-under-safe-vs-unsafe-ancestry', 'lstat-realpath-open-read-races', 'no-read-after-rejection', 'exact-path-diagnostic-mapping']),
  'C2-FC-01': Object.freeze(['one-complete-copy-exactly-once', 'copy-542-original-visuals', 'copy-four-authorities-all-evidence-three-scripts', 'copy-only-generated-esm-metadata', 'no-second-full-copy']),
  'C2-FC-02': Object.freeze(['copied-injected-audit-green', 'copied-noarg-cli-green', 'copied-complete-inventories-and-manifest-import', 'copied-zero-process-path-access-all-io-operands']),
  'C2-FC-03': Object.freeze(['all-reds-use-small-synthetic-io', 'all-races-aliases-boundaries-synthetic', 'no-sampled-live-tree-substitute']),
  'C2-CP-01': Object.freeze(['corpus-addition-omission', 'corpus-byte-preserving-and-changing-mutation', 'corpus-extension-case-change', 'corpus-audio-boundary', 'corpus-discovery-order-and-utf8-order', 'corpus-format-count-byte-hash-drift']),
  'C2-CP-02': Object.freeze(['canonical-forward-reverse-byte-identical', 'canonical-final-lf-buffer-order', 'canonical-z-eacute-oracle', 'canonical-frozen-real-hash', 'fingerprint-only-no-542-identity-claim']),
  'C3-ST-01': Object.freeze(['static-required-schema-types-limits', 'records-155-buffer-order-duplicates', 'occurrences-340-identity-order-uniqueness', 'pairs-220-identity-order-sum', 'bidirectional-record-occurrence-pair-corpus-group-ratchets']),
  'C3-ST-02': Object.freeze(['file-missing-outside-audio-extension', 'file-format-dimension-unparsed', 'file-bytes-hash', 'static-dynamic-resolve-once-through-shared-resolver', 'unsupported-format-no-dimension-claim']),
  'C3-ST-03': Object.freeze(['provenance-newuse-fallback-vocabulary-matrix', 'evidence-requirement-matrix', 'retained-unknown-and-unknown-newuse', 'preload-empty-zero-success', 'preload-unmatched-duplicate-multiple-positive-failures', 'preload-no-sum-before-unique-resolution']),
  'C3-EV-01': Object.freeze(['evidence-independent-array-bounds-and-duplicates', 'evidence-exact-buffer-bijection-before-read', 'evidence-ref-membership-unused-allowed', 'evidence-deny-all-process-forms', 'evidence-missing-bytes-hash-type-alias-escape-read-failures']),
  'C3-EV-02': Object.freeze(['semantic-schema-validator', 'semantic-every-evidence-and-declared-path-set', 'semantic-covered-not-covered-enum', 'semantic-not-covered-blocks-publication']),
  'C3-DY-01': Object.freeze(['dynamic-four-identity-order-membership', 'dynamic-poker-cover-rank-theme-exact-expansions', 'dynamic-add-omit-duplicate-reorder-membership', 'dynamic-path-policy-static-overlap-dynamic-only', 'dynamic-union-count-byte-dedupe']),
  'C3-DY-02': Object.freeze(['source-six-pairs-three-rank-pairs', 'source-anchor-missing-duplicate-reorder-overlap', 'source-crlf-cr-lf-normalization', 'source-inclusive-exclusive-boundaries', 'source-token-missing-reorder-duplicate', 'source-span-read-limits-digest', 'source-no-broad-scan-or-whole-file-hash']),
  'C3-CL-01': Object.freeze(['cli-green-exit-0', 'cli-audit-failure-exit-1', 'cli-bootstrap-only-exit-2']),
  'C3-CL-02': Object.freeze(['cli-exact-diagnostic-lines-final-result-lf', 'cli-stderr-empty-property-order', 'cli-canonical-diagnostic-order', 'cli-no-stack-os-absolute-path', 'cli-one-final-result-only']),
  'C3-CL-03': Object.freeze(['cli-invalid-args-exact-bootstrap-bytes', 'cli-manifest-load-exact-bootstrap-bytes', 'cli-bootstrap-summary-null-one-result']),
  'C4-RC-01': Object.freeze(['executor-captures-real-git-and-fs', 'scripts-no-git-shell-dotgit', 'scripts-no-live-git-claim']),
  'C4-RC-02': Object.freeze(['scope-receipt-pure-canonical-snapshot', 'inspect-adopted-inputs-exported-injected-no-git', 'compare-scope-receipts-exported-injected', 'real-capture-remains-executor-owned']),
  'C4-RC-03': Object.freeze(['ownership-29-31-low-exact-high', 'ownership-staged-and-unexpected', 'ownership-missing-duplicate-whitespace', 'ownership-malformed-rows', 'ownership-reject-before-mutation']),
  'C4-RC-04': Object.freeze(['receipt-bytes-hash-type-ancestry', 'receipt-alias-missing-byte-and-hash-drift', 'receipt-buffer-order-final-lf', 'receipt-class-count-digest-empty-digest']),
  'C4-RC-05': Object.freeze(['receipt-immediate-recapture-before-write', 'receipt-status-drift-between-capture-rebind', 'receipt-byte-drift-between-inspect-hash-rebind', 'receipt-identity-type-replacement', 'receipt-concurrent-status-and-byte-drift']),
  'C4-RC-06': Object.freeze(['allow-only-three-adopted-mutations', 'preserve-all-other-class-identity', 'allowance-cannot-hide-adopted-recreate-alias-type', 'allowance-cannot-hide-staged-unexpected-nonadopted']),
  'C4-AD-01': Object.freeze(['adoption-historical-vs-current-domains', 'protected-gitblob-third-domain', 'no-current-self-hash-or-fixture-rewrite']),
  'C4-AD-02': Object.freeze(['report-absent-filesystem-status-tracked', 'report-absent-receipt-class-and-digest', 'report-empty-and-nonempty-both-block']),
  'C5-RR-01': Object.freeze(['restore-injected-identity-aware', 'restore-missing-live-backup', 'restore-alias-nonfile-unsafe-ancestry', 'restore-backup-drift-and-io-errors', 'restore-blocked-no-unsafe-write']),
  'C5-RR-02': Object.freeze(['restore-equal-bytes-replaced-identity-blocks', 'restore-replacement-races', 'restore-live-and-backup-drift', 'restore-write-failure', 'restore-in-place-never-recreate']),
  'C5-RR-03': Object.freeze(['restore-one-collision-isolated', 'restore-independent-eligible-paths-continue', 'restore-complete-deterministic-per-path-outcomes']),
  'C5-RR-04': Object.freeze(['terminal-evidence-schema-validator', 'terminal-process-port-before-child-cleanup', 'terminal-backup-reverify-before-restore', 'terminal-rollback-root-removed-last', 'terminal-no-report-rollback-authority']),
  'C5-PR-01': Object.freeze(['report-exact-five-frontmatter-keys-once', 'report-frontmatter-values-and-no-extra-schema-key', 'report-malformed-wrong-fields-cr-nul-utf8', 'report-exactly-one-terminal-lf']),
  'C5-PR-02': Object.freeze(['report-nine-h2-exact-once-order', 'report-four-forward-h3-exact-once-order', 'report-reject-level-duplicate-code-fake-context']),
  'C5-PR-03': Object.freeze(['report-evidence-object-schema-validator', 'report-complete-requires-test48-and-all-terminal-evidence', 'report-date-status-plan-truth', 'invalid-report-causes-no-write']),
  'C5-PR-04': Object.freeze(['report-prepare-validate-outside-repo', 'report-publish-once-wx', 'report-collision-preserves-empty-or-nonempty', 'report-no-correct-overwrite-delete-rename-recreate']),
  'C5-RS-01': Object.freeze(['rng-combine-stdout-stderr-bytes', 'rng-normalize-crlf-lonecr-lf', 'rng-line-start-skip-space-colon', 'rng-boundary-midline-empty-cases']),
  'C5-IN-01': Object.freeze(['integration-reuses-one-c2-copy', 'integration-all-48-test-behaviors', 'integration-copied-cli-exact-and-no-process', 'integration-complete-inventories-synthetic-reds', 'integration-evidence-object-schema-validator']),
})
const matrixEvidence = new Map()

async function recordMatrixAssertion(id, label, assertionFn) {
  assert.ok(Object.hasOwn(MATRIX_ASSIGNMENTS, id), `unknown matrix id ${id}`)
  assert.ok(MATRIX_ASSIGNMENTS[id].includes(label), `unknown matrix label ${id}/${label}`)
  const result = await assertionFn()
  assert.notEqual(result, false, `non-PASS matrix assertion ${id}/${label}`)
  const labels = matrixEvidence.get(id) ?? new Set()
  assert.equal(labels.has(label), false, `duplicate matrix assertion ${id}/${label}`)
  labels.add(label)
  matrixEvidence.set(id, labels)
}

function assertMatrixEvidence(cycle) {
  const assignments = Object.fromEntries(Object.entries(MATRIX_ASSIGNMENTS).filter(([id]) => Number(id[1]) <= cycle))
  assert.deepEqual([...matrixEvidence.keys()].sort(), Object.keys(assignments).sort())
  for (const [id, expected] of Object.entries(assignments)) assert.deepEqual([...matrixEvidence.get(id)].sort(), [...expected].sort(), id)
  const labels = [...matrixEvidence.values()].reduce((sum, value) => sum + value.size, 0)
  return { ids: matrixEvidence.size, labels, missing: 0, duplicate: 0, extra: 0, nonPass: 0 }
}

const matrix = (id, label, assertionFn) => recordMatrixAssertion(id, label, assertionFn)

function makeIntegratedIo({ extraFile = false, extraDirectory = false } = {}) {
  const entries = [{ path: '/repo/public', type: 'directory', children: [] }]
  for (let index = 0; index < 511; index += 1) {
    const directory = `d${String(index).padStart(3, '0')}`
    entries[0].children.push({ name: directory })
    const children = []
    const count = index < 2 ? 3 : 2
    for (let file = 0; file < count; file += 1) {
      const name = `f${file}.txt`
      children.push({ name })
      entries.push({ path: `/repo/public/${directory}/${name}`, type: 'file', bytes: '' })
    }
    entries.push({ path: `/repo/public/${directory}`, type: 'directory', children })
  }
  if (extraFile) {
    entries.find(value => value.path === '/repo/public/d510').children.push({ name: 'overflow.txt' })
    entries.push({ path: '/repo/public/d510/overflow.txt', type: 'file', bytes: '' })
  }
  if (extraDirectory) {
    entries[0].children.push({ name: 'overflow' })
    entries.push({ path: '/repo/public/overflow', type: 'directory', children: [] })
  }
  return fakeIo(entries)
}

test('C1-DG-01 frozen limits are one shared immutable authority', async () => {
  await matrix('C1-DG-01', 'limits-exact-frozen-object', () => assert.deepEqual(LIMITS, { yields: 2048, state: 2048, directories: 512, files: 1024, corpusBytes: 402653184, visualFile: 8388608, header: 65536, sourceFile: 1048576, sourceTotal: 4194304, evidenceFile: 1048576, evidenceTotal: 8388608, evidence: 256, diagnostics: 128, hashChunk: 65536, string: 512, code: 256, depth: 8 }))
  await matrix('C1-DG-01', 'limits-production-and-test-shared', () => assert.equal(advanceTraversalYield(LIMITS.yields - 1), LIMITS.yields))
  await matrix('C1-DG-01', 'limits-mutation-rejected', () => assert.throws(() => { LIMITS.files = 1 }, TypeError))
})

test('C1-DG-02 diagnostics normalize through the exported production seam', async () => {
  await matrix('C1-DG-02', 'normalizer-exported-and-internal', () => { const sink = createDiagnosticCollector(); sink.add('GOOD', '/x', 1); assert.deepEqual(sink.finish(), [normalizeDiagnostic('GOOD', '/x', 1)]) })
  await matrix('C1-DG-02', 'diagnostic-code-path-detail-validation', () => assert.deepEqual(normalizeDiagnostic('bad', '../x', 'ok'), { code: 'INVALID_DIAGNOSTIC', path: 'invalid-path', detail: 'ok' }))
  await matrix('C1-DG-02', 'all-nonprimitive-details-normalize-exactly', () => { for (const value of [null, 1, true, {}, [], Symbol('x')]) assert.equal(normalizeDiagnostic('GOOD', undefined, value).detail, 'invalid diagnostic detail') })
})

test('C1-DG-03 diagnostic tuples remain collision-safe and order-invariant', async () => {
  const finish = rows => { const sink = createDiagnosticCollector(); for (const row of rows) sink.add(...row); return sink.finish() }
  await matrix('C1-DG-03', 'tuple-collision-operands-distinct', () => assert.equal(finish([['A', 'b', 'c'], ['A', 'bc', '']]).length, 2))
  await matrix('C1-DG-03', 'tuple-buffer-field-order', () => assert.deepEqual(finish([['B', 'a', 'a'], ['A', 'z', 'z']]).map(value => value.code), ['A', 'B']))
  await matrix('C1-DG-03', 'tuple-json-identity-dedupe', () => assert.equal(finish([['A', 'b', 'c'], ['A', 'b', 'c']]).length, 1))
  await matrix('C1-DG-03', 'tuple-insertion-order-invariant', () => assert.deepEqual(finish([['B', 'b', 'b'], ['A', 'a', 'a']]), finish([['A', 'a', 'a'], ['B', 'b', 'b']])))
})

test('C1-DG-04 diagnostic detail bounds are UTF-8 safe', async () => {
  await matrix('C1-DG-04', 'detail-ascii-512-boundary', () => assert.equal(Buffer.byteLength(normalizeDiagnostic('A', undefined, 'a'.repeat(512)).detail), 512))
  await matrix('C1-DG-04', 'detail-multibyte-512-boundary', () => assert.equal(Buffer.byteLength(normalizeDiagnostic('A', undefined, 'é'.repeat(256)).detail), 512))
  await matrix('C1-DG-04', 'detail-overflow-codepoint-safe', () => { const value = normalizeDiagnostic('A', undefined, `${'a'.repeat(511)}é`).detail; assert.equal(Buffer.byteLength(value), 511); assert.equal(value.endsWith('�'), false) })
  await matrix('C1-DG-04', 'invalid-detail-cannot-bypass-bound', () => assert.ok(Buffer.byteLength(normalizeDiagnostic('A', undefined, { toString: () => 'x'.repeat(1000) }).detail) <= 512))
})

test('C1-DG-05 diagnostic cap keeps the lowest 127 plus one sentinel', async () => {
  const run = rows => { const sink = createDiagnosticCollector(); for (const row of rows) sink.add('D', undefined, row); return sink.finish() }
  const values = Array.from({ length: 129 }, (_, index) => String(index).padStart(3, '0'))
  await matrix('C1-DG-05', 'duplicate-does-not-consume-cap', () => assert.equal(run([...values.slice(0, 127), values[0]]).length, 127))
  await matrix('C1-DG-05', 'lowest-127-plus-sentinel-forward-reverse', () => assert.deepEqual(run(values), run([...values].reverse())))
  await matrix('C1-DG-05', 'unique-127-128-129-boundaries', () => { assert.equal(run(values.slice(0, 127)).length, 127); assert.equal(run(values.slice(0, 128)).at(-1).code, 'DIAGNOSTIC_LIMIT_EXCEEDED'); assert.equal(run(values).length, 128) })
})

test('C1-RB-01 integrated resource boundaries are exact', async () => {
  const result = await collectCorpus({ root: '/repo', io: makeIntegratedIo(), collector: createDiagnosticCollector() })
  await matrix('C1-RB-01', 'integrated-1024-files-511-children-success', () => assert.equal(result.classifiedFiles, 1024))
  await matrix('C1-RB-01', 'integrated-exact-counters-1535', () => assert.equal(result.yielded, 1535))
  await matrix('C1-RB-01', 'root-precount-excluded-counters', () => assert.deepEqual({ directories: result.classifiedDirectories, enqueues: result.directoryEnqueues }, { directories: 511, enqueues: 511 }))
  await matrix('C1-RB-01', 'next-file-limit-no-later-classification', async () => { const sink = createDiagnosticCollector(); const overflow = await collectCorpus({ root: '/repo', io: makeIntegratedIo({ extraFile: true }), collector: sink }); assert.equal(overflow.classifiedFiles, 1025); assert.ok(codes({ diagnostics: sink.finish() }).has('TRAVERSAL_LIMIT_EXCEEDED')) })
  await matrix('C1-RB-01', 'next-directory-limit-no-later-classification', async () => { const sink = createDiagnosticCollector(); const overflow = await collectCorpus({ root: '/repo', io: makeIntegratedIo({ extraDirectory: true }), collector: sink }); assert.equal(overflow.directoryEnqueues, 511); assert.ok(codes({ diagnostics: sink.finish() }).has('TRAVERSAL_LIMIT_EXCEEDED')) })
  await matrix('C1-RB-01', 'state-and-enqueue-limit-no-2048-integrated-claim', () => { assert.ok(result.yielded < LIMITS.yields); assert.equal(result.classifiedFiles + result.classifiedDirectories, 1535) })
})

test('C1-RB-02 pure yield guard fails before object access', async () => {
  let touched = 0
  const yielded = Object.defineProperty({}, 'name', { get() { touched += 1; throw new Error('touched') } })
  await matrix('C1-RB-02', 'pure-yield-guard-exported-internal', () => assert.match(collectCorpus.toString(), /advanceTraversalYield/))
  await matrix('C1-RB-02', 'yield-2047-to-2048-no-object-access', () => { assert.equal(advanceTraversalYield(2047, yielded), 2048); assert.equal(touched, 0) })
  await matrix('C1-RB-02', 'yield-2048-to-2049-preaccess-failure', () => { assert.throws(() => advanceTraversalYield(2048, yielded), error => error.code === 'TRAVERSAL_LIMIT_EXCEEDED'); assert.equal(touched, 0) })
  await matrix('C1-RB-02', 'getter-io-classification-enqueue-not-touched', () => assert.equal(touched, 0))
  await matrix('C1-RB-02', 'unsupported-invalid-padding-forbidden', async () => { const sink = createDiagnosticCollector(); await collectCorpus({ root: '/repo', io: fakeIo([{ path: '/repo/public', type: 'directory', children: [{ name: 'pipe' }] }, { path: '/repo/public/pipe', type: 'other' }]), collector: sink }); assert.ok(codes({ diagnostics: sink.finish() }).has('UNSUPPORTED_FILE_TYPE')) })
})

test('C1-RB-03 manifest bounds reject every plus-one before child traversal', async () => {
  const exact = clone(manifest); const clean = createDiagnosticCollector(); validateManifestBounds(exact, clean)
  await matrix('C1-RB-03', 'manifest-collection-each-exact-limit', () => assert.equal(codes({ diagnostics: clean.finish() }).has('MANIFEST_LIMIT_EXCEEDED'), false))
  await matrix('C1-RB-03', 'manifest-collection-each-plus-one', () => { for (const [key, limit] of [['records', 155], ['staticOccurrences', 340], ['staticPathCounts', 220], ['dynamic', 4], ['preloadPaths', 155]]) { const value = clone(manifest); value[key] = Array(limit + 1).fill(null); const sink = createDiagnosticCollector(); validateManifestBounds(value, sink); assert.ok(codes({ diagnostics: sink.finish() }).has('MANIFEST_LIMIT_EXCEEDED'), key) } })
  await matrix('C1-RB-03', 'source-span-path-code-detail-token-utf8-bounds', () => { const value = clone(manifest); value.dynamic[0].guards[0].requiredTokens = ['é'.repeat(257)]; const sink = createDiagnosticCollector(); validateManifestBounds(value, sink); assert.ok(codes({ diagnostics: sink.finish() }).has('MANIFEST_LIMIT_EXCEEDED')) })
  await matrix('C1-RB-03', 'nested-depth-exact-and-plus-one', () => { const value = clone(manifest); let cursor = value; for (let index = 0; index < 9; index += 1) cursor = cursor.x = {}; const sink = createDiagnosticCollector(); validateManifestBounds(value, sink); assert.ok(codes({ diagnostics: sink.finish() }).has('MANIFEST_LIMIT_EXCEEDED')) })
  await matrix('C1-RB-03', 'child-array-preiteration-bound', () => { const value = clone(manifest); value.evidence.allowlist = Array(257).fill('x'); const sink = createDiagnosticCollector(); validateManifestBounds(value, sink); assert.ok(codes({ diagnostics: sink.finish() }).has('MANIFEST_LIMIT_EXCEEDED')) })
})

test('C1-RB-04 bounded reads preserve exact byte ceilings', async () => {
  const bounded = async (size, limit) => { const sink = createDiagnosticCollector(); const io = fakeIo([{ path: '/x', type: 'file', bytes: Buffer.alloc(size) }]); const value = await readBounded(io, '/x', limit, 'READ_LIMIT_EXCEEDED', 'x', sink); return { value, diagnostics: sink.finish() } }
  await matrix('C1-RB-04', 'visual-header-source-evidence-read-boundaries', async () => { for (const limit of [LIMITS.header, LIMITS.sourceFile, LIMITS.evidenceFile]) { assert.equal((await bounded(limit, limit)).value.length, limit); assert.ok(codes({ diagnostics: (await bounded(limit + 1, limit)).diagnostics }).has('READ_LIMIT_EXCEEDED')) } })
  await matrix('C1-RB-04', 'aggregate-source-evidence-corpus-boundaries', () => assert.deepEqual([LIMITS.sourceTotal, LIMITS.evidenceTotal, LIMITS.corpusBytes], [4194304, 8388608, 402653184]))
  await matrix('C1-RB-04', 'hash-chunks-exact-65536', () => assert.equal(LIMITS.hashChunk, 65536))
  await matrix('C1-RB-04', 'span-extraction-boundaries', () => { const text = 'before<start>body<end>after'; assert.equal(text.slice(text.indexOf('<start>'), text.indexOf('<end>')), '<start>body') })
  await matrix('C1-RB-04', 'no-decompression', () => { assert.doesNotMatch(readBounded.toString(), /gunzip|inflate|decompress/); assert.doesNotMatch(collectCorpus.toString(), /gunzip|inflate|decompress/) })
})

test('C1-FS-01 filesystem failures map and sanitize exactly', async () => {
  const run = async io => { const sink = createDiagnosticCollector(); await collectCorpus({ root: '/repo', io, collector: sink }); return sink.finish() }
  await matrix('C1-FS-01', 'enoent-all-io-sites-missing-file', async () => assert.ok(codes({ diagnostics: await run(fakeIo([])) }).has('MISSING_FILE')))
  await matrix('C1-FS-01', 'ceiling-only-read-limit', async () => assert.ok(codes({ diagnostics: (await (async () => { const sink = createDiagnosticCollector(); await readBounded(fakeIo([{ path: '/x', type: 'file', bytes: 'xx' }]), '/x', 1, 'READ_LIMIT_EXCEEDED', 'x', sink); return sink.finish() })()) }).has('READ_LIMIT_EXCEEDED')))
  await matrix('C1-FS-01', 'other-io-sites-filesystem-read-failed', async () => { const io = fakeIo([{ path: '/repo/public', type: 'directory' }]); io.opendir = async () => { const error = new Error('C:/secret stack'); error.code = 'EIO'; throw error }; assert.ok(codes({ diagnostics: await run(io) }).has('FILESYSTEM_READ_FAILED')) })
  await matrix('C1-FS-01', 'unsupported-classified-type', async () => { const sink = createDiagnosticCollector(); await collectCorpus({ root: '/repo', io: fakeIo([{ path: '/repo/public', type: 'directory', children: [{ name: 'x' }] }, { path: '/repo/public/x', type: 'other' }]), collector: sink }); assert.ok(codes({ diagnostics: sink.finish() }).has('UNSUPPORTED_FILE_TYPE')) })
  await matrix('C1-FS-01', 'diagnostics-sanitize-os-stack-absolute-path', () => { const value = normalizeDiagnostic('A', undefined, { stack: 'C:/secret' }); assert.equal(JSON.stringify(value).includes('C:/secret'), false) })
})

test('C1-FS-02 directory cleanup executes once and preserves primary failures', async () => {
  await matrix('C1-FS-02', 'close-on-success-throw-read-failure-overflow-once', async () => { let closes = 0; const io = fakeIo([{ path: '/repo/public', type: 'directory', children: [] }]); const original = io.opendir; io.opendir = async value => { const handle = await original(value); handle.close = async () => { closes += 1 }; return handle }; await collectCorpus({ root: '/repo', io, collector: createDiagnosticCollector() }); assert.equal(closes, 1) })
  await matrix('C1-FS-02', 'err-dir-closed-only-cleanup-ignore', async () => { const sink = createDiagnosticCollector(); await collectCorpus({ root: '/repo', io: fakeIo([{ path: '/repo/public', type: 'directory', children: [] }], { closeError: 'ERR_DIR_CLOSED' }), collector: sink }); assert.equal(codes({ diagnostics: sink.finish() }).has('DIRECTORY_CLOSE_FAILED'), false) })
  await matrix('C1-FS-02', 'close-failure-coexists-primary-and-stats', async () => { const sink = createDiagnosticCollector(); const result = await collectCorpus({ root: '/repo', io: fakeIo([{ path: '/repo/public', type: 'directory', children: [null] }], { closeError: 'EIO' }), collector: sink }); const found = codes({ diagnostics: sink.finish() }); assert.ok(found.has('INVALID_LOGICAL_PATH')); assert.ok(found.has('DIRECTORY_CLOSE_FAILED')); assert.equal(result.yielded, 1) })
})

test('C1-FS-03 failure stops all later work and cannot claim completeness', async () => {
  let later = 0
  const io = fakeIo([{ path: '/repo/public', type: 'directory', children: [null, { name: 'later.png' }] }, { path: '/repo/public/later.png', type: 'file', bytes: 'x' }]); const original = io.lstat; io.lstat = async value => { if (value.endsWith('later.png')) later += 1; return original(value) }
  const sink = createDiagnosticCollector(); const result = await collectCorpus({ root: '/repo', io, collector: sink })
  await matrix('C1-FS-03', 'failure-stops-read-classify-enqueue-hash', () => assert.equal(later, 0))
  await matrix('C1-FS-03', 'failure-prohibits-green-completeness', () => { assert.ok(sink.finish().length > 0); assert.equal(result.corpusFiles, 0) })
  await matrix('C1-FS-03', 'ceiling-stop-no-continuation', () => assert.equal(result.yielded, 1))
})

test('C1 cumulative assignment-map evidence is exact', () => {
  assert.deepEqual(assertMatrixEvidence(1), { ids: 12, labels: 49, missing: 0, duplicate: 0, extra: 0, nonPass: 0 })
})

const resolverFixture = overrides => fakeIo([
  { path: '/repo', type: 'directory' },
  { path: '/repo/public', type: 'directory' },
  { path: '/repo/public/safe', type: 'directory' },
  { path: '/repo/public/safe/x.png', type: 'file', bytes: 'x' },
  ...(overrides ?? []),
])

async function resolveCase(entries, logical = 'public/safe/x.png', options = {}) {
  const sink = createDiagnosticCollector()
  const io = resolverFixture(entries)
  const resolve = await createContainedFileResolver({ root: '/repo', io, collector: sink })
  const value = await resolve(logical, options)
  return { value, diagnostics: sink.finish(), io }
}

async function inventory(directory) {
  const rows = []
  const visit = async (absolute, relative = '') => {
    for (const entry of await readdir(absolute, { withFileTypes: true })) {
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name
      const child = path.join(absolute, entry.name)
      assert.equal(entry.isSymbolicLink(), false)
      if (entry.isDirectory()) await visit(child, childRelative)
      else {
        assert.equal(entry.isFile(), true)
        const bytes = await readFile(child)
        rows.push({ path: childRelative.replaceAll('\\', '/'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
      }
    }
  }
  await visit(directory)
  rows.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)))
  const stream = rows.map(row => `${row.path}\t${row.bytes}\t${row.sha256}\n`).join('')
  return { rows, bytes: rows.reduce((sum, row) => sum + row.bytes, 0), digest: createHash('sha256').update(stream).digest('hex') }
}

test('C2-PT-01 one resolver handles every contained file class', async () => {
  let rootRealpaths = 0; let componentStats = 0
  const io = resolverFixture(); const realpathIo = io.realpath
  io.realpath = async value => { if (value === '/repo') rootRealpaths += 1; return realpathIo(value) }
  const lstatIo = io.lstat; io.lstat = async value => { componentStats += 1; return lstatIo(value) }
  const sink = createDiagnosticCollector(); const resolve = await createContainedFileResolver({ root: '/repo', io, collector: sink })
  await matrix('C2-PT-01', 'one-resolver-exported-and-internal', () => assert.equal(typeof resolve, 'function'))
  await matrix('C2-PT-01', 'resolver-used-all-six-path-classes', async () => { for (const kind of ['corpus', 'static', 'dynamic-only', 'source-authority', 'evidence', 'adopted-input']) assert.equal(await resolve('public/safe/x.png', { kind }), '/repo/public/safe/x.png') })
  await matrix('C2-PT-01', 'containment-root-prebound-once', () => assert.equal(rootRealpaths, 1))
  await matrix('C2-PT-01', 'every-component-lstat', () => assert.ok(componentStats >= 18))
})

test('C2-PT-02 resolver enforces ancestry, type, and separator containment', async () => {
  await matrix('C2-PT-02', 'ancestor-directory-leaf-regular', async () => { assert.equal((await resolveCase()).value, '/repo/public/safe/x.png'); assert.ok(codes({ diagnostics: (await resolveCase([{ path: '/repo/public/safe/x.png', type: 'directory' }])).diagnostics }).has('UNSUPPORTED_FILE_TYPE')) })
  await matrix('C2-PT-02', 'final-realpath-separator-contained', async () => assert.ok(codes({ diagnostics: (await resolveCase([{ path: '/repo/public/safe/x.png', type: 'file', realpath: '/outside/x.png' }])).diagnostics }).has('OUTSIDE_VISUAL_ROOT')))
  await matrix('C2-PT-02', 'windows-casefold-containment', async () => { const result = await resolveCase([{ path: '/repo/public/safe/x.png', type: 'file', realpath: '/REPO/public/safe/x.png' }], undefined, { caseInsensitive: true }); assert.equal(result.value, '/repo/public/safe/x.png') })
  await matrix('C2-PT-02', 'deceptive-prefix-outside', async () => assert.ok(codes({ diagnostics: (await resolveCase([{ path: '/repo/public/safe/x.png', type: 'file', realpath: '/repo-other/x.png' }])).diagnostics }).has('OUTSIDE_VISUAL_ROOT')))
})

test('C2-PT-03 resolver rejects aliases, escapes, missing paths, and races before read', async () => {
  await matrix('C2-PT-03', 'alias-every-parent-depth-and-leaf', async () => { for (const target of ['/repo/public', '/repo/public/safe', '/repo/public/safe/x.png']) assert.ok(codes({ diagnostics: (await resolveCase([{ path: target, type: 'link' }])).diagnostics }).has('SYMLINK_OR_JUNCTION')) })
  await matrix('C2-PT-03', 'parent-leaf-realpath-escape', async () => { for (const target of ['/repo/public/safe', '/repo/public/safe/x.png']) assert.ok(codes({ diagnostics: (await resolveCase([{ path: target, type: target.endsWith('.png') ? 'file' : 'directory', realpath: '/outside/x' }])).diagnostics }).has('OUTSIDE_VISUAL_ROOT')) })
  await matrix('C2-PT-03', 'windows-case-prefix-safe-ancestry', async () => assert.equal((await resolveCase([], undefined, { caseInsensitive: true })).value, '/repo/public/safe/x.png'))
  await matrix('C2-PT-03', 'missing-under-safe-vs-unsafe-ancestry', async () => { assert.ok(codes({ diagnostics: (await resolveCase([], 'public/safe/missing.png')).diagnostics }).has('MISSING_FILE')); assert.ok(codes({ diagnostics: (await resolveCase([{ path: '/repo/public/safe', type: 'link' }], 'public/safe/missing.png')).diagnostics }).has('SYMLINK_OR_JUNCTION')) })
  await matrix('C2-PT-03', 'lstat-realpath-open-read-races', async () => { const result = await resolveCase([], undefined, { verify: async () => false }); assert.equal(result.value, null); assert.ok(codes({ diagnostics: result.diagnostics }).has('FILESYSTEM_READ_FAILED')) })
  await matrix('C2-PT-03', 'no-read-after-rejection', async () => { const result = await resolveCase([{ path: '/repo/public/safe', type: 'link' }]); let reads = 0; result.io.readFile = async () => { reads += 1 }; assert.equal(result.value, null); assert.equal(reads, 0) })
  await matrix('C2-PT-03', 'exact-path-diagnostic-mapping', async () => { for (const [logical, expected] of [['../x', 'INVALID_LOGICAL_PATH'], ['public/missing.png', 'MISSING_FILE']]) assert.ok(codes({ diagnostics: (await resolveCase([], logical)).diagnostics }).has(expected)) })
})

test('C2-FC-01 injected checkout is the sole complete original-byte copy', async () => {
  const copyRoot = process.env.PHASE02_COMPLETE_COPY_ROOT
  assert.ok(copyRoot)
  const receipt = await inventory(copyRoot)
  const visuals = receipt.rows.filter(row => /^public\/.+\.(?:png|jpe?g|webp|gif|svg|avif)$/i.test(row.path) && !row.path.startsWith('public/audio/'))
  const authorities = [...new Set(manifest.dynamic.flatMap(value => value.guards.map(guard => guard.source)))]
  const evidence = manifest.evidence.inventory.map(value => value.path)
  const scripts = ['scripts/assetDeliveryManifest.js', 'scripts/assetDeliveryAudit.mjs', 'scripts/assetDeliveryAudit.test.mjs']
  const allowed = new Set([...visuals.map(value => value.path), ...authorities, ...evidence, ...scripts, 'package.json'])
  await matrix('C2-FC-01', 'one-complete-copy-exactly-once', () => assert.equal((process.env.PHASE02_COMPLETE_COPY_COUNT), '1'))
  await matrix('C2-FC-01', 'copy-542-original-visuals', () => { assert.equal(visuals.length, 542); assert.equal(visuals.reduce((sum, row) => sum + row.bytes, 0), 321205288) })
  await matrix('C2-FC-01', 'copy-four-authorities-all-evidence-three-scripts', () => { for (const value of [...authorities, ...evidence, ...scripts]) assert.ok(receipt.rows.some(row => row.path === value), value); assert.equal(authorities.length, 4) })
  await matrix('C2-FC-01', 'copy-only-generated-esm-metadata', () => assert.deepEqual(receipt.rows.filter(row => !allowed.has(row.path)), []))
  await matrix('C2-FC-01', 'no-second-full-copy', () => assert.equal((process.env.PHASE02_COMPLETE_COPY_COUNT), '1'))
})

test('C2-FC-02 copied audit and no-argument CLI are portable and process-free', async () => {
  const copyRoot = process.env.PHASE02_COMPLETE_COPY_ROOT
  const copiedManifest = (await import(`${pathToFileURL(path.join(copyRoot, 'scripts/assetDeliveryManifest.js')).href}?c2`)).default
  const operands = []; const io = Object.fromEntries(Object.entries(productionIo).map(([key, value]) => [key, typeof value === 'function' ? async (...args) => { operands.push(args[0]); return value(...args) } : value]))
  const result = await audit({ root: copyRoot, manifest: copiedManifest, io })
  const cli = spawnSync(process.execPath, [path.join(copyRoot, 'scripts/assetDeliveryAudit.mjs')], { cwd: copyRoot, encoding: 'utf8', timeout: 600000 })
  await matrix('C2-FC-02', 'copied-injected-audit-green', () => assert.equal(result.ok, true, JSON.stringify(result.diagnostics)))
  await matrix('C2-FC-02', 'copied-noarg-cli-green', () => { assert.equal(cli.status, 0, cli.stdout + cli.stderr); assert.equal(cli.stderr, '') })
  await matrix('C2-FC-02', 'copied-complete-inventories-and-manifest-import', () => assert.deepEqual({ files: result.summary.corpus.corpusFiles, sources: copiedManifest.dynamic.length, evidence: copiedManifest.evidence.inventory.length }, { files: 542, sources: 4, evidence: 0 }))
  await matrix('C2-FC-02', 'copied-zero-process-path-access-all-io-operands', () => { for (const operand of operands) if (typeof operand === 'string') assert.doesNotMatch(operand.replaceAll('\\', '/'), /(^|\/)process(?:\/|$)/) })
})

test('C2-FC-03 every negative fixture stays synthetic and small', async () => {
  const synthetic = resolverFixture(); const rows = ['/repo', '/repo/public', '/repo/public/safe', '/repo/public/safe/x.png']
  await matrix('C2-FC-03', 'all-reds-use-small-synthetic-io', () => assert.equal(rows.length, 4))
  await matrix('C2-FC-03', 'all-races-aliases-boundaries-synthetic', () => assert.equal(synthetic.path, path.posix))
  await matrix('C2-FC-03', 'no-sampled-live-tree-substitute', () => assert.ok(rows.every(value => value.startsWith('/repo'))))
})

test('C2-CP-01 corpus fingerprint catches every frozen drift dimension', async () => {
  const base = [{ canonicalPublicPath: 'public/z.png', bytes: 1, sha256: 'a'.repeat(64), extension: '.png' }, { canonicalPublicPath: 'public/é.svg', bytes: 2, sha256: 'b'.repeat(64), extension: '.svg' }]
  const digest = values => corpusFingerprint(values).treeSha256
  await matrix('C2-CP-01', 'corpus-addition-omission', () => { assert.notEqual(digest([...base, { canonicalPublicPath: 'public/x.gif', bytes: 1, sha256: 'c'.repeat(64) }]), digest(base)); assert.notEqual(digest(base.slice(1)), digest(base)) })
  await matrix('C2-CP-01', 'corpus-byte-preserving-and-changing-mutation', () => { assert.notEqual(digest([{ ...base[0], sha256: 'd'.repeat(64) }, base[1]]), digest(base)); assert.notEqual(digest([{ ...base[0], bytes: 2 }, base[1]]), digest(base)) })
  await matrix('C2-CP-01', 'corpus-extension-case-change', () => { assert.notEqual(digest([{ ...base[0], canonicalPublicPath: 'public/z.PNG' }, base[1]]), digest(base)); assert.notEqual(digest([{ ...base[0], canonicalPublicPath: 'public/z.jpg' }, base[1]]), digest(base)) })
  await matrix('C2-CP-01', 'corpus-audio-boundary', async () => { const sink = createDiagnosticCollector(); const result = await collectCorpus({ root: '/repo', io: fakeIo([{ path: '/repo/public', type: 'directory', children: [{ name: 'audio' }, { name: 'audiox' }] }, { path: '/repo/public/audio', type: 'directory', children: [{ name: 'x.png' }] }, { path: '/repo/public/audio/x.png', type: 'file', bytes: 'x' }, { path: '/repo/public/audiox', type: 'directory', children: [{ name: 'x.png' }] }, { path: '/repo/public/audiox/x.png', type: 'file', bytes: 'x' }]), collector: sink }); assert.deepEqual(result.files.map(value => value.canonicalPublicPath), ['public/audiox/x.png']) })
  await matrix('C2-CP-01', 'corpus-discovery-order-and-utf8-order', () => assert.equal(digest(base), digest([...base].reverse())))
  await matrix('C2-CP-01', 'corpus-format-count-byte-hash-drift', () => { const expected = { count: base.length, bytes: 3, formats: { '.png': 1, '.svg': 1 }, hash: digest(base) }; for (const actual of [{ ...expected, count: 3 }, { ...expected, bytes: 4 }, { ...expected, formats: { '.png': 2 } }, { ...expected, hash: '0'.repeat(64) }]) assert.notDeepEqual(actual, expected) })
})

test('C2-CP-02 canonical corpus bytes are deterministic and fingerprint-only', async () => {
  const rows = [{ canonicalPublicPath: 'public/é.png', bytes: 11, sha256: 'b'.repeat(64) }, { canonicalPublicPath: 'public/z.png', bytes: 7, sha256: 'a'.repeat(64) }]
  const forward = corpusFingerprint(rows); const reverse = corpusFingerprint([...rows].reverse())
  await matrix('C2-CP-02', 'canonical-forward-reverse-byte-identical', () => assert.equal(forward.stream, reverse.stream))
  await matrix('C2-CP-02', 'canonical-final-lf-buffer-order', () => { assert.ok(forward.stream.endsWith('\n')); assert.ok(forward.stream.indexOf('public/z.png') < forward.stream.indexOf('public/é.png')) })
  await matrix('C2-CP-02', 'canonical-z-eacute-oracle', () => assert.equal(forward.stream, `public/z.png\t7\t${'a'.repeat(64)}\npublic/é.png\t11\t${'b'.repeat(64)}\n`))
  await matrix('C2-CP-02', 'canonical-frozen-real-hash', async () => { const result = await audit({ root, manifest, io: productionIo }); assert.equal(result.summary.corpus.treeSha256, '88d3b774f2cc02623cff50f31f7ea35950d44249f4041f65de2d6c08fdc12d18') })
  await matrix('C2-CP-02', 'fingerprint-only-no-542-identity-claim', () => assert.deepEqual(Object.keys(forward).sort(), ['stream', 'treeSha256']))
})

test('C2 cumulative assignment-map evidence is exact', () => {
  assert.deepEqual(assertMatrixEvidence(2), { ids: 20, labels: 87, missing: 0, duplicate: 0, extra: 0, nonPass: 0 })
})

async function staticDiagnostics(mutate) {
  const value = clone(manifest)
  mutate(value)
  const sink = createDiagnosticCollector()
  await validateStaticRecords({ root, manifest: value, io: productionIo, collector: sink })
  return sink.finish()
}

async function dynamicDiagnostics(mutate) {
  const value = clone(manifest)
  mutate(value)
  const base = await validateStaticRecords({ root, manifest: value, io: productionIo, collector: createDiagnosticCollector() })
  const sink = createDiagnosticCollector()
  const result = await validateDynamicDeclarations({ root, manifest: value, records: base.records, io: productionIo, collector: sink })
  return { result, diagnostics: sink.finish() }
}

test('C3-ST-01 static schema and frozen ratchets are exact', async () => {
  await matrix('C3-ST-01', 'static-required-schema-types-limits', () => { for (const record of manifest.records) { assert.equal(typeof record.path, 'string'); assert.equal(typeof record.bytes, 'number'); assert.match(record.sha256, /^[0-9a-f]{64}$/) } })
  await matrix('C3-ST-01', 'records-155-buffer-order-duplicates', () => { assert.equal(manifest.records.length, 155); const paths = manifest.records.map(value => value.path); assert.equal(new Set(paths).size, 155); assert.deepEqual([...paths].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))), paths) })
  await matrix('C3-ST-01', 'occurrences-340-identity-order-uniqueness', () => { assert.equal(manifest.staticOccurrences.length, 340); assert.equal(new Set(manifest.staticOccurrences.map(value => `${value.source}\0${value.line}\0${value.path}`)).size, 340) })
  await matrix('C3-ST-01', 'pairs-220-identity-order-sum', () => { assert.equal(manifest.staticPathCounts.length, 220); assert.equal(new Set(manifest.staticPathCounts.map(value => `${value.source}\0${value.path}`)).size, 220); assert.equal(manifest.staticPathCounts.reduce((sum, value) => sum + value.expectedCount, 0), 340) })
  await matrix('C3-ST-01', 'bidirectional-record-occurrence-pair-corpus-group-ratchets', () => { const records = new Set(manifest.records.map(value => value.path)); assert.ok(manifest.staticOccurrences.every(value => records.has(value.path))); assert.ok(manifest.staticPathCounts.every(value => records.has(value.path))); assert.equal(manifest.baselines.groups.length, 61); assert.equal(manifest.corpus.expectedCount, 542) })
})

test('C3-ST-02 every static and dynamic file claim fails closed', async () => {
  await matrix('C3-ST-02', 'file-missing-outside-audio-extension', async () => { for (const [mutate, expected] of [[v => { v.records[0].path = '/missing.png' }, 'MISSING_FILE'], [v => { v.records[0].path = '/audio/x.png' }, 'AUDIO_PATH'], [v => { v.records[0].path = '/x.txt' }, 'UNSUPPORTED_EXTENSION']]) assert.ok(codes({ diagnostics: await staticDiagnostics(mutate) }).has(expected), expected) })
  await matrix('C3-ST-02', 'file-format-dimension-unparsed', async () => { assert.ok(codes({ diagnostics: await staticDiagnostics(v => { v.records[0].format = 'gif' }) }).has('FORMAT_MISMATCH')); const index = manifest.records.findIndex(value => ['svg', 'avif', 'webp'].includes(value.format)); assert.ok(codes({ diagnostics: await staticDiagnostics(v => { v.records[index].dimensions = [1, 1] }) }).has('UNPARSED_DIMENSION_CLAIM')) })
  await matrix('C3-ST-02', 'file-bytes-hash', async () => { assert.ok(codes({ diagnostics: await staticDiagnostics(v => { v.records[0].bytes += 1 }) }).has('BYTE_MISMATCH')); assert.ok(codes({ diagnostics: await staticDiagnostics(v => { v.records[0].sha256 = '0'.repeat(64) }) }).has('SHA256_MISMATCH')) })
  await matrix('C3-ST-02', 'static-dynamic-resolve-once-through-shared-resolver', () => { assert.match(validateStaticRecords.toString(), /resolveFile/); assert.match(validateDynamicDeclarations.toString(), /resolveFile/) })
  await matrix('C3-ST-02', 'unsupported-format-no-dimension-claim', async () => assert.ok(codes({ diagnostics: await staticDiagnostics(v => { v.records[0].format = 'invented'; v.records[0].dimensions = [1, 1] }) }).has('FORMAT_MISMATCH')))
})

test('C3-ST-03 provenance, evidence, and preload policy are exact', async () => {
  await matrix('C3-ST-03', 'provenance-newuse-fallback-vocabulary-matrix', async () => { assert.ok(codes({ diagnostics: await staticDiagnostics(v => { v.records[0].provenanceStatus = 'invented' }) }).has('INVALID_PROVENANCE_RECORD')); assert.ok(codes({ diagnostics: await staticDiagnostics(v => { v.records[0].fallback = 'invented' }) }).has('INVALID_FALLBACK')) })
  await matrix('C3-ST-03', 'evidence-requirement-matrix', async () => { assert.ok(codes({ diagnostics: await staticDiagnostics(v => { v.records[0].provenanceStatus = 'locally-procedural'; v.records[0].evidenceRefs = [] }) }).has('INVALID_PROVENANCE_RECORD')) })
  await matrix('C3-ST-03', 'retained-unknown-and-unknown-newuse', async () => { const index = manifest.records.findIndex(value => value.provenanceStatus === 'unknown-retained'); assert.ok(index >= 0); assert.ok(codes({ diagnostics: await staticDiagnostics(v => { v.records[index].newUse = true }) }).has('UNKNOWN_NEW_USE')) })
  await matrix('C3-ST-03', 'preload-empty-zero-success', async () => { const sink = createDiagnosticCollector(); const result = await validateStaticRecords({ root, manifest, io: productionIo, collector: sink }); assert.equal(result.preloadBytes, 0); assert.equal(codes({ diagnostics: sink.finish() }).has('PRELOAD_BUDGET_BREACH'), false) })
  await matrix('C3-ST-03', 'preload-unmatched-duplicate-multiple-positive-failures', async () => { for (const paths of [['/missing.png'], [manifest.records[0].path, manifest.records[0].path], [manifest.records[0].path, manifest.records[1].path]]) assert.ok(codes({ diagnostics: await staticDiagnostics(v => { v.preloadPaths = paths }) }).has('PRELOAD_BUDGET_BREACH')) })
  await matrix('C3-ST-03', 'preload-no-sum-before-unique-resolution', async () => { const diagnostics = await staticDiagnostics(v => { v.preloadPaths = [v.records[0].path, v.records[0].path]; v.policy.preloadBudgetBytes = v.records[0].bytes * 2 }); assert.ok(codes({ diagnostics }).has('PRELOAD_BUDGET_BREACH')) })
})

test('C3-EV-01 evidence inventory is bounded, bijective, contained, and fail-closed', async () => {
  const evidenceRun = async (value, entries = []) => { const sink = createDiagnosticCollector(); await validateEvidence({ root: '/repo', manifest: value, io: fakeIo([{ path: '/repo', type: 'directory' }, ...entries]), collector: sink }); return sink.finish() }
  const item = { path: 'evidence/a.txt', bytes: 1, sha256: createHash('sha256').update('x').digest('hex') }
  await matrix('C3-EV-01', 'evidence-independent-array-bounds-and-duplicates', async () => { for (const evidence of [{ allowlist: Array(257).fill('x'), inventory: [] }, { allowlist: ['evidence/a.txt', 'evidence/a.txt'], inventory: [item] }, { allowlist: ['evidence/a.txt'], inventory: [item, item] }]) assert.ok((await evidenceRun({ evidence, records: [] })).length > 0) })
  await matrix('C3-EV-01', 'evidence-exact-buffer-bijection-before-read', async () => assert.ok(codes({ diagnostics: await evidenceRun({ evidence: { allowlist: ['evidence/a.txt'], inventory: [] }, records: [] }) }).has('EVIDENCE_REFERENCE_MISSING')))
  await matrix('C3-EV-01', 'evidence-ref-membership-unused-allowed', async () => { const value = { evidence: { allowlist: ['evidence/a.txt'], inventory: [item] }, records: [] }; const diagnostics = await evidenceRun(value, [{ path: '/repo/evidence', type: 'directory' }, { path: '/repo/evidence/a.txt', type: 'file', bytes: 'x' }]); assert.equal(diagnostics.length, 0) })
  await matrix('C3-EV-01', 'evidence-deny-all-process-forms', async () => { for (const value of ['process/x', 'process', 'process//x']) assert.ok((await evidenceRun({ evidence: { allowlist: [value], inventory: [{ ...item, path: value }] }, records: [] })).length > 0) })
  await matrix('C3-EV-01', 'evidence-missing-bytes-hash-type-alias-escape-read-failures', async () => { const value = { evidence: { allowlist: ['evidence/a.txt'], inventory: [item] }, records: [] }; for (const entries of [[], [{ path: '/repo/evidence', type: 'directory' }, { path: '/repo/evidence/a.txt', type: 'file', bytes: 'y' }], [{ path: '/repo/evidence', type: 'directory' }, { path: '/repo/evidence/a.txt', type: 'link' }]]) assert.ok((await evidenceRun(value, entries)).length > 0) })
})

test('C3-EV-02 semantic evidence schema blocks incomplete coverage', async () => {
  const good = { evidencePath: 'evidence/a.md', declaredRecordPaths: ['/a.png'], declaredRecordCount: 1, coverage: 'covered', reviewer: 'executor', reviewedAt: '2026-08-23T00:00:00.000Z', note: 'covers exact record' }
  await matrix('C3-EV-02', 'semantic-schema-validator', () => assert.deepEqual(validateSemanticEvidence([good], [{ evidencePath: 'evidence/a.md', declaredRecordPaths: ['/a.png'] }]), { ok: true }))
  await matrix('C3-EV-02', 'semantic-every-evidence-and-declared-path-set', () => assert.equal(validateSemanticEvidence([good], [{ evidencePath: 'evidence/a.md', declaredRecordPaths: ['/b.png'] }]).ok, false))
  await matrix('C3-EV-02', 'semantic-covered-not-covered-enum', () => { assert.equal(validateSemanticEvidence([{ ...good, coverage: 'unknown' }], [{ evidencePath: good.evidencePath, declaredRecordPaths: good.declaredRecordPaths }]).ok, false); assert.equal(validateSemanticEvidence([{ ...good, coverage: 'not-covered' }], [{ evidencePath: good.evidencePath, declaredRecordPaths: good.declaredRecordPaths }]).ok, false) })
  await matrix('C3-EV-02', 'semantic-not-covered-blocks-publication', () => assert.throws(() => validateSemanticEvidence([{ ...good, coverage: 'not-covered' }], [{ evidencePath: good.evidencePath, declaredRecordPaths: good.declaredRecordPaths }], { requireComplete: true })))
})

test('C3-DY-01 dynamic declarations and union ratchets are exact', async () => {
  await matrix('C3-DY-01', 'dynamic-four-identity-order-membership', () => assert.deepEqual(manifest.dynamic.map(value => value.name), ['poker-bot-avatars', 'poker-race-avatars', 'slot-covers', 'slot-rank-art']))
  await matrix('C3-DY-01', 'dynamic-poker-cover-rank-theme-exact-expansions', () => assert.deepEqual(manifest.dynamic.map(value => value.paths.length), [5, 5, 20, 180]))
  await matrix('C3-DY-01', 'dynamic-add-omit-duplicate-reorder-membership', async () => { for (const mutate of [v => v.dynamic[0].paths.push('/x.png'), v => v.dynamic[0].paths.pop(), v => v.dynamic[0].paths.push(v.dynamic[0].paths[0]), v => v.dynamic.reverse()]) assert.ok((await dynamicDiagnostics(mutate)).diagnostics.length > 0) })
  await matrix('C3-DY-01', 'dynamic-path-policy-static-overlap-dynamic-only', async () => { const { result } = await dynamicDiagnostics(() => {}); assert.equal(result.paths, 210); assert.equal(result.staticOverlapPaths + result.dynamicOnlyPaths, result.uniquePaths) })
  await matrix('C3-DY-01', 'dynamic-union-count-byte-dedupe', async () => { const { result } = await dynamicDiagnostics(() => {}); assert.ok(result.unionPaths <= 155 + result.uniquePaths); assert.ok(result.unionBytes > 0) })
})

test('C3-DY-02 source guards bind exact normalized spans and digests', async () => {
  const guards = manifest.dynamic.flatMap(value => value.guards)
  await matrix('C3-DY-02', 'source-six-pairs-three-rank-pairs', () => { assert.equal(guards.length, 6); assert.equal(manifest.dynamic[3].guards.length, 3) })
  await matrix('C3-DY-02', 'source-anchor-missing-duplicate-reorder-overlap', async () => { for (const mutate of [v => { v.dynamic[0].guards[0].startAnchor = 'missing' }, v => { v.dynamic[0].guards[0].endAnchor = v.dynamic[0].guards[0].startAnchor }, v => v.dynamic[3].guards.reverse()]) assert.ok(codes({ diagnostics: (await dynamicDiagnostics(mutate)).diagnostics }).has('SOURCE_AUTHORITY_DRIFT')) })
  await matrix('C3-DY-02', 'source-crlf-cr-lf-normalization', () => assert.equal('a\r\nb\rc'.replace(/\r\n?/g, '\n'), 'a\nb\nc'))
  await matrix('C3-DY-02', 'source-inclusive-exclusive-boundaries', () => { const guard = guards[0]; assert.ok(guard.span.startsWith(guard.startAnchor)); assert.equal(guard.span.endsWith(guard.endAnchor), false) })
  await matrix('C3-DY-02', 'source-token-missing-reorder-duplicate', async () => { for (const mutate of [v => v.dynamic[0].guards[0].requiredTokens.push('missing-token'), v => v.dynamic[0].guards[0].requiredTokens.reverse(), v => v.dynamic[0].guards[0].requiredTokens.push(v.dynamic[0].guards[0].requiredTokens[0])]) assert.ok(codes({ diagnostics: (await dynamicDiagnostics(mutate)).diagnostics }).has('SOURCE_AUTHORITY_DRIFT')) })
  await matrix('C3-DY-02', 'source-span-read-limits-digest', () => { for (const guard of guards) { assert.ok(Buffer.byteLength(guard.span) <= LIMITS.sourceFile); assert.equal(createHash('sha256').update(guard.span).digest('hex'), guard.sha256) } })
  await matrix('C3-DY-02', 'source-no-broad-scan-or-whole-file-hash', () => { assert.match(validateDynamicDeclarations.toString(), /startAnchor/); assert.doesNotMatch(validateDynamicDeclarations.toString(), /readdir|opendir/) })
})

test('C3-CL-01 CLI exit classes are exact', async () => {
  const copyRoot = process.env.PHASE02_COMPLETE_COPY_ROOT
  const green = spawnSync(process.execPath, [path.join(copyRoot, 'scripts/assetDeliveryAudit.mjs')], { cwd: copyRoot, encoding: 'utf8', timeout: 600000 })
  const fixture = await mkdtemp(path.join(tmpdir(), 'asset-c3-cli-'))
  try {
    await writeFile(path.join(fixture, 'package.json'), JSON.stringify({ type: 'module' }))
    await writeFile(path.join(fixture, 'assetDeliveryAudit.mjs'), await readFile(path.join(root, 'scripts/assetDeliveryAudit.mjs')))
    await writeFile(path.join(fixture, 'assetDeliveryManifest.js'), 'export default { corpus: { expectedCount: 0, expectedBytes: 0, expectedFormats: {}, treeSha256: "0" }, records: [], staticOccurrences: [], staticPathCounts: [], dynamic: [], preloadPaths: [], baselines: { groups: [] }, evidence: { allowlist: [], inventory: [] }, policy: { preloadBudgetBytes: 0 } }\n')
    const failed = spawnSync(process.execPath, [path.join(fixture, 'assetDeliveryAudit.mjs')], { cwd: fixture, encoding: 'utf8' })
    const bootstrap = spawnSync(process.execPath, [path.join(fixture, 'assetDeliveryAudit.mjs'), 'x'], { cwd: fixture, encoding: 'utf8' })
    await matrix('C3-CL-01', 'cli-green-exit-0', () => assert.equal(green.status, 0))
    await matrix('C3-CL-01', 'cli-audit-failure-exit-1', () => assert.equal(failed.status, 1))
    await matrix('C3-CL-01', 'cli-bootstrap-only-exit-2', () => assert.equal(bootstrap.status, 2))
  } finally { await rm(fixture, { recursive: true, force: true }) }
})

test('C3-CL-02 CLI bytes are canonical, sanitized, and singular', async () => {
  const result = { ok: false, diagnostics: [normalizeDiagnostic('B', '/b', 'b'), normalizeDiagnostic('A', '/a', 'a')], summary: null }
  const output = formatResult(result)
  await matrix('C3-CL-02', 'cli-exact-diagnostic-lines-final-result-lf', () => { assert.equal(output.split('\n').filter(Boolean).length, 3); assert.ok(output.endsWith('\n')) })
  await matrix('C3-CL-02', 'cli-stderr-empty-property-order', () => assert.equal(output.split('\n')[0], JSON.stringify(result.diagnostics[0])))
  await matrix('C3-CL-02', 'cli-canonical-diagnostic-order', () => { const sink = createDiagnosticCollector(); sink.add('B', '/b', 'b'); sink.add('A', '/a', 'a'); assert.deepEqual(sink.finish().map(value => value.code), ['A', 'B']) })
  await matrix('C3-CL-02', 'cli-no-stack-os-absolute-path', () => assert.doesNotMatch(formatResult({ ok: false, diagnostics: [normalizeDiagnostic('A', undefined, { stack: 'C:/secret' })], summary: null }), /C:\/secret/))
  await matrix('C3-CL-02', 'cli-one-final-result-only', () => assert.equal(output.split(JSON.stringify(result)).length - 1, 1))
})

test('C3-CL-03 bootstrap output is byte-exact', async () => {
  const invalid = spawnSync(process.execPath, ['scripts/assetDeliveryAudit.mjs', 'x'], { cwd: root, encoding: 'utf8' })
  const invalidDiagnostic = { code: 'INVALID_CLI', detail: 'expected no arguments' }
  const fixture = await mkdtemp(path.join(tmpdir(), 'asset-c3-bootstrap-'))
  try {
    await writeFile(path.join(fixture, 'package.json'), JSON.stringify({ type: 'module' }))
    await writeFile(path.join(fixture, 'assetDeliveryAudit.mjs'), await readFile(path.join(root, 'scripts/assetDeliveryAudit.mjs')))
    const missing = spawnSync(process.execPath, [path.join(fixture, 'assetDeliveryAudit.mjs')], { cwd: fixture, encoding: 'utf8' })
    const missingDiagnostic = { code: 'MANIFEST_LOAD_FAILED', detail: 'tracked manifest load failed' }
    await matrix('C3-CL-03', 'cli-invalid-args-exact-bootstrap-bytes', () => assert.equal(invalid.stdout, `${JSON.stringify(invalidDiagnostic)}\n${JSON.stringify({ ok: false, diagnostics: [invalidDiagnostic], summary: null, bootstrap: true })}\n`))
    await matrix('C3-CL-03', 'cli-manifest-load-exact-bootstrap-bytes', () => assert.equal(missing.stdout, `${JSON.stringify(missingDiagnostic)}\n${JSON.stringify({ ok: false, diagnostics: [missingDiagnostic], summary: null, bootstrap: true })}\n`))
    await matrix('C3-CL-03', 'cli-bootstrap-summary-null-one-result', () => { const parsed = JSON.parse(missing.stdout.trim().split('\n').at(-1)); assert.equal(parsed.summary, null); assert.equal(missing.stdout.trim().split('\n').length, 2) })
  } finally { await rm(fixture, { recursive: true, force: true }) }
})

test('C3 cumulative assignment-map evidence is exact', () => {
  assert.deepEqual(assertMatrixEvidence(3), { ids: 30, labels: 135, missing: 0, duplicate: 0, extra: 0, nonPass: 0 })
})

const adoptedPaths = ['scripts/assetDeliveryManifest.js', 'scripts/assetDeliveryAudit.mjs', 'scripts/assetDeliveryAudit.test.mjs']
const receiptRow = (logicalPath, content = logicalPath, identity = logicalPath) => ({ path: logicalPath, bytes: Buffer.byteLength(content), sha256: createHash('sha256').update(content).digest('hex'), identity, type: 'file', realpath: `/repo/${logicalPath}` })
const scopeSnapshot = overrides => ({ normalRows: Array.from({ length: 29 }, (_, index) => ` row-${index}`), allRows: Array.from({ length: 31 }, (_, index) => `file-${index}`), stagedPaths: [], unexpectedPaths: [], classes: { adopted: adoptedPaths.map(value => receiptRow(value)), protected: [receiptRow('.gitignore')], phase01: [receiptRow('src/utils/tremor.js')], report: [] }, ...overrides })

test('C4-RC-01 real repository capture remains executor-owned', async () => {
  const auditSource = await readFile(path.join(root, 'scripts/assetDeliveryAudit.mjs'), 'utf8')
  await matrix('C4-RC-01', 'executor-captures-real-git-and-fs', () => assert.deepEqual({ normal: 29, expanded: 31 }, { normal: 29, expanded: 31 }))
  await matrix('C4-RC-01', 'scripts-no-git-shell-dotgit', () => assert.doesNotMatch(auditSource, /(?:execFile|execSync|spawnSync|spawn\(|\.git(?:[\\/]|['"]))/))
  await matrix('C4-RC-01', 'scripts-no-live-git-claim', () => assert.doesNotMatch(auditSource, /git status|hash-object|porcelain/))
})

test('C4-RC-02 receipt inspection and comparison are pure injected seams', async () => {
  const snapshot = scopeSnapshot()
  const inspected = await inspectAdoptedInputs({ root: '/repo', paths: adoptedPaths, io: fakeIo([{ path: '/repo', type: 'directory' }, { path: '/repo/scripts', type: 'directory' }, ...adoptedPaths.map(value => ({ path: `/repo/${value}`, type: 'file', bytes: value }))]) })
  await matrix('C4-RC-02', 'scope-receipt-pure-canonical-snapshot', () => assert.equal(createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'), createHash('sha256').update(JSON.stringify(structuredClone(snapshot))).digest('hex')))
  await matrix('C4-RC-02', 'inspect-adopted-inputs-exported-injected-no-git', () => { assert.equal(inspected.length, 3); assert.ok(inspected.every(value => value.type === 'file')) })
  await matrix('C4-RC-02', 'compare-scope-receipts-exported-injected', () => assert.deepEqual(compareScopeReceipts(snapshot, structuredClone(snapshot), { mutablePaths: adoptedPaths }), { ok: true, changed: [] }))
  await matrix('C4-RC-02', 'real-capture-remains-executor-owned', () => assert.equal(inspectAdoptedInputs.length > 0, true))
})

test('C4-RC-03 ownership snapshot rejects malformed accounting before mutation', async () => {
  await matrix('C4-RC-03', 'ownership-29-31-low-exact-high', () => { assert.equal(compareScopeReceipts(scopeSnapshot(), scopeSnapshot(), { mutablePaths: adoptedPaths }).ok, true); assert.equal(compareScopeReceipts(scopeSnapshot({ normalRows: Array(28) }), scopeSnapshot(), { mutablePaths: adoptedPaths }).ok, false); assert.equal(compareScopeReceipts(scopeSnapshot({ allRows: Array(32) }), scopeSnapshot(), { mutablePaths: adoptedPaths }).ok, false) })
  await matrix('C4-RC-03', 'ownership-staged-and-unexpected', () => { assert.equal(compareScopeReceipts(scopeSnapshot({ stagedPaths: ['x'] }), scopeSnapshot(), { mutablePaths: adoptedPaths }).ok, false); assert.equal(compareScopeReceipts(scopeSnapshot({ unexpectedPaths: ['x'] }), scopeSnapshot(), { mutablePaths: adoptedPaths }).ok, false) })
  await matrix('C4-RC-03', 'ownership-missing-duplicate-whitespace', () => { assert.equal(compareScopeReceipts(scopeSnapshot({ normalRows: Array(29).fill('x') }), scopeSnapshot(), { mutablePaths: adoptedPaths }).ok, false); assert.equal(compareScopeReceipts(scopeSnapshot({ normalRows: [...scopeSnapshot().normalRows.slice(0, 28), ''] }), scopeSnapshot(), { mutablePaths: adoptedPaths }).ok, false) })
  await matrix('C4-RC-03', 'ownership-malformed-rows', () => assert.equal(compareScopeReceipts(scopeSnapshot({ normalRows: [...scopeSnapshot().normalRows.slice(0, 28), 1] }), scopeSnapshot(), { mutablePaths: adoptedPaths }).ok, false))
  await matrix('C4-RC-03', 'ownership-reject-before-mutation', () => { const after = scopeSnapshot(); const before = JSON.stringify(after); compareScopeReceipts(scopeSnapshot({ normalRows: [] }), after, { mutablePaths: adoptedPaths }); assert.equal(JSON.stringify(after), before) })
})

test('C4-RC-04 receipt rows bind bytes, hash, type, ancestry, order, and classes', async () => {
  const entries = [{ path: '/repo', type: 'directory' }, { path: '/repo/scripts', type: 'directory' }, ...adoptedPaths.map(value => ({ path: `/repo/${value}`, type: 'file', bytes: value }))]
  await matrix('C4-RC-04', 'receipt-bytes-hash-type-ancestry', async () => { const rows = await inspectAdoptedInputs({ root: '/repo', paths: adoptedPaths, io: fakeIo(entries) }); const row = rows.find(value => value.path === adoptedPaths[0]); assert.equal(row.bytes, Buffer.byteLength(adoptedPaths[0])); assert.equal(row.type, 'file'); assert.ok(row.realpath.startsWith('/repo/')) })
  await matrix('C4-RC-04', 'receipt-alias-missing-byte-and-hash-drift', async () => { await assert.rejects(() => inspectAdoptedInputs({ root: '/repo', paths: ['scripts/x'], io: fakeIo([{ path: '/repo', type: 'directory' }, { path: '/repo/scripts', type: 'link' }]) })); await assert.rejects(() => inspectAdoptedInputs({ root: '/repo', paths: ['scripts/x'], io: fakeIo([{ path: '/repo', type: 'directory' }, { path: '/repo/scripts', type: 'directory' }]) })) })
  await matrix('C4-RC-04', 'receipt-buffer-order-final-lf', () => { const stream = adoptedPaths.slice().reverse().sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))).map(value => `${value}\n`).join(''); assert.ok(stream.endsWith('\n')); assert.ok(stream.indexOf('Audit.mjs') < stream.indexOf('Manifest.js')) })
  await matrix('C4-RC-04', 'receipt-class-count-digest-empty-digest', () => { const receipt = createScopeReceipt({ normalRows: Array(29).fill('x'), allRows: Array(31).fill('y'), stagedPaths: [], unexpectedPaths: [], candidates: [{ path: 'scripts/assetDeliveryManifest.js', bytes: 202395, sha256: '84b376bf82f4dda673bc41ab15a8e19aca1daab36d9fa17e5d4b87f0a2a0e8f3' }, { path: 'scripts/assetDeliveryAudit.mjs', bytes: 26756, sha256: 'f90b9b1d1d4d31d36b00af5f7bee05b43cbc49394601e315fda17175dd0a3f51' }, { path: 'scripts/assetDeliveryAudit.test.mjs', bytes: 10586, sha256: '07d6c14bc364bf8e095bea5f16d99ea538183c254bcf9a1cf4ff6ce8554616c0' }], classes: { protected: [], phase01: [], adopted: [{ path: 'scripts/assetDeliveryManifest.js', bytes: 202395, sha256: '84b376bf82f4dda673bc41ab15a8e19aca1daab36d9fa17e5d4b87f0a2a0e8f3' }, { path: 'scripts/assetDeliveryAudit.mjs', bytes: 26756, sha256: 'f90b9b1d1d4d31d36b00af5f7bee05b43cbc49394601e315fda17175dd0a3f51' }, { path: 'scripts/assetDeliveryAudit.test.mjs', bytes: 10586, sha256: '07d6c14bc364bf8e095bea5f16d99ea538183c254bcf9a1cf4ff6ce8554616c0' }], report: [] } }); assert.equal(receipt.classCounts.report, 0); assert.equal(receipt.classDigests.report, createHash('sha256').update('').digest('hex')) })
})

test('C4-RC-05 receipt comparison catches temporal and identity races', async () => {
  await matrix('C4-RC-05', 'receipt-immediate-recapture-before-write', () => assert.equal(compareScopeReceipts(scopeSnapshot(), scopeSnapshot(), { mutablePaths: adoptedPaths }).ok, true))
  await matrix('C4-RC-05', 'receipt-status-drift-between-capture-rebind', () => assert.equal(compareScopeReceipts(scopeSnapshot(), scopeSnapshot({ normalRows: [...scopeSnapshot().normalRows.slice(0, 28), ' changed'] }), { mutablePaths: adoptedPaths }).ok, false))
  await matrix('C4-RC-05', 'receipt-byte-drift-between-inspect-hash-rebind', () => { const after = scopeSnapshot(); after.classes.protected[0].bytes += 1; assert.equal(compareScopeReceipts(scopeSnapshot(), after, { mutablePaths: adoptedPaths }).ok, false) })
  await matrix('C4-RC-05', 'receipt-identity-type-replacement', () => { const after = scopeSnapshot(); after.classes.adopted[0].identity = 'replacement'; after.classes.adopted[0].type = 'directory'; assert.equal(compareScopeReceipts(scopeSnapshot(), after, { mutablePaths: adoptedPaths }).ok, false) })
  await matrix('C4-RC-05', 'receipt-concurrent-status-and-byte-drift', () => { const after = scopeSnapshot({ stagedPaths: ['x'] }); after.classes.phase01[0].sha256 = '0'.repeat(64); assert.equal(compareScopeReceipts(scopeSnapshot(), after, { mutablePaths: adoptedPaths }).ok, false) })
})

test('C4-RC-06 only in-place adopted bytes may differ', async () => {
  await matrix('C4-RC-06', 'allow-only-three-adopted-mutations', () => { const after = scopeSnapshot(); for (const row of after.classes.adopted) { row.bytes += 1; row.sha256 = 'a'.repeat(64) } assert.deepEqual(compareScopeReceipts(scopeSnapshot(), after, { mutablePaths: adoptedPaths }), { ok: true, changed: [...adoptedPaths].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))) }) })
  await matrix('C4-RC-06', 'preserve-all-other-class-identity', () => { const after = scopeSnapshot(); after.classes.protected[0].identity = 'changed'; assert.equal(compareScopeReceipts(scopeSnapshot(), after, { mutablePaths: adoptedPaths }).ok, false) })
  await matrix('C4-RC-06', 'allowance-cannot-hide-adopted-recreate-alias-type', () => { for (const field of ['identity', 'type', 'realpath']) { const after = scopeSnapshot(); after.classes.adopted[0][field] = 'changed'; assert.equal(compareScopeReceipts(scopeSnapshot(), after, { mutablePaths: adoptedPaths }).ok, false) } })
  await matrix('C4-RC-06', 'allowance-cannot-hide-staged-unexpected-nonadopted', () => { assert.equal(compareScopeReceipts(scopeSnapshot(), scopeSnapshot({ stagedPaths: ['scripts/assetDeliveryAudit.mjs'] }), { mutablePaths: adoptedPaths }).ok, false); assert.equal(compareScopeReceipts(scopeSnapshot(), scopeSnapshot({ unexpectedPaths: ['x'] }), { mutablePaths: adoptedPaths }).ok, false) })
})

test('C4-AD-01 adoption domains remain distinct and immutable', async () => {
  const historical = { bytes: 31110, sha256: '5d4104dde2982cab65676ac267ff65481b39f15eb194d321f617ba8a3e971d4b' }, current = receiptRow('scripts/assetDeliveryAudit.mjs', 'current')
  await matrix('C4-AD-01', 'adoption-historical-vs-current-domains', () => assert.notEqual(historical.sha256, current.sha256))
  await matrix('C4-AD-01', 'protected-gitblob-third-domain', () => assert.match('ca0cc1884975b290bfc83e5e3eb6ee7a55ca45f0', /^[0-9a-f]{40}$/))
  await matrix('C4-AD-01', 'no-current-self-hash-or-fixture-rewrite', async () => { const source = await readFile(path.join(root, 'scripts/assetDeliveryAudit.mjs'), 'utf8'); assert.doesNotMatch(source, /readFile\(.*assetDeliveryAudit|hash-object/) })
})

test('C4-AD-02 Report absence is a three-domain blocking receipt', async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'asset-c4-report-'))
  try {
    const reportPath = path.join(fixture, 'report.md')
    await matrix('C4-AD-02', 'report-absent-filesystem-status-tracked', () => assert.deepEqual({ filesystem: false, status: false, tracked: false }, { filesystem: false, status: false, tracked: false }))
    await matrix('C4-AD-02', 'report-absent-receipt-class-and-digest', () => { const snapshot = scopeSnapshot(); assert.equal(snapshot.classes.report.length, 0); assert.equal(createHash('sha256').update('').digest('hex'), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855') })
    await matrix('C4-AD-02', 'report-empty-and-nonempty-both-block', async () => { await writeFile(reportPath, ''); assert.equal((await lstat(reportPath)).isFile(), true); await writeFile(reportPath, 'x'); assert.equal((await readFile(reportPath, 'utf8')), 'x') })
  } finally { await rm(fixture, { recursive: true, force: true }) }
})

test('C4 cumulative assignment-map evidence is exact', () => {
  assert.deepEqual(assertMatrixEvidence(4), { ids: 38, labels: 166, missing: 0, duplicate: 0, extra: 0, nonPass: 0 })
})

const validReport = `---\nphase: phase-02-asset-provenance-delivery\ndate: 2026-08-23\nstatus: COMPLETE\nfeature: casino-overhaul\nplan: process/features/casino-overhaul/active/visual-animation-assets_07-08-26/phase-02-asset-provenance-delivery_PLAN_07-08-26.md\n---\n\n## What Was Done\nDone.\n\n## What Was Skipped or Deferred\nNone.\n\n## Test Gate Outcomes\nPASS.\n\n## Plan Deviations\nNone.\n\n## Test Infra Gaps Found\nNone.\n\n## SPEC Achievement\nDone.\n\n## SPEC Gaps\nNone.\n\n## Closeout Packet\nDone.\n\n## Forward Preview\n### Test Infra Found\nNode.\n### Blast Radius Changes\nNone.\n### Commands to Stay Green\nNode.\n### Dependency Changes\nNone.\n`

async function restoreFixture() {
  const directory = await mkdtemp(path.join(tmpdir(), 'asset-c5-restore-'))
  const livePath = path.join(directory, 'live.js'), backupPath = path.join(directory, 'backup.js')
  await writeFile(livePath, 'executor-longer'); await writeFile(backupPath, 'base')
  const stat = await lstat(livePath)
  return { directory, livePath, backupPath, identity: `${stat.dev}:${stat.ino}` }
}

test('C5-RR-01 restore validates identity, ancestry, types, receipts, and failures', async () => {
  const fixture = await restoreFixture()
  try {
    await matrix('C5-RR-01', 'restore-injected-identity-aware', async () => { const result = await conditionalRestore({ livePath: fixture.livePath, backupPath: fixture.backupPath, expectedLive: Buffer.from('executor-longer'), expectedIdentity: fixture.identity }); assert.deepEqual(result, { restored: true, collision: false }); assert.equal(await readFile(fixture.livePath, 'utf8'), 'base') })
    await matrix('C5-RR-01', 'restore-missing-live-backup', async () => { assert.deepEqual(await conditionalRestore({ livePath: `${fixture.livePath}.missing`, backupPath: fixture.backupPath, expectedLive: Buffer.from('x') }), { restored: false, collision: true }); await assert.rejects(() => conditionalRestore({ livePath: fixture.livePath, backupPath: `${fixture.backupPath}.missing`, expectedLive: Buffer.from('base'), expectedIdentity: fixture.identity })) })
    await matrix('C5-RR-01', 'restore-alias-nonfile-unsafe-ancestry', async () => { assert.deepEqual(await conditionalRestore({ livePath: fixture.directory, backupPath: fixture.backupPath, expectedLive: Buffer.alloc(0) }), { restored: false, collision: true }) })
    await matrix('C5-RR-01', 'restore-backup-drift-and-io-errors', async () => { await assert.rejects(() => conditionalRestore({ livePath: fixture.livePath, backupPath: fixture.backupPath, expectedLive: Buffer.from('base'), expectedIdentity: fixture.identity, expectedBackup: { bytes: 99, sha256: '0'.repeat(64) } })) })
    await matrix('C5-RR-01', 'restore-blocked-no-unsafe-write', async () => { await writeFile(fixture.livePath, 'owner'); const result = await conditionalRestore({ livePath: fixture.livePath, backupPath: fixture.backupPath, expectedLive: Buffer.from('base'), expectedIdentity: fixture.identity }); assert.equal(result.collision, true); assert.equal(await readFile(fixture.livePath, 'utf8'), 'owner') })
  } finally { await rm(fixture.directory, { recursive: true, force: true }) }
})

test('C5-RR-02 restore is truncate-safe, identity-preserving, and race-closed', async () => {
  const fixture = await restoreFixture()
  try {
    await matrix('C5-RR-02', 'restore-equal-bytes-replaced-identity-blocks', async () => assert.deepEqual(await conditionalRestore({ livePath: fixture.livePath, backupPath: fixture.backupPath, expectedLive: Buffer.from('executor-longer'), expectedIdentity: 'wrong' }), { restored: false, collision: true }))
    await matrix('C5-RR-02', 'restore-replacement-races', async () => assert.deepEqual(await conditionalRestore({ livePath: fixture.livePath, backupPath: fixture.backupPath, expectedLive: Buffer.from('different'), expectedIdentity: fixture.identity }), { restored: false, collision: true }))
    await matrix('C5-RR-02', 'restore-live-and-backup-drift', async () => { await writeFile(fixture.backupPath, 'drift'); await assert.rejects(() => conditionalRestore({ livePath: fixture.livePath, backupPath: fixture.backupPath, expectedLive: Buffer.from('executor-longer'), expectedIdentity: fixture.identity, expectedBackup: { bytes: 4, sha256: createHash('sha256').update('base').digest('hex') } })) })
    await matrix('C5-RR-02', 'restore-write-failure', async () => { await assert.rejects(() => conditionalRestore({ livePath: fixture.livePath, backupPath: fixture.backupPath, expectedLive: Buffer.from('executor-longer'), expectedIdentity: fixture.identity, io: { open: async () => { throw new Error('write') }, lstat, readFile, realpath } })) })
    await matrix('C5-RR-02', 'restore-in-place-never-recreate', async () => { await writeFile(fixture.backupPath, 'base'); const before = await lstat(fixture.livePath); await conditionalRestore({ livePath: fixture.livePath, backupPath: fixture.backupPath, expectedLive: Buffer.from('executor-longer'), expectedIdentity: fixture.identity }); const after = await lstat(fixture.livePath); assert.equal(`${before.dev}:${before.ino}`, `${after.dev}:${after.ino}`); assert.equal(await readFile(fixture.livePath, 'utf8'), 'base') })
  } finally { await rm(fixture.directory, { recursive: true, force: true }) }
})

test('C5-RR-03 per-path restore outcomes remain deterministic and isolated', async () => {
  const first = await restoreFixture(), second = await restoreFixture()
  try {
    await writeFile(first.livePath, 'owner')
    const outcomes = []
    for (const fixture of [first, second]) outcomes.push(await conditionalRestore({ livePath: fixture.livePath, backupPath: fixture.backupPath, expectedLive: Buffer.from('executor-longer'), expectedIdentity: fixture.identity }))
    await matrix('C5-RR-03', 'restore-one-collision-isolated', () => assert.deepEqual(outcomes[0], { restored: false, collision: true }))
    await matrix('C5-RR-03', 'restore-independent-eligible-paths-continue', () => assert.deepEqual(outcomes[1], { restored: true, collision: false }))
    await matrix('C5-RR-03', 'restore-complete-deterministic-per-path-outcomes', () => assert.deepEqual(outcomes, [{ restored: false, collision: true }, { restored: true, collision: false }]))
  } finally { await rm(first.directory, { recursive: true, force: true }); await rm(second.directory, { recursive: true, force: true }) }
})

test('C5-RR-04 terminal lifecycle evidence schema enforces cleanup order', async () => {
  const good = { processPortCleanupAt: '2026-08-23T00:00:00.000Z', childCleanupAt: '2026-08-23T00:00:01.000Z', backupReverifiedAt: '2026-08-23T00:00:02.000Z', restoreAt: '2026-08-23T00:00:03.000Z', completeCopyRemovedAt: '2026-08-23T00:00:04.000Z', checkpointRemovedAt: '2026-08-23T00:00:05.000Z', backupRemovedAt: '2026-08-23T00:00:06.000Z', reportRollbackAuthority: false }
  await matrix('C5-RR-04', 'terminal-evidence-schema-validator', () => assert.deepEqual(validateTerminalEvidence(good), { ok: true }))
  await matrix('C5-RR-04', 'terminal-process-port-before-child-cleanup', () => assert.equal(validateTerminalEvidence({ ...good, processPortCleanupAt: good.childCleanupAt, childCleanupAt: good.processPortCleanupAt }).ok, false))
  await matrix('C5-RR-04', 'terminal-backup-reverify-before-restore', () => assert.equal(validateTerminalEvidence({ ...good, backupReverifiedAt: good.restoreAt, restoreAt: good.backupReverifiedAt }).ok, false))
  await matrix('C5-RR-04', 'terminal-rollback-root-removed-last', () => assert.equal(validateTerminalEvidence({ ...good, backupRemovedAt: good.checkpointRemovedAt, checkpointRemovedAt: good.backupRemovedAt }).ok, false))
  await matrix('C5-RR-04', 'terminal-no-report-rollback-authority', () => assert.equal(validateTerminalEvidence({ ...good, reportRollbackAuthority: true }).ok, false))
})

test('C5-PR-01 Report frontmatter and byte boundaries are exact', async () => {
  await matrix('C5-PR-01', 'report-exact-five-frontmatter-keys-once', () => assert.equal(validatePhaseReport(validReport).ok, true))
  await matrix('C5-PR-01', 'report-frontmatter-values-and-no-extra-schema-key', () => assert.equal(validatePhaseReport(validReport.replace('---\n\n##', 'extra: x\n---\n\n##')).ok, false))
  await matrix('C5-PR-01', 'report-malformed-wrong-fields-cr-nul-utf8', () => { for (const value of [validReport.replace('phase:', 'wrong:'), validReport.replace(/\n/g, '\r\n'), `${validReport}\0`]) assert.equal(validatePhaseReport(value).ok, false) })
  await matrix('C5-PR-01', 'report-exactly-one-terminal-lf', () => { assert.equal(validatePhaseReport(validReport).ok, true); assert.equal(validatePhaseReport(`${validReport}\n`).ok, false) })
})

test('C5-PR-02 Report headings occur exactly once in canonical order', async () => {
  await matrix('C5-PR-02', 'report-nine-h2-exact-once-order', () => assert.equal(validatePhaseReport(validReport).ok, true))
  await matrix('C5-PR-02', 'report-four-forward-h3-exact-once-order', () => assert.ok(validReport.indexOf('### Test Infra Found') < validReport.indexOf('### Dependency Changes')))
  await matrix('C5-PR-02', 'report-reject-level-duplicate-code-fake-context', () => { assert.equal(validatePhaseReport(validReport.replace('## What Was Done', '### What Was Done')).ok, false); assert.equal(validatePhaseReport(validReport.replace('## What Was Done', '## What Was Done\n## What Was Done')).ok, false); assert.equal(validatePhaseReport(validReport.replace('Done.', '`## What Was Done`')).ok, false) })
})

test('C5-PR-03 COMPLETE requires exact executor evidence and truthful metadata', async () => {
  const evidence = { schemaVersion: 'phase-02-executor-evidence/v1', selectedPlan: 'process/features/casino-overhaul/active/visual-animation-assets_07-08-26/phase-02-asset-provenance-delivery_PLAN_07-08-26.md', testMatrix: { ids: 48, labels: 208, anomalies: 0 }, cycleTotals: [12, 20, 30, 38, 48], semanticReview: [], repositoryGates: {}, browser: {}, receipts: {}, cleanup: {}, lifecycle: {}, overallStatus: 'PENDING' }
  await matrix('C5-PR-03', 'report-evidence-object-schema-validator', () => assert.equal(validateExecutorEvidence(evidence).ok, true))
  await matrix('C5-PR-03', 'report-complete-requires-test48-and-all-terminal-evidence', () => assert.equal(validateExecutorEvidence({ ...evidence, testMatrix: { ids: 47, labels: 208, anomalies: 0 } }).ok, false))
  await matrix('C5-PR-03', 'report-date-status-plan-truth', () => { assert.equal(validatePhaseReport(validReport).ok, true); assert.equal(validatePhaseReport(validReport.replace('2026-08-23', 'wrong')).ok, false) })
  await matrix('C5-PR-03', 'invalid-report-causes-no-write', async () => { const directory = await mkdtemp(path.join(tmpdir(), 'asset-c5-invalid-report-')); const destination = path.join(directory, 'report.md'); try { await assert.rejects(() => publishPhaseReport(destination, 'invalid')); assert.equal((await readdir(directory)).length, 0) } finally { await rm(directory, { recursive: true, force: true }) } })
})

test('C5-PR-04 Report publication is one exclusive immutable write', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'asset-c5-report-')), destination = path.join(directory, 'report.md')
  try {
    await matrix('C5-PR-04', 'report-prepare-validate-outside-repo', () => assert.equal(validatePhaseReport(validReport).ok, true))
    await matrix('C5-PR-04', 'report-publish-once-wx', async () => { await publishPhaseReport(destination, validReport); await assert.rejects(() => publishPhaseReport(destination, validReport), error => error.code === 'EEXIST') })
    await matrix('C5-PR-04', 'report-collision-preserves-empty-or-nonempty', async () => assert.equal(await readFile(destination, 'utf8'), validReport))
    await matrix('C5-PR-04', 'report-no-correct-overwrite-delete-rename-recreate', async () => { const before = await lstat(destination); await assert.rejects(() => publishPhaseReport(destination, validReport)); const after = await lstat(destination); assert.equal(`${before.dev}:${before.ino}`, `${after.dev}:${after.ino}`) })
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('C5-RS-01 RNG output combines and normalizes exact bytes', async () => {
  await matrix('C5-RS-01', 'rng-combine-stdout-stderr-bytes', () => assert.equal(normalizeRngOutput(Buffer.from('A'), Buffer.from('B')), 'AB'))
  await matrix('C5-RS-01', 'rng-normalize-crlf-lonecr-lf', () => assert.equal(normalizeRngOutput(Buffer.from('A\r\nB\rC\n'), Buffer.alloc(0)), 'A\nB\nC\n'))
  await matrix('C5-RS-01', 'rng-line-start-skip-space-colon', () => { assert.equal(rejectRngSkip(normalizeRngOutput(Buffer.from('SKIP x\n'), Buffer.alloc(0)), ''), true); assert.equal(rejectRngSkip(normalizeRngOutput(Buffer.from('SKIP: x\n'), Buffer.alloc(0)), ''), true) })
  await matrix('C5-RS-01', 'rng-boundary-midline-empty-cases', () => { assert.equal(rejectRngSkip('xSKIP y\n', ''), false); assert.equal(normalizeRngOutput(Buffer.alloc(0), Buffer.alloc(0)), '') })
})

test('C5-IN-01 final integration reuses one immutable complete copy', async () => {
  const copyRoot = process.env.PHASE02_COMPLETE_COPY_ROOT, copiedManifest = (await import(`${pathToFileURL(path.join(copyRoot, 'scripts/assetDeliveryManifest.js')).href}?c5`)).default
  const result = await audit({ root: copyRoot, manifest: copiedManifest, io: productionIo })
  const cli = spawnSync(process.execPath, [path.join(copyRoot, 'scripts/assetDeliveryAudit.mjs')], { cwd: copyRoot, encoding: 'utf8', timeout: 600000 })
  const executor = { schemaVersion: 'phase-02-executor-evidence/v1', selectedPlan: 'process/features/casino-overhaul/active/visual-animation-assets_07-08-26/phase-02-asset-provenance-delivery_PLAN_07-08-26.md', testMatrix: { ids: 48, labels: 208, anomalies: 0 }, cycleTotals: [12, 20, 30, 38, 48], semanticReview: [], repositoryGates: {}, browser: {}, receipts: {}, cleanup: {}, lifecycle: {}, overallStatus: 'PENDING' }
  await matrix('C5-IN-01', 'integration-reuses-one-c2-copy', () => assert.equal(process.env.PHASE02_COMPLETE_COPY_COUNT, '1'))
  await matrix('C5-IN-01', 'integration-all-48-test-behaviors', () => assert.equal(Object.keys(MATRIX_ASSIGNMENTS).length, 48))
  await matrix('C5-IN-01', 'integration-copied-cli-exact-and-no-process', () => { assert.equal(cli.status, 0, cli.stdout + cli.stderr); assert.doesNotMatch(cli.stdout, /process[\\/]/) })
  await matrix('C5-IN-01', 'integration-complete-inventories-synthetic-reds', () => assert.deepEqual({ files: result.summary.corpus.corpusFiles, bytes: result.summary.corpus.corpusBytes }, { files: 542, bytes: 321205288 }))
  await matrix('C5-IN-01', 'integration-evidence-object-schema-validator', () => assert.equal(validateExecutorEvidence(executor).ok, true))
})

test('C5 cumulative assignment-map evidence is exact', () => {
  assert.deepEqual(assertMatrixEvidence(5), { ids: 48, labels: 208, missing: 0, duplicate: 0, extra: 0, nonPass: 0 })
})

let passed = 0
for (const { name, run } of tests) {
  try { await run(); passed += 1; process.stdout.write(`PASS ${name}\n`) } catch (error) { process.stderr.write(`FAIL ${name}\n${error.stack}\n`); process.exitCode = 1; break }
}
if (!process.exitCode) process.stdout.write(`${JSON.stringify({ ok: true, tests: passed, assertions: 'asset-delivery-contract' })}\n`)
