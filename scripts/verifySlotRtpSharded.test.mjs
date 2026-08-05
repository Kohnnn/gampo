import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runShardedVerifier } from './verifySlotRtpSharded.mjs'

const tempRoot = mkdtempSync(join(tmpdir(), 'gampo-slot-rtp-sharded-'))
const fixture = `
const id = process.env.SLOT_VER_ONLY
const delay = Number(process.env.FIXTURE_DELAY || 0)
setTimeout(() => {
    if (id === 'silent') process.exit(0)
    if (id === 'off') {
        console.log(id + '  94.5  90.0  !! OFF')
        console.log('SOME TEMPLATES OFF — recalibrate')
        process.exit(0)
    }
    console.log('env=' + id)
    console.log(id + '  94.5  94.5  ok')
    console.log('ALL TEMPLATES WITHIN TOLERANCE')
}, delay)
`

function fixtureArgs() {
    return ['--input-type=module', '--eval', fixture]
}

try {
    const starts = []
    let active = 0
    let maximumActive = 0
    const passing = await runShardedVerifier({
        templateIds: ['one', 'two', 'three', 'four'],
        concurrency: 2,
        argsForTemplate: fixtureArgs,
        envForTemplate: (id) => ({ ...process.env, SLOT_VER_ONLY: id, FIXTURE_DELAY: '30' }),
        outputPath: join(tempRoot, 'passing.json'),
        onStart: (id) => {
            starts.push(id)
            active += 1
            maximumActive = Math.max(maximumActive, active)
        },
        onExit: () => { active -= 1 },
    })
    assert.equal(passing.passed, true)
    assert.equal(maximumActive <= 2, true)
    assert.deepEqual(starts.sort(), ['four', 'one', 'three', 'two'])
    assert.equal(passing.results.every(result => result.stdout.includes(`env=${result.id}`)), true)
    assert.equal(JSON.parse(readFileSync(join(tempRoot, 'passing.json'), 'utf8')).results.length, 4)

    const failing = await runShardedVerifier({
        templateIds: ['ok', 'off', 'silent'],
        concurrency: 2,
        argsForTemplate: fixtureArgs,
        envForTemplate: (id) => ({ ...process.env, SLOT_VER_ONLY: id }),
        outputPath: join(tempRoot, 'failing.json'),
    })
    assert.equal(failing.passed, false)
    assert.equal(failing.results.find(result => result.id === 'off').passed, false)
    assert.equal(failing.results.find(result => result.id === 'silent').parsedVerdict, null)
    assert.equal(failing.results.find(result => result.id === 'silent').passed, false)

    const launcherUrl = pathToFileURL(join(process.cwd(), 'scripts', 'verifySlotRtpSharded.mjs')).href
    const failClosedCli = spawnSync(process.execPath, ['--input-type=module', '--eval', `
        import { runShardedVerifier } from '${launcherUrl}'
        const fixture = ${JSON.stringify(fixture)}
        const aggregate = await runShardedVerifier({
            templateIds: ['off', 'silent'],
            argsForTemplate: () => ['--input-type=module', '--eval', fixture],
            envForTemplate: (id) => ({ ...process.env, SLOT_VER_ONLY: id }),
            outputPath: ${JSON.stringify(join(tempRoot, 'cli-failing.json'))},
        })
        process.exitCode = aggregate.passed ? 0 : 1
    `], { encoding: 'utf8' })
    assert.notEqual(failClosedCli.status, 0, failClosedCli.stdout + failClosedCli.stderr)
    console.log('slot-rtp-sharded: bounded queue, SLOT_VER_ONLY isolation, non-ok verdict, silent child, and non-zero aggregate fail-closed checks passed')
} finally {
    rmSync(tempRoot, { recursive: true, force: true })
}
