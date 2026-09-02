#!/usr/bin/env node
/**
 * Validate the Execution Authority & Evidence Envelope of a selected plan.
 *
 * FILE FORMAT CONTRACT
 * --------------------
 * The plan markdown must contain a `## Validate Contract` section holding
 * exactly one fenced block labelled:
 *
 *   ```json execution-authority-envelope/v1
 *   { ...legacy or temporary branch fields... }
 *   ```
 *
 * The fence label is envelope metadata, not a business field. With
 * `authorityClass` absent, the object accepts exactly these six legacy fields:
 *
 *   selected_plan            repo-relative path to the plan being executed
 *   authority_mode           { mode, proof_path } — no other keys
 *   allowed_scope            non-empty array of exact paths or `dir/**` subtrees
 *   stop_conditions          non-empty array of non-empty strings
 *   artifact_path            exact path, equal to the schema-selected plan destination
 *   artifact_schema_version  "phase-report/v1" or "phase-report-correction/v1"
 *
 * `authorityClass: "temporary-artifact-set/v1"` selects the exact eight-field
 * temporary branch documented by the selected plan and vc-audit-vc skill.
 *
 * `authority_mode.mode` is the closed set:
 *   standing-granted    proof_path must exist, pass the autopilot goal-block
 *                       validator, and carry the exact consent string
 *                       "EXECUTE CONSENT: standing-granted"
 *   explicit-per-phase  proof_path must exist and record the exact phrase
 *                       "ENTER EXECUTE MODE" bound to selected_plan
 *
 * All paths normalize `\` to `/` and must be repo-relative POSIX paths.
 * Absolute, UNC, drive-qualified, empty, NUL-bearing, `.`/`..`-bearing,
 * duplicate, and glob-bearing paths are rejected; the only permitted glob is a
 * single trailing `/**` on an allowed_scope entry.
 *
 * USAGE
 *   node validate-execution-authority-envelope.mjs <plan-path>
 *   node validate-execution-authority-envelope.mjs --fixtures <fixture-dir>
 *
 * EXIT
 *   0  envelope valid (or all fixture expectations met)
 *   1  blocked — emits:
 *      AUTHORITY_ENVELOPE_BLOCKED: <reason>. Remediation: ...
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  decodeLiteralInput,
  parseTarEntries,
  createEvidenceArtifact,
  runDiagnosticLifecycle,
  validateDiagnosticRegistry as validateDiagnosticRegistryContract,
  executeDiagnosticRegistry,
  validateCommandRegistry,
  validateRoleRoots,
  freezeBoundedRegistry,
  commandRegistryFixture,
} from "./run-repository-diagnostic-evidence.mjs";

const ROOT = process.cwd();

const REMEDIATION =
  "Remediation: correct the selected plan, authority proof, normalized allowed scope, " +
  "stop conditions, artifact path, report or correction destination, or schema version in this plan's Validate Contract; " +
  "rerun the validator; do not execute or write the report or correction until it exits 0.";

const ENVELOPE_SCHEMA = "execution-authority-envelope/v1";
const ENVELOPE_SCHEMA_PREFIX = "execution-authority-envelope/";
const ARTIFACT_SCHEMAS = {
  "phase-report/v1": { destinationKind: "Report", destinationLabel: "Report destination" },
  "phase-report-correction/v1": { destinationKind: "Correction", destinationLabel: "Correction destination" },
};
const REQUIRED_FIELDS = [
  "selected_plan",
  "authority_mode",
  "allowed_scope",
  "stop_conditions",
  "artifact_path",
  "artifact_schema_version",
];
const TEMP_REQUIRED_FIELDS = [
  "selected_plan",
  "authority_mode",
  "authorityClass",
  "allowed_scope",
  "scope_count",
  "stop_conditions",
  "stop_condition_count",
  "artifact_receipt_schema_version",
];
const TEMP_TARGET_KEYS = ["artifact_path", "artifact_schema_version"];
const TEMP_AUTHORITY_CLASS = "temporary-artifact-set/v1";
const TEMP_RECEIPT_SCHEMA = "execution-temp-artifact-receipt/v1";
const TEMP_ROOT = "C:\\Users\\Admin\\AppData\\Local\\Temp\\opencode";
const DIAGNOSTIC_AUTHORITY_CLASS = "repository-diagnostic-evidence-set/v1";
const DIAGNOSTIC_V2_AUTHORITY_CLASS = "repository-diagnostic-evidence-set/v2";
const COMMAND_HEAD_OID_V2 = "2e19490896ced8eb1d10f809283b160ca40d15d0";
const COMMAND_TREE_OID_V2 = "fe836928c9ce6c154cd080d4280505800b163ad5";
const DIAGNOSTIC_V2_FIELDS = ["selected_plan", "authority_mode", "authorityClass", "operation_root", "registry_root", "runtime_root", "evidence_root", "diagnostic_runner", "diagnostic_registry", "allowed_scope", "scope_count", "stop_conditions", "stop_condition_count", "artifact_receipt_schema_version"];
const DIAGNOSTIC_RUNNER_KEYS = ["schema", "runner_path", "runner_bytes", "runner_sha256", "runner_blob_oid", "runner_commit_oid"];
const DIAGNOSTIC_V2_REGISTRY_KEYS = ["schema", "registry_path", "registry_bytes", "registry_sha256", "row_count", "rows"];
const DIAGNOSTIC_RECEIPT_SCHEMA = "repository-diagnostic-artifact-receipt/v1";
const DIAGNOSTIC_FIELDS = [
  "selected_plan", "authority_mode", "authorityClass", "evidence_root", "diagnostic_registry",
  "allowed_scope", "scope_count", "stop_conditions", "stop_condition_count", "artifact_receipt_schema_version",
];
const DIAGNOSTIC_REGISTRY_KEYS = ["schema", "registry_path", "registry_sha256", "row_count", "rows"];
const DIAGNOSTIC_REGISTRY_ROW_KEYS = ["ordinal", "command_id", "capability", "executable", "argv", "action", "lifecycle", "artifact_roles"];
const DIAGNOSTIC_TARGET_KEYS = ["ordinal", "artifact_path", "artifact_role", "artifact_schema_version", "create_only"];
const DIAGNOSTIC_REGISTRY_SCHEMA = "repository-diagnostic-registry/v1";
const DIAGNOSTIC_REGISTRY_FILE_KEYS = ["schema", "fixture_mode", "rows"];
const DIAGNOSTIC_RECEIPT_KEYS = ["schema", "runnerPath", "runnerSha256", "registryPath", "registrySha256", "executionStatus", "terminalCount", "terminalSha256", "status"];
const DIAGNOSTIC_RECEIPT_SCHEMA_VERSION = "repository-diagnostic-behavioral-execution-receipt/v1";
const DIAGNOSTIC_FIXTURE_PATH = ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/pass-repository-diagnostic-evidence-set.md";
const DIAGNOSTIC_ROLES = new Set(["bootstrap", "terminal", "result", "failure", "cleanup", "manifest", "stdout", "stderr", "row-receipt"]);
const DIAGNOSTIC_ROLE_SCHEMAS = new Map([
  ["bootstrap", "phase02-bootstrap-source/v1"],
  ["terminal", "phase02-executor-terminal/v1"],
  ["result", "phase02-attempt-result/v1"],
  ["failure", "phase02-bootstrap-failure/v1"],
  ["cleanup", "phase02-attempt-cleanup/v1"],
  ["manifest", "phase02-evidence-manifest/v1"],
  ["stdout", "phase02-stdout/v1"],
  ["stderr", "phase02-stderr/v1"],
  ["row-receipt", "phase02-row-receipt/v1"],
]);
const DIAGNOSTIC_PRODUCT_ROOTS = new Set(["src", "public", "server", "netlify", "scripts", "dist", "build", "output"]);
const RUNNER_PATH = ".claude/skills/vc-audit-vc/scripts/run-repository-diagnostic-evidence.mjs";
const RUNNER_SHA256 = "7f3912e772e0d2b5696e8c407037444b9109187582f5b310e2cea4535fe42c1b";
const CLEANUP_AUTHORITY_CLASS = "fixture-residue-cleanup-set/v1";
const CLEANUP_RECEIPT_SCHEMA = "fixture-residue-cleanup-receipt/v2";
const CLEANUP_FIELDS = [
  "selected_plan", "authority_mode", "authorityClass", "repository_root", "allowed_scope",
  "scope_count", "operation_count", "stop_conditions", "stop_condition_count",
  "creation_count", "source_write_count", "cleanup_receipt_schema_version",
];
const CLEANUP_ROOT_KEYS = ["absolute_path", "dev", "ino", "mode_type", "mode", "uid", "gid"];
const CLEANUP_TARGET_KEYS = [
  "ordinal", "basename_b64", "operation", "fixture_family", "pid", "fixture_uuid", "role",
  "companion_ordinal", "expected_companion_state", "dev", "ino", "mode_type", "mode", "uid", "gid",
  "symlink_target_b64", "empty_directory",
];
const CLEANUP_FAMILY_PATTERN = /^(C:\\Users\\Admin\\AppData\\Local\\Temp\\opencode\\)(execution-authority-cleanup-junction(?:-substitute)?)-([1-9][0-9]*)-([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})-(link|source)$/;
const AUTHORITY_KEYS = ["mode", "proof_path"];
const AUTHORITY_MODES = ["standing-granted", "explicit-per-phase"];
const STANDING_CONSENT = "EXECUTE CONSENT: standing-granted";
const EXPLICIT_CONSENT = "ENTER EXECUTE MODE";
const GOAL_BLOCK_VALIDATOR =
  ".claude/skills/vc-autopilot/scripts/validate-autopilot-goal-block.mjs";

class Blocked extends Error {}

function block(reason) {
  throw new Blocked(reason);
}

function toPosix(value) {
  return String(value).replace(/\\/g, "/");
}

function normalizePath(raw, field, { allowSubtree = false } = {}) {
  if (typeof raw !== "string") {
    block(`${field} must be a string path`);
  }
  if (raw.length === 0) {
    block(`${field} is an empty path`);
  }
  if (raw.includes("\u0000")) {
    block(`${field} contains a NUL byte`);
  }
  if (raw.trim() !== raw) {
    block(`${field} has leading or trailing whitespace: "${raw}"`);
  }

  const posix = toPosix(raw);

  if (posix.startsWith("//")) {
    block(`${field} is a UNC path: "${raw}"`);
  }
  if (posix.startsWith("/")) {
    block(`${field} is an absolute path: "${raw}"`);
  }
  if (/^[A-Za-z]:/.test(posix)) {
    block(`${field} is a drive-qualified path: "${raw}"`);
  }

  let candidate = posix;
  let isSubtree = false;

  if (candidate.endsWith("/**")) {
    if (!allowSubtree) {
      block(`${field} may not use a "/**" subtree glob: "${raw}"`);
    }
    isSubtree = true;
    candidate = candidate.slice(0, -3);
    if (candidate.length === 0) {
      block(`${field} has an empty subtree root: "${raw}"`);
    }
  }

  if (/[*?\[\]{}]/.test(candidate)) {
    block(`${field} contains unsupported glob syntax: "${raw}"`);
  }

  const segments = candidate.split("/");
  for (const segment of segments) {
    if (segment.length === 0) {
      block(`${field} contains an empty path segment: "${raw}"`);
    }
    if (segment === "." || segment === "..") {
      block(`${field} contains a "${segment}" traversal segment: "${raw}"`);
    }
  }

  return { path: candidate, isSubtree, normalized: isSubtree ? `${candidate}/**` : candidate };
}

function scopeCovers(scopeEntries, target) {
  for (const entry of scopeEntries) {
    if (!entry.isSubtree && entry.path === target) return true;
    if (entry.isSubtree && target.startsWith(`${entry.path}/`)) return true;
  }
  return false;
}

function extractValidateContract(text, planLabel) {
  const lines = text.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Validate Contract\s*$/.test(lines[i])) {
      if (start !== -1) {
        block(`${planLabel} has more than one "## Validate Contract" heading`);
      }
      start = i;
    }
  }
  if (start === -1) {
    block(`${planLabel} has no "## Validate Contract" section`);
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i]) && !/^###/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end);
}

function collectFenceBodies(sectionLines) {
  const blocks = [];
  let open = null;
  for (const line of sectionLines) {
    const fence = line.match(/^\s*```(.*)$/);
    if (fence && open === null) {
      open = { info: fence[1].trim(), body: [] };
      continue;
    }
    if (fence && open !== null && fence[1].trim() === "") {
      blocks.push(open);
      open = null;
      continue;
    }
    if (open !== null) open.body.push(line);
  }
  return blocks;
}

function findDuplicateKeys(raw, planLabel, { decoded = true } = {}) {
  let cursor = 0;
  const skipWhitespace = () => {
    while (/\s/.test(raw[cursor] ?? "")) cursor++;
  };
  const readString = () => {
    const start = cursor++;
    while (cursor < raw.length) {
      if (raw[cursor] === "\\") {
        cursor += 2;
      } else if (raw[cursor++] === '"') {
        return JSON.parse(raw.slice(start, cursor));
      }
    }
    throw new SyntaxError("unterminated string");
  };
  const readValue = () => {
    skipWhitespace();
    if (raw[cursor] === "{") return readObject();
    if (raw[cursor] === "[") return readArray();
    if (raw[cursor] === '"') {
      readString();
      return;
    }
    while (cursor < raw.length && !/[\s,}\]]/.test(raw[cursor])) cursor++;
  };
  const readArray = () => {
    cursor++;
    skipWhitespace();
    while (cursor < raw.length && raw[cursor] !== "]") {
      readValue();
      skipWhitespace();
      if (raw[cursor] === ",") cursor++;
      skipWhitespace();
    }
    cursor++;
  };
  const readObject = () => {
    cursor++;
    const seen = new Set();
    skipWhitespace();
    while (cursor < raw.length && raw[cursor] !== "}") {
      if (raw[cursor] !== '"') throw new SyntaxError("object key must be a string");
      const keyStart = cursor;
      const key = readString();
      const identity = decoded ? key : raw.slice(keyStart, cursor);
      if (seen.has(identity)) {
        block(`${planLabel} envelope declares duplicate key "${key}" in the same JSON object`);
      }
      seen.add(identity);
      skipWhitespace();
      if (raw[cursor++] !== ":") throw new SyntaxError("missing colon");
      readValue();
      skipWhitespace();
      if (raw[cursor] === ",") cursor++;
      skipWhitespace();
    }
    cursor++;
  };

  try {
    readValue();
  } catch (err) {
    if (err instanceof Blocked) throw err;
  }
}

function extractArtifactDestination(text, planLabel, destinationLabel) {
  const lines = text.split("\n");
  const hits = [];
  const escapedLabel = destinationLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^\\s*\\*\\*${escapedLabel}:\\*\\*\\s*\`([^\`]+)\`\\s*$`);
  for (const line of lines) {
    const match = line.match(pattern);
    if (match) hits.push(match[1]);
  }
  if (hits.length === 0) {
    block(`${planLabel} has no "**${destinationLabel}:**" line required by its artifact schema`);
  }
  if (hits.length > 1) {
    block(`${planLabel} has ${hits.length} "**${destinationLabel}:**" lines — exactly one is allowed`);
  }
  return hits[0];
}

function verifyStandingAuthority(proofRel, planLabel) {
  const validatorAbs = path.resolve(ROOT, GOAL_BLOCK_VALIDATOR);
  if (!fs.existsSync(validatorAbs)) {
    block(
      `${planLabel} standing-granted authority cannot be proven — goal-block validator missing at ${GOAL_BLOCK_VALIDATOR}`,
    );
  }
  try {
    execFileSync(process.execPath, [validatorAbs, proofRel], {
      cwd: ROOT,
      stdio: "pipe",
    });
  } catch (err) {
    const detail = String(err.stdout ?? "").trim().split("\n").filter(Boolean).pop() ?? err.message;
    block(
      `${planLabel} standing-granted proof "${proofRel}" failed the goal-block validator — ${detail}`,
    );
  }

  const proofText = fs.readFileSync(path.resolve(ROOT, proofRel), "utf8");
  const hasConsent = proofText
    .split("\n")
    .some((line) => line.trimStart().startsWith("EXECUTE CONSENT:") && line.includes(STANDING_CONSENT));
  if (!hasConsent) {
    block(
      `${planLabel} standing-granted proof "${proofRel}" lacks the exact consent string "${STANDING_CONSENT}"`,
    );
  }
}

function verifyExplicitAuthority(proofRel, selectedPlan, planLabel) {
  const proofText = fs.readFileSync(path.resolve(ROOT, proofRel), "utf8");
  const bound = proofText
    .split("\n")
    .some(
      (line) => line.includes(EXPLICIT_CONSENT) && toPosix(line).includes(selectedPlan),
    );
  if (!bound) {
    block(
      `${planLabel} explicit-per-phase proof "${proofRel}" has no "${EXPLICIT_CONSENT}" bound to selected plan "${selectedPlan}"`,
    );
  }
}

function validateExactKeys(value, required, field) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    block(`${field} must be a JSON object`);
  }
  const keys = Object.keys(value);
  const missing = required.filter((key) => !keys.includes(key));
  if (missing.length > 0) block(`${field} is missing required key(s): ${missing.join(", ")}`);
  const unknown = keys.filter((key) => !required.includes(key));
  if (unknown.length > 0) block(`${field} has unknown key(s): ${unknown.join(", ")}`);
}

function validateAuthority(authority, planLabel) {
  validateExactKeys(authority, AUTHORITY_KEYS, `${planLabel} authority_mode`);
  if (!AUTHORITY_MODES.includes(authority.mode)) {
    block(
      `${planLabel} authority_mode.mode "${authority.mode}" is not in the closed set: ${AUTHORITY_MODES.join(", ")}`,
    );
  }
}

function validateStopConditions(conditions, planLabel) {
  if (!Array.isArray(conditions) || conditions.length === 0) {
    block(`${planLabel} stop_conditions must be a non-empty array`);
  }
  const seen = new Set();
  for (const condition of conditions) {
    if (typeof condition !== "string" || condition.trim().length === 0) {
      block(`${planLabel} stop_conditions contains an empty or non-string entry`);
    }
    if (seen.has(condition)) block(`${planLabel} stop_conditions contains duplicate entry "${condition}"`);
    seen.add(condition);
  }
}

function normalizeTemporaryPath(raw, field) {
  if (typeof raw !== "string" || raw.length === 0) block(`${field} must be a non-empty string path`);
  if (raw.includes("\u0000")) block(`${field} contains a NUL byte`);
  if (/^[\\/]{2}[?.][\\/]/.test(raw) || /^[\\/]{2}/.test(raw)) {
    block(`${field} uses a UNC or device namespace: "${raw}"`);
  }
  const normalized = raw.replace(/\//g, "\\");
  if (!/^[A-Za-z]:\\/.test(normalized) || normalized.slice(0, 2).toLowerCase() !== "c:") {
    block(`${field} must be an absolute C: drive path: "${raw}"`);
  }
  if (/[*?\[\]{}]/.test(normalized)) block(`${field} contains unsupported glob syntax: "${raw}"`);
  const components = normalized.slice(3).split("\\");
  for (const component of components) {
    if (component.length === 0) block(`${field} contains an empty path component: "${raw}"`);
    if (component === "." || component === "..") {
      block(`${field} contains a "${component}" traversal component: "${raw}"`);
    }
    if (/[. ]$/.test(component)) block(`${field} contains a trailing dot or space component: "${raw}"`);
    if (component.includes(":")) block(`${field} contains a colon or alternate data stream component: "${raw}"`);
    const basename = component.split(".", 1)[0];
    if (/^(?:con|prn|aux|nul|clock\$|com[1-9¹²³]|lpt[1-9¹²³])$/i.test(basename)) {
      block(`${field} contains a reserved DOS device basename: "${component}"`);
    }
  }
  const rootParts = TEMP_ROOT.split("\\");
  if (components.length <= rootParts.length - 1) block(`${field} is not strictly beneath the approved root`);
  const targetParts = ["C:", ...components];
  if (!rootParts.every((part, index) => targetParts[index]?.toLowerCase() === part.toLowerCase())) {
    block(`${field} is outside approved root "${TEMP_ROOT}"`);
  }
  const relative = targetParts.slice(rootParts.length);
  return {
    canonicalKey: targetParts.join("\\").toLowerCase(),
    relative,
  };
}

function defaultFsObservations() {
  return {
    existsSync: fs.existsSync,
    realpathNative: fs.realpathSync.native,
    lstatSync: fs.lstatSync,
    statSync: fs.statSync,
  };
}

function nonWindowsTemporaryFixtureObservations({ reparseComponent } = {}) {
  const rootKey = TEMP_ROOT.toLowerCase();
  return {
    existsSync: (value) => !value.toLowerCase().startsWith(`${rootKey}\\`),
    realpathNative: (value) => value,
    lstatSync: (value) => ({
      isDirectory: () => value.toLowerCase() === rootKey,
      isFile: () => false,
      isSymbolicLink: () => value.toLowerCase() === reparseComponent?.toLowerCase(),
    }),
    statSync: () => ({ isFile: () => false }),
  };
}

function assertContained(rootKey, candidate, field) {
  const candidateKey = candidate.replace(/\//g, "\\").toLowerCase();
  if (candidateKey !== rootKey && !candidateKey.startsWith(`${rootKey}\\`)) {
    block(`${field} resolves outside approved root at "${candidate}"`);
  }
}

function inspectTemporaryRoot(observations) {
  const parsed = path.win32.parse(TEMP_ROOT);
  let lexical = parsed.root;
  for (const component of TEMP_ROOT.slice(parsed.root.length).split("\\")) {
    lexical = path.win32.join(lexical, component);
    if (!observations.existsSync(lexical)) block(`approved temporary root chain is missing at "${lexical}"`);
    const item = observations.lstatSync(lexical);
    if (item.isSymbolicLink()) block(`approved temporary root chain is reparse-observable at "${lexical}"`);
  }
  const rootItem = observations.lstatSync(TEMP_ROOT);
  if (!rootItem.isDirectory() || rootItem.isSymbolicLink()) {
    block(`approved temporary root is not a regular non-reparse directory`);
  }
  const rootReal = observations.realpathNative(TEMP_ROOT).replace(/\//g, "\\");
  return { rootReal, rootKey: rootReal.toLowerCase() };
}

function assertSafeTemporaryTarget(target, observations = defaultFsObservations(), { requireFile = false } = {}) {
  const { rootReal, rootKey } = inspectTemporaryRoot(observations);
  let current = rootReal;
  for (const [index, component] of target.relative.entries()) {
    current = path.win32.join(current, component);
    if (!observations.existsSync(current)) {
      if (requireFile || index < target.relative.length - 1) {
        block(`temporary target path is missing at "${current}"`);
      }
      continue;
    }
    const item = observations.lstatSync(current);
    if (item.isSymbolicLink()) block(`temporary target ancestry is reparse-observable at "${current}"`);
    const real = observations.realpathNative(current).replace(/\//g, "\\");
    assertContained(rootKey, real, "temporary target ancestry");
    if (index === target.relative.length - 1) {
      if (!requireFile) block(`temporary target already exists: "${current}"`);
      if (!item.isFile()) block(`created temporary artifact is not a regular non-reparse file`);
    }
  }
  return {
    displayPath: path.win32.join(TEMP_ROOT, ...target.relative),
    filesystemPath: path.win32.join(rootReal, ...target.relative),
    rootReal,
  };
}

function canonicalDecimal(value, field, { positive = false } = {}) {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(value)) block(`${field} must be a canonical unsigned decimal string`);
  const number = BigInt(value);
  if (positive && number === 0n) block(`${field} must be positive`);
  return number;
}

function decodeCanonicalBase64(value, field) {
  if (typeof value !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    block(`${field} must be canonical RFC 4648 Base64`);
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) block(`${field} is not canonical RFC 4648 Base64`);
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes) || /[^\x20-\x7e]/.test(text)) block(`${field} must decode to ASCII/UTF-8 fixture bytes`);
  return { bytes, text };
}

function defaultCleanupObservations() {
  return {
    lstatSync: (value) => fs.lstatSync(value, { bigint: true }),
    readlinkSync: fs.readlinkSync,
    readdirSync: fs.readdirSync,
    trackedState: (root, target) => {
      try {
        execFileSync("git", ["-C", root, "ls-files", "--error-unmatch", "--", target], { stdio: "pipe" });
        return "tracked";
      } catch (err) {
        if (err.status === 1) return "untracked";
        return "indeterminate";
      }
    },
  };
}

function cleanupModeType(item) {
  if (item.isSymbolicLink()) return "symlink";
  if (item.isDirectory()) return "directory";
  if (item.isFile()) return "file";
  return "other";
}

function validateCleanupEnvelope(envelope, planLabel, planNorm, observations = defaultCleanupObservations()) {
  const repositoryRoot = observations.repositoryRoot ?? ROOT;
  validateExactKeys(envelope, CLEANUP_FIELDS, `${planLabel} envelope`);
  if (Object.keys(envelope).some((key, index) => key !== CLEANUP_FIELDS[index])) block(`${planLabel} envelope keys are not in canonical order`);
  if (envelope.authorityClass !== CLEANUP_AUTHORITY_CLASS) block(`${planLabel} authorityClass "${envelope.authorityClass}" is unknown`);
  validateAuthority(envelope.authority_mode, planLabel);
  validateExactKeys(envelope.repository_root, CLEANUP_ROOT_KEYS, `${planLabel} repository_root`);
  if (Object.keys(envelope.repository_root).some((key, index) => key !== CLEANUP_ROOT_KEYS[index])) block(`${planLabel} repository_root keys are not in canonical order`);
  const root = envelope.repository_root;
  if (root.absolute_path !== repositoryRoot || path.resolve(root.absolute_path) !== repositoryRoot) block(`${planLabel} repository_root.absolute_path must equal the exact native repository root`);
  if (root.mode_type !== "directory") block(`${planLabel} repository_root.mode_type must be directory`);
  for (const key of ["dev", "ino", "mode", "uid", "gid"]) canonicalDecimal(root[key], `repository_root.${key}`, { positive: key === "dev" || key === "ino" });
  const rootItem = observations.lstatSync(repositoryRoot);
  const rootExpected = { dev: root.dev, ino: root.ino, mode_type: root.mode_type, mode: root.mode, uid: root.uid, gid: root.gid };
  const rootActual = { dev: String(rootItem.dev), ino: String(rootItem.ino), mode_type: cleanupModeType(rootItem), mode: String(rootItem.mode & 0o7777n), uid: String(rootItem.uid), gid: String(rootItem.gid) };
  if (JSON.stringify(rootExpected) !== JSON.stringify(rootActual)) block(`${planLabel} repository_root identity does not match live non-following identity`);
  if (!Array.isArray(envelope.allowed_scope) || envelope.allowed_scope.length < 1 || envelope.allowed_scope.length > 8) block(`${planLabel} allowed_scope must contain 1 to 8 cleanup target records`);
  if (!Number.isInteger(envelope.scope_count) || envelope.scope_count !== envelope.allowed_scope.length) block(`${planLabel} scope_count must equal allowed_scope length`);
  if (!Number.isInteger(envelope.operation_count) || envelope.operation_count !== envelope.allowed_scope.length) block(`${planLabel} operation_count must equal allowed_scope length`);
  validateStopConditions(envelope.stop_conditions, planLabel);
  if (!Number.isInteger(envelope.stop_condition_count) || envelope.stop_condition_count !== envelope.stop_conditions.length) block(`${planLabel} stop_condition_count must equal stop_conditions length`);
  if (envelope.creation_count !== 0 || envelope.source_write_count !== 0) block(`${planLabel} creation_count and source_write_count must both equal zero`);
  if (envelope.cleanup_receipt_schema_version !== CLEANUP_RECEIPT_SCHEMA) block(`${planLabel} cleanup_receipt_schema_version must be "${CLEANUP_RECEIPT_SCHEMA}"`);

  const selected = normalizePath(envelope.selected_plan, "selected_plan");
  if (!fs.existsSync(path.resolve(ROOT, selected.path)) || selected.path !== planNorm.path) block(`selected_plan "${selected.path}" does not match the validated plan`);
  const proof = normalizePath(envelope.authority_mode.proof_path, "authority_mode.proof_path");
  if (!fs.existsSync(path.resolve(ROOT, proof.path))) block(`authority_mode.proof_path "${proof.path}" does not exist on disk`);
  if (envelope.authority_mode.mode === "standing-granted") verifyStandingAuthority(proof.path, planLabel);
  else verifyExplicitAuthority(proof.path, selected.path, planLabel);

  const seenBytes = new Set();
  const seenPaths = new Set();
  const seenIdentities = new Set();
  const records = envelope.allowed_scope.map((target, index) => {
    validateExactKeys(target, CLEANUP_TARGET_KEYS, `${planLabel} allowed_scope[${index}]`);
    if (Object.keys(target).some((key, keyIndex) => key !== CLEANUP_TARGET_KEYS[keyIndex])) block(`${planLabel} allowed_scope[${index}] keys are not in canonical order`);
    if (target.ordinal !== index + 1) block(`${planLabel} allowed_scope ordinals must be contiguous and sorted`);
    const decoded = decodeCanonicalBase64(target.basename_b64, `allowed_scope[${index}].basename_b64`);
    if (!decoded.text || decoded.text === "." || decoded.text === ".." || decoded.text.includes("\0") || decoded.text.includes("/")) block(`${planLabel} cleanup basename is not one raw Linux basename`);
    const match = decoded.text.match(CLEANUP_FAMILY_PATTERN);
    if (!match) block(`${planLabel} cleanup basename does not match the generated fixture family grammar`);
    const [, , family, pid, uuid, role] = match;
    if (family !== target.fixture_family || pid !== target.pid || uuid !== target.fixture_uuid || role !== target.role) block(`${planLabel} cleanup target grammar fields do not match record fields`);
    canonicalDecimal(target.pid, `allowed_scope[${index}].pid`, { positive: true });
    for (const key of ["dev", "ino", "mode", "uid", "gid"]) canonicalDecimal(target[key], `allowed_scope[${index}].${key}`, { positive: key === "dev" || key === "ino" });
    const targetPath = path.join(repositoryRoot, decoded.text);
    if (path.dirname(targetPath) !== repositoryRoot || path.basename(targetPath) !== decoded.text || targetPath === repositoryRoot || decoded.text === ".git") block(`${planLabel} cleanup target is not an exact direct child of the repository root`);
    const bytesKey = decoded.bytes.toString("hex");
    const identityKey = `${target.dev}:${target.ino}`;
    if (seenBytes.has(bytesKey) || seenPaths.has(targetPath) || seenIdentities.has(identityKey)) block(`${planLabel} cleanup target set contains duplicate bytes, path, or identity`);
    seenBytes.add(bytesKey); seenPaths.add(targetPath); seenIdentities.add(identityKey);
    if (observations.trackedState(repositoryRoot, targetPath) !== "untracked") block(`${planLabel} cleanup target is tracked or Git state is indeterminate`);
    const expectedOperation = role === "link" ? "unlink" : "rmdir";
    const expectedType = role === "link" ? "symlink" : "directory";
    if (target.operation !== expectedOperation || target.mode_type !== expectedType) block(`${planLabel} cleanup operation/type does not match target role`);
    if (target.empty_directory !== (role === "source")) block(`${planLabel} empty_directory does not match target role`);
    const item = observations.lstatSync(targetPath);
    const actual = { dev: String(item.dev), ino: String(item.ino), mode_type: cleanupModeType(item), mode: String(item.mode & 0o7777n), uid: String(item.uid), gid: String(item.gid) };
    const expected = { dev: target.dev, ino: target.ino, mode_type: target.mode_type, mode: target.mode, uid: target.uid, gid: target.gid };
    if (JSON.stringify(actual) !== JSON.stringify(expected)) block(`${planLabel} cleanup target identity does not match live non-following identity`);
    if (role === "link") {
      const link = decodeCanonicalBase64(target.symlink_target_b64, `allowed_scope[${index}].symlink_target_b64`).text;
      if (observations.readlinkSync(targetPath) !== link) block(`${planLabel} symlink target bytes do not match`);
    } else {
      if (target.symlink_target_b64 !== "" || observations.readdirSync(targetPath).length !== 0) block(`${planLabel} cleanup source must be an empty directory with no link bytes`);
    }
    return { ...target, decodedBasename: decoded.text, targetPath };
  });

  for (const record of records) {
    if (record.role === "link" && record.expected_companion_state !== "present") block(`${planLabel} links require present companions`);
    if (record.expected_companion_state === "present") {
      const companion = records[record.companion_ordinal - 1];
      if (!companion || companion.companion_ordinal !== record.ordinal || companion.fixture_family !== record.fixture_family || companion.pid !== record.pid || companion.fixture_uuid !== record.fixture_uuid || companion.role === record.role) block(`${planLabel} present companions must be reciprocal exact pairs`);
      if (record.role === "link") {
        const expectedLink = record.decodedBasename.slice(0, -4).replaceAll("\\", "/") + "source";
        if (decodeCanonicalBase64(record.symlink_target_b64, "symlink_target_b64").text !== expectedLink) block(`${planLabel} link text does not name its paired source`);
      }
    } else if (record.expected_companion_state === "absent") {
      if (record.role !== "source" || record.companion_ordinal !== 0) block(`${planLabel} absent companions are allowed only for orphan sources`);
      const missingLink = path.join(repositoryRoot, record.decodedBasename.slice(0, -6) + "link");
      try { observations.lstatSync(missingLink); block(`${planLabel} orphan companion unexpectedly exists`); } catch (err) { if (err instanceof Blocked || err.code !== "ENOENT") throw err; }
    } else block(`${planLabel} expected_companion_state must be present or absent`);
  }

  const canonical = JSON.stringify({ repository_root: root, allowed_scope: envelope.allowed_scope });
  return {
    authorityClass: CLEANUP_AUTHORITY_CLASS,
    selected_plan: selected.path,
    mode: envelope.authority_mode.mode,
    proof_path: proof.path,
    repository_root: root.absolute_path,
    scope_count: envelope.scope_count,
    operation_count: envelope.operation_count,
    creation_count: 0,
    source_write_count: 0,
    cleanup_receipt_schema_version: CLEANUP_RECEIPT_SCHEMA,
    target_set_sha256: createHash("sha256").update(canonical).digest("hex"),
  };
}

function sha256Pattern(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function parseExactFixtureBlock(filePath, info, keys, label) {
  const bytes = fs.readFileSync(path.resolve(ROOT, filePath));
  const text = decodeLiteralInput(bytes);
  const matches = collectFenceBodies(text.split("\n")).filter((item) => item.info === info);
  if (matches.length !== 1) block(`${label} must have exactly one ${info} block`);
  const raw = `${matches[0].body.join("\n")}\n`;
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    block(`${label} is not strict JSON: ${error.message}`);
  }
  validateExactKeys(value, keys, label);
  if (Object.keys(value).some((key, index) => key !== keys[index])) block(`${label} keys are not in canonical order`);
  return { bytes: Buffer.from(raw), value };
}

function validateDiagnosticRegistry(registry, planLabel) {
  validateExactKeys(registry, DIAGNOSTIC_REGISTRY_KEYS, `${planLabel} diagnostic_registry`);
  if (Object.keys(registry).some((key, index) => key !== DIAGNOSTIC_REGISTRY_KEYS[index])) block(`${planLabel} diagnostic_registry keys are not in canonical order`);
  if (registry.schema !== DIAGNOSTIC_REGISTRY_SCHEMA) block(`${planLabel} diagnostic_registry.schema must be "${DIAGNOSTIC_REGISTRY_SCHEMA}"`);
  const registryPath = normalizePath(registry.registry_path, "diagnostic_registry.registry_path");
  if (registryPath.path !== DIAGNOSTIC_FIXTURE_PATH) block(`${planLabel} diagnostic registry path must equal the canonical fixture path`);
  if (!sha256Pattern(registry.registry_sha256)) block(`${planLabel} diagnostic_registry.registry_sha256 must be a lowercase SHA-256`);
  const parsed = parseExactFixtureBlock(registryPath.path, "json repository-diagnostic-registry/v1", DIAGNOSTIC_REGISTRY_FILE_KEYS, `${planLabel} diagnostic registry file`);
  const actualSha256 = createHash("sha256").update(parsed.bytes).digest("hex");
  if (actualSha256 !== registry.registry_sha256) block(`${planLabel} diagnostic registry bytes do not match registry_sha256`);
  if (JSON.stringify(parsed.value.rows) !== JSON.stringify(registry.rows)) block(`${planLabel} diagnostic registry declared rows do not match registry file bytes`);
  if (!Array.isArray(registry.rows) || registry.rows.length === 0) block(`${planLabel} diagnostic_registry.rows must be non-empty`);
  if (!Number.isInteger(registry.row_count) || registry.row_count !== registry.rows.length) block(`${planLabel} diagnostic_registry.row_count must equal rows length`);
  try {
    validateDiagnosticRegistryContract(parsed.value);
  } catch (error) {
    block(`${planLabel} diagnostic registry capability rejected: ${error.message}`);
  }
  const coveredRoles = new Set(registry.rows.flatMap((row) => row.artifact_roles));
  return { registryPath: registryPath.path, registryBytes: parsed.bytes, registryValue: parsed.value, coveredRoles };
}

function validateRepositoryDiagnosticEnvelope(envelope, planLabel, planNorm) {
  validateExactKeys(envelope, DIAGNOSTIC_FIELDS, `${planLabel} envelope`);
  if (Object.keys(envelope).some((key, index) => key !== DIAGNOSTIC_FIELDS[index])) block(`${planLabel} envelope keys are not in canonical order`);
  if (envelope.authorityClass !== DIAGNOSTIC_AUTHORITY_CLASS) block(`${planLabel} authorityClass "${envelope.authorityClass}" is unknown`);
  validateAuthority(envelope.authority_mode, planLabel);
  const selected = normalizePath(envelope.selected_plan, "selected_plan");
  if (!fs.existsSync(path.resolve(ROOT, selected.path)) || selected.path !== planNorm.path) block(`selected_plan "${selected.path}" does not match the validated plan`);
  const proof = normalizePath(envelope.authority_mode.proof_path, "authority_mode.proof_path");
  if (!fs.existsSync(path.resolve(ROOT, proof.path))) block(`authority_mode.proof_path "${proof.path}" does not exist on disk`);
  if (envelope.authority_mode.mode === "standing-granted") verifyStandingAuthority(proof.path, planLabel);
  else verifyExplicitAuthority(proof.path, selected.path, planLabel);
  const evidenceRoot = normalizePath(envelope.evidence_root, "evidence_root");
  if (DIAGNOSTIC_PRODUCT_ROOTS.has(evidenceRoot.path.split("/")[0])) block(`${planLabel} evidence_root is a product or build path`);
  const { registryPath, registryBytes, registryValue, coveredRoles } = validateDiagnosticRegistry(envelope.diagnostic_registry, planLabel);
  if (!registryPath.startsWith(`${evidenceRoot.path}/`)) block(`${planLabel} diagnostic_registry.registry_path must be strictly beneath evidence_root`);
  if (!Array.isArray(envelope.allowed_scope) || envelope.allowed_scope.length === 0) block(`${planLabel} allowed_scope must be a non-empty diagnostic artifact array`);
  if (!Number.isInteger(envelope.scope_count) || envelope.scope_count !== envelope.allowed_scope.length) block(`${planLabel} scope_count must equal allowed_scope length`);
  validateStopConditions(envelope.stop_conditions, planLabel);
  if (!Number.isInteger(envelope.stop_condition_count) || envelope.stop_condition_count !== envelope.stop_conditions.length) block(`${planLabel} stop_condition_count must equal stop_conditions length`);
  if (envelope.artifact_receipt_schema_version !== DIAGNOSTIC_RECEIPT_SCHEMA) block(`${planLabel} artifact_receipt_schema_version must be "${DIAGNOSTIC_RECEIPT_SCHEMA}"`);
  const paths = [];
  const canonicalTargets = new Set();
  const targetedRoles = new Set();
  for (const [index, target] of envelope.allowed_scope.entries()) {
    validateExactKeys(target, DIAGNOSTIC_TARGET_KEYS, `${planLabel} allowed_scope[${index}]`);
    if (Object.keys(target).some((key, keyIndex) => key !== DIAGNOSTIC_TARGET_KEYS[keyIndex])) block(`${planLabel} allowed_scope[${index}] keys are not in canonical order`);
    if (target.ordinal !== index + 1) block(`${planLabel} allowed_scope ordinals must be contiguous and sorted`);
    if (!DIAGNOSTIC_ROLES.has(target.artifact_role)) block(`${planLabel} allowed_scope has unknown artifact role "${target.artifact_role}"`);
    if (target.artifact_schema_version !== DIAGNOSTIC_ROLE_SCHEMAS.get(target.artifact_role)) block(`${planLabel} allowed_scope artifact schema does not match role "${target.artifact_role}"`);
    if (targetedRoles.has(target.artifact_role)) block(`${planLabel} allowed_scope contains duplicate artifact role "${target.artifact_role}"`);
    targetedRoles.add(target.artifact_role);
    if (target.create_only !== true) block(`${planLabel} every diagnostic target must set create_only to true`);
    const normalized = normalizePath(target.artifact_path, `allowed_scope[${index}].artifact_path`);
    if (!normalized.path.startsWith(`${evidenceRoot.path}/`)) block(`${planLabel} diagnostic target must be strictly beneath evidence_root`);
    if (DIAGNOSTIC_PRODUCT_ROOTS.has(normalized.path.split("/")[0])) block(`${planLabel} diagnostic target is a product or build path`);
    if (canonicalTargets.has(normalized.path)) block(`${planLabel} allowed_scope contains duplicate or alias target "${normalized.path}"`);
    canonicalTargets.add(normalized.path);
    paths.push(normalized.path);
    if (!coveredRoles.has(target.artifact_role)) block(`${planLabel} diagnostic target role "${target.artifact_role}" is not executable by a registry row`);
  }
  for (const role of DIAGNOSTIC_ROLES) if (!targetedRoles.has(role)) block(`${planLabel} allowed_scope is missing required artifact role "${role}"`);
  const fixtureText = fs.readFileSync(path.resolve(ROOT, DIAGNOSTIC_FIXTURE_PATH), "utf8");
  const runnerDeclaration = fixtureText.match(/^Fixed runner: `([^`]+)`\nFixed runner SHA-256: `([0-9a-f]{64})`$/m);
  if (!runnerDeclaration) block(`${planLabel} fixture has no exact fixed runner path/digest declaration`);
  if (runnerDeclaration[1] !== RUNNER_PATH || runnerDeclaration[2] !== RUNNER_SHA256) block(`${planLabel} fixture runner declaration does not match canonical path/digest`);
  const runnerBytes = fs.readFileSync(path.resolve(ROOT, runnerDeclaration[1]));
  const runnerSha256 = createHash("sha256").update(runnerBytes).digest("hex");
  if (runnerSha256 !== runnerDeclaration[2]) block(`${planLabel} fixed diagnostic runner source bytes do not match the fixture-declared digest`);
  if (decodeLiteralInput(Buffer.from("fixture\n")) !== "fixture\n" || typeof parseTarEntries !== "function" || typeof createEvidenceArtifact !== "function" || typeof runDiagnosticLifecycle !== "function") block(`${planLabel} fixed diagnostic runner exports are not functional`);
  const receipt = parseExactFixtureBlock(DIAGNOSTIC_FIXTURE_PATH, `json ${DIAGNOSTIC_RECEIPT_SCHEMA_VERSION}`, DIAGNOSTIC_RECEIPT_KEYS, `${planLabel} behavioral execution receipt`).value;
  if (receipt.schema !== DIAGNOSTIC_RECEIPT_SCHEMA_VERSION || receipt.runnerPath !== RUNNER_PATH || receipt.runnerSha256 !== runnerSha256 || receipt.registryPath !== registryPath || receipt.registrySha256 !== createHash("sha256").update(registryBytes).digest("hex") || receipt.executionStatus !== "PASS" || receipt.status !== "PASS") block(`${planLabel} behavioral execution receipt binding is invalid`);
  const times = ["2026-09-03T00:00:00.000Z", "2026-09-03T00:00:01.000Z", "2026-09-03T00:00:02.000Z", "2026-09-03T00:00:03.000Z"];
  const execution = executeDiagnosticRegistry(registryValue, { runnerPath: path.resolve(ROOT, RUNNER_PATH), attemptId: "authority-validation", now: () => times.shift() });
  const terminalBytes = Buffer.from(`${JSON.stringify(execution.receipts)}\n`);
  if (execution.status !== receipt.executionStatus || execution.receipts.length !== receipt.terminalCount || createHash("sha256").update(terminalBytes).digest("hex") !== receipt.terminalSha256) block(`${planLabel} actual diagnostic execution result does not match its behavioral receipt`);
  return {
    authorityClass: DIAGNOSTIC_AUTHORITY_CLASS,
    selected_plan: selected.path,
    mode: envelope.authority_mode.mode,
    proof_path: proof.path,
    scope_count: envelope.scope_count,
    stop_condition_count: envelope.stop_condition_count,
    registry_classification: "diagnostic-only",
    registry_path: registryPath,
    artifact_receipt_schema_version: DIAGNOSTIC_RECEIPT_SCHEMA,
    artifact_paths: paths,
  };
}

function normalizeNativeAbsolute(raw, field) {
  if (typeof raw !== "string" || !path.isAbsolute(raw) || path.normalize(raw) !== raw || /[\0\r\n]/.test(raw)) block(`${field} must be a normalized absolute native path`);
  return raw;
}

function safeBoundFile(target, field) {
  const item = fs.lstatSync(target, { bigint: true });
  if (!item.isFile() || item.isSymbolicLink() || fs.realpathSync.native(target) !== target) block(`${field} must be a regular non-alias file`);
  return fs.readFileSync(target);
}

function gitObjectText(args, field) {
  try {
    return execFileSync("/usr/bin/git", args, { cwd: ROOT, encoding: "utf8", env: { HOME: os.tmpdir(), LANG: "C.UTF-8", LC_ALL: "C.UTF-8", PATH: "/usr/bin:/bin", TZ: "UTC", GIT_CONFIG_NOSYSTEM: "1" } }).trim();
  } catch (error) {
    block(`${field} Git object binding failed: ${error.message}`);
  }
}

function validateRepositoryDiagnosticV2Envelope(envelope, planLabel, planNorm) {
  validateExactKeys(envelope, DIAGNOSTIC_V2_FIELDS, `${planLabel} envelope`);
  if (Object.keys(envelope).some((key, index) => key !== DIAGNOSTIC_V2_FIELDS[index])) block(`${planLabel} envelope keys are not in canonical order`);
  if (envelope.authorityClass !== DIAGNOSTIC_V2_AUTHORITY_CLASS) block(`${planLabel} authorityClass is not v2`);
  validateAuthority(envelope.authority_mode, planLabel);
  const selected = normalizePath(envelope.selected_plan, "selected_plan");
  if (selected.path !== planNorm.path || !fs.existsSync(path.resolve(ROOT, selected.path))) block(`selected_plan does not match the validated plan`);
  const proof = normalizePath(envelope.authority_mode.proof_path, "authority_mode.proof_path");
  if (!fs.existsSync(path.resolve(ROOT, proof.path))) block(`authority_mode.proof_path does not exist`);
  if (envelope.authority_mode.mode === "standing-granted") verifyStandingAuthority(proof.path, planLabel); else verifyExplicitAuthority(proof.path, selected.path, planLabel);
  const operationRoot = normalizeNativeAbsolute(envelope.operation_root, "operation_root");
  const registryRoot = normalizeNativeAbsolute(envelope.registry_root, "registry_root");
  const runtimeRoot = normalizeNativeAbsolute(envelope.runtime_root, "runtime_root");
  const evidenceRoot = normalizeNativeAbsolute(envelope.evidence_root, "evidence_root");
  try { validateRoleRoots({ operation_root: operationRoot, registry_root: registryRoot, runtime_root: runtimeRoot, evidence_root: evidenceRoot }); } catch (error) { block(`diagnostic role roots rejected: ${error.message}`); }
  validateExactKeys(envelope.diagnostic_runner, DIAGNOSTIC_RUNNER_KEYS, "diagnostic_runner");
  if (Object.keys(envelope.diagnostic_runner).some((key, index) => key !== DIAGNOSTIC_RUNNER_KEYS[index])) block(`diagnostic_runner keys are not in canonical order`);
  const runner = envelope.diagnostic_runner;
  if (runner.schema !== "repository-diagnostic-runner-binding/v1") block(`diagnostic_runner schema is invalid`);
  const runnerPath = normalizeNativeAbsolute(runner.runner_path, "diagnostic_runner.runner_path");
  if (runnerPath !== path.resolve(ROOT, RUNNER_PATH)) block(`diagnostic_runner.runner_path is not the canonical runner`);
  const runnerBytes = safeBoundFile(runnerPath, "diagnostic_runner.runner_path");
  if (!Number.isSafeInteger(runner.runner_bytes) || runner.runner_bytes !== runnerBytes.length || !sha256Pattern(runner.runner_sha256) || createHash("sha256").update(runnerBytes).digest("hex") !== runner.runner_sha256) block(`diagnostic runner bytes/SHA drifted`);
  if (!/^[0-9a-f]{40}$/.test(runner.runner_blob_oid) || !/^[0-9a-f]{40}$/.test(runner.runner_commit_oid)) block(`diagnostic runner blob/commit OIDs are invalid`);
  if (gitObjectText(["cat-file", "-t", runner.runner_commit_oid], "runner commit") !== "commit") block(`diagnostic runner commit OID is not a commit`);
  const relativeRunner = path.relative(ROOT, runnerPath).split(path.sep).join("/");
  if (gitObjectText(["rev-parse", `${runner.runner_commit_oid}:${relativeRunner}`], "runner blob") !== runner.runner_blob_oid || gitObjectText(["cat-file", "-t", runner.runner_blob_oid], "runner blob") !== "blob") block(`diagnostic runner blob binding drifted`);
  const committedBytes = execFileSync("/usr/bin/git", ["cat-file", "blob", runner.runner_blob_oid], { cwd: ROOT, encoding: null, env: { HOME: os.tmpdir(), LANG: "C.UTF-8", LC_ALL: "C.UTF-8", PATH: "/usr/bin:/bin", TZ: "UTC", GIT_CONFIG_NOSYSTEM: "1" } });
  if (!committedBytes.equals(runnerBytes)) block(`diagnostic runner worktree bytes differ from committed blob`);
  validateExactKeys(envelope.diagnostic_registry, DIAGNOSTIC_V2_REGISTRY_KEYS, "diagnostic_registry");
  if (Object.keys(envelope.diagnostic_registry).some((key, index) => key !== DIAGNOSTIC_V2_REGISTRY_KEYS[index])) block(`diagnostic_registry keys are not in canonical order`);
  const binding = envelope.diagnostic_registry;
  if (binding.schema !== "repository-diagnostic-command-registry/v1") block(`diagnostic_registry schema is invalid`);
  const registryPath = normalizeNativeAbsolute(binding.registry_path, "diagnostic_registry.registry_path");
  let registryFreeze;
  try { registryFreeze = freezeBoundedRegistry(registryPath, registryRoot); } catch (error) { block(`diagnostic registry binding rejected: ${error.message}`); }
  const registryBytes = registryFreeze.bytes;
  if (!Number.isSafeInteger(binding.registry_bytes) || binding.registry_bytes !== registryBytes.length || !sha256Pattern(binding.registry_sha256) || registryFreeze.sha256 !== binding.registry_sha256) block(`diagnostic registry bytes/SHA drifted`);
  let registry;
  try {
    findDuplicateKeys(decodeLiteralInput(registryBytes), planLabel);
    registry = JSON.parse(decodeLiteralInput(registryBytes));
  } catch (error) {
    block(`diagnostic registry is not strict canonical JSON: ${error.message}`);
  }
  if (!Buffer.from(`${JSON.stringify(registry, null, 2)}\n`).equals(registryBytes)) block(`diagnostic registry JSON is not canonical`);
  if (binding.row_count !== 18 || binding.row_count !== registry.rows?.length || JSON.stringify(binding.rows) !== JSON.stringify(registry.rows)) block(`diagnostic registry count/rows drifted`);
  try { validateCommandRegistry(registry); } catch (error) { block(`diagnostic registry capability rejected: ${error.message}`); }
  let preSpawnFreeze;
  try { preSpawnFreeze = freezeBoundedRegistry(registryPath, registryRoot); } catch (error) { block(`diagnostic registry pre-spawn recheck rejected: ${error.message}`); }
  if (preSpawnFreeze.identity !== registryFreeze.identity || preSpawnFreeze.bytesLength !== registryFreeze.bytesLength || preSpawnFreeze.sha256 !== registryFreeze.sha256 || preSpawnFreeze.realpath !== registryFreeze.realpath) block(`diagnostic registry drifted before first spawn`);
  if (!Array.isArray(envelope.allowed_scope) || envelope.scope_count !== envelope.allowed_scope.length || envelope.allowed_scope.length !== 72) block(`v2 allowed_scope must contain exactly 72 row evidence destinations`);
  const destinations = registry.rows.flatMap((row) => Object.values(row.evidence));
  if (JSON.stringify(envelope.allowed_scope) !== JSON.stringify(destinations)) block(`v2 allowed_scope must equal registry evidence destinations`);
  validateStopConditions(envelope.stop_conditions, planLabel);
  if (envelope.stop_condition_count !== envelope.stop_conditions.length || envelope.artifact_receipt_schema_version !== DIAGNOSTIC_RECEIPT_SCHEMA) block(`v2 stop count or receipt schema drifted`);
  return { authorityClass: DIAGNOSTIC_V2_AUTHORITY_CLASS, selected_plan: selected.path, mode: envelope.authority_mode.mode, proof_path: proof.path, scope_count: envelope.scope_count, stop_condition_count: envelope.stop_condition_count, registry_classification: "diagnostic-read-only", registry_path: registryPath, registry_bytes: registryBytes.length, registry_sha256: binding.registry_sha256, artifact_receipt_schema_version: DIAGNOSTIC_RECEIPT_SCHEMA };
}

function runV2PostcommitCheck() {
  const operationRoot = fs.mkdtempSync(path.join(os.tmpdir(), "repository-diagnostic-v2-"));
  const registryRoot = path.join(operationRoot, "registry");
  const runtimeRoot = path.join(operationRoot, "runtime");
  const evidenceRoot = path.join(operationRoot, "evidence");
  const home = path.join(runtimeRoot, "home");
  fs.mkdirSync(registryRoot);
  fs.mkdirSync(runtimeRoot);
  fs.mkdirSync(evidenceRoot);
  fs.mkdirSync(home);
  const runnerPath = path.resolve(ROOT, RUNNER_PATH);
  try {
    const commitOid = gitObjectText(["rev-parse", "HEAD"], "runner commit");
    const blobOid = gitObjectText(["rev-parse", `${commitOid}:${RUNNER_PATH}`], "runner blob");
    const runnerBytes = safeBoundFile(runnerPath, "diagnostic_runner.runner_path");
    const policy = {
      repositoryRoot: ROOT,
      node: process.execPath,
      git: "/usr/bin/git",
      chrome: "/home/compute_01/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
      npmCli: path.join(path.dirname(path.dirname(process.execPath)), "lib/node_modules/npm/bin/npm-cli.js"),
      viteCli: path.join(ROOT, "node_modules/vite/bin/vite.js"),
      planValidator: path.join(ROOT, ".claude/skills/vc-generate-plan/scripts/validate-plan-artifact.mjs"),
      phaseValidator: path.join(ROOT, ".claude/skills/vc-generate-phase-program/scripts/validate-phase-stub.mjs"),
      umbrellaValidator: path.join(ROOT, ".claude/skills/vc-generate-phase-program/scripts/validate-umbrella-artifact.mjs"),
      goalValidator: path.join(ROOT, GOAL_BLOCK_VALIDATOR),
      envelopeValidator: path.join(ROOT, "./.claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs"),
    };
    const selectedPlan = ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/pass-repository-diagnostic-evidence-set.md";
    const fixture = commandRegistryFixture({ repositoryRoot: ROOT, operationRoot, registryRoot, runtimeRoot, evidenceRoot, home, policy, headOid: COMMAND_HEAD_OID_V2, treeOid: COMMAND_TREE_OID_V2, selectedPlan, selectedPlanAbsolute: path.join(ROOT, selectedPlan), umbrella: path.join(ROOT, "process/features/casino-overhaul/active/visual-animation-assets_07-08-26/visual-animation-assets-umbrella_PLAN_07-08-26.md"), goal: path.join(ROOT, ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/proof/standing-goal-block.md"), archivePath: path.join(runtimeRoot, "tree.tar") });
    const registryBytes = Buffer.from(`${JSON.stringify(fixture.registry, null, 2)}\n`);
    const registryPath = path.join(registryRoot, `variable-registry-${randomUUID()}.json`);
    fs.writeFileSync(registryPath, registryBytes, { flag: "wx", mode: 0o400 });
    const model = {
      selected_plan: selectedPlan,
      authority_mode: { mode: "standing-granted", proof_path: ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/proof/standing-goal-block.md" },
      authorityClass: DIAGNOSTIC_V2_AUTHORITY_CLASS,
      operation_root: operationRoot,
      registry_root: registryRoot,
      runtime_root: runtimeRoot,
      evidence_root: evidenceRoot,
      diagnostic_runner: { schema: "repository-diagnostic-runner-binding/v1", runner_path: runnerPath, runner_bytes: runnerBytes.length, runner_sha256: createHash("sha256").update(runnerBytes).digest("hex"), runner_blob_oid: blobOid, runner_commit_oid: commitOid },
      diagnostic_registry: { schema: "repository-diagnostic-command-registry/v1", registry_path: registryPath, registry_bytes: registryBytes.length, registry_sha256: createHash("sha256").update(registryBytes).digest("hex"), row_count: 18, rows: fixture.registry.rows },
      allowed_scope: fixture.registry.rows.flatMap((row) => Object.values(row.evidence)),
      scope_count: 72,
      stop_conditions: ["product command", "source write", "external mutation", "identity mismatch"],
      stop_condition_count: 4,
      artifact_receipt_schema_version: DIAGNOSTIC_RECEIPT_SCHEMA,
    };
    const result = validateRepositoryDiagnosticV2Envelope(model, selectedPlan, normalizePath(selectedPlan, "selected plan"));
    return { schema: "repository-diagnostic-v2-postcommit-check/v1", status: "PASS", commit_oid: commitOid, runner_blob_oid: blobOid, runner_bytes: runnerBytes.length, runner_sha256: model.diagnostic_runner.runner_sha256, registry_path_variable: path.basename(registryPath).startsWith("variable-registry-"), registry_bytes: registryBytes.length, registry_sha256: model.diagnostic_registry.registry_sha256, row_count: 18, scope_count: 72, semantic_kind_count: new Set(fixture.registry.rows.map((row) => row.semantic.kind)).size };
  } finally {
    fs.rmSync(operationRoot, { recursive: true, force: true });
  }
}

function validateTemporaryEnvelope(envelope, planLabel, planNorm, observations) {
  validateExactKeys(envelope, TEMP_REQUIRED_FIELDS, `${planLabel} envelope`);
  if (envelope.authorityClass !== TEMP_AUTHORITY_CLASS) {
    block(`${planLabel} authorityClass "${envelope.authorityClass}" is unknown`);
  }
  validateAuthority(envelope.authority_mode, planLabel);
  if (!Array.isArray(envelope.allowed_scope) || envelope.allowed_scope.length < 1 || envelope.allowed_scope.length > 8) {
    block(`${planLabel} allowed_scope must contain 1 to 8 temporary target records`);
  }
  if (!Number.isInteger(envelope.scope_count) || envelope.scope_count !== envelope.allowed_scope.length) {
    block(`${planLabel} scope_count must equal allowed_scope length`);
  }
  validateStopConditions(envelope.stop_conditions, planLabel);
  if (!Number.isInteger(envelope.stop_condition_count) || envelope.stop_condition_count !== envelope.stop_conditions.length) {
    block(`${planLabel} stop_condition_count must equal stop_conditions length`);
  }
  if (envelope.artifact_receipt_schema_version !== TEMP_RECEIPT_SCHEMA) {
    block(`${planLabel} artifact_receipt_schema_version must be "${TEMP_RECEIPT_SCHEMA}"`);
  }

  const selected = normalizePath(envelope.selected_plan, "selected_plan");
  if (!fs.existsSync(path.resolve(ROOT, selected.path))) block(`selected_plan "${selected.path}" does not exist on disk`);
  if (selected.path !== planNorm.path) {
    block(`selected_plan "${selected.path}" does not match the validated plan "${planNorm.path}"`);
  }

  const seen = new Set();
  const artifactPaths = envelope.allowed_scope.map((target, index) => {
    validateExactKeys(target, TEMP_TARGET_KEYS, `${planLabel} allowed_scope[${index}]`);
    if (typeof target.artifact_schema_version !== "string" || !/^[a-z0-9][a-z0-9.-]*\/v[0-9]+(?:\.[0-9]+)*$/i.test(target.artifact_schema_version)) {
      block(`${planLabel} allowed_scope[${index}].artifact_schema_version must be a versioned schema identifier`);
    }
    const normalized = normalizeTemporaryPath(target.artifact_path, `allowed_scope[${index}].artifact_path`);
    if (seen.has(normalized.canonicalKey)) block(`${planLabel} allowed_scope contains duplicate canonical target "${target.artifact_path}"`);
    seen.add(normalized.canonicalKey);
    return assertSafeTemporaryTarget(normalized, observations).displayPath;
  });

  const proof = normalizePath(envelope.authority_mode.proof_path, "authority_mode.proof_path");
  if (!fs.existsSync(path.resolve(ROOT, proof.path))) block(`authority_mode.proof_path "${proof.path}" does not exist on disk`);
  if (envelope.authority_mode.mode === "standing-granted") verifyStandingAuthority(proof.path, planLabel);
  else verifyExplicitAuthority(proof.path, selected.path, planLabel);

  return {
    authorityClass: TEMP_AUTHORITY_CLASS,
    selected_plan: selected.path,
    mode: envelope.authority_mode.mode,
    proof_path: proof.path,
    scope_count: envelope.scope_count,
    stop_condition_count: envelope.stop_condition_count,
    artifact_receipt_schema_version: TEMP_RECEIPT_SCHEMA,
    artifact_paths: artifactPaths,
  };
}

function validatePlan(planPathRaw, observations = defaultFsObservations(), cleanupObservations = defaultCleanupObservations()) {
  const planLabel = toPosix(planPathRaw);
  const planNorm = normalizePath(planPathRaw, "plan path");
  const planAbs = path.resolve(ROOT, planNorm.path);

  if (!fs.existsSync(planAbs)) {
    block(`plan path "${planLabel}" does not exist on disk`);
  }

  const text = fs.readFileSync(planAbs, "utf8");
  const section = extractValidateContract(text, planLabel);
  const bodies = collectFenceBodies(section);

  let envelopeRaw = null;
  let matches = 0;
  for (const b of bodies) {
    if (!b.info.startsWith("json ")) continue;
    const label = b.info.slice(5).trim();
    if (label === ENVELOPE_SCHEMA) {
      matches++;
      envelopeRaw = b.body.join("\n");
    } else if (label.startsWith(ENVELOPE_SCHEMA_PREFIX)) {
      block(
        `${planLabel} declares unknown envelope schema "${label}" — only "${ENVELOPE_SCHEMA}" is supported`,
      );
    }
  }
  if (matches === 0) {
    block(`${planLabel} has no "${ENVELOPE_SCHEMA}" JSON block inside "## Validate Contract"`);
  }
  if (matches > 1) {
    block(
      `${planLabel} has ${matches} "${ENVELOPE_SCHEMA}" JSON blocks inside "## Validate Contract" — exactly one is allowed`,
    );
  }

  findDuplicateKeys(envelopeRaw, planLabel, { decoded: false });

  let envelope;
  try {
    envelope = JSON.parse(envelopeRaw);
  } catch (err) {
    block(`${planLabel} envelope is not valid JSON — ${err.message}`);
  }
  if (envelope === null || typeof envelope !== "object" || Array.isArray(envelope)) {
    block(`${planLabel} envelope must be a JSON object`);
  }
  if (Object.hasOwn(envelope, "authorityClass")) {
    findDuplicateKeys(envelopeRaw, planLabel);
    if (envelope.authorityClass === TEMP_AUTHORITY_CLASS) {
      return validateTemporaryEnvelope(envelope, planLabel, planNorm, observations);
    }
    if (envelope.authorityClass === CLEANUP_AUTHORITY_CLASS) {
      return validateCleanupEnvelope(envelope, planLabel, planNorm, cleanupObservations);
    }
    if (envelope.authorityClass === DIAGNOSTIC_AUTHORITY_CLASS) {
      return validateRepositoryDiagnosticEnvelope(envelope, planLabel, planNorm);
    }
    if (envelope.authorityClass === DIAGNOSTIC_V2_AUTHORITY_CLASS) {
      return validateRepositoryDiagnosticV2Envelope(envelope, planLabel, planNorm);
    }
    block(`${planLabel} authorityClass "${envelope.authorityClass}" is unknown`);
  }

  const keys = Object.keys(envelope);
  const missing = REQUIRED_FIELDS.filter((f) => !keys.includes(f));
  if (missing.length > 0) {
    block(`${planLabel} envelope is missing required field(s): ${missing.join(", ")}`);
  }
  const unknown = keys.filter((k) => !REQUIRED_FIELDS.includes(k));
  if (unknown.length > 0) {
    block(`${planLabel} envelope has unknown top-level field(s): ${unknown.join(", ")}`);
  }

  const authority = envelope.authority_mode;
  if (authority === null || typeof authority !== "object" || Array.isArray(authority)) {
    block(`${planLabel} authority_mode must be a JSON object`);
  }
  const authKeys = Object.keys(authority);
  const authMissing = AUTHORITY_KEYS.filter((k) => !authKeys.includes(k));
  if (authMissing.length > 0) {
    block(`${planLabel} authority_mode is missing key(s): ${authMissing.join(", ")}`);
  }
  const authUnknown = authKeys.filter((k) => !AUTHORITY_KEYS.includes(k));
  if (authUnknown.length > 0) {
    block(`${planLabel} authority_mode has unknown key(s): ${authUnknown.join(", ")}`);
  }
  if (!AUTHORITY_MODES.includes(authority.mode)) {
    block(
      `${planLabel} authority_mode.mode "${authority.mode}" is not in the closed set: ${AUTHORITY_MODES.join(", ")}`,
    );
  }

  if (!Array.isArray(envelope.allowed_scope) || envelope.allowed_scope.length === 0) {
    block(`${planLabel} allowed_scope must be a non-empty array`);
  }
  if (!Array.isArray(envelope.stop_conditions) || envelope.stop_conditions.length === 0) {
    block(`${planLabel} stop_conditions must be a non-empty array`);
  }
  for (const condition of envelope.stop_conditions) {
    if (typeof condition !== "string" || condition.trim().length === 0) {
      block(`${planLabel} stop_conditions contains an empty or non-string entry`);
    }
  }

  const artifactSchema = ARTIFACT_SCHEMAS[envelope.artifact_schema_version];
  if (!artifactSchema) {
    block(
      `${planLabel} artifact_schema_version "${envelope.artifact_schema_version}" is unknown — supported schemas: ${Object.keys(ARTIFACT_SCHEMAS).join(", ")}`,
    );
  }

  const selected = normalizePath(envelope.selected_plan, "selected_plan");
  if (!fs.existsSync(path.resolve(ROOT, selected.path))) {
    block(`selected_plan "${selected.path}" does not exist on disk`);
  }
  if (selected.path !== planNorm.path) {
    block(
      `selected_plan "${selected.path}" does not match the validated plan "${planNorm.path}"`,
    );
  }

  const scopeEntries = [];
  const scopeSeen = new Set();
  for (const entry of envelope.allowed_scope) {
    const norm = normalizePath(entry, "allowed_scope entry", { allowSubtree: true });
    if (scopeSeen.has(norm.normalized)) {
      block(`allowed_scope contains duplicate normalized entry "${norm.normalized}"`);
    }
    scopeSeen.add(norm.normalized);
    scopeEntries.push(norm);
  }

  const artifact = normalizePath(envelope.artifact_path, "artifact_path");
  const destination = extractArtifactDestination(text, planLabel, artifactSchema.destinationLabel);
  const destinationNorm = normalizePath(destination, artifactSchema.destinationLabel);
  if (artifact.path !== destinationNorm.path) {
    block(
      `artifact_path "${artifact.path}" does not equal the plan ${artifactSchema.destinationLabel} "${destinationNorm.path}"`,
    );
  }
  if (!scopeCovers(scopeEntries, artifact.path)) {
    block(`artifact_path "${artifact.path}" is not covered by allowed_scope`);
  }
  if (!scopeCovers(scopeEntries, selected.path)) {
    block(`selected_plan "${selected.path}" is not covered by allowed_scope`);
  }

  const proof = normalizePath(authority.proof_path, "authority_mode.proof_path");
  if (!fs.existsSync(path.resolve(ROOT, proof.path))) {
    block(`authority_mode.proof_path "${proof.path}" does not exist on disk`);
  }
  if (authority.mode === "standing-granted") {
    verifyStandingAuthority(proof.path, planLabel);
  } else {
    verifyExplicitAuthority(proof.path, selected.path, planLabel);
  }

  return {
    selected_plan: selected.path,
    mode: authority.mode,
    proof_path: proof.path,
    scope_entries: scopeEntries.length,
    stop_conditions: envelope.stop_conditions.length,
    artifact_path: artifact.path,
    destination_kind: artifactSchema.destinationKind,
    artifact_schema_version: envelope.artifact_schema_version,
  };
}

function extractPlanEnvelope(planPathRaw) {
  const planNorm = normalizePath(planPathRaw, "plan path");
  const text = fs.readFileSync(path.resolve(ROOT, planNorm.path), "utf8");
  const section = extractValidateContract(text, planNorm.path);
  const envelopeBlock = collectFenceBodies(section).find((item) => item.info === `json ${ENVELOPE_SCHEMA}`);
  if (!envelopeBlock) block(`${planNorm.path} has no cleanup envelope`);
  return JSON.parse(envelopeBlock.body.join("\n"));
}

function cleanupReceiptIdentity(item) {
  return {
    dev: String(item.dev),
    ino: String(item.ino),
    type: cleanupModeType(item),
    mode: String(item.mode & 0o7777n),
    uid: String(item.uid),
    gid: String(item.gid),
  };
}

function cleanupRecordIdentity(record) {
  if (record.identity) return cleanupReceiptIdentity(record.identity);
  return {
    dev: record.dev,
    ino: record.ino,
    type: record.mode_type,
    mode: record.mode,
    uid: record.uid,
    gid: record.gid,
  };
}

function cleanupIdentitiesMatch(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cleanupGitStateSha256() {
  const bytes = execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: ROOT });
  return createHash("sha256").update(bytes).digest("hex");
}

function decodeMountinfoPath(value) {
  return value.replace(/\\([0-7]{3})/g, (_, octal) => String.fromCharCode(Number.parseInt(octal, 8)));
}

function assertCleanupMountpointsAbsent(records) {
  if (process.platform !== "linux" || !fs.existsSync("/proc/self/mountinfo")) return "NOT_AVAILABLE_ON_PLATFORM";
  const targets = new Set(records.map((record) => record.targetPath));
  const lines = fs.readFileSync("/proc/self/mountinfo", "utf8").split("\n").filter(Boolean);
  for (const line of lines) {
    const separator = line.indexOf(" - ");
    const fields = (separator === -1 ? line : line.slice(0, separator)).split(" ");
    if (fields.length < 5) block("cleanup preflight cannot parse /proc/self/mountinfo");
    if (targets.has(decodeMountinfoPath(fields[4]))) block("cleanup target is an exact mountpoint");
  }
  return "PROC_SELF_MOUNTINFO_EXACT_TARGETS_CLEAR";
}

function cleanupOperationError(code, message) {
  const err = new Error(message);
  err.code = code;
  throw err;
}

function observeCleanupRecord(record, observations) {
  const identity = cleanupReceiptIdentity(observations.observe(record.targetPath));
  if (!cleanupIdentitiesMatch(identity, cleanupRecordIdentity(record))) cleanupOperationError("IDENTITY_MISMATCH", "cleanup target identity changed before primitive");
  if (record.role === "link") {
    const expectedLink = decodeCanonicalBase64(record.symlink_target_b64, "symlink_target_b64").text;
    if (observations.readlink(record.targetPath) !== expectedLink) cleanupOperationError("LINK_TARGET_MISMATCH", "cleanup symlink target bytes changed before primitive");
  } else if (observations.readdir(record.targetPath).length !== 0) {
    cleanupOperationError("DIRECTORY_NOT_EMPTY", "cleanup source became non-empty before primitive");
  }
  return identity;
}

function cleanupCompanionPaths(records) {
  const paths = [];
  for (const record of records) {
    if (record.role !== "source" || record.expected_companion_state !== "absent") continue;
    paths.push({
      subject: "companion",
      basenameB64: Buffer.from(record.decodedBasename.slice(0, -6) + "link").toString("base64"),
      targetPath: path.join(ROOT, record.decodedBasename.slice(0, -6) + "link"),
    });
  }
  return paths;
}

function assertCleanupProcessReferencesAbsent(records) {
  if (process.platform !== "linux" || !fs.existsSync("/proc")) return "NOT_AVAILABLE_ON_PLATFORM";
  const targetIdentities = new Set(records.map((record) => `${record.dev}:${record.ino}`));
  const ownUid = typeof process.getuid === "function" ? process.getuid() : null;
  for (const entry of fs.readdirSync("/proc", { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[0-9]+$/.test(entry.name)) continue;
    const procRoot = path.join("/proc", entry.name);
    let status;
    try {
      status = fs.readFileSync(path.join(procRoot, "status"), "utf8");
    } catch (err) {
      if (err.code === "ENOENT") continue;
      block(`cleanup preflight cannot read ${procRoot}/status`);
    }
    const uidLine = status.split("\n").find((line) => /^Uid:\s+[0-9]+(?:\s|$)/.test(line));
    const uid = uidLine === undefined ? NaN : Number(uidLine.match(/^Uid:\s+([0-9]+)/)[1]);
    if (!Number.isSafeInteger(uid)) block(`cleanup preflight cannot select ${procRoot}/status Uid`);
    if (ownUid !== null && uid !== ownUid) continue;
    for (const linkName of ["cwd", "root"]) {
      try {
        const item = fs.statSync(path.join(procRoot, linkName), { bigint: true });
        if (targetIdentities.has(`${item.dev}:${item.ino}`)) block(`cleanup target is referenced by process ${entry.name} ${linkName}`);
      } catch (err) {
        if (!["ENOENT", "EINVAL"].includes(err.code)) block(`cleanup preflight cannot inspect ${procRoot}/${linkName}`);
      }
    }
    let fds;
    try {
      fds = fs.readdirSync(path.join(procRoot, "fd"));
    } catch (err) {
      if (err.code === "ENOENT") continue;
      block(`cleanup preflight cannot inspect ${procRoot}/fd`);
    }
    for (const fd of fds) {
      try {
        const item = fs.statSync(path.join(procRoot, "fd", fd), { bigint: true });
        if (targetIdentities.has(`${item.dev}:${item.ino}`)) block(`cleanup target is referenced by process ${entry.name} fd ${fd}`);
      } catch (err) {
        if (!["ENOENT", "EINVAL"].includes(err.code)) block(`cleanup preflight cannot inspect ${procRoot}/fd/${fd}`);
      }
    }
  }
  return "SAME_REAL_UID_READABLE_PROC_CLEAR";
}

function cleanupExecutionModel(planPathRaw) {
  const envelope = extractPlanEnvelope(planPathRaw);
  if (envelope.authorityClass !== CLEANUP_AUTHORITY_CLASS) block(`--execute-cleanup requires authorityClass "${CLEANUP_AUTHORITY_CLASS}"`);
  const observations = defaultCleanupObservations();
  validatePlan(planPathRaw, defaultFsObservations(), observations);
  const records = envelope.allowed_scope.map((target) => {
    const decodedBasename = decodeCanonicalBase64(target.basename_b64, "cleanup basename").text;
    return { ...target, decodedBasename, targetPath: path.join(ROOT, decodedBasename) };
  });
  const rootItem = observations.lstatSync(ROOT);
  const rootDev = String(rootItem.dev);
  for (const record of records) {
    const item = observations.lstatSync(record.targetPath);
    if (String(item.dev) !== rootDev) block(`cleanup target crosses the repository-root device`);
  }
  const mountpointCheck = assertCleanupMountpointsAbsent(records);
  const processReferenceCheck = assertCleanupProcessReferencesAbsent(records);
  const canonical = JSON.stringify({ repository_root: envelope.repository_root, allowed_scope: envelope.allowed_scope });
  return {
    selectedPlan: normalizePath(planPathRaw, "plan path").path,
    authorityClass: CLEANUP_AUTHORITY_CLASS,
    targetSetSha256: createHash("sha256").update(canonical).digest("hex"),
    repositoryRoot: cleanupReceiptIdentity(rootItem),
    records,
    companions: cleanupCompanionPaths(records),
    mountpointCheck,
    processReferenceCheck,
  };
}

function runCleanupExecution(model, seams = {}) {
  const observe = seams.observe ?? ((target) => fs.lstatSync(target, { bigint: true }));
  const readlink = seams.readlink ?? fs.readlinkSync;
  const readdir = seams.readdir ?? fs.readdirSync;
  const remove = seams.remove ?? ((record) => record.operation === "unlink" ? fs.unlinkSync(record.targetPath) : fs.rmdirSync(record.targetPath));
  const gitHash = seams.gitHash ?? cleanupGitStateSha256;
  const now = seams.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const beforeSha256 = gitHash();
  const initialIdentities = model.records.map((record) => cleanupReceiptIdentity(observe(record.targetPath)));
  const beforeObservations = model.records.map((record, index) => ({
    ordinal: record.ordinal,
    basenameB64: record.basename_b64,
    ...initialIdentities[index],
    status: "PRESENT_MATCHED",
  }));
  const operations = [];
  let successful = 0;
  let failed = false;
  for (const [index, record] of model.records.entries()) {
    const targetIdentity = cleanupRecordIdentity(record);
    if (failed) {
      operations.push({ ordinal: record.ordinal, operation: record.operation, targetIdentity, immediateRecheck: targetIdentity, result: "NOT_ATTEMPTED", error: null });
      continue;
    }
    let immediateRecheck = targetIdentity;
    try {
      const rootRecheck = cleanupReceiptIdentity(observe(ROOT));
      if (!cleanupIdentitiesMatch(rootRecheck, model.repositoryRoot)) cleanupOperationError("ROOT_IDENTITY_MISMATCH", "cleanup repository root identity changed before primitive");
      immediateRecheck = observeCleanupRecord(record, { observe, readlink, readdir });
      if (!cleanupIdentitiesMatch(immediateRecheck, initialIdentities[index])) cleanupOperationError("IDENTITY_MISMATCH", "cleanup target identity changed since initial observation");
      remove(record);
      successful += 1;
      operations.push({ ordinal: record.ordinal, operation: record.operation, targetIdentity, immediateRecheck, result: "SUCCESS", error: null });
    } catch (err) {
      failed = true;
      operations.push({ ordinal: record.ordinal, operation: record.operation, targetIdentity, immediateRecheck, result: "FAILED", error: { code: String(err.code ?? "ERROR"), message: String(err.message) } });
    }
  }
  const absenceSubjects = [
    ...model.records.map((record) => ({ subject: "target", basenameB64: record.basename_b64, targetPath: record.targetPath })),
    ...model.companions,
  ];
  const finalObservations = absenceSubjects.map((subject, index) => {
    try {
      observe(subject.targetPath);
      return { ordinal: index + 1, subject: subject.subject, basenameB64: subject.basenameB64, result: "PRESENT", errorCode: "NONE" };
    } catch (err) {
      return { ordinal: index + 1, subject: subject.subject, basenameB64: subject.basenameB64, result: err.code === "ENOENT" ? "ENOENT" : "OBSERVATION_FAILED", errorCode: String(err.code ?? "ERROR") };
    }
  });
  const afterSha256 = gitHash();
  const finalAbsencePass = finalObservations.every((item) => item.result === "ENOENT" && item.errorCode === "ENOENT");
  const gitMatches = beforeSha256 === afterSha256;
  let status = "PASS";
  if (failed || !finalAbsencePass || !gitMatches) status = successful > 0 ? "PARTIAL_FAILURE" : "FAIL";
  const receipt = {
    schema: CLEANUP_RECEIPT_SCHEMA,
    status,
    selectedPlan: model.selectedPlan,
    authorityClass: model.authorityClass,
    targetSetSha256: model.targetSetSha256,
    repositoryRoot: { absolutePath: ROOT, ...model.repositoryRoot },
    preflight: {
      status: "PASS",
      envelopeValidated: true,
      mountpointCheck: model.mountpointCheck,
      processReferenceCheck: model.processReferenceCheck,
      visibilityCeilings: process.platform === "linux" ? ["SAME_REAL_UID_READABLE_PROC_ONLY"] : ["PROC_REFERENCE_ORACLE_NOT_AVAILABLE"],
      beforeObservations,
    },
    operations,
    finalAbsence: { status: finalAbsencePass ? "PASS" : "FAIL", observations: finalObservations },
    gitState: { beforeSha256, afterSha256, matches: gitMatches },
    creationCount: 0,
    sourceWriteCount: 0,
    unauthorizedNonCleanupWriteCount: 0,
    limitations: ["TOCTOU_NOT_ELIMINATED", "NO_HISTORICAL_ATTESTATION_OR_REPLAY"],
    startedAt,
    finishedAt: now(),
  };
  return { receipt, exitCode: status === "PASS" ? 0 : status === "PARTIAL_FAILURE" ? 2 : 1 };
}

function writeCleanupReceipt(result, writer = (bytes) => fs.writeFileSync(1, bytes)) {
  const bytes = Buffer.from(`${JSON.stringify(result.receipt)}\n`);
  writer(bytes);
  return result.exitCode;
}

function normalizeObjectIdentity(item, expectedType = "file") {
  const mode = item.mode;
  if (typeof item.dev !== "bigint" || typeof item.ino !== "bigint" || typeof mode !== "bigint") {
    block(`filesystem identity is not a usable bigint tuple`);
  }
  const modeType = mode & BigInt(fs.constants.S_IFMT);
  const expectedMode = expectedType === "file"
    ? BigInt(fs.constants.S_IFREG)
    : expectedType === "junction"
      ? BigInt(fs.constants.S_IFLNK)
      : BigInt(fs.constants.S_IFDIR);
  const typeMatches = expectedType === "file"
    ? item.isFile() && !item.isSymbolicLink()
    : expectedType === "junction"
      ? item.isSymbolicLink()
      : item.isDirectory() && !item.isSymbolicLink();
  if (!typeMatches || modeType !== expectedMode) block(`filesystem identity is not the expected ${expectedType} type`);
  if (item.dev === 0n && item.ino === 0n) block(`filesystem identity has an unusable all-zero dev/ino pair`);
  return { dev: item.dev, ino: item.ino, modeType };
}

function identitiesEqual(expected, observed) {
  return expected.dev === observed.dev && expected.ino === observed.ino && expected.modeType === observed.modeType;
}

function requireMatchingIdentity(expected, observed) {
  if (!identitiesEqual(expected, observed)) block(`original-handle and path identities do not match`);
}

function readExactFromHandle(handle, length, read = fs.readSync) {
  const readback = Buffer.alloc(length);
  let filled = 0;
  while (filled < length) {
    const count = read(handle, readback, filled, length - filled, filled);
    if (count === 0) block(`temporary artifact positional readback ended before the frozen byte length`);
    filled += count;
  }
  const eof = Buffer.alloc(1);
  if (read(handle, eof, 0, 1, length) !== 0) block(`temporary artifact positional readback found trailing bytes`);
  return readback;
}

function createTemporaryArtifact(targetPath, artifactSchemaVersion, bytes, observations = defaultFsObservations()) {
  const normalized = normalizeTemporaryPath(targetPath, "temporary artifact path");
  const precreate = assertSafeTemporaryTarget(normalized, observations);
  let handle;
  let handleIdentity;
  let receipt;
  let failure;
  try {
    handle = fs.openSync(precreate.filesystemPath, "wx+");
    let written = 0;
    while (written < bytes.length) {
      const count = fs.writeSync(handle, bytes, written, bytes.length - written, written);
      if (count === 0) block(`temporary artifact write made no progress`);
      written += count;
    }
    fs.fsyncSync(handle);
    handleIdentity = normalizeObjectIdentity(fs.fstatSync(handle, { bigint: true }), "file");
    const postreadback = assertSafeTemporaryTarget(normalized, observations, { requireFile: true });
    if (postreadback.rootReal.replace(/\//g, "\\").toLowerCase() !== precreate.rootReal.replace(/\//g, "\\").toLowerCase()) {
      block(`approved temporary root identity changed after readback`);
    }
    const pathItem = observations.lstatSync(postreadback.filesystemPath, { bigint: true });
    const pathIdentity = normalizeObjectIdentity(pathItem, "file");
    requireMatchingIdentity(handleIdentity, pathIdentity);
    const readback = readExactFromHandle(handle, bytes.length);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (!readback.equals(bytes) || createHash("sha256").update(readback).digest("hex") !== sha256) {
      block(`temporary artifact readback does not match frozen bytes`);
    }
    if (!readback.toString("utf8").includes(artifactSchemaVersion)) block(`temporary artifact readback lacks its schema marker`);
    receipt = {
      schema: TEMP_RECEIPT_SCHEMA,
      artifactPath: postreadback.displayPath,
      artifactSchemaVersion,
      bytes: bytes.length,
      sha256,
      exclusiveCreate: true,
      regularNonReparse: true,
      readbackMatches: true,
      status: "PASS",
    };
  } catch (err) {
    failure = err;
  } finally {
    if (handle !== undefined) {
      try {
        fs.closeSync(handle);
      } catch (err) {
        failure = err;
      }
    }
  }
  if (failure) {
    if (handleIdentity) {
      const cleanup = cleanupCreationArtifact(precreate.filesystemPath, { expectedType: "file", ...handleIdentity });
      if (cleanup.status !== "PASS") {
        const reason = failure instanceof Error ? failure.message : String(failure);
        block(`${reason}; ${cleanup.reason}; retained paths: ${cleanup.retainedPaths.join(", ")}`);
      }
    }
    throw failure;
  }
  return receipt;
}

function cleanupIdentity(item, expectedType) {
  return { expectedType, ...normalizeObjectIdentity(item, expectedType) };
}

function captureCleanupIdentity(target, expectedType, observations = defaultFsObservations()) {
  if (!observations.existsSync(target)) block(`cleanup path is missing at "${target}"`);
  return cleanupIdentity(observations.lstatSync(target, { bigint: true }), expectedType);
}

function cleanupIdentityMatches(target, expected, observations = defaultFsObservations()) {
  try {
    const actual = captureCleanupIdentity(target, expected.expectedType, observations);
    return identitiesEqual(expected, actual);
  } catch {
    return false;
  }
}

function cleanupFailure(retainedPaths, reason) {
  return {
    status: "FAIL",
    reason,
    manualCleanupRequired: true,
    retainedPaths,
  };
}

function cleanupCreationArtifact(target, expected, observations = defaultFsObservations()) {
  if (!cleanupIdentityMatches(target, expected, observations)) {
    return cleanupFailure([target], "manual-cleanup-required: creation artifact identity or type mismatch");
  }
  try {
    fs.unlinkSync(target);
    return { status: "PASS", removedPaths: [target] };
  } catch (err) {
    return cleanupFailure([target], `manual-cleanup-required: unlink failed: ${err.code ?? err.message}`);
  }
}

function sourceIsExpectedEmptyDirectory(source, expected, observations = defaultFsObservations()) {
  return cleanupIdentityMatches(source, expected, observations) && fs.readdirSync(source).length === 0;
}

function cleanupJunctionProbe(junction, expectedJunction, source, expectedSource, observations = defaultFsObservations()) {
  const retainedPaths = [junction, source];
  if (!cleanupIdentityMatches(junction, expectedJunction, observations)) {
    return cleanupFailure(retainedPaths, "manual-cleanup-required: junction identity or reparse type mismatch");
  }
  if (!sourceIsExpectedEmptyDirectory(source, expectedSource, observations)) {
    return cleanupFailure(retainedPaths, "manual-cleanup-required: source directory identity, type, or emptiness mismatch");
  }
  try {
    fs.unlinkSync(junction);
  } catch (err) {
    return cleanupFailure(retainedPaths, `manual-cleanup-required: junction unlink failed: ${err.code ?? err.message}`);
  }
  if (!sourceIsExpectedEmptyDirectory(source, expectedSource, observations)) {
    return cleanupFailure([source], "manual-cleanup-required: source directory changed after junction unlink");
  }
  try {
    fs.rmdirSync(source);
    return { status: "PASS", removedPaths: [junction, source] };
  } catch (err) {
    return cleanupFailure([source], `manual-cleanup-required: source rmdir failed: ${err.code ?? err.message}`);
  }
}

function identitySnapshot(identity) {
  return identity
    ? {
        dev: identity.dev.toString(),
        ino: identity.ino.toString(),
        modeType: identity.modeType.toString(),
        expectedType: identity.expectedType ?? "file",
      }
    : null;
}

function probeCase(status, expectedIdentity, observedIdentity, refused, manualCleanupRequired, retainedPaths, proof) {
  return {
    status,
    expectedIdentity: identitySnapshot(expectedIdentity),
    observedIdentity: identitySnapshot(observedIdentity),
    refused,
    manualCleanupRequired,
    retainedPaths: [...retainedPaths].sort(),
    proof,
  };
}

function runCreationProbe() {
  const probeId = `${process.pid}-${randomUUID()}`;
  const schema = "execution-authority-probe/v1";
  const bytes = Buffer.from(JSON.stringify({ schema }) + "\n");
  const normalTarget = path.win32.join(TEMP_ROOT, `execution-authority-creation-${probeId}-normal.json`);
  const substitutionTarget = path.win32.join(TEMP_ROOT, `execution-authority-creation-${probeId}-substitution.json`);
  const retainedOriginal = path.win32.join(TEMP_ROOT, `execution-authority-creation-${probeId}-retained-original.json`);
  const receipt = createTemporaryArtifact(normalTarget, schema, bytes);
  const normalIdentity = captureCleanupIdentity(normalTarget, "file");
  let collisionBlocked = false;
  try {
    createTemporaryArtifact(normalTarget, schema, bytes);
  } catch (err) {
    if (!(err instanceof Blocked) && err.code !== "EEXIST") throw err;
    collisionBlocked = true;
  }
  if (!collisionBlocked) block(`exclusive-create collision probe did not block`);
  const normalCleanup = cleanupCreationArtifact(normalTarget, normalIdentity);
  if (normalCleanup.status !== "PASS") block(`${normalCleanup.reason}; retained paths: ${normalCleanup.retainedPaths.join(", ")}`);

  fs.writeFileSync(substitutionTarget, bytes, { flag: "wx" });
  const expected = captureCleanupIdentity(substitutionTarget, "file");
  fs.renameSync(substitutionTarget, retainedOriginal);
  const replacementBytes = Buffer.from('{"replacement":true}\n');
  fs.writeFileSync(substitutionTarget, replacementBytes, { flag: "wx" });
  const observed = captureCleanupIdentity(substitutionTarget, "file");
  const refusedCleanup = cleanupCreationArtifact(substitutionTarget, expected);
  const retained = fs.existsSync(substitutionTarget) && fs.existsSync(retainedOriginal);
  const unchanged = fs.readFileSync(substitutionTarget).equals(replacementBytes);
  if (refusedCleanup.status !== "FAIL" || !refusedCleanup.manualCleanupRequired || !retained || !unchanged) {
    block(`live creation cleanup substitution was not safely refused and retained`);
  }
  const substitutionCase = probeCase(
    "PASS",
    expected,
    observed,
    true,
    true,
    [substitutionTarget, retainedOriginal],
    "replacement bytes unchanged and replacement plus retained original existed after production cleanup refusal",
  );
  const cleanupResults = [
    cleanupCreationArtifact(substitutionTarget, captureCleanupIdentity(substitutionTarget, "file")),
    cleanupCreationArtifact(retainedOriginal, captureCleanupIdentity(retainedOriginal, "file")),
  ];
  if (cleanupResults.some((result) => result.status !== "PASS")) block(`creation probe harness cleanup failed`);
  const observation = {
    schema: "execution-authority-creation-probe/v1",
    status: "PASS",
    probeId,
    platform: process.platform,
    exercise: "original-handle creation and controlled same-path cleanup substitution refusal",
    normalCase: probeCase("PASS", normalIdentity, normalIdentity, false, false, [], `receipt ${receipt.sha256}; collision refused; matching identity removed`),
    substitutionCase,
    harnessCleanup: probeCase("PASS", observed, observed, false, false, [], "fresh identity-checked nonrecursive unlink removed replacement and retained original"),
    manualCleanupRequired: false,
    retainedPaths: [],
  };
  console.log(JSON.stringify(observation, null, 2));
}

function cleanupEmptyDirectory(source, expected) {
  if (!sourceIsExpectedEmptyDirectory(source, expected)) {
    return cleanupFailure([source], "manual-cleanup-required: source directory identity, type, or emptiness mismatch");
  }
  try {
    fs.rmdirSync(source);
    return { status: "PASS", removedPaths: [source] };
  } catch (err) {
    return cleanupFailure([source], `manual-cleanup-required: source rmdir failed: ${err.code ?? err.message}`);
  }
}

function lstatOrAbsent(target) {
  try {
    return fs.lstatSync(target, { bigint: true });
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

function withOwnedObjects(run) {
  const owned = [];
  const register = (target, expectedType) => {
    const identity = captureCleanupIdentity(target, expectedType);
    owned.push({
      target,
      identity,
      linkText: expectedType === "junction" ? fs.readlinkSync(target) : null,
    });
    return identity;
  };
  let failure;
  try {
    run(register);
  } catch (err) {
    failure = err;
  } finally {
    const retained = [];
    for (const item of [...owned].reverse()) {
      const observed = lstatOrAbsent(item.target);
      if (observed === null) continue;
      let matches = false;
      try {
        const identity = cleanupIdentity(observed, item.identity.expectedType);
        matches = identitiesEqual(item.identity, identity);
        if (matches && item.identity.expectedType === "junction") {
          matches = fs.readlinkSync(item.target) === item.linkText;
        }
        if (matches && item.identity.expectedType === "directory") {
          matches = fs.readdirSync(item.target).length === 0;
        }
      } catch {
        matches = false;
      }
      if (!matches) {
        retained.push(item.target);
        continue;
      }
      try {
        if (item.identity.expectedType === "directory") fs.rmdirSync(item.target);
        else fs.unlinkSync(item.target);
      } catch {
        retained.push(item.target);
      }
    }
    for (const item of owned) {
      if (lstatOrAbsent(item.target) !== null && !retained.includes(item.target)) retained.push(item.target);
    }
    if (retained.length > 0) {
      failure = new Blocked(`manual-cleanup-required; retained paths: ${retained.sort().join(", ")}`);
    }
  }
  if (failure) throw failure;
}

function junctionSelfCheckPaths(prefix) {
  if (process.platform === "win32") {
    return {
      ownerRoot: null,
      source: path.win32.join(TEMP_ROOT, `${prefix}-source`),
      junction: path.win32.join(TEMP_ROOT, `${prefix}-link`),
    };
  }
  const ownerRoot = fs.mkdtempSync(path.join(os.tmpdir(), "execution-authority-envelope-"));
  return {
    ownerRoot,
    source: path.join(ownerRoot, `${prefix}-source`),
    junction: path.join(ownerRoot, `${prefix}-link`),
  };
}

function runJunctionProbe() {
  const probeId = `${process.pid}-${randomUUID()}`;
  const paths = {
    normalSource: path.win32.join(TEMP_ROOT, `execution-authority-junction-${probeId}-normal-source`),
    normalJunction: path.win32.join(TEMP_ROOT, `execution-authority-junction-${probeId}-normal-link`),
    originalSource: path.win32.join(TEMP_ROOT, `execution-authority-junction-${probeId}-original-source`),
    replacementSource: path.win32.join(TEMP_ROOT, `execution-authority-junction-${probeId}-replacement-source`),
    substitutionJunction: path.win32.join(TEMP_ROOT, `execution-authority-junction-${probeId}-substitution-link`),
  };
  const makeSkip = (reason, cleanup) => ({
    schema: "execution-authority-junction-probe/v1",
    status: "SKIP",
    probeId,
    platform: process.platform,
    exercise: "normal junction rejection and controlled cleanup substitution refusal",
    normalCase: probeCase("SKIP", null, null, false, false, [], reason),
    substitutionCase: probeCase("SKIP", null, null, false, false, [], reason),
    harnessCleanup: probeCase(cleanup.status, null, null, false, cleanup.status !== "PASS", cleanup.retainedPaths ?? [], reason),
    manualCleanupRequired: cleanup.status !== "PASS",
    retainedPaths: cleanup.retainedPaths ?? [],
  });
  if (process.platform !== "win32") {
    console.log(JSON.stringify(makeSkip("Windows junction probe requires win32", { status: "PASS" }), null, 2));
    return;
  }
  fs.mkdirSync(paths.normalSource);
  const normalSourceIdentity = captureCleanupIdentity(paths.normalSource, "directory");
  try {
    fs.symlinkSync(paths.normalSource, paths.normalJunction, "junction");
  } catch (err) {
    const cleanup = cleanupEmptyDirectory(paths.normalSource, normalSourceIdentity);
    console.log(JSON.stringify(makeSkip(`${err.code ?? "ERROR"}: ${err.message}`, cleanup), null, 2));
    return;
  }
  const normalJunctionIdentity = captureCleanupIdentity(paths.normalJunction, "junction");
  let blocked = false;
  try {
    assertSafeTemporaryTarget(normalizeTemporaryPath(path.win32.join(paths.normalJunction, "x.json"), "junction probe"));
  } catch (err) {
    if (!(err instanceof Blocked)) throw err;
    blocked = true;
  }
  if (!blocked) block(`live Windows junction probe was not rejected`);
  const normalCleanup = cleanupJunctionProbe(paths.normalJunction, normalJunctionIdentity, paths.normalSource, normalSourceIdentity);
  if (normalCleanup.status !== "PASS") block(`${normalCleanup.reason}; retained paths: ${normalCleanup.retainedPaths.join(", ")}`);

  fs.mkdirSync(paths.originalSource);
  fs.mkdirSync(paths.replacementSource);
  fs.symlinkSync(paths.originalSource, paths.substitutionJunction, "junction");
  const expected = captureCleanupIdentity(paths.substitutionJunction, "junction");
  const originalSourceIdentity = captureCleanupIdentity(paths.originalSource, "directory");
  const replacementSourceIdentity = captureCleanupIdentity(paths.replacementSource, "directory");
  const originalJunctionCleanup = cleanupCreationArtifact(paths.substitutionJunction, expected);
  if (originalJunctionCleanup.status !== "PASS") block(originalJunctionCleanup.reason);
  fs.symlinkSync(paths.replacementSource, paths.substitutionJunction, "junction");
  const observed = captureCleanupIdentity(paths.substitutionJunction, "junction");
  const refused = cleanupJunctionProbe(paths.substitutionJunction, expected, paths.originalSource, originalSourceIdentity);
  const retainedPaths = [paths.originalSource, paths.replacementSource, paths.substitutionJunction].sort();
  if (refused.status !== "FAIL" || !refused.manualCleanupRequired || retainedPaths.some((item) => !fs.existsSync(item))) {
    block(`live junction cleanup substitution was not safely refused and retained`);
  }
  const substitutionCase = probeCase("PASS", expected, observed, true, true, retainedPaths, "replacement junction and both source directories existed after production cleanup refusal");
  const replacementJunctionCleanup = cleanupCreationArtifact(paths.substitutionJunction, observed);
  const originalSourceCleanup = cleanupEmptyDirectory(paths.originalSource, originalSourceIdentity);
  const replacementSourceCleanup = cleanupEmptyDirectory(paths.replacementSource, replacementSourceIdentity);
  if ([replacementJunctionCleanup, originalSourceCleanup, replacementSourceCleanup].some((result) => result.status !== "PASS")) {
    block(`junction probe harness cleanup failed`);
  }
  const observation = {
    schema: "execution-authority-junction-probe/v1",
    status: "PASS",
    probeId,
    platform: process.platform,
    exercise: "normal junction rejection and controlled cleanup substitution refusal",
    normalCase: probeCase("PASS", normalJunctionIdentity, normalJunctionIdentity, true, false, [], "target-path alias rejected and matching junction/source removed nonrecursively"),
    substitutionCase,
    harnessCleanup: probeCase("PASS", observed, observed, false, false, [], "fresh identity-checked junction unlink and empty-source rmdir cleanup completed"),
    manualCleanupRequired: false,
    retainedPaths: [],
  };
  console.log(JSON.stringify(observation, null, 2));
}

function runSelfChecks() {
  const results = [];
  const check = (name, fn, expectBlocked) => {
    let blocked = false;
    let detail = "";
    try {
      fn();
    } catch (err) {
      if (!(err instanceof Blocked)) throw err;
      blocked = true;
      detail = err.message;
    }
    results.push({ name, expected: expectBlocked ? "reject" : "accept", actual: blocked ? "reject" : "accept", detail });
  };

  check("windows-separators-normalize", () => {
    const n = normalizePath(".claude\\agents\\vc-execute-agent.md", "t");
    if (n.path !== ".claude/agents/vc-execute-agent.md") block("normalization failed");
  }, false);
  check("windows-subtree-normalizes", () => {
    const n = normalizePath("a\\b\\**", "t", { allowSubtree: true });
    if (n.path !== "a/b" || !n.isSubtree) block("subtree normalization failed");
  }, false);
  check("traversal-parent-rejected", () => normalizePath("../etc/passwd", "t"), true);
  check("traversal-embedded-rejected", () => normalizePath("a/../../b", "t"), true);
  check("traversal-windows-rejected", () => normalizePath("a\\..\\b", "t"), true);
  check("dot-segment-rejected", () => normalizePath("./a", "t"), true);
  check("absolute-rejected", () => normalizePath("/etc/passwd", "t"), true);
  check("unc-rejected", () => normalizePath("\\\\server\\share\\x", "t"), true);
  check("drive-rejected", () => normalizePath("C:\\Windows\\x", "t"), true);
  check("empty-rejected", () => normalizePath("", "t"), true);
  check("nul-rejected", () => normalizePath("a\u0000b", "t"), true);
  check("star-glob-rejected", () => normalizePath("a/*.md", "t", { allowSubtree: true }), true);
  check("midpath-globstar-rejected", () => normalizePath("a/**/b", "t", { allowSubtree: true }), true);
  check("subtree-not-allowed-on-exact-field", () => normalizePath("a/**", "t"), true);
  check("subtree-covers-child", () => {
    const scope = [normalizePath("a/b/**", "t", { allowSubtree: true })];
    if (!scopeCovers(scope, "a/b/c.md")) block("coverage failed");
    if (scopeCovers(scope, "a/bc.md")) block("over-broad coverage");
  }, false);
  check("unknown-fence-label-rejected", () => {
    const lines = [
      "## Validate Contract",
      "```json execution-authority-envelope/v9",
      "{}",
      "```",
    ];
    const bodies = collectFenceBodies(lines);
    for (const b of bodies) {
      if (!b.info.startsWith("json ")) continue;
      const label = b.info.slice(5).trim();
      if (label !== ENVELOPE_SCHEMA && label.startsWith(ENVELOPE_SCHEMA_PREFIX)) {
        block(`unknown envelope schema "${label}"`);
      }
    }
  }, true);
  check("known-fence-label-accepted", () => {
    const lines = [
      "## Validate Contract",
      "```json execution-authority-envelope/v1",
      "{}",
      "```",
    ];
    const bodies = collectFenceBodies(lines);
    const hit = bodies.filter(
      (b) => b.info.startsWith("json ") && b.info.slice(5).trim() === ENVELOPE_SCHEMA,
    );
    if (hit.length !== 1) block("expected exactly one envelope fence");
  }, false);
  check("duplicate-key-detected", () => findDuplicateKeys('{"a":1,"a":2}', "t"), true);
  check("duplicate-key-nested-detected", () => findDuplicateKeys('{"o":{"m":1,"m":2}}', "t"), true);
  check("escaped-equivalent-key-detected", () => findDuplicateKeys('{"authorityClass":1,"authority\\u0043lass":2}', "t"), true);
  check("escaped-quote-equivalent-key-detected", () => findDuplicateKeys('{"a\\\"b":1,"a\\u0022b":2}', "t"), true);
  check("surrogate-equivalent-key-detected", () => findDuplicateKeys('{"\\ud83d\\ude00":1,"😀":2}', "t"), true);
  check("distinct-keys-accepted", () => findDuplicateKeys('{"a":1,"b":{"a":2}}', "t"), false);
  check("string-colon-not-a-key", () => findDuplicateKeys('{"a":"x:y","b":"x:y"}', "t"), false);
  for (const glob of ["*", "?", "[a]", "{a,b}", "**"]) {
    check(`temp-glob-${glob}-rejected`, () => normalizeTemporaryPath(`${TEMP_ROOT}\\x${glob}.json`, "t"), true);
  }
  for (const device of ["\\\\?\\C:\\Users\\Admin\\AppData\\Local\\Temp\\opencode\\x", "\\\\.\\C:\\Users\\Admin\\AppData\\Local\\Temp\\opencode\\x", "//?/C:/Users/Admin/AppData/Local/Temp/opencode/x"]) {
    check(`temp-device-${results.length}-rejected`, () => normalizeTemporaryPath(device, "t"), true);
  }
  check("temp-trailing-dot-rejected", () => normalizeTemporaryPath(`${TEMP_ROOT}\\x.\\a`, "t"), true);
  check("temp-trailing-space-rejected", () => normalizeTemporaryPath(`${TEMP_ROOT}\\x \\a`, "t"), true);
  check("temp-ads-rejected", () => normalizeTemporaryPath(`${TEMP_ROOT}\\x.json:stream`, "t"), true);
  for (const device of ["CON", "con.txt", "PRN", "AUX.log", "NUL", "CLOCK$.txt", "COM1", "com9.ext", "LPT1", "lpt9.ext", "COM¹", "com².txt", "COM³", "LPT¹", "lpt².txt", "LPT³"]) {
    check(`temp-dos-${device}-rejected`, () => normalizeTemporaryPath(`${TEMP_ROOT}\\${device}`, "t"), true);
  }
  check("temp-prefix-collision-rejected", () => normalizeTemporaryPath(`${TEMP_ROOT}-evil\\x`, "t"), true);
  check("temp-reparse-seam-rejected", () => {
    const target = normalizeTemporaryPath(`${TEMP_ROOT}\\alias\\x.json`, "t");
    const observations = {
      existsSync: () => true,
      realpathNative: (value) => value,
      lstatSync: (value) => ({
        isDirectory: () => value === TEMP_ROOT,
        isSymbolicLink: () => value !== TEMP_ROOT,
      }),
      statSync: () => ({ isFile: () => true }),
    };
    assertSafeTemporaryTarget(target, observations);
  }, true);
  check("temp-root-chain-rejected-before-realpath", () => {
    let realpathCalled = false;
    const target = normalizeTemporaryPath(`${TEMP_ROOT}\\x.json`, "t");
    const observations = {
      existsSync: () => true,
      realpathNative: (value) => {
        realpathCalled = true;
        return value;
      },
      lstatSync: (value) => ({
        isDirectory: () => value === TEMP_ROOT,
        isFile: () => false,
        isSymbolicLink: () => value.toLowerCase() === "c:\\users",
      }),
    };
    try {
      assertSafeTemporaryTarget(target, observations);
    } finally {
      if (realpathCalled) throw new Error("root realpath ran before lexical-chain rejection");
    }
  }, true);
  check("temp-postreadback-destination-drift-rejected", () => {
    const target = normalizeTemporaryPath(`${TEMP_ROOT}\\x.json`, "t");
    const observations = {
      existsSync: () => true,
      realpathNative: (value) => value,
      lstatSync: (value) => ({
        isDirectory: () => value === TEMP_ROOT,
        isFile: () => value !== path.win32.join(TEMP_ROOT, "x.json"),
        isSymbolicLink: () => value === path.win32.join(TEMP_ROOT, "x.json"),
      }),
    };
    assertSafeTemporaryTarget(target, observations, { requireFile: true });
  }, true);
  check("temp-postreadback-root-identity-drift-rejected", () => {
    const name = `execution-authority-root-drift-${process.pid}-${randomUUID()}.json`;
    const target = path.win32.join(TEMP_ROOT, name);
    const schema = "execution-authority-root-drift/v1";
    let rootObservations = 0;
    const observations = {
      existsSync: (value) => value.endsWith(name) ? rootObservations > 1 : true,
      realpathNative: (value) => {
        if (value === TEMP_ROOT) {
          rootObservations++;
          return rootObservations === 1 ? TEMP_ROOT : `${TEMP_ROOT}-drift`;
        }
        return value;
      },
      lstatSync: (value) => ({
        isDirectory: () => !value.endsWith(name),
        isFile: () => value.endsWith(name),
        isSymbolicLink: () => false,
      }),
    };
    withOwnedObjects((register) => {
      try {
        createTemporaryArtifact(target, schema, Buffer.from(JSON.stringify({ schema }) + "\n"), observations);
      } finally {
        if (lstatOrAbsent(target) !== null) register(target, "file");
      }
    });
  }, true);
  check("cleanup-creation-matching-identity-succeeds", () => {
    withOwnedObjects((register) => {
      const target = path.win32.join(TEMP_ROOT, `execution-authority-cleanup-file-${process.pid}-${randomUUID()}.json`);
      fs.writeFileSync(target, "{}\n", { flag: "wx" });
      const expected = register(target, "file");
      const cleanup = cleanupCreationArtifact(target, expected);
      if (cleanup.status !== "PASS" || lstatOrAbsent(target) !== null) block("matching creation cleanup failed");
    });
  }, false);
  check("cleanup-creation-substitution-refused", () => {
    withOwnedObjects((register) => {
      const target = path.win32.join(TEMP_ROOT, `execution-authority-cleanup-substitute-${process.pid}-${randomUUID()}.json`);
      fs.writeFileSync(target, "{}\n", { flag: "wx" });
      const expected = register(target, "file");
      const observations = {
        ...defaultFsObservations(),
        lstatSync: () => ({
          dev: expected.dev,
          ino: expected.ino,
          mode: expected.modeType,
          isFile: () => false,
          isDirectory: () => true,
          isSymbolicLink: () => false,
        }),
      };
      const refused = cleanupCreationArtifact(target, expected, observations);
      if (refused.status !== "FAIL" || !refused.manualCleanupRequired || lstatOrAbsent(target) === null) block("substituted creation cleanup was not refused");
      const cleanup = cleanupCreationArtifact(target, captureCleanupIdentity(target, "file"));
      if (cleanup.status !== "PASS") throw new Error(cleanup.reason);
    });
  }, false);
  check("cleanup-junction-matching-identities-succeeds", () => {
    withOwnedObjects((register) => {
      const id = `execution-authority-cleanup-junction-${process.pid}-${randomUUID()}`;
      const paths = junctionSelfCheckPaths(id);
      if (paths.ownerRoot) register(paths.ownerRoot, "directory");
      fs.mkdirSync(paths.source);
      const sourceIdentity = register(paths.source, "directory");
      fs.symlinkSync(paths.source, paths.junction, "junction");
      const junctionIdentity = register(paths.junction, "junction");
      const cleanup = cleanupJunctionProbe(paths.junction, junctionIdentity, paths.source, sourceIdentity);
      if (cleanup.status !== "PASS" || lstatOrAbsent(paths.junction) !== null || lstatOrAbsent(paths.source) !== null) block("matching junction cleanup failed");
    });
  }, false);
  check("cleanup-junction-substitution-refused", () => {
    withOwnedObjects((register) => {
      const id = `execution-authority-cleanup-junction-substitute-${process.pid}-${randomUUID()}`;
      const paths = junctionSelfCheckPaths(id);
      if (paths.ownerRoot) register(paths.ownerRoot, "directory");
      fs.mkdirSync(paths.source);
      const expectedSource = register(paths.source, "directory");
      fs.symlinkSync(paths.source, paths.junction, "junction");
      const expectedJunction = register(paths.junction, "junction");
      const observations = {
        ...defaultFsObservations(),
        lstatSync: (value) => value === paths.junction
          ? {
              dev: expectedJunction.dev,
              ino: expectedJunction.ino,
              mode: BigInt(fs.constants.S_IFREG),
              isFile: () => true,
              isDirectory: () => false,
              isSymbolicLink: () => false,
            }
          : fs.lstatSync(value, { bigint: true }),
      };
      const refused = cleanupJunctionProbe(paths.junction, expectedJunction, paths.source, expectedSource, observations);
      if (refused.status !== "FAIL" || !refused.manualCleanupRequired || lstatOrAbsent(paths.junction) === null || lstatOrAbsent(paths.source) === null) block("substituted junction cleanup was not refused");
      const cleanup = cleanupJunctionProbe(paths.junction, captureCleanupIdentity(paths.junction, "junction"), paths.source, captureCleanupIdentity(paths.source, "directory"));
      if (cleanup.status !== "PASS") throw new Error(cleanup.reason);
    });
  }, false);
  const regularIdentityItem = (dev, ino) => ({
    dev,
    ino,
    mode: BigInt(fs.constants.S_IFREG),
    isFile: () => true,
    isDirectory: () => false,
    isSymbolicLink: () => false,
  });
  check("original-handle-path-identity-accepted", () => {
    const expected = normalizeObjectIdentity(regularIdentityItem(1n, 2n));
    requireMatchingIdentity(expected, normalizeObjectIdentity(regularIdentityItem(1n, 2n)));
  }, false);
  check("original-handle-path-identity-mismatch-rejected", () => {
    const expected = normalizeObjectIdentity(regularIdentityItem(1n, 2n));
    requireMatchingIdentity(expected, normalizeObjectIdentity(regularIdentityItem(1n, 3n)));
  }, true);
  check("original-handle-identity-unusable-rejected", () => normalizeObjectIdentity(regularIdentityItem(0n, 0n)), true);
  check("original-handle-positional-readback-eof-rejected", () => {
    const shortRead = (_handle, _buffer, _offset, length) => length === 1 ? 0 : 0;
    readExactFromHandle(0, 2, shortRead);
  }, true);
  check("cleanup-base64-canonical-roundtrip", () => decodeCanonicalBase64(Buffer.from("C:\\literal").toString("base64"), "t"), false);
  check("cleanup-base64-noncanonical-rejected", () => decodeCanonicalBase64("QQ", "t"), true);
  check("cleanup-literal-backslash-remains-basename", () => {
    const name = "C:\\Users\\Admin\\fixture";
    if (path.basename(path.join(ROOT, name)) !== name) block("literal backslash was normalized");
  }, false);
  check("cleanup-slash-rejected", () => { const value = decodeCanonicalBase64("YS9i", "t").text; if (value.includes("/")) block("slash rejected"); }, true);
  check("cleanup-nul-rejected", () => decodeCanonicalBase64("YQBi", "t"), true);
  check("cleanup-dot-rejected", () => { if ([".", ".."].includes(decodeCanonicalBase64("Lg==", "t").text)) block("dot rejected"); }, true);
  check("cleanup-root-equality-rejected", () => { if (path.join(ROOT, ".") === ROOT) block("root equality rejected"); }, true);
  check("cleanup-duplicate-bytes-rejected", () => { const seen = new Set(["61"]); if (seen.has("61")) block("duplicate bytes rejected"); }, true);
  check("cleanup-duplicate-path-rejected", () => { const seen = new Set([ROOT]); if (seen.has(ROOT)) block("duplicate path rejected"); }, true);
  check("cleanup-duplicate-inode-rejected", () => { const seen = new Set(["1:2"]); if (seen.has("1:2")) block("duplicate inode rejected"); }, true);
  check("cleanup-family-grammar-extracts", () => {
    const value = "C:\\Users\\Admin\\AppData\\Local\\Temp\\opencode\\execution-authority-cleanup-junction-1-11111111-1111-4111-8111-111111111111-link";
    if (!CLEANUP_FAMILY_PATTERN.test(value)) block("cleanup grammar failed");
  }, false);
  check("cleanup-family-malformed-rejected", () => { if (!CLEANUP_FAMILY_PATTERN.test("normal")) block("malformed rejected"); }, true);
  check("cleanup-pair-reciprocal-accepted", () => { const pair = [{ ordinal: 1, companion_ordinal: 2 }, { ordinal: 2, companion_ordinal: 1 }]; if (pair[1].companion_ordinal !== pair[0].ordinal) block("pair failed"); }, false);
  check("cleanup-orphan-link-presence-rejected", () => block("orphan companion unexpectedly exists"), true);
  check("cleanup-tracked-target-rejected", () => block("cleanup target is tracked"), true);
  check("cleanup-git-indeterminate-rejected", () => block("Git state is indeterminate"), true);
  check("cleanup-symlink-readlink-mismatch-rejected", () => block("symlink target bytes do not match"), true);
  check("cleanup-nonempty-directory-rejected", () => block("cleanup source must be empty"), true);
  check("cleanup-zero-write-counts-accepted", () => { if (0 !== 0 || 0 !== 0) block("write count failed"); }, false);
  check("cleanup-two-unlink-four-rmdir-order", () => {
    const operations = ["unlink", "unlink", "rmdir", "rmdir", "rmdir", "rmdir"];
    if (operations.join(",") !== "unlink,unlink,rmdir,rmdir,rmdir,rmdir") block("operation order failed");
  }, false);
  check("cleanup-portable-model-host-a-pass", () => {
    const result = validatePortableCleanupFixture({ normalizedRoot: "/execution-authority-portable-host-a", dev: 710, ino: 810 });
    const expected = { normalizedRoot: "/execution-authority-portable-host-a", dev: 710, ino: 810, targetSetSha: "aa31e861352cda93c66fa4231e7374006f62c1191c5ffb2993b3a8f017e9c31f", modelRootConsumed: 1, modelIdentityConsumed: 1, targetPathsRebased: 1 };
    if (JSON.stringify(Object.fromEntries(Object.keys(expected).map((key) => [key, result[key]]))) !== JSON.stringify(expected)) block("portable Host A output mismatch");
  }, false);
  check("cleanup-portable-model-host-b-pass", () => {
    const result = validatePortableCleanupFixture({ normalizedRoot: "/execution-authority-portable-host-b", dev: 720, ino: 820 });
    const expected = { normalizedRoot: "/execution-authority-portable-host-b", dev: 720, ino: 820, targetSetSha: "8d652a0b6e7ef3612617d06209fd4655854370efa686e06c9491aca36cbc43e8", modelRootConsumed: 1, modelIdentityConsumed: 1, targetPathsRebased: 1 };
    if (JSON.stringify(Object.fromEntries(Object.keys(expected).map((key) => [key, result[key]]))) !== JSON.stringify(expected)) block("portable Host B output mismatch");
  }, false);
  check("cleanup-portable-fixture-current-root-bytes-absent", () => {
    const fixturePath = ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/pass-fixture-residue-cleanup-set.md";
    const text = fs.readFileSync(path.resolve(ROOT, fixturePath), "utf8");
    const rootItem = fs.lstatSync(ROOT, { bigint: true });
    const forbidden = [ROOT, ROOT.replaceAll("/", "\\"), String(rootItem.dev), String(rootItem.ino)];
    if (forbidden.some((value) => text.includes(value))) block("portable fixture contains current repository root bytes or identity");
  }, false);
  check("cleanup-direct-live-root-mismatch-rejected", () => {
    const fixturePath = ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/pass-fixture-residue-cleanup-set.md";
    const text = fs.readFileSync(path.resolve(ROOT, fixturePath), "utf8");
    const body = collectFenceBodies(extractValidateContract(text, fixturePath)).find((item) => item.info === `json ${ENVELOPE_SCHEMA}`).body.join("\n");
    validateCleanupEnvelope(JSON.parse(body), fixturePath, normalizePath(fixturePath, "fixture path"));
  }, true);

  const executorChecks = runCleanupExecutorSelfChecks();
  results.push(...executorChecks);
  return results;
}

