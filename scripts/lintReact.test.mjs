import { strict as assert } from 'node:assert'
import { ESLint } from 'eslint'
import { resolve } from 'node:path'

const eslint = new ESLint({
    cwd: process.cwd(),
    overrideConfigFile: resolve('eslint.config.js'),
})

async function lint(code) {
    const [result] = await eslint.lintText(code, { filePath: 'src/lint-react-fixture.jsx' })
    return result.messages.filter((message) => message.ruleId === 'no-unused-vars')
}

const jsxReference = await lint(`
const Widget = () => null
export default function Fixture() {
    return <Widget />
}
`)
assert.equal(jsxReference.length, 0, JSON.stringify(jsxReference))

const unusedLocal = await lint(`
const unusedLocal = true
export default function Fixture() {
    return <div />
}
`)
assert.equal(unusedLocal.length, 1, JSON.stringify(unusedLocal))
assert.match(unusedLocal[0].message, /unusedLocal/)

const unusedReactImport = await lint(`
import React from 'react'
export default function Fixture() {
    return <div />
}
`)
assert.equal(unusedReactImport.length, 1, JSON.stringify(unusedReactImport))
assert.match(unusedReactImport[0].message, /React/)

const unusedNamedReactImport = await lint(`
import { Component } from 'react'
export default function Fixture() {
    return <div />
}
`)
assert.equal(unusedNamedReactImport.length, 1, JSON.stringify(unusedNamedReactImport))
assert.match(unusedNamedReactImport[0].message, /Component/)

console.log('lint-react: JSX component reference passes; unused local and default/named automatic-runtime React imports all fail')
