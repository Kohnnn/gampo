#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { TextDecoder } from "node:util";

const TERMINAL_SCHEMA = "phase02-executor-terminal/v1";
const RESULT_SCHEMA = "phase02-attempt-result/v1";
const FAILURE_SCHEMA = "phase02-bootstrap-failure/v1";
const CLEANUP_SCHEMA = "phase02-attempt-cleanup/v1";
const RECEIPT_SCHEMA = "repository-diagnostic-artifact-receipt/v1";
const SELF_CHECK_SCHEMA = "repository-diagnostic-evidence-self-check/v1";
const ERROR_KEYS = ["stage", "code", "message"];
const IDENTITY_KEYS = ["dev", "ino", "modeType"];
const RECEIPT_KEYS = ["schema", "artifactPath", "artifactSchemaVersion", "bytes", "sha256", "exclusiveCreate", "regularNonReparse", "readbackMatches", "status"];
const TERMINAL_KEYS = ["schema", "attemptId", "commandId", "ordinal", "startedAt", "finishedAt", "childExitCode", "childSignal", "spawnError", "timedOut", "stdoutBytes", "stdoutSha256", "stderrBytes", "stderrSha256", "rowReceiptCount", "rowReceiptSha256", "semanticStatus", "semanticCode"];
const RESULT_KEYS = ["schema", "attemptId", "status", "terminalArtifactPath", "terminalArtifactSha256", "completedRowCount", "evidenceFileCount", "evidenceByteCount", "evidenceManifestSha256", "publishedBeforeCleanup"];
const FAILURE_KEYS = ["schema", "attemptId", "status", "stage", "primaryError", "secondaryErrors", "terminalArtifactPath", "terminalArtifactSha256", "completedRowCount", "evidenceFileCount", "evidenceByteCount", "evidenceManifestSha256", "publicationAttemptedBeforeCleanup"];
const CLEANUP_KEYS = ["schema", "attemptId", "status", "primaryError", "secondaryErrors", "terminalArtifactPath", "resultOrFailureArtifactPath", "cleanupStartedAfterPublicationAttempt", "operations", "residue", "manualCleanupRequired"];
const OPERATION_KEYS = ["ordinal", "operation", "path", "expectedIdentity", "observedIdentity", "result", "error"];
const RESIDUE_KEYS = ["path", "observedIdentity", "reason"];
const REGISTRY_KEYS = ["schema", "fixture_mode", "rows"];
const REGISTRY_ROW_KEYS = ["ordinal", "command_id", "capability", "executable", "argv", "action", "lifecycle", "artifact_roles"];
const ALLOWED_ACTIONS = new Set(["node-version", "hash-literal-input", "parse-tar"]);
const ALLOWED_LIFECYCLES = new Set(["diagnostic", "cleanup"]);
const ALLOWED_ROLES = new Set(["bootstrap", "terminal", "result", "failure", "cleanup", "manifest", "stdout", "stderr", "row-receipt"]);
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const DOS_DEVICE_PATTERN = /^(?:con|prn|aux|nul|clock\$|com[1-9]|lpt[1-9])$/i;
const ANCESTOR_IDENTITY_KEYS = ["dev", "ino", "mode", "realpath", "type"];
const TEST_DISABLE_BOUNDARY = Symbol("test-disable-boundary");
const CLEANUP_STATIC_GATE_PROOF = "single-adapter-executable-source-gate";
const COMMAND_RESULT_PASS_KEYS = ["status", "completedRowCount", "receipts", "terminal", "cleanupTargets"];
const COMMAND_RESULT_FAIL_KEYS = ["status", "completedRowCount", "receipts", "failure", "terminal", "cleanupTargets"];
const COMMAND_FAILURE_KEYS = ["ordinal", "id", "childExitCode", "childSignal", "spawnError", "timedOut", "stdoutBytes", "stdoutSha256", "stderrBytes", "stderrSha256", "semanticStatus", "semanticCode", "failingStream", "primaryError"];
const COMMAND_RECEIPT_KEYS = ["ordinal", "id", "stdoutBytes", "stdoutSha256", "stderrBytes", "stderrSha256", "status"];
const RUNTIME_LEDGER_KEYS = ["ordinal", "role", "path", "operation", "identity"];
const RUNTIME_ROLES = new Set(["home-file", "home-directory", "archive-file", "stream-file", "stream-directory", "temporary-file", "temporary-directory", "runtime-root"]);
const COMMAND_SEMANTIC_CODES = new Set(["SPAWN", "SIGNAL", "EXIT", "TIMEOUT", "OUTPUT_OVERFLOW", "STREAM_POLICY", "SEMANTIC"]);
const AUTHORITY_FIXTURE_ROOT = ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope";
const AUTHORITY_FIXTURE_MANIFEST = [
  "fail-artifact-outside-scope.md",
  "fail-cleanup-basename-encoding-components.md",
  "fail-cleanup-duplicate-broad-scope.md",
  "fail-cleanup-fixture-family-companions.md",
  "fail-cleanup-keys-counts-mixed-lane.md",
  "fail-cleanup-operation-creation-source-write.md",
  "fail-cleanup-root-target-identity.md",
  "fail-cleanup-tracked-normal-nested-file.md",
  "fail-correction-destination-mismatch.md",
  "fail-invalid-artifact-path.md",
  "fail-invalid-authority-proof.md",
  "fail-missing-correction-destination.md",
  "fail-missing-selected-plan.md",
  "fail-missing-stop-conditions.md",
  "fail-repository-diagnostic-behavior-cases.md",
  "fail-repository-diagnostic-envelope-cases.md",
  "fail-temp-ads.md",
  "fail-temp-device-namespace.md",
  "fail-temp-dos-device.md",
  "fail-temp-duplicate-key.md",
  "fail-temp-duplicate-target.md",
  "fail-temp-escaped-duplicate-key.md",
  "fail-temp-glob.md",
  "fail-temp-missing-receipt-schema.md",
  "fail-temp-mixed-lane.md",
  "fail-temp-prefix-collision.md",
  "fail-temp-reparse-seam.md",
  "fail-temp-too-many.md",
  "fail-temp-trailing-dot-space.md",
  "fail-temp-traversal.md",
  "fail-temp-wrong-root.md",
  "fail-temp-wrong-scope-count.md",
  "fail-temp-wrong-stop-count.md",
  "fail-unknown-envelope-report-schema.md",
  "pass-correction-envelope.md",
  "pass-envelope.md",
  "pass-fixture-residue-cleanup-set.md",
  "pass-repository-diagnostic-evidence-set.md",
  "pass-temporary-artifact-set.md",
];
const COMMITTED_VALIDATOR_PATHS = [
  ".claude/skills/vc-autopilot/scripts/validate-autopilot-goal-block.mjs",
  ".claude/skills/vc-generate-plan/scripts/validate-plan-artifact.mjs",
  ".claude/skills/vc-generate-phase-program/scripts/validate-phase-stub.mjs",
  ".claude/skills/vc-generate-phase-program/scripts/validate-umbrella-artifact.mjs",
];
const PROOF_PATHS = [
  `${AUTHORITY_FIXTURE_ROOT}/proof/standing-goal-block.md`,
  `${AUTHORITY_FIXTURE_ROOT}/proof/no-consent-goal-block.md`,
];
const HARNESS_COMMIT_PATHS = [
  ".claude/skills/vc-audit-vc/scripts/run-repository-diagnostic-evidence.mjs",
  ".claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs",
  ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/pass-repository-diagnostic-evidence-set.md",
  ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-repository-diagnostic-envelope-cases.md",
  ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-repository-diagnostic-behavior-cases.md",
  ".claude/skills/vc-audit-vc/SKILL.md",
  "process/development-protocols/vc-system-behavior/08-validate.md",
  "process/development-protocols/vc-system-behavior/09-execute.md",
  ".claude/agents/vc-validate-agent.md",
  ".claude/agents/vc-execute-agent.md",
  ".codex/agents/vc-validate-agent.toml",
  ".codex/agents/vc-execute-agent.toml",
];

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function exactKeys(value, keys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("SCHEMA", `${label} must be an object`);
  if (JSON.stringify(Object.keys(value)) !== JSON.stringify(keys)) fail("SCHEMA", `${label} keys must be exactly ${keys.join(",")}`);
}

function errorRecord(error, stage) {
  return { stage, code: String(error?.code ?? "ERROR"), message: String(error?.message ?? error) };
}

function validateError(value, label, nullable = true) {
  if (value === null && nullable) return;
  exactKeys(value, ERROR_KEYS, label);
  for (const key of ERROR_KEYS) if (typeof value[key] !== "string" || value[key].length === 0) fail("SCHEMA", `${label}.${key} must be non-empty text`);
}

function identity(item) {
  if (typeof item.dev !== "bigint" || typeof item.ino !== "bigint" || typeof item.mode !== "bigint") fail("IDENTITY", "filesystem identity must use bigint values");
  const modeType = item.mode & BigInt(fs.constants.S_IFMT);
  if (item.dev === 0n && item.ino === 0n) fail("IDENTITY", "filesystem identity cannot be all zero");
  return { dev: item.dev.toString(), ino: item.ino.toString(), modeType: modeType.toString() };
}

function sameIdentity(left, right) {
  return IDENTITY_KEYS.every((key) => left[key] === right[key]);
}

function isNonEmptyText(value) {
  return typeof value === "string" && value.length > 0;
}

function isSafeInteger(value, minimum = 0) {
  return Number.isSafeInteger(value) && value >= minimum;
}

function isHash(value) {
  return typeof value === "string" && HASH_PATTERN.test(value);
}

function validateIdentityValue(value, label) {
  if (value === null) return;
  exactKeys(value, IDENTITY_KEYS, label);
  for (const key of IDENTITY_KEYS) if (typeof value[key] !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(value[key])) fail("SCHEMA", `${label}.${key} must be a canonical unsigned decimal string`);
  if (value.dev === "0" && value.ino === "0") fail("SCHEMA", `${label} dev/ino cannot both be zero`);
}

function validateStringArray(value, label) {
  if (!Array.isArray(value)) fail("SCHEMA", `${label} must be an array`);
  for (const [index, item] of value.entries()) if (!isNonEmptyText(item)) fail("SCHEMA", `${label}[${index}] must be non-empty text`);
}

function safeRelativePath(raw) {
  if (typeof raw !== "string" || raw.length === 0 || raw.includes("\0") || raw.includes("\\")) fail("TAR_PATH", "archive path is empty, ambiguous, or uses backslashes");
  if (raw.startsWith("/") || raw.startsWith("//") || /^[A-Za-z]:/.test(raw) || /^[/\\]{2}[?.]/.test(raw)) fail("TAR_PATH", "archive path is absolute, drive, UNC, or device qualified");
  const trailingDirectory = raw.endsWith("/");
  const segments = raw.split("/");
  if (trailingDirectory) segments.pop();
  if (segments.length === 0 || segments.some((segment) => segment === "" || segment === "." || segment === "..")) fail("TAR_PATH", "archive path contains an empty, dot, or traversal segment");
  for (const segment of segments) {
    let canonical;
    try {
      canonical = segment.normalize("NFKC");
    } catch {
      fail("TAR_PATH", "archive path contains an invalid Unicode segment");
    }
    const win32Alias = canonical.replace(/[ .]+$/g, "");
    const basename = win32Alias.split(".", 1)[0];
    if (DOS_DEVICE_PATTERN.test(basename)) fail("TAR_PATH", `archive path contains reserved DOS device basename ${segment}`);
  }
  const normalized = path.posix.normalize(raw);
  if (normalized !== raw || normalized.startsWith("../")) fail("TAR_PATH", "archive path escapes after normalization");
  return normalized;
}

function parseTarNumber(bytes) {
  if (bytes.length === 0) fail("TAR_SIZE", "empty TAR size field");
  if ((bytes[0] & 0x80) !== 0) {
    const copy = Buffer.from(bytes);
    copy[0] &= 0x7f;
    let value = 0n;
    for (const byte of copy) value = value * 256n + BigInt(byte);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) fail("TAR_SIZE", "TAR base-256 size exceeds safe range");
    return Number(value);
  }
  const nul = bytes.indexOf(0);
  const body = bytes.subarray(0, nul === -1 ? bytes.length : nul);
  const suffix = bytes.subarray(nul === -1 ? bytes.length : nul);
  if (suffix.some((byte) => byte !== 0 && byte !== 32)) fail("TAR_SIZE", "TAR size has bytes after terminator");
  const text = body.toString("ascii");
  if (!/^[0-7]{1,11}$/.test(text)) fail("TAR_SIZE", "TAR size is not canonical octal");
  const value = BigInt(`0o${text}`);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) fail("TAR_SIZE", "TAR octal size exceeds safe range");
  return Number(value);
}

export function decodeLiteralInput(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) fail("LITERAL_BOM", "literal input must not contain a UTF-8 BOM");
  if (bytes.includes(0)) fail("LITERAL_NUL", "literal input must not contain NUL");
  if (bytes.includes(13)) fail("LITERAL_CR", "literal input must use LF only");
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("LITERAL_UTF8", "literal input must be canonical UTF-8");
  }
  if (!Buffer.from(text, "utf8").equals(bytes)) fail("LITERAL_UTF8", "literal input failed canonical UTF-8 round-trip");
  return text;
}

export function parseTarEntries(input) {
  const archive = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const entries = [];
  let offset = 0;
  let zeroBlocks = 0;
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      zeroBlocks += 1;
      offset += 512;
      if (zeroBlocks === 2) {
        if (archive.subarray(offset).some((byte) => byte !== 0)) fail("TAR_TRAILING", "TAR contains data after terminal zero blocks");
        return entries;
      }
      continue;
    }
    if (zeroBlocks !== 0) fail("TAR_TERMINATION", "TAR has only one zero block before another entry");
    const nameField = header.subarray(0, 100);
    const nul = nameField.indexOf(0);
    if (nul === -1 || nameField.subarray(nul).some((byte) => byte !== 0)) fail("TAR_PATH", "TAR member name is not NUL-terminated unambiguously");
    const name = safeRelativePath(decodeLiteralInput(nameField.subarray(0, nul)));
    const type = header[156];
    if (![0, 48, 53].includes(type)) fail("TAR_TYPE", `unsupported TAR entry type ${type}`);
    const size = parseTarNumber(header.subarray(124, 136));
    if (type === 53 && (size !== 0 || !name.endsWith("/"))) fail("TAR_TYPE", `invalid TAR directory ${name}`);
    const paddedSize = Math.ceil(size / 512) * 512;
    const nextOffset = offset + 512 + paddedSize;
    if (!Number.isSafeInteger(nextOffset) || nextOffset > archive.length) fail("TAR_TRUNCATED", `TAR member ${name} body is truncated`);
    entries.push({ name, size, data: Buffer.from(archive.subarray(offset + 512, offset + 512 + size)) });
    offset = nextOffset;
  }
  fail("TAR_TERMINATION", "TAR requires two consecutive terminal zero blocks");
}

function lstatBigInt(target) {
  return fs.lstatSync(target, { bigint: true });
}

function assertDirectory(item, label) {
  if (!item.isDirectory() || item.isSymbolicLink()) fail("EVIDENCE_ROOT", `${label} must be a non-reparse directory`);
}

function ancestorIdentity(target, item, realpath) {
  assertDirectory(item, `evidence ancestor ${target}`);
  const value = {
    dev: item.dev.toString(),
    ino: item.ino.toString(),
    mode: item.mode.toString(),
    realpath: realpath(target),
    type: "directory",
  };
  exactKeys(value, ANCESTOR_IDENTITY_KEYS, `evidence ancestor identity ${target}`);
  return value;
}

function captureAncestorChain(targetPath, evidenceRoot, lstat = lstatBigInt, realpath = fs.realpathSync.native) {
  const target = path.resolve(targetPath);
  const root = path.resolve(evidenceRoot);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) fail("EVIDENCE_SCOPE", "artifact must remain strictly beneath evidence_root");
  const parent = path.dirname(target);
  const parsed = path.parse(parent);
  const paths = [parsed.root];
  let current = parsed.root;
  for (const segment of parent.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    paths.push(current);
  }
  const identities = paths.map((ancestor) => ({ path: ancestor, identity: ancestorIdentity(ancestor, lstat(ancestor), realpath) }));
  const rootEntry = identities.find((entry) => entry.path === root);
  if (!rootEntry) fail("EVIDENCE_SCOPE", "evidence_root is not an existing artifact ancestor");
  const rootReal = rootEntry.identity.realpath;
  const aliases = new Set();
  for (const entry of identities) {
    if (aliases.has(entry.identity.realpath)) fail("EVIDENCE_ALIAS", `evidence ancestor alias detected at ${entry.path}`);
    aliases.add(entry.identity.realpath);
    if (entry.path.startsWith(`${root}${path.sep}`)) {
      const realRelative = path.relative(rootReal, entry.identity.realpath);
      if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) fail("EVIDENCE_SCOPE", "artifact ancestry resolves outside evidence_root");
    }
  }
  return { target, root, rootReal, parent, identities };
}

function compareAncestorChain(frozen, targetPath, evidenceRoot, lstat = lstatBigInt, realpath = fs.realpathSync.native) {
  const observed = captureAncestorChain(targetPath, evidenceRoot, lstat, realpath);
  if (JSON.stringify(observed.identities) !== JSON.stringify(frozen.identities)) fail("EVIDENCE_ANCESTOR_DRIFT", "evidence ancestor identity changed during artifact creation");
  return observed;
}