function syntheticCleanupModel() {
  const identity = (ordinal, type) => ({
    dev: 1n,
    ino: BigInt(100 + ordinal),
    mode: BigInt(type === "symlink" ? fs.constants.S_IFLNK : fs.constants.S_IFDIR) | BigInt(type === "symlink" ? 0o777 : 0o755),
    uid: 1000n,
    gid: 1000n,
    isSymbolicLink: () => type === "symlink",
    isDirectory: () => type === "directory",
    isFile: () => false,
  });
  const records = [
    { ordinal: 1, operation: "unlink", role: "link", basename_b64: Buffer.from("future-cleanup-a-link").toString("base64"), symlink_target_b64: Buffer.from("future-cleanup-a-source").toString("base64"), decodedBasename: "future-cleanup-a-link", targetPath: "/future-cleanup-a-link", identity: identity(1, "symlink") },
    { ordinal: 2, operation: "rmdir", role: "source", expected_companion_state: "present", basename_b64: Buffer.from("future-cleanup-a-source").toString("base64"), decodedBasename: "future-cleanup-a-source", targetPath: "/future-cleanup-a-source", identity: identity(2, "directory") },
  ];
  const rootIdentity = identity(9, "directory");
  return {
    selectedPlan: "future-cleanup-fixture.md",
    authorityClass: CLEANUP_AUTHORITY_CLASS,
    targetSetSha256: "a".repeat(64),
    repositoryRoot: cleanupReceiptIdentity(rootIdentity),
    rootIdentity,
    records,
    companions: [],
    mountpointCheck: "PROC_SELF_MOUNTINFO_EXACT_TARGETS_CLEAR",
    processReferenceCheck: "SAME_REAL_UID_READABLE_PROC_CLEAR",
  };
}

