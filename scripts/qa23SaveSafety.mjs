#!/usr/bin/env node
// Bounded legacy save proof. No app seam, renderer, provider or real profile.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { lstat, mkdir, mkdtemp, open, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = '2eaa558825bc401c1ed667e6fbbb55a00d92413d'
const MAX_BYTES = 32 * 1024 * 1024
const SOURCES = ['src/utils/storage.js', 'src/hooks/useLocalSave.js', 'src/pages/SettingsPage.jsx', 'src/utils/storage.test.js', 'src/hooks/useLocalSave.test.js', 'scripts/qa23SaveSafety.mjs', 'package.json']
const REQUIRED = ['exportHealthy', 'exportEmptyProfile', 'exportAbsent', 'exportRawNull', 'exportM1', 'exportM2', 'exportM2Length', 'exportM3', 'exportEnumeratedNull', 'currentErrorM1', 'currentErrorM2', 'currentErrorM3', 'importConfirmEmpty', 'importConfirmPartial', 'importAddedOnly', 'importSameSizeDifferentKeys', 'importOverlapping', 'importBeforeimageConflict', 'importOversize', 'importSemanticReject', 'importSportsbookReject', 'importIncompleteReject', 'importNoReloadOnFailure', 'importSuccessReload', 'importLegacy', 'importRawNullRestore', 'importMalformed', 'importRemoveFailure', 'importRollbackFailed']
REQUIRED.push(...['importConfirmEmpty', 'importConfirmPartial', 'importAddedOnly', 'importSameSizeDifferentKeys', 'importOverlapping'].map(name => `${name}Accepted`))
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' }
const sleep = ms => new Promise(done => setTimeout(done, ms))
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const managed = map => Object.fromEntries(Object.entries(map).filter(([key]) => key.startsWith('gampo_')))
const writes = calls => calls.filter(call => ['setItem', 'removeItem', 'clear'].includes(call.method) && call.phase === 'action')
const FONT_URLS = ['https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap', 'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&display=swap']
const FLAGS = ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--disable-background-networking', '--disable-component-update', '--disable-default-apps', '--disable-sync', '--disable-features=MediaRouter,OptimizationHints', '--no-proxy-server', '--host-resolver-rules=MAP * ~NOTFOUND,EXCLUDE 127.0.0.1', '--mute-audio', '--remote-debugging-port=0']

function fontRequest(event, owned) {
    return event.session === owned.session && event.target === owned.target && event.stage === 'Request' && event.method === 'GET' && event.type === 'Stylesheet' && !event.redirect && FONT_URLS.includes(event.url)
}

function checkNetwork(ledger) {
    assert(FLAGS.every(flag => ledger.flags.includes(flag)), 'Missing launch containment')
    assert(ledger.guardEnabled < ledger.firstNavigation, 'Guard/preconnect ordering')
    assert.equal(ledger.unexpected.length, 0, 'Unexpected request/target')
    assert.equal(ledger.runtimeErrors.length, 0, 'Console/page error')
    const matched = new Set()
    for (const denial of ledger.denials) {
        assert((ledger.owners || [ledger.owned]).some(owned => fontRequest(denial, owned)), 'Nonliteral font request')
        assert(denial.ack && denial.networkId && denial.requestId, 'Missing denial acknowledgement/correlation')
        const failures = ledger.failures.filter(failure => failure.session === denial.session && failure.requestId === denial.networkId)
        assert.equal(failures.length, 1, 'Missing/duplicate font loading failure')
        const failure = failures[0]
        const inspector = failure.errorText === 'net::ERR_BLOCKED_BY_CLIENT.Inspector'
        assert.equal(failure.canceled, false, 'Canceled font request is not admitted')
        assert(inspector ? failure.blockedReason === 'inspector' : failure.errorText === 'net::ERR_BLOCKED_BY_CLIENT' && failure.blockedReason === undefined, 'Unexpected blocked diagnostic')
        const entries = ledger.logErrors.filter(entry => entry.session === denial.session && entry.networkRequestId === denial.networkId)
        assert.equal(entries.length, 1, 'Missing/duplicate matching font log')
        assert(entries[0].source === 'network' && entries[0].level === 'error' && entries[0].url === denial.url && entries[0].text === `Failed to load resource: ${failure.errorText}`, 'Inconsistent font diagnostic log')
        assert(!matched.has(failures[0]), 'Duplicate denial')
        matched.add(failures[0])
    }
    assert.equal(matched.size, ledger.failures.length, 'Unmatched loading failure')
    for (const entry of ledger.logErrors) {
        const denial = ledger.denials.find(item => item.session === entry.session && item.networkId === entry.networkRequestId && item.url === entry.url && item.ack)
        assert(denial && entry.source === 'network' && entry.level === 'error', 'Unattributed log error')
    }
}

function parseArgs(argv) {
    const args = { selfTest: false }
    for (const arg of argv) {
        if (arg === '--self-test' && !args.selfTest) { args.selfTest = true; continue }
        const match = /^--(browser|dist|out|case)=(.+)$/.exec(arg)
        assert(match && !Object.hasOwn(args, match[1]), `Unknown/duplicate argument: ${arg}`)
        args[match[1]] = match[2]
    }
    if (args.case) assert(!args.selfTest && REQUIRED.includes(args.case), 'Unknown diagnostic case')
    for (const key of args.selfTest ? ['out'] : ['browser', 'dist', 'out']) {
        assert(args[key] && isAbsolute(args[key]) && resolve(args[key]) === args[key], `Pass canonical absolute --${key}`)
    }
    if (!args.selfTest) {
        assert(existsSync(args.browser), 'Browser missing')
        assert(existsSync(join(args.dist, 'index.html')), 'Built index.html missing')
        assert(args.out !== args.dist && !args.out.startsWith(args.dist + sep) && !args.dist.startsWith(args.out + sep), 'Dist/output must be disjoint')
    }
    assert(args.out !== '/' && args.out !== ROOT && !ROOT.startsWith(args.out + sep), 'Unsafe output root')
    return args
}

function checkAction(row) {
    assert.deepEqual(row.after, row.expectedMap, `${row.name}: full raw map`)
    if (row.laterMap && !row.successReload) assert.deepEqual(row.laterMap, row.expectedMap, `${row.name}: delayed raw map`)
    assert(row.observedMs >= 1100, `${row.name}: observation shorter than 1100 ms`)
    assert.equal(row.navigations.length, row.successReload ? 1 : 0, `${row.name}: unwanted/missing navigation`)
    assert.equal(row.runtimeErrors.length, 0, `${row.name}: runtime errors`)
    assert.equal(row.unexpectedNetwork.length, 0, `${row.name}: network leak`)
    if (row.noWrites) assert.deepEqual(writes(row.calls), [], `${row.name}: mutation despite final bytes`)
    if (row.exportData) {
        assert.equal(row.downloads.length, 1, `${row.name}: completed download count`)
        assert.deepEqual(row.downloads[0].parsed.data, row.exportData, `${row.name}: downloaded data`)
        assert.equal(row.downloads[0].parsed.keyCount, Object.keys(row.exportData).length, `${row.name}: downloaded count`)
        assert.equal(row.notice.tone, 'ok', `${row.name}: export notice tone`)
        assert.equal(row.notice.text, `Exported ${Object.keys(row.exportData).length} saved items to a JSON file.`, `${row.name}: export notice count`)
    } else {
        assert.equal(row.downloads.length, 0, `${row.name}: unexpected download`)
        assert.equal(row.downloadEvents.length, 0, `${row.name}: unexpected download event`)
        assert.deepEqual(row.newDownloadFiles, [], `${row.name}: unexpected download file`)
        if (row.error) {
            assert.equal(row.notice.tone, 'err', `${row.name}: current error notice`)
            assert(!/Restored|Exported|Reloading/.test(row.notice.text), `${row.name}: stale success notice`)
        }
        if (row.declined) {
            assert.equal(row.notice.tone, 'ok', `${row.name}: decline notice tone`)
            assert.equal(row.notice.text, 'Import cancelled. Your save was not changed.', `${row.name}: decline must not show restored success`)
        }
        if (row.successReload) {
            assert.equal(row.notice.tone, 'ok', `${row.name}: success notice tone`)
            assert.equal(row.notice.text, `Restored ${row.restored} items. Reloading…`, `${row.name}: success notice`)
            assert(row.navigationDelay >= 850 && row.navigationDelay < 1100, `${row.name}: reload was not the intended 900 ms delay`)
        }
        if (row.dialogExpected) {
            assert.equal(row.dialogs.length, 1, `${row.name}: native confirm count`)
            assert.equal(row.dialogs[0].type, 'confirm', `${row.name}: native confirm type`)
            assert.equal(row.dialogs[0].message, row.dialogExpected, `${row.name}: affected key names`)
        } else if (row.dialogs) assert.equal(row.dialogs.length, 0, `${row.name}: premature/unnecessary consent`)
        if (row.oversize) assert.deepEqual(row.textCalls, [], `${row.name}: oversized File.text was called`)
    }
}