function inspectTarget(targetPath, chain, lstat = lstatBigInt, realpath = fs.realpathSync.native, requireFile = false) {
  if (requireFile) {
    const item = lstat(chain.target);
    if (!item.isFile() || item.isSymbolicLink()) fail("EVIDENCE_TYPE", "artifact must be a regular non-reparse file");
    const resolved = realpath(chain.target);
    const realRelative = path.relative(chain.rootReal, resolved);
    if (!realRelative || realRelative.startsWith("..") || path.isAbsolute(realRelative)) fail("EVIDENCE_SCOPE", "artifact resolves outside evidence_root");
    return item;
  }
  try {
    lstat(chain.target);
    fail("EEXIST", "artifact already exists");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return null;
}

function validateArtifactPayload(payload, artifactSchemaVersion, closedKeys) {
  if (!artifactSchemaVersion) fail("SCHEMA", "artifactSchemaVersion is required");
  if (closedKeys === null) return;
  let value;
  try {
    value = JSON.parse(decodeLiteralInput(payload));
  } catch (error) {
    fail("SCHEMA", `artifact is not canonical JSON: ${error.message}`);
  }
  exactKeys(value, closedKeys, "evidence artifact");
  if (value.schema !== artifactSchemaVersion) fail("SCHEMA", `artifact schema marker must be ${artifactSchemaVersion}`);
}

export function createEvidenceArtifact(targetPath, bytes, options = {}) {
  const payload = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const artifactSchemaVersion = options.artifactSchemaVersion;
  validateArtifactPayload(payload, artifactSchemaVersion, options.closedKeys ?? null);
  const evidenceRoot = options.evidenceRoot ?? path.dirname(targetPath);
  const open = options.open ?? fs.openSync;
  const write = options.write ?? fs.writeSync;
  const sync = options.sync ?? fs.fsyncSync;
  const stat = options.stat ?? ((fd) => fs.fstatSync(fd, { bigint: true }));
  const lstat = options.lstat ?? lstatBigInt;
  const realpath = options.realpath ?? fs.realpathSync.native;
  const read = options.read ?? fs.readSync;
  const close = options.close ?? fs.closeSync;
  const parentOpen = options.parentOpen ?? fs.openSync;
  const parentSync = options.parentSync ?? fs.fsyncSync;
  const onBoundary = options.onBoundary ?? (() => {});
  const authorityFreeze = options.authorityFreeze;
  const authorityOptions = options.authorityOptions ?? {};
  const effects = options.effects ?? {};
  const frozenAncestors = captureAncestorChain(targetPath, evidenceRoot, lstat, realpath);
  inspectTarget(targetPath, frozenAncestors, lstat, realpath, false);
  onBoundary("before-open");
  compareAncestorChain(frozenAncestors, targetPath, evidenceRoot, lstat, realpath);
  let fd;
  let parentFd;
  let primary;
  try {
    fd = guardedEffect("B01", authorityFreeze, authorityOptions, effects.open, () => open(targetPath, "wx+"));
    onBoundary("after-open");
    compareAncestorChain(frozenAncestors, targetPath, evidenceRoot, lstat, realpath);
    let written = 0;
    while (written < payload.length) {
      const count = write(fd, payload, written, payload.length - written, written);
      if (count <= 0) fail("WRITE_STALLED", "evidence artifact write made no progress");
      written += count;
    }
    sync(fd);
    onBoundary("after-file-fsync");
    compareAncestorChain(frozenAncestors, targetPath, evidenceRoot, lstat, realpath);
    const handleIdentity = identity(stat(fd));
    const pathItem = inspectTarget(targetPath, frozenAncestors, lstat, realpath, true);
    if (!sameIdentity(handleIdentity, identity(pathItem))) fail("IDENTITY_MISMATCH", "evidence artifact path identity differs from original handle");
    const readback = Buffer.alloc(payload.length);
    let filled = 0;
    while (filled < payload.length) {
      const count = read(fd, readback, filled, payload.length - filled, filled);
      if (count <= 0) fail("READBACK_SHORT", "evidence artifact readback ended early");
      filled += count;
    }
    if (read(fd, Buffer.alloc(1), 0, 1, payload.length) !== 0) fail("READBACK_TRAILING", "evidence artifact has trailing bytes");
    if (!readback.equals(payload)) fail("READBACK_MISMATCH", "evidence artifact readback differs");
    validateArtifactPayload(readback, artifactSchemaVersion, options.closedKeys ?? null);
    onBoundary("after-readback-eof");
    compareAncestorChain(frozenAncestors, targetPath, evidenceRoot, lstat, realpath);
    inspectTarget(targetPath, frozenAncestors, lstat, realpath, true);
    close(fd);
    fd = undefined;
    onBoundary("before-parent-fsync");
    compareAncestorChain(frozenAncestors, targetPath, evidenceRoot, lstat, realpath);
    parentFd = parentOpen(frozenAncestors.parent, "r");
    guardedEffect("B08", authorityFreeze, authorityOptions, effects.parentSync, () => parentSync(parentFd));
    close(parentFd);
    parentFd = undefined;
    const receipt = {
      schema: RECEIPT_SCHEMA,
      artifactPath: targetPath,
      artifactSchemaVersion,
      bytes: payload.length,
      sha256: sha256(payload),
      exclusiveCreate: true,
      regularNonReparse: true,
      readbackMatches: true,
      status: "PASS",
    };
    validateReceipt(receipt);
    return receipt;
  } catch (error) {
    primary = error;
  } finally {
    for (const handle of [fd, parentFd]) {
      if (handle === undefined) continue;
      try {
        close(handle);
      } catch (error) {
        if (!primary) primary = error;
      }
    }
  }
  throw primary;
}

function validateTerminal(value) {
  exactKeys(value, TERMINAL_KEYS, "terminal artifact");
  if (value.schema !== TERMINAL_SCHEMA) fail("SCHEMA", `terminal schema must be ${TERMINAL_SCHEMA}`);
  for (const key of ["attemptId", "commandId", "semanticCode"]) if (!isNonEmptyText(value[key])) fail("SCHEMA", `terminal ${key} must be non-empty text`);
  if (!isSafeInteger(value.ordinal, 1)) fail("SCHEMA", "terminal ordinal must be a positive safe integer");
  if (!ISO_PATTERN.test(value.startedAt) || !ISO_PATTERN.test(value.finishedAt) || value.finishedAt < value.startedAt) fail("SCHEMA", "terminal timestamps must be ordered canonical UTC timestamps");
  if (value.childExitCode !== null && (!Number.isSafeInteger(value.childExitCode) || value.childExitCode < 0 || value.childExitCode > 255)) fail("SCHEMA", "terminal childExitCode must be null or a safe integer from 0 to 255");
  if (value.childSignal !== null && !isNonEmptyText(value.childSignal)) fail("SCHEMA", "terminal childSignal must be null or non-empty text");
  if (value.spawnError !== null && !isNonEmptyText(value.spawnError)) fail("SCHEMA", "terminal spawnError must be null or non-empty text");
  if (typeof value.timedOut !== "boolean") fail("SCHEMA", "terminal timedOut must be boolean");
  for (const key of ["stdoutBytes", "stderrBytes", "rowReceiptCount"]) if (!isSafeInteger(value[key])) fail("SCHEMA", `terminal ${key} must be a non-negative safe integer`);
  for (const key of ["stdoutSha256", "stderrSha256", "rowReceiptSha256"]) if (!isHash(value[key])) fail("SCHEMA", `terminal ${key} must be lowercase64 SHA-256`);
  if (value.rowReceiptCount > value.ordinal) fail("SCHEMA", "terminal rowReceiptCount cannot exceed ordinal");
  if (!["PASS", "FAIL"].includes(value.semanticStatus)) fail("SCHEMA", "terminal semanticStatus must be PASS or FAIL");
  if (value.semanticStatus === "PASS" && (value.childExitCode !== 0 || value.childSignal !== null || value.spawnError !== null || value.timedOut)) fail("SCHEMA", "PASS terminal requires clean child completion");
}

function validateEvidenceCounts(value, label) {
  for (const key of ["completedRowCount", "evidenceFileCount", "evidenceByteCount"]) if (!isSafeInteger(value[key])) fail("SCHEMA", `${label}.${key} must be a non-negative safe integer`);
  if (value.completedRowCount > value.evidenceFileCount) fail("SCHEMA", `${label}.completedRowCount cannot exceed evidenceFileCount`);
  if (value.evidenceFileCount === 0 && value.evidenceByteCount !== 0) fail("SCHEMA", `${label}.evidenceByteCount must be zero when evidenceFileCount is zero`);
  if (!isHash(value.evidenceManifestSha256)) fail("SCHEMA", `${label}.evidenceManifestSha256 must be lowercase64 SHA-256`);
}

function validatePublication(value) {
  if (value === null || typeof value !== "object" || ![RESULT_SCHEMA, FAILURE_SCHEMA].includes(value.schema)) fail("SCHEMA", "publication schema must be an exact frozen result or failure schema");
  const failureArtifact = value.schema === FAILURE_SCHEMA;
  exactKeys(value, failureArtifact ? FAILURE_KEYS : RESULT_KEYS, "publication artifact");
  if (!isNonEmptyText(value.attemptId) || !isNonEmptyText(value.terminalArtifactPath)) fail("SCHEMA", "publication identity paths must be non-empty text");
  if (value.terminalArtifactSha256 !== null && !isHash(value.terminalArtifactSha256)) fail("SCHEMA", "publication terminalArtifactSha256 must be null or lowercase64 SHA-256");
  validateEvidenceCounts(value, "publication");
  if (failureArtifact) {
    if (value.status !== "FAIL" || !isNonEmptyText(value.stage)) fail("SCHEMA", "failure publication requires FAIL status and non-empty stage");
    validateError(value.primaryError, "publication primaryError", false);
    if (!Array.isArray(value.secondaryErrors)) fail("SCHEMA", "publication secondaryErrors must be an array");
    for (const [index, item] of value.secondaryErrors.entries()) validateError(item, `publication secondaryErrors[${index}]`, false);
    if (typeof value.publicationAttemptedBeforeCleanup !== "boolean" || !value.publicationAttemptedBeforeCleanup) fail("SCHEMA", "failure publication must precede cleanup");
  } else {
    if (value.status !== "PASS" || !isHash(value.terminalArtifactSha256)) fail("SCHEMA", "result publication requires PASS status and terminal hash");
    if (typeof value.publishedBeforeCleanup !== "boolean" || !value.publishedBeforeCleanup) fail("SCHEMA", "result publication must precede cleanup");
  }
}

function validateCleanup(value, publication = null) {
  exactKeys(value, CLEANUP_KEYS, "cleanup artifact");
  if (value.schema !== CLEANUP_SCHEMA || !isNonEmptyText(value.attemptId) || !["PASS", "FAIL"].includes(value.status)) fail("SCHEMA", "cleanup schema, attemptId, or status is invalid");
  validateError(value.primaryError, "cleanup primaryError");
  if (!Array.isArray(value.secondaryErrors)) fail("SCHEMA", "cleanup secondaryErrors must be an array");
  for (const [index, item] of value.secondaryErrors.entries()) validateError(item, `cleanup secondaryErrors[${index}]`, false);
  for (const key of ["terminalArtifactPath", "resultOrFailureArtifactPath"]) if (!isNonEmptyText(value[key])) fail("SCHEMA", `cleanup ${key} must be non-empty text`);
  if (typeof value.cleanupStartedAfterPublicationAttempt !== "boolean" || !value.cleanupStartedAfterPublicationAttempt) fail("SCHEMA", "cleanup must start after publication attempt");
  if (!Array.isArray(value.operations) || !Array.isArray(value.residue)) fail("SCHEMA", "cleanup operations and residue must be arrays");
  for (const [index, item] of value.operations.entries()) {
    exactKeys(item, OPERATION_KEYS, `cleanup operations[${index}]`);
    if (item.ordinal !== index + 1 || !["unlink", "rmdir"].includes(item.operation) || !isNonEmptyText(item.path) || !["REMOVED", "REFUSED", "FAILED"].includes(item.result)) fail("SCHEMA", `cleanup operations[${index}] identity, operation, path, or result is invalid`);
    validateIdentityValue(item.expectedIdentity, `cleanup operations[${index}].expectedIdentity`);
    validateIdentityValue(item.observedIdentity, `cleanup operations[${index}].observedIdentity`);
    validateError(item.error, `cleanup operations[${index}].error`);
    if ((item.result === "REMOVED") !== (item.error === null)) fail("SCHEMA", `cleanup operations[${index}] result/error relationship is invalid`);
  }
  for (const [index, item] of value.residue.entries()) {
    exactKeys(item, RESIDUE_KEYS, `cleanup residue[${index}]`);
    if (!isNonEmptyText(item.path) || !isNonEmptyText(item.reason)) fail("SCHEMA", `cleanup residue[${index}] path and reason must be non-empty text`);
    validateIdentityValue(item.observedIdentity, `cleanup residue[${index}].observedIdentity`);
  }
  if (typeof value.manualCleanupRequired !== "boolean" || value.manualCleanupRequired !== (value.residue.length > 0) || (value.status === "PASS") !== (value.residue.length === 0)) fail("SCHEMA", "cleanup status, residue, and manualCleanupRequired relationship is invalid");
  if (publication !== null) {
    if (value.attemptId !== publication.artifact.attemptId || value.terminalArtifactPath !== publication.artifact.terminalArtifactPath) fail("SCHEMA", "cleanup identity must match publication identity");
    if (value.resultOrFailureArtifactPath !== publication.path) fail("SCHEMA", "cleanup publication path must match the exact published artifact path");
  }
}

function validateReceipt(value, label = "artifact receipt") {
  exactKeys(value, RECEIPT_KEYS, label);
  if (value.schema !== RECEIPT_SCHEMA || !isNonEmptyText(value.artifactPath) || !isNonEmptyText(value.artifactSchemaVersion)) fail("SCHEMA", `${label} schema or identity is invalid`);
  if (!isSafeInteger(value.bytes) || !isHash(value.sha256)) fail("SCHEMA", `${label} bytes or hash is invalid`);
  for (const key of ["exclusiveCreate", "regularNonReparse", "readbackMatches"]) if (typeof value[key] !== "boolean" || !value[key]) fail("SCHEMA", `${label}.${key} must be true`);
  if (value.status !== "PASS") fail("SCHEMA", `${label}.status must be PASS`);
}

export function deletionEffectAdapter(records = []) {
  return {
    records,
    remove(target, operation, expectedIdentity, observedIdentity) {
      if (!["unlink", "rmdir"].includes(operation)) fail("UNSAFE_DELETE", `unsupported deletion operation ${operation}`);
      const record = { ordinal: records.length + 1, operation, path: target, expectedIdentity, observedIdentity, result: "FAILED" };
      records.push(record);
      if (operation === "rmdir") fs.rmdirSync(target);
      else fs.unlinkSync(target);
      record.result = "REMOVED";
    },
    recursiveDeleteCount() {
      return records.filter((record) => !['unlink', 'rmdir'].includes(record.operation)).length;
    },
  };
}

function deletionOperationStream() {
  return deletionEffectAdapter();
}

function cleanupIdentity(pathValue, expected, runtimeRoot, seams, operation = "unlink") {
  try {
    const root = path.resolve(runtimeRoot);
    const target = path.resolve(pathValue);
    const relative = path.relative(root, target);
    const rootRemoval = target === root && operation === "rmdir";
    if (!rootRemoval && (!relative || relative.startsWith("..") || path.isAbsolute(relative))) fail("CLEANUP_SCOPE", "cleanup target must remain beneath runtime root");
    const item = seams.lstat(target);
    const observed = identity(item);
    if (item.isSymbolicLink?.()) fail("CLEANUP_REPARSE", "cleanup target is a symbolic link or reparse-observable object");
    if (!sameIdentity(expected, observed)) return { observed, result: "REFUSED", error: errorRecord(Object.assign(new Error("cleanup identity mismatch"), { code: "IDENTITY_MISMATCH" }), "cleanup") };
    seams.remove(target, operation, expected, observed);
    return { observed, result: "REMOVED", error: null };
  } catch (error) {
    return { observed: null, result: "FAILED", error: errorRecord(error, "cleanup") };
  }
}

function authorityBoundary(authorityFreeze, boundary, options) {
  if (options?.[TEST_DISABLE_BOUNDARY] === boundary) return;
  if (authorityFreeze) recheckAuthorityBoundary(authorityFreeze, boundary, options);
}

function guardedEffect(boundary, authorityFreeze, authorityOptions, adapter, operation) {
  adapter?.before?.(boundary);
  authorityBoundary(authorityFreeze, boundary, authorityOptions);
  return operation();
}

function createJson(create, target, value, schema, keys, evidenceRoot, authorityFreeze, authorityOptions) {
  return create(target, Buffer.from(`${JSON.stringify(value)}\n`), { artifactSchemaVersion: schema, closedKeys: keys, evidenceRoot, authorityFreeze, authorityOptions });
}

export function runDiagnosticLifecycle(config, seams = {}) {
  for (const key of ["attemptId", "terminalArtifactPath", "resultArtifactPath", "failureArtifactPath", "cleanupArtifactPath"]) if (!isNonEmptyText(config[key])) fail("SCHEMA", `lifecycle ${key} must be non-empty text`);
  if (config.evidenceRoot !== undefined && !isNonEmptyText(config.evidenceRoot)) fail("SCHEMA", "lifecycle evidenceRoot must be non-empty text when provided");
  if (new Set([config.terminalArtifactPath, config.resultArtifactPath, config.failureArtifactPath, config.cleanupArtifactPath]).size !== 4) fail("SCHEMA", "lifecycle artifact paths must be unique");
  if (typeof config.execute !== "function") fail("SCHEMA", "lifecycle execute must be a function");
  const create = seams.create ?? createEvidenceArtifact;
  const lstat = seams.lstat ?? lstatBigInt;
  const remove = seams.remove ?? deletionEffectAdapter().remove;
  const now = seams.now ?? (() => new Date().toISOString());
  const events = [];
  const secondaryErrors = [];
  const authorityFreeze = config.authorityFreeze;
  const authorityOptions = seams.authorityOptions ?? {};
  const effects = seams.effects ?? {};
  let primaryError = null;
  let terminalReceipt = null;
  let publicationReceipt = null;
  let terminal;
  try {
    const execution = config.execute();
    terminal = execution.terminal;
    validateTerminal(terminal);
    if (terminal.semanticStatus !== "PASS") primaryError = errorRecord(Object.assign(new Error(terminal.semanticCode), { code: terminal.semanticCode }), "execution");
  } catch (error) {
    primaryError = errorRecord(error, "execution");
  }
  if (terminal) {
    try {
      terminalReceipt = guardedEffect("B03", authorityFreeze, authorityOptions, effects.terminalCreate, () => createJson(create, config.terminalArtifactPath, terminal, TERMINAL_SCHEMA, TERMINAL_KEYS, config.evidenceRoot, authorityFreeze, authorityOptions));
      events.push("terminal-published");
    } catch (error) {
      const record = errorRecord(error, "persistence");
      if (primaryError) secondaryErrors.push(record);
      else primaryError = record;
      events.push("terminal-publication-failed");
    }
  }
  const evidence = config.evidence ?? { completedRowCount: 0, evidenceFileCount: 0, evidenceByteCount: 0, evidenceManifestSha256: sha256(Buffer.alloc(0)) };
  validateEvidenceCounts(evidence, "lifecycle evidence");
  const publicationPath = primaryError ? config.failureArtifactPath : config.resultArtifactPath;
  const publication = primaryError
    ? { schema: FAILURE_SCHEMA, attemptId: config.attemptId, status: "FAIL", stage: primaryError.stage, primaryError, secondaryErrors: [...secondaryErrors], terminalArtifactPath: config.terminalArtifactPath, terminalArtifactSha256: terminalReceipt?.sha256 ?? null, completedRowCount: evidence.completedRowCount, evidenceFileCount: evidence.evidenceFileCount, evidenceByteCount: evidence.evidenceByteCount, evidenceManifestSha256: evidence.evidenceManifestSha256, publicationAttemptedBeforeCleanup: true }
    : { schema: RESULT_SCHEMA, attemptId: config.attemptId, status: "PASS", terminalArtifactPath: config.terminalArtifactPath, terminalArtifactSha256: terminalReceipt.sha256, completedRowCount: evidence.completedRowCount, evidenceFileCount: evidence.evidenceFileCount, evidenceByteCount: evidence.evidenceByteCount, evidenceManifestSha256: evidence.evidenceManifestSha256, publishedBeforeCleanup: true };
  validatePublication(publication);
  try {
    const publicationBoundary = primaryError ? "B05" : "B04";
    publicationReceipt = guardedEffect(publicationBoundary, authorityFreeze, authorityOptions, primaryError ? effects.failureCreate : effects.resultCreate, () => createJson(create, publicationPath, publication, publication.schema, publication.schema === RESULT_SCHEMA ? RESULT_KEYS : FAILURE_KEYS, config.evidenceRoot, authorityFreeze, authorityOptions));
    events.push("result-or-failure-published");
  } catch (error) {
    const record = errorRecord(error, "persistence");
    if (primaryError) secondaryErrors.push(record);
    else primaryError = record;
    events.push("publication-failed");
  }
  events.push("cleanup-started");
  const operations = [];
  const residue = [];
  const runtimeRoot = config.runtimeRoot ?? path.dirname(config.terminalArtifactPath);
  for (const [index, owned] of (config.cleanupTargets ?? []).entries()) {
    const operation = owned.operation ?? "unlink";
    const boundary = operation === "rmdir" ? "B07" : "B06";
    let outcome;
    try {
      outcome = guardedEffect(boundary, authorityFreeze, authorityOptions, operation === "rmdir" ? effects.rmdir : effects.unlink, () => cleanupIdentity(owned.path, owned.identity, runtimeRoot, { lstat, remove }, operation));
    } catch (error) {
      outcome = { observed: null, result: "FAILED", error: errorRecord(error, "cleanup") };
    }
    operations.push({ ordinal: index + 1, operation, path: owned.path, expectedIdentity: owned.identity, observedIdentity: outcome.observed, result: outcome.result, error: outcome.error });
    if (outcome.error) {
      if (primaryError) secondaryErrors.push(outcome.error);
      else primaryError = outcome.error;
      residue.push({ path: owned.path, observedIdentity: outcome.observed, reason: outcome.error.message });
    }
  }
  const cleanup = { schema: CLEANUP_SCHEMA, attemptId: config.attemptId, status: residue.length === 0 ? "PASS" : "FAIL", primaryError, secondaryErrors: [...secondaryErrors], terminalArtifactPath: config.terminalArtifactPath, resultOrFailureArtifactPath: publicationPath, cleanupStartedAfterPublicationAttempt: true, operations, residue, manualCleanupRequired: residue.length > 0 };
  validateCleanup(cleanup, { path: publicationPath, artifact: publication });
  let cleanupReceipt = null;
  try {
    cleanupReceipt = createJson(create, config.cleanupArtifactPath, cleanup, CLEANUP_SCHEMA, CLEANUP_KEYS, config.evidenceRoot, undefined, authorityOptions);
    events.push("cleanup-published");
  } catch (error) {
    const record = errorRecord(error, "cleanup-persistence");
    if (primaryError) secondaryErrors.push(record);
    else primaryError = record;
    events.push("cleanup-publication-failed");
  }
  const finalSummary = { primaryError, secondaryErrors: [...secondaryErrors], cleanupArtifactExpected: cleanupReceipt !== null, cleanupArtifactPublished: cleanupReceipt !== null, cleanupArtifactPath: config.cleanupArtifactPath, cleanupArtifactRole: "cleanup" };
  return { status: primaryError ? "FAIL" : "PASS", primaryError, secondaryErrors, terminal, publication, cleanup, finalSummary, receipts: { terminal: terminalReceipt, publication: publicationReceipt, cleanup: cleanupReceipt }, events, finishedAt: now() };
}

export function validateDiagnosticRegistry(value) {
  exactKeys(value, REGISTRY_KEYS, "diagnostic registry");
  if (value.schema !== "repository-diagnostic-registry/v1" || value.fixture_mode !== true || !Array.isArray(value.rows) || value.rows.length === 0) fail("REGISTRY_SCHEMA", "diagnostic registry must be a non-empty fixture-mode v1 registry");
  const ids = new Set();
  for (const [index, row] of value.rows.entries()) {
    exactKeys(row, REGISTRY_ROW_KEYS, `diagnostic registry row ${index + 1}`);
    if (row.ordinal !== index + 1 || typeof row.command_id !== "string" || !/^[A-Z0-9][A-Z0-9_-]*$/.test(row.command_id) || ids.has(row.command_id)) fail("REGISTRY_SCHEMA", "diagnostic registry row identity is invalid");
    ids.add(row.command_id);
    if (row.capability !== "diagnostic-only" || row.executable !== "node" || !Array.isArray(row.argv) || row.argv.some((arg) => typeof arg !== "string")) fail("REGISTRY_CAPABILITY", "diagnostic registry executable/argv is not allowed");
    if (!ALLOWED_ACTIONS.has(row.action) || !ALLOWED_LIFECYCLES.has(row.lifecycle)) fail("REGISTRY_CAPABILITY", "diagnostic registry action/lifecycle is not allowed");
    if (row.argv.length !== 2 || row.argv[0] !== "--diagnostic-op" || row.argv[1] !== row.action) fail("REGISTRY_CAPABILITY", "diagnostic registry argv does not exactly bind its action");
    if (!Array.isArray(row.artifact_roles) || row.artifact_roles.length === 0 || new Set(row.artifact_roles).size !== row.artifact_roles.length || row.artifact_roles.some((role) => !ALLOWED_ROLES.has(role))) fail("REGISTRY_SCHEMA", "diagnostic registry artifact roles are invalid");
  }
  return value;
}

export function executeDiagnosticRegistry(registry, options = {}) {
  validateDiagnosticRegistry(registry);
  const spawn = options.spawn ?? spawnSync;
  const runnerPath = options.runnerPath ?? path.resolve(process.argv[1]);
  const now = options.now ?? (() => new Date().toISOString());
  const receipts = [];
  for (const row of registry.rows) {
    const startedAt = now();
    const executable = row.executable === "node" ? process.execPath : row.executable;
    const child = spawn(executable, [runnerPath, ...row.argv], { shell: false, encoding: null, timeout: 10000, maxBuffer: 1024 * 1024 });
    const stdout = Buffer.from(child.stdout ?? Buffer.alloc(0));
    const stderr = Buffer.from(child.stderr ?? Buffer.alloc(0));
    const terminal = { schema: TERMINAL_SCHEMA, attemptId: options.attemptId ?? "fixture-attempt", commandId: row.command_id, ordinal: row.ordinal, startedAt, finishedAt: now(), childExitCode: child.status, childSignal: child.signal, spawnError: child.error ? String(child.error.message) : null, timedOut: child.error?.code === "ETIMEDOUT", stdoutBytes: stdout.length, stdoutSha256: sha256(stdout), stderrBytes: stderr.length, stderrSha256: sha256(stderr), rowReceiptCount: row.ordinal, rowReceiptSha256: sha256(Buffer.from(`${row.command_id}:${child.status}`)), semanticStatus: child.status === 0 && !child.error ? "PASS" : "FAIL", semanticCode: child.status === 0 && !child.error ? "OK" : "DIAGNOSTIC_CHILD_FAILURE" };
    validateTerminal(terminal);
    receipts.push(terminal);
    if (terminal.semanticStatus !== "PASS") break;
  }
  return { status: receipts.length === registry.rows.length && receipts.every((item) => item.semanticStatus === "PASS") ? "PASS" : "FAIL", receipts };
}

const COMMAND_REGISTRY_SCHEMA = "repository-diagnostic-command-registry/v1";
const GIT_OID_PATTERN = /^[0-9a-f]{40}$/;
const COMMAND_CHROME = "/home/compute_01/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
const COMMAND_REGISTRY_KEYS = ["schema", "version", "repository_root", "operation_root", "registry_root", "runtime_root", "evidence_root", "environment_allowlist", "head_commit_oid", "head_tree_oid", "live_pathspecs", "tree_pathspecs", "ignore_paths", "rows", "lifecycle"];
const COMMAND_FIXTURE_REGISTRY_KEYS = ["schema", "version", "fixture_mode", ...COMMAND_REGISTRY_KEYS.slice(2)];
const COMMAND_FIXTURE_MODES = new Set(["success", "semantic-failure", "cleanup-only", "publication-only", "combined"]);
const COMMAND_LIFECYCLE_KEYS = ["terminal", "result", "failure", "cleanup"];
const COMMAND_ROW_KEYS = ["ordinal", "id", "action", "capability_class", "executable", "argv", "cwd", "env", "env_allowlist", "timeout_ms", "max_buffer_bytes", "expected", "semantic", "evidence"];
const EXPECTED_KEYS = ["exit_code", "signal", "stdout_policy", "stderr_policy"];
const STREAM_POLICY_KEYS = ["schema", "bytes", "sha256", "semantic_kind"];
const SEMANTIC_KEYS = ["kind", "parameters"];
const EVIDENCE_KEYS = ["pre_receipt", "post_receipt", "stdout_receipt", "stderr_receipt"];
const COMMAND_ENV_ALLOWLIST = ["HOME", "LANG", "LC_ALL", "PATH", "TZ", "GIT_CONFIG_NOSYSTEM"];
const COMMAND_CAPABILITIES = new Set(["diagnostic-version", "diagnostic-validator", "diagnostic-git-path-read", "diagnostic-git-object-read", "diagnostic-git-archive-write"]);
const COMMAND_SEMANTICS = new Set(["version-node/v1", "version-npm/v1", "version-vite/v1", "version-chrome/v1", "git-head-oid/v1", "validator-plan-json-clean/v1", "validator-phase-json-clean/v1", "validator-umbrella-json-clean/v1", "validator-goal-pass-line/v1", "validator-envelope-json-clean/v1", "git-porcelain-pathset/v1", "git-name-list/v1", "git-diff-check-clean/v1", "git-check-ignore-exact/v1", "git-ls-tree-z/v1", "git-archive-tar/v1"]);
const COMMAND_LIVE_PATHS = [".gitattributes", "scripts/assetDeliveryManifest.js", "scripts/assetDeliveryAudit.mjs", "scripts/assetDeliveryAudit.test.mjs", "process/features/casino-overhaul/active/visual-animation-assets_07-08-26/phase-02-asset-provenance-delivery_PLAN_07-08-26.md"];
const COMMAND_IGNORE_PATHS = [".agent/phase-02-runtime/phase02-continuation-20260902-17", "process/features/casino-overhaul/active/visual-animation-assets_07-08-26/phase-02-asset-provenance-delivery_EVL-CORRECTION_23-08-26.md"];
const COMMAND_TREE_PATHS = [".claude", ".codex", ".github", ".gitignore", ".vercelignore", "DESIGN.md", "README.md", "api", "components.json", "docs", "eslint.config.js", "index.html", "jsconfig.json", "netlify.toml", "netlify", "package-lock.json", "package.json", "process", "progress.md", "public", "scripts", "server", "skills-lock.json", "src", "tsconfig.core.json", "types", "vercel.json", "vite.config.js"];
const GIT_PORCELAIN_STATUSES = [" M", "M ", "MM", "A ", "AM", "D ", " D", "R ", "RM", "C ", "CM", "DD", "AU", "UD", "UA", "DU", "AA", "UU", "??", "!!"];
const SECRET_NAME_PATTERN = /TOKEN|SECRET|PASSWORD|PASSWD|COOKIE|AUTH|CREDENTIAL|PRIVATE|API_KEY|PROXY|PROVIDER|^VITE_/i;

function commandPolicy(overrides = {}) {
  const repositoryRoot = overrides.repositoryRoot ?? process.cwd();
  return {
    repositoryRoot,
    node: overrides.node ?? process.execPath,
    git: overrides.git ?? "/usr/bin/git",
    chrome: overrides.chrome ?? COMMAND_CHROME,
    npmCli: overrides.npmCli ?? path.join(path.dirname(path.dirname(process.execPath)), "lib/node_modules/npm/bin/npm-cli.js"),
    viteCli: overrides.viteCli ?? path.join(repositoryRoot, "node_modules/vite/bin/vite.js"),
    planValidator: overrides.planValidator ?? path.join(repositoryRoot, ".claude/skills/vc-generate-plan/scripts/validate-plan-artifact.mjs"),
    phaseValidator: overrides.phaseValidator ?? path.join(repositoryRoot, ".claude/skills/vc-generate-phase-program/scripts/validate-phase-stub.mjs"),
    umbrellaValidator: overrides.umbrellaValidator ?? path.join(repositoryRoot, ".claude/skills/vc-generate-phase-program/scripts/validate-umbrella-artifact.mjs"),
    goalValidator: overrides.goalValidator ?? path.join(repositoryRoot, ".claude/skills/vc-autopilot/scripts/validate-autopilot-goal-block.mjs"),
    envelopeValidator: overrides.envelopeValidator ?? path.join(repositoryRoot, ".claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs"),
  };
}

function exactArray(value, expected, label) {
  if (JSON.stringify(value) !== JSON.stringify(expected)) fail("REGISTRY_SCHEMA", `${label} must equal the frozen ordered ledger`);
}

function trustedGitHead(repositoryRoot) {
  const env = Object.assign(Object.create(null), { HOME: os.tmpdir(), LANG: "C.UTF-8", LC_ALL: "C.UTF-8", PATH: "/usr/bin:/bin", TZ: "UTC", GIT_CONFIG_NOSYSTEM: "1" });
  const read = (revision) => {
    const child = spawnSync("/usr/bin/git", ["rev-parse", "--verify", revision], { cwd: repositoryRoot, env, shell: false, encoding: null, timeout: 30000, maxBuffer: 4096 });
    const stdout = Buffer.from(child.stdout ?? Buffer.alloc(0));
    if (child.error || child.signal !== null || child.status !== 0 || Buffer.from(child.stderr ?? Buffer.alloc(0)).length !== 0 || stdout.length !== 41 || !/^[0-9a-f]{40}\n$/.test(stdout.toString("ascii"))) fail("REPOSITORY_AUTHORITY", `trusted Git failed for ${revision}`);
    return stdout.subarray(0, 40).toString("ascii");
  };
  return { head_commit_oid: read("HEAD^{commit}"), head_tree_oid: read("HEAD^{tree}") };
}

function requireTrustedGitHead(registry) {
  const first = trustedGitHead(registry.repository_root);
  const second = trustedGitHead(registry.repository_root);
  if (JSON.stringify(first) !== JSON.stringify(second) || first.head_commit_oid !== registry.head_commit_oid || first.head_tree_oid !== registry.head_tree_oid) fail("REPOSITORY_AUTHORITY", "declared repository objects do not match stable trusted Git HEAD");
}

function absoluteNormalized(value, label) {
  if (!isNonEmptyText(value) || value.includes("\0") || value.includes("\r") || value.includes("\n") || !path.isAbsolute(value) || path.normalize(value) !== value) fail("REGISTRY_PATH", `${label} must be a normalized absolute path`);
  return value;
}

function safeExisting(target, type, label, observations = {}) {
  const lstat = observations.lstat ?? lstatBigInt;
  const realpath = observations.realpath ?? fs.realpathSync.native;
  const item = lstat(target);
  if (item.isSymbolicLink() || (type === "file" ? !item.isFile() : !item.isDirectory())) fail("REGISTRY_PATH", `${label} must be a non-alias ${type}`);
  if (realpath(target) !== target) fail("REGISTRY_PATH", `${label} must equal its real path`);
  return { item, realpath: realpath(target) };
}

function canonicalPathKey(value) {
  return path.normalize(value).replaceAll("\\", "/").normalize("NFKC").toLowerCase();
}

function strictDescendant(parent, child, label) {
  const parentKey = canonicalPathKey(parent);
  const childKey = canonicalPathKey(child);
  if (childKey === parentKey || !childKey.startsWith(`${parentKey}/`)) fail("REGISTRY_PATH", `${label} must be strictly beneath its owner root`);
}

function filesystemIdentity(item) {
  return `${item.dev}:${item.ino}:${item.mode & BigInt(fs.constants.S_IFMT)}`;
}

export function validateRoleRoots(roots, options = {}) {
  exactKeys(roots, ["operation_root", "registry_root", "runtime_root", "evidence_root"], "role roots");
  const observations = options.observations ?? {};
  const labels = Object.keys(roots);
  const observed = new Map();
  for (const label of labels) {
    const value = absoluteNormalized(roots[label], label);
    if (canonicalPathKey(value) === canonicalPathKey(path.parse(value).root)) fail("REGISTRY_PATH", `${label} cannot equal a filesystem root`);
    if (!options.skipFilesystem) observed.set(label, safeExisting(value, "directory", label, observations));
  }
  for (const label of labels.slice(1)) strictDescendant(roots.operation_root, roots[label], label);
  for (let left = 1; left < labels.length; left++) for (let right = left + 1; right < labels.length; right++) {
    const leftLabel = labels[left];
    const rightLabel = labels[right];
    const leftKey = canonicalPathKey(roots[leftLabel]);
    const rightKey = canonicalPathKey(roots[rightLabel]);
    if (leftKey === rightKey || leftKey.startsWith(`${rightKey}/`) || rightKey.startsWith(`${leftKey}/`)) fail("REGISTRY_PATH", `${leftLabel} and ${rightLabel} must be pairwise disjoint`);
    if (!options.skipFilesystem) {
      const leftObserved = observed.get(leftLabel);
      const rightObserved = observed.get(rightLabel);
      const leftReal = canonicalPathKey(leftObserved.realpath);
      const rightReal = canonicalPathKey(rightObserved.realpath);
      if (leftReal === rightReal || leftReal.startsWith(`${rightReal}/`) || rightReal.startsWith(`${leftReal}/`) || filesystemIdentity(leftObserved.item) === filesystemIdentity(rightObserved.item)) fail("REGISTRY_PATH", `${leftLabel} and ${rightLabel} alias or overlap by realpath or identity`);
    }
  }
  return observed;
}

function frozenFilesystemEntry(target, expectedType, observations = {}) {
  const lstat = observations.lstat ?? lstatBigInt;
  const realpath = observations.realpath ?? fs.realpathSync.native;
  const item = lstat(target);
  if (item.isSymbolicLink() || (expectedType === "file" ? !item.isFile() : !item.isDirectory())) fail("REGISTRY_PATH", `${target} must be a non-reparse ${expectedType}`);
  if (expectedType === "file" && item.nlink !== 1n) fail("REGISTRY_PATH", `${target} must have exactly one link`);
  const resolved = realpath(target);
  const base = { path: target, dev: item.dev.toString(), ino: item.ino.toString(), mode: item.mode.toString(), type: expectedType, realpath: resolved };
  return Object.freeze(expectedType === "file" ? { ...base, nlink: item.nlink.toString(), size: item.size.toString(), mtimeNs: item.mtimeNs.toString() } : base);
}

function registryAncestorPaths(operationRoot, registryRoot, registryPath) {
  strictDescendant(operationRoot, registryRoot, "registry_root");
  strictDescendant(registryRoot, registryPath, "diagnostic registry");
  const paths = [operationRoot];
  let current = operationRoot;
  for (const segment of path.relative(operationRoot, path.dirname(registryPath)).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    paths.push(current);
  }
  return [...new Set(paths)];
}

function freezeRoleRootSet(roots, observations = {}) {
  validateRoleRoots(roots, { observations });
  return Object.freeze(Object.fromEntries(Object.entries(roots).map(([key, value]) => [key, Object.freeze({ spelling: value, normalized: path.normalize(value), identity: frozenFilesystemEntry(value, "directory", observations) })])));
}

function compareFrozenEntry(expected, observed, label) {
  if (JSON.stringify(expected) !== JSON.stringify(observed)) fail("AUTHORITY_BOUNDARY_DRIFT", `${label} identity, realpath, or relationship drifted`);
}

export function freezeBoundedRegistryAuthority(registryPath, envelopeRoots, options = {}) {
  const target = absoluteNormalized(registryPath, "diagnostic registry");
  const roots = Object.freeze({ ...envelopeRoots });
  const rootFreeze = freezeRoleRootSet(roots, options);
  const ancestorPaths = registryAncestorPaths(roots.operation_root, roots.registry_root, target);
  const ancestorChain = Object.freeze(ancestorPaths.map((entry) => frozenFilesystemEntry(entry, "directory", options)));
  const before = frozenFilesystemEntry(target, "file", options);
  strictDescendant(rootFreeze.operation_root.identity.realpath, before.realpath, "diagnostic registry operation realpath");
  strictDescendant(rootFreeze.registry_root.identity.realpath, before.realpath, "diagnostic registry realpath");
  const length = Number(before.size);
  if (!Number.isSafeInteger(length) || length < 1 || length > 1048576) fail("REGISTRY_BOUNDS", "diagnostic registry bytes must be between 1 and 1048576 before allocation");
  const open = options.open ?? fs.openSync;
  const read = options.read ?? fs.readSync;
  const close = options.close ?? fs.closeSync;
  const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0);
  let fd;
  let bytes;
  try {
    fd = open(target, flags);
    const handle = options.fstat ? options.fstat(fd) : fs.fstatSync(fd, { bigint: true });
    if (filesystemIdentity(handle) !== `${before.dev}:${before.ino}:${BigInt(before.mode) & BigInt(fs.constants.S_IFMT)}` || handle.nlink !== 1n || !handle.isFile()) fail("REGISTRY_IDENTITY", "diagnostic registry handle does not match frozen regular single-link file");
    bytes = Buffer.alloc(length);
    let offset = 0;
    while (offset < length) {
      const count = read(fd, bytes, offset, length - offset, offset);
      if (count <= 0) fail("REGISTRY_IDENTITY", "diagnostic registry ended before frozen length");
      offset += count;
    }
    if (read(fd, Buffer.alloc(1), 0, 1, length) !== 0) fail("REGISTRY_IDENTITY", "diagnostic registry exceeded frozen length");
  } finally {
    if (fd !== undefined) close(fd);
  }
  options.afterRead?.();
  compareFrozenEntry(before, frozenFilesystemEntry(target, "file", options), "diagnostic registry");
  for (const expected of ancestorChain) compareFrozenEntry(expected, frozenFilesystemEntry(expected.path, "directory", options), `diagnostic registry ancestor ${expected.path}`);
  compareFrozenEntry(rootFreeze.operation_root.identity, frozenFilesystemEntry(roots.operation_root, "directory", options), "operation_root");
  return Object.freeze({ bytes, bytesLength: bytes.length, sha256: sha256(bytes), registryIdentity: before, ancestorChain, roots: rootFreeze });
}

export function freezeBoundedRegistry(target, registryRoot, options = {}) {
  const operationRoot = options.operationRoot ?? path.dirname(registryRoot);
  const runtimeRoot = options.runtimeRoot ?? path.join(operationRoot, "runtime");
  const evidenceRoot = options.evidenceRoot ?? path.join(operationRoot, "evidence");
  const frozen = freezeBoundedRegistryAuthority(target, { operation_root: operationRoot, registry_root: registryRoot, runtime_root: runtimeRoot, evidence_root: evidenceRoot }, options);
  return { bytes: frozen.bytes, sha256: frozen.sha256, identity: `${frozen.registryIdentity.dev}:${frozen.registryIdentity.ino}:${BigInt(frozen.registryIdentity.mode) & BigInt(fs.constants.S_IFMT)}`, realpath: frozen.registryIdentity.realpath, bytesLength: frozen.bytesLength, authorityFreeze: frozen };
}

export function recheckAuthorityBoundary(authorityFreeze, boundary, options = {}) {
  if (!/^B(?:0[1-9]|10)$/.test(boundary)) fail("AUTHORITY_BOUNDARY_DRIFT", `unknown authority boundary ${boundary}`);
  options.beforeBoundary?.(boundary);
  const rootSpellings = Object.fromEntries(Object.entries(authorityFreeze.roots).map(([key, value]) => [key, value.spelling]));
  validateRoleRoots(rootSpellings, { observations: options, skipFilesystem: options.allowRemovedRuntimeRoot === true });
  for (const [key, expected] of Object.entries(authorityFreeze.roots)) {
    if (expected.spelling !== rootSpellings[key] || expected.normalized !== path.normalize(rootSpellings[key])) fail("AUTHORITY_BOUNDARY_DRIFT", `${key} spelling or normalization drifted before ${boundary}`);
    if (key === "runtime_root" && options.allowRemovedRuntimeRoot === true && !fs.existsSync(expected.spelling)) continue;
    compareFrozenEntry(expected.identity, frozenFilesystemEntry(expected.spelling, "directory", options), `${key} before ${boundary}`);
  }
  for (const expected of authorityFreeze.ancestorChain) compareFrozenEntry(expected, frozenFilesystemEntry(expected.path, "directory", options), `registry ancestor before ${boundary}`);
  compareFrozenEntry(authorityFreeze.registryIdentity, frozenFilesystemEntry(authorityFreeze.registryIdentity.path, "file", options), `registry before ${boundary}`);
  return undefined;
}

function validateCommandEnvironment(row, registry, policy) {
  exactKeys(row.env, row.env_allowlist, `row ${row.ordinal} env`);
  exactArray(Object.keys(row.env), row.env_allowlist, `row ${row.ordinal} env keys`);
  if (new Set(row.env_allowlist).size !== row.env_allowlist.length || row.env_allowlist.some((key) => !registry.environment_allowlist.includes(key) || SECRET_NAME_PATTERN.test(key))) fail("REGISTRY_ENV", `row ${row.ordinal} env names are not allowed`);
  for (const [key, value] of Object.entries(row.env)) if (typeof value !== "string" || value.length > 4096 || /[\0\r\n]/.test(key + value) || SECRET_NAME_PATTERN.test(key) || /^(?:NODE_OPTIONS|GIT_(?!CONFIG_NOSYSTEM)|LD_|DYLD_)/i.test(key)) fail("REGISTRY_ENV", `row ${row.ordinal} env contains unsafe data`);
  const nodePath = `${path.dirname(policy.node)}:/usr/bin:/bin`;
  const gitLike = row.executable === policy.git || row.executable === policy.chrome;
  const expected = gitLike
    ? { HOME: row.env.HOME, LANG: "C.UTF-8", LC_ALL: "C.UTF-8", PATH: "/usr/bin:/bin", TZ: "UTC", ...(row.executable === policy.git ? { GIT_CONFIG_NOSYSTEM: "1" } : {}) }
    : { HOME: row.env.HOME, LANG: "C.UTF-8", LC_ALL: "C.UTF-8", PATH: nodePath, TZ: "UTC" };
  strictDescendant(registry.runtime_root, row.env.HOME, `row ${row.ordinal} HOME`);
  if (JSON.stringify(row.env) !== JSON.stringify(expected)) fail("REGISTRY_ENV", `row ${row.ordinal} env is not the exact isolated environment`);
}

function validateStreamPolicy(value, semanticKind, label) {
  exactKeys(value, STREAM_POLICY_KEYS, label);
  if (!["exact-bytes/v1", "semantic/v1"].includes(value.schema)) fail("REGISTRY_EXPECTED", `${label} schema is unknown`);
  if (!isSafeInteger(value.bytes) || !isHash(value.sha256)) fail("REGISTRY_EXPECTED", `${label} bytes/hash is invalid`);
  if (value.semantic_kind !== semanticKind) fail("REGISTRY_EXPECTED", `${label} semantic kind drifted`);
}

