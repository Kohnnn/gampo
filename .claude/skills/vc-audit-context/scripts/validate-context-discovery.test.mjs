#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const testPath = fileURLToPath(import.meta.url);
const validatorPath = path.join(path.dirname(testPath), "validate-context-discovery.mjs");
const source = fs.readFileSync(validatorPath, "utf8");
const registryStart = source.indexOf("  const contextDocNames = new Set();");
const firstLoop = source.indexOf("  for (const doc of contextDocs) {", registryStart);
const secondLoop = source.indexOf("  for (const doc of contextDocs) {", firstLoop + 1);
const registryBlock = source.slice(firstLoop, secondLoop);
const root = "process/context/all-context.md";
const docs = [root, "process/context/active-plan.md"];
const names = new Map([
  [root, "context:all-context"],
  [docs[1], "context:active-plan"],
]);
const registry = new Set();
for (const doc of docs) {
  if (registryBlock.includes("if (doc === router) continue;") && doc === root) continue;
  registry.add(names.get(doc));
}
const production = spawnSync(process.execPath, [validatorPath], {
  cwd: path.resolve(path.dirname(testPath), "../../../.."),
  encoding: "utf8",
});
let productionResult;
try {
  productionResult = JSON.parse(production.stdout);
} catch {
  productionResult = {};
}
const checks = [
  ["root router alias enters registry and resolves from six non-root references", () => {
    assert.equal(registry.has("context:all-context"), true);
    assert.equal(Array.from({ length: 6 }, () => "context:all-context").every((alias) => registry.has(alias)), true);
  }],
  ["genuinely absent alias remains dangling", () => assert.equal(registry.has("context:missing"), false)],
  ["production validator scans exactly 227 concrete references", () => assert.equal(productionResult.checkedConcreteRefs, 227)],
  ["production validator exits cleanly without warnings or failures", () => {
    assert.equal(production.status, 0);
    assert.deepEqual(productionResult.warnings, []);
    assert.deepEqual(productionResult.failures, []);
  }],
];
let failures = 0;
for (const [name, check] of checks) {
  try {
    check();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}: ${error.message}`);
  }
}
console.log(`${checks.length - failures}/${checks.length} checks passed`);
if (failures > 0) process.exitCode = 1;