function checkReport(report, required = REQUIRED) {
    for (const name of required) assert(report.rows.some(row => row.name === name), `Missing required scenario: ${name}`)
    assert.equal(new Set(report.rows.map(row => row.name)).size, report.rows.length, 'Duplicate scenario')
    for (const row of report.rows) { checkAction(row); checkScenarioOutcome(row) }
    assert(SOURCES.every(path => report.manifest.source.some(item => item.path === path)), 'Incomplete source manifest')
    assert(report.manifest.dist.length > 0 && report.manifest.dist.some(item => item.path === 'index.html'), 'Incomplete build manifest')
    assert(Object.values(report.cleanup).every(Boolean), 'Cleanup failure')
}

// One shared append-only sink: open wx, serialized writes, drain-or-throw.
// Used by both native() and the self-test so the self-check exercises the same
// routine the native path does, not a copy.
async function openSink(path) {
    const handle = await open(path, 'wx')
    const entries = []
    let chain = Promise.resolve()
    let writeError = null
    let seq = 0
    return {
        path, entries,
        async record(entry) {
            seq += 1
            const row = { hostSeq: seq, receivedAt: Date.now(), ...entry }
            entries.push(row)
            chain = chain.then(async () => {
                if (writeError) return
                try { await handle.write(JSON.stringify(row) + '\n') } catch (error) { writeError = error }
            })
            await chain
            return row
        },
        async drain() { await chain; if (writeError) throw writeError },
        breakHandle() { writeError = new Error('injected pre-write failure') },
        async close() { try { await chain } finally { await handle.close() } },
    }
}


// Small row-level view of the append-only host ledger. Full JSONL stays on disk,
// referenced by hash; hostSeq is arrival order, not cross-process execution order.
function summarizeHostLedger(entries) {
    const documents = new Map()
    const methods = {}
    for (const entry of entries) {
        const payload = entry.payload || {}
        const key = `${payload.doc}|${entry.target || ''}|${entry.session || ''}`
        const doc = documents.get(key) || { doc: payload.doc, target: entry.target, session: entry.session, firstHostSeq: entry.hostSeq, lastHostSeq: entry.hostSeq, entries: 0 }
        doc.lastHostSeq = entry.hostSeq; doc.entries += 1
        documents.set(key, doc)
        methods[payload.method] = (methods[payload.method] || 0) + 1
    }
    return { entries: entries.length, methods, documents: [...documents.values()] }
}
// Scenario-specific required outcomes: a healthy row cannot stand in for a
// rejection, consent, conflict or import scenario. Names are the runner's own.
const SCENARIO_OUTCOMES = {}
for (const name of ['exportHealthy', 'exportEmptyProfile', 'exportAbsent', 'exportRawNull']) SCENARIO_OUTCOMES[name] = { export: true }
for (const name of ['exportM1', 'exportM2', 'exportM2Length', 'exportM3', 'exportEnumeratedNull', 'currentErrorM1', 'currentErrorM2', 'currentErrorM3']) SCENARIO_OUTCOMES[name] = { error: true, noWrites: true }
for (const name of ['importOversize', 'importSemanticReject', 'importSportsbookReject', 'importIncompleteReject', 'importMalformed']) SCENARIO_OUTCOMES[name] = { error: true, noWrites: true }
for (const name of ['importConfirmEmpty', 'importConfirmPartial', 'importAddedOnly', 'importSameSizeDifferentKeys', 'importOverlapping']) SCENARIO_OUTCOMES[name] = { declined: true, dialog: true, noWrites: true }
for (const name of ['importConfirmEmptyAccepted', 'importConfirmPartialAccepted', 'importAddedOnlyAccepted', 'importSameSizeDifferentKeysAccepted', 'importOverlappingAccepted']) SCENARIO_OUTCOMES[name] = { successReload: true, dialog: true }
SCENARIO_OUTCOMES.importBeforeimageConflict = { error: true, conflict: true, noWrites: true }
SCENARIO_OUTCOMES.importNoReloadOnFailure = { error: true, writes: true }
SCENARIO_OUTCOMES.importRemoveFailure = { error: true, writes: true }
SCENARIO_OUTCOMES.importRollbackFailed = { error: true, writes: true }
SCENARIO_OUTCOMES.importLegacy = { successReload: true }
SCENARIO_OUTCOMES.importRawNullRestore = { successReload: true }
SCENARIO_OUTCOMES.importSuccessReload = { successReload: true }

function checkScenarioOutcome(row) {
    const required = SCENARIO_OUTCOMES[row.name]
    assert(required, `Unknown scenario outcome: ${row.name}`)
    if (required.export) assert(row.exportData, `${row.name}: missing export bytes`)
    if (required.error) assert(row.error === true && row.notice.tone === 'err', `${row.name}: missing current error`)
    if (required.declined) assert(row.declined === true && row.notice.text === 'Import cancelled. Your save was not changed.', `${row.name}: missing decline`)
    if (required.successReload) assert(row.successReload === true && /^Restored \d+ items\. Reloading…$/.test(row.notice.text) && row.navigations.length === 1, `${row.name}: missing successful reload`)
    if (required.noWrites) assert(row.noWrites === true && writes(row.calls).length === 0, `${row.name}: unexpected mutation`)
    if (required.writes) assert(writes(row.calls).length > 0, `${row.name}: expected attempted writes`)
    if (required.dialog) assert(row.dialogs.length === 1 && row.dialogExpected === row.dialogs[0].message, `${row.name}: missing native consent dialog`)
    if (required.conflict) assert(row.independentChange?.acknowledged === true, `${row.name}: missing independent conflict change`)
}