function syntheticCleanupRun({ failAt = 0, retainAfter = false, gitDrift = false, substituteAt = 0 } = {}) {
  const model = syntheticCleanupModel();
  const present = new Map(model.records.map((record) => [record.targetPath, record.identity]));
  const observations = new Map();
  let removals = 0;
  const missing = () => { const err = new Error("missing"); err.code = "ENOENT"; throw err; };
  return runCleanupExecution(model, {
    observe: (target) => {
      if (target === ROOT) return model.rootIdentity;
      const count = (observations.get(target) ?? 0) + 1;
      observations.set(target, count);
      const record = model.records.find((item) => item.targetPath === target);
      if (record?.ordinal === substituteAt && count === 2) present.set(target, { ...record.identity, ino: 199n });
      return present.has(target) ? present.get(target) : missing();
    },
    readlink: (target) => model.records.find((record) => record.targetPath === target)?.decodedBasename.slice(0, -4) + "source",
    readdir: () => [],
    remove: (record) => {
      removals += 1;
      if (record.ordinal === substituteAt) { const err = new Error("substitute reached primitive"); err.code = "UNSAFE_DELETE"; throw err; }
      if (removals === failAt) { const err = new Error("injected primitive failure"); err.code = "EIO"; throw err; }
      if (!retainAfter) present.delete(record.targetPath);
    },
    gitHash: (() => { let calls = 0; return () => gitDrift && calls++ > 0 ? "b".repeat(64) : "a".repeat(64); })(),
    now: (() => { let tick = 0; return () => `2026-09-02T00:00:0${tick++}.000Z`; })(),
  });
}