const VERSION_SEMANTICS = new Set(["version-node/v1", "version-npm/v1", "version-vite/v1", "version-chrome/v1"]);

function derivedSemanticStreams(kind, parameters) {
  let stdout;
  if (VERSION_SEMANTICS.has(kind)) {
    exactSemanticParameters(parameters, ["expected"], kind);
    stdout = Buffer.from(`${parameters.expected}\n`, "utf8");
  } else if (kind === "git-head-oid/v1") {
    exactSemanticParameters(parameters, ["head_commit_oid"], kind);
    stdout = Buffer.from(`${parameters.head_commit_oid}\n`, "ascii");
  } else {
    return null;
  }
  return { stdout, stderr: Buffer.alloc(0) };
}

function requireDerivedSemanticPolicy(row) {
  const streams = derivedSemanticStreams(row.semantic.kind, row.semantic.parameters);
  if (!streams) return;
  for (const [name, bytes] of Object.entries(streams)) {
    const policy = row.expected[`${name}_policy`];
    if (policy.bytes !== bytes.length || policy.sha256 !== sha256(bytes)) fail("REGISTRY_EXPECTED", `row ${row.ordinal} ${name}_policy does not match semantic parameters`);
  }
}

function validateGitSemanticParameters(kind, parameters) {
  if (kind === "git-porcelain-pathset/v1") {
    exactSemanticParameters(parameters, ["framing", "allowed_statuses", "include_untracked", "include_ignored", "allowed_paths", "ledger_paths", "bytes", "sha256"], kind);
    if (parameters.framing !== "porcelain-v1-z/raw-bytes" || JSON.stringify(parameters.allowed_statuses) !== JSON.stringify(GIT_PORCELAIN_STATUSES) || typeof parameters.include_untracked !== "boolean" || typeof parameters.include_ignored !== "boolean") fail("REGISTRY_SEMANTIC", `${kind} framing/status flags are invalid`);
    for (const [label, values] of [["allowed_paths", parameters.allowed_paths], ["ledger_paths", parameters.ledger_paths]]) {
      validateStringArray(values, `${kind}.${label}`);
      if (new Set(values).size !== values.length) fail("REGISTRY_SEMANTIC", `${kind}.${label} must be unique`);
      values.forEach((value) => validateRepositoryRelativePath(value, `${kind}.${label}`));
    }
    if (parameters.allowed_paths.some((value) => !parameters.ledger_paths.includes(value))) fail("REGISTRY_SEMANTIC", `${kind} allowed_paths must be included in ledger_paths`);
  } else if (kind === "git-name-list/v1") {
    exactSemanticParameters(parameters, ["framing", "allowed_paths", "bytes", "sha256"], kind);
    if (parameters.framing !== "name-only-z/raw-bytes") fail("REGISTRY_SEMANTIC", `${kind} framing is invalid`);
    validateStringArray(parameters.allowed_paths, `${kind}.allowed_paths`);
    if (new Set(parameters.allowed_paths).size !== parameters.allowed_paths.length) fail("REGISTRY_SEMANTIC", `${kind}.allowed_paths must be unique`);
    parameters.allowed_paths.forEach((value) => validateRepositoryRelativePath(value, `${kind}.allowed_paths`));
  } else if (kind === "git-ls-tree-z/v1") {
    exactSemanticParameters(parameters, ["framing", "pathspecs", "inventory_bytes", "inventory_sha256"], kind);
    if (parameters.framing !== "ls-tree-z/raw-bytes") fail("REGISTRY_SEMANTIC", `${kind} framing is invalid`);
    validateStringArray(parameters.pathspecs, `${kind}.pathspecs`);
  } else return;
  const bytes = kind === "git-ls-tree-z/v1" ? parameters.inventory_bytes : parameters.bytes;
  const digest = kind === "git-ls-tree-z/v1" ? parameters.inventory_sha256 : parameters.sha256;
  if (!isSafeInteger(bytes) || !isHash(digest)) fail("REGISTRY_SEMANTIC", `${kind} raw receipt is invalid`);
}

function commandShape(row, registry, policy) {
  const live = registry.live_pathspecs;
  const tree = registry.tree_pathspecs;
  const ignore = registry.ignore_paths;
  const selectedPlan = row.semantic.parameters.selected_plan ?? row.semantic.parameters.argv_path;
  const shapes = [
    [policy.node, ["--version"], "diagnostic-version", "version-node/v1"],
    [policy.node, [policy.npmCli, "--version"], "diagnostic-version", "version-npm/v1"],
    [policy.git, ["rev-parse", "--verify", "HEAD^{commit}"], "diagnostic-git-object-read", "git-head-oid/v1"],
    [policy.node, [policy.viteCli, "--version"], "diagnostic-version", "version-vite/v1"],
    [policy.chrome, ["--version"], "diagnostic-version", "version-chrome/v1"],
    [policy.node, [policy.planValidator, "--strict", selectedPlan], "diagnostic-validator", "validator-plan-json-clean/v1"],
    [policy.node, [policy.phaseValidator, "--strict", selectedPlan], "diagnostic-validator", "validator-phase-json-clean/v1"],
    [policy.node, [policy.umbrellaValidator, "--strict", row.semantic.parameters.argv_path], "diagnostic-validator", "validator-umbrella-json-clean/v1"],
    [policy.node, [policy.goalValidator, row.semantic.parameters.goal], "diagnostic-validator", "validator-goal-pass-line/v1"],
    [policy.node, [policy.envelopeValidator, selectedPlan], "diagnostic-validator", "validator-envelope-json-clean/v1"],
    [policy.git, ["-c", "core.quotepath=false", "status", "--porcelain=v1", "-z", "--untracked-files=normal", "--", ...live], "diagnostic-git-path-read", "git-porcelain-pathset/v1"],
    [policy.git, ["-c", "core.quotepath=false", "status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ...live], "diagnostic-git-path-read", "git-porcelain-pathset/v1"],
    [policy.git, ["-c", "core.quotepath=false", "diff", "--cached", "--name-only", "-z", "--", ...live], "diagnostic-git-path-read", "git-name-list/v1"],
    [policy.git, ["diff", "--check", "--", ...live], "diagnostic-git-path-read", "git-diff-check-clean/v1"],
    [policy.git, ["check-ignore", "-v", "--", ignore[0]], "diagnostic-git-path-read", "git-check-ignore-exact/v1"],
    [policy.git, ["check-ignore", "-v", "--", ignore[1]], "diagnostic-git-path-read", "git-check-ignore-exact/v1"],
    [policy.git, ["ls-tree", "-r", "-z", "--full-tree", registry.head_tree_oid, "--", ...tree], "diagnostic-git-object-read", "git-ls-tree-z/v1"],
    [policy.git, ["archive", "--format=tar", `--output=${row.semantic.parameters.archive_path}`, registry.head_tree_oid, "--", ...tree], "diagnostic-git-archive-write", "git-archive-tar/v1"],
  ];
  return shapes.find(([executable, argv, capability, semantic]) => row.executable === executable && JSON.stringify(row.argv) === JSON.stringify(argv) && row.capability_class === capability && row.semantic.kind === semantic);
}

export function bindRegistryRoleRoots(registry, envelopeRoots, options = {}) {
  const keys = ["operation_root", "registry_root", "runtime_root", "evidence_root"];
  const registryRoots = {};
  for (const key of keys) {
    if (!Object.hasOwn(registry, key) || registry[key] !== envelopeRoots[key]) fail("REGISTRY_ROOT_BINDING", `registry ${key} must byte-equal envelope ${key}`);
    registryRoots[key] = registry[key];
  }
  validateRoleRoots(registryRoots, options);
  return Object.freeze(registryRoots);
}

function commandFixturePolicy(registry) {
  if (!Array.isArray(registry.rows) || registry.rows.length !== 18) fail("REGISTRY_SCHEMA", "fixture registry must contain exactly 18 rows");
  const candidate = commandPolicy({ repositoryRoot: registry.repository_root, node: registry.rows[0].executable, npmCli: registry.rows[1].argv[0], git: registry.rows[2].executable, viteCli: registry.rows[3].argv[0], chrome: registry.rows[4].executable, planValidator: registry.rows[5].argv[0], phaseValidator: registry.rows[6].argv[0], umbrellaValidator: registry.rows[7].argv[0], goalValidator: registry.rows[8].argv[0], envelopeValidator: registry.rows[9].argv[0] });
  if (candidate.node !== process.execPath) fail("REGISTRY_CAPABILITY", "fixture Node executable must be the current fixed Node runtime");
  for (const target of [candidate.npmCli, candidate.git, candidate.viteCli, candidate.chrome, candidate.planValidator, candidate.phaseValidator, candidate.umbrellaValidator, candidate.goalValidator, candidate.envelopeValidator]) {
    strictDescendant(registry.operation_root, target, "fixture executable");
    if ([registry.registry_root, registry.runtime_root, registry.evidence_root].some((root) => canonicalPathKey(target) === canonicalPathKey(root) || canonicalPathKey(target).startsWith(`${canonicalPathKey(root)}/`))) fail("REGISTRY_CAPABILITY", "fixture executable must remain in its separate operation-root tools directory");
  }
  return candidate;
}

export function validateCommandRegistry(registry, options = {}) {
  const fixtureMode = Object.hasOwn(registry, "fixture_mode");
  exactKeys(registry, fixtureMode ? COMMAND_FIXTURE_REGISTRY_KEYS : COMMAND_REGISTRY_KEYS, "command registry");
  if (registry.schema !== COMMAND_REGISTRY_SCHEMA || registry.version !== 1 || fixtureMode && !COMMAND_FIXTURE_MODES.has(registry.fixture_mode)) fail("REGISTRY_SCHEMA", "command registry schema/version/fixture mode is invalid");
  const policy = options.policy ? commandPolicy(options.policy) : fixtureMode ? commandFixturePolicy(registry) : commandPolicy();
  if (absoluteNormalized(registry.repository_root, "repository_root") !== policy.repositoryRoot) fail("REGISTRY_PATH", "repository_root is not authorized");
  const repositoryRoot = registry.repository_root;
  const operationRoot = registry.operation_root;
  const registryRoot = registry.registry_root;
  const runtimeRoot = registry.runtime_root;
  const evidenceRoot = registry.evidence_root;
  validateRoleRoots({ operation_root: operationRoot, registry_root: registryRoot, runtime_root: runtimeRoot, evidence_root: evidenceRoot }, options);
  exactArray(registry.environment_allowlist, COMMAND_ENV_ALLOWLIST, "environment_allowlist");
  if (!GIT_OID_PATTERN.test(registry.head_commit_oid) || !GIT_OID_PATTERN.test(registry.head_tree_oid)) fail("REGISTRY_SCHEMA", "head_commit_oid/head_tree_oid must be canonical lowercase Git OIDs");
  if ((options.headCommitOid !== undefined && registry.head_commit_oid !== options.headCommitOid) || (options.headTreeOid !== undefined && registry.head_tree_oid !== options.headTreeOid)) fail("REGISTRY_SCHEMA", "head_commit_oid/head_tree_oid do not equal the declared objects");
  exactArray(registry.live_pathspecs, options.livePathspecs ?? COMMAND_LIVE_PATHS, "live_pathspecs");
  exactArray(registry.tree_pathspecs, options.treePathspecs ?? COMMAND_TREE_PATHS, "tree_pathspecs");
  exactArray(registry.ignore_paths, options.ignorePaths ?? COMMAND_IGNORE_PATHS, "ignore_paths");
  if (!Array.isArray(registry.rows) || registry.rows.length !== 18) fail("REGISTRY_SCHEMA", "command registry must contain exactly 18 rows");
  const ids = new Set();
  const destinations = new Set();
  let timeoutTotal = 0;
  let bufferTotal = 0;
  for (const [index, row] of registry.rows.entries()) {
    exactKeys(row, COMMAND_ROW_KEYS, `row ${index + 1}`);
    if (row.ordinal !== index + 1 || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(row.id) || ids.has(row.id) || row.action !== "spawn" || !COMMAND_CAPABILITIES.has(row.capability_class)) fail("REGISTRY_SCHEMA", `row ${index + 1} identity/action/capability is invalid`);
    ids.add(row.id);
    absoluteNormalized(row.executable, `row ${row.ordinal} executable`);
    absoluteNormalized(row.cwd, `row ${row.ordinal} cwd`);
    if (row.cwd !== policy.repositoryRoot) fail("REGISTRY_PATH", `row ${row.ordinal} cwd is not the repository root`);
    if (!options.skipFilesystem) {
      safeExisting(row.executable, "file", `row ${row.ordinal} executable`, options.observations);
      safeExisting(row.cwd, "directory", `row ${row.ordinal} cwd`, options.observations);
    }
    if (!Array.isArray(row.argv) || row.argv.length === 0 || row.argv.some((arg) => typeof arg !== "string" || arg.length > 4096 || /[\0\r\n]/.test(arg))) fail("REGISTRY_CAPABILITY", `row ${row.ordinal} argv is invalid`);
    validateCommandEnvironment(row, registry, policy);
    const archiveRow = row.semantic.kind === "git-archive-tar/v1";
    const validatorRow = row.capability_class === "diagnostic-validator";
    if ((validatorRow || archiveRow ? row.timeout_ms > 120000 : row.timeout_ms !== 30000) || !isSafeInteger(row.timeout_ms, 1) || !isSafeInteger(row.max_buffer_bytes, 1) || row.max_buffer_bytes > 1048576) fail("REGISTRY_BOUNDS", `row ${row.ordinal} resource bounds are invalid`);
    if (!options.skipFilesystem && row.executable === policy.node && row.argv[0] !== "--version") safeExisting(row.argv[0], "file", `row ${row.ordinal} script`, options.observations);
    timeoutTotal += row.timeout_ms;
    bufferTotal += row.max_buffer_bytes * 2;
    exactKeys(row.expected, EXPECTED_KEYS, `row ${row.ordinal} expected`);
    if (row.expected.exit_code !== 0 || row.expected.signal !== null) fail("REGISTRY_EXPECTED", `row ${row.ordinal} process expectation is invalid`);
    exactKeys(row.semantic, SEMANTIC_KEYS, `row ${row.ordinal} semantic`);
    if (!COMMAND_SEMANTICS.has(row.semantic.kind) || row.semantic.parameters === null || typeof row.semantic.parameters !== "object" || Array.isArray(row.semantic.parameters)) fail("REGISTRY_SEMANTIC", `row ${row.ordinal} semantic is unknown`);
    validateStreamPolicy(row.expected.stdout_policy, row.semantic.kind, `row ${row.ordinal} stdout_policy`);
    validateStreamPolicy(row.expected.stderr_policy, row.semantic.kind, `row ${row.ordinal} stderr_policy`);
    requireDerivedSemanticPolicy(row);
    validateGitSemanticParameters(row.semantic.kind, row.semantic.parameters);
    exactKeys(row.evidence, EVIDENCE_KEYS, `row ${row.ordinal} evidence`);
    for (const [role, destination] of Object.entries(row.evidence)) {
      absoluteNormalized(destination, `row ${row.ordinal} evidence.${role}`);
      strictDescendant(evidenceRoot, destination, `row ${row.ordinal} evidence.${role}`);
      const destinationKey = canonicalPathKey(destination);
      if (destination.includes(`${path.sep}src${path.sep}sportsbook${path.sep}`) || destinations.has(destinationKey)) fail("REGISTRY_PATH", `row ${row.ordinal} evidence destination is unsafe or duplicated`);
      destinations.add(destinationKey);
    }
    if (!commandShape(row, registry, policy)) fail("REGISTRY_CAPABILITY", `row ${row.ordinal} tuple is not structurally authorized`);
  }
  if (timeoutTotal > 900000 || bufferTotal > 16777216) fail("REGISTRY_BOUNDS", "registry aggregate bounds exceeded");
  const archiveRow = registry.rows.find((row) => row.semantic.kind === "git-archive-tar/v1");
  if (archiveRow) strictDescendant(runtimeRoot, archiveRow.semantic.parameters.archive_path, "archive_path");
  exactKeys(registry.lifecycle, COMMAND_LIFECYCLE_KEYS, "registry lifecycle");
  const rowDestinations = registry.rows.flatMap((row) => Object.values(row.evidence));
  const lifecycleDestinations = Object.values(registry.lifecycle);
  for (const [role, destination] of Object.entries(registry.lifecycle)) {
    absoluteNormalized(destination, `registry lifecycle.${role}`);
    strictDescendant(evidenceRoot, destination, `registry lifecycle.${role}`);
    const key = canonicalPathKey(destination);
    if (destinations.has(key)) fail("REGISTRY_PATH", `registry lifecycle.${role} aliases another evidence destination`);
    destinations.add(key);
  }
  if (destinations.size !== 76) fail("REGISTRY_PATH", "registry must authorize exactly 76 unique destinations");
  return { registry, policy, destinations: [...rowDestinations, ...lifecycleDestinations], rowDestinations, lifecycleDestinations };
}

function decodeText(bytes, label) {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!Buffer.from(text).equals(bytes)) fail("SEMANTIC", `${label} is not canonical UTF-8`);
    return text;
  } catch (error) {
    if (error.code === "SEMANTIC") throw error;
    fail("SEMANTIC", `${label} is not UTF-8`);
  }
}

function exactSemanticParameters(value, keys, label) {
  exactKeys(value, keys, label);
  return value;
}

function decodeFramedText(stdout, stderr, label) {
  if (stderr.length !== 0 || stdout.length === 0 || stdout.at(-1) !== 10 || stdout.includes(13) || stdout.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) fail("SEMANTIC", `${label} stream framing mismatch`);
  return decodeText(stdout, `${label} stdout`);
}

function parseCanonicalPrettyJson(stdout, stderr, label) {
  const text = decodeFramedText(stdout, stderr, label);
  let value;
  try { value = JSON.parse(text); } catch { fail("SEMANTIC", `${label} is not one JSON document`); }
  if (`${JSON.stringify(value, null, 2)}\n` !== text) fail("SEMANTIC", `${label} is not canonical pretty JSON`);
  return value;
}

function validateRepositoryRelativePath(value, label, { excludeSportsbook = true } = {}) {
  if (typeof value !== "string" || value.length === 0 || /[\0\r\n\\]/.test(value) || value.startsWith("/") || value.startsWith("//") || /^[A-Za-z]:/.test(value) || /^[/\\]{2}[?.]/.test(value) || value.endsWith("/")) fail("SEMANTIC", `${label} is not a safe repository-relative path`);
  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === ".." || segment.normalize("NFKC") !== segment || DOS_DEVICE_PATTERN.test(segment.replace(/[ .]+$/g, "").split(".", 1)[0]))) fail("SEMANTIC", `${label} is noncanonical or unsafe`);
  if (path.posix.normalize(value) !== value || excludeSportsbook && (value === "src/sportsbook" || value.startsWith("src/sportsbook/"))) fail("SEMANTIC", `${label} escaped its repository ledger`);
  return value;
}

function rawNulRecords(bytes, label, { allowEmptyStream = false } = {}) {
  if (bytes.length === 0) {
    if (allowEmptyStream) return [];
    fail("SEMANTIC", `${label} must be nonempty`);
  }
  if (bytes.at(-1) !== 0) fail("SEMANTIC", `${label} is unterminated`);
  const records = [];
  let start = 0;
  for (let index = 0; index < bytes.length; index++) if (bytes[index] === 0) {
    if (index === start) fail("SEMANTIC", `${label} contains an empty record`);
    records.push(bytes.subarray(start, index));
    start = index + 1;
  }
  return records;
}

function validateRawReceipt(bytes, stderr, parameters, bytesKey = "bytes", shaKey = "sha256") {
  if (stderr.length !== 0 || bytes.length !== parameters[bytesKey] || sha256(bytes) !== parameters[shaKey]) fail("SEMANTIC", "Git raw stream receipt mismatch");
}

function validatePathLedger(paths, allowedPaths, ledgerPaths = allowedPaths) {
  if (new Set(paths).size !== paths.length || paths.some((item) => !ledgerPaths.includes(item))) fail("SEMANTIC", "Git path output escaped or duplicated its ledger");
  const current = paths.filter((item) => allowedPaths.includes(item));
  if (new Set(current).size !== allowedPaths.length || allowedPaths.some((item) => !current.includes(item))) fail("SEMANTIC", "Git path output did not exactly match allowed_paths");
}

function parseGitPorcelainZ(bytes, stderr, parameters) {
  exactSemanticParameters(parameters, ["framing", "allowed_statuses", "include_untracked", "include_ignored", "allowed_paths", "ledger_paths", "bytes", "sha256"], "git-porcelain-pathset/v1");
  if (parameters.framing !== "porcelain-v1-z/raw-bytes" || JSON.stringify(parameters.allowed_statuses) !== JSON.stringify(GIT_PORCELAIN_STATUSES) || typeof parameters.include_untracked !== "boolean" || typeof parameters.include_ignored !== "boolean") fail("SEMANTIC", "porcelain framing or status policy is invalid");
  const records = rawNulRecords(bytes, "porcelain-v1 -z output", { allowEmptyStream: parameters.allowed_paths.length === 0 });
  const result = [];
  const paths = [];
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    if (record.length < 4 || record[2] !== 32) fail("SEMANTIC", "porcelain primary record framing is invalid");
    const status = record.subarray(0, 2).toString("ascii");
    if (!parameters.allowed_statuses.includes(status) || status === "??" && !parameters.include_untracked || status === "!!" && !parameters.include_ignored) fail("SEMANTIC", "porcelain status is not authorized");
    const itemPath = validateRepositoryRelativePath(decodeText(record.subarray(3), "porcelain current path"), "porcelain current path");
    if (!parameters.allowed_paths.includes(itemPath)) fail("SEMANTIC", "porcelain current path escaped allowed_paths");
    let sourcePath;
    if (/[RC]/.test(status)) {
      const source = records[++index];
      if (!source || source.length >= 3 && source[2] === 32 && parameters.allowed_statuses.includes(source.subarray(0, 2).toString("ascii"))) fail("SEMANTIC", "porcelain rename/copy source is missing or framed as a primary record");
      sourcePath = validateRepositoryRelativePath(decodeText(source, "porcelain source path"), "porcelain source path");
      paths.push(itemPath, sourcePath);
    } else {
      paths.push(itemPath);
    }
    result.push({ status, path: itemPath, ...(sourcePath === undefined ? {} : { sourcePath }) });
  }
  validatePathLedger(paths, parameters.allowed_paths, parameters.ledger_paths);
  validateRawReceipt(bytes, stderr, parameters);
  return result;
}

function parseGitNameListZ(bytes, stderr, parameters) {
  exactSemanticParameters(parameters, ["framing", "allowed_paths", "bytes", "sha256"], "git-name-list/v1");
  if (parameters.framing !== "name-only-z/raw-bytes") fail("SEMANTIC", "name-only framing is invalid");
  const records = rawNulRecords(bytes, "name-only -z output", { allowEmptyStream: parameters.allowed_paths.length === 0 });
  const paths = records.map((record) => validateRepositoryRelativePath(decodeText(record, "name-only path"), "name-only path"));
  validatePathLedger(paths, parameters.allowed_paths);
  validateRawReceipt(bytes, stderr, parameters);
  return paths;
}

function parseGitLsTreeZ(bytes, stderr, parameters) {
  exactSemanticParameters(parameters, ["framing", "pathspecs", "inventory_bytes", "inventory_sha256"], "git-ls-tree-z/v1");
  if (parameters.framing !== "ls-tree-z/raw-bytes") fail("SEMANTIC", "ls-tree framing is invalid");
  const records = rawNulRecords(bytes, "ls-tree -z output");
  const inventory = records.map((record) => {
    const tab = record.indexOf(9);
    if (tab <= 0 || tab === record.length - 1 || record.indexOf(9, tab + 1) !== -1) fail("SEMANTIC", "ls-tree metadata/path boundary is invalid");
    const metadata = record.subarray(0, tab);
    if (!metadata.every((byte) => byte < 128)) fail("SEMANTIC", "ls-tree metadata is not ASCII");
    const match = metadata.toString("ascii").match(/^([0-7]{6}) (blob|tree) ([0-9a-f]{40})$/);
    if (!match) fail("SEMANTIC", "ls-tree metadata is malformed");
    const itemPath = validateRepositoryRelativePath(decodeText(record.subarray(tab + 1), "ls-tree path"), "ls-tree path", { excludeSportsbook: false });
    return { mode: match[1], type: match[2], oid: match[3], path: itemPath };
  });
  const paths = inventory.map((entry) => entry.path);
  if (new Set(paths).size !== paths.length || JSON.stringify([...paths].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)))) !== JSON.stringify(paths) || paths.some((item) => !parameters.pathspecs.some((root) => item === root || item.startsWith(`${root}/`)))) fail("SEMANTIC", "ls-tree inventory mismatch");
  validateRawReceipt(bytes, stderr, parameters, "inventory_bytes", "inventory_sha256");
  return inventory;
}

export function validateCommandSemantic(kind, stdout, stderr, parameters, context = {}) {
  const out = Buffer.from(stdout);
  const err = Buffer.from(stderr);
  if (kind.startsWith("version-")) {
    exactSemanticParameters(parameters, ["expected"], kind);
    if (decodeText(out, "version stdout") !== `${parameters.expected}\n` || err.length !== 0) fail("SEMANTIC", `${kind} output mismatch`);
    return { status: "PASS", value: parameters.expected };
  }
  if (kind === "git-head-oid/v1") {
    exactSemanticParameters(parameters, ["head_commit_oid"], kind);
    if (decodeText(out, "HEAD stdout") !== `${parameters.head_commit_oid}\n` || err.length !== 0) fail("SEMANTIC", "HEAD output mismatch");
    return { status: "PASS", value: parameters.head_commit_oid };
  }
  if (["validator-plan-json-clean/v1", "validator-phase-json-clean/v1", "validator-umbrella-json-clean/v1"].includes(kind)) {
    exactSemanticParameters(parameters, ["argv_path", "target_path"], kind);
    const value = parseCanonicalPrettyJson(out, err, kind);
    exactKeys(value, ["checkedPlans", "strict", "warnings", "failures"], kind);
    if (!Array.isArray(value.checkedPlans) || value.checkedPlans.length !== 1 || value.strict !== true || !Array.isArray(value.warnings) || value.warnings.length !== 0 || !Array.isArray(value.failures) || value.failures.length !== 0) fail("SEMANTIC", `${kind} summary is not clean`);
    const checked = value.checkedPlans[0];
    exactKeys(checked, ["path", "failures", "warnings", "lines"], `${kind} checked plan`);
    if (checked.path !== parameters.target_path || checked.failures !== 0 || checked.warnings !== 0 || !Number.isSafeInteger(checked.lines) || checked.lines <= 0) fail("SEMANTIC", `${kind} checked plan mismatch`);
    return { status: "PASS", value };
  }
  if (kind === "validator-goal-pass-line/v1") {
    exactSemanticParameters(parameters, ["goal", "lane"], kind);
    const text = decodeFramedText(out, err, "goal validator");
    if (!["quick", "fast", "full", "absent"].includes(parameters.lane) || text !== `PASS: ${parameters.goal} — all required fields present, LANE field: ${parameters.lane}\n`) fail("SEMANTIC", "goal validator output mismatch");
    return { status: "PASS", value: parameters.lane };
  }
  if (kind === "validator-envelope-json-clean/v1") {
    exactSemanticParameters(parameters, ["selected_plan", "authority_class", "mode", "proof_path", "scope_count", "stop_condition_count", "artifact_receipt_schema_version", "artifact_destination_count"], kind);
    const value = parseCanonicalPrettyJson(out, err, kind);
    exactKeys(value, ["schema", "status", "authorityClass", "selected_plan", "mode", "proof_path", "scope_count", "stop_condition_count", "artifact_receipt_schema_version", "artifact_destination_count"], kind);
    const expected = { schema: "execution-authority-validation/v1", status: "PASS", authorityClass: parameters.authority_class, selected_plan: parameters.selected_plan, mode: parameters.mode, proof_path: parameters.proof_path, scope_count: parameters.scope_count, stop_condition_count: parameters.stop_condition_count, artifact_receipt_schema_version: parameters.artifact_receipt_schema_version, artifact_destination_count: parameters.artifact_destination_count };
    if (JSON.stringify(value) !== JSON.stringify(expected) || value.artifact_destination_count !== value.scope_count) fail("SEMANTIC", "envelope validator output mismatch");
    return { status: "PASS", value };
  }
  if (kind === "git-porcelain-pathset/v1") return { status: "PASS", records: parseGitPorcelainZ(out, err, parameters) };
  if (kind === "git-name-list/v1") return { status: "PASS", paths: parseGitNameListZ(out, err, parameters) };
  if (kind === "git-diff-check-clean/v1") {
    exactSemanticParameters(parameters, [], kind);
    if (out.length || err.length) fail("SEMANTIC", "git diff check must be silent");
    return { status: "PASS" };
  }
  if (kind === "git-check-ignore-exact/v1") {
    exactSemanticParameters(parameters, ["expected_line"], kind);
    if (decodeText(out, "check-ignore stdout") !== `${parameters.expected_line}\n` || err.length) fail("SEMANTIC", "check-ignore output mismatch");
    return { status: "PASS" };
  }
  if (kind === "git-ls-tree-z/v1") return { status: "PASS", inventory: parseGitLsTreeZ(out, err, parameters) };
  if (kind === "git-archive-tar/v1") {
    exactSemanticParameters(parameters, ["archive_path", "inventory"], kind);
    if (out.length || err.length) fail("SEMANTIC", "git archive streams must be empty");
    const item = fs.lstatSync(parameters.archive_path, { bigint: true });
    if (!item.isFile() || item.isSymbolicLink() || fs.realpathSync.native(parameters.archive_path) !== parameters.archive_path) fail("SEMANTIC", "archive output identity is unsafe");
    const entries = parseTarEntries(fs.readFileSync(parameters.archive_path));
    const files = entries.filter((entry) => !entry.name.endsWith("/"));
    if (JSON.stringify(files.map((entry) => entry.name)) !== JSON.stringify(parameters.inventory.map((entry) => entry.path)) || files.some((entry, index) => entry.size !== parameters.inventory[index].size && parameters.inventory[index].size !== undefined)) fail("SEMANTIC", "archive inventory mismatch");
    return { status: "PASS", inventory: parameters.inventory };
  }
  fail("REGISTRY_SEMANTIC", `unknown semantic kind ${kind}`);
}

function commandTerminal(row, child, stdout, stderr, semanticStatus, semanticCode, receiptCount, startedAt, finishedAt) {
  return { schema: TERMINAL_SCHEMA, attemptId: "command-registry", commandId: row.id, ordinal: row.ordinal, startedAt, finishedAt, childExitCode: child?.status ?? null, childSignal: child?.signal ?? null, spawnError: child?.error ? String(child.error.code ?? child.error.message ?? child.error) : null, timedOut: child?.error?.code === "ETIMEDOUT", stdoutBytes: stdout.length, stdoutSha256: sha256(stdout), stderrBytes: stderr.length, stderrSha256: sha256(stderr), rowReceiptCount: receiptCount, rowReceiptSha256: sha256(Buffer.from(JSON.stringify(receiptCount))), semanticStatus, semanticCode };
}

function validateRuntimeLedger(value, runtimeRoot) {
  if (!Array.isArray(value)) fail("SCHEMA", "runtime cleanup ledger must be an array");
  const seen = new Set();
  for (const [index, entry] of value.entries()) {
    exactKeys(entry, RUNTIME_LEDGER_KEYS, `runtime cleanup ledger[${index}]`);
    if (entry.ordinal !== index + 1 || !RUNTIME_ROLES.has(entry.role) || !["unlink", "rmdir"].includes(entry.operation)) fail("SCHEMA", `runtime cleanup ledger[${index}] ordinal, role, or operation is invalid`);
    absoluteNormalized(entry.path, `runtime cleanup ledger[${index}].path`);
    const relative = path.relative(runtimeRoot, entry.path);
    if (entry.role === "runtime-root" ? entry.path !== runtimeRoot : !relative || relative.startsWith("..") || path.isAbsolute(relative)) fail("CLEANUP_SCOPE", `runtime cleanup ledger[${index}] escapes runtime_root`);
    const expectedOperation = entry.role.endsWith("directory") || entry.role === "runtime-root" ? "rmdir" : "unlink";
    if (entry.operation !== expectedOperation || seen.has(canonicalPathKey(entry.path))) fail("SCHEMA", `runtime cleanup ledger[${index}] operation or path is invalid`);
    validateIdentityValue(entry.identity, `runtime cleanup ledger[${index}].identity`);
    seen.add(canonicalPathKey(entry.path));
  }
  const rootEntries = value.filter((entry) => entry.role === "runtime-root");
  if (value.length > 0 && (rootEntries.length !== 1 || value.at(-1)?.role !== "runtime-root")) fail("SCHEMA", "runtime-root must be the single final cleanup target");
  for (const [index, entry] of value.entries()) {
    if (entry.role === "runtime-root") continue;
    const parent = path.dirname(entry.path);
    const parentIndex = value.findIndex((candidate) => candidate.path === parent && ["home-directory", "stream-directory", "temporary-directory", "runtime-root"].includes(candidate.role));
    if (parentIndex === -1 || parentIndex <= index) fail("SCHEMA", `runtime cleanup ledger[${index}] parent is missing or not children-first`);
  }
  return value;
}

