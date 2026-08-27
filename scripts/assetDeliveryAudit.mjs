import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, open, opendir, readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const LIMITS = Object.freeze({ yields: 2048, state: 2048, directories: 512, files: 1024, corpusBytes: 402653184, visualFile: 8388608, header: 65536, sourceFile: 1048576, sourceTotal: 4194304, evidenceFile: 1048576, evidenceTotal: 8388608, evidence: 256, diagnostics: 128, hashChunk: 65536, string: 512, code: 256, depth: 8 })
const VISUAL_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif'])
const PROVENANCE = new Set(['ai-generated-clone-owned', 'locally-procedural', 'third-party-attributed', 'user-provided-recorded', 'external-network-existing', 'unknown-retained'])
const FORMAT_BY_EXTENSION = new Map([['.png', 'png'], ['.jpg', 'jpg'], ['.jpeg', 'jpeg'], ['.webp', 'webp'], ['.gif', 'gif'], ['.svg', 'svg'], ['.avif', 'avif']])
const utf8Compare = (left, right) => Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))
const hash = value => createHash('sha256').update(value).digest('hex')
const slash = value => value.replace(/\\/g, '/')

function truncateUtf8(value, limit = LIMITS.string) {
  if (typeof value !== 'string') return 'invalid diagnostic detail'
  const bytes = Buffer.from(value, 'utf8')
  if (bytes.length <= limit) return value
  let end = limit
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end -= 1
  return bytes.subarray(0, end).toString('utf8')
}

export function normalizeDiagnostic(code, logicalPath, detail) {
  const safeCode = typeof code === 'string' && Buffer.byteLength(code) <= LIMITS.code && /^[A-Z][A-Z0-9_]*$/.test(code) ? code : 'INVALID_DIAGNOSTIC'
  const safePath = logicalPath === undefined ? undefined : normalizeLogical(logicalPath, { leadingSlash: typeof logicalPath === 'string' && logicalPath.startsWith('/') }) ?? 'invalid-path'
  const diagnostic = { code: safeCode }
  if (safePath !== undefined) diagnostic.path = safePath
  if (detail !== undefined) diagnostic.detail = truncateUtf8(detail)
  return diagnostic
}

function normalizeLogical(value, { leadingSlash = false } = {}) {
  if (typeof value !== 'string' || !value || Buffer.byteLength(value) > LIMITS.string || value.includes('\0') || value.includes('\\')) return null
  if (/^[A-Za-z]:/.test(value) || value.startsWith('//')) return null
  if (leadingSlash !== value.startsWith('/')) return null
  const body = leadingSlash ? value.slice(1) : value
  const parts = body.split('/')
  if (!body || parts.some(part => !part || part === '.' || part === '..' || Buffer.byteLength(part) > LIMITS.string)) return null
  return value
}