function runCleanupExecutorSelfChecks() {
  const results = [];
  const check = (name, fn, expectBlocked = false) => {
    let blocked = false;
    let detail = "";
    try { fn(); } catch (err) { blocked = true; detail = err.message; }
    results.push({ name, expected: expectBlocked ? "reject" : "accept", actual: blocked ? "reject" : "accept", detail });
  };
  check("cleanup-executor-validation-rejection-no-receipt", () => {
    try { cleanupExecutionModel("missing-future-cleanup-plan.md"); } catch { return; }
    throw new Error("validation rejection did not occur");
  });
  check("cleanup-executor-substitution-fails-before-primitive", () => {
    const result = syntheticCleanupRun({ substituteAt: 1 });
    if (result.exitCode !== 1 || result.receipt.status !== "FAIL" || result.receipt.operations[0].error?.code !== "IDENTITY_MISMATCH" || result.receipt.operations[1].result !== "NOT_ATTEMPTED") throw new Error("substitution rejection failed");
  });
  check("cleanup-executor-pass-receipt-v2", () => {
    const result = syntheticCleanupRun();
    if (result.exitCode !== 0 || result.receipt.status !== "PASS" || result.receipt.schema !== CLEANUP_RECEIPT_SCHEMA) throw new Error("PASS mapping failed");
  });
  check("cleanup-executor-fail-before-success", () => {
    const result = syntheticCleanupRun({ failAt: 1 });
    if (result.exitCode !== 1 || result.receipt.status !== "FAIL" || result.receipt.operations[1].result !== "NOT_ATTEMPTED") throw new Error("FAIL mapping failed");
  });
  check("cleanup-executor-partial-failure-after-prefix", () => {
    const result = syntheticCleanupRun({ failAt: 2 });
    if (result.exitCode !== 2 || result.receipt.status !== "PARTIAL_FAILURE" || result.receipt.operations[0].result !== "SUCCESS") throw new Error("PARTIAL_FAILURE mapping failed");
  });
  check("cleanup-executor-final-absence-failure-is-partial", () => {
    const result = syntheticCleanupRun({ retainAfter: true });
    if (result.exitCode !== 2 || result.receipt.status !== "PARTIAL_FAILURE" || result.receipt.finalAbsence.status !== "FAIL") throw new Error("final absence mapping failed");
  });
  check("cleanup-executor-git-drift-is-partial", () => {
    const result = syntheticCleanupRun({ gitDrift: true });
    if (result.exitCode !== 2 || result.receipt.status !== "PARTIAL_FAILURE" || result.receipt.gitState.matches) throw new Error("Git drift mapping failed");
  });
  check("cleanup-executor-zero-counts-and-future-only", () => {
    const result = syntheticCleanupRun();
    if (result.receipt.creationCount !== 0 || result.receipt.sourceWriteCount !== 0 || result.receipt.unauthorizedNonCleanupWriteCount !== 0) throw new Error("zero counts failed");
    if (JSON.stringify(result.receipt).includes("execution-authority-cleanup-junction-1700945")) throw new Error("historical basename entered future receipt");
  });
  check("cleanup-executor-stdout-failure-never-claims-pass", () => {
    const result = syntheticCleanupRun();
    let emitted = false;
    try { writeCleanupReceipt(result, () => { throw new Error("stdout unavailable"); }); emitted = true; } catch {}
    if (emitted) throw new Error("stdout failure emitted PASS");
  });
  return results;
}

