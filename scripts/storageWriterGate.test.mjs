// Self-test for scripts/storageWriterGate.mjs (gate D1-4).
//
// A gate nobody has seen fail is not a gate. Every case here asserts a specific
// exit code or problem list, including a real mutation of a real file: the gate
// must go red when a new raw writer is added to `src/`, and green again once the
// mutation is reverted. The mutation is restored in a `finally` so a failing
// assertion cannot leave the tree dirty.

import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compareToBaseline, countWriterSites } from './storageWriterGate.mjs'

const GATE = fileURLToPath(new URL('./storageWriterGate.mjs', import.meta.url))
const TARGET = fileURLToPath(new URL('../src/components/games/primitives/useGameSession.js', import.meta.url))

function run(args = [], cwd = process.cwd()) {
    const result = spawnSync(process.execPath, [GATE, ...args], { cwd, encoding: 'utf8' })
    return { code: result.status, out: `${result.stdout}${result.stderr}` }
}

function fixture(files) {
    const root = mkdtempSync(join(tmpdir(), 'storage-writer-gate-'))
    for (const [name, body] of Object.entries(files)) {
        const dir = join(root, 'src', name.split('/').slice(0, -1).join('/'))
        mkdirSync(dir, { recursive: true })
        writeFileSync(join(root, 'src', name), body)
    }
    return root
}

// An opening brace in a regex must not hide a later, real writer.
{
    const source = 'const value = `${/{/.test("x")}${Boolean(/[\\/{]/.test("/"))}`\n'
    const root = fixture({ 'case.js': source })
    try {
        const negative = run([], root)
        assert.equal(negative.code, 0, negative.out)
        writeFileSync(join(root, 'src', 'case.js'), `${source}localStorage.setItem('k', 'v')\n`)
        const positive = run([], root)
        assert.equal(positive.code, 1, `writer after template must fail the gate: ${positive.out}`)
        assert.match(positive.out, /NEW unguarded writer: src\/case\.js \(1 site\)/)
        writeFileSync(join(root, 'src', 'case.js'), 'const value = `${"x" / localStorage.setItem("k", "v") / 2}`\n')
        const division = run([], root)
        assert.equal(division.code, 1, `division must not hide an interpolated writer: ${division.out}`)
        assert.match(division.out, /NEW unguarded writer: src\/case\.js \(1 site\)/)
    } finally {
        rmSync(root, { recursive: true, force: true })
    }
}

// --- unit: counting and comment stripping ---------------------------------

{
    const root = fixture({
        'a.js': 'localStorage.setItem("k", "v")\nlocalStorage.removeItem("k")\n',
        'b.js': '// localStorage.setItem("k","v")\n/* localStorage.clear() */\nconst x = 1\n',
        'utils/storage.js': 'localStorage.setItem("k", "v")\n',
        'c.test.js': 'localStorage.setItem("k", "v")\n',
    })
    try {
        const counts = countWriterSites(['a.js', 'b.js', 'utils/storage.js', 'c.test.js'].map(f => join(root, 'src', f)), root)
        assert.deepEqual(counts, { 'src/a.js': 2 }, 'comments, the wrapper and tests must not count')
    } finally {
        rmSync(root, { recursive: true, force: true })
    }
}

// --- unit: the scanner must not invent or hide a call site ---------------
//
// A regex could not do this: `//` inside a URL is not a comment, and a
// writer-shaped token inside a string is not a writer. Both were miscounted by
// an earlier version.
{
    const cases = [
        ['real call', "localStorage.setItem('k','v')", 1],
        ['commented out', "// localStorage.setItem('k','v')", 0],
        ['block commented', "/* localStorage.setItem('k','v') */", 0],
        ['url then call', "const u='https://host/x'\nlocalStorage.setItem('k','v')", 1],
        ['token inside a string', "const s='https://h/localStorage.setItem(x)'", 0],
        ['trailing comment', "localStorage.setItem('a','b') // localStorage.clear()", 1],
        ['template literal', 'const t=`x ${1} localStorage.clear()`', 0],
        ['interpolated writer', 'const t=`prefix ${localStorage.setItem("k", "v")} localStorage.clear()`', 1],
        ['nested interpolation writer', 'const t=`a ${{ k: `b ${localStorage.removeItem("k")}` }.k} localStorage.setItem("x","y")`', 1],
        ['escaped quote', "const s='it\\'s // local'\nlocalStorage.setItem('k','v')", 1],
    ]
    const root = mkdtempSync(join(tmpdir(), 'storage-writer-gate-strip-'))
    mkdirSync(join(root, 'src'), { recursive: true })
    try {
        for (const [name, code, want] of cases) {
            const file = join(root, 'src', 'case.js')
            writeFileSync(file, code)
            const counts = countWriterSites([file], root)
            assert.equal(counts['src/case.js'] ?? 0, want, `${name}: expected ${want} site(s)`)
        }
    } finally {
        rmSync(root, { recursive: true, force: true })
    }
}

// --- unit: baseline comparison -------------------------------------------

{
    assert.deepEqual(compareToBaseline({ 'src/a.js': 1 }, { 'src/a.js': 1 }).problems, [])

    const grown = compareToBaseline({ 'src/a.js': 2 }, { 'src/a.js': 1 })
    assert.match(grown.problems[0], /GREW: src\/a\.js 1 -> 2/)

    const added = compareToBaseline({ 'src/new.js': 1 }, {})
    assert.match(added.problems[0], /NEW unguarded writer/)

    const shrunk = compareToBaseline({ 'src/a.js': 1 }, { 'src/a.js': 3 })
    assert.deepEqual(shrunk.problems, [])
    assert.deepEqual(shrunk.reduced, ['src/a.js'])
}

// --- end-to-end: exit 2 when there is nothing to scan --------------------

{
    const root = fixture({ 'placeholder.txt': '' })
    try {
        const { code, out } = run([], root)
        assert.equal(code, 2, out)
        assert.match(out, /nothing was verified/)
    } finally {
        rmSync(root, { recursive: true, force: true })
    }
}

// --- end-to-end: red then green on the real repository -------------------

{
    const green = run()
    assert.equal(green.code, 0, `baseline must be clean before the mutation: ${green.out}`)
    assert.match(green.out, /no new debt/)

    const strict = run(['--strict'])
    assert.equal(strict.code, 1, 'committed debt must fail --strict')
    assert.match(strict.out, /--strict requires zero debt/)

    const before = readFileSync(TARGET, 'utf8')
    try {
        writeFileSync(TARGET, `${before}\nlocalStorage.setItem('__gate_probe__', '1')\n`)
        const red = run()
        assert.equal(red.code, 1, `adding a raw writer must fail the gate: ${red.out}`)
        assert.match(red.out, /GREW: src\/components\/games\/primitives\/useGameSession\.js 1 -> 2/)
    } finally {
        writeFileSync(TARGET, before)
    }

    const restored = run()
    assert.equal(restored.code, 0, `gate must be green again after revert: ${restored.out}`)
}

console.log('storageWriterGate.test: all assertions passed')