async function selfTest(out) {
    const checks = []
    const check = (name, fn) => { fn(); checks.push(name) }
    check('absolute argument policy', () => parseArgs(['--self-test', `--out=${out}`]))
    for (const args of [[], ['--wat=x'], ['--self-test', '--out=relative'], ['--self-test', '--out=/'], ['--self-test', `--out=${out}`, `--out=${out}`], ['--browser=relative', '--dist=/x', '--out=/y']]) check(`reject arguments ${args.join(' ')}`, () => assert.throws(() => parseArgs(args)))
    const exportRow = { name: 'exportHealthy', before: { foreign: 'keep', gampo_a: '1' }, after: { foreign: 'keep', gampo_a: '1' }, expectedMap: { foreign: 'keep', gampo_a: '1' }, exportData: { gampo_a: '1' }, observedMs: 1100, navigations: [], runtimeErrors: [], unexpectedNetwork: [], noWrites: true, calls: [], downloads: [{ parsed: { data: { gampo_a: '1' }, keyCount: 1 } }], notice: { tone: 'ok', text: 'Exported 1 saved items to a JSON file.' } }
    const okNotice = 'Restored 1 items. Reloading…'
    const successRow = name => ({ ...structuredClone(exportRow), name, exportData: undefined, downloads: [], downloadEvents: [], newDownloadFiles: [], successReload: true, restored: 1, navigations: [{}], navigationDelay: 900, notice: { tone: 'ok', text: okNotice } })
    const errorRow = name => ({ ...structuredClone(exportRow), name, exportData: undefined, downloads: [], downloadEvents: [], newDownloadFiles: [], error: true, noWrites: true, notice: { tone: 'err', text: 'Rejected.' } })
    const declineRow = name => ({ ...structuredClone(exportRow), name, exportData: undefined, downloads: [], downloadEvents: [], newDownloadFiles: [], declined: true, noWrites: true, dialogs: [{ type: 'confirm', message: `Replace saved data?\nRemoved keys: gampo_a\nAdded keys: (none)` }], dialogExpected: `Replace saved data?\nRemoved keys: gampo_a\nAdded keys: (none)`, notice: { tone: 'ok', text: 'Import cancelled. Your save was not changed.' } })
    const acceptedRow = name => ({ ...declineRow(name), declined: false, noWrites: false, successReload: true, restored: 1, navigations: [{}], navigationDelay: 900, notice: { tone: 'ok', text: okNotice } })
    const faultRow = name => ({ ...structuredClone(exportRow), name, exportData: undefined, downloads: [], downloadEvents: [], newDownloadFiles: [], error: true, noWrites: false, calls: [{ phase: 'action', method: 'setItem', key: 'gampo_a' }], notice: { tone: 'err', text: 'GamPo save restore failed; previous save was restored.' } })
    const conflictRow = () => ({ ...errorRow('importBeforeimageConflict'), independentChange: { acknowledged: true } })
    const rowFor = name => {
        if (['exportHealthy', 'exportEmptyProfile', 'exportAbsent', 'exportRawNull'].includes(name)) return { ...structuredClone(exportRow), name }
        if (name.startsWith('export') || name.startsWith('currentError')) return { ...errorRow(name), exportData: undefined, downloads: [], downloadEvents: [], newDownloadFiles: [], noWrites: true }
        if (name === 'importBeforeimageConflict') return conflictRow()
        if (['importNoReloadOnFailure', 'importRemoveFailure', 'importRollbackFailed'].includes(name)) return faultRow(name)
        if (name.endsWith('Accepted')) return acceptedRow(name)
        if (name.startsWith('importConfirm') || ['importAddedOnly', 'importSameSizeDifferentKeys', 'importOverlapping'].includes(name)) return declineRow(name)
        if (['importLegacy', 'importRawNullRestore', 'importSuccessReload'].includes(name)) return successRow(name)
        if (name.startsWith('import')) return errorRow(name)
        return errorRow(name)
    }
    const report = { rows: REQUIRED.map(rowFor), manifest: { source: SOURCES.map(path => ({ path })), dist: [{ path: 'index.html' }] }, cleanup: { browser: true, server: true, profile: true, temp: true } }
    check('complete oracle positive', () => checkReport(report))
    check('mislabeled healthy row cannot cover a rejection scenario', () => { const bad = structuredClone(report); bad.rows = bad.rows.map(r => r.name === 'importSemanticReject' ? { ...structuredClone(exportRow), name: 'importSemanticReject' } : r); assert.throws(() => checkReport(bad)) })
    check('mislabeled healthy row cannot cover a consent scenario', () => { const bad = structuredClone(report); bad.rows = bad.rows.map(r => r.name === 'importConfirmEmpty' ? { ...structuredClone(exportRow), name: 'importConfirmEmpty' } : r); assert.throws(() => checkReport(bad)) })
    check('mislabeled healthy row cannot cover an import scenario', () => { const bad = structuredClone(report); bad.rows = bad.rows.map(r => r.name === 'importSuccessReload' ? { ...structuredClone(exportRow), name: 'importSuccessReload' } : r); assert.throws(() => checkReport(bad)) })
    check('mislabeled healthy row cannot cover a conflict scenario', () => { const bad = structuredClone(report); bad.rows = bad.rows.map(r => r.name === 'importBeforeimageConflict' ? { ...structuredClone(exportRow), name: 'importBeforeimageConflict' } : r); assert.throws(() => checkReport(bad)) })
    check('mislabeled healthy row cannot cover an export failure scenario', () => { const bad = structuredClone(report); bad.rows = bad.rows.map(r => r.name === 'exportM1' ? { ...structuredClone(exportRow), name: 'exportM1' } : r); assert.throws(() => checkReport(bad)) })
    check('mislabeled healthy row cannot cover a rollback scenario', () => { const bad = structuredClone(report); bad.rows = bad.rows.map(r => r.name === 'importRollbackFailed' ? { ...structuredClone(exportRow), name: 'importRollbackFailed' } : r); assert.throws(() => checkReport(bad)) })
    const ledgerEntries = [
        { hostSeq: 1, receivedAt: 1, session: 's', target: 't', payload: { doc: 'A', method: 'getItem', args: ['gampo_a'], result: 'old' } },
        { hostSeq: 2, receivedAt: 2, session: 's', target: 't', payload: { doc: 'A', method: 'getItem', args: ['gampo_a'], result: 'old' } },
        { hostSeq: 3, receivedAt: 3, session: 'o', target: 't2', payload: { doc: 'B', method: 'setItem', args: ['gampo_a', 'concurrent'] } },
        { hostSeq: 4, receivedAt: 4, session: 's', target: 't', payload: { doc: 'A', method: 'getItem', args: ['gampo_a'], result: 'old' } },
    ]
    check('host ledger summary splits documents and counts methods', () => { const s = summarizeHostLedger(ledgerEntries); assert.equal(s.entries, 4); assert.equal(s.methods.getItem, 3); assert.equal(s.documents.length, 2); assert.equal(s.documents.find(d => d.doc === 'A').entries, 3) })
    check('host ledger summary observes stale read after acknowledged cross-document write', () => { const after = ledgerEntries.filter(e => e.hostSeq > 3 && e.payload.doc === 'A'); assert(after.length > 0 && after.every(e => e.payload.result === 'old'), 'stale read not observed'); assert(summarizeHostLedger(ledgerEntries).documents.some(d => d.doc === 'B')) })
    check('host ledger summary rejects a read-only ledger as write evidence', () => { const s = summarizeHostLedger(ledgerEntries.filter(e => e.payload.method === 'getItem')); assert(!s.methods.setItem) })
    const sinkPath = join(out, 'host-ledger-self-check.jsonl')
    const sink = await openSink(sinkPath)
    await Promise.all([sink.record({ payload: { doc: 'A', method: 'getItem', result: 'old' } }), sink.record({ payload: { doc: 'A', method: 'getItem', result: 'old' } }), sink.record({ payload: { doc: 'B', method: 'setItem' } }), sink.record({ payload: { doc: 'A', method: 'getItem', result: 'old' } })])
    await sink.drain()
    const sinkBytes = await readFile(sinkPath)
    await sink.close()
    check('shared sink appends in hostSeq order with no lost writes', () => { const lines = sinkBytes.toString('utf8').trim().split('\n').map(JSON.parse); assert.equal(lines.length, 4); assert.deepEqual(lines.map(line => line.hostSeq), [1, 2, 3, 4]) })
    check('shared sink summary matches the drained file contents', () => { const lines = sinkBytes.toString('utf8').trim().split('\n').map(JSON.parse); assert.deepEqual(summarizeHostLedger(lines), summarizeHostLedger(sink.entries)) })
    const closedSink = await openSink(join(out, 'host-ledger-self-check-closed.jsonl'))
    await closedSink.close()
    let closedThrew = false
    try { await closedSink.record({ payload: { doc: 'A', method: 'setItem' } }); await closedSink.drain() } catch { closedThrew = true }
    check('shared sink surfaces a real closed-handle write failure instead of losing it', () => assert(closedThrew))
    const failSink = await openSink(join(out, 'host-ledger-self-check-fail.jsonl'))
    failSink.breakHandle()
    let injectedThrew = false
    try { await failSink.record({ payload: { doc: 'A', method: 'setItem' } }); await failSink.drain() } catch { injectedThrew = true }
    await failSink.close().catch(() => {})
    check('shared sink surfaces an injected pre-write failure', () => assert(injectedThrew))
    const declined = declineRow('importConfirmEmpty')
    check('decline oracle positive', () => checkAction(declined))
    for (const [name, mutate] of [['missing dialog', r => { r.dialogs = [] }], ['wrong affected names', r => { r.dialogs[0].message = 'wrong' }], ['decline restored success', r => { r.notice.text = 'Restored 0 items. Reloading…' }], ['oversize read', r => { r.oversize = true; r.textCalls = [{ size: MAX_BYTES + 1 }] }]]) check(`import detection ${name}`, () => { const bad = structuredClone(declined); mutate(bad); assert.throws(() => checkAction(bad)) })
    const ledger = { flags: FLAGS, guardEnabled: 1, firstNavigation: 2, owned: { session: 'session', target: 'target' }, unexpected: [], runtimeErrors: [], denials: FONT_URLS.map((url, index) => ({ session: 'session', target: 'target', stage: 'Request', method: 'GET', type: 'Stylesheet', url, requestId: `fetch-${index}`, networkId: `net-${index}`, ack: true })), failures: FONT_URLS.map((_url, index) => ({ session: 'session', requestId: `net-${index}`, errorText: 'net::ERR_BLOCKED_BY_CLIENT', canceled: false })), logErrors: FONT_URLS.map((url, index) => ({ session: 'session', url, networkRequestId: `net-${index}`, source: 'network', level: 'error', text: 'Failed to load resource: net::ERR_BLOCKED_BY_CLIENT' })) }
    check('exact font denials with correlated diagnostics', () => checkNetwork(ledger))
    check('no font request means zero diagnostics', () => checkNetwork({ ...ledger, denials: [], failures: [], logErrors: [] }))
    const inspector = structuredClone(ledger)
    for (const failure of inspector.failures) Object.assign(failure, { errorText: 'net::ERR_BLOCKED_BY_CLIENT.Inspector', blockedReason: 'inspector' })
    for (const entry of inspector.logErrors) Object.assign(entry, { level: 'error', text: 'Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector' })
    check('exact observed Chrome153 Inspector signature', () => checkNetwork(inspector))
    for (const [name, mutate] of [['missing matching log', r => r.logErrors.pop()], ['wrong canceled', r => { r.failures[0].canceled = true }], ['missing Inspector reason', r => { delete r.failures[0].blockedReason }], ['other blocked reason', r => { r.failures[0].blockedReason = 'other' }], ['near loading text', r => { r.failures[0].errorText += 'Extra' }], ['wrong log suffix', r => { r.logErrors[0].text = 'Failed to load resource: net::ERR_BLOCKED_BY_CLIENT' }], ['wrong log level', r => { r.logErrors[0].level = 'warning' }], ['wrong log URL', r => { r.logErrors[0].url += '#' }], ['wrong log session', r => { r.logErrors[0].session = 'other' }], ['wrong log request', r => { r.logErrors[0].networkRequestId = 'other' }]]) check(`Inspector detection ${name}`, () => { const bad = structuredClone(inspector); mutate(bad); assert.throws(() => checkNetwork(bad)) })
    for (const [name, mutate] of [
        ['near URL', r => { r.denials[0].url += '&extra=1' }], ['wrong host', r => { r.denials[0].url = r.denials[0].url.replace('googleapis', 'gstatic') }], ['wrong method', r => { r.denials[0].method = 'POST' }], ['wrong type', r => { r.denials[0].type = 'Font' }], ['redirect', r => { r.denials[0].redirect = true }], ['response stage', r => { r.denials[0].stage = 'Response' }], ['missing ack', r => { r.denials[0].ack = false }], ['wrong session', r => { r.failures[0].session = 'other' }], ['wrong request', r => { r.failures[0].requestId = 'other' }], ['duplicate failure', r => r.failures.push(r.failures[0])], ['unmatched canceled', r => r.failures.push({ canceled: true, errorText: 'net::ERR_ABORTED' })], ['bad log text', r => { r.logErrors[0].text = 'generic error' }], ['unguarded preconnect', r => { r.firstNavigation = 0 }], ['missing resolver', r => { r.flags = [] }], ['unknown request', r => r.unexpected.push({})], ['runtime console', r => r.runtimeErrors.push('console error')],
    ]) check(`font detection ${name}`, () => { const bad = structuredClone(ledger); mutate(bad); assert.throws(() => checkNetwork(bad)) })
    const mutations = [
        ['missing scenario', r => r.rows.pop()],
        ['raw map mismatch', r => { r.rows[0].after.foreign = 'changed' }],
        ['download mismatch', r => { r.rows[0].downloads[0].parsed.data.gampo_a = 'wrong' }],
        ['count mismatch', r => { r.rows[0].downloads[0].parsed.keyCount = 2 }],
        ['notice mismatch', r => { r.rows[0].notice.text = 'stale' }],
        ['mutation despite same final bytes', r => r.rows[0].calls.push({ phase: 'action', method: 'setItem', key: 'gampo_a' })],
        ['short observation', r => { r.rows[0].observedMs = 900 }],
        ['navigation', r => r.rows[0].navigations.push({})],
        ['runtime error', r => r.rows[0].runtimeErrors.push('error')],
        ['network leak', r => r.rows[0].unexpectedNetwork.push('https://provider.invalid')],
        ['cleanup failure', r => { r.cleanup.profile = false }],
        ['source manifest missing', r => r.manifest.source.pop()],
        ['dist manifest missing', r => { r.manifest.dist = [] }],
    ]
    for (const [name, mutate] of mutations) check(`detect ${name}`, () => { const bad = structuredClone(report); mutate(bad); assert.throws(() => checkReport(bad)) })
    const fixture = await mkdtemp(join(tmpdir(), 'gampo-save-self-test-'))
    let server
    try {
        await writeFile(join(fixture, 'original.json'), '{"original":true}')
        const manifest = await files(fixture), ledger = []
        server = await staticServer(fixture, manifest, ledger)
        const origin = `http://127.0.0.1:${server.address().port}`
        const response = await fetch(origin + '/original.json')
        assert.equal(response.status, 200)
        assert.equal(sha256(Buffer.from(await response.arrayBuffer())), manifest[0].sha256)
        checks.push('actual static server preserves original bytes')
        for (const path of ['/api/credits', '/provider', '/missing.json']) assert.equal((await fetch(origin + path)).status, 403)
        assert.equal((await fetch(origin + '/original.json', { method: 'POST' })).status, 403)
        checks.push('actual static server rejects unknown API provider paths and non-GET')
        await writeFile(join(fixture, 'original.json'), 'changed disposable fixture')
        assert.equal((await fetch(origin + '/original.json')).status, 500)
        assert.match(ledger.at(-1).failure, /Served build bytes changed/)
        checks.push('actual static server rejects changed served bytes')
    } finally {
        if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)) }
        await rm(fixture, { recursive: true, force: true })
    }
    assert(!existsSync(fixture) && !server.listening)
    checks.push('actual static self-test cleanup')
    await writeFile(join(out, 'self-test.json'), JSON.stringify({ assertions: checks.length, checks, pass: true }, null, 2), { flag: 'wx' })
    console.log(`Save runner self-test PASS ${checks.length}`)
}

