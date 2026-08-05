// Native unit test for the slots accounting probe's storage comparator.
// Runs with plain `node` — no browser, no test framework, no dependency.
// Proves: managed-key filtering, exact key-set equality, parsed-JSON deep
// equality, non-JSON exact-string fallback, and that byte equality is never
// the assertion.

import { strict as assert } from 'node:assert'
import {
    compareManagedStorage,
    compareUnmanagedStorage,
    equalSemanticManagedStorage,
    managedKeys,
    semanticSnapshot,
    semanticValue,
} from './slotsAccountingProbe.mjs'

// --- semanticValue classification ------------------------------------------

assert.deepEqual(semanticValue('{"a":1}'), { kind: 'json', value: { a: 1 } })
assert.deepEqual(semanticValue('minimized'), { kind: 'string', value: 'minimized' })
assert.deepEqual(semanticValue('0'), { kind: 'json', value: 0 }, 'a bare numeric string parses as JSON')
assert.deepEqual(semanticValue(undefined), { kind: 'absent', value: null }, 'missing values are absent, not strings')

// --- byte-difference tolerance (the core requirement) ----------------------

assert.equal(equalSemanticManagedStorage(
    { gampo_state: '{"coins":100,"history":[1,2]}', gampo_raw: 'keep' },
    { gampo_raw: 'keep', gampo_state: '{ "history": [1, 2], "coins": 100 }' },
), true, 'JSON must compare semantically despite key order and whitespace byte differences')

assert.equal(equalSemanticManagedStorage(
    { gampo_num: '1.50' },
    { gampo_num: '1.5' },
), true, 'JSON number reserialization must not fail semantic equality')

assert.notEqual(
    JSON.stringify({ gampo_state: '{"coins":100,"history":[1,2]}' }),
    JSON.stringify({ gampo_state: '{ "history": [1, 2], "coins": 100 }' }),
    'the byte-equal comparison this comparator replaces would have failed the case above',
)

// --- real value mismatches still fail --------------------------------------

assert.equal(equalSemanticManagedStorage(
    { gampo_state: '{"coins":100}' },
    { gampo_state: '{"coins":101}' },
), false, 'different parsed JSON must fail')

assert.equal(equalSemanticManagedStorage(
    { gampo_state: '{"a":{"b":[1,2]}}' },
    { gampo_state: '{"a":{"b":[1,3]}}' },
), false, 'nested JSON differences must fail')

assert.equal(equalSemanticManagedStorage(
    { gampo_chat_dock_state: 'minimized' },
    { gampo_chat_dock_state: 'expanded' },
), false, 'non-JSON values must compare as exact strings')

assert.equal(equalSemanticManagedStorage(
    { gampo_raw: 'v001' },
    { gampo_raw: 'v1' },
), false, 'non-JSON fallback must not be normalized')

assert.equal(equalSemanticManagedStorage(
    { gampo_kind: '"1"' },
    { gampo_kind: '1' },
), false, 'a JSON string and a JSON number must not compare equal')

// --- key-set equality ------------------------------------------------------

assert.equal(equalSemanticManagedStorage({ gampo_one: '1' }, { gampo_two: '1' }), false, 'managed key sets must match exactly')
assert.equal(equalSemanticManagedStorage({ gampo_one: '1' }, { gampo_one: '1', gampo_two: '2' }), false, 'an extra managed key must fail')
assert.equal(equalSemanticManagedStorage({ gampo_one: '1', gampo_two: '2' }, { gampo_one: '1' }), false, 'a missing managed key must fail')
assert.equal(equalSemanticManagedStorage({}, {}), true, 'two empty managed sets are equal')

// --- managed-key filtering is enforced inside the comparator ---------------

assert.equal(equalSemanticManagedStorage(
    { gampo_state: '{"ok":true}', foreign: 'before' },
    { gampo_state: '{"ok":true}', foreign: 'after' },
), true, 'non-gampo_ keys must be ignored by the managed comparator')

assert.deepEqual(managedKeys({ zzz: '1', gampo_b: '2', gampo_a: '3', other: '4' }), ['gampo_a', 'gampo_b'], 'managed keys are filtered and sorted')

assert.deepEqual(semanticSnapshot({ foreign: '{"ignored":true}', gampo_state: '{"ok":true}', gampo_raw: 'x' }), {
    gampo_raw: { kind: 'string', value: 'x' },
    gampo_state: { kind: 'json', value: { ok: true } },
}, 'the semantic snapshot is managed-only and key-sorted')

// --- diagnostic detail on the comparison result ----------------------------

const diff = compareManagedStorage(
    { gampo_keep: '{"a":1}', gampo_gone: 'x', gampo_changed: '{"n":1}' },
    { gampo_keep: '{ "a": 1 }', gampo_changed: '{"n":2}', gampo_new: 'y' },
)
assert.equal(diff.equal, false)
assert.equal(diff.keySetEqual, false)
assert.deepEqual(diff.missing, ['gampo_gone'])
assert.deepEqual(diff.unexpected, ['gampo_new'])
assert.deepEqual(diff.mismatched.map(item => item.key), ['gampo_changed'])
assert.equal(diff.byteEqualityAsserted, false, 'the comparison result must record that byte equality is unasserted')

// --- unmanaged storage comparison (C3 proof) -------------------------------

const untouched = compareUnmanagedStorage(
    { foreign: 'keep', other: '1', gampo_x: 'a' },
    { foreign: 'keep', other: '1', gampo_x: 'CHANGED' },
)
assert.equal(untouched.equal, true, 'managed changes must not register as unmanaged mutation')

const collateral = compareUnmanagedStorage({ foreign: 'keep' }, { foreign: 'clobbered' })
assert.equal(collateral.equal, false)
assert.deepEqual(collateral.changed, ['foreign'])

const removedForeign = compareUnmanagedStorage({ foreign: 'keep' }, {})
assert.equal(removedForeign.equal, false, 'a deleted unmanaged key must be detected')

console.log('slots-accounting-probe comparator: 26 assertions passed (managed filtering, exact key sets, parsed JSON equality, raw-string fallback, byte-equality tolerance, unmanaged-mutation detection)')