function contained(root, target, pathApi = path) {
  const rootValue = process.platform === 'win32' ? pathApi.resolve(root).toLowerCase() : pathApi.resolve(root)
  const targetValue = process.platform === 'win32' ? pathApi.resolve(target).toLowerCase() : pathApi.resolve(target)
  const relative = pathApi.relative(rootValue, targetValue)
  return relative === '' || (!pathApi.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${pathApi.sep}`))
}

export function createDiagnosticCollector() {
  const values = []
  const add = (code, logicalPath, detail) => values.push(normalizeDiagnostic(code, logicalPath, detail))
  const finish = () => {
    const normalized = values.map(value => normalizeDiagnostic(value.code, value.path, value.detail))
    normalized.sort((a, b) => utf8Compare(a.code, b.code) || utf8Compare(a.path ?? '', b.path ?? '') || utf8Compare(a.detail ?? '', b.detail ?? ''))
    const unique = []
    const seen = new Set()
    for (const value of normalized) {
      const tuple = JSON.stringify([value.code, value.path ?? '', value.detail ?? ''])
      if (!seen.has(tuple)) { seen.add(tuple); unique.push(value) }
    }
    if (unique.length > LIMITS.diagnostics - 1) return [...unique.slice(0, LIMITS.diagnostics - 1), { code: 'DIAGNOSTIC_LIMIT_EXCEEDED', detail: 'diagnostic limit exceeded' }]
    return unique
  }
  return { add, finish }
}

const makeCollector = createDiagnosticCollector

export const productionIo = Object.freeze({ lstat, realpath, opendir, readFile, createReadStream, path })

export async function createContainedFileResolver({ root, io = productionIo, collector = makeCollector() }) {
  let rootReal
  try { rootReal = await io.realpath(root) } catch (error) { collector.add(error?.code === 'ENOENT' ? 'MISSING_FILE' : 'FILESYSTEM_READ_FAILED', '.', 'containment root unavailable'); return async () => null }
  return async (logicalPath, { caseInsensitive = process.platform === 'win32', verify } = {}) => {
    const logical = normalizeLogical(logicalPath)
    if (!logical) { collector.add('INVALID_LOGICAL_PATH', 'invalid', 'invalid logical path'); return null }
    const parts = logical.split('/')
    let absolute = root
    for (let index = 0; index < parts.length; index += 1) {
      absolute = io.path.join(absolute, parts[index])
      let stat
      let resolved
      try { stat = await io.lstat(absolute) } catch (error) { collector.add(error?.code === 'ENOENT' ? 'MISSING_FILE' : 'FILESYSTEM_READ_FAILED', logical, 'filesystem read failed'); return null }
      if (stat.isSymbolicLink?.()) { collector.add('SYMLINK_OR_JUNCTION', logical, 'alias is not allowed'); return null }
      if (index < parts.length - 1 && !stat.isDirectory?.()) { collector.add('UNSUPPORTED_FILE_TYPE', logical, 'ancestor directory required'); return null }
      if (index === parts.length - 1 && !stat.isFile?.()) { collector.add('UNSUPPORTED_FILE_TYPE', logical, 'regular file required'); return null }
      try { resolved = await io.realpath(absolute) } catch (error) { collector.add(error?.code === 'ENOENT' ? 'MISSING_FILE' : 'FILESYSTEM_READ_FAILED', logical, 'filesystem read failed'); return null }
      const fold = value => caseInsensitive ? io.path.resolve(value).toLowerCase() : io.path.resolve(value)
      const relative = io.path.relative(fold(rootReal), fold(resolved))
      if (relative === '..' || relative.startsWith(`..${io.path.sep}`) || io.path.isAbsolute(relative)) { collector.add('OUTSIDE_VISUAL_ROOT', logical, 'resolved path escapes containment root'); return null }
    }
    if (verify && await verify(absolute) !== true) { collector.add('FILESYSTEM_READ_FAILED', logical, 'file changed during resolution'); return null }
    try {
      const finalStat = await io.lstat(absolute)
      const finalReal = await io.realpath(absolute)
      if (finalStat.isSymbolicLink?.() || !finalStat.isFile?.()) { collector.add(finalStat.isSymbolicLink?.() ? 'SYMLINK_OR_JUNCTION' : 'UNSUPPORTED_FILE_TYPE', logical, 'file changed during resolution'); return null }
      const fold = value => caseInsensitive ? io.path.resolve(value).toLowerCase() : io.path.resolve(value)
      const relative = io.path.relative(fold(rootReal), fold(finalReal))
      if (relative === '..' || relative.startsWith(`..${io.path.sep}`) || io.path.isAbsolute(relative)) { collector.add('OUTSIDE_VISUAL_ROOT', logical, 'resolved path escapes containment root'); return null }
    } catch (error) { collector.add(error?.code === 'ENOENT' ? 'MISSING_FILE' : 'FILESYSTEM_READ_FAILED', logical, 'file changed during resolution'); return null }
    return absolute
  }
}

const RECEIPT_CLASSES = Object.freeze(['protected', 'phase01', 'adopted', 'report'])
const ADOPTED_BASELINES = Object.freeze(new Map([
  ['scripts/assetDeliveryManifest.js', Object.freeze({ bytes: 202395, sha256: '84b376bf82f4dda673bc41ab15a8e19aca1daab36d9fa17e5d4b87f0a2a0e8f3' })],
  ['scripts/assetDeliveryAudit.mjs', Object.freeze({ bytes: 26756, sha256: 'f90b9b1d1d4d31d36b00af5f7bee05b43cbc49394601e315fda17175dd0a3f51' })],
  ['scripts/assetDeliveryAudit.test.mjs', Object.freeze({ bytes: 10586, sha256: '07d6c14bc364bf8e095bea5f16d99ea538183c254bcf9a1cf4ff6ce8554616c0' })],
]))
const SHA256_PATTERN = /^[0-9a-f]{64}$/

function receiptStream(records) {
  const seen = new Set()
  const sorted = records.map(record => {
    if (!record || record.path.trim() !== record.path || normalizeLogical(record.path) !== record.path || seen.has(record.path) || !Number.isInteger(record.bytes) || record.bytes < 0 || !SHA256_PATTERN.test(record.sha256)) throw new Error('invalid receipt record')
    seen.add(record.path)
    return record
  }).sort((a, b) => utf8Compare(a.path, b.path))
  return sorted.map(record => `${record.path}\t${record.bytes}\t${record.sha256}\n`).join('')
}

export function createScopeReceipt(input) {
  if (!input || input.normalRows?.length !== 29 || input.allRows?.length !== 31 || input.stagedPaths?.length !== 0 || input.unexpectedPaths?.length !== 0 || input.candidates?.length !== 3) throw new Error('invalid adoption receipt')
  const candidatePaths = new Set()
  for (const candidate of input.candidates) {
    const baseline = ADOPTED_BASELINES.get(candidate?.path)
    if (!candidate || normalizeLogical(candidate.path) !== candidate.path || candidatePaths.has(candidate.path) || !baseline || candidate.bytes !== baseline.bytes || candidate.sha256 !== baseline.sha256) throw new Error('invalid candidate binding')
    candidatePaths.add(candidate.path)
  }
  const classDigests = {}
  const classCounts = {}
  for (const name of RECEIPT_CLASSES) {
    if (!Array.isArray(input.classes?.[name])) throw new Error('invalid receipt class')
    const stream = receiptStream(input.classes[name])
    classDigests[name] = hash(stream)
    classCounts[name] = input.classes[name].length
  }
  if (classCounts.adopted !== 3 || receiptStream(input.candidates) !== receiptStream(input.classes.adopted)) throw new Error('invalid adopted class')
  return { classDigests, classCounts, stagedCount: 0, unexpectedPaths: [] }
}

export async function inspectAdoptedInputs({ root, paths, io = productionIo }) {
  if (!Array.isArray(paths) || paths.length !== 3 || new Set(paths).size !== paths.length) throw new Error('invalid adopted paths')
  const collector = createDiagnosticCollector()
  const resolveFile = await createContainedFileResolver({ root, io, collector })
  const rows = []
  for (const logicalPath of [...paths].sort(utf8Compare)) {
    const absolute = await resolveFile(logicalPath, { kind: 'adopted-input' })
    if (!absolute) throw new Error('invalid adopted input')
    const stat = await io.lstat(absolute)
    const bytes = await io.readFile(absolute)
    const resolved = await io.realpath(absolute)
    rows.push({ path: logicalPath, bytes: bytes.length, sha256: hash(bytes), identity: `${stat.dev ?? ''}:${stat.ino ?? resolved}`, type: 'file', realpath: resolved })
  }
  if (collector.finish().length) throw new Error('invalid adopted input')
  return rows
}

function validSnapshotRows(rows, expected) {
  return Array.isArray(rows) && rows.length === expected && rows.every(row => typeof row === 'string' && row.trim()) && new Set(rows).size === rows.length
}

function validReceiptRow(row) {
  return row && normalizeLogical(row.path) === row.path && Number.isInteger(row.bytes) && row.bytes >= 0 && SHA256_PATTERN.test(row.sha256) && typeof row.identity === 'string' && row.identity && row.type === 'file' && typeof row.realpath === 'string' && row.realpath
}

export function compareScopeReceipts(before, after, { mutablePaths = [] } = {}) {
  const fail = changed => ({ ok: false, changed })
  if (!before || !after || !validSnapshotRows(before.normalRows, 29) || !validSnapshotRows(after.normalRows, 29) || !validSnapshotRows(before.allRows, 31) || !validSnapshotRows(after.allRows, 31) || before.stagedPaths?.length !== 0 || after.stagedPaths?.length !== 0 || before.unexpectedPaths?.length !== 0 || after.unexpectedPaths?.length !== 0) return fail([])
  if (JSON.stringify(before.normalRows) !== JSON.stringify(after.normalRows) || JSON.stringify(before.allRows) !== JSON.stringify(after.allRows)) return fail([])
  const allowed = new Set(mutablePaths)
  if (allowed.size !== 3 || [...allowed].some(value => normalizeLogical(value) !== value)) return fail([])
  const changed = []
  for (const name of RECEIPT_CLASSES) {
    const left = before.classes?.[name]
    const right = after.classes?.[name]
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return fail(changed)
    const leftByPath = new Map(left.map(row => [row.path, row]))
    const rightByPath = new Map(right.map(row => [row.path, row]))
    if (leftByPath.size !== left.length || rightByPath.size !== right.length || [...left, ...right].some(row => !validReceiptRow(row)) || JSON.stringify([...leftByPath.keys()].sort(utf8Compare)) !== JSON.stringify([...rightByPath.keys()].sort(utf8Compare))) return fail(changed)
    for (const [logicalPath, leftRow] of leftByPath) {
      const rightRow = rightByPath.get(logicalPath)
      const stable = leftRow.identity === rightRow.identity && leftRow.type === rightRow.type && leftRow.realpath === rightRow.realpath
      if (!stable) return fail(changed)
      const bytesChanged = leftRow.bytes !== rightRow.bytes || leftRow.sha256 !== rightRow.sha256
      if (bytesChanged) {
        if (name !== 'adopted' || !allowed.has(logicalPath)) return fail(changed)
        changed.push(logicalPath)
      }
    }
  }
  changed.sort(utf8Compare)
  return { ok: true, changed }
}

export async function conditionalRestore({ livePath, backupPath, expectedLive, expectedIdentity, expectedBackup, io = { lstat, realpath, readFile, open } }) {
  let liveStat
  let live
  try {
    liveStat = await io.lstat(livePath)
    if (!liveStat.isFile?.() || liveStat.isSymbolicLink?.()) return { restored: false, collision: true }
    live = await io.readFile(livePath)
  } catch { return { restored: false, collision: true } }
  const identity = `${liveStat.dev}:${liveStat.ino}`
  if (!Buffer.isBuffer(expectedLive) || !live.equals(expectedLive) || expectedIdentity && identity !== expectedIdentity) return { restored: false, collision: true }
  const backupStat = await io.lstat(backupPath)
  if (!backupStat.isFile?.() || backupStat.isSymbolicLink?.()) throw new Error('invalid backup')
  const backup = await io.readFile(backupPath)
  if (expectedBackup && (backup.length !== expectedBackup.bytes || hash(backup) !== expectedBackup.sha256)) throw new Error('backup drift')
  const handle = await io.open(livePath, 'r+')
  try {
    const rebound = await io.lstat(livePath)
    if (`${rebound.dev}:${rebound.ino}` !== identity || !rebound.isFile?.() || rebound.isSymbolicLink?.() || !(await io.readFile(livePath)).equals(expectedLive)) return { restored: false, collision: true }
    await handle.truncate(0)
    const result = await handle.write(backup, 0, backup.length, 0)
    if (result.bytesWritten !== backup.length) throw new Error('incomplete restore')
    await handle.sync()
  } finally { await handle.close() }
  const after = await io.lstat(livePath)
  const restored = await io.readFile(livePath)
  if (`${after.dev}:${after.ino}` !== identity || !restored.equals(backup)) throw new Error('restore verification failed')
  return { restored: true, collision: false }
}

const REPORT_SECTIONS = Object.freeze(['What Was Done', 'What Was Skipped or Deferred', 'Test Gate Outcomes', 'Plan Deviations', 'Test Infra Gaps Found', 'SPEC Achievement', 'SPEC Gaps', 'Closeout Packet', 'Forward Preview'])

export function validatePhaseReport(text) {
  if (typeof text !== 'string' || text.includes('\0') || !text.endsWith('\n') || text.endsWith('\n\n') || /\r/.test(text)) return { ok: false }
  const frontmatter = text.match(/^---\n([\s\S]*?)\n---\n/)
  if (!frontmatter) return { ok: false }
  const rows = frontmatter[1].split('\n')
  const expectedKeys = ['phase', 'date', 'status', 'feature', 'plan']
  const keys = rows.map(row => row.slice(0, row.indexOf(':')))
  if (rows.length !== 5 || JSON.stringify(keys) !== JSON.stringify(expectedKeys) || !/^phase: phase-02-asset-provenance-delivery$/m.test(frontmatter[1]) || !/^date: \d{4}-\d{2}-\d{2}$/m.test(frontmatter[1]) || !/^status: (?:COMPLETE|COMPLETE_WITH_GAPS|BLOCKED)$/m.test(frontmatter[1]) || !/^feature: casino-overhaul$/m.test(frontmatter[1]) || !/^plan: process\/features\/casino-overhaul\/active\/visual-animation-assets_07-08-26\/phase-02-asset-provenance-delivery_PLAN_07-08-26\.md$/m.test(frontmatter[1])) return { ok: false }
  const body = text.slice(frontmatter[0].length)
  if (/`#{2,3} [^`]+`/.test(body)) return { ok: false }
  const h2 = [...body.matchAll(/^## (.+)$/gm)].map(match => match[1])
  const h3 = [...body.matchAll(/^### (.+)$/gm)].map(match => match[1])
  if (JSON.stringify(h2) !== JSON.stringify(REPORT_SECTIONS) || JSON.stringify(h3) !== JSON.stringify(['Test Infra Found', 'Blast Radius Changes', 'Commands to Stay Green', 'Dependency Changes'])) return { ok: false }
  return { ok: true }
}

export function validateTerminalEvidence(value) {
  const keys = ['processPortCleanupAt', 'childCleanupAt', 'backupReverifiedAt', 'restoreAt', 'completeCopyRemovedAt', 'checkpointRemovedAt', 'backupRemovedAt', 'reportRollbackAuthority']
  if (!value || JSON.stringify(Object.keys(value)) !== JSON.stringify(keys) || value.reportRollbackAuthority !== false) return { ok: false }
  const times = keys.slice(0, -1).map(key => Date.parse(value[key]))
  if (times.some(Number.isNaN) || times.some((time, index) => index && time <= times[index - 1])) return { ok: false }
  return { ok: true }
}

export function validateExecutorEvidence(value) {
  const keys = ['schemaVersion', 'selectedPlan', 'testMatrix', 'cycleTotals', 'semanticReview', 'repositoryGates', 'browser', 'receipts', 'cleanup', 'lifecycle', 'overallStatus']
  if (!value || JSON.stringify(Object.keys(value)) !== JSON.stringify(keys) || value.schemaVersion !== 'phase-02-executor-evidence/v1' || value.selectedPlan !== 'process/features/casino-overhaul/active/visual-animation-assets_07-08-26/phase-02-asset-provenance-delivery_PLAN_07-08-26.md') return { ok: false }
  if (value.testMatrix?.ids !== 48 || value.testMatrix?.labels !== 208 || value.testMatrix?.anomalies !== 0 || JSON.stringify(value.cycleTotals) !== JSON.stringify([12, 20, 30, 38, 48]) || !Array.isArray(value.semanticReview) || !['PENDING', 'COMPLETE'].includes(value.overallStatus)) return { ok: false }
  if (['repositoryGates', 'browser', 'receipts', 'cleanup', 'lifecycle'].some(key => !value[key] || typeof value[key] !== 'object' || Array.isArray(value[key]))) return { ok: false }
  return { ok: true }
}

export async function publishPhaseReport(reportPath, text) {
  if (!validatePhaseReport(text).ok) throw new Error('invalid phase report')
  await writeFile(reportPath, text, { encoding: 'utf8', flag: 'wx' })
}

export const normalizeRngOutput = (stdout, stderr) => Buffer.concat([Buffer.from(stdout), Buffer.from(stderr)]).toString('utf8').replace(/\r\n?/g, '\n')
export const rejectRngSkip = (stdout, stderr) => /(^|\n)SKIP(?:\s|:)/.test(`${stdout}${stderr}`)

async function safeClose(handle, logicalPath, collector) {
  if (!handle?.close) return
  try { await handle.close() } catch (error) {
    if (error?.code !== 'ERR_DIR_CLOSED') collector.add('DIRECTORY_CLOSE_FAILED', logicalPath || '.', 'directory close failed')
  }
}

export function advanceTraversalYield(yielded) {
  const next = yielded + 1
  if (next > LIMITS.yields) throw Object.assign(new Error('yield limit exceeded'), { code: 'TRAVERSAL_LIMIT_EXCEEDED' })
  return next
}

export async function collectCorpus({ root, io = productionIo, collector = makeCollector(), resolveFile }) {
  const visualRoot = io.path.join(root, 'public')
  const state = { yielded: 0, classifiedFiles: 0, classifiedDirectories: 0, directoryEnqueues: 0, corpusFiles: 0, corpusBytes: 0 }
  const files = []
  const seen = new Set()
  const queue = [{ absolute: visualRoot, relative: '' }]
  let stop = false
  let visualReal
  try { visualReal = await io.realpath(visualRoot) } catch (error) { collector.add(error?.code === 'ENOENT' ? 'MISSING_FILE' : 'FILESYSTEM_READ_FAILED', 'public', 'visual root unavailable'); return { ...state, files } }
  while (queue.length && !stop) {
    const directory = queue.shift()
    let handle
    try {
      handle = await io.opendir(directory.absolute)
      try {
        for await (const entry of handle) {
          try { state.yielded = advanceTraversalYield(state.yielded) } catch { collector.add('TRAVERSAL_LIMIT_EXCEEDED', directory.relative || 'public', 'yield limit exceeded'); stop = true; break }
          if (!entry || typeof entry.name !== 'string') { collector.add('INVALID_LOGICAL_PATH', directory.relative || 'public', 'invalid directory entry'); stop = true; break }
          const name = entry.name
          if (!normalizeLogical(name) || name.includes('/')) { collector.add('INVALID_LOGICAL_PATH', slash(io.path.join(directory.relative, name || 'invalid')), 'invalid basename'); stop = true; break }
          const relative = slash(directory.relative ? `${directory.relative}/${name}` : name)
          if (Buffer.byteLength(relative) > LIMITS.string || seen.has(relative)) { collector.add(Buffer.byteLength(relative) > LIMITS.string ? 'INVALID_LOGICAL_PATH' : 'TRAVERSAL_LIMIT_EXCEEDED', relative.slice(0, LIMITS.string), 'invalid or duplicate path'); stop = true; break }
          seen.add(relative)
          if (seen.size > LIMITS.state) { collector.add('TRAVERSAL_LIMIT_EXCEEDED', relative, 'state limit exceeded'); stop = true; break }
          const absolute = io.path.join(directory.absolute, name)
          let stat
          let resolved
          try { stat = await io.lstat(absolute); resolved = await io.realpath(absolute) } catch (error) { collector.add(error?.code === 'ENOENT' ? 'MISSING_FILE' : 'FILESYSTEM_READ_FAILED', `public/${relative}`, 'filesystem read failed'); stop = true; break }
          if (stat.isSymbolicLink?.()) { collector.add('SYMLINK_OR_JUNCTION', `public/${relative}`, 'alias is not allowed'); stop = true; break }
          if (!contained(visualReal, resolved, io.path)) { collector.add('OUTSIDE_VISUAL_ROOT', `public/${relative}`, 'resolved path escapes visual root'); stop = true; break }
          if (stat.isDirectory?.()) {
            if (state.directoryEnqueues >= LIMITS.directories - 1) { collector.add('TRAVERSAL_LIMIT_EXCEEDED', `public/${relative}`, 'directory limit exceeded'); stop = true; break }
            state.classifiedDirectories += 1
            state.directoryEnqueues += 1
            queue.push({ absolute, relative })
            continue
          }
          if (!stat.isFile?.()) { collector.add('UNSUPPORTED_FILE_TYPE', `public/${relative}`, 'unsupported file type'); stop = true; break }
          state.classifiedFiles += 1
          if (state.classifiedFiles > LIMITS.files) { collector.add('TRAVERSAL_LIMIT_EXCEEDED', `public/${relative}`, 'file limit exceeded'); stop = true; break }
          const extension = io.path.extname(name).toLowerCase()
          const audio = relative === 'audio' || relative.startsWith('audio/')
          if (!audio && VISUAL_EXTENSIONS.has(extension)) {
            if (stat.size > LIMITS.visualFile) { collector.add('READ_LIMIT_EXCEEDED', `public/${relative}`, 'visual file limit exceeded'); stop = true; break }
            state.corpusFiles += 1
            state.corpusBytes += stat.size
            if (state.corpusBytes > LIMITS.corpusBytes) { collector.add('READ_LIMIT_EXCEEDED', `public/${relative}`, 'corpus byte limit exceeded'); stop = true; break }
            const resolvedFile = resolveFile ? await resolveFile(`public/${relative}`, { kind: 'corpus' }) : absolute
            if (!resolvedFile) { stop = true; break }
            files.push({ canonicalPublicPath: `public/${relative}`, url: `/${relative}`, bytes: stat.size, extension, absolute: resolvedFile })
          }
        }
      } finally { await safeClose(handle, directory.relative ? `public/${directory.relative}` : 'public', collector) }
    } catch (error) {
      collector.add(error?.code === 'ENOENT' ? 'MISSING_FILE' : 'FILESYSTEM_READ_FAILED', directory.relative ? `public/${directory.relative}` : 'public', 'directory read failed')
      if (handle) await safeClose(handle, directory.relative ? `public/${directory.relative}` : 'public', collector)
      stop = true
    }
  }
  files.sort((a, b) => utf8Compare(a.canonicalPublicPath, b.canonicalPublicPath))
  return { ...state, files }
}

export async function readBounded(io, absolute, limit, code, logicalPath, collector) {
  let stat
  try { stat = await io.lstat(absolute) } catch (error) { collector.add(error?.code === 'ENOENT' ? 'MISSING_FILE' : 'FILESYSTEM_READ_FAILED', logicalPath, 'filesystem read failed'); return null }
  if (stat.isSymbolicLink?.()) { collector.add('SYMLINK_OR_JUNCTION', logicalPath, 'alias is not allowed'); return null }
  if (!stat.isFile?.()) { collector.add('UNSUPPORTED_FILE_TYPE', logicalPath, 'regular file required'); return null }
  if (stat.size > limit) { collector.add(code, logicalPath, 'read limit exceeded'); return null }
  try { return await io.readFile(absolute) } catch (error) { collector.add(error?.code === 'ENOENT' ? 'MISSING_FILE' : 'FILESYSTEM_READ_FAILED', logicalPath, 'filesystem read failed'); return null }
}

function dimensions(buffer, format) {
  if (format === 'png' && buffer.length >= 24 && buffer.subarray(1, 4).toString() === 'PNG') return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)]
  if (format === 'gif' && buffer.length >= 10 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString())) return [buffer.readUInt16LE(6), buffer.readUInt16LE(8)]
  if (format === 'jpg' || format === 'jpeg') {
    if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null
    let offset = 2
    while (offset + 8 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue }
      const marker = buffer[offset + 1]
      const length = buffer.readUInt16BE(offset + 2)
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) return [buffer.readUInt16BE(offset + 5), buffer.readUInt16BE(offset + 7)]
      if (length < 2) return null
      offset += 2 + length
    }
  }
  return null
}