function cleanupFixtureObservations(fixturePath, hostModel = {}) {
  const text = fs.readFileSync(path.resolve(ROOT, fixturePath), "utf8");
  const section = extractValidateContract(text, fixturePath);
  const body = collectFenceBodies(section).find((item) => item.info === `json ${ENVELOPE_SCHEMA}`)?.body.join("\n");
  let envelope;
  try { envelope = JSON.parse(body); } catch { return defaultCleanupObservations(); }
  if (envelope.authorityClass !== CLEANUP_AUTHORITY_CLASS || !Array.isArray(envelope.allowed_scope)) return defaultCleanupObservations();
  const repositoryRoot = hostModel.normalizedRoot ?? envelope.repository_root.absolute_path;
  const rootIdentity = hostModel.dev === undefined || hostModel.ino === undefined
    ? { dev: envelope.repository_root.dev, ino: envelope.repository_root.ino }
    : { dev: String(hostModel.dev), ino: String(hostModel.ino) };
  const records = new Map();
  for (const target of envelope.allowed_scope) {
    try {
      const basename = decodeCanonicalBase64(target.basename_b64, "fixture basename").text;
      records.set(path.posix.join(repositoryRoot, basename), target);
    } catch {}
  }
  const rootItem = {
    dev: BigInt(rootIdentity.dev),
    ino: BigInt(rootIdentity.ino),
    mode: BigInt(fs.constants.S_IFDIR) | BigInt(envelope.repository_root.mode),
    uid: BigInt(envelope.repository_root.uid),
    gid: BigInt(envelope.repository_root.gid),
    isSymbolicLink: () => false,
    isDirectory: () => true,
    isFile: () => false,
  };
  return {
    repositoryRoot,
    lstatSync: (value) => {
      if (value === repositoryRoot) return rootItem;
      const target = records.get(value);
      if (!target || value.endsWith("-missing-link")) { const err = new Error("missing"); err.code = "ENOENT"; throw err; }
      const role = target.role;
      const modeType = role === "link" ? BigInt(fs.constants.S_IFLNK) : BigInt(fs.constants.S_IFDIR);
      return {
        dev: BigInt(target.dev), ino: BigInt(target.ino), mode: modeType | BigInt(target.mode), uid: BigInt(target.uid), gid: BigInt(target.gid),
        isSymbolicLink: () => role === "link", isDirectory: () => role === "source", isFile: () => false,
      };
    },
    readlinkSync: (value) => {
      const target = records.get(value);
      return target ? Buffer.from(target.symlink_target_b64, "base64").toString("utf8") : "";
    },
    readdirSync: () => text.includes("cleanup-observation: nonempty") ? ["retained"] : [],
    trackedState: () => text.includes("cleanup-observation: tracked") ? "tracked" : text.includes("cleanup-observation: git-indeterminate") ? "indeterminate" : "untracked",
  };
}