class Cdp {
    constructor(url) { this.socket = new WebSocket(url); this.id = 0; this.pending = new Map(); this.handlers = [] }
    async open() {
        await once(this.socket, 'open')
        this.socket.addEventListener('message', event => {
            const message = JSON.parse(String(event.data))
            const pending = this.pending.get(message.id)
            if (pending) {
                this.pending.delete(message.id); clearTimeout(pending.timer)
                message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result)
            } else for (const handler of this.handlers) handler(message)
        })
    }
    send(method, params = {}, sessionId) {
        const id = ++this.id
        return new Promise((resolvePromise, reject) => {
            const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout ${method}`)) }, 20000)
            this.pending.set(id, { resolve: resolvePromise, reject, timer })
            this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
        })
    }
    close() { return new Promise(done => { if (this.socket.readyState === WebSocket.CLOSED) return done(); this.socket.addEventListener('close', () => done(), { once: true }); this.socket.close() }) }
}

async function evaluate(cdp, session, expression) {
    const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, session)
    assert(!result.exceptionDetails, result.exceptionDetails?.exception?.description || result.exceptionDetails?.text)
    return result.result.value
}

async function until(fn, label, ms = 15000) {
    const end = Date.now() + ms
    while (Date.now() < end) { const result = await fn(); if (result) return result; await sleep(50) }
    throw new Error(`Timed out: ${label}`)
}

async function files(root) {
    const result = []
    async function visit(path) {
        const info = await lstat(path)
        assert(!info.isSymbolicLink(), `Symlink not admitted: ${path}`)
        if (info.isDirectory()) for (const name of (await readdir(path)).sort()) await visit(join(path, name))
        else { assert(info.isFile(), `Non-file: ${path}`); const bytes = await readFile(path); result.push({ path: relative(root, path), bytes: bytes.length, sha256: sha256(bytes) }) }
    }
    await visit(root)
    return result
}

async function staticServer(dist, manifest, ledger) {
    const allowed = new Set(manifest.map(item => '/' + item.path.split(sep).join('/')))
    const server = createServer(async (request, response) => {
        let path
        try { path = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname) } catch { response.writeHead(400).end(); return }
        if (path === '/settings' || path === '/') path = '/index.html'
        const receipt = { method: request.method, url: request.url, path }
        ledger.push(receipt)
        if (request.method !== 'GET' || !allowed.has(path) || new URL(request.url, 'http://127.0.0.1').search) { response.writeHead(403).end(); return }
        try {
            const bytes = await readFile(join(dist, path.slice(1)))
            const pin = manifest.find(item => '/' + item.path.split(sep).join('/') === path)
            assert.equal(sha256(bytes), pin.sha256, 'Served build bytes changed')
            Object.assign(receipt, { bytes: bytes.length, sha256: sha256(bytes) })
            response.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream', 'cache-control': 'no-store' }); response.end(bytes)
        } catch (error) {
            receipt.failure = error.stack || String(error)
            response.writeHead(500).end()
        }
    })
    server.listen(0, '127.0.0.1'); await once(server, 'listening')
    return server
}

const instrumentation = `(() => {
    const original = window.localStorage;
    const proto = Storage.prototype;
    const methods = Object.fromEntries(['getItem','setItem','removeItem','clear','key'].map(key => [key, proto[key]]));
    const length = Object.getOwnPropertyDescriptor(proto, 'length');
    const text = Blob.prototype.text;
    window.__saveProbe = { phase: 'mount', fault: null, calls: [], textCalls: [], keyCalls: 0 };
    const probe = window.__saveProbe;
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { if (probe.fault === 'unavailable') throw new Error('save probe unavailable'); return original; } });
    const docId = () => performance.timeOrigin + ':' + location.pathname
    const emitEntry = (method, args, result, thrown) => {
        if (typeof __hostSink !== 'function') return
        // Only already-primitive values cross the binding; no live-object serialization.
        const primitive = value => (value === undefined ? null : typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : typeof value)
        probe.docSeq = (probe.docSeq || 0) + 1
        const entry = { doc: docId(), docSeq: probe.docSeq, timeOrigin: performance.timeOrigin, phase: probe.phase, method, args: args.map(primitive), result: primitive(result) }
        if (probe.fault) entry.fault = probe.fault
        if (thrown !== undefined) entry.thrown = String(thrown)
        try { __hostSink(JSON.stringify(entry)) } catch { /* observation must not alter behavior */ }
    }
    for (const method of Object.keys(methods)) proto[method] = function(...args) {
        const owned = this === original
        if (owned) {
            probe.calls.push({ phase: probe.phase, method, args });
            if (method === 'removeItem' && probe.fault === 'remove' && args[0] === 'gampo_probe_b' && !probe.failed) { probe.failed = true; emitEntry(method, args, undefined, 'save probe remove failed'); throw new Error('save probe remove failed'); }
            if (method === 'setItem' && probe.fault === 'write' && args[0] === 'gampo_new' && !probe.failed) { probe.failed = true; emitEntry(method, args, undefined, 'save probe write failed'); throw new Error('save probe write failed'); }
            if (method === 'setItem' && probe.fault === 'rollback' && (args[0] === 'gampo_new' || args[0] === 'gampo_probe_a')) { emitEntry(method, args, undefined, 'save probe rollback failed'); throw new Error('save probe rollback failed'); }
            if (method === 'key' && probe.fault === 'key' && args[0] === 1) { emitEntry(method, args, undefined, 'save probe key 1 failed'); throw new Error('save probe key 1 failed'); }
            if (method === 'getItem' && args[0] === 'gampo_probe_b') {
                if (probe.fault === 'getItem') { emitEntry(method, args, undefined, 'save probe getItem failed'); throw new Error('save probe getItem failed'); }
                if (probe.fault === 'actual-null') { emitEntry(method, args, null); return null; }
            }
        }
        let value
        try { value = methods[method].apply(this, args) } catch (error) { if (owned) emitEntry(method, args, undefined, error?.message || String(error)); throw error }
        if (owned) emitEntry(method, args, value)
        return value
    };
    Object.defineProperty(proto, 'length', { ...length, get() { if (this === original && probe.fault === 'length') { emitEntry('length', [], undefined, 'save probe length failed'); throw new Error('save probe length failed'); } const value = length.get.call(this); if (this === original) emitEntry('length', [], value); return value; } });
    Blob.prototype.text = function(...args) { probe.textCalls.push({ phase: probe.phase, size: this.size }); return text.apply(this, args); };
    probe.restore = () => {
        // Terminal acknowledgement: the last docSeq this document emitted before
        // its instrumentation is removed, so the host can prove the cutoff.
        const terminal = { doc: docId(), docSeq: probe.docSeq || 0 }
        for (const method of Object.keys(methods)) proto[method] = methods[method];
        Object.defineProperty(proto, 'length', length);
        Blob.prototype.text = text;
        Object.defineProperty(window, 'localStorage', { configurable: true, get() { return original; } });
        return terminal;
    };
})()`

async function native(args) {
    const temp = await mkdtemp(join(tmpdir(), 'gampo-save-safety-'))
    const profile = join(temp, 'profile')
    const downloads = join(temp, 'downloads')
    await mkdir(profile); await mkdir(downloads)
    const cleanup = { browser: false, server: false, profile: false, temp: false }
    const report = { base: BASE, head: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim(), rows: [], manifest: { source: [], dist: await files(args.dist) }, requests: [], deniedFonts: [], unexpectedNetwork: [], runtimeErrors: [], cleanup }
    report.ownedPaths = { temp, profile, downloads, dist: args.dist, out: args.out }
    report.diagnosticCase = args.case || null
    for (const path of SOURCES) { const bytes = await readFile(join(ROOT, path)); report.manifest.source.push({ path, bytes: bytes.length, sha256: sha256(bytes) }) }
    report.fontSourcePins = []
    for (const [path, expected] of [['index.html', 'd8022d6efacece2834cf4bce2162f89d7641931632cc388d321c45407b88282c'], ['src/styles/index.css', '133aebf6f5a0b357fd7596c1c0ad55b21309850c9b8ed3030dcf36bdf9dabfab']]) {
        const bytes = await readFile(join(ROOT, path)); assert.equal(sha256(bytes), expected, 'Font source pin changed'); report.fontSourcePins.push({ path, bytes: bytes.length, sha256: expected })
    }
    report.environment = 'remote fonts denied; system-fallback render; functional save/input/accounting evidence only'
    report.network = { flags: FLAGS, owned: {}, guardEnabled: null, firstNavigation: null, unexpected: report.unexpectedNetwork, runtimeErrors: report.runtimeErrors, denials: [], failures: [], logErrors: [] }
    const binary = await readFile(args.browser)
    report.browserBinary = { path: args.browser, bytes: binary.length, sha256: sha256(binary) }
    let browser, server, cdp, failure
    let hostSink = null
    const pendingHostWrites = new Set()
    // Restore both owned documents while CDP is connected and collect each one's
    // acknowledged terminal docSeq. Any throw here is recorded as a cutoff failure.
    const restoreTerminals = async (connection, reportRef) => {
        const terminals = []
        for (const [label, sessionId, targetId] of [['main', reportRef.network.owned.session, reportRef.network.owned.target], ['observer', reportRef.observer?.session, reportRef.observer?.target]]) {
            if (!sessionId || !targetId) continue
            const targets = await connection.send('Target.getTargets')
            if (!targets.targetInfos.some(target => target.targetId === targetId)) continue
            terminals.push({ label, ...(await evaluate(connection, sessionId, 'window.__saveProbe?.restore()') || {}) })
        }
        return terminals
    }
    try {
        hostSink = await openSink(join(args.out, 'host-ledger.jsonl'))
        server = await staticServer(args.dist, report.manifest.dist, report.requests)
        const origin = `http://127.0.0.1:${server.address().port}`
        report.origin = origin
        report.launchArgv = [args.browser, ...FLAGS, `--user-data-dir=${profile}`, 'about:blank']
        browser = spawn(args.browser, [...FLAGS, `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] })
        let browserLog = ''; browser.stderr.on('data', data => { browserLog += data })
        const port = await until(async () => { try { return Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]) } catch { return false } }, 'browser debugger')
        const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
        report.browser = version
        cdp = new Cdp(version.webSocketDebuggerUrl); await cdp.open()
        const allowed = new Set(report.manifest.dist.map(item => '/' + item.path.split(sep).join('/')))
        const downloadEvents = [], navigationEvents = [], loadedAssets = [], pendingEvents = new Set()
        const ownedSessions = new Map()
        const recordHostEntry = async (sessionId, targetId, payload) => {
            const job = hostSink.record({ session: sessionId, target: targetId, payload })
            pendingHostWrites.add(job); job.finally(() => pendingHostWrites.delete(job)).catch(() => {})
            await job
        }
        cdp.handlers.push(message => {
            if (message.method !== 'Runtime.bindingCalled' || message.params.name !== '__hostSink') return
            const job = (async () => {
                let payload
                try { payload = JSON.parse(message.params.payload) } catch { payload = { parseError: message.params.payload } }
                await recordHostEntry(message.sessionId, ownedSessions.get(message.sessionId) || null, payload)
            })(); pendingEvents.add(job); job.finally(() => pendingEvents.delete(job)).catch(error => report.runtimeErrors.push(error.message))
        })
        cdp.handlers.push(message => {
            if (message.method === 'Fetch.requestPaused') {
                const job = (async () => {
                    const p = message.params
                    const url = new URL(p.request.url)
                    const local = ownedSessions.has(message.sessionId) && url.origin === origin && (allowed.has(url.pathname) || ['/settings', '/'].includes(url.pathname)) && !url.search && p.request.method === 'GET' && !p.redirectedRequestId && !p.responseStatusCode
                    if (local) await cdp.send('Fetch.continueRequest', { requestId: p.requestId }, message.sessionId)
                    else {
                        const denial = { session: message.sessionId, target: ownedSessions.get(message.sessionId), navigation: navigationEvents.at(-1)?.loaderId || 'initial', requestId: p.requestId, networkId: p.networkId, url: p.request.url, method: p.request.method, type: p.resourceType, stage: p.responseStatusCode ? 'Response' : 'Request', redirect: Boolean(p.redirectedRequestId), reason: 'BlockedByClient', ack: false }
                        const known = ownedSessions.has(message.sessionId) && fontRequest(denial, { session: message.sessionId, target: ownedSessions.get(message.sessionId) })
                        ;(known ? report.network.denials : report.unexpectedNetwork).push(denial)
                        await cdp.send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'BlockedByClient' }, message.sessionId)
                        denial.ack = true
                    }
                })(); pendingEvents.add(job); job.finally(() => pendingEvents.delete(job)).catch(error => report.runtimeErrors.push(error.message))
            }
            if (message.method === 'Runtime.exceptionThrown') report.runtimeErrors.push(message.params.exceptionDetails)
            if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') report.runtimeErrors.push(message.params)
            if (message.method === 'Network.loadingFailed') report.network.failures.push({ session: message.sessionId, ...message.params })
            if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') report.network.logErrors.push({ session: message.sessionId, ...message.params.entry })
            if (message.method?.startsWith('Browser.download')) downloadEvents.push({ method: message.method, ...message.params })
            if (message.sessionId === report.observer?.session && message.method === 'Page.frameNavigated' && !message.params.frame.parentId) report.observerNavigations.push({ ...message.params.frame, proofTime: Date.now() })
            if (message.sessionId === report.network.owned.session && message.method === 'Page.frameNavigated' && !message.params.frame.parentId) navigationEvents.push({ ...message.params.frame, proofTime: Date.now() })
            if (message.method === 'Network.requestWillBeSent' && message.params.redirectResponse) report.unexpectedNetwork.push({ redirect: message.params })
            if (message.method === 'Target.targetCreated' && message.params.targetInfo.type === 'page' && message.params.targetInfo.targetId !== report.network.owned.target && message.params.targetInfo.url !== 'about:blank') report.unexpectedNetwork.push({ unguardedTarget: message.params.targetInfo })
            if (message.method === 'Network.responseReceived') loadedAssets.push({ session: message.sessionId, requestId: message.params.requestId, url: message.params.response.url, status: message.params.response.status, mime: message.params.response.mimeType })
            if (message.method === 'Network.loadingFinished') {
                const asset = loadedAssets.find(item => item.session === message.sessionId && item.requestId === message.params.requestId)
                if (asset && asset.url.startsWith(origin)) {
                    const job = (async () => {
                        const body = await cdp.send('Network.getResponseBody', { requestId: asset.requestId }, message.sessionId)
                        const bytes = Buffer.from(body.body, body.base64Encoded ? 'base64' : 'utf8')
                        const url = new URL(asset.url)
                        const path = ['/settings', '/'].includes(url.pathname) ? 'index.html' : url.pathname.slice(1)
                        const pin = report.manifest.dist.find(item => item.path === path)
                        assert(pin && asset.status === 200 && sha256(bytes) === pin.sha256, `Loaded bytes mismatch ${asset.url}`)
                        Object.assign(asset, { path, bytes: bytes.length, sha256: sha256(bytes) })
                    })(); pendingEvents.add(job); job.finally(() => pendingEvents.delete(job)).catch(error => report.runtimeErrors.push(error.message))
                }
            }
        })
        await cdp.send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: downloads, eventsEnabled: true })
        const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
        const { sessionId: session } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
        report.network.owned = { session, target: targetId }
        ownedSessions.set(session, targetId)
        for (const method of ['Page.enable', 'Runtime.enable', 'Network.enable', 'Log.enable', 'DOMStorage.enable']) await cdp.send(method, {}, session)
        await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] }, session)
        report.network.guardEnabled = Date.now()
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, session)
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `if(location.origin === ${JSON.stringify(origin)}) { localStorage.setItem('gampo_onboarding_v1', JSON.stringify({seen:true,seenAt:'2026-11-01T00:00:00.000Z'})); }` }, session)
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: instrumentation }, session)
        await cdp.send('Runtime.addBinding', { name: '__hostSink' }, session)
        await sleep(1)
        report.network.firstNavigation = Date.now()
        await cdp.send('Page.navigate', { url: origin + '/settings' }, session)
        await until(() => evaluate(cdp, session, `Boolean(document.querySelector('.settings-page') && document.querySelectorAll('.settings-btn.primary').length === 2)`), 'actual Settings mount')
        await sleep(1300)
        const { targetId: observerTarget } = await cdp.send('Target.createTarget', { url: 'about:blank', newWindow: true, background: true })
        const { sessionId: observerSession } = await cdp.send('Target.attachToTarget', { targetId: observerTarget, flatten: true })
        ownedSessions.set(observerSession, observerTarget)
        report.observer = { target: observerTarget, session: observerSession, allocated: Date.now() }
        report.network.owners = [report.network.owned, { target: observerTarget, session: observerSession }]
        for (const method of ['Page.enable', 'Runtime.enable', 'Network.enable', 'Log.enable', 'DOMStorage.enable']) await cdp.send(method, {}, observerSession)
        await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] }, observerSession)
        report.observer.guarded = Date.now()
        await cdp.send('Runtime.addBinding', { name: '__hostSink' }, observerSession)
        report.observerNavigations = []
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: instrumentation }, observerSession)
        await cdp.send('Page.navigate', { url: origin + '/settings' }, observerSession)
        await until(() => evaluate(cdp, observerSession, `Boolean(document.querySelector('.settings-page'))`), 'independent real Settings observer mount')
        report.observer.mounted = Date.now()
        report.observer.origin = await evaluate(cdp, observerSession, 'location.origin')
        assert.equal(report.observer.origin, origin, 'Observer origin mismatch')
        await cdp.send('Page.bringToFront', {}, session)
        report.fixtureNavigations = []
        const storageId = { securityOrigin: origin, isLocalStorage: true }
        const snapshot = async () => Object.fromEntries((await cdp.send('DOMStorage.getDOMStorageItems', { storageId }, session)).entries)
        const seed = async map => {
            // SocialProvider emits after 4500 ms; remount before fixtures, never suppress background writes.
            await Promise.all(pendingEvents)
            await evaluate(cdp, session, 'window.__saveProbe.restore()')
            const start = navigationEvents.length
            await evaluate(cdp, observerSession, 'window.__saveProbe.restore()')
            const observerStart = report.observerNavigations.length
            await cdp.send('Page.reload', { ignoreCache: true }, observerSession)
            await until(() => report.observerNavigations.length > observerStart, 'observer fixture-only navigation')
            await until(() => evaluate(cdp, observerSession, `Boolean(document.querySelector('.settings-page'))`), 'observer remount')
            await cdp.send('Page.reload', { ignoreCache: true }, session)
            await until(() => navigationEvents.length > start, 'fixture-only navigation')
            await until(() => evaluate(cdp, session, `Boolean(document.querySelector('.settings-page') && document.querySelectorAll('.settings-btn.primary').length === 2)`), 'fixture Settings remount')
            const mounted = Date.now()
            await sleep(300)
            report.fixtureNavigations.push({ reload: navigationEvents[start].proofTime, mounted, settled: Date.now(), navigation: navigationEvents[start] })
            Object.assign(report.fixtureNavigations.at(-1), { observerReload: report.observerNavigations[observerStart].proofTime, observerMounted: Date.now() })
            await evaluate(cdp, session, `Object.assign(window.__saveProbe, {phase:'fixture',fault:null})`)
            await evaluate(cdp, observerSession, `Object.assign(window.__saveProbe,{phase:'observer',fault:null,calls:[]})`)
            for (const key of Object.keys(await snapshot())) await cdp.send('DOMStorage.removeDOMStorageItem', { storageId, key }, session)
            for (const [key, value] of Object.entries(map)) await cdp.send('DOMStorage.setDOMStorageItem', { storageId, key, value }, session)
            await sleep(200)
            assert.deepEqual(await snapshot(), map, 'Fixture changed after mount')
            Object.assign(report.fixtureNavigations.at(-1), { seeded: Date.now(), map: await snapshot() })
        }
        const click = async label => {
            const point = await evaluate(cdp, session, `(() => {const el=[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===${JSON.stringify(label)}); if(!el||el.disabled)return null; el.scrollIntoView({block:'center'}); const r=el.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};})()`)
            assert(point, `Missing native control ${label}`)
            report.fixtureNavigations.at(-1).action = Date.now()
            await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point }, session)
            await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point }, session)
        }
        const notice = () => evaluate(cdp, session, `(() => {const el=document.querySelector('.settings-notice'); return {tone:el?.classList.contains('err')?'err':el?.classList.contains('ok')?'ok':null,text:el?.textContent||''}})()`)
        async function exportCase(name, fault = null, map = { gampo_probe_a: 'one', gampo_probe_b: 'two', foreign: 'keep' }, label = 'Export save', current = false) {
            if (args.case && args.case !== name) return
            await seed(map)
            if (current) { const start = downloadEvents.length; await click('Export save'); await until(() => downloadEvents.slice(start).some(item => item.state === 'completed'), 'prior successful download'); await sleep(100) }
            const before = await snapshot(), startDownloads = downloadEvents.length, startNavigation = navigationEvents.length, startErrors = report.runtimeErrors.length, startNetwork = report.unexpectedNetwork.length
            const beforeFiles = await readdir(downloads)
            await evaluate(cdp, session, `Object.assign(window.__saveProbe, {phase:'action',fault:${JSON.stringify(fault)},calls:[]})`)
            const start = Date.now()
            await click(label)
            await sleep(1150)
            const events = downloadEvents.slice(startDownloads)
            const newFiles = (await readdir(downloads)).filter(path => !beforeFiles.includes(path))
            const completed = events.filter(item => item.method === 'Browser.downloadProgress' && item.state === 'completed')
            const actualDownloads = []
            for (const item of completed) {
                const bytes = await readFile(join(downloads, item.guid))
                const path = `${name}-${item.guid}.json`
                await writeFile(join(args.out, path), bytes, { flag: 'wx' })
                actualDownloads.push({ guid: item.guid, path, bytes: bytes.length, sha256: sha256(bytes), parsed: JSON.parse(bytes.toString('utf8')) })
            }
            const row = { name, fault, label, before, after: await snapshot(), expectedMap: before, noWrites: true, observedMs: Date.now() - start, navigations: navigationEvents.slice(startNavigation), runtimeErrors: report.runtimeErrors.slice(startErrors), unexpectedNetwork: report.unexpectedNetwork.slice(startNetwork), calls: await evaluate(cdp, session, 'window.__saveProbe.calls'), downloads: actualDownloads, downloadEvents: events, newDownloadFiles: newFiles, notice: await notice(), ...(fault ? { error: true } : { exportData: managed(before) }) }
            row.environment = report.environment
            row.fontDenials = report.network.denials
            row.fixture = { ...report.fixtureNavigations.at(-1) }
            row.fontCounts = FONT_URLS.map(url => ({ url, count: report.network.denials.filter(item => item.url === url).length }))
            report.rows.push(row)
            await writeFile(join(args.out, `${name}.json`), JSON.stringify(row, null, 2), { flag: 'wx' })
            checkAction(row)
            await evaluate(cdp, session, `Object.assign(window.__saveProbe,{phase:'fixture',fault:null})`)
        }
        const fileChoosers = [], dialogs = []
        let dialogControl = null
        cdp.handlers.push(message => {
            if (message.sessionId !== session) return
            if (message.method === 'Page.fileChooserOpened') fileChoosers.push(message.params)
            if (message.method === 'Page.javascriptDialogOpening') {
                dialogs.push(message.params)
                Object.assign(dialogControl, { dialog: message.params, opened: Date.now() })
                const job = (async () => {
                    assert(dialogControl, 'Unexpected native dialog')
                    try {
                        if (dialogControl.conflict) {
                            dialogControl.independentChange = { session: observerSession, dialogOpen: true, before: await evaluate(cdp, observerSession, 'Object.fromEntries(Object.keys(localStorage).map(key=>[key,localStorage.getItem(key)]))') }
                            dialogControl.independentChange.map = await evaluate(cdp, observerSession, `(() => {localStorage.setItem('gampo_probe_a','concurrent bytes');return Object.fromEntries(Object.keys(localStorage).map(key=>[key,localStorage.getItem(key)]));})()`)
                            Object.assign(dialogControl.independentChange, { acknowledged: true, at: Date.now() })
                        }
                    } finally { await cdp.send('Page.handleJavaScriptDialog', { accept: dialogControl.accept }, session); dialogControl.acceptedAt = Date.now() }
                })(); pendingEvents.add(job); job.finally(() => pendingEvents.delete(job)).catch(error => report.runtimeErrors.push(error.message))
            }
        })
        await cdp.send('Page.setInterceptFileChooserDialog', { enabled: true }, session)
        async function importCase(name, data, { before = { gampo_probe_a: 'old-a', gampo_probe_b: 'old-b', foreign: 'keep' }, accept = false, conflict = false, fault = null, invalid = false, rawText, extra = {}, oversize = false, label = 'Import', rollbackFailed = false } = {}) {
            if (args.case && args.case !== name) return
            await seed(before)
            const text = rawText ?? JSON.stringify({ app: 'gampo', kind: 'save', version: 1, data, ...extra })
            const path = join(temp, `${name}.json`)
            await writeFile(path, text)
            const removed = Object.keys(managed(before)).filter(key => !Object.hasOwn(data, key))
            const added = Object.keys(data).filter(key => !Object.hasOwn(before, key))
            const expectsDialog = !invalid && (removed.length > 0 || added.length > 0)
            const dialogExpected = expectsDialog ? `Replace saved data?\nRemoved keys: ${removed.join(', ') || '(none)'}\nAdded keys: ${added.join(', ') || '(none)'}` : null
            dialogControl = { accept, conflict }
            report.activeCase = { name, before, dialogControl, started: Date.now(), path, bytes: Buffer.byteLength(text), sha256: sha256(text) }
            report.activeCase.observer = report.observer
            const starts = { dialogs: dialogs.length, chooser: fileChoosers.length, downloads: downloadEvents.length, navigation: navigationEvents.length, errors: report.runtimeErrors.length, network: report.unexpectedNetwork.length }
            const beforeFiles = await readdir(downloads)
            await evaluate(cdp, session, `Object.assign(window.__saveProbe,{phase:'action',fault:${JSON.stringify(fault)},failed:false,calls:[],textCalls:[]})`)
            await click(label)
            const chooser = await until(() => fileChoosers[starts.chooser], 'actual native file chooser')
            await cdp.send('DOM.setFileInputFiles', { files: [path], backendNodeId: chooser.backendNodeId }, session)
            await until(() => evaluate(cdp, session, `document.querySelector('input[type=file]').value === ''`), `${name} real callback completion`)
            const resolvedNotice = await until(async () => {
                const value = await notice()
                report.activeCase.lastNotice = value
                if (invalid || conflict || fault) return value.tone === 'err' ? value : false
                return /Import cancelled|Restored/.test(value.text) ? value : false
            }, `${name} current outcome`)
            const resolution = Date.now()
            const after = await snapshot()
            const calls = await evaluate(cdp, session, 'window.__saveProbe.calls')
            const textCalls = await evaluate(cdp, session, 'window.__saveProbe.textCalls')
            const successReload = !invalid && !conflict && !fault && (!expectsDialog || accept)
            await sleep(1150)
            const navigations = navigationEvents.slice(starts.navigation)
            const foreign = Object.fromEntries(Object.entries(before).filter(([key]) => !key.startsWith('gampo_')))
            let expectedMap = successReload ? { ...foreign, ...data } : before
            if (conflict) expectedMap = { ...before, gampo_probe_a: 'concurrent bytes' }
            if (rollbackFailed) expectedMap = { foreign: 'keep' }
            const row = { name, data, accept, conflict, fault, before, after, expectedMap, laterMap: await snapshot(), noWrites: invalid || conflict || (expectsDialog && !accept), error: invalid || conflict || Boolean(fault), declined: !invalid && !conflict && !fault && expectsDialog && !accept, successReload, restored: Object.keys(data).length, observedMs: Date.now() - resolution, navigationDelay: navigations[0] ? navigations[0].proofTime - resolution : null, navigations, runtimeErrors: report.runtimeErrors.slice(starts.errors), unexpectedNetwork: report.unexpectedNetwork.slice(starts.network), calls, textCalls, oversize, dialogs: dialogs.slice(starts.dialogs), dialogExpected, downloads: [], downloadEvents: downloadEvents.slice(starts.downloads), newDownloadFiles: (await readdir(downloads)).filter(path => !beforeFiles.includes(path)), notice: resolvedNotice, environment: report.environment }
            if (!successReload) row.calls = await evaluate(cdp, session, 'window.__saveProbe.calls')
            row.file = { path, bytes: Buffer.byteLength(text), sha256: sha256(text), chooser, realFileInput: true }
            row.fontDenials = report.network.denials
            if (conflict) row.independentChange = dialogControl.independentChange
            row.observerCalls = await evaluate(cdp, observerSession, 'window.__saveProbe.calls')
            row.fixture = { ...report.fixtureNavigations.at(-1) }
            row.fontCounts = FONT_URLS.map(url => ({ url, count: report.network.denials.filter(item => item.url === url).length }))
            row.hostLedger = { file: 'host-ledger.jsonl', summary: summarizeHostLedger(hostSink.entries) }
            report.rows.push(row)
            await writeFile(join(args.out, `${name}.json`), JSON.stringify(row, null, 2), { flag: 'wx' })
            if (successReload) assert.equal(row.laterMap.foreign, 'keep', `${name}: foreign key survives reload`)
            checkAction(row)
            if (fault) assert(writes(calls).length > 0, 'Apply/rollback fault did not reach writes')
            if (!oversize) assert(textCalls.some(call => call.phase === 'action'), 'Real File.text pass-through not exercised')
            if (rollbackFailed) assert.match(row.notice.text, /rollback failed/i)
            if (fault && !rollbackFailed) assert.match(row.notice.text, /previous save was restored/i)
            await evaluate(cdp, session, `Object.assign(window.__saveProbe,{phase:'fixture',fault:null})`)
            if (successReload) await until(() => evaluate(cdp, session, `Boolean(document.querySelector('.settings-page'))`), 'successful Settings reload')
            report.activeCase = null
            dialogControl = null
        }
        await exportCase('exportHealthy', null, undefined, 'Export save file')
        await exportCase('exportEmptyProfile', null, { foreign: 'keep' })
        await exportCase('exportAbsent', null, { gampo_probe_a: 'one', foreign: 'keep' })
        await exportCase('exportRawNull', null, { gampo_raw_null: 'null', foreign: 'keep' })
        for (const [name, fault] of [['exportM1', 'unavailable'], ['exportM2', 'key'], ['exportM2Length', 'length'], ['exportM3', 'getItem'], ['exportEnumeratedNull', 'actual-null'], ['currentErrorM1', 'unavailable'], ['currentErrorM2', 'key'], ['currentErrorM3', 'getItem']]) await exportCase(name, fault, undefined, 'Export save', name.startsWith('currentError'))
        await importCase('importOversize', {}, { invalid: true, oversize: true, rawText: ' '.repeat(MAX_BYTES + 1) })
        for (const [name, data] of [['importConfirmEmpty', {}], ['importConfirmPartial', { gampo_probe_b: 'new-b' }], ['importAddedOnly', { gampo_probe_a: 'new-a', gampo_probe_b: 'new-b', gampo_new: 'added' }], ['importSameSizeDifferentKeys', { gampo_new: 'new', gampo_other: 'other' }], ['importOverlapping', { gampo_probe_b: 'new-b', gampo_new: 'new' }]]) {
            await importCase(name, data)
            await importCase(`${name}Accepted`, data, { accept: true, label: 'Import save file' })
        }
        await importCase('importBeforeimageConflict', { gampo_new: 'new' }, { accept: true, conflict: true })
        await importCase('importSemanticReject', { gampo_credits: 'Infinity' }, { invalid: true })
        await importCase('importSportsbookReject', { gampo_sportsbook_tickets_v2: '{"version":2,"savedAt":1,"tickets":[{}]}' }, { invalid: true })
        await importCase('importIncompleteReject', {}, { invalid: true, extra: { complete: false } })
        await importCase('importMalformed', {}, { invalid: true, rawText: '{bad' })
        await importCase('importNoReloadOnFailure', { gampo_new: 'new' }, { accept: true, fault: 'write' })
        await importCase('importRemoveFailure', { gampo_new: 'new' }, { accept: true, fault: 'remove' })
        await importCase('importRollbackFailed', { gampo_new: 'new' }, { accept: true, fault: 'rollback', rollbackFailed: true })
        await importCase('importLegacy', { gampo_legacy: 'ordinary unproven input' }, { accept: true, extra: { version: 0 } })
        await importCase('importRawNullRestore', { gampo_raw_null: 'null' }, { accept: true })
        await importCase('importSuccessReload', { gampo_credits: '1250.5' }, { accept: true })
        report.loadedAssets = loadedAssets
        await Promise.all(pendingEvents)
        checkNetwork(report.network)
        assert(!report.requests.some(request => request.failure), 'Static server identity failure')
        assert.equal(report.runtimeErrors.length, 0, 'Runtime errors across whole mount/action lifetime')
        assert.equal(report.unexpectedNetwork.length, 0, 'Unexpected network across lifetime')
        for (const asset of loadedAssets) if (asset.url.startsWith(origin)) assert(asset.sha256, `Missing loaded-byte identity ${asset.url}`)
        assert.deepEqual(await files(args.dist), report.manifest.dist, 'Built manifest changed during run')
        for (const pin of report.fontSourcePins) assert.equal(sha256(await readFile(join(ROOT, pin.path))), pin.sha256, 'Font source changed during run')
        for (const pin of report.manifest.source) assert.equal(sha256(await readFile(join(ROOT, pin.path))), pin.sha256, 'Source changed during run')
        report.terminals = await restoreTerminals(cdp, report)
        await cdp.send('Target.closeTarget', { targetId })
        await cdp.send('Target.closeTarget', { targetId: observerTarget })
        report.browserLog = browserLog
    } catch (error) {
        failure = error; report.failure = error.stack || String(error)
        report.hostLedgerPending = true
        if (cdp && report.activeCase) {
            try {
                report.activeCase.observed = await evaluate(cdp, report.network.owned.session, `({calls:window.__saveProbe?.calls,map:Object.fromEntries(Object.keys(localStorage).map(key=>[key,localStorage.getItem(key)])),notice:document.querySelector('.settings-notice')?.textContent})`)
            } catch (captureError) { report.activeCase.captureError = captureError.message }
        }
    }
    finally {
        try {
        // Terminal cutoff: restore BOTH owned documents while CDP is still connected,
        // take each document's acknowledged terminal docSeq, then await every admitted
        // binding job and the actual WebSocket close before the ledger is hashed.
        if (cdp && !report.terminals) report.terminals = await restoreTerminals(cdp, report).catch(error => { report.cutoffError = error.stack || String(error); failure ||= error; return [] })
        try { await cdp?.close() } catch (error) { report.cleanupError = error.message; failure ||= error }
        try {
            await Promise.all(pendingHostWrites)
            await hostSink.drain()
            for (const terminal of report.terminals || []) {
                const last = [...hostSink.entries].reverse().find(entry => entry.payload?.doc === terminal.doc)
                if (!last || last.payload.docSeq !== terminal.docSeq) { report.cutoffMismatch = report.cutoffMismatch || []; report.cutoffMismatch.push({ terminal, last: last?.payload || null }); failure ||= new Error(`Cutoff mismatch for ${terminal.doc}`) }
            }
            report.hostLedger = { path: hostSink.path, sha256: sha256(await readFile(hostSink.path)), entries: hostSink.entries.length, summary: summarizeHostLedger(hostSink.entries) }
        } catch (error) { report.hostLedgerError = error.stack || String(error); failure ||= error }
        try { await hostSink?.close() } catch (error) { report.cleanupError = error.stack || String(error); failure ||= error }
        if (browser) {
            if (browser.exitCode === null && browser.signalCode === null) { browser.kill('SIGTERM'); await Promise.race([once(browser, 'exit'), sleep(3000)]) }
            if (browser.exitCode === null && browser.signalCode === null) { browser.kill('SIGKILL'); await once(browser, 'exit') }
            cleanup.browser = browser.exitCode !== null || browser.signalCode !== null
        }
        if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); cleanup.server = !server.listening }
        if (cleanup.browser) { await rm(profile, { recursive: true, force: true }); cleanup.profile = !existsSync(profile); await rm(temp, { recursive: true, force: true }); cleanup.temp = !existsSync(temp) }
        } catch (error) {
            report.cleanupError = error.stack || String(error)
            failure ||= error
            report.failure ||= error.stack || String(error)
        } finally {
            await writeFile(join(args.out, 'report.json'), JSON.stringify(report, null, 2), { flag: 'wx' })
        }
    }
    if (failure) throw failure
    checkReport(report, args.case ? [args.case] : REQUIRED)
    console.log(`Save native ${args.case ? 'SCOPED DIAGNOSTIC' : 'PASS'} ${report.rows.length} scenarios; ${report.browser.Browser}`)
}

async function main() {
    const args = parseArgs(process.argv.slice(2))
    assert(!existsSync(args.out), 'Output exists; retain immutable evidence and use a new --out')
    await mkdir(args.out, { recursive: true })
    if (args.selfTest) return selfTest(args.out)
    return native(args)
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1 })