export function validateManifestBounds(manifest, collector) {
  const arrays = [['records', 155], ['staticOccurrences', 340], ['staticPathCounts', 220], ['dynamic', 4], ['preloadPaths', 155]]
  for (const [key, limit] of arrays) if (!Array.isArray(manifest?.[key]) || manifest[key].length > limit) collector.add('MANIFEST_LIMIT_EXCEEDED', undefined, `${key} limit exceeded`)
  if (!Array.isArray(manifest?.baselines?.groups) || manifest.baselines.groups.length > 61) collector.add('MANIFEST_LIMIT_EXCEEDED', undefined, 'groups limit exceeded')
  if (!Array.isArray(manifest?.evidence?.allowlist) || manifest.evidence.allowlist.length > LIMITS.evidence || !Array.isArray(manifest?.evidence?.inventory) || manifest.evidence.inventory.length > LIMITS.evidence) collector.add('MANIFEST_LIMIT_EXCEEDED', undefined, 'evidence limit exceeded')
  const visit = (value, depth = 0) => {
    if (depth > LIMITS.depth) { collector.add('MANIFEST_LIMIT_EXCEEDED', undefined, 'nested depth exceeded'); return }
    if (typeof value === 'string' && Buffer.byteLength(value) > (depth > 2 && value.includes('\n') ? LIMITS.sourceFile : LIMITS.string)) collector.add('MANIFEST_LIMIT_EXCEEDED', undefined, 'string limit exceeded')
    if (Array.isArray(value)) for (const child of value) visit(child, depth + 1)
    else if (value && typeof value === 'object') for (const child of Object.values(value)) visit(child, depth + 1)
  }
  visit(manifest)
}