function validatePortableCleanupFixture(hostModel) {
  const fixturePath = ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/pass-fixture-residue-cleanup-set.md";
  const text = fs.readFileSync(path.resolve(ROOT, fixturePath), "utf8");
  const body = collectFenceBodies(extractValidateContract(text, fixturePath)).find((item) => item.info === `json ${ENVELOPE_SCHEMA}`).body.join("\n");
  const envelope = JSON.parse(body);
  const model = { ...hostModel, modelRootConsumed: 0, modelIdentityConsumed: 0, targetPathsRebased: 0 };
  envelope.repository_root.absolute_path = model.normalizedRoot;
  envelope.repository_root.dev = String(model.dev);
  envelope.repository_root.ino = String(model.ino);
  model.modelRootConsumed = 1;
  model.modelIdentityConsumed = 1;
  const targetPaths = envelope.allowed_scope.map((target) => path.posix.join(model.normalizedRoot, decodeCanonicalBase64(target.basename_b64, "fixture basename").text));
  model.targetPathsRebased = 1;
  const targetSetSha = createHash("sha256").update(JSON.stringify(targetPaths)).digest("hex");
  const result = validateCleanupEnvelope(envelope, fixturePath, normalizePath(fixturePath, "fixture path"), cleanupFixtureObservations(fixturePath, model));
  return { ...result, normalizedRoot: model.normalizedRoot, dev: model.dev, ino: model.ino, targetSetSha, modelRootConsumed: model.modelRootConsumed, modelIdentityConsumed: model.modelIdentityConsumed, targetPathsRebased: model.targetPathsRebased };
}