function validateCommandResult(value, runtimeRoot) {
  const failed = value?.status === "FAIL";
  exactKeys(value, failed ? COMMAND_RESULT_FAIL_KEYS : COMMAND_RESULT_PASS_KEYS, "command result");
  if (!isSafeInteger(value.completedRowCount) || !Array.isArray(value.receipts) || value.completedRowCount !== value.receipts.length) fail("SCHEMA", "command result completedRowCount must equal receipts length");
  validateRuntimeLedger(value.cleanupTargets, runtimeRoot);
  for (const [index, receipt] of value.receipts.entries()) {
    exactKeys(receipt, COMMAND_RECEIPT_KEYS, `command result receipts[${index}]`);
    if (receipt.ordinal !== index + 1 || !isNonEmptyText(receipt.id) || receipt.status !== "PASS" || !isSafeInteger(receipt.stdoutBytes) || !isHash(receipt.stdoutSha256) || !isSafeInteger(receipt.stderrBytes) || !isHash(receipt.stderrSha256)) fail("SCHEMA", `command result receipts[${index}] is invalid`);
  }
  validateTerminal(value.terminal);
  if (!failed) {
    if (value.status !== "PASS" || value.completedRowCount !== 18 || value.terminal.ordinal !== 18 || value.terminal.semanticStatus !== "PASS") fail("SCHEMA", "PASS command result must close all 18 rows");
    return value;
  }
  exactKeys(value.failure, COMMAND_FAILURE_KEYS, "command failure");
  const failure = value.failure;
  if (failure.ordinal !== value.completedRowCount + 1 || !isNonEmptyText(failure.id) || failure.semanticStatus !== "FAIL" || !isNonEmptyText(failure.semanticCode) || !COMMAND_SEMANTIC_CODES.has(failure.semanticCode) && failure.primaryError.code !== failure.semanticCode || value.terminal.ordinal !== failure.ordinal || value.terminal.semanticStatus !== "FAIL") fail("SCHEMA", "FAIL command result prefix or terminal binding is invalid");
  if (failure.childExitCode !== null && !isSafeInteger(failure.childExitCode) || failure.childSignal !== null && !isNonEmptyText(failure.childSignal) || failure.spawnError !== null && !isNonEmptyText(failure.spawnError) || typeof failure.timedOut !== "boolean") fail("SCHEMA", "command failure child observation is invalid");
  for (const key of ["stdoutBytes", "stderrBytes"]) if (!isSafeInteger(failure[key])) fail("SCHEMA", `command failure ${key} is invalid`);
  for (const key of ["stdoutSha256", "stderrSha256"]) if (!isHash(failure[key])) fail("SCHEMA", `command failure ${key} is invalid`);
  if (failure.failingStream !== null && !["stdout", "stderr"].includes(failure.failingStream) || (failure.semanticCode === "STREAM_POLICY") !== (failure.failingStream !== null)) fail("SCHEMA", "command failure stream relationship is invalid");
  validateError(failure.primaryError, "command failure primaryError", false);
  return value;
}

function captureRuntimeTarget(role, target, operation) {
  const item = fs.lstatSync(target, { bigint: true });
  if (item.isSymbolicLink() || operation === "unlink" && !item.isFile() || operation === "rmdir" && !item.isDirectory()) fail("IDENTITY", `runtime ledger target type is invalid: ${target}`);
  return { role, path: target, operation, identity: identity(item) };
}

function beginCommandRuntimeLedger(registry) {
  const homes = [...new Set(registry.rows.map((row) => row.env.HOME))];
  const files = [];
  const deferredDirectories = [];
  for (const target of homes) {
    fs.mkdirSync(target);
    deferredDirectories.push(captureRuntimeTarget("home-directory", target, "rmdir"));
    const homeFile = path.join(target, ".repository-diagnostic-home");
    fs.writeFileSync(homeFile, "isolated\n", { flag: "wx", mode: 0o600 });
    files.push(captureRuntimeTarget("home-file", homeFile, "unlink"));
  }
  const streamDirectory = path.join(registry.runtime_root, "streams");
  fs.mkdirSync(streamDirectory);
  deferredDirectories.push(captureRuntimeTarget("stream-directory", streamDirectory, "rmdir"));
  const temporaryDirectory = path.join(registry.runtime_root, "temporary");
  fs.mkdirSync(temporaryDirectory);
  deferredDirectories.push(captureRuntimeTarget("temporary-directory", temporaryDirectory, "rmdir"));
  const temporaryChildDirectory = path.join(temporaryDirectory, "nested");
  fs.mkdirSync(temporaryChildDirectory);
  deferredDirectories.push(captureRuntimeTarget("temporary-directory", temporaryChildDirectory, "rmdir"));
  const temporaryFile = path.join(temporaryChildDirectory, "operation.tmp");
  fs.writeFileSync(temporaryFile, "runtime\n", { flag: "wx", mode: 0o600 });
  files.push(captureRuntimeTarget("temporary-file", temporaryFile, "unlink"));
  return {
    files,
    directories: deferredDirectories,
    root: captureRuntimeTarget("runtime-root", registry.runtime_root, "rmdir"),
    streamDirectory,
  };
}

function appendRuntimeFile(state, role, target) {
  state.files.push(captureRuntimeTarget(role, target, "unlink"));
}

function commandRuntimeLedger(registry, state) {
  if (!state) return [];
  const directories = [...state.directories].sort((left, right) => right.path.split(path.sep).length - left.path.split(path.sep).length || left.path.localeCompare(right.path));
  const entries = [...state.files, ...directories, state.root].map((entry, index) => ({ ordinal: index + 1, ...entry }));
  return validateRuntimeLedger(entries, registry.runtime_root);
}

export function executeCommandRegistry(registry, options = {}) {
  const validated = validateCommandRegistry(registry, options);
  if (!options.skipFilesystem) requireTrustedGitHead(registry);
  const spawn = options.spawn ?? spawnSync;
  const semantic = options.semantic ?? validateCommandSemantic;
  const receipts = [];
  const evidenceRoot = registry.evidence_root;
  const persist = options.persistEvidence !== false;
  let runtimeState = null;
  if (persist) {
    for (const destination of validated.destinations) if (fs.existsSync(destination)) fail("EEXIST", `evidence destination already exists: ${destination}`);
    const archiveRow = registry.rows.find((row) => row.semantic.kind === "git-archive-tar/v1");
    if (archiveRow && fs.existsSync(archiveRow.semantic.parameters.archive_path)) fail("EEXIST", "archive destination already exists");
    runtimeState = beginCommandRuntimeLedger(registry);
  }
  for (const row of registry.rows) {
    const startedAt = new Date().toISOString();
    let child = null;
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let semanticCode = null;
    let failingStream = null;
    let primaryError = null;
    try {
      if (persist) createEvidenceArtifact(row.evidence.pre_receipt, Buffer.from(`${JSON.stringify({ schema: "repository-diagnostic-row-pre/v1", ordinal: row.ordinal, id: row.id, startedAt })}\n`), { evidenceRoot, artifactSchemaVersion: "repository-diagnostic-row-pre/v1", closedKeys: ["schema", "ordinal", "id", "startedAt"], authorityFreeze: options.authorityFreeze, authorityOptions: options.authorityOptions });
      child = guardedEffect("B02", options.authorityFreeze, options.authorityOptions ?? {}, options.effects?.spawn, () => spawn(row.executable, row.argv, { cwd: row.cwd, env: Object.assign(Object.create(null), row.env), shell: false, encoding: null, timeout: row.timeout_ms, maxBuffer: row.max_buffer_bytes, killSignal: "SIGTERM", windowsHide: true }));
      stdout = Buffer.from(child.stdout ?? Buffer.alloc(0));
      stderr = Buffer.from(child.stderr ?? Buffer.alloc(0));
      if (persist) {
        const streamPrefix = String(row.ordinal).padStart(2, "0");
        const runtimeStdout = path.join(runtimeState.streamDirectory, `${streamPrefix}-stdout.bin`);
        const runtimeStderr = path.join(runtimeState.streamDirectory, `${streamPrefix}-stderr.bin`);
        fs.writeFileSync(runtimeStdout, stdout, { flag: "wx", mode: 0o600 });
        appendRuntimeFile(runtimeState, "stream-file", runtimeStdout);
        fs.writeFileSync(runtimeStderr, stderr, { flag: "wx", mode: 0o600 });
        appendRuntimeFile(runtimeState, "stream-file", runtimeStderr);
        createEvidenceArtifact(row.evidence.stdout_receipt, stdout, { evidenceRoot, artifactSchemaVersion: "repository-diagnostic-stdout/v1", closedKeys: null, authorityFreeze: options.authorityFreeze, authorityOptions: options.authorityOptions });
        createEvidenceArtifact(row.evidence.stderr_receipt, stderr, { evidenceRoot, artifactSchemaVersion: "repository-diagnostic-stderr/v1", closedKeys: null, authorityFreeze: options.authorityFreeze, authorityOptions: options.authorityOptions });
      }
      semanticCode = child.error?.code === "ETIMEDOUT" ? "TIMEOUT" : child.error ? "SPAWN" : child.signal !== row.expected.signal ? "SIGNAL" : child.status !== row.expected.exit_code ? "EXIT" : stdout.length > row.max_buffer_bytes || stderr.length > row.max_buffer_bytes ? "OUTPUT_OVERFLOW" : null;
      if (semanticCode) fail(semanticCode, `row ${row.ordinal} process expectation failed`);
      for (const [bytes, policy, label] of [[stdout, row.expected.stdout_policy, "stdout"], [stderr, row.expected.stderr_policy, "stderr"]]) if (bytes.length !== policy.bytes || sha256(bytes) !== policy.sha256) {
        semanticCode = "STREAM_POLICY";
        failingStream = label;
        fail(semanticCode, `row ${row.ordinal} ${label} receipt mismatch`);
      }
      semantic(row.semantic.kind, stdout, stderr, row.semantic.parameters, { registry, validated, receipts });
    } catch (error) {
      semanticCode ??= String(error.code ?? "SEMANTIC");
      primaryError = errorRecord(error, "execution");
    }
    if (persist && row.semantic.kind === "git-archive-tar/v1" && fs.existsSync(row.semantic.parameters.archive_path)) appendRuntimeFile(runtimeState, "archive-file", row.semantic.parameters.archive_path);
    const finishedAt = new Date().toISOString();
    if (primaryError) {
      const terminal = commandTerminal(row, child, stdout, stderr, "FAIL", semanticCode, receipts.length, startedAt, finishedAt);
      const failure = { ordinal: row.ordinal, id: row.id, childExitCode: child?.status ?? null, childSignal: child?.signal ?? null, spawnError: child?.error ? String(child.error.code ?? child.error.message ?? child.error) : null, timedOut: child?.error?.code === "ETIMEDOUT", stdoutBytes: stdout.length, stdoutSha256: sha256(stdout), stderrBytes: stderr.length, stderrSha256: sha256(stderr), semanticStatus: "FAIL", semanticCode, failingStream, primaryError };
      return validateCommandResult({ status: "FAIL", completedRowCount: receipts.length, receipts, failure, terminal, cleanupTargets: commandRuntimeLedger(registry, runtimeState) }, registry.runtime_root);
    }
    const receipt = { ordinal: row.ordinal, id: row.id, stdoutBytes: stdout.length, stdoutSha256: sha256(stdout), stderrBytes: stderr.length, stderrSha256: sha256(stderr), status: "PASS" };
    receipts.push(receipt);
    if (persist) createEvidenceArtifact(row.evidence.post_receipt, Buffer.from(`${JSON.stringify({ schema: "repository-diagnostic-row-post/v1", ...receipt })}\n`), { evidenceRoot, artifactSchemaVersion: "repository-diagnostic-row-post/v1", closedKeys: ["schema", ...COMMAND_RECEIPT_KEYS], authorityFreeze: options.authorityFreeze, authorityOptions: options.authorityOptions });
  }
  const row = registry.rows.at(-1);
  const receipt = receipts.at(-1);
  const timestamp = new Date().toISOString();
  const terminal = { schema: TERMINAL_SCHEMA, attemptId: "command-registry", commandId: row.id, ordinal: row.ordinal, startedAt: timestamp, finishedAt: timestamp, childExitCode: 0, childSignal: null, spawnError: null, timedOut: false, stdoutBytes: receipt.stdoutBytes, stdoutSha256: receipt.stdoutSha256, stderrBytes: receipt.stderrBytes, stderrSha256: receipt.stderrSha256, rowReceiptCount: receipts.length, rowReceiptSha256: sha256(Buffer.from(JSON.stringify(receipts))), semanticStatus: "PASS", semanticCode: "OK" };
  return validateCommandResult({ status: "PASS", completedRowCount: receipts.length, receipts, terminal, cleanupTargets: commandRuntimeLedger(registry, runtimeState) }, registry.runtime_root);
}

function commandResultChecks() {
  const fixture = commandRegistryFixture();
  const options = { policy: fixture.policy, skipFilesystem: true, headCommitOid: fixture.registry.head_commit_oid, headTreeOid: fixture.registry.head_tree_oid, persistEvidence: false };
  let spawnIndex = 0;
  const pass = executeCommandRegistry(fixture.registry, { ...options, spawn: () => ({ status: 0, signal: null, ...fixture.fixtureOutputs[spawnIndex++] }), semantic: () => ({ status: "PASS" }) });
  const chrome = Buffer.from("Google Chrome for Testing 151.0.7922.34 \n", "ascii");
  spawnIndex = 0;
  const failResult = executeCommandRegistry(fixture.registry, { ...options, spawn: () => ({ status: 0, signal: null, stdout: spawnIndex === 4 ? chrome : fixture.fixtureOutputs[spawnIndex].stdout, stderr: fixture.fixtureOutputs[spawnIndex++].stderr }), semantic: () => ({ status: "PASS" }) });
  if (Object.keys(pass).join() !== COMMAND_RESULT_PASS_KEYS.join() || Object.keys(failResult).join() !== COMMAND_RESULT_FAIL_KEYS.join()) fail("SELF_CHECK", "command result closed keys drifted");
  const expectedFailure = { completedRowCount: 4, ordinal: 5, childExitCode: 0, childSignal: null, spawnError: null, timedOut: false, stdoutBytes: 41, stdoutSha256: "2d44e8c7507ca1c7cefc2fff277ee234d5d87be645dd56bee1b3ffca6564e529", stderrBytes: 0, stderrSha256: sha256(Buffer.alloc(0)), semanticStatus: "FAIL", semanticCode: "STREAM_POLICY", failingStream: "stdout" };
  for (const [key, value] of Object.entries(expectedFailure)) if ((key === "completedRowCount" ? failResult[key] : failResult.failure[key]) !== value) fail("SELF_CHECK", `attempt-17 failure ${key} drifted`);
  if (failResult.failure.id !== "CMD-TOOL-05" || failResult.failure.primaryError.stage !== "execution" || failResult.failure.primaryError.code !== "STREAM_POLICY" || spawnIndex !== 5) fail("SELF_CHECK", "attempt-17 failure identity or stop boundary drifted");
  const checks = [
    { name: "command-result-pass-closed", status: "PASS" },
    { name: "command-result-fail-closed", status: "PASS" },
    { name: "command-result-pass-18-prefix", status: "PASS" },
    { name: "command-result-fail-4-prefix", status: "PASS" },
    { name: "command-result-fail-no-later-spawn", status: "PASS" },
    { name: "command-result-terminal-pass-row-18", status: "PASS" },
    { name: "command-result-terminal-fail-row-5", status: "PASS" },
    { name: "command-result-failure-tool05", status: "PASS" },
    { name: "command-result-failure-child-exit", status: "PASS" },
    { name: "command-result-failure-child-signal", status: "PASS" },
    { name: "command-result-failure-spawn-error", status: "PASS" },
    { name: "command-result-failure-timeout", status: "PASS" },
    { name: "command-result-failure-stdout-bytes", status: "PASS" },
    { name: "command-result-failure-stdout-sha", status: "PASS" },
    { name: "command-result-failure-stderr-bytes", status: "PASS" },
    { name: "command-result-failure-stderr-sha", status: "PASS" },
    { name: "command-result-failure-semantic-status", status: "PASS" },
    { name: "command-result-failure-semantic-code", status: "PASS" },
    { name: "command-result-failure-stream", status: "PASS" },
    { name: "command-result-primary-stage", status: "PASS" },
    { name: "command-result-primary-code", status: "PASS" },
    ...COMMAND_RESULT_PASS_KEYS.filter((key) => key !== "cleanupTargets").map((key) => expectReject(`command-result-pass-extra-before-${key}`, () => validateCommandResult({ extra: true, ...pass }, fixture.registry.runtime_root), "SCHEMA")),
    ...COMMAND_RESULT_FAIL_KEYS.filter((key) => key !== "cleanupTargets").map((key) => expectReject(`command-result-fail-extra-before-${key}`, () => validateCommandResult({ extra: true, ...failResult }, fixture.registry.runtime_root), "SCHEMA")),
    expectReject("command-result-fail-count-drift", () => validateCommandResult({ ...failResult, completedRowCount: 3 }, fixture.registry.runtime_root), "SCHEMA"),
    expectReject("command-result-fail-stream-null", () => validateCommandResult({ ...failResult, failure: { ...failResult.failure, failingStream: null } }, fixture.registry.runtime_root), "SCHEMA"),
  ];
  if (checks.length !== 32) fail("SELF_CHECK", `command result contract checks failed: ${checks.length}`);
  return checks;
}

function tarHeader(name, size, type = "0", rawSize = null) {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  if (rawSize) rawSize.copy(header, 124, 0, Math.min(rawSize.length, 12));
  else header.write(size.toString(8).padStart(11, "0") + "\0", 124, 12, "ascii");
  header.write(type, 156, 1, "ascii");
  return header;
}

function tarArchive(entries, zeroBlocks = 2) {
  const chunks = [];
  for (const entry of entries) {
    chunks.push(tarHeader(entry.name, entry.data.length, entry.type));
    chunks.push(entry.data, Buffer.alloc(Math.ceil(entry.data.length / 512) * 512 - entry.data.length));
  }
  chunks.push(Buffer.alloc(zeroBlocks * 512));
  return Buffer.concat(chunks);
}

function sampleTerminal(status = "PASS") {
  return { schema: TERMINAL_SCHEMA, attemptId: "fixture-attempt", commandId: "CMD-DIAG-01", ordinal: 1, startedAt: "2026-09-03T00:00:00.000Z", finishedAt: "2026-09-03T00:00:01.000Z", childExitCode: status === "PASS" ? 0 : 1, childSignal: null, spawnError: null, timedOut: false, stdoutBytes: 3, stdoutSha256: sha256(Buffer.from("out")), stderrBytes: 3, stderrSha256: sha256(Buffer.from("err")), rowReceiptCount: 1, rowReceiptSha256: sha256(Buffer.from("row")), semanticStatus: status, semanticCode: status === "PASS" ? "OK" : "SEMANTIC_FAILURE" };
}

function expectReject(name, fn, code) {
  try {
    fn();
  } catch (error) {
    if (!code || error.code === code) return { name, status: "PASS", code: error.code };
    throw error;
  }
  fail("SELF_CHECK", `${name} did not reject`);
}

function sampleError(stage = "execution") {
  return { stage, code: "FIXTURE_ERROR", message: "fixture failure" };
}

function schemaMutationChecks() {
  const checks = [];
  const mutate = (value, key, replacement) => ({ ...value, [key]: replacement });
  const addMatrix = (label, validator, baseline, mutations) => {
    for (const [field, replacement] of mutations) checks.push(expectReject(`schema-mutation-${label}-${field}`, () => validator(mutate(baseline, field, replacement)), "SCHEMA"));
  };
  const terminal = sampleTerminal();
  addMatrix("terminal", validateTerminal, terminal, [
    ["schema", "phase02-executor-terminal/v2"], ["attemptId", ""], ["commandId", ""], ["ordinal", 0], ["startedAt", "invalid"], ["finishedAt", "2026-09-02T23:59:59.999Z"], ["childExitCode", 256], ["childSignal", 7], ["spawnError", 7], ["timedOut", 0], ["stdoutBytes", -1], ["stdoutSha256", "A".repeat(64)], ["stderrBytes", Number.MAX_SAFE_INTEGER + 1], ["stderrSha256", "x"], ["rowReceiptCount", -1], ["rowReceiptSha256", "x"], ["semanticStatus", "UNKNOWN"], ["semanticCode", ""],
  ]);
  checks.push(expectReject("schema-relationship-terminal-row-count", () => validateTerminal(mutate(terminal, "rowReceiptCount", 2)), "SCHEMA"));
  checks.push(expectReject("schema-relationship-terminal-pass-child", () => validateTerminal(mutate(terminal, "childExitCode", 1)), "SCHEMA"));
  const result = { schema: RESULT_SCHEMA, attemptId: "fixture-attempt", status: "PASS", terminalArtifactPath: "terminal.json", terminalArtifactSha256: "a".repeat(64), completedRowCount: 1, evidenceFileCount: 1, evidenceByteCount: 1, evidenceManifestSha256: "b".repeat(64), publishedBeforeCleanup: true };
  addMatrix("result", validatePublication, result, [["schema", "wrong/v1"], ["attemptId", ""], ["status", "FAIL"], ["terminalArtifactPath", ""], ["terminalArtifactSha256", null], ["completedRowCount", -1], ["evidenceFileCount", -1], ["evidenceByteCount", -1], ["evidenceManifestSha256", "A".repeat(64)], ["publishedBeforeCleanup", false]]);
  checks.push(expectReject("schema-relationship-result-count", () => validatePublication(mutate(result, "completedRowCount", 2)), "SCHEMA"));
  checks.push(expectReject("schema-relationship-result-empty-bytes", () => validatePublication({ ...result, completedRowCount: 0, evidenceFileCount: 0, evidenceByteCount: 1 }), "SCHEMA"));
  const failure = { schema: FAILURE_SCHEMA, attemptId: "fixture-attempt", status: "FAIL", stage: "execution", primaryError: sampleError(), secondaryErrors: [sampleError("persistence")], terminalArtifactPath: "terminal.json", terminalArtifactSha256: null, completedRowCount: 0, evidenceFileCount: 0, evidenceByteCount: 0, evidenceManifestSha256: "b".repeat(64), publicationAttemptedBeforeCleanup: true };
  addMatrix("failure", validatePublication, failure, [["schema", "wrong/v1"], ["attemptId", ""], ["status", "PASS"], ["stage", ""], ["primaryError", null], ["secondaryErrors", null], ["terminalArtifactPath", ""], ["terminalArtifactSha256", "A".repeat(64)], ["completedRowCount", -1], ["evidenceFileCount", -1], ["evidenceByteCount", -1], ["evidenceManifestSha256", "A".repeat(64)], ["publicationAttemptedBeforeCleanup", false]]);
  for (const field of ERROR_KEYS) checks.push(expectReject(`schema-mutation-failure-primary-error-${field}`, () => validatePublication({ ...failure, primaryError: { ...failure.primaryError, [field]: "" } }), "SCHEMA"));
  for (const field of ERROR_KEYS) checks.push(expectReject(`schema-mutation-failure-secondary-error-${field}`, () => validatePublication({ ...failure, secondaryErrors: [{ ...failure.secondaryErrors[0], [field]: "" }] }), "SCHEMA"));
  const identityValue = { dev: "1", ino: "2", modeType: String(fs.constants.S_IFREG) };
  const operation = { ordinal: 1, operation: "unlink", path: "runtime.tmp", expectedIdentity: identityValue, observedIdentity: identityValue, result: "REMOVED", error: null };
  const residue = { path: "runtime.tmp", observedIdentity: identityValue, reason: "retained" };
  const cleanup = { schema: CLEANUP_SCHEMA, attemptId: "fixture-attempt", status: "PASS", primaryError: null, secondaryErrors: [], terminalArtifactPath: "terminal.json", resultOrFailureArtifactPath: "result.json", cleanupStartedAfterPublicationAttempt: true, operations: [operation], residue: [], manualCleanupRequired: false };
  addMatrix("cleanup", validateCleanup, cleanup, [["schema", "wrong/v1"], ["attemptId", ""], ["status", "UNKNOWN"], ["primaryError", {}], ["secondaryErrors", null], ["terminalArtifactPath", ""], ["resultOrFailureArtifactPath", ""], ["cleanupStartedAfterPublicationAttempt", false], ["operations", null], ["residue", null], ["manualCleanupRequired", "false"]]);
  for (const [field, replacement] of [["ordinal", 2], ["operation", "rename"], ["path", ""], ["expectedIdentity", {}], ["observedIdentity", {}], ["result", "UNKNOWN"], ["error", {}]]) checks.push(expectReject(`schema-mutation-cleanup-operation-${field}`, () => validateCleanup({ ...cleanup, operations: [{ ...operation, [field]: replacement }] }), "SCHEMA"));
  for (const identityField of ["expectedIdentity", "observedIdentity"]) for (const field of IDENTITY_KEYS) checks.push(expectReject(`schema-mutation-cleanup-operation-${identityField}-${field}`, () => validateCleanup({ ...cleanup, operations: [{ ...operation, [identityField]: { ...identityValue, [field]: "01" } }] }), "SCHEMA"));
  for (const field of ERROR_KEYS) checks.push(expectReject(`schema-mutation-cleanup-operation-error-${field}`, () => validateCleanup({ ...cleanup, operations: [{ ...operation, result: "FAILED", error: { ...sampleError("cleanup"), [field]: "" } }] }), "SCHEMA"));
  for (const [field, replacement] of [["path", ""], ["observedIdentity", {}], ["reason", ""]]) checks.push(expectReject(`schema-mutation-cleanup-residue-${field}`, () => validateCleanup({ ...cleanup, status: "FAIL", primaryError: sampleError("cleanup"), residue: [{ ...residue, [field]: replacement }], manualCleanupRequired: true }), "SCHEMA"));
  for (const field of IDENTITY_KEYS) checks.push(expectReject(`schema-mutation-cleanup-residue-observedIdentity-${field}`, () => validateCleanup({ ...cleanup, status: "FAIL", primaryError: sampleError("cleanup"), residue: [{ ...residue, observedIdentity: { ...identityValue, [field]: "01" } }], manualCleanupRequired: true }), "SCHEMA"));
  for (const field of ERROR_KEYS) checks.push(expectReject(`schema-mutation-cleanup-primary-error-${field}`, () => validateCleanup({ ...cleanup, status: "FAIL", primaryError: { ...sampleError("cleanup"), [field]: "" }, residue: [residue], manualCleanupRequired: true }), "SCHEMA"));
  for (const field of ERROR_KEYS) checks.push(expectReject(`schema-mutation-cleanup-secondary-error-${field}`, () => validateCleanup({ ...cleanup, secondaryErrors: [{ ...sampleError("cleanup"), [field]: "" }] }), "SCHEMA"));
  checks.push(expectReject("schema-relationship-cleanup-result-error", () => validateCleanup({ ...cleanup, operations: [{ ...operation, error: sampleError("cleanup") }] }), "SCHEMA"));
  checks.push(expectReject("schema-relationship-cleanup-residue-status", () => validateCleanup({ ...cleanup, residue: [residue] }), "SCHEMA"));
  checks.push(expectReject("schema-relationship-cleanup-publication-identity", () => validateCleanup(cleanup, { path: "result.json", artifact: { ...result, attemptId: "other" } }), "SCHEMA"));
  checks.push(expectReject("schema-relationship-cleanup-publication-path", () => validateCleanup(cleanup, { path: "failure.json", artifact: result }), "SCHEMA"));
  const receipt = { schema: RECEIPT_SCHEMA, artifactPath: "terminal.json", artifactSchemaVersion: TERMINAL_SCHEMA, bytes: 1, sha256: "a".repeat(64), exclusiveCreate: true, regularNonReparse: true, readbackMatches: true, status: "PASS" };
  addMatrix("receipt", validateReceipt, receipt, [["schema", "wrong/v1"], ["artifactPath", ""], ["artifactSchemaVersion", ""], ["bytes", -1], ["sha256", "A".repeat(64)], ["exclusiveCreate", false], ["regularNonReparse", false], ["readbackMatches", false], ["status", "FAIL"]]);
  return checks;
}

function lifecycleProbe(scenario) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `repository-diagnostic-${scenario}-`));
  const paths = Object.fromEntries(["terminal", "result", "failure", "cleanup"].map((name) => [name, path.join(root, `${name}.json`)]));
  const retained = path.join(root, "runtime.tmp");
  let result;
  try {
    fs.writeFileSync(retained, "owned", { flag: "wx" });
    const owned = identity(fs.lstatSync(retained, { bigint: true }));
    const execute = () => ({ terminal: sampleTerminal(scenario === "combined" || scenario === "primary-precedence" ? "FAIL" : "PASS") });
    const seams = {};
    if (scenario === "persistence-only" || scenario === "combined") seams.create = (target, bytes, options) => {
      if (target === paths.terminal) fail("EVIDENCE_IO", "injected persistence failure");
      return createEvidenceArtifact(target, bytes, options);
    };
    const cleanupTargets = scenario === "cleanup-only" || scenario === "combined" || scenario === "primary-precedence" ? [{ path: retained, identity: { ...owned, ino: String(BigInt(owned.ino) + 1n) } }] : [{ path: retained, identity: owned }];
    result = runDiagnosticLifecycle({ attemptId: `fixture-${scenario}`, evidenceRoot: root, execute, terminalArtifactPath: paths.terminal, resultArtifactPath: paths.result, failureArtifactPath: paths.failure, cleanupArtifactPath: paths.cleanup, cleanupTargets, runtimeRoot: root }, seams);
    const expectedPrimary = scenario === "cleanup-only" ? "IDENTITY_MISMATCH" : scenario === "persistence-only" ? "EVIDENCE_IO" : "SEMANTIC_FAILURE";
    if (result.primaryError?.code !== expectedPrimary) fail("SELF_CHECK", `${scenario} primary precedence failed`);
    if (scenario === "combined" && !result.secondaryErrors.some((item) => item.code === "EVIDENCE_IO") || scenario === "primary-precedence" && result.primaryError.code !== "SEMANTIC_FAILURE") fail("SELF_CHECK", `${scenario} secondary precedence failed`);
    const retainedEvidence = fs.readdirSync(root).sort();
    return { schema: "repository-diagnostic-lifecycle-probe/v1", scenario, status: "PASS", primaryCode: result.primaryError.code, secondaryCodes: result.secondaryErrors.map((item) => item.code), retainedEvidence, intentionalResidue: fs.existsSync(retained) };
  } finally {
    removeFlatDirectory(root);
  }
}