export async function validateStaticRecords({ root, manifest, io = productionIo, collector = makeCollector(), resolveFile }) {
  const records = new Map()
  let staticBytes = 0
  let largest = 0
  for (const record of manifest.records ?? []) {
    const logical = normalizeLogical(record?.path, { leadingSlash: true })
    if (!logical || records.has(logical)) { collector.add('INVALID_STATIC_WITNESS', logical ?? '/invalid', 'invalid or duplicate record'); continue }
    records.set(logical, record)
    const extension = io.path.extname(logical).toLowerCase()
    if (!VISUAL_EXTENSIONS.has(extension)) { collector.add('UNSUPPORTED_EXTENSION', logical, 'unsupported extension'); continue }
    if (logical.startsWith('/audio/')) { collector.add('AUDIO_PATH', logical, 'audio is excluded'); continue }
    const absolute = resolveFile ? await resolveFile(`public/${logical.slice(1)}`, { kind: 'static' }) : io.path.join(root, 'public', ...logical.slice(1).split('/'))
    const buffer = absolute ? await readBounded(io, absolute, LIMITS.visualFile, 'READ_LIMIT_EXCEEDED', logical, collector) : null
    if (!buffer) continue
    const expectedFormat = FORMAT_BY_EXTENSION.get(extension)
    if (record.format !== expectedFormat) collector.add('FORMAT_MISMATCH', logical, 'format does not match extension')
    if (buffer.length !== record.bytes) collector.add('BYTE_MISMATCH', logical, 'byte count mismatch')
    if (hash(buffer) !== record.sha256) collector.add('SHA256_MISMATCH', logical, 'sha256 mismatch')
    const parsed = dimensions(buffer, record.format)
    if (['svg', 'avif', 'webp'].includes(record.format) && record.dimensions !== null) collector.add('UNPARSED_DIMENSION_CLAIM', logical, 'unsupported dimension claim')
    if (parsed && (!Array.isArray(record.dimensions) || parsed[0] !== record.dimensions[0] || parsed[1] !== record.dimensions[1])) collector.add('DIMENSION_MISMATCH', logical, 'dimension mismatch')
    if (!PROVENANCE.has(record.provenanceStatus)) collector.add('INVALID_PROVENANCE_RECORD', logical, 'unsupported provenance status')
    if (record.newUse && (record.provenanceStatus === 'unknown-retained' || record.fallback === 'unknown')) collector.add('UNKNOWN_NEW_USE', logical, 'unknown provenance cannot be new use')
    if (!manifest.policy?.fallbackAllowlist?.includes(record.fallback)) collector.add('INVALID_FALLBACK', logical, 'fallback is not allowed')
    if (record.provenanceStatus !== 'unknown-retained' && !record.evidenceRefs?.length) collector.add('INVALID_PROVENANCE_RECORD', logical, 'non-unknown provenance requires evidence')
    staticBytes += record.bytes
    largest = Math.max(largest, record.bytes)
  }
  const occurrenceKeys = new Set()
  const countedPairs = new Map()
  for (const row of manifest.staticOccurrences ?? []) {
    const source = normalizeLogical(row?.source)
    const logical = normalizeLogical(row?.path, { leadingSlash: true })
    const key = `${source}\0${row?.line}\0${logical}`
    if (!source || !logical || !Number.isInteger(row.line) || row.line < 1 || occurrenceKeys.has(key) || !records.has(logical)) { collector.add('INVALID_STATIC_WITNESS', logical ?? '/invalid', 'invalid occurrence'); continue }
    occurrenceKeys.add(key)
    const pair = `${source}\0${logical}`
    countedPairs.set(pair, (countedPairs.get(pair) ?? 0) + 1)
  }
  const expectedPairs = new Map()
  for (const row of manifest.staticPathCounts ?? []) {
    const source = normalizeLogical(row?.source)
    const logical = normalizeLogical(row?.path, { leadingSlash: true })
    const key = `${source}\0${logical}`
    if (!source || !logical || !Number.isInteger(row.expectedCount) || row.expectedCount < 1 || expectedPairs.has(key)) collector.add('INVALID_STATIC_WITNESS', logical ?? '/invalid', 'invalid static path count')
    else expectedPairs.set(key, row.expectedCount)
  }
  if (occurrenceKeys.size !== 340 || expectedPairs.size !== 220 || records.size !== 155 || [...expectedPairs].some(([key, count]) => countedPairs.get(key) !== count) || [...countedPairs].some(([key, count]) => expectedPairs.get(key) !== count)) collector.add('INVALID_STATIC_WITNESS', undefined, 'frozen witness ratchet mismatch')
  const groups = []
  for (const baseline of manifest.baselines?.groups ?? []) {
    const members = [...records.values()].filter(record => record.consumerGroups?.includes(baseline.group))
    const bytes = members.reduce((sum, record) => sum + record.bytes, 0)
    groups.push({ group: baseline.group, kind: baseline.kind, assetCount: members.length, budgetBytes: bytes })
    if (members.length !== baseline.assetCount || bytes !== baseline.budgetBytes) collector.add('GROUP_BUDGET_BREACH', undefined, `group baseline mismatch: ${baseline.group}`)
  }
  if (staticBytes !== manifest.baselines?.staticBytes) collector.add('GLOBAL_BUDGET_BREACH', undefined, 'global static budget mismatch')
  if (largest !== manifest.baselines?.largestAssetBytes) collector.add('LARGEST_ASSET_BUDGET_BREACH', undefined, 'largest asset budget mismatch')
  const preload = manifest.preloadPaths ?? []
  if (new Set(preload).size !== preload.length) collector.add('PRELOAD_BUDGET_BREACH', undefined, 'duplicate preload path')
  let preloadBytes = 0
  for (const logical of preload) {
    const matches = [...records.values()].filter(record => record.path === logical)
    if (matches.length !== 1) collector.add('PRELOAD_BUDGET_BREACH', logical, 'preload path must match one record')
    else preloadBytes += matches[0].bytes
  }
  if (preloadBytes !== manifest.policy?.preloadBudgetBytes) collector.add('PRELOAD_BUDGET_BREACH', undefined, 'preload byte budget mismatch')
  return { records, staticBytes, largest, groups, preloadBytes }
}