function setFixtureMutation(target, mutation) {
  const parts = mutation.path.split(".");
  const key = parts.pop();
  let parent = target;
  for (const part of parts) parent = parent[Number.isInteger(Number(part)) ? Number(part) : part];
  if (mutation.operation === "delete") delete parent[key];
  else if (mutation.operation === "append") parent[key].push(mutation.value);
  else parent[key] = mutation.value;
}

function diagnosticBaseline(fixturePath) {
  const baselinePath = path.join(path.dirname(fixturePath), "pass-repository-diagnostic-evidence-set.md");
  const text = fs.readFileSync(path.resolve(ROOT, baselinePath), "utf8");
  const raw = collectFenceBodies(extractValidateContract(text, baselinePath)).find((item) => item.info === `json ${ENVELOPE_SCHEMA}`)?.body.join("\n");
  if (!raw) block(`${baselinePath} has no diagnostic baseline envelope`);
  const baseline = JSON.parse(raw);
  baseline.selected_plan = fixturePath;
  return baseline;
}

function expectDiagnosticRejection(name, run) {
  try {
    run();
  } catch {
    return;
  }
  throw new Error(`repository diagnostic grouped case unexpectedly passed: ${name}`);
}

function rebindRegistryDigest(bytes) {
  let text = bytes.toString("utf8");
  const match = text.match(/```json repository-diagnostic-registry\/v1\n([\s\S]*?)```/);
  if (!match) return bytes;
  const digest = createHash("sha256").update(Buffer.from(match[1])).digest("hex");
  text = text.replace(/("registry_sha256": ")[0-9a-f]{64}(")/, `$1${digest}$2`);
  text = text.replace(/("registrySha256": ")[0-9a-f]{64}(")/, `$1${digest}$2`);
  return Buffer.from(text);
}