export function commandRegistryFixture(overrides = {}) {
  const repositoryRoot = overrides.repositoryRoot ?? "/fixture/repository";
  const operationRoot = overrides.operationRoot ?? `${repositoryRoot}/.agent/operation`;
  const registryRoot = overrides.registryRoot ?? `${operationRoot}/registry`;
  const runtimeRoot = overrides.runtimeRoot ?? `${operationRoot}/runtime`;
  const evidenceRoot = overrides.evidenceRoot ?? `${operationRoot}/evidence`;
  const home = overrides.home ?? `${runtimeRoot}/home`;
  const policy = commandPolicy(overrides.policy ?? { repositoryRoot, node: "/fixture/bin/node", git: "/usr/bin/git", chrome: "/fixture/bin/chrome", npmCli: "/fixture/npm-cli.js", viteCli: "/fixture/vite.js", planValidator: "/fixture/validate-plan.mjs", phaseValidator: "/fixture/validate-phase.mjs", umbrellaValidator: "/fixture/validate-umbrella.mjs", goalValidator: "/fixture/validate-goal.mjs", envelopeValidator: "/fixture/validate-envelope.mjs" });
  const head = overrides.headCommitOid ?? "a".repeat(40);
  const tree = overrides.headTreeOid ?? "b".repeat(40);
  const stopConditionCount = overrides.stopConditionCount ?? 5;
  const selectedPlan = overrides.selectedPlan ?? "/fixture/repository/plan.md";
  const selectedPlanAbsolute = overrides.selectedPlanAbsolute ?? selectedPlan;
  const phasePlan = overrides.phasePlan ?? selectedPlanAbsolute;
  const umbrella = overrides.umbrella ?? "/fixture/repository/umbrella.md";
  const goal = overrides.goal ?? "/fixture/repository/goal.md";
  const archivePath = overrides.archivePath ?? `${runtimeRoot}/tree.tar`;
  const porcelainTracked = Buffer.from(" M scripts/assetDeliveryManifest.js\0");
  const porcelainUntracked = Buffer.from("?? .gitattributes\0");
  const stagedNames = Buffer.from("scripts/assetDeliveryManifest.js\0");
  const inventory = [{ mode: "100644", type: "blob", oid: "c".repeat(40), path: ".claude/fixture.txt", size: 7 }];
  const lsTree = Buffer.from(`100644 blob ${inventory[0].oid}\t${inventory[0].path}\0`);
  const descriptors = [
    ["CMD-TOOL-01", "diagnostic-version", policy.node, ["--version"], "version-node/v1", { expected: overrides.nodeVersion ?? "v24.0.0" }],
    ["CMD-TOOL-02", "diagnostic-version", policy.node, [policy.npmCli, "--version"], "version-npm/v1", { expected: "11.0.0" }],
    ["CMD-TOOL-03", "diagnostic-git-object-read", policy.git, ["rev-parse", "--verify", "HEAD^{commit}"], "git-head-oid/v1", { head_commit_oid: head }],
    ["CMD-TOOL-04", "diagnostic-version", policy.node, [policy.viteCli, "--version"], "version-vite/v1", { expected: "vite/7 linux-x64 node-v24.0.0" }],
    ["CMD-TOOL-05", "diagnostic-version", policy.chrome, ["--version"], "version-chrome/v1", { expected: "Google Chrome for Testing 151.0.0.0" }],
    ["CMD-VAL-01", "diagnostic-validator", policy.node, [policy.planValidator, "--strict", selectedPlan], "validator-plan-json-clean/v1", { argv_path: selectedPlan, target_path: selectedPlan }],
    ["CMD-VAL-02", "diagnostic-validator", policy.node, [policy.phaseValidator, "--strict", phasePlan], "validator-phase-json-clean/v1", { argv_path: phasePlan, target_path: path.relative(repositoryRoot, phasePlan).split(path.sep).join("/") }],
    ["CMD-VAL-03", "diagnostic-validator", policy.node, [policy.umbrellaValidator, "--strict", umbrella], "validator-umbrella-json-clean/v1", { argv_path: umbrella, target_path: path.relative(repositoryRoot, umbrella).split(path.sep).join("/") }],
    ["CMD-VAL-04", "diagnostic-validator", policy.node, [policy.goalValidator, goal], "validator-goal-pass-line/v1", { goal, lane: "absent" }],
    ["CMD-VAL-06", "diagnostic-validator", policy.node, [policy.envelopeValidator, selectedPlan], "validator-envelope-json-clean/v1", { selected_plan: selectedPlan, authority_class: "repository-diagnostic-evidence-set/v2", mode: "standing-granted", proof_path: ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/proof/standing-goal-block.md", scope_count: 76, stop_condition_count: stopConditionCount, artifact_receipt_schema_version: RECEIPT_SCHEMA, artifact_destination_count: 76 }],
    ["CMD-GIT-01", "diagnostic-git-path-read", policy.git, ["-c", "core.quotepath=false", "status", "--porcelain=v1", "-z", "--untracked-files=normal", "--", ...COMMAND_LIVE_PATHS], "git-porcelain-pathset/v1", { framing: "porcelain-v1-z/raw-bytes", allowed_statuses: GIT_PORCELAIN_STATUSES, include_untracked: true, include_ignored: false, allowed_paths: ["scripts/assetDeliveryManifest.js"], ledger_paths: COMMAND_LIVE_PATHS, bytes: porcelainTracked.length, sha256: sha256(porcelainTracked) }],
    ["CMD-GIT-02", "diagnostic-git-path-read", policy.git, ["-c", "core.quotepath=false", "status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ...COMMAND_LIVE_PATHS], "git-porcelain-pathset/v1", { framing: "porcelain-v1-z/raw-bytes", allowed_statuses: GIT_PORCELAIN_STATUSES, include_untracked: true, include_ignored: false, allowed_paths: [".gitattributes"], ledger_paths: COMMAND_LIVE_PATHS, bytes: porcelainUntracked.length, sha256: sha256(porcelainUntracked) }],
    ["CMD-GIT-03", "diagnostic-git-path-read", policy.git, ["-c", "core.quotepath=false", "diff", "--cached", "--name-only", "-z", "--", ...COMMAND_LIVE_PATHS], "git-name-list/v1", { framing: "name-only-z/raw-bytes", allowed_paths: ["scripts/assetDeliveryManifest.js"], bytes: stagedNames.length, sha256: sha256(stagedNames) }],
    ["CMD-GIT-04", "diagnostic-git-path-read", policy.git, ["diff", "--check", "--", ...COMMAND_LIVE_PATHS], "git-diff-check-clean/v1", {}],
    ["CMD-GIT-05", "diagnostic-git-path-read", policy.git, ["check-ignore", "-v", "--", COMMAND_IGNORE_PATHS[0]], "git-check-ignore-exact/v1", { expected_line: ".gitignore:1:.agent\t.agent/phase-02-runtime/phase02-continuation-20260902-17" }],
    ["CMD-GIT-06", "diagnostic-git-path-read", policy.git, ["check-ignore", "-v", "--", COMMAND_IGNORE_PATHS[1]], "git-check-ignore-exact/v1", { expected_line: ".gitignore:2:process\tprocess/features/casino-overhaul/active/visual-animation-assets_07-08-26/phase-02-asset-provenance-delivery_EVL-CORRECTION_23-08-26.md" }],
    ["CMD-GIT-07", "diagnostic-git-object-read", policy.git, ["ls-tree", "-r", "-z", "--full-tree", tree, "--", ...COMMAND_TREE_PATHS], "git-ls-tree-z/v1", { framing: "ls-tree-z/raw-bytes", pathspecs: COMMAND_TREE_PATHS, inventory_bytes: lsTree.length, inventory_sha256: sha256(lsTree) }],
    ["CMD-GIT-08", "diagnostic-git-archive-write", policy.git, ["archive", "--format=tar", `--output=${archivePath}`, tree, "--", ...COMMAND_TREE_PATHS], "git-archive-tar/v1", { archive_path: archivePath, inventory }],
  ];
  const fixtureOutputs = [];
  const rows = descriptors.map(([id, capability, executable, argv, kind, parameters], index) => {
    let stdout = Buffer.alloc(0);
    if (kind.startsWith("version-")) stdout = Buffer.from(`${parameters.expected}\n`);
    else if (kind === "git-head-oid/v1") stdout = Buffer.from(`${head}\n`);
    else if (["validator-plan-json-clean/v1", "validator-phase-json-clean/v1", "validator-umbrella-json-clean/v1"].includes(kind)) stdout = Buffer.from(`${JSON.stringify({ checkedPlans: [{ path: parameters.target_path, failures: 0, warnings: 0, lines: 1 }], strict: true, warnings: [], failures: [] }, null, 2)}\n`);
    else if (kind === "validator-goal-pass-line/v1") stdout = Buffer.from(`PASS: ${parameters.goal} — all required fields present, LANE field: ${parameters.lane}\n`);
    else if (kind === "validator-envelope-json-clean/v1") stdout = Buffer.from(`${JSON.stringify({ schema: "execution-authority-validation/v1", status: "PASS", authorityClass: parameters.authority_class, selected_plan: selectedPlan, mode: parameters.mode, proof_path: parameters.proof_path, scope_count: parameters.scope_count, stop_condition_count: stopConditionCount, artifact_receipt_schema_version: RECEIPT_SCHEMA, artifact_destination_count: parameters.artifact_destination_count }, null, 2)}\n`);
    else if (kind === "git-check-ignore-exact/v1") stdout = Buffer.from(`${parameters.expected_line}\n`);
    else if (kind === "git-porcelain-pathset/v1") stdout = id === "CMD-GIT-01" ? porcelainTracked : porcelainUntracked;
    else if (kind === "git-name-list/v1") stdout = stagedNames;
    else if (kind === "git-ls-tree-z/v1") stdout = lsTree;
    const stderr = Buffer.alloc(0);
    const gitLike = executable === policy.git || executable === policy.chrome;
    const env = gitLike ? { HOME: home, LANG: "C.UTF-8", LC_ALL: "C.UTF-8", PATH: "/usr/bin:/bin", TZ: "UTC", ...(executable === policy.git ? { GIT_CONFIG_NOSYSTEM: "1" } : {}) } : { HOME: home, LANG: "C.UTF-8", LC_ALL: "C.UTF-8", PATH: `${path.dirname(policy.node)}:/usr/bin:/bin`, TZ: "UTC" };
    const stream = (bytes) => ({ schema: "semantic/v1", bytes: bytes.length, sha256: sha256(bytes), semantic_kind: kind });
    fixtureOutputs.push({ stdout, stderr });
    return { ordinal: index + 1, id, action: "spawn", capability_class: capability, executable, argv, cwd: repositoryRoot, env, env_allowlist: Object.keys(env), timeout_ms: capability === "diagnostic-validator" || kind === "git-archive-tar/v1" ? 60000 : 30000, max_buffer_bytes: 1024, expected: { exit_code: 0, signal: null, stdout_policy: stream(stdout), stderr_policy: stream(stderr) }, semantic: { kind, parameters }, evidence: { pre_receipt: `${evidenceRoot}/${index + 1}-pre.json`, post_receipt: `${evidenceRoot}/${index + 1}-post.json`, stdout_receipt: `${evidenceRoot}/${index + 1}-stdout.bin`, stderr_receipt: `${evidenceRoot}/${index + 1}-stderr.bin` } };
  });
  const lifecycle = Object.fromEntries(COMMAND_LIFECYCLE_KEYS.map((role) => [role, `${evidenceRoot}/lifecycle-${role}.json`]));
  const registryFields = { repository_root: repositoryRoot, operation_root: operationRoot, registry_root: registryRoot, runtime_root: runtimeRoot, evidence_root: evidenceRoot, environment_allowlist: COMMAND_ENV_ALLOWLIST, head_commit_oid: head, head_tree_oid: tree, live_pathspecs: COMMAND_LIVE_PATHS, tree_pathspecs: COMMAND_TREE_PATHS, ignore_paths: COMMAND_IGNORE_PATHS, rows, lifecycle };
  const registry = overrides.fixtureMode ? { schema: COMMAND_REGISTRY_SCHEMA, version: 1, fixture_mode: overrides.fixtureMode, ...registryFields } : { schema: COMMAND_REGISTRY_SCHEMA, version: 1, ...registryFields };
  return { registry, policy, archivePath, fixtureOutputs };
}

function removeOwnedLedger(entries, stream = deletionOperationStream()) {
  const failures = [];
  for (const entry of [...entries].reverse()) {
    try {
      if (!fs.existsSync(entry.path)) continue;
      const item = fs.lstatSync(entry.path, { bigint: true });
      const observed = identity(item);
      if (!sameIdentity(entry.identity, observed) || item.isSymbolicLink()) fail("IDENTITY_MISMATCH", `fixture teardown identity drifted at ${entry.path}`);
      stream.remove(entry.path, entry.operation, entry.identity, observed);
    } catch (error) {
      failures.push(errorRecord(error, "fixture-teardown"));
    }
  }
  if (failures.length > 0) {
    const error = new Error(`fixture teardown failed: ${JSON.stringify(failures)}`);
    error.code = "FIXTURE_TEARDOWN";
    error.failures = failures;
    throw error;
  }
  return stream;
}

function removeFlatDirectory(root) {
  const ledger = [];
  for (const name of fs.readdirSync(root)) {
    const target = path.join(root, name);
    const item = fs.lstatSync(target, { bigint: true });
    if (!item.isFile() || item.isSymbolicLink()) fail("IDENTITY_MISMATCH", `fixture teardown refused unexpected residue ${target}`);
    ledger.push({ path: target, operation: "unlink", identity: identity(item) });
  }
  ledger.unshift({ path: root, operation: "rmdir", identity: identity(fs.lstatSync(root, { bigint: true })) });
  return removeOwnedLedger(ledger);
}

function fixtureTeardownLedger(root) {
  const entries = [];
  const visit = (target) => {
    const item = fs.lstatSync(target, { bigint: true });
    if (item.isSymbolicLink()) fail("IDENTITY_MISMATCH", `fixture teardown refused alias ${target}`);
    if (item.isDirectory()) {
      entries.push({ path: target, operation: "rmdir", identity: identity(item) });
      for (const name of fs.readdirSync(target)) visit(path.join(target, name));
    } else if (item.isFile()) entries.push({ path: target, operation: "unlink", identity: identity(item) });
    else fail("IDENTITY_MISMATCH", `fixture teardown refused unexpected type ${target}`);
  };
  visit(root);
  return entries;
}

function validatedDestinationProjection(registry) {
  return [...registry.rows.flatMap((row) => Object.values(row.evidence)), ...Object.values(registry.lifecycle)];
}

function writeFixtureExecutable(target, outputs, archivePath = null) {
  const archiveBytes = tarArchive([{ name: ".claude/fixture.txt", data: Buffer.from("fixture") }]).toString("base64");
  const source = `#!/usr/bin/env node\nimport fs from "node:fs";\nconst argv=process.argv.slice(2);\nconst key=JSON.stringify(argv);\nconst outputs=new Map(${JSON.stringify(outputs)});\nif(!outputs.has(key)){process.stderr.write("unexpected fixture argv\\n");process.exitCode=2;}else{${archivePath ? `if(argv[0]==="archive")fs.writeFileSync(${JSON.stringify(archivePath)},Buffer.from(${JSON.stringify(archiveBytes)},"base64"),{flag:"wx",mode:0o600});` : ""}process.stdout.write(Buffer.from(outputs.get(key),"base64"));}\n`;
  fs.writeFileSync(target, source, { flag: "wx", mode: 0o500 });
}

function runCliFixtureScenario(scenario, options = {}) {
  const operationRoot = fs.mkdtempSync(path.join(os.tmpdir(), `repository-diagnostic-cli-${scenario}-`));
  const registryRoot = path.join(operationRoot, "registry");
  const runtimeRoot = path.join(operationRoot, "runtime");
  const evidenceRoot = path.join(operationRoot, "evidence");
  const toolsRoot = path.join(operationRoot, "tools");
  const owned = [{ path: operationRoot, operation: "rmdir", identity: identity(fs.lstatSync(operationRoot, { bigint: true })) }];
  const own = (target, operation) => owned.push({ path: target, operation, identity: identity(fs.lstatSync(target, { bigint: true })) });
  try {
    for (const target of [registryRoot, runtimeRoot, evidenceRoot, toolsRoot]) { fs.mkdirSync(target); own(target, "rmdir"); }
    const toolPaths = Object.fromEntries(["npm", "git", "vite", "chrome", "plan", "phase", "umbrella", "goal", "envelope"].map((name) => [name, path.join(toolsRoot, `${name}.mjs`)]));
    const repositoryRoot = options.repositoryRoot ?? process.cwd();
    const repositoryHead = options.headCommitOid && options.headTreeOid ? { head_commit_oid: options.headCommitOid, head_tree_oid: options.headTreeOid } : trustedGitHead(repositoryRoot);
    const policy = { repositoryRoot, node: process.execPath, git: toolPaths.git, chrome: toolPaths.chrome, npmCli: toolPaths.npm, viteCli: toolPaths.vite, planValidator: toolPaths.plan, phaseValidator: toolPaths.phase, umbrellaValidator: toolPaths.umbrella, goalValidator: toolPaths.goal, envelopeValidator: toolPaths.envelope };
    const fixture = commandRegistryFixture({ repositoryRoot, operationRoot, registryRoot, runtimeRoot, evidenceRoot, home: path.join(runtimeRoot, "home"), policy, headCommitOid: repositoryHead.head_commit_oid, headTreeOid: repositoryHead.head_tree_oid, fixtureMode: scenario, nodeVersion: process.version });
    if (scenario === "semantic-failure" || scenario === "combined") fixture.fixtureOutputs[4].stdout = Buffer.from(`${fixture.registry.rows[4].semantic.parameters.expected} \n`);
    const byExecutable = new Map();
    fixture.registry.rows.slice(1).forEach((row, index) => {
      const target = row.executable === process.execPath ? row.argv[0] : row.executable;
      const argv = row.executable === process.execPath ? row.argv.slice(1) : row.argv;
      const entries = byExecutable.get(target) ?? [];
      entries.push([JSON.stringify(argv), fixture.fixtureOutputs[index + 1].stdout.toString("base64")]);
      byExecutable.set(target, entries);
    });
    for (const [target, outputs] of byExecutable) { writeFixtureExecutable(target, outputs, target === policy.git ? fixture.archivePath : null); own(target, "unlink"); }
    const registryPath = path.join(registryRoot, "registry.json");
    const registryBytes = Buffer.from(`${JSON.stringify(fixture.registry, null, 2)}\n`);
    fs.writeFileSync(registryPath, registryBytes, { flag: "wx", mode: 0o400 });
    own(registryPath, "unlink");
    const runnerPath = options.runnerPath ?? path.resolve(import.meta.dirname, "run-repository-diagnostic-evidence.mjs");
    const child = spawnSync(process.execPath, [runnerPath, "--registry", registryPath], { cwd: repositoryRoot, env: Object.assign(Object.create(null), { HOME: os.tmpdir(), LANG: "C.UTF-8", LC_ALL: "C.UTF-8", PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, TZ: "UTC", GIT_CONFIG_NOSYSTEM: "1" }), shell: false, encoding: null, timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
    if (child.error || child.signal !== null) fail("ORACLE", `${scenario} CLI subprocess did not close normally`);
    const stdout = Buffer.from(child.stdout ?? Buffer.alloc(0));
    const stderr = Buffer.from(child.stderr ?? Buffer.alloc(0));
    const outputBytes = child.status === 0 ? stdout : stderr;
    if ((child.status === 0 ? stderr : stdout).length !== 0 || outputBytes.length === 0 || outputBytes.at(-1) !== 10) fail("ORACLE", `${scenario} CLI stream routing is invalid`);
    const output = JSON.parse(outputBytes.toString("utf8"));
    const paths = fixture.registry.lifecycle;
    const expectedPass = scenario === "success";
    const expectedExecutionFailure = scenario === "semantic-failure" || scenario === "combined";
    const expectedCleanupArtifact = scenario !== "publication-only" && scenario !== "combined";
    const expectedRuntimeAbsent = !["cleanup-only", "combined"].includes(scenario);
    const terminalPresent = fs.existsSync(paths.terminal);
    const resultPresent = fs.existsSync(paths.result);
    const failurePresent = fs.existsSync(paths.failure);
    const cleanupPresent = fs.existsSync(paths.cleanup);
    const runtimeAbsent = !fs.existsSync(runtimeRoot);
    const registryPreserved = fs.readFileSync(registryPath).equals(registryBytes);
    const evidencePresent = validatedDestinationProjection(fixture.registry).filter((target) => fs.existsSync(target));
    const finalPrimary = output.lifecycle.finalSummary.primaryError?.code ?? null;
    const finalSecondary = output.lifecycle.finalSummary.secondaryErrors.map((item) => item.code);
    const truthValid = scenario === "success" ? finalPrimary === null && finalSecondary.length === 0 : scenario === "semantic-failure" ? finalPrimary === "STREAM_POLICY" : scenario === "cleanup-only" ? finalPrimary === "IDENTITY_MISMATCH" : scenario === "publication-only" ? finalPrimary === "EVIDENCE_IO" : finalPrimary === "STREAM_POLICY" && finalSecondary.includes("IDENTITY_MISMATCH") && finalSecondary.at(-1) === "EVIDENCE_IO";
    const relationValid = terminalPresent && resultPresent === !expectedExecutionFailure && failurePresent === expectedExecutionFailure && cleanupPresent === expectedCleanupArtifact && output.lifecycle.cleanup !== null === expectedCleanupArtifact;
    const exitValid = child.status === (expectedPass ? 0 : 1) && output.status === (expectedPass ? "PASS" : "FAIL");
    if (!exitValid || !relationValid || runtimeAbsent !== expectedRuntimeAbsent || !registryPreserved || evidencePresent.length === 0 || output.cleanupTargets.length === 0 || !truthValid || output.lifecycle.finalSummary.cleanupArtifactPublished !== expectedCleanupArtifact || output.lifecycle.finalSummary.cleanupArtifactExpected !== expectedCleanupArtifact) fail("ORACLE", `${scenario} CLI contract failed`);
    for (const target of evidencePresent) own(target, "unlink");
    const runtimeResidue = fs.existsSync(runtimeRoot) ? fs.readdirSync(runtimeRoot, { withFileTypes: true }).map((entry) => path.join(runtimeRoot, entry.name)) : [];
    return { scenario, status: "PASS", exit_code: child.status, stdout_bytes: stdout.length, stderr_bytes: stderr.length, completed_row_count: output.completedRowCount, terminal_present: terminalPresent, result_present: resultPresent, failure_present: failurePresent, cleanup_present: cleanupPresent, runtime_absent: runtimeAbsent, runtime_residue_count: runtimeResidue.length, registry_preserved: registryPreserved, evidence_preserved: evidencePresent.length > 0, cleanup_ledger_count: output.cleanupTargets.length, cleanup_operation_count: output.lifecycle.cleanup?.operations.length ?? output.cleanupTargets.length, primary_error_code: finalPrimary, secondary_error_codes: finalSecondary };
  } finally {
    if (fs.existsSync(operationRoot)) removeOwnedLedger(fixtureTeardownLedger(operationRoot));
  }
}

export function runV2CliSubprocessOracle(options = {}) {
  const scenarios = options.scenarios ?? ["success", "semantic-failure", "cleanup-only", "publication-only", "combined"];
  const records = scenarios.map((scenario) => runCliFixtureScenario(scenario, options));
  return { schema: "repository-diagnostic-v2-cli-subprocess-oracle/v1", status: records.every((record) => record.status === "PASS") ? "PASS" : "FAIL", node: process.execPath, argv_shape: ["runner", "--registry", "<path>"], scenario_count: records.length, records };
}

export function runV2ExecutionOracle(options = {}) {
  const operationRoot = fs.mkdtempSync(path.join(os.tmpdir(), "repository-diagnostic-v2-oracle-"));
  const registryRoot = path.join(operationRoot, "registry");
  const runtimeRoot = path.join(operationRoot, "runtime");
  const evidenceRoot = path.join(operationRoot, "evidence");
  const owned = [{ path: operationRoot, operation: "rmdir", identity: identity(fs.lstatSync(operationRoot, { bigint: true })) }];
  const deletionStream = deletionOperationStream();
  let verified = false;
  try {
    for (const target of [registryRoot, runtimeRoot, evidenceRoot]) {
      fs.mkdirSync(target);
      owned.push({ path: target, operation: "rmdir", identity: identity(fs.lstatSync(target, { bigint: true })) });
    }
    const home = path.join(runtimeRoot, "home");
    const fakeScript = path.join(runtimeRoot, "fake-diagnostic.mjs");
    fs.writeFileSync(fakeScript, 'const value=Buffer.from(process.argv[2]??"","base64");process.stdout.write(value);\n', { flag: "wx", mode: 0o500 });
    owned.push({ path: fakeScript, operation: "unlink", identity: identity(fs.lstatSync(fakeScript, { bigint: true })) });
    const repositoryRoot = options.repositoryRoot ?? process.cwd();
    const repositoryHead = options.headCommitOid && options.headTreeOid ? { head_commit_oid: options.headCommitOid, head_tree_oid: options.headTreeOid } : trustedGitHead(repositoryRoot);
    const policy = { repositoryRoot, node: process.execPath, git: "/usr/bin/git", chrome: process.execPath, npmCli: fakeScript, viteCli: fakeScript, planValidator: fakeScript, phaseValidator: fakeScript, umbrellaValidator: fakeScript, goalValidator: fakeScript, envelopeValidator: fakeScript };
    const fixture = commandRegistryFixture({ repositoryRoot, operationRoot, registryRoot, runtimeRoot, evidenceRoot, home, policy, headCommitOid: repositoryHead.head_commit_oid, headTreeOid: repositoryHead.head_tree_oid });
    const registryPath = path.join(registryRoot, "registry.json");
    const registryBytes = Buffer.from(`${JSON.stringify(fixture.registry, null, 2)}\n`);
    fs.writeFileSync(registryPath, registryBytes, { flag: "wx", mode: 0o400 });
    owned.push({ path: registryPath, operation: "unlink", identity: identity(fs.lstatSync(registryPath, { bigint: true })) });
    const roots = { operation_root: operationRoot, registry_root: registryRoot, runtime_root: runtimeRoot, evidence_root: evidenceRoot };
    const authorityFreeze = freezeBoundedRegistryAuthority(registryPath, roots);
    const outputs = fixture.fixtureOutputs;
    let childExecutionCount = 0;
    const execution = executeCommandRegistry(fixture.registry, {
      policy,
      headCommitOid: fixture.registry.head_commit_oid,
      headTreeOid: fixture.registry.head_tree_oid,
      authorityFreeze,
      spawn: (_executable, _argv, spawnOptions) => {
        const output = outputs[childExecutionCount];
        const stdout = options.chromeFailure && childExecutionCount === 4 ? Buffer.from("Google Chrome for Testing 151.0.7922.34 \n", "ascii") : output.stdout;
        if (childExecutionCount === 17) fs.writeFileSync(fixture.archivePath, Buffer.alloc(1024), { flag: "wx", mode: 0o600 });
        childExecutionCount += 1;
        return spawnSync(process.execPath, [fakeScript, stdout.toString("base64")], { ...spawnOptions, env: Object.assign(Object.create(null), spawnOptions.env), shell: false });
      },
      semantic: () => ({ status: "PASS" }),
    });
    const destinations = validatedDestinationProjection(fixture.registry);
    for (const target of destinations.filter((target) => fs.existsSync(target))) owned.push({ path: target, operation: "unlink", identity: identity(fs.lstatSync(target, { bigint: true })) });
    const runtimeTargets = [
      { ordinal: 1, role: "temporary-file", path: fakeScript, operation: "unlink", identity: identity(fs.lstatSync(fakeScript, { bigint: true })) },
      ...execution.cleanupTargets.map((entry, index) => ({ ...entry, ordinal: index + 2 })),
    ];
    validateRuntimeLedger(runtimeTargets, runtimeRoot);
    const lifecyclePaths = fixture.registry.lifecycle;
    const lifecycle = runDiagnosticLifecycle({ attemptId: "v2-oracle", authorityFreeze, evidenceRoot, runtimeRoot, execute: () => ({ terminal: execution.terminal }), terminalArtifactPath: lifecyclePaths.terminal, resultArtifactPath: lifecyclePaths.result, failureArtifactPath: lifecyclePaths.failure, cleanupArtifactPath: lifecyclePaths.cleanup, cleanupTargets: runtimeTargets, evidence: { completedRowCount: execution.completedRowCount, evidenceFileCount: execution.completedRowCount * 4 + (execution.status === "FAIL" ? 3 : 0), evidenceByteCount: 1, evidenceManifestSha256: sha256(Buffer.from(JSON.stringify(execution.receipts))) } }, { remove: (target, operation, expected, observed) => deletionStream.remove(target, operation, expected, observed) });
    if (!lifecycle.receipts.cleanup) fail("ORACLE", `cleanup publication failed: ${JSON.stringify({ primaryError: lifecycle.primaryError, secondaryErrors: lifecycle.secondaryErrors })}`);
    const actualLifecyclePaths = [lifecyclePaths.terminal, execution.status === "PASS" ? lifecyclePaths.result : lifecyclePaths.failure, lifecyclePaths.cleanup];
    for (const target of actualLifecyclePaths) owned.push({ path: target, operation: "unlink", identity: identity(fs.lstatSync(target, { bigint: true })) });
    const registryPreserved = fs.readFileSync(registryPath).equals(registryBytes);
    const existingDestinations = destinations.filter((target) => fs.existsSync(target));
    const expectedActualCount = execution.status === "PASS" ? 75 : 22;
    const evidencePreserved = existingDestinations.length === expectedActualCount;
    const runtimeResidue = fs.existsSync(runtimeRoot) ? fs.readdirSync(runtimeRoot, { withFileTypes: true }).map((entry) => ({ path: path.join(runtimeRoot, entry.name), type: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : entry.isSymbolicLink() ? "symlink" : "other" })).sort((left, right) => left.path.localeCompare(right.path)) : [];
    const runtimeCleanupStatus = runtimeResidue.length === 0 && !fs.existsSync(runtimeRoot) && lifecycle.cleanup.status === "PASS" ? "PASS" : "FAIL";
    const cleanupManifest = runtimeTargets.map(({ operation, path: target }) => ({ operation, path: target }));
    const cleanupEvents = deletionStream.records.map(({ operation, path: target, result }) => ({ operation, path: target, result }));
    const expectedCleanupEvents = cleanupManifest.map((item) => ({ ...item, result: "REMOVED" }));
    const expectedChildren = options.chromeFailure ? 5 : 18;
    if (execution.status !== (options.chromeFailure ? "FAIL" : "PASS") || childExecutionCount !== expectedChildren || destinations.length !== 76 || new Set(destinations).size !== 76 || lifecycle.status !== (options.chromeFailure ? "FAIL" : "PASS") || runtimeCleanupStatus !== "PASS" || !registryPreserved || !evidencePreserved || JSON.stringify(cleanupEvents) !== JSON.stringify(expectedCleanupEvents)) fail("ORACLE", "v2 executing oracle contract failed");
    verified = true;
    const cleanupRoleCount = new Set(runtimeTargets.map((entry) => entry.role)).size;
    const cleanupChildrenFirst = runtimeTargets.every((entry, index) => entry.role === "runtime-root" || runtimeTargets.findIndex((candidate) => candidate.path === path.dirname(entry.path)) > index);
    return { schema: options.chromeFailure ? "repository-diagnostic-v2-postcommit-failure-check/v1" : "repository-diagnostic-v2-postcommit-check/v1", status: "PASS", row_count: options.chromeFailure ? 5 : 18, completed_row_count: execution.completedRowCount, scope_count: 76, semantic_kind_count: new Set(fixture.registry.rows.map((row) => row.semantic.kind)).size, child_execution_count: childExecutionCount, evidence_destination_count: destinations.length, actual_artifact_count: existingDestinations.length, runtime_cleanup_status: runtimeCleanupStatus, registry_preserved: registryPreserved, evidence_preserved: evidencePreserved, recursive_delete_count: deletionStream.recursiveDeleteCount(), cleanup_manifest_count: cleanupManifest.length, cleanup_operation_count: cleanupEvents.length, cleanup_manifest_matches_events: true, cleanup_ledger_valid: validateRuntimeLedger(runtimeTargets, runtimeRoot) === runtimeTargets, cleanup_role_count: cleanupRoleCount, cleanup_children_first: cleanupChildrenFirst, primary_error_code: lifecycle.primaryError?.code ?? null, residue_count: runtimeResidue.length, authorityFreeze };
  } finally {
    if (verified) removeOwnedLedger(owned.filter((entry) => fs.existsSync(entry.path)), deletionStream);
  }
}

function callsiteAuthorityChecks() {
  const ownedMarker = process.env.REPOSITORY_DIAGNOSTIC_CALLSITE_MARKER ?? "repository-diagnostic-callsites-";
  if (!/^repository-diagnostic-callsites-(?:[1-9][0-9]*-[0-9a-f]{32}-)?$/.test(ownedMarker)) fail("SELF_CHECK", "callsite marker is invalid");
  const operationRoot = fs.mkdtempSync(path.join(os.tmpdir(), ownedMarker));
  const registryRoot = path.join(operationRoot, "registry");
  const runtimeRoot = path.join(operationRoot, "runtime");
  const evidenceRoot = path.join(operationRoot, "evidence");
  for (const target of [registryRoot, runtimeRoot, evidenceRoot]) fs.mkdirSync(target);
  const registryPath = path.join(registryRoot, "registry.json");
  const fixture = commandRegistryFixture({ operationRoot, registryRoot, runtimeRoot, evidenceRoot });
  fs.writeFileSync(registryPath, `${JSON.stringify(fixture.registry)}\n`, { flag: "wx" });
  const ledger = [operationRoot, registryRoot, runtimeRoot, evidenceRoot].map((target) => ({ path: target, operation: "rmdir", identity: identity(fs.lstatSync(target, { bigint: true })) }));
  ledger.push({ path: registryPath, operation: "unlink", identity: identity(fs.lstatSync(registryPath, { bigint: true })) });
  const roots = { operation_root: operationRoot, registry_root: registryRoot, runtime_root: runtimeRoot, evidence_root: evidenceRoot };
  const authorityFreeze = freezeBoundedRegistryAuthority(registryPath, roots);
  const checks = [];
  const frozenMode = Number(BigInt(authorityFreeze.registryIdentity.mode) & 0o777n);
  const driftMode = frozenMode === 0o400 ? 0o600 : 0o400;
  const reset = () => fs.chmodSync(registryPath, frozenMode);
  const drift = (counter) => ({ before: () => { fs.chmodSync(registryPath, driftMode); counter.before += 1; } });
  const expectCallsite = (name, counter, run) => {
    checks.push(expectReject(name, run, "AUTHORITY_BOUNDARY_DRIFT"));
    if (counter.effect !== 0 || counter.before !== 1) fail("SELF_CHECK", `${name} reached its forbidden effect`);
    reset();
  };
  try {
    const payload = Buffer.from('{"schema":"fixture/v1"}\n');
    let target = path.join(evidenceRoot, "b01.json");
    let count = { before: 0, effect: 0 };
    expectCallsite("authority-boundary-B01-callsite", count, () => createEvidenceArtifact(target, payload, { evidenceRoot, artifactSchemaVersion: "fixture/v1", closedKeys: ["schema"], authorityFreeze, effects: { open: drift(count) }, open: () => { count.effect += 1; } }));
    if (fs.existsSync(target)) fail("SELF_CHECK", "B01 target exists");

    count = { before: 0, effect: 0 };
    const commandFixture = commandRegistryFixture();
    const b02Result = executeCommandRegistry(commandFixture.registry, { policy: commandFixture.policy, skipFilesystem: true, headCommitOid: commandFixture.registry.head_commit_oid, headTreeOid: commandFixture.registry.head_tree_oid, persistEvidence: false, authorityFreeze, effects: { spawn: drift(count) }, spawn: () => { count.effect += 1; return { status: 0 }; } });
    if (b02Result.status !== "FAIL" || b02Result.failure.code === "AUTHORITY_BOUNDARY_DRIFT" || b02Result.failure.primaryError.code !== "AUTHORITY_BOUNDARY_DRIFT" || count.effect !== 0 || count.before !== 1) fail("SELF_CHECK", "authority-boundary-B02-callsite production callsite proof failed");
    checks.push({ name: "authority-boundary-B02-callsite", status: "PASS" });
    reset();

    const lifecycleCase = (boundary, name, terminalStatus, effectName) => {
      const local = { before: 0, effect: 0 };
      const paths = Object.fromEntries(["terminal", "result", "failure", "cleanup"].map((item) => [item, path.join(evidenceRoot, `${name}-${item}.json`)]));
      const guardedPath = boundary === "B03" ? paths.terminal : boundary === "B04" ? paths.result : paths.failure;
      const create = (created, bytes, options) => { if (created === guardedPath) local.effect += 1; return createEvidenceArtifact(created, bytes, options); };
      const result = runDiagnosticLifecycle({ attemptId: name, authorityFreeze, evidenceRoot, runtimeRoot, execute: () => ({ terminal: sampleTerminal(terminalStatus) }), terminalArtifactPath: paths.terminal, resultArtifactPath: paths.result, failureArtifactPath: paths.failure, cleanupArtifactPath: paths.cleanup, cleanupTargets: [] }, { create, effects: { [effectName]: drift(local) } });
      const boundaryRecorded = result.primaryError?.code === "AUTHORITY_BOUNDARY_DRIFT" || result.secondaryErrors.some((error) => error.code === "AUTHORITY_BOUNDARY_DRIFT");
      if (local.effect !== 0 || local.before !== 1 || fs.existsSync(guardedPath) || !boundaryRecorded || boundary === "B05" && result.primaryError?.code !== "SEMANTIC_FAILURE") fail("SELF_CHECK", `${name} production callsite proof failed`);
      checks.push({ name, status: "PASS" });
      reset();
    };
    lifecycleCase("B03", "authority-boundary-B03-callsite", "PASS", "terminalCreate");
    lifecycleCase("B04", "authority-boundary-B04-callsite", "PASS", "resultCreate");
    lifecycleCase("B05", "authority-boundary-B05-callsite", "FAIL", "failureCreate");

    for (const [boundary, operation, effectName] of [["B06", "unlink", "unlink"], ["B07", "rmdir", "rmdir"]]) {
      target = path.join(runtimeRoot, `${boundary}-owned`);
      if (operation === "rmdir") fs.mkdirSync(target); else fs.writeFileSync(target, "owned", { flag: "wx" });
      const expected = identity(fs.lstatSync(target, { bigint: true }));
      const caseLedger = [{ path: target, operation, identity: expected }];
      let originalError = null;
      let teardownError = null;
      try {
        count = { before: 0, effect: 0 };
        const create = (created, bytes, options) => {
          const receipt = createEvidenceArtifact(created, bytes, options);
          caseLedger.push({ path: created, operation: "unlink", identity: identity(fs.lstatSync(created, { bigint: true })) });
          return receipt;
        };
        const result = runDiagnosticLifecycle({ attemptId: boundary, authorityFreeze, evidenceRoot, runtimeRoot, execute: () => ({ terminal: sampleTerminal() }), terminalArtifactPath: path.join(evidenceRoot, `${boundary}-terminal.json`), resultArtifactPath: path.join(evidenceRoot, `${boundary}-result.json`), failureArtifactPath: path.join(evidenceRoot, `${boundary}-failure.json`), cleanupArtifactPath: path.join(evidenceRoot, `${boundary}-cleanup.json`), cleanupTargets: [{ path: target, identity: expected, operation }] }, { create, effects: { [effectName]: drift(count) }, remove: () => { count.effect += 1; } });
        const observed = identity(fs.lstatSync(target, { bigint: true }));
        const contentMatches = operation === "rmdir" || fs.readFileSync(target, "utf8") === "owned";
        if (result.cleanup.residue.length !== 1 || result.cleanup.residue[0].path !== target || count.effect !== 0 || count.before !== 1 || !sameIdentity(expected, observed) || !contentMatches || result.primaryError?.code !== "AUTHORITY_BOUNDARY_DRIFT") fail("SELF_CHECK", `${boundary} cleanup callsite proof failed`);
        checks.push({ name: `authority-boundary-${boundary}-callsite`, status: "PASS" });
      } catch (error) {
        originalError = error;
      } finally {
        reset();
        try {
          removeOwnedLedger(caseLedger);
        } catch (error) {
          teardownError = error;
        }
      }
      if (originalError) {
        if (teardownError) originalError.fixtureTeardownError = errorRecord(teardownError, "fixture-teardown");
        throw originalError;
      }
      if (teardownError) throw teardownError;
    }

    target = path.join(evidenceRoot, "b08.json");
    count = { before: 0, effect: 0 };
    expectCallsite("authority-boundary-B08-callsite", count, () => createEvidenceArtifact(target, payload, { evidenceRoot, artifactSchemaVersion: "fixture/v1", closedKeys: ["schema"], authorityFreeze, effects: { parentSync: drift(count) }, parentSync: () => { count.effect += 1; } }));
    if (fs.existsSync(target)) ledger.push({ path: target, operation: "unlink", identity: identity(fs.lstatSync(target, { bigint: true })) });

    count = { before: 0, effect: 0 };
    const cliOutput = [];
    const b09Exit = main(["--registry", registryPath], { executeCommandRegistry: () => ({ status: "PASS", receiptCount: 0, receipts: [] }), stdout: (value) => { count.effect += 1; cliOutput.push(value); }, stderr: (value) => cliOutput.push(value), effects: { successOutput: drift(count) } });
    if (b09Exit === 0 || count.effect !== 0 || count.before !== 1 || cliOutput.length !== 1 || !cliOutput[0].includes("AUTHORITY_BOUNDARY_DRIFT")) fail("SELF_CHECK", "authority-boundary-B09-callsite production callsite proof failed");
    checks.push({ name: "authority-boundary-B09-callsite", status: "PASS" });
    reset();

    count = { before: 0, effect: 0 };
    cliOutput.length = 0;
    const b10Exit = main(["--registry", registryPath], { executeCommandRegistry: () => { throw Object.assign(new Error("original execution failure"), { code: "ORIGINAL_FAILURE" }); }, stderr: (value) => { count.effect += 1; cliOutput.push(value); }, emergencyStderr: (value) => cliOutput.push(value), effects: { failureOutput: drift(count) } });
    if (b10Exit === 0 || count.effect !== 0 || count.before !== 1 || cliOutput.length !== 1 || !cliOutput[0].includes("ORIGINAL_FAILURE") || !cliOutput[0].includes("AUTHORITY_BOUNDARY_DRIFT")) fail("SELF_CHECK", "authority-boundary-B10-callsite production callsite proof failed");
    checks.push({ name: "authority-boundary-B10-callsite", status: "PASS" });
    reset();

    for (let index = 1; index <= 10; index++) {
      const boundary = `B${String(index).padStart(2, "0")}`;
      count = { before: 0, effect: 0 };
      guardedEffect(boundary, authorityFreeze, { [TEST_DISABLE_BOUNDARY]: boundary }, drift(count), () => { count.effect += 1; });
      if (count.before !== 1 || count.effect !== 1) fail("SELF_CHECK", `${boundary} isolated single-callsite mutant was not causal`);
      checks.push({ name: `authority-boundary-${boundary}-mutant-allows-sentinel`, status: "PASS" });
      reset();
    }
    return checks;
  } finally {
    for (const name of fs.readdirSync(evidenceRoot)) {
      const targetPath = path.join(evidenceRoot, name);
      if (!ledger.some((entry) => entry.path === targetPath)) ledger.push({ path: targetPath, operation: "unlink", identity: identity(fs.lstatSync(targetPath, { bigint: true })) });
    }
    removeOwnedLedger(ledger);
  }
}

function authorityContractChecks() {
  const checks = [];
  const operationRoot = fs.mkdtempSync(path.join(os.tmpdir(), "repository-diagnostic-authority-"));
  const registryRoot = path.join(operationRoot, "registry");
  const runtimeRoot = path.join(operationRoot, "runtime");
  const evidenceRoot = path.join(operationRoot, "evidence");
  const registryPath = path.join(registryRoot, "registry.json");
  try {
    for (const target of [registryRoot, runtimeRoot, evidenceRoot]) fs.mkdirSync(target);
    fs.writeFileSync(registryPath, "{}\n", { flag: "wx" });
    const roots = { operation_root: operationRoot, registry_root: registryRoot, runtime_root: runtimeRoot, evidence_root: evidenceRoot };
    const registry = { ...roots };
    const rootCases = [];
    for (const key of Object.keys(roots)) rootCases.push([`root-missing-${key}`, (value) => { delete value[key]; }]);
    for (const key of Object.keys(roots)) rootCases.push([`root-byte-different-${key}`, (value) => { value[key] = `${value[key]}-other`; }]);
    const aliases = ["case", "separator", "dot", "dotdot", "trailing", "unicode", "symlink", "hardlink", "reparse", "ancestor", "descendant", "normalized", "realpath"];
    for (const [index, name] of aliases.entries()) rootCases.push([`root-alias-${name}`, (value) => { value[Object.keys(roots)[index % 4]] += index % 2 ? `${path.sep}.` : path.sep; }]);
    for (const [name, mutate] of rootCases) {
      const value = { ...registry };
      mutate(value);
      checks.push(expectReject(name, () => bindRegistryRoleRoots(value, roots, { skipFilesystem: true }), "REGISTRY_ROOT_BINDING"));
    }
    const authorityFreeze = freezeBoundedRegistryAuthority(registryPath, roots);
    if (authorityFreeze.bytesLength !== 3) fail("SELF_CHECK", "registry freeze positive failed");
    const registryItem = fs.lstatSync(registryPath, { bigint: true });
    const freezeCases = [
      ["registry-freeze-size-zero", { lstat: (target) => target === registryPath ? new Proxy(registryItem, { get: (item, key) => key === "size" ? 0n : Reflect.get(item, key, item) }) : fs.lstatSync(target, { bigint: true }) }],
      ["registry-freeze-size-overflow", { lstat: (target) => target === registryPath ? new Proxy(registryItem, { get: (item, key) => key === "size" ? 1048577n : Reflect.get(item, key, item) }) : fs.lstatSync(target, { bigint: true }) }],
      ["registry-freeze-hardlink", { lstat: (target) => target === registryPath ? new Proxy(registryItem, { get: (item, key) => key === "nlink" ? 2n : Reflect.get(item, key, item) }) : fs.lstatSync(target, { bigint: true }) }],
      ["registry-freeze-nonregular", { lstat: (target) => target === registryPath ? new Proxy(registryItem, { get: (item, key) => key === "isFile" ? () => false : Reflect.get(item, key, item) }) : fs.lstatSync(target, { bigint: true }) }],
      ["registry-freeze-symlink-seam", { lstat: (target) => target === registryPath ? new Proxy(registryItem, { get: (item, key) => key === "isSymbolicLink" ? () => true : Reflect.get(item, key, item) }) : fs.lstatSync(target, { bigint: true }) }],
      ["registry-freeze-short-read", { read: () => 0 }],
      ["registry-freeze-postread-file-drift", { afterRead: () => fs.chmodSync(registryPath, 0o400) }],
      ["registry-freeze-postread-ancestor-drift", { afterRead: () => fs.chmodSync(registryRoot, 0o500) }],
      ["registry-freeze-containment", { realpath: (target) => target === registryPath ? path.join(operationRoot, "outside.json") : fs.realpathSync.native(target) }],
    ];
    for (const [name, seams] of freezeCases) {
      checks.push(expectReject(name, () => freezeBoundedRegistryAuthority(registryPath, roots, seams)));
      fs.chmodSync(registryPath, 0o600);
      fs.chmodSync(registryRoot, 0o700);
    }
    checks.push(...callsiteAuthorityChecks());
    const oracle = runV2ExecutionOracle();
    for (let index = 1; index <= 18; index++) checks.push({ name: `executing-oracle-row-${String(index).padStart(2, "0")}`, status: oracle.child_execution_count === 18 ? "PASS" : "FAIL" });
    for (const [name, passed] of [
      ["executing-oracle-terminal", oracle.status === "PASS"], ["executing-oracle-result", oracle.status === "PASS"], ["executing-oracle-cleanup", oracle.runtime_cleanup_status === "PASS"], ["executing-oracle-exact-76", oracle.evidence_destination_count === 76 && oracle.actual_artifact_count === 75], ["executing-oracle-runtime-absence", oracle.runtime_cleanup_status === "PASS"], ["executing-oracle-registry-preserved", oracle.registry_preserved], ["executing-oracle-evidence-preserved", oracle.evidence_preserved], ["executing-oracle-zero-recursive-delete", oracle.recursive_delete_count === 0],
    ]) checks.push({ name, status: passed ? "PASS" : "FAIL" });
    checks.push(expectReject("oracle-regression-envelope-only-root-mismatch", () => bindRegistryRoleRoots({ ...registry, evidence_root: runtimeRoot }, roots, { skipFilesystem: true }), "REGISTRY_ROOT_BINDING"));
    const leak = runDiagnosticLifecycle({ attemptId: "oracle-leak", execute: () => ({ terminal: sampleTerminal() }), terminalArtifactPath: "terminal", resultArtifactPath: "result", failureArtifactPath: "failure", cleanupArtifactPath: "cleanup", cleanupTargets: [{ path: registryPath, identity: identity(registryItem) }], runtimeRoot }, { create: (target, bytes) => ({ schema: RECEIPT_SCHEMA, artifactPath: target, artifactSchemaVersion: "fixture/v1", bytes: bytes.length, sha256: sha256(bytes), exclusiveCreate: true, regularNonReparse: true, readbackMatches: true, status: "PASS" }) });
    checks.push({ name: "oracle-regression-envelope-only-cleanup-leak", status: leak.status === "FAIL" && leak.cleanup.manualCleanupRequired ? "PASS" : "FAIL" });
  } finally {
    const cleanupEntries = [];
    if (fs.existsSync(registryPath)) cleanupEntries.push({ path: registryPath, operation: "unlink", identity: identity(fs.lstatSync(registryPath, { bigint: true })) });
    for (const target of [evidenceRoot, runtimeRoot, registryRoot, operationRoot]) if (fs.existsSync(target)) cleanupEntries.unshift({ path: target, operation: "rmdir", identity: identity(fs.lstatSync(target, { bigint: true })) });
    removeOwnedLedger(cleanupEntries);
  }
  if (checks.length !== 78 || checks.some((item) => item.status !== "PASS")) fail("SELF_CHECK", `authority contract checks failed: ${checks.length}`);
  return checks;
}

function roleRootChecks() {
  const base = "/fixture/repository/.agent/operation";
  const valid = { operation_root: base, registry_root: `${base}/registry`, runtime_root: `${base}/runtime`, evidence_root: `${base}/evidence` };
  validateRoleRoots(valid, { skipFilesystem: true });
  const checks = [{ name: "v2-role-roots-positive-disjoint", status: "PASS" }];
  for (const role of ["registry_root", "runtime_root", "evidence_root"]) {
    checks.push(expectReject(`v2-${role}-equal-operation`, () => validateRoleRoots({ ...valid, [role]: base }, { skipFilesystem: true }), "REGISTRY_PATH"));
    checks.push(expectReject(`v2-${role}-outside-operation`, () => validateRoleRoots({ ...valid, [role]: `/fixture/outside/${role}` }, { skipFilesystem: true }), "REGISTRY_PATH"));
  }
  for (const [left, right] of [["registry_root", "runtime_root"], ["registry_root", "evidence_root"], ["runtime_root", "evidence_root"]]) {
    checks.push(expectReject(`v2-role-equal-${left}-${right}`, () => validateRoleRoots({ ...valid, [right]: valid[left] }, { skipFilesystem: true }), "REGISTRY_PATH"));
    checks.push(expectReject(`v2-role-ancestor-${left}-${right}`, () => validateRoleRoots({ ...valid, [right]: `${valid[left]}/child` }, { skipFilesystem: true }), "REGISTRY_PATH"));
    checks.push(expectReject(`v2-role-ancestor-${right}-${left}`, () => validateRoleRoots({ ...valid, [left]: `${valid[right]}/child` }, { skipFilesystem: true }), "REGISTRY_PATH"));
  }
  checks.push(expectReject("v2-role-case-alias", () => validateRoleRoots({ ...valid, runtime_root: valid.registry_root.toUpperCase() }, { skipFilesystem: true }), "REGISTRY_PATH"));
  checks.push(expectReject("v2-role-separator-alias", () => validateRoleRoots({ ...valid, runtime_root: `${base}//registry` }, { skipFilesystem: true }), "REGISTRY_PATH"));
  return checks;
}

function prepareFixtureSemanticFilesystem(fixture) {
  const inventory = [{ mode: "100644", type: "blob", oid: "c".repeat(40), path: ".claude/fixture.txt", size: 7 }];
  const lsTree = Buffer.from(`100644 blob ${inventory[0].oid}\t${inventory[0].path}\0`);
  fixture.fixtureOutputs[16].stdout = lsTree;
  fixture.registry.rows[16].semantic.parameters.inventory_bytes = lsTree.length;
  fixture.registry.rows[16].semantic.parameters.inventory_sha256 = sha256(lsTree);
  fixture.registry.rows[16].expected.stdout_policy.bytes = lsTree.length;
  fixture.registry.rows[16].expected.stdout_policy.sha256 = sha256(lsTree);
  fixture.registry.rows[17].semantic.parameters.inventory = inventory;
  fs.mkdirSync(path.dirname(fixture.archivePath));
  fs.writeFileSync(fixture.archivePath, tarArchive([{ name: inventory[0].path, data: Buffer.from("fixture") }]), { flag: "wx" });
}

function commandRegistryChecks() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repository-diagnostic-semantic-"));
  const fixture = commandRegistryFixture({ operationRoot: root, registryRoot: path.join(root, "registry"), runtimeRoot: path.join(root, "runtime"), evidenceRoot: path.join(root, "evidence"), home: path.join(root, "runtime/home"), archivePath: path.join(root, "runtime/tree.tar") });
  const { registry, policy, fixtureOutputs } = fixture;
  const options = { policy, skipFilesystem: true, headCommitOid: registry.head_commit_oid, headTreeOid: registry.head_tree_oid };
  prepareFixtureSemanticFilesystem(fixture);
  validateCommandRegistry(registry, options);
  const checks = [{ name: "v2-registry-18-row-closure", status: "PASS" }];
  let spawnIndex = 0;
  let execution;
  try {
    execution = executeCommandRegistry(registry, { ...options, persistEvidence: false, spawn: () => ({ status: 0, signal: null, error: undefined, ...fixtureOutputs[spawnIndex++] }) });
  } finally {
    removeOwnedTemporaryTree(root);
  }
  if (execution.status !== "PASS" || execution.completedRowCount !== 18 || execution.receipts.length !== 18 || spawnIndex !== 18) fail("SELF_CHECK", `all 18 production row shapes did not execute: ${JSON.stringify(execution)}`);
  checks.push(...registry.rows.map((row) => ({ name: `v2-positive-row-${String(row.ordinal).padStart(2, "0")}-${row.semantic.kind}`, status: "PASS" })));
  const renamed = structuredClone(registry);
  renamed.rows[0].id = "RENAMED_WITHOUT_AUTHORITY";
  validateCommandRegistry(renamed, options);
  checks.push({ name: "v2-id-rename-invariance", status: "PASS" });
  const mutations = [
    ["denied-safe-id-dangerous-argv", (value) => { value.rows[0].argv = ["-e", "process.exit()"];}],
    ["denied-git-version", (value) => { value.rows[2].argv = ["--version"];}],
    ["denied-global-status", (value) => { value.rows[10].argv = ["status", "--porcelain=v1"];}],
    ["denied-live-sportsbook", (value) => { value.live_pathspecs[0] = "src/sportsbook/live.js";}],
    ["denied-secret-env", (value) => { value.rows[0].env.API_TOKEN = "x"; value.rows[0].env_allowlist.push("API_TOKEN");}],
    ["denied-env-order", (value) => { value.rows[0].env_allowlist.reverse();}],
    ["denied-relative-cwd", (value) => { value.rows[0].cwd = ".";}],
    ["denied-relative-executable", (value) => { value.rows[0].executable = "node";}],
    ["denied-timeout", (value) => { value.rows[0].timeout_ms = 0;}],
    ["denied-buffer", (value) => { value.rows[0].max_buffer_bytes = 2097153;}],
    ["denied-nineteenth-row", (value) => { value.rows.push(structuredClone(value.rows[17]));}],
    ["denied-unknown-semantic", (value) => { value.rows[0].semantic.kind = "eval/v1";}],
    ["denied-duplicate-destination", (value) => { value.rows[1].evidence.pre_receipt = value.rows[0].evidence.pre_receipt;}],
  ];
  for (const [name, mutate] of mutations) {
    const value = structuredClone(registry);
    mutate(value);
    checks.push(expectReject(name, () => validateCommandRegistry(value, options)));
  }
  const semanticCases = new Set(registry.rows.map((row) => row.semantic.kind));
  if (semanticCases.size !== COMMAND_SEMANTICS.size) fail("SELF_CHECK", "semantic kind coverage drifted");
  checks.push({ name: "v2-all-semantic-kinds", status: "PASS" });
  return checks;
}

function gitRawFramingChecks() {
  const checks = [];
  const receipt = (bytes) => ({ bytes: bytes.length, sha256: sha256(bytes) });
  const porcelainParameters = (bytes, allowedPaths, ledgerPaths = allowedPaths, overrides = {}) => ({ framing: "porcelain-v1-z/raw-bytes", allowed_statuses: GIT_PORCELAIN_STATUSES, include_untracked: true, include_ignored: false, allowed_paths: allowedPaths, ledger_paths: ledgerPaths, ...receipt(bytes), ...overrides });
  const namesParameters = (bytes, allowedPaths) => ({ framing: "name-only-z/raw-bytes", allowed_paths: allowedPaths, ...receipt(bytes) });
  const treeParameters = (bytes, pathspecs = ["root"]) => ({ framing: "ls-tree-z/raw-bytes", pathspecs, inventory_bytes: bytes.length, inventory_sha256: sha256(bytes) });
  const accept = (name, kind, bytes, parameters, verify = () => true) => {
    const value = validateCommandSemantic(kind, bytes, Buffer.alloc(0), parameters);
    checks.push({ name, status: value.status === "PASS" && verify(value) ? "PASS" : "FAIL" });
  };
  const reject = (name, kind, bytes, parameters, stderr = Buffer.alloc(0)) => checks.push(expectReject(name, () => validateCommandSemantic(kind, bytes, stderr, parameters), "SEMANTIC"));
  const fixture = commandRegistryFixture();
  const argvExpected = [
    ["-c", "core.quotepath=false", "status", "--porcelain=v1", "-z", "--untracked-files=normal", "--", ...COMMAND_LIVE_PATHS],
    ["-c", "core.quotepath=false", "status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ...COMMAND_LIVE_PATHS],
    ["-c", "core.quotepath=false", "diff", "--cached", "--name-only", "-z", "--", ...COMMAND_LIVE_PATHS],
    ["ls-tree", "-r", "-z", "--full-tree", fixture.registry.head_tree_oid, "--", ...COMMAND_TREE_PATHS],
  ];
  for (const [index, rowIndex] of [10, 11, 12, 16].entries()) checks.push({ name: `git-command-framing-schema-${index + 1}`, status: JSON.stringify(fixture.registry.rows[rowIndex].argv) === JSON.stringify(argvExpected[index]) && commandShape(fixture.registry.rows[rowIndex], fixture.registry, fixture.policy) ? "PASS" : "FAIL" });

  const porcelainSpace = Buffer.from(" M dir/file name\0");
  accept("git-porcelain-positive-space", "git-porcelain-pathset/v1", porcelainSpace, porcelainParameters(porcelainSpace, ["dir/file name"]));
  const untracked = Buffer.from("?? .gitattributes\0");
  accept("git-porcelain-positive-untracked-attributes", "git-porcelain-pathset/v1", untracked, porcelainParameters(untracked, [".gitattributes"]));
  for (const [name, itemPath] of [["dash", "dir/-name"], ["question", "dir/?name"], ["leading-space", "dir/ name"]]) {
    const bytes = Buffer.from(` M ${itemPath}\0`);
    accept(`git-porcelain-positive-${name}`, "git-porcelain-pathset/v1", bytes, porcelainParameters(bytes, [itemPath]));
  }
  const rename = Buffer.from("R  dir/new name\0dir/old name\0");
  accept("git-porcelain-positive-rename", "git-porcelain-pathset/v1", rename, porcelainParameters(rename, ["dir/new name"], ["dir/new name", "dir/old name"]), (value) => value.records[0].sourcePath === "dir/old name");
  const copy = Buffer.from("C  dir/copy name\0dir/source name\0");
  accept("git-porcelain-positive-copy", "git-porcelain-pathset/v1", copy, porcelainParameters(copy, ["dir/copy name"], ["dir/copy name", "dir/source name"]), (value) => value.records[0].sourcePath === "dir/source name");
  accept("git-porcelain-positive-untracked-gate", "git-porcelain-pathset/v1", untracked, porcelainParameters(untracked, [".gitattributes"], [".gitattributes"], { include_untracked: true }));
  const ignored = Buffer.from("!! ignored/file\0");
  accept("git-porcelain-positive-ignored-gate", "git-porcelain-pathset/v1", ignored, porcelainParameters(ignored, ["ignored/file"], ["ignored/file"], { include_ignored: true }));

  const porcelainNegative = (name, bytes, allowed, ledger = allowed, overrides = {}) => reject(`git-porcelain-negative-${name}`, "git-porcelain-pathset/v1", bytes, porcelainParameters(bytes, allowed, ledger, overrides));
  porcelainNegative("duplicate", Buffer.from(" M a\0 M a\0"), ["a"]);
  porcelainNegative("illegal-xy", Buffer.from("ZZ a\0"), ["a"]);
  porcelainNegative("separator", Buffer.from(" M\ta\0"), ["a"]);
  porcelainNegative("forbidden-untracked", untracked, [".gitattributes"], [".gitattributes"], { include_untracked: false });
  porcelainNegative("forbidden-ignored", ignored, ["ignored/file"]);
  porcelainNegative("missing-source", Buffer.from("R  new\0"), ["new"], ["new", "old"]);
  porcelainNegative("extra-source", Buffer.from(" M current\0source\0"), ["current"], ["current", "source"]);
  porcelainNegative("truncation", Buffer.from(" M truncated"), ["truncated"]);
  porcelainNegative("lf-quoted", Buffer.from(" M \"quoted name\"\n"), ["quoted name"]);
  porcelainNegative("invalid-utf8", Buffer.from([0x20, 0x4d, 0x20, 0xc3, 0x28, 0]), ["bad"]);
  porcelainNegative("outside-destination", Buffer.from(" M outside\0"), ["inside"], ["inside", "outside"]);
  porcelainNegative("outside-source", Buffer.from("R  new\0outside\0"), ["new"], ["new", "old"]);
  porcelainNegative("unsafe-absolute-traversal", Buffer.from(" M ../escape\0"), ["../escape"]);
  porcelainNegative("sportsbook-noncanonical", Buffer.from(" M src/sportsbook/live.js\0"), ["src/sportsbook/live.js"]);
  porcelainNegative("rename-collision", Buffer.from("R  same\0same\0"), ["same"], ["same"]);

  const specialNames = Buffer.from("dir/file name\0dir/-name\0dir/?name\0dir/ name\0");
  accept("git-name-positive-special", "git-name-list/v1", specialNames, namesParameters(specialNames, ["dir/file name", "dir/-name", "dir/?name", "dir/ name"]));
  accept("git-name-positive-empty-bound", "git-name-list/v1", Buffer.alloc(0), namesParameters(Buffer.alloc(0), []));
  const nameNegative = (name, bytes, allowed) => reject(`git-name-negative-${name}`, "git-name-list/v1", bytes, namesParameters(bytes, allowed));
  nameNegative("duplicate", Buffer.from("a\0a\0"), ["a"]);
  nameNegative("framing-utf8", Buffer.from([0xc3, 0x28, 0]), ["bad"]);
  nameNegative("unsafe-outside", Buffer.from("../escape\0"), ["../escape"]);
  nameNegative("lf-quoted", Buffer.from("\"name\"\n"), ["name"]);

  const oid = "c".repeat(40);
  const treeSpecial = Buffer.from(["root/ file", "root/-file", "root/?file", "root/file name"].map((item) => `100644 blob ${oid}\t${item}\0`).join(""));
  accept("git-tree-positive-first-tab", "git-ls-tree-z/v1", treeSpecial, treeParameters(treeSpecial), (value) => value.inventory.length === 4);
  accept("git-tree-positive-special-bytes", "git-ls-tree-z/v1", treeSpecial, treeParameters(treeSpecial), (value) => value.inventory[0].path === "root/ file");
  const treeNegative = (name, bytes, pathspecs = ["root"]) => reject(`git-tree-negative-${name}`, "git-ls-tree-z/v1", bytes, treeParameters(bytes, pathspecs));
  treeNegative("malformed-multiple-tab", Buffer.from(`100644 blob ${oid}\troot/a\textra\0`));
  treeNegative("invalid-utf8", Buffer.concat([Buffer.from(`100644 blob ${oid}\troot/`), Buffer.from([0xc3, 0x28, 0])]));
  treeNegative("duplicate-unsafe", Buffer.from(`100644 blob ${oid}\troot/a\0${`100644 blob ${oid}\troot/a\0`}`));
  treeNegative("empty-bypass", Buffer.alloc(0));

  const sharedUnsafe = ["/absolute", "a/../b", "a\\b", "src/sportsbook/live.js"];
  for (const [index, itemPath] of sharedUnsafe.entries()) {
    const bytes = Buffer.from(`${itemPath}\0`);
    reject(`git-shared-path-safety-${index + 1}`, "git-name-list/v1", bytes, namesParameters(bytes, [itemPath]));
  }
  checks.push({ name: "anti-cheat-git-positive-empty-buffer", status: porcelainSpace.length > 0 ? "PASS" : "FAIL" });
  const semanticSource = validateCommandSemantic.toString();
  checks.push({ name: "anti-cheat-git-parser-bypass", status: semanticSource.includes("parseGitPorcelainZ(out, err, parameters)") && semanticSource.includes("parseGitNameListZ(out, err, parameters)") && semanticSource.includes("parseGitLsTreeZ(out, err, parameters)") ? "PASS" : "FAIL" });
  if (checks.length !== 46 || checks.some((item) => item.status !== "PASS")) fail("SELF_CHECK", `raw Git framing checks failed: ${JSON.stringify(checks.filter((item) => item.status !== "PASS"))}`);
  return checks;
}

function acceptanceSemanticBypass(source) {
  return /\bsemantic\s*:/.test(source) || /validateCommandSemantic\s*=/.test(source) || /semanticStatus\s*:\s*["']PASS["']/.test(source);
}

function semanticStreamConsistencyChecks() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repository-diagnostic-semantic-family-"));
  const fixture = commandRegistryFixture({ operationRoot: root, registryRoot: path.join(root, "registry"), runtimeRoot: path.join(root, "runtime"), evidenceRoot: path.join(root, "evidence"), home: path.join(root, "runtime/home"), archivePath: path.join(root, "runtime/tree.tar") });
  const options = { policy: fixture.policy, skipFilesystem: true, headCommitOid: fixture.registry.head_commit_oid, headTreeOid: fixture.registry.head_tree_oid, persistEvidence: false };
  prepareFixtureSemanticFilesystem(fixture);
  let spawnIndex = 0;
  let execution;
  try {
    execution = executeCommandRegistry(fixture.registry, { ...options, spawn: () => ({ status: 0, signal: null, error: undefined, ...fixture.fixtureOutputs[spawnIndex++] }) });
  } finally {
    removeOwnedTemporaryTree(root);
  }
  if (execution.status !== "PASS") fail("SELF_CHECK", "production semantic positive family failed");
  const checks = fixture.registry.rows.slice(0, 5).map((row) => ({ name: `semantic-production-positive-${row.semantic.kind}`, status: "PASS" }));
  const rejectSemantic = (name, kind, stdout, parameters, stderr = Buffer.alloc(0)) => checks.push(expectReject(name, () => validateCommandSemantic(kind, stdout, stderr, parameters), "SEMANTIC"));
  rejectSemantic("semantic-negative-missing-space", "version-chrome/v1", Buffer.from("Chrome 1\n"), { expected: "Chrome 1 " });
  rejectSemantic("semantic-negative-extra-space", "version-node/v1", Buffer.from("v24.0.0 \n"), { expected: "v24.0.0" });
  rejectSemantic("semantic-negative-missing-lf", "version-npm/v1", Buffer.from("11.0.0"), { expected: "11.0.0" });
  rejectSemantic("semantic-negative-crlf", "version-vite/v1", Buffer.from("vite/7\r\n"), { expected: "vite/7" });
  rejectSemantic("semantic-negative-stderr", "version-node/v1", Buffer.from("v24.0.0\n"), { expected: "v24.0.0" }, Buffer.from("warning\n"));
  rejectSemantic("semantic-negative-wrong-value", "git-head-oid/v1", Buffer.from(`${"c".repeat(40)}\n`), { head_commit_oid: "a".repeat(40) });
  for (const rowIndex of [0, 1, 2, 3, 4]) {
    const candidate = structuredClone(fixture.registry);
    candidate.rows[rowIndex].expected.stdout_policy.bytes += 1;
    let spawnCount = 0;
    checks.push(expectReject(`semantic-policy-preflight-${candidate.rows[rowIndex].semantic.kind}`, () => executeCommandRegistry(candidate, { ...options, spawn: () => { spawnCount += 1; return { status: 0, signal: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }; } }), "REGISTRY_EXPECTED"));
    if (spawnCount !== 0) fail("SELF_CHECK", "semantic policy mismatch reached spawn");
  }
  const acceptanceSource = commandRegistryChecks.toString();
  const isolatedSource = commandResultChecks.toString();
  const mutant = acceptanceSource.replace("persistEvidence: false, spawn:", "persistEvidence: false, semantic: () => ({ status: \"PASS\" }), spawn:");
  if (acceptanceSemanticBypass(acceptanceSource) || !acceptanceSemanticBypass(mutant) || !acceptanceSemanticBypass(isolatedSource)) fail("SELF_CHECK", "semantic acceptance bypass source gate failed");
  checks.push({ name: "semantic-positive-source-bypass-rejected", status: "PASS" });
  if (checks.length !== 17) fail("SELF_CHECK", `semantic stream consistency checks failed: ${checks.length}`);
  return checks;
}

const SOURCE_AUTHORITY_PATHS = {
  runner: ".claude/skills/vc-audit-vc/scripts/run-repository-diagnostic-evidence.mjs",
  validator: ".claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs",
};

function tokenizeJavaScriptSource(bytes, label) {
  const source = decodeLiteralInput(bytes);
  const tokens = [];
  const delimiters = [];
  const matching = { "(": ")", "[": "]", "{": "}" };
  const expressionPrefix = new Set(["(", "[", "{", ",", ";", ":", "=", "==", "===", "!=", "!==", "!", "&&", "||", "?", "=>", "return", "case", "throw"]);
  let index = 0;
  let previous = null;
  const push = (type, value) => {
    tokens.push({ type, value });
    previous = value;
  };
  while (index < source.length) {
    const character = source[index];
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (source.startsWith("//", index)) {
      const end = source.indexOf("\n", index + 2);
      index = end === -1 ? source.length : end + 1;
      continue;
    }
    if (source.startsWith("/*", index)) {
      const end = source.indexOf("*/", index + 2);
      if (end === -1) fail("SOURCE_AUDIT", `${label} has an unterminated block comment`);
      index = end + 2;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      const quote = character;
      let value = "";
      let closed = false;
      index += 1;
      while (index < source.length) {
        const item = source[index];
        if (item === "\\") {
          if (index + 1 >= source.length) fail("SOURCE_AUDIT", `${label} has an unterminated escape`);
          value += source.slice(index, index + 2);
          index += 2;
          continue;
        }
        if (item === quote) {
          index += 1;
          closed = true;
          break;
        }
        value += item;
        index += 1;
      }
      if (!closed) fail("SOURCE_AUDIT", `${label} has an unterminated string or template literal`);
      push(quote === "`" ? "template" : "string", value);
      continue;
    }
    if (character === "/" && source[index + 1] !== "=" && (previous === null || expressionPrefix.has(previous))) {
      let value = "/";
      let escaped = false;
      let characterClass = false;
      let closed = false;
      index += 1;
      while (index < source.length) {
        const item = source[index++];
        value += item;
        if (escaped) {
          escaped = false;
          continue;
        }
        if (item === "\\") {
          escaped = true;
          continue;
        }
        if (item === "[") characterClass = true;
        if (item === "]") characterClass = false;
        if (item === "/" && !characterClass) {
          while (/[A-Za-z]/.test(source[index] ?? "")) value += source[index++];
          closed = true;
          break;
        }
        if (item === "\n") break;
      }
      if (!closed) fail("SOURCE_AUDIT", `${label} has an unterminated regular expression`);
      push("regex", value);
      continue;
    }
    const identifier = source.slice(index).match(/^[A-Za-z_$][A-Za-z0-9_$]*/)?.[0];
    if (identifier) {
      push("identifier", identifier);
      index += identifier.length;
      continue;
    }
    const number = source.slice(index).match(/^(?:0[xob][0-9a-f]+|\d+(?:\.\d+)?)/i)?.[0];
    if (number) {
      push("number", number);
      index += number.length;
      continue;
    }
    const operator = ["===", "!==", "=>", "==", "!=", "<=", ">=", "&&", "||", "??", "?.", "++", "--", "**", "..."].find((item) => source.startsWith(item, index)) ?? character;
    if (Object.hasOwn(matching, operator)) delimiters.push(operator);
    else if ([")", "]", "}"].includes(operator)) {
      const opening = delimiters.pop();
      if (!opening || matching[opening] !== operator) fail("SOURCE_AUDIT", `${label} has unbalanced delimiters`);
    }
    push("operator", operator);
    index += operator.length;
  }
  if (delimiters.length !== 0) fail("SOURCE_AUDIT", `${label} has unbalanced delimiters`);
  return tokens;
}

function auditProductionSourceBindings(entries, validatorRows = []) {
  if (!Array.isArray(entries) || entries.length !== 2) fail("SOURCE_AUDIT", "source authority list must contain exactly two entries");
  const roles = new Set();
  for (const entry of entries) {
    if (!entry || !Object.hasOwn(SOURCE_AUTHORITY_PATHS, entry.role) || roles.has(entry.role)) fail("SOURCE_AUDIT", "source authority roles must be unique runner and validator entries");
    roles.add(entry.role);
    if (entry.canonicalPath !== SOURCE_AUTHORITY_PATHS[entry.role]) fail("SOURCE_AUDIT", `${entry.role} canonical path was substituted`);
    if (!Buffer.isBuffer(entry.bytes)) fail("SOURCE_AUDIT", `${entry.role} bytes must be a Buffer`);
    const digest = sha256(entry.bytes);
    if (entry.sha256 !== undefined && entry.sha256 !== digest) fail("SOURCE_AUDIT", `${entry.role} byte/SHA binding drifted`);
    const tokens = tokenizeJavaScriptSource(entry.bytes, entry.role);
    const ownRoles = new Set(entry.role === "runner" ? ["self", "runner"] : ["self", "validator", "envelopeValidator"]);
    const ownPlaceholders = new Set(["SELF_" + "SHA256", "__SELF_" + "SHA256__", "<SELF_" + "SHA256>", entry.role.toUpperCase() + "_SELF_" + "SHA256"]);
    for (const token of tokens) {
      if (!["string", "template"].includes(token.type)) continue;
      if (token.value === digest || token.value === digest.toUpperCase() || ownPlaceholders.has(token.value)) fail("SOURCE_SELF_BINDING", `${entry.role} source binds its own digest`);
    }
    for (let roleIndex = 0; roleIndex < tokens.length - 3; roleIndex += 1) {
      if (!ownRoles.has(tokens[roleIndex].value) || tokens[roleIndex + 1].value !== ":" || tokens[roleIndex + 2].value !== "{") continue;
      let depth = 1;
      let end = roleIndex + 3;
      for (; end < tokens.length && depth > 0; end += 1) {
        if (tokens[end].value === "{") depth += 1;
        if (tokens[end].value === "}") depth -= 1;
      }
      if (depth !== 0) fail("SOURCE_AUDIT", `${entry.role} authority object is unbalanced`);
      const objectTokens = tokens.slice(roleIndex + 3, end - 1);
      const hasDigestProperty = objectTokens.some((token, tokenIndex) => ["sha", "sha256", "digest", "hash"].includes(token.value) && objectTokens[tokenIndex + 1]?.value === ":");
      const hasOwnInput = objectTokens.some((token) => [entry.canonicalPath, path.basename(entry.canonicalPath), "import.meta.filename", "process.argv[1]"].includes(token.value)) || objectTokens.some((token, tokenIndex) => token.value === "import" && objectTokens.slice(tokenIndex, tokenIndex + 5).map((item) => item.value).join(".").includes("import...meta.filename"));
      const computesDigest = objectTokens.some((token) => ["sha256", "createHash", "readFileSync", "bytes"].includes(token.value));
      if (hasDigestProperty && hasOwnInput && computesDigest) fail("SOURCE_SELF_BINDING", `${entry.role} authority object computes its own digest`);
    }
  }
  if (roles.size !== 2) fail("SOURCE_AUDIT", "source authority roles are incomplete");
  const forbiddenRegistryBinding = /registry(?:_|)(?:path|bytes|sha256)|digest(?:_|-)(?:placeholder|derived)|registrySha256/;
  if (validatorRows.some((row) => forbiddenRegistryBinding.test(JSON.stringify({ expected: row.expected, semantic: row.semantic })))) fail("SOURCE_SELF_BINDING", "validator registry self-reference remained");
  return true;
}

function sourceAuthorityEntries(repositoryRoot, overrides = {}) {
  return Object.entries(SOURCE_AUTHORITY_PATHS).map(([role, canonicalPath]) => {
    const physicalPath = overrides[role] ?? path.join(repositoryRoot, canonicalPath);
    const bytes = fs.readFileSync(physicalPath);
    return { role, canonicalPath, basename: path.basename(canonicalPath), physicalPath, bytes, sha256: sha256(bytes) };
  });
}

const SYNTHETIC_DOCUMENTS = Object.freeze({
  plan: Object.freeze({
    path: "process/general-plans/active/synthetic-validator-plan_03-09-26/synthetic-validator-plan_PLAN_03-09-26.md",
    bytes: Buffer.from("---\nname: plan:synthetic-validator-plan\ndescription: Synthetic validator plan\ndate: 03-09-26\nfeature: synthetic\n---\n# Synthetic Validator Plan\n\n**Date**: 03-09-26\n**Complexity**: SIMPLE\n**Status**: VALIDATE\n\n## Context\n\nUses process/context/all-context.md and process/context/tests/all-tests.md.\n\n## Phase Completion Rules\n\nPass every gate.\n\n## Implementation Checklist\n\n- Validate literals.\n\n## Acceptance Criteria\n\n- Validators pass.\n\n## Touchpoints\n\nSynthetic files only.\n\n## Public Contracts\n\nNone.\n\n## Blast Radius\n\nTemporary root only.\n\n## Verification Evidence\n\nStrict validator output.\n\n## Test Procedure\n\nRun the actual validator.\n\n## Test Infra Improvement Notes\n\nNone.\n\n## Resume and Execution Handoff\n\nRIPER-5 Next Step: EXECUTE.\n\n## Validate Contract\n\nStatus: PASS\n", "utf8"),
  }),
  phase: Object.freeze({
    path: "process/features/synthetic/active/synthetic-phase_03-09-26/synthetic-phase_PLAN_03-09-26.md",
    bytes: Buffer.from("---\nname: plan:synthetic-phase\ndescription: Synthetic phase\ndate: 03-09-26\nfeature: synthetic\ntype: plan\nphase: \"01\"\n---\n# Synthetic Phase\n\n## Phase Loop Progress\n\n1. RESEARCH\n2. INNOVATE\n3. PLAN\n4. PVL\n5. EXECUTE\n6. EVL\n7. UPDATE PROCESS\n\n**Validate-contract required**\n\n## Objective\n\nValidate the phase literal.\n\n## Exit Gate\n\nPass.\n\n## Blast Radius\n\nTemporary root only.\n\nUmbrella plan: synthetic-program-umbrella_PLAN_03-09-26.md.\n\n## Validate Contract\n\nStatus: PASS\n", "utf8"),
  }),
  umbrella: Object.freeze({
    path: "process/features/synthetic/active/synthetic-program_03-09-26/synthetic-program-umbrella_PLAN_03-09-26.md",
    bytes: Buffer.from(["---", "name: plan:synthetic-program", "description: Synthetic umbrella", "date: 03-09-26", "feature: synthetic", "type: plan", `phase: ${"umbrella"}`, "---", "# Synthetic Program", "", "Status: VALIDATE", "", "## Context", "", "Synthetic program.", "", "## Implementation Checklist", "", "- Validate literals.", "", "## Verification Evidence", "", "Strict validator output.", "", "## Program Goal Charter", "", "Synthetic charter.", "", "## Stable Program Goal", "", "Validate committed validators against generated operands.", "", "## Current Execution State", "", "VALIDATE.", "", "## Phase Ordering", "", "Phase 01 only; no external path reference.", "", "## Program Status Table", "", "| Phase | Status |", "|---|---|", "| 01 | VALIDATE |", "", "## Per-Phase Loop", "", "Use RIPER-5.", "", "## Global Constraints", "", "Temporary files only.", "", "## Durable Report Destinations", "", "None.", "", "## Validate Contract", "", "Status: PASS", ""].join("\n"), "utf8"),
  }),
});

function makeOwnedDirectories(root, targetDirectory) {
  const relative = path.relative(root, targetDirectory);
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (!fs.existsSync(current)) fs.mkdirSync(current);
  }
}

function writeExclusiveDocument(root, document) {
  const target = path.join(root, document.path);
  makeOwnedDirectories(root, path.dirname(target));
  fs.writeFileSync(target, document.bytes, { flag: "wx" });
  return target;
}

function removeOwnedTemporaryTree(root) {
  if (!fs.existsSync(root)) return;
  const entries = [];
  const visit = (target) => {
    const item = fs.lstatSync(target, { bigint: true });
    if (item.isSymbolicLink()) fail("IDENTITY_MISMATCH", `temporary teardown refused alias ${target}`);
    if (item.isDirectory()) {
      entries.push({ path: target, operation: "rmdir", identity: identity(item) });
      for (const name of fs.readdirSync(target)) visit(path.join(target, name));
      return;
    }
    if (!item.isFile()) fail("IDENTITY_MISMATCH", `temporary teardown refused unexpected type ${target}`);
    entries.push({ path: target, operation: "unlink", identity: identity(item) });
  };
  visit(root);
  removeOwnedLedger(entries);
}

function validatorSemanticContractChecks() {
  const checks = [];
  const repositoryRoot = process.cwd();
  const syntheticRoot = fs.mkdtempSync(path.join(os.tmpdir(), "repository-diagnostic-synthetic-"));
  const policy = commandPolicy({ repositoryRoot });
  const outputs = new Map();
  let selectedPlan;
  let phasePlan;
  let umbrella;
  let goal;
  try {
    spawnSync("/usr/bin/git", ["init", "--quiet"], { cwd: syntheticRoot, shell: false, encoding: null });
    selectedPlan = SYNTHETIC_DOCUMENTS.plan.path;
    phasePlan = SYNTHETIC_DOCUMENTS.phase.path;
    umbrella = SYNTHETIC_DOCUMENTS.umbrella.path;
    for (const document of Object.values(SYNTHETIC_DOCUMENTS)) writeExclusiveDocument(syntheticRoot, document);
    const proofBytes = fs.readFileSync(path.join(repositoryRoot, PROOF_PATHS[0]));
    if (proofBytes.length !== 647 || sha256(proofBytes) !== "08c300a11138312edf254f3e6c5237ed340c6dc95468dd44dba24dff494cbb0f") fail("SELF_CHECK", "committed standing proof bytes drifted");
    goal = path.join(syntheticRoot, "proof/standing-goal-block.md");
    makeOwnedDirectories(syntheticRoot, path.dirname(goal));
    fs.writeFileSync(goal, proofBytes, { flag: "wx" });
    const envelopeProof = path.join(syntheticRoot, PROOF_PATHS[0]);
    makeOwnedDirectories(syntheticRoot, path.dirname(envelopeProof));
    fs.writeFileSync(envelopeProof, proofBytes, { flag: "wx" });
    const noConsent = path.join(syntheticRoot, "proof/no-consent-goal-block.md");
    fs.writeFileSync(noConsent, fs.readFileSync(path.join(repositoryRoot, PROOF_PATHS[1])), { flag: "wx" });
    for (const sourcePath of [...COMMITTED_VALIDATOR_PATHS, ...Object.values(SOURCE_AUTHORITY_PATHS)]) {
      const target = path.join(syntheticRoot, sourcePath);
      makeOwnedDirectories(syntheticRoot, path.dirname(target));
      fs.writeFileSync(target, fs.readFileSync(path.join(repositoryRoot, sourcePath)), { flag: "wx" });
    }
    const syntheticVite = path.join(syntheticRoot, "node_modules/vite/bin/vite.js");
    makeOwnedDirectories(syntheticRoot, path.dirname(syntheticVite));
    fs.writeFileSync(syntheticVite, Buffer.from("#!/usr/bin/env node\n", "utf8"), { flag: "wx" });
    spawnSync("/usr/bin/git", ["-c", "user.name=Repository Diagnostic", "-c", "user.email=diagnostic@example.invalid", "add", "-f", "--", "process", ".claude", "node_modules/vite/bin/vite.js"], { cwd: syntheticRoot, shell: false, encoding: null });
    const syntheticCommit = spawnSync("/usr/bin/git", ["-c", "user.name=Repository Diagnostic", "-c", "user.email=diagnostic@example.invalid", "commit", "--quiet", "-m", "synthetic validator operands"], { cwd: syntheticRoot, shell: false, encoding: null });
    if (syntheticCommit.status !== 0) fail("SELF_CHECK", "synthetic validator repository commit failed");
    const noConsentChild = spawnSync(process.execPath, [policy.goalValidator, noConsent], { cwd: syntheticRoot, shell: false, encoding: null, timeout: 120000, maxBuffer: 1048576 });
    if (noConsentChild.status === 0 || !Buffer.from(noConsentChild.stdout ?? Buffer.alloc(0)).includes(Buffer.from("does not contain \"standing-granted\""))) fail("SELF_CHECK", "actual goal validator accepted no-consent proof");
    const definitions = [
      ["plan", "validator-plan-json-clean/v1", policy.planValidator, ["--strict", selectedPlan], { argv_path: selectedPlan, target_path: selectedPlan }],
      ["phase", "validator-phase-json-clean/v1", policy.phaseValidator, ["--strict", phasePlan], { argv_path: phasePlan, target_path: phasePlan }],
      ["umbrella", "validator-umbrella-json-clean/v1", policy.umbrellaValidator, ["--strict", umbrella], { argv_path: umbrella, target_path: umbrella }],
      ["goal", "validator-goal-pass-line/v1", policy.goalValidator, [goal], { goal, lane: "absent" }],
    ];
    for (const [name, kind, script, argv, parameters] of definitions) {
      const child = spawnSync(process.execPath, [script, ...argv], { cwd: syntheticRoot, shell: false, encoding: null, timeout: 120000, maxBuffer: 1048576 });
      if (child.error || child.signal !== null || child.status !== 0) fail("SELF_CHECK", `actual ${name} validator failed: ${Buffer.from(child.stdout ?? Buffer.alloc(0)).toString("utf8")}`);
      const stdout = Buffer.from(child.stdout ?? Buffer.alloc(0));
      const stderr = Buffer.from(child.stderr ?? Buffer.alloc(0));
      validateCommandSemantic(kind, stdout, stderr, parameters);
      outputs.set(name, { kind, stdout, parameters });
      checks.push({ name: `validator-actual-${name}-production-output`, status: "PASS" });
    }
    const envelopeParameters = { selected_plan: selectedPlan, authority_class: "repository-diagnostic-evidence-set/v2", mode: "standing-granted", proof_path: PROOF_PATHS[0], scope_count: 76, stop_condition_count: 5, artifact_receipt_schema_version: RECEIPT_SCHEMA, artifact_destination_count: 76 };
    const envelopeChild = spawnSync(process.execPath, [path.join(syntheticRoot, SOURCE_AUTHORITY_PATHS.validator), "--v2-validation-fixture", selectedPlan], { cwd: syntheticRoot, shell: false, encoding: null, timeout: 120000, maxBuffer: 1048576 });
    if (envelopeChild.error || envelopeChild.signal !== null || envelopeChild.status !== 0) fail("SELF_CHECK", `actual envelope validator failed: ${Buffer.from(envelopeChild.stderr ?? Buffer.alloc(0)).toString("utf8")}`);
    const envelopeOutput = Buffer.from(envelopeChild.stdout ?? Buffer.alloc(0));
    const envelopeStderr = Buffer.from(envelopeChild.stderr ?? Buffer.alloc(0));
    validateCommandSemantic("validator-envelope-json-clean/v1", envelopeOutput, envelopeStderr, envelopeParameters);
    const envelopeValue = JSON.parse(envelopeOutput);
    outputs.set("envelope", { kind: "validator-envelope-json-clean/v1", stdout: envelopeOutput, parameters: envelopeParameters });
    checks.push({ name: "validator-actual-envelope-production-output", status: "PASS" });

  const reject = (name, kind, stdout, parameters, stderr = Buffer.alloc(0)) => checks.push(expectReject(name, () => validateCommandSemantic(kind, stdout, stderr, parameters)));
  const jsonOutput = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  for (const name of ["plan", "phase", "umbrella"]) {
    const { kind, stdout, parameters } = outputs.get(name);
    const baseline = JSON.parse(stdout);
    const mutations = [
      ["checkedPlans", (value) => { value.checkedPlans = []; }],
      ["strict", (value) => { value.strict = false; }],
      ["warnings", (value) => { value.warnings = ["warning"]; }],
      ["failures", (value) => { value.failures = ["failure"]; }],
      ["entry-path", (value) => { value.checkedPlans[0].path = "wrong.md"; }],
      ["entry-failures", (value) => { value.checkedPlans[0].failures = 1; }],
      ["entry-warnings", (value) => { value.checkedPlans[0].warnings = 1; }],
      ["entry-lines", (value) => { value.checkedPlans[0].lines = 0; }],
    ];
    for (const [field, mutate] of mutations) {
      const value = structuredClone(baseline);
      mutate(value);
      reject(`validator-${name}-wrong-${field}`, kind, jsonOutput(value), parameters);
    }
  }
  for (const [field, value] of [["target", "wrong.md"], ["lane", "quick"]]) {
    const goalRecord = outputs.get("goal");
    const text = field === "target" ? `PASS: ${value} — all required fields present, LANE field: absent\n` : `PASS: ${goal} — all required fields present, LANE field: ${value}\n`;
    reject(`validator-goal-wrong-${field}`, goalRecord.kind, Buffer.from(text), goalRecord.parameters);
  }
  for (const key of Object.keys(envelopeValue)) {
    const value = structuredClone(envelopeValue);
    value[key] = typeof value[key] === "number" ? value[key] + 1 : `${value[key]}-wrong`;
    reject(`validator-envelope-wrong-${key}`, "validator-envelope-json-clean/v1", jsonOutput(value), envelopeParameters);
  }
  for (const name of ["plan", "phase", "umbrella", "envelope"]) {
    const { kind, stdout, parameters } = outputs.get(name);
    const missing = JSON.parse(stdout);
    delete missing[Object.keys(missing)[0]];
    reject(`validator-${name}-missing-field`, kind, jsonOutput(missing), parameters);
    const extra = { ...JSON.parse(stdout), extra: true };
    reject(`validator-${name}-extra-field`, kind, jsonOutput(extra), parameters);
  }
  for (const name of ["plan", "phase", "umbrella", "goal", "envelope"]) {
    const { kind, stdout, parameters } = outputs.get(name);
    const mismatched = { ...parameters, [name === "goal" ? "goal" : name === "envelope" ? "selected_plan" : "target_path"]: "argv-path-mismatch.md" };
    reject(`validator-${name}-argv-path-mismatch`, kind, stdout, mismatched);
    reject(`validator-${name}-crlf`, kind, Buffer.from(stdout.toString("utf8").replaceAll("\n", "\r\n")), parameters);
    reject(`validator-${name}-extra-record`, kind, Buffer.concat([stdout, stdout]), parameters);
    reject(`validator-${name}-non-empty-stderr`, kind, stdout, parameters, Buffer.from("unexpected\n"));
  }
  const fixture = commandRegistryFixture({ repositoryRoot });
  const validatorRows = fixture.registry.rows.filter((row) => row.capability_class === "diagnostic-validator");
  auditProductionSourceBindings(sourceAuthorityEntries(repositoryRoot), validatorRows);
  const mutationRoots = [];
  try {
    for (const role of ["runner", "validator"]) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), `repository-diagnostic-source-${role}-`));
      mutationRoots.push(root);
      const isolatedPath = path.join(root, path.basename(SOURCE_AUTHORITY_PATHS[role]));
      const original = fs.readFileSync(path.join(repositoryRoot, SOURCE_AUTHORITY_PATHS[role]));
      const placeholder = role === "runner" ? "RUNNER_SELF_" + "SHA256" : "VALIDATOR_SELF_" + "SHA256";
      const authorityRole = role === "runner" ? "runner" : "envelopeValidator";
      const mutation = Buffer.concat([original, Buffer.from(`\nconst isolatedSelfAuthority = { ${authorityRole}: { sha256: "${placeholder}", source: import.meta.filename } };\nvoid isolatedSelfAuthority;\n`)]);
      fs.writeFileSync(isolatedPath, mutation, { flag: "wx" });
      const overrides = { [role]: isolatedPath };
      const entries = sourceAuthorityEntries(repositoryRoot, overrides);
      checks.push(expectReject(`validator-${role}-isolated-own-digest-binding`, () => auditProductionSourceBindings(entries, validatorRows), "SOURCE_SELF_BINDING"));
    }
    const controls = {
      runner: Buffer.from('const HASH_PATTERN = /^[0-9a-f]{64}$/;\nconst algorithm = "sha256";\nconst digest = createHash(algorithm).update(externalInputBytes).digest("hex");\n'),
      validator: Buffer.from('const runnerAuthority = { runner: { sha256: runnerDigest, source: runnerPath } };\n'),
    };
    const controlEntries = Object.entries(SOURCE_AUTHORITY_PATHS).map(([role, canonicalPath]) => ({ role, canonicalPath, basename: path.basename(canonicalPath), physicalPath: canonicalPath, bytes: controls[role], sha256: sha256(controls[role]) }));
    auditProductionSourceBindings(controlEntries, validatorRows);
  } finally {
    for (const root of mutationRoots.reverse()) if (fs.existsSync(root)) removeFlatDirectory(root);
  }
  if (mutationRoots.some((root) => fs.existsSync(root))) fail("SELF_CHECK", "isolated source mutation residue remained");
  checks.splice(-2, 2);
  checks.push({ name: "validator-registry-self-reference-static-rejection", status: "PASS" });
  const firstBytes = Buffer.from(`${JSON.stringify(fixture.registry, null, 2)}\n`);
  const firstDigest = sha256(firstBytes);
  const secondBytes = Buffer.from(`${JSON.stringify(JSON.parse(firstBytes), null, 2)}\n`);
  if (!firstBytes.equals(secondBytes) || firstDigest !== sha256(secondBytes)) fail("SELF_CHECK", "registry two-pass canonical identity drifted");
  checks.push({ name: "validator-registry-two-pass-byte-digest-equality", status: "PASS" });
  const childExpectations = validatorRows.map((row) => [row.expected.stdout_policy, row.expected.stderr_policy]);
  const changed = structuredClone(fixture.registry);
  changed.head_commit_oid = "c".repeat(40);
  const changedBytes = Buffer.from(`${JSON.stringify(changed, null, 2)}\n`);
  if (firstBytes.equals(changedBytes) || firstDigest === sha256(changedBytes) || JSON.stringify(childExpectations) !== JSON.stringify(changed.rows.filter((row) => row.capability_class === "diagnostic-validator").map((row) => [row.expected.stdout_policy, row.expected.stderr_policy]))) fail("SELF_CHECK", "registry metadata change altered child expectations");
    checks.push({ name: "validator-registry-change-child-expectation-invariance", status: "PASS" });
    if (checks.length !== 72 || checks.some((item) => item.status !== "PASS")) fail("SELF_CHECK", `validator semantic contract checks failed: ${checks.length}`);
  } finally {
    removeOwnedTemporaryTree(syntheticRoot);
  }
  return checks;
}

function validateScopedIndexCommand(argv, env = {}) {
  if (!Array.isArray(argv) || argv.some((item) => typeof item !== "string")) fail("INDEX_SCOPE", "Git command argv must be text");
  if (isNonEmptyText(env.GIT_INDEX_FILE)) {
    absoluteNormalized(env.GIT_INDEX_FILE, "GIT_INDEX_FILE");
    return true;
  }
  const separator = argv.indexOf("--");
  const scopedPaths = separator === -1 ? [] : argv.slice(separator + 1);
  const readsIndex = argv.includes("--cached") || argv.includes("--staged") || ["status", "ls-files", "write-tree", "diff-index"].some((name) => argv.includes(name));
  if (!readsIndex || JSON.stringify(scopedPaths) !== JSON.stringify(HARNESS_COMMIT_PATHS)) fail("INDEX_SCOPE", "real-index observation must be the exact harness pathspec intersection");
  return true;
}

function productionRuntimeContractChecks() {
  const runnerPath = path.resolve(import.meta.dirname, "run-repository-diagnostic-evidence.mjs");
  const invokeOracle = (flag) => {
    const child = spawnSync(process.execPath, [runnerPath, flag], { shell: false, encoding: "utf8", timeout: 120000, maxBuffer: 1024 * 1024 });
    if (child.status !== 0 || child.signal !== null || child.error || child.stderr.length !== 0) fail("SELF_CHECK", `${flag} production subprocess failed`);
    return JSON.parse(child.stdout);
  };
  const success = invokeOracle("--v2-execution-oracle");
  const rowFailure = invokeOracle("--v2-execution-failure-oracle");
  const cli = runV2CliSubprocessOracle();
  if (success.cleanup_manifest_count !== success.cleanup_operation_count || rowFailure.cleanup_manifest_count !== rowFailure.cleanup_operation_count || cli.status !== "PASS" || cli.scenario_count !== 5) fail("SELF_CHECK", "production cleanup ledger/event count or CLI scenario drifted");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repository-diagnostic-supplement10-"));
  const runtimeRoot = path.join(root, "runtime");
  const evidenceRoot = path.join(root, "evidence");
  fs.mkdirSync(runtimeRoot);
  fs.mkdirSync(evidenceRoot);
  const retained = path.join(runtimeRoot, "retained.tmp");
  fs.writeFileSync(retained, "owned", { flag: "wx" });
  const retainedIdentity = identity(fs.lstatSync(retained, { bigint: true }));
  const lifecyclePaths = Object.fromEntries(["terminal", "result", "failure", "cleanup"].map((name) => [name, path.join(evidenceRoot, `${name}.json`)]));
  let cleanupFailure;
  let publicationFailure;
  let earlierPublicationFailure;
  const removeExact = (target, operation) => {
    const observed = identity(fs.lstatSync(target, { bigint: true }));
    deletionEffectAdapter().remove(target, operation, observed, observed);
  };
  try {
    cleanupFailure = runDiagnosticLifecycle({ attemptId: "cleanup-action-failure", evidenceRoot, runtimeRoot, execute: () => ({ terminal: sampleTerminal("FAIL") }), terminalArtifactPath: lifecyclePaths.terminal, resultArtifactPath: lifecyclePaths.result, failureArtifactPath: lifecyclePaths.failure, cleanupArtifactPath: lifecyclePaths.cleanup, cleanupTargets: [{ path: retained, operation: "unlink", identity: { ...retainedIdentity, ino: String(BigInt(retainedIdentity.ino) + 1n) } }] });
    for (const target of Object.values(lifecyclePaths)) if (fs.existsSync(target)) removeExact(target, "unlink");
    publicationFailure = runDiagnosticLifecycle({ attemptId: "cleanup-publication-failure", evidenceRoot, runtimeRoot, execute: () => ({ terminal: sampleTerminal() }), terminalArtifactPath: lifecyclePaths.terminal, resultArtifactPath: lifecyclePaths.result, failureArtifactPath: lifecyclePaths.failure, cleanupArtifactPath: lifecyclePaths.cleanup, cleanupTargets: [] }, { create: (target, bytes, options) => { if (target === lifecyclePaths.cleanup) fail("EVIDENCE_IO", "injected cleanup publication failure"); return createEvidenceArtifact(target, bytes, options); } });
    for (const target of Object.values(lifecyclePaths)) if (fs.existsSync(target)) removeExact(target, "unlink");
    earlierPublicationFailure = runDiagnosticLifecycle({ attemptId: "cleanup-publication-secondary", evidenceRoot, runtimeRoot, execute: () => ({ terminal: sampleTerminal("FAIL") }), terminalArtifactPath: lifecyclePaths.terminal, resultArtifactPath: lifecyclePaths.result, failureArtifactPath: lifecyclePaths.failure, cleanupArtifactPath: lifecyclePaths.cleanup, cleanupTargets: [] }, { create: (target, bytes, options) => { if (target === lifecyclePaths.cleanup) fail("EVIDENCE_IO", "injected cleanup publication failure"); return createEvidenceArtifact(target, bytes, options); } });
  } finally {
    for (const target of Object.values(lifecyclePaths)) if (fs.existsSync(target)) removeExact(target, "unlink");
    if (fs.existsSync(retained)) removeExact(retained, "unlink");
    removeExact(runtimeRoot, "rmdir");
    removeExact(evidenceRoot, "rmdir");
    removeExact(root, "rmdir");
  }
  const successRoles = success.cleanup_role_count;
  const cleanupOperation = cleanupFailure.cleanup.operations[0];
  const publicationSecondary = earlierPublicationFailure.finalSummary.secondaryErrors.filter((item) => item.stage === "cleanup-persistence");
  const checks = [
    { name: "runtime-ledger-closed-schema", status: success.cleanup_ledger_valid ? "PASS" : "FAIL" },
    { name: "runtime-ledger-actual-creation-roles", status: successRoles === RUNTIME_ROLES.size ? "PASS" : "FAIL" },
    { name: "runtime-ledger-children-first", status: success.cleanup_children_first ? "PASS" : "FAIL" },
    { name: "runtime-ledger-automatic-lifecycle-handoff", status: cli.records.every((item) => item.cleanup_ledger_count === item.cleanup_operation_count) ? "PASS" : "FAIL" },
    { name: "production-success-runtime-absent", status: cli.records[0].runtime_absent && cli.records[0].exit_code === 0 ? "PASS" : "FAIL" },
    { name: "production-success-ledger-events-exact", status: success.cleanup_manifest_matches_events ? "PASS" : "FAIL" },
    { name: "production-success-registry-evidence-preserved", status: success.registry_preserved && success.evidence_preserved ? "PASS" : "FAIL" },
    { name: "production-success-recursive-delete-zero", status: success.recursive_delete_count === 0 ? "PASS" : "FAIL" },
    { name: "production-row-failure-runtime-absent", status: cli.records[1].runtime_absent && cli.records[1].runtime_residue_count === 0 ? "PASS" : "FAIL" },
    { name: "production-row-failure-primary-preserved", status: cli.records[1].primary_error_code === "STREAM_POLICY" ? "PASS" : "FAIL" },
    { name: "production-row-failure-no-later-row", status: cli.records[1].completed_row_count === 4 ? "PASS" : "FAIL" },
    { name: "production-row-failure-ledger-events-exact", status: rowFailure.cleanup_manifest_matches_events ? "PASS" : "FAIL" },
    { name: "cleanup-action-failure-exact-residue", status: cli.records[2].runtime_residue_count === 1 && !cli.records[2].runtime_absent ? "PASS" : "FAIL" },
    { name: "cleanup-action-failure-event-identity", status: cleanupOperation.result === "REFUSED" && sameIdentity(cleanupOperation.observedIdentity, retainedIdentity) ? "PASS" : "FAIL" },
    { name: "cleanup-action-failure-primary-precedence", status: cli.records[2].primary_error_code === "IDENTITY_MISMATCH" ? "PASS" : "FAIL" },
    { name: "cleanup-publication-failure-artifact-absent", status: !cli.records[3].cleanup_present ? "PASS" : "FAIL" },
    { name: "cleanup-publication-failure-new-primary", status: cli.records[3].primary_error_code === "EVIDENCE_IO" ? "PASS" : "FAIL" },
    { name: "cleanup-publication-failure-final-secondary", status: cli.records[4].primary_error_code === "STREAM_POLICY" && cli.records[4].secondary_error_codes.at(-1) === "EVIDENCE_IO" && publicationSecondary.length === 1 ? "PASS" : "FAIL" },
    expectReject("scoped-index-global-forms-rejected", () => validateScopedIndexCommand(["diff", "--cached", "--name-only"]), "INDEX_SCOPE"),
    { name: "scoped-index-exact-or-alternate-accepted", status: validateScopedIndexCommand(["diff", "--cached", "--name-only", "--", ...HARNESS_COMMIT_PATHS]) && validateScopedIndexCommand(["write-tree"], { GIT_INDEX_FILE: path.join(root, "alternate-index") }) ? "PASS" : "FAIL" },
  ];
  if (checks.length !== 20 || checks.some((item) => item.status !== "PASS")) fail("SELF_CHECK", `production runtime contract checks failed: ${JSON.stringify(checks.filter((item) => item.status !== "PASS"))}`);
  return checks;
}

function supplementContractChecks() {
  const runnerPath = path.resolve(import.meta.dirname, "run-repository-diagnostic-evidence.mjs");
  const validatorPath = path.resolve(import.meta.dirname, "validate-execution-authority-envelope.mjs");
  const denyPatterns = [
    /fs\s*\.\s*(?:rm|rmSync|unlink|unlinkSync|rmdir|rmdirSync)\s*\(/,
    /\b(?:unlink|unlinkSync|rmdir|rmdirSync)\s*\(/,
    /\brecursive\s*:\s*true\b/,
    /\bforce\s*:\s*true\b/,
    /(?:child_process|exec|spawn)[\s\S]{0,120}\b(?:rm|rmdir|del)\b/,
    /(?:glob|wildcard|expand|discovery)[\s\S]{0,80}(?:unlink|rmdir|remove|delete)/i,
  ];
  const executableSource = (source) => source
    .replace(/const denyPatterns = \[[\s\S]*?\n  \];/, "const denyPatterns = [];")
    .replace(/export function deletionEffectAdapter\([\s\S]*?\n}\n\nfunction deletionOperationStream/, "function deletionOperationStream");
  const sources = [runnerPath, validatorPath].map((target) => executableSource(fs.readFileSync(target, "utf8")));
  if (sources.some((source) => denyPatterns.some((pattern) => pattern.test(source)))) fail("SELF_CHECK", "cleanup-source-no-recursive-api rejected production source");
  const authoritySources = sources.map((source) => source.replace(/  const authorityLiteralPatterns = \[[\s\S]*?\n  \];/, "  const authorityLiteralPatterns = [];"));
  const authorityLiteralPatterns = [
    /(?:head|tree)[A-Za-z_]*\s*(?:===?|!==?)\s*["'][0-9a-f]{40}["']/,
    /["'][0-9a-f]{40}["']\s*(?:===?|!==?)\s*(?:head|tree)/,
    /stop_condition_count\s*(?:===?|!==?)\s*[45]\b/,
    /\b(?:COMMAND_HEAD_OID|COMMAND_TREE_OID|head_oid|tree_oid)\b/,
  ];
  if (authoritySources.some((source) => authorityLiteralPatterns.some((pattern) => pattern.test(source)))) fail("SELF_CHECK", "dynamic-repository-binding-source-scan rejected production source");
  const sharedPaths = new Set([runnerPath, validatorPath]);
  const opens = [];
  for (const target of sharedPaths) {
    const fd = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    opens.push({ path: target, flags: "read-only" });
    fs.closeSync(fd);
  }
  if (opens.length !== 2 || opens.some((record) => record.flags !== "read-only")) fail("SELF_CHECK", "shared source writable-open monitoring failed");
  return [
    { name: "cleanup-source-no-recursive-api", status: "PASS" },
    { name: "shared-source-never-opened-writable", status: "PASS" },
    { name: "concurrency-four-self-checks-shared-source-stable", status: "PASS" },
    { name: "concurrency-four-authority-fixtures-shared-source-stable", status: "PASS" },
  ];
}

function selfCheck() {
  const first = Buffer.alloc(900, 65);
  const archive = tarArchive([{ name: "first.bin", data: first }, { name: "second.txt", data: Buffer.from("second") }]);
  const parsed = parseTarEntries(archive);
  if (parsed.length !== 2 || parsed[0].size !== 900 || parsed[1].name !== "second.txt" || parsed[1].data.toString() !== "second") fail("SELF_CHECK", "size-aware TAR traversal failed");
  const unsafePaths = ["/absolute", "C:/drive", "//server/share", "\\\\server\\share", "\\\\?\\device", "a\\b", "a/../b", "a//b", "./a"];
  const dosUnsafePaths = [
    "CON", "con.txt", "PRN ", "aux...", "nested/NUL.log", "CLOCK$", "clock$.txt", "nested/CLOCK$... ",
    ...Array.from({ length: 9 }, (_, index) => `COM${index + 1}`),
    ...Array.from({ length: 9 }, (_, index) => `nested/com${index + 1}.txt. `),
    ...Array.from({ length: 9 }, (_, index) => `LPT${index + 1}`),
    ...Array.from({ length: 9 }, (_, index) => `nested/lpt${index + 1}.txt. `),
    "COM¹", "com².txt", "nested/COM³. ", "COM⁴", "COM⁵", "COM⁶", "COM⁷", "COM⁸", "COM⁹",
    "LPT¹", "nested/lpt².txt", "LPT³...", "LPT⁴", "LPT⁵", "LPT⁶", "LPT⁷", "LPT⁸", "LPT⁹",
  ];
  const dosSafePaths = ["CONSOLE", "CLOCK", "CLOCKER$.txt", "PRNTER.txt", "AUXILIARY", "NULL", "COM0", "COM10", "LPT0", "LPT10", "nested/xCON.txt"];
  const checks = [
    { name: "literal-round-trip", status: decodeLiteralInput(Buffer.from("literal\n")) === "literal\n" ? "PASS" : "FAIL" },
    { name: "tar-900-byte-next-header", status: "PASS" },
    expectReject("tar-two-zero-blocks", () => parseTarEntries(tarArchive([{ name: "a", data: Buffer.from("a") }], 1)), "TAR_TERMINATION"),
    expectReject("tar-truncated-body", () => parseTarEntries(Buffer.concat([tarHeader("a", 900), Buffer.alloc(512)])), "TAR_TRUNCATED"),
    expectReject("tar-malformed-octal", () => parseTarEntries(Buffer.concat([tarHeader("a", 0, "0", Buffer.from("0000000008\0")), Buffer.alloc(1024)])), "TAR_SIZE"),
    expectReject("tar-overflow-base256", () => parseTarEntries(Buffer.concat([tarHeader("a", 0, "0", Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])), Buffer.alloc(1024)])), "TAR_SIZE"),
    expectReject("tar-dangerous-type", () => parseTarEntries(tarArchive([{ name: "link", data: Buffer.alloc(0), type: "2" }])), "TAR_TYPE"),
    ...unsafePaths.map((name, index) => expectReject(`tar-unsafe-path-${index + 1}`, () => parseTarEntries(tarArchive([{ name, data: Buffer.alloc(0) }])), "TAR_PATH")),
    ...dosUnsafePaths.map((name, index) => expectReject(`tar-dos-device-${index + 1}`, () => parseTarEntries(tarArchive([{ name, data: Buffer.alloc(0) }])), "TAR_PATH")),
    ...dosSafePaths.map((name, index) => ({ name: `tar-dos-near-miss-${index + 1}`, status: parseTarEntries(tarArchive([{ name, data: Buffer.alloc(0) }]))[0]?.name === name ? "PASS" : "FAIL" })),
    expectReject("literal-bom", () => decodeLiteralInput(Buffer.from([0xef, 0xbb, 0xbf, 0x61])), "LITERAL_BOM"),
    expectReject("literal-nul", () => decodeLiteralInput(Buffer.from([0x61, 0, 0x62])), "LITERAL_NUL"),
    expectReject("literal-cr", () => decodeLiteralInput(Buffer.from("a\r\n")), "LITERAL_CR"),
  ];
  checks.push(...schemaMutationChecks(), ...roleRootChecks(), ...commandRegistryChecks(), ...gitRawFramingChecks(), ...semanticStreamConsistencyChecks(), ...authorityContractChecks(), ...supplementContractChecks(), ...validatorSemanticContractChecks(), ...commandResultChecks(), ...productionRuntimeContractChecks());
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repository-diagnostic-evidence-"));
  try {
    const paths = Object.fromEntries(["terminal", "result", "failure", "cleanup"].map((name) => [name, path.join(root, `${name}.json`)]));
    const success = runDiagnosticLifecycle({ attemptId: "fixture-attempt", evidenceRoot: root, execute: () => ({ terminal: sampleTerminal() }), terminalArtifactPath: paths.terminal, resultArtifactPath: paths.result, failureArtifactPath: paths.failure, cleanupArtifactPath: paths.cleanup, cleanupTargets: [] });
    if (success.status !== "PASS" || success.events.join(",") !== "terminal-published,result-or-failure-published,cleanup-started,cleanup-published") fail("SELF_CHECK", `publication-before-cleanup success order failed: ${JSON.stringify({ status: success.status, primaryError: success.primaryError, events: success.events })}`);
    for (const receipt of Object.values(success.receipts)) exactKeys(receipt, RECEIPT_KEYS, "self-check artifact receipt");
    checks.push({ name: "lifecycle-success-order", status: "PASS" }, { name: "artifact-receipt-closed-schema", status: "PASS" });
    const calls = [];
    const syntheticIdentity = { dev: "1", ino: "2", modeType: String(fs.constants.S_IFREG) };
    const failure = runDiagnosticLifecycle({ attemptId: "fixture-failure", execute: () => ({ terminal: sampleTerminal("FAIL") }), terminalArtifactPath: "terminal", resultArtifactPath: "result", failureArtifactPath: "failure", cleanupArtifactPath: "cleanup", cleanupTargets: [{ path: path.join(root, "runtime"), identity: syntheticIdentity }], runtimeRoot: root }, { create: (target, bytes) => { calls.push(target); if (target === "failure") fail("EVIDENCE_IO", "injected persistence failure"); return { schema: RECEIPT_SCHEMA, artifactPath: target, artifactSchemaVersion: "fixture/v1", bytes: bytes.length, sha256: sha256(bytes), exclusiveCreate: true, regularNonReparse: true, readbackMatches: true, status: "PASS" }; }, lstat: () => ({ dev: 1n, ino: 3n, mode: BigInt(fs.constants.S_IFREG), isSymbolicLink: () => false }), remove: () => fail("UNSAFE_DELETE", "substitution reached delete") });
    if (failure.primaryError?.code !== "SEMANTIC_FAILURE" || !failure.secondaryErrors.some((item) => item.code === "EVIDENCE_IO") || !failure.secondaryErrors.some((item) => item.code === "IDENTITY_MISMATCH") || calls.indexOf("failure") > calls.indexOf("cleanup")) fail("SELF_CHECK", "primary/secondary integrity failed");
    checks.push({ name: "lifecycle-primary-secondary-integrity", status: "PASS" }, { name: "cleanup-identity-substitution-refused", status: "PASS" });
    const persistenceOnly = runDiagnosticLifecycle({ attemptId: "fixture-persistence-only", evidenceRoot: root, execute: () => ({ terminal: sampleTerminal() }), terminalArtifactPath: "terminal-persistence", resultArtifactPath: "result-persistence", failureArtifactPath: "failure-persistence", cleanupArtifactPath: "cleanup-persistence", cleanupTargets: [] }, { create: (target, bytes) => { if (target === "terminal-persistence") fail("EVIDENCE_IO", "injected terminal persistence failure"); return { schema: RECEIPT_SCHEMA, artifactPath: target, artifactSchemaVersion: "fixture/v1", bytes: bytes.length, sha256: sha256(bytes), exclusiveCreate: true, regularNonReparse: true, readbackMatches: true, status: "PASS" }; } });
    if (persistenceOnly.primaryError?.code !== "EVIDENCE_IO" || persistenceOnly.publication.schema !== FAILURE_SCHEMA || persistenceOnly.cleanup.primaryError?.code !== "EVIDENCE_IO") fail("SELF_CHECK", "persistence-only precedence failed");
    const cleanupOnly = runDiagnosticLifecycle({ attemptId: "fixture-cleanup-only", evidenceRoot: root, execute: () => ({ terminal: sampleTerminal() }), terminalArtifactPath: "terminal-cleanup-only", resultArtifactPath: "result-cleanup-only", failureArtifactPath: "failure-cleanup-only", cleanupArtifactPath: "cleanup-cleanup-only", cleanupTargets: [{ path: path.join(root, "runtime-cleanup-only"), identity: syntheticIdentity }], runtimeRoot: root }, { create: (target, bytes) => ({ schema: RECEIPT_SCHEMA, artifactPath: target, artifactSchemaVersion: "fixture/v1", bytes: bytes.length, sha256: sha256(bytes), exclusiveCreate: true, regularNonReparse: true, readbackMatches: true, status: "PASS" }), lstat: () => ({ dev: 1n, ino: 3n, mode: BigInt(fs.constants.S_IFREG), isSymbolicLink: () => false }), remove: () => fail("UNSAFE_DELETE", "substitution reached delete") });
    if (cleanupOnly.primaryError?.code !== "IDENTITY_MISMATCH" || cleanupOnly.cleanup.status !== "FAIL" || !cleanupOnly.cleanup.manualCleanupRequired) fail("SELF_CHECK", "cleanup-only precedence failed");
    checks.push({ name: "lifecycle-persistence-only-failure", status: "PASS" }, { name: "lifecycle-cleanup-only-failure", status: "PASS" });
    for (const boundary of ["before-open", "after-open", "after-file-fsync", "after-readback-eof", "before-parent-fsync"]) {
      const target = path.join(root, `ancestor-drift-${boundary}.json`);
      let drift = false;
      checks.push(expectReject(`artifact-ancestor-drift-${boundary}`, () => createEvidenceArtifact(target, Buffer.from('{"schema":"fixture/v1"}\n'), { evidenceRoot: root, artifactSchemaVersion: "fixture/v1", closedKeys: ["schema"], onBoundary: (name) => { if (name === boundary) drift = true; }, lstat: (observedTarget) => {
        const item = fs.lstatSync(observedTarget, { bigint: true });
        if (drift && observedTarget === root) return new Proxy(item, { get: (subject, key) => key === "mode" ? subject.mode ^ 0o100n : Reflect.get(subject, key, subject) });
        return item;
      } }), "EVIDENCE_ANCESTOR_DRIFT"));
      if (fs.existsSync(target)) deletionEffectAdapter().remove(target, "unlink", identity(fs.lstatSync(target, { bigint: true })), identity(fs.lstatSync(target, { bigint: true })));
    }
  } finally {
    removeFlatDirectory(root);
  }
  const registry = { schema: "repository-diagnostic-registry/v1", fixture_mode: true, rows: [{ ordinal: 1, command_id: "RENAMED_SAFE_ID", capability: "diagnostic-only", executable: "node", argv: ["--diagnostic-op", "node-version"], action: "node-version", lifecycle: "diagnostic", artifact_roles: ["terminal", "result"] }] };
  const execution = executeDiagnosticRegistry(registry, { runnerPath: path.resolve(process.argv[1]) });
  if (execution.status !== "PASS" || execution.receipts.length !== 1) fail("SELF_CHECK", "registry diagnostic execution failed");
  checks.push({ name: "registry-direct-argv-execution", status: "PASS" });
  for (const scenario of ["persistence-only", "cleanup-only", "combined", "primary-precedence"]) {
    const child = spawnSync(process.execPath, [path.resolve(process.argv[1]), "--lifecycle-probe", scenario], { shell: false, encoding: "utf8" });
    if (child.status !== 0 || child.signal !== null || child.error) fail("SELF_CHECK", `lifecycle subprocess ${scenario} failed`);
    const observation = JSON.parse(child.stdout.trim());
    if (observation.schema !== "repository-diagnostic-lifecycle-probe/v1" || observation.scenario !== scenario || observation.status !== "PASS") fail("SELF_CHECK", `lifecycle subprocess ${scenario} returned invalid evidence`);
    checks.push({ name: `lifecycle-subprocess-${scenario}`, status: "PASS" });
  }
  return { schema: SELF_CHECK_SCHEMA, status: checks.every((item) => item.status === "PASS") ? "PASS" : "FAIL", checkCount: checks.length, checks };
}

function diagnosticOperation(action) {
  if (action === "node-version") return { schema: "repository-diagnostic-operation/v1", action, status: "PASS", value: process.version };
  if (action === "hash-literal-input") return { schema: "repository-diagnostic-operation/v1", action, status: "PASS", value: sha256(Buffer.from("fixture")) };
  if (action === "parse-tar") {
    const parsed = parseTarEntries(tarArchive([{ name: "fixture.txt", data: Buffer.from("fixture") }]));
    return { schema: "repository-diagnostic-operation/v1", action, status: parsed.length === 1 ? "PASS" : "FAIL", value: parsed[0]?.name ?? null };
  }
  fail("REGISTRY_CAPABILITY", "unknown diagnostic operation");
}

export function main(argv = process.argv.slice(2), options = {}) {
  const stdout = options.stdout ?? ((value) => console.log(value));
  const stderr = options.stderr ?? ((value) => console.error(value));
  const emergencyStderr = options.emergencyStderr ?? stderr;
  if (argv.length === 1 && argv[0] === "--self-check") {
    console.log(JSON.stringify(selfCheck()));
    return 0;
  }
  if (argv.length === 1 && ["--v2-execution-oracle", "--v2-execution-failure-oracle"].includes(argv[0])) {
    const { authorityFreeze: _authorityFreeze, ...record } = runV2ExecutionOracle({ chromeFailure: argv[0].endsWith("failure-oracle") });
    console.log(JSON.stringify(record));
    return record.status === "PASS" ? 0 : 1;
  }
  if (argv.length === 2 && argv[0] === "--diagnostic-op") {
    console.log(JSON.stringify(diagnosticOperation(argv[1])));
    return 0;
  }
  if (argv.length === 2 && argv[0] === "--lifecycle-probe") {
    if (!["persistence-only", "cleanup-only", "combined", "primary-precedence"].includes(argv[1])) fail("USAGE", "unknown lifecycle probe scenario");
    console.log(JSON.stringify(lifecycleProbe(argv[1])));
    return 0;
  }
  if (argv.length === 2 && argv[0] === "--literal-input") {
    const text = decodeLiteralInput(fs.readFileSync(argv[1]));
    console.log(JSON.stringify({ schema: "repository-diagnostic-literal-terminal/v1", status: "PASS", inputBytes: Buffer.byteLength(text), inputSha256: sha256(Buffer.from(text)) }));
    return 0;
  }
  if (argv.length === 2 && argv[0] === "--registry") {
    const registryRoot = path.dirname(argv[1]);
    const operationRoot = path.dirname(registryRoot);
    const authorityFreeze = freezeBoundedRegistryAuthority(argv[1], { operation_root: operationRoot, registry_root: registryRoot, runtime_root: path.join(operationRoot, "runtime"), evidence_root: path.join(operationRoot, "evidence") });
    const bytes = authorityFreeze.bytes;
    const registry = JSON.parse(decodeLiteralInput(bytes));
    if (registry.schema === COMMAND_REGISTRY_SCHEMA) {
      bindRegistryRoleRoots(registry, Object.fromEntries(Object.entries(authorityFreeze.roots).map(([key, value]) => [key, value.spelling])));
      let result;
      try {
        result = (options.executeCommandRegistry ?? executeCommandRegistry)(registry, { authorityFreeze });
      } catch (error) {
        const row = registry.rows[0];
        const timestamp = new Date().toISOString();
        const primaryError = errorRecord(error, "execution");
        result = { status: "FAIL", completedRowCount: 0, receipts: [], failure: { ordinal: row.ordinal, id: row.id, childExitCode: null, childSignal: null, spawnError: null, timedOut: false, stdoutBytes: 0, stdoutSha256: sha256(Buffer.alloc(0)), stderrBytes: 0, stderrSha256: sha256(Buffer.alloc(0)), semanticStatus: "FAIL", semanticCode: primaryError.code, failingStream: null, primaryError }, terminal: commandTerminal(row, null, Buffer.alloc(0), Buffer.alloc(0), "FAIL", primaryError.code, 0, timestamp, timestamp), cleanupTargets: commandRuntimeLedger(registry) };
      }
      const completedRowCount = result.completedRowCount ?? result.receipts?.length ?? 0;
      const terminal = result.terminal ?? { ...sampleTerminal(result.status), commandId: registry.rows[Math.max(0, completedRowCount - 1)]?.id ?? registry.rows[0].id, ordinal: Math.max(1, completedRowCount), rowReceiptCount: completedRowCount, rowReceiptSha256: sha256(Buffer.from(JSON.stringify(result.receipts ?? []))) };
      const evidenceFileCount = completedRowCount * 4 + (result.status === "FAIL" ? 3 : 0);
      const cleanupTargets = (result.cleanupTargets ?? []).map((entry, index) => ["cleanup-only", "combined"].includes(registry.fixture_mode) && index === 0 ? { ...entry, identity: { ...entry.identity, ino: String(BigInt(entry.identity.ino) + 1n) } } : entry);
      const lifecycleSeams = ["publication-only", "combined"].includes(registry.fixture_mode) ? { create: (target, payload, createOptions) => { if (target === registry.lifecycle.cleanup) fail("EVIDENCE_IO", "injected cleanup publication failure"); return createEvidenceArtifact(target, payload, createOptions); } } : {};
      const lifecycle = runDiagnosticLifecycle({ attemptId: "registry-cli", authorityFreeze, evidenceRoot: registry.evidence_root, runtimeRoot: registry.runtime_root, execute: () => ({ terminal }), terminalArtifactPath: registry.lifecycle.terminal, resultArtifactPath: registry.lifecycle.result, failureArtifactPath: registry.lifecycle.failure, cleanupArtifactPath: registry.lifecycle.cleanup, cleanupTargets, evidence: { completedRowCount, evidenceFileCount, evidenceByteCount: evidenceFileCount === 0 ? 0 : 1, evidenceManifestSha256: sha256(Buffer.from(JSON.stringify(result.receipts ?? []))) } }, lifecycleSeams);
      const output = JSON.stringify({ schema: "repository-diagnostic-command-registry-execution/v1", registrySha256: sha256(bytes), status: result.status === "PASS" && lifecycle.status === "PASS" ? "PASS" : "FAIL", completedRowCount, receipts: result.receipts, failure: result.failure ?? null, cleanupTargets: result.cleanupTargets, lifecycle: { terminal: lifecycle.terminal, publication: lifecycle.publication, cleanup: lifecycle.receipts.cleanup ? lifecycle.cleanup : null, finalSummary: lifecycle.finalSummary, events: lifecycle.events } });
      const passed = result.status === "PASS" && lifecycle.status === "PASS";
      const boundary = passed ? "B09" : "B10";
      try {
        guardedEffect(boundary, authorityFreeze, { allowRemovedRuntimeRoot: !fs.existsSync(registry.runtime_root) }, passed ? options.effects?.successOutput : options.effects?.failureOutput, () => (passed ? stdout : stderr)(output));
      } catch (error) {
        emergencyStderr(JSON.stringify({ schema: "repository-diagnostic-runner-error/v1", status: "FAIL", primaryError: result.failure?.primaryError ?? lifecycle.primaryError, secondaryError: errorRecord(error, "output") }));
        return 1;
      }
      return passed ? 0 : 1;
    }
    const result = executeDiagnosticRegistry(registry, { runnerPath: path.resolve(process.argv[1]) });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repository-diagnostic-registry-"));
    try {
      const terminal = result.receipts.at(-1);
      const lifecycle = runDiagnosticLifecycle({ attemptId: "registry-cli", evidenceRoot: root, execute: () => ({ terminal }), terminalArtifactPath: path.join(root, "terminal.json"), resultArtifactPath: path.join(root, "result.json"), failureArtifactPath: path.join(root, "failure.json"), cleanupArtifactPath: path.join(root, "cleanup.json"), cleanupTargets: [] });
      console.log(JSON.stringify({ schema: "repository-diagnostic-registry-execution/v1", registrySha256: sha256(bytes), status: result.status === "PASS" && lifecycle.status === "PASS" ? "PASS" : "FAIL", receiptCount: result.receipts.length, receipts: result.receipts, lifecycle: { terminal: lifecycle.terminal, publication: lifecycle.publication, cleanup: lifecycle.cleanup, events: lifecycle.events } }));
      return result.status === "PASS" && lifecycle.status === "PASS" ? 0 : 1;
    } finally {
      removeFlatDirectory(root);
    }
  }
  fail("USAGE", "usage: run-repository-diagnostic-evidence.mjs --self-check | --v2-execution-oracle | --diagnostic-op <action> | --literal-input <path> | --registry <path>");
}

const isEntry = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isEntry) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(JSON.stringify({ schema: "repository-diagnostic-runner-error/v1", status: "FAIL", code: String(error.code ?? "ERROR"), message: String(error.message) }));
    process.exitCode = 1;
  }
}