export async function validateDynamicDeclarations({ root, manifest, records, io = productionIo, collector = makeCollector(), resolveFile }) {
  const expectedNames = ['poker-bot-avatars', 'poker-race-avatars', 'slot-covers', 'slot-rank-art']
  const expectedPathDigests = ['d0026c44e44753e5768cd3287263b01dbee7cf2ca42438e31324cb9aebc3183c', 'd0026c44e44753e5768cd3287263b01dbee7cf2ca42438e31324cb9aebc3183c', '77b64d29860921354768faa33b5bbd77bb53a1f742d695e5902becfb263c01a2', '2ae2ecefc4144d7adccd3450037a90fa350d1b8e25c945c3f732996e8020a940']
  const expectedGuardDigests = ['05cd41747050d30b8ab19ce4195fa973e4616621dc5fc9c1d2371f6e84af13d1', 'e744b9f1b65eb8d29262b965ee4674f7ed835c37d70cf79dcf32c1cd5d8ed04d', 'd5b4bddfb1a6bff65b4353c3751a0df82b9d5c2efdb96dd86e6e08c4f0b7ad65', 'fba825fb8ecc1db20d7ac40d91c9240cd1e7f46d992dbf28d053ef30f3595dfa']
  const unique = new Set()
  let paths = 0
  let sourceBytes = 0
  for (let index = 0; index < (manifest.dynamic ?? []).length; index += 1) {
    const declaration = manifest.dynamic[index]
    if (declaration?.name !== expectedNames[index] || !Array.isArray(declaration.paths)) { collector.add('DYNAMIC_EXPANSION_INVALID', undefined, 'dynamic declaration identity mismatch'); continue }
    if (hash(declaration.paths.map(logical => `${logical}\n`).join('')) !== expectedPathDigests[index]) collector.add('DYNAMIC_EXPANSION_INVALID', undefined, 'dynamic declaration membership mismatch')
    const guardStream = (declaration.guards ?? []).map(guard => `${JSON.stringify([guard.source, guard.startAnchor, guard.endAnchor, guard.requiredTokens, guard.span, guard.sha256])}\n`).join('')
    if (hash(guardStream) !== expectedGuardDigests[index]) collector.add('SOURCE_AUTHORITY_DRIFT', undefined, 'source guard identity mismatch')
    const local = new Set()
    for (const logical of declaration.paths) {
      if (!normalizeLogical(logical, { leadingSlash: true }) || logical.startsWith('/audio/') || !VISUAL_EXTENSIONS.has(io.path.extname(logical).toLowerCase())) collector.add('DYNAMIC_EXPANSION_INVALID', logical ?? '/invalid', 'invalid dynamic path')
      if (local.has(logical)) collector.add('DYNAMIC_DUPLICATE', logical, 'duplicate dynamic path')
      local.add(logical); unique.add(logical); paths += 1
    }
    for (const guard of declaration.guards ?? []) {
      const source = normalizeLogical(guard?.source)
      if (!source || !guard.startAnchor || !guard.endAnchor || !Array.isArray(guard.requiredTokens)) { collector.add('SOURCE_AUTHORITY_DRIFT', source ?? 'invalid', 'invalid source guard'); continue }
      const absolute = resolveFile ? await resolveFile(source, { kind: 'source-authority' }) : io.path.join(root, ...source.split('/'))
      const buffer = absolute ? await readBounded(io, absolute, LIMITS.sourceFile, 'READ_LIMIT_EXCEEDED', source, collector) : null
      if (!buffer) continue
      sourceBytes += buffer.length
      if (sourceBytes > LIMITS.sourceTotal) { collector.add('READ_LIMIT_EXCEEDED', source, 'aggregate source limit exceeded'); continue }
      const text = buffer.toString('utf8').replace(/\r\n?/g, '\n')
      const starts = text.split(guard.startAnchor).length - 1
      const ends = text.split(guard.endAnchor).length - 1
      const start = text.indexOf(guard.startAnchor)
      const end = text.indexOf(guard.endAnchor, start + guard.startAnchor.length)
      const span = start >= 0 && end > start ? text.slice(start, end) : ''
      const tokenOk = guard.requiredTokens.every(token => span.includes(token))
      if (starts !== 1 || ends !== 1 || !span || !tokenOk || span !== guard.span || hash(span) !== guard.sha256) collector.add('SOURCE_AUTHORITY_DRIFT', source, 'source authority drift')
    }
  }
  const staticUrls = new Set(records.keys())
  let unionBytes = 0
  const union = new Set([...staticUrls, ...unique])
  for (const logical of union) {
    const record = records.get(logical)
    if (record) { unionBytes += record.bytes; continue }
    const absolute = resolveFile ? await resolveFile(`public/${logical.slice(1)}`, { kind: 'dynamic-only' }) : io.path.join(root, 'public', ...logical.slice(1).split('/'))
    const buffer = absolute ? await readBounded(io, absolute, LIMITS.visualFile, 'READ_LIMIT_EXCEEDED', logical, collector) : null
    if (buffer) unionBytes += buffer.length
  }
  return { declarations: manifest.dynamic?.length ?? 0, paths, uniquePaths: unique.size, staticOverlapPaths: [...unique].filter(value => staticUrls.has(value)).length, dynamicOnlyPaths: [...unique].filter(value => !staticUrls.has(value)).length, unionPaths: union.size, unionBytes }
}