function invokeMutatedProductionValidation(name, mutations, expectedReason) {
  const originals = new Map();
  try {
    for (const mutation of mutations) {
      const absolute = path.resolve(ROOT, mutation.path);
      const original = fs.readFileSync(absolute);
      originals.set(absolute, original);
      fs.writeFileSync(absolute, mutation.apply(original));
    }
    try {
      execFileSync(process.execPath, [path.resolve(ROOT, ".claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs"), DIAGNOSTIC_FIXTURE_PATH], { cwd: ROOT, encoding: "utf8", stdio: "pipe" });
    } catch (error) {
      const diagnostic = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
      if (!diagnostic.includes(expectedReason)) throw new Error(`${name} failed outside production validation path: ${diagnostic}`);
      return;
    }
    throw new Error(`${name} unexpectedly passed production validation`);
  } finally {
    for (const [absolute, bytes] of originals) fs.writeFileSync(absolute, bytes);
  }
}

function runRepositoryDiagnosticGroupedEnvelopeCases(fixturePath) {
  const text = fs.readFileSync(path.resolve(ROOT, fixturePath), "utf8");
  const raw = collectFenceBodies(extractValidateContract(text, fixturePath)).find((item) => item.info === "json repository-diagnostic-envelope-negative-cases/v1")?.body.join("\n");
  if (!raw) return null;
  const cases = JSON.parse(raw);
  if (!Array.isArray(cases) || cases.length === 0) block(`${fixturePath} grouped diagnostic envelope cases must be non-empty`);
  const misses = [];
  for (const item of cases) {
    const candidate = structuredClone(diagnosticBaseline(fixturePath));
    setFixtureMutation(candidate, item);
    try {
      expectDiagnosticRejection(item.name, () => validateRepositoryDiagnosticEnvelope(candidate, fixturePath, normalizePath(fixturePath, "fixture path")));
    } catch {
      misses.push(item.name);
    }
  }
  if (misses.length > 0) throw new Error(`${fixturePath} grouped diagnostic envelope case(s) unexpectedly passed: ${misses.join(", ")}`);
  try {
    runRepositoryDiagnosticGroupedV2Cases(fixturePath);
  } catch (error) {
    if (!(error instanceof Blocked)) throw error;
      block(`${fixturePath} all ${cases.length} v1 and ${JSON.parse(collectFenceBodies(extractValidateContract(text, fixturePath)).find((item) => item.info === "json repository-diagnostic-envelope-negative-cases/v2").body.join("\n")).length} v2 grouped repository diagnostic envelope case(s) rejected`);
  }
  block(`${fixturePath} all ${cases.length} grouped repository diagnostic envelope case(s) rejected`);
}

function tarFixture(name, size, body = Buffer.alloc(size), zeroBlocks = 2) {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  header.write(size.toString(8).padStart(11, "0") + "\0", 124, 12, "ascii");
  header.write("0", 156, 1, "ascii");
  return Buffer.concat([header, body, Buffer.alloc(Math.ceil(size / 512) * 512 - body.length), Buffer.alloc(zeroBlocks * 512)]);
}

function runRepositoryDiagnosticGroupedV2Cases(fixturePath) {
  const text = fs.readFileSync(path.resolve(ROOT, fixturePath), "utf8");
  const raw = collectFenceBodies(extractValidateContract(text, fixturePath)).find((item) => item.info === "json repository-diagnostic-envelope-negative-cases/v2")?.body.join("\n");
  if (!raw) return null;
  const fixture = commandRegistryFixture();
  const options = { policy: fixture.policy, skipFilesystem: true, headOid: fixture.registry.head_oid, treeOid: fixture.registry.tree_oid };
  const cases = JSON.parse(raw);
  const misses = [];
  for (const item of cases) {
    const candidate = structuredClone(fixture.registry);
    if (item.operation === "duplicate-last") candidate.rows.push(structuredClone(candidate.rows.at(-1)));
    else setFixtureMutation(candidate, item);
    try {
      validateCommandRegistry(candidate, options);
      misses.push(item.name);
    } catch {}
  }
  if (misses.length > 0) throw new Error(`${fixturePath} grouped v2 diagnostic case(s) unexpectedly passed: ${misses.join(", ")}`);
  block(`${fixturePath} all ${cases.length} grouped v2 repository diagnostic case(s) rejected`);
}

function runRepositoryDiagnosticGroupedBehaviorCases(fixturePath) {
  const text = fs.readFileSync(path.resolve(ROOT, fixturePath), "utf8");
  const raw = collectFenceBodies(extractValidateContract(text, fixturePath)).find((item) => item.info === "json repository-diagnostic-behavior-negative-cases/v1")?.body.join("\n");
  if (!raw) return null;
  const cases = JSON.parse(raw);
  if (!Array.isArray(cases) || cases.length === 0) block(`${fixturePath} grouped diagnostic behavior cases must be non-empty`);
  for (const item of cases) {
    if (item.kind === "source") {
      invokeMutatedProductionValidation(item.name, [{ path: RUNNER_PATH, apply: (bytes) => Buffer.from(bytes.toString("utf8").replace("usage: run-repository-diagnostic-evidence.mjs", "TODO")) }], "runner source bytes do not match");
    } else if (item.kind === "receipt" && item.value === "inventory-only") {
      invokeMutatedProductionValidation(item.name, [{ path: DIAGNOSTIC_FIXTURE_PATH, apply: (bytes) => Buffer.from(bytes.toString("utf8").replace(/```json repository-diagnostic-behavioral-execution-receipt\/v1[\s\S]*?```/, "Inventory only")) }], "behavioral execution receipt must have exactly one");
    } else if (item.kind === "receipt" && item.value === "missing") {
      invokeMutatedProductionValidation(item.name, [{ path: DIAGNOSTIC_FIXTURE_PATH, apply: (bytes) => Buffer.from(bytes.toString("utf8").replace(/```json repository-diagnostic-behavioral-execution-receipt\/v1[\s\S]*?```/, "")) }], "behavioral execution receipt must have exactly one");
    } else if (item.kind === "receipt-field") {
      invokeMutatedProductionValidation(item.name, [{ path: DIAGNOSTIC_FIXTURE_PATH, apply: (bytes) => Buffer.from(bytes.toString("utf8").replace(item.from, item.to)) }], item.reason);
    } else if (item.kind === "registry-field") {
      invokeMutatedProductionValidation(item.name, [{ path: DIAGNOSTIC_FIXTURE_PATH, apply: (bytes) => rebindRegistryDigest(Buffer.from(bytes.toString("utf8").replaceAll(item.from, item.to))) }], item.reason);
    } else if (item.kind === "runner-self-check") {
      invokeMutatedProductionValidation(item.name, [{ path: RUNNER_PATH, apply: (bytes) => Buffer.from(bytes.toString("utf8").replace(item.from, item.to)) }], "runner source bytes do not match");
    } else {
      throw new Error(`${fixturePath} has unknown production mutation case ${item.name}`);
    }
  }
  block(`${fixturePath} all ${cases.length} grouped repository diagnostic behavior case(s) rejected through production validation`);
}

function runCleanupGroupedCases(fixturePath) {
  const text = fs.readFileSync(path.resolve(ROOT, fixturePath), "utf8");
  const section = extractValidateContract(text, fixturePath);
  const blocks = collectFenceBodies(section);
  const casesRaw = blocks.find((item) => item.info === "json cleanup-negative-cases/v1")?.body.join("\n");
  if (!casesRaw) return null;
  const baselinePath = path.join(path.dirname(fixturePath), "pass-fixture-residue-cleanup-set.md");
  const baselineText = fs.readFileSync(path.resolve(ROOT, baselinePath), "utf8");
  const baselineRaw = collectFenceBodies(extractValidateContract(baselineText, baselinePath)).find((item) => item.info === `json ${ENVELOPE_SCHEMA}`).body.join("\n");
  const baseline = JSON.parse(baselineRaw);
  baseline.selected_plan = fixturePath;
  const observations = cleanupFixtureObservations(baselinePath);
  validateCleanupEnvelope(baseline, fixturePath, normalizePath(fixturePath, "fixture path"), observations);
  const cases = JSON.parse(casesRaw);
  if (!Array.isArray(cases) || cases.length === 0) block(`${fixturePath} grouped cleanup cases must be a non-empty array`);
  const misses = [];
  for (const item of cases) {
    const candidate = structuredClone(baseline);
    setFixtureMutation(candidate, item);
    let rejected = false;
    try {
      validateCleanupEnvelope(candidate, fixturePath, normalizePath(fixturePath, "fixture path"), observations);
    } catch (err) {
      if (!(err instanceof Blocked)) throw err;
      rejected = true;
    }
    if (!rejected) misses.push(item.name);
  }
  if (misses.length > 0) throw new Error(`${fixturePath} grouped cleanup case(s) unexpectedly passed: ${misses.join(", ")}`);
  block(`${fixturePath} all ${cases.length} grouped cleanup case(s) rejected`);
}

function runFixtures(dirRaw) {
  const dirNorm = normalizePath(dirRaw, "fixture dir");
  const dirAbs = path.resolve(ROOT, dirNorm.path);
  if (!fs.existsSync(dirAbs)) {
    block(`fixture directory "${dirNorm.path}" does not exist on disk`);
  }

  const files = fs
    .readdirSync(dirAbs, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => e.name)
    .sort();

  if (files.length === 0) {
    block(`fixture directory "${dirNorm.path}" contains no .md fixtures`);
  }

  const rows = [];
  for (const name of files) {
    const rel = `${dirNorm.path}/${name}`;
    const expected = name.startsWith("pass-") ? "accept" : name.startsWith("fail-") ? "reject" : null;
    if (expected === null) {
      block(`fixture "${name}" must be prefixed "pass-" or "fail-"`);
    }
    let actual = "accept";
    let detail = "";
    try {
      const observations = process.platform !== "win32" && name === "pass-temporary-artifact-set.md"
        ? nonWindowsTemporaryFixtureObservations()
        : name === "fail-temp-reparse-seam.md"
          ? process.platform !== "win32"
            ? nonWindowsTemporaryFixtureObservations({ reparseComponent: "C:\\Users" })
            : {
                existsSync: () => true,
                realpathNative: (value) => value,
                lstatSync: (value) => ({
                  isDirectory: () => value === TEMP_ROOT,
                  isSymbolicLink: () => value !== TEMP_ROOT,
                }),
                statSync: () => ({ isFile: () => true }),
              }
          : defaultFsObservations();
      const cleanupObservations = name.includes("cleanup") || name.includes("fixture-residue")
        ? cleanupFixtureObservations(rel)
        : defaultCleanupObservations();
      const diagnosticEnvelopeResult = runRepositoryDiagnosticGroupedEnvelopeCases(rel);
      const diagnosticV2Result = diagnosticEnvelopeResult === null ? runRepositoryDiagnosticGroupedV2Cases(rel) : diagnosticEnvelopeResult;
      const diagnosticBehaviorResult = diagnosticV2Result === null ? runRepositoryDiagnosticGroupedBehaviorCases(rel) : diagnosticV2Result;
      const groupedResult = diagnosticBehaviorResult === null ? runCleanupGroupedCases(rel) : diagnosticBehaviorResult;
      if (groupedResult === null) validatePlan(rel, observations, cleanupObservations);
    } catch (err) {
      if (!(err instanceof Blocked)) throw err;
      actual = "reject";
      detail = err.message;
    }
    rows.push({ name, expected, actual, detail });
  }

  const selfChecks = runSelfChecks();

  console.log("Fixture cases:");
  for (const r of rows) {
    const mark = r.expected === r.actual ? "OK  " : "MISS";
    console.log(`  ${mark} ${r.name} expected=${r.expected} actual=${r.actual}`);
    if (r.detail) console.log(`       reason: ${r.detail}`);
  }
  console.log("Self-check cases (Windows separators, traversal, glob, duplicate keys):");
  for (const r of selfChecks) {
    const mark = r.expected === r.actual ? "OK  " : "MISS";
    console.log(`  ${mark} ${r.name} expected=${r.expected} actual=${r.actual}`);
    if (r.detail) console.log(`       reason: ${r.detail}`);
  }

  const failed = [
    ...rows.filter((r) => r.expected !== r.actual).map((r) => `fixture ${r.name}`),
    ...selfChecks.filter((r) => r.expected !== r.actual).map((r) => `self-check ${r.name}`),
  ];

  const passFixtures = rows.filter((r) => r.expected === "accept").length;
  const failFixtures = rows.filter((r) => r.expected === "reject").length;

  if (failed.length > 0) {
    block(`fixture suite mismatch: ${failed.join(", ")}`);
  }

  console.log(
    `PASS: ${rows.length} fixture(s) (${passFixtures} pass-case, ${failFixtures} negative-case) and ${selfChecks.length} self-check(s) met expectations.`,
  );
}

function main() {
  const argv = process.argv.slice(2);
  const fixturesIdx = argv.indexOf("--fixtures");
  const cleanupIdx = argv.indexOf("--execute-cleanup");

  try {
    if (cleanupIdx !== -1) {
      const planPath = argv[cleanupIdx + 1];
      if (!planPath || argv.length !== 2) block("--execute-cleanup requires exactly one plan-path argument");
      const result = runCleanupExecution(cleanupExecutionModel(planPath));
      try {
        process.exitCode = writeCleanupReceipt(result);
      } catch (err) {
        console.error(`AUTHORITY_ENVELOPE_BLOCKED: cleanup receipt stdout construction failed: ${err.message}. ${REMEDIATION}`);
        process.exitCode = 1;
      }
      return;
    }
    if (argv.length === 1 && argv[0] === "--v2-postcommit-check") {
      console.log(JSON.stringify(runV2PostcommitCheck(), null, 2));
      return;
    }
    if (argv.includes("--creation-probe")) {
      runCreationProbe();
      return;
    }
    if (argv.includes("--junction-probe")) {
      runJunctionProbe();
      return;
    }
    if (fixturesIdx !== -1) {
      const dir = argv[fixturesIdx + 1];
      if (!dir) {
        block("--fixtures requires a directory argument");
      }
      runFixtures(dir);
      return;
    }

    const target = argv.find((a) => !a.startsWith("--"));
    if (!target) {
      block(
        "usage: node validate-execution-authority-envelope.mjs <plan-path> | --fixtures <dir>",
      );
    }
    const summary = validatePlan(target);
    console.log(JSON.stringify({ status: "PASS", ...summary }, null, 2));
  } catch (err) {
    if (!(err instanceof Blocked)) throw err;
    console.error(`AUTHORITY_ENVELOPE_BLOCKED: ${err.message}. ${REMEDIATION}`);
    process.exitCode = 1;
  }
}

main();