export async function validateEvidence({ root, manifest, io = productionIo, collector = makeCollector(), resolveFile }) {
  if (!resolveFile) resolveFile = await createContainedFileResolver({ root, io, collector })
  const allowlist = manifest.evidence?.allowlist ?? []
  const inventory = manifest.evidence?.inventory ?? []
  const allowed = new Set()
  const inventoried = new Map()
  for (const logical of allowlist) {
    const normalized = normalizeLogical(logical)
    if (!normalized || normalized.startsWith('process/') || allowed.has(normalized)) collector.add('EVIDENCE_REFERENCE_MISSING', normalized ?? 'invalid', 'invalid or duplicate evidence allowlist')
    else allowed.add(normalized)
  }
  for (const item of inventory) {
    const normalized = normalizeLogical(item?.path)
    if (!normalized || normalized.startsWith('process/') || inventoried.has(normalized)) collector.add('EVIDENCE_REFERENCE_MISSING', normalized ?? 'invalid', 'invalid or duplicate evidence inventory')
    else inventoried.set(normalized, item)
  }
  if ([...allowed].some(value => !inventoried.has(value)) || [...inventoried].some(([value]) => !allowed.has(value))) collector.add('EVIDENCE_REFERENCE_MISSING', undefined, 'evidence allowlist inventory mismatch')
  let aggregate = 0
  for (const [logical, item] of inventoried) {
    const absolute = resolveFile ? await resolveFile(logical, { kind: 'evidence' }) : io.path.join(root, ...logical.split('/'))
    const buffer = absolute ? await readBounded(io, absolute, LIMITS.evidenceFile, 'READ_LIMIT_EXCEEDED', logical, collector) : null
    if (!buffer) continue
    aggregate += buffer.length
    if (aggregate > LIMITS.evidenceTotal) collector.add('READ_LIMIT_EXCEEDED', logical, 'aggregate evidence limit exceeded')
    if (buffer.length !== item.bytes || hash(buffer) !== item.sha256) collector.add('EVIDENCE_REFERENCE_MISSING', logical, 'evidence inventory mismatch')
  }
  for (const record of manifest.records ?? []) for (const reference of record.evidenceRefs ?? []) if (!allowed.has(reference)) collector.add('EVIDENCE_REFERENCE_MISSING', reference, 'unresolved evidence reference')
  return { allowlist: allowed.size, inventory: inventoried.size }
}

export function validateSemanticEvidence(rows, expected, { requireComplete = false } = {}) {
  const fail = () => {
    if (requireComplete) throw new Error('semantic evidence incomplete')
    return { ok: false }
  }
  if (!Array.isArray(rows) || !Array.isArray(expected) || rows.length !== expected.length) return fail()
  const expectedByPath = new Map()
  for (const item of expected) {
    if (!item || normalizeLogical(item.evidencePath) !== item.evidencePath || !Array.isArray(item.declaredRecordPaths) || expectedByPath.has(item.evidencePath)) return fail()
    const paths = [...item.declaredRecordPaths].sort(utf8Compare)
    if (paths.some(value => normalizeLogical(value, { leadingSlash: true }) !== value) || new Set(paths).size !== paths.length) return fail()
    expectedByPath.set(item.evidencePath, paths)
  }
  const seen = new Set()
  for (const row of rows) {
    if (!row || Object.keys(row).sort().join(',') !== 'coverage,declaredRecordCount,declaredRecordPaths,evidencePath,note,reviewedAt,reviewer' || seen.has(row.evidencePath) || !expectedByPath.has(row.evidencePath)) return fail()
    seen.add(row.evidencePath)
    const paths = Array.isArray(row.declaredRecordPaths) ? [...row.declaredRecordPaths].sort(utf8Compare) : []
    if (row.declaredRecordCount !== paths.length || JSON.stringify(paths) !== JSON.stringify(expectedByPath.get(row.evidencePath)) || row.coverage !== 'covered' || typeof row.reviewer !== 'string' || !row.reviewer || typeof row.note !== 'string' || !row.note || Number.isNaN(Date.parse(row.reviewedAt))) return fail()
  }
  return { ok: true }
}

export function corpusFingerprint(files) {
  const sorted = [...files].sort((a, b) => utf8Compare(a.canonicalPublicPath, b.canonicalPublicPath))
  const stream = sorted.map(file => `${file.canonicalPublicPath}\t${file.bytes}\t${file.sha256}\n`).join('')
  return { stream, treeSha256: hash(stream) }
}

export async function audit({ root, manifest, io = productionIo }) {
  const collector = makeCollector()
  const baseSummary = { corpus: null, static: null, dynamic: null, groups: [] }
  try {
    validateManifestBounds(manifest, collector)
    const resolveFile = await createContainedFileResolver({ root, io, collector })
    const collected = await collectCorpus({ root, io, collector, resolveFile })
    for (const file of collected.files) {
      const buffer = await readBounded(io, file.absolute, LIMITS.visualFile, 'READ_LIMIT_EXCEEDED', file.url, collector)
      file.sha256 = buffer ? hash(buffer) : ''
    }
    const fingerprint = corpusFingerprint(collected.files)
    const formats = Object.fromEntries([...new Set([...VISUAL_EXTENSIONS])].map(extension => [extension, collected.files.filter(file => file.extension === extension).length]))
    baseSummary.corpus = { yielded: collected.yielded, classifiedFiles: collected.classifiedFiles, classifiedDirectories: collected.classifiedDirectories, directoryEnqueues: collected.directoryEnqueues, corpusFiles: collected.corpusFiles, corpusBytes: collected.corpusBytes, formats, treeSha256: fingerprint.treeSha256 }
    const expected = manifest.corpus
    if (collected.corpusFiles !== expected?.expectedCount || collected.corpusBytes !== expected?.expectedBytes || fingerprint.treeSha256 !== expected?.treeSha256 || Object.entries(expected?.expectedFormats ?? {}).some(([extension, count]) => formats[extension] !== count)) collector.add('CORPUS_DRIFT', undefined, 'corpus fingerprint mismatch')
    const staticResult = await validateStaticRecords({ root, manifest, io, collector, resolveFile })
    baseSummary.static = { occurrences: manifest.staticOccurrences?.length ?? 0, pairs: manifest.staticPathCounts?.length ?? 0, records: staticResult.records.size, bytes: staticResult.staticBytes, preloadPaths: manifest.preloadPaths?.length ?? 0, preloadBytes: staticResult.preloadBytes }
    baseSummary.groups = staticResult.groups
    baseSummary.dynamic = await validateDynamicDeclarations({ root, manifest, records: staticResult.records, io, collector, resolveFile })
    await validateEvidence({ root, manifest, io, collector, resolveFile })
  } catch { collector.add('FILESYSTEM_READ_FAILED', undefined, 'audit failed') }
  const diagnostics = collector.finish()
  return { ok: diagnostics.length === 0, diagnostics, summary: baseSummary }
}

export function formatResult(result) {
  const lines = result.diagnostics.map(diagnostic => JSON.stringify(diagnostic))
  lines.push(JSON.stringify(result))
  return `${lines.join('\n')}\n`
}

async function cli() {
  if (process.argv.slice(2).length) {
    const diagnostic = { code: 'INVALID_CLI', detail: 'expected no arguments' }
    process.stdout.write(`${JSON.stringify(diagnostic)}\n${JSON.stringify({ ok: false, diagnostics: [diagnostic], summary: null, bootstrap: true })}\n`)
    process.exitCode = 2
    return
  }
  let manifest
  try { ({ default: manifest } = await import(new URL('./assetDeliveryManifest.js', import.meta.url))) } catch {
    const diagnostic = { code: 'MANIFEST_LOAD_FAILED', detail: 'tracked manifest load failed' }
    process.stdout.write(`${JSON.stringify(diagnostic)}\n${JSON.stringify({ ok: false, diagnostics: [diagnostic], summary: null, bootstrap: true })}\n`)
    process.exitCode = 2
    return
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const result = await audit({ root, manifest, io: productionIo })
  process.stdout.write(formatResult(result))
  process.exitCode = result.ok ? 0 : 1
}

if (pathToFileURL(process.argv[1] ?? '').href === import.meta.url) await cli()
