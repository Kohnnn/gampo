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
const ANCESTOR_IDENTITY_KEYS = ["dev", "ino", "mode", "nlink", "realpath", "type"];

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
  const segments = raw.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) fail("TAR_PATH", "archive path contains an empty, dot, or traversal segment");
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
    if (![0, 48].includes(type)) fail("TAR_TYPE", `unsupported TAR entry type ${type}`);
    const size = parseTarNumber(header.subarray(124, 136));
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
    nlink: item.nlink.toString(),
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
  const frozenAncestors = captureAncestorChain(targetPath, evidenceRoot, lstat, realpath);
  inspectTarget(targetPath, frozenAncestors, lstat, realpath, false);
  onBoundary("before-open");
  compareAncestorChain(frozenAncestors, targetPath, evidenceRoot, lstat, realpath);
  let fd;
  let parentFd;
  let primary;
  try {
    fd = open(targetPath, "wx+");
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
    parentSync(parentFd);
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
    if (item.ordinal !== index + 1 || item.operation !== "unlink" || !isNonEmptyText(item.path) || !["REMOVED", "REFUSED", "FAILED"].includes(item.result)) fail("SCHEMA", `cleanup operations[${index}] identity, operation, path, or result is invalid`);
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

function cleanupIdentity(pathValue, expected, runtimeRoot, seams) {
  try {
    const root = path.resolve(runtimeRoot);
    const target = path.resolve(pathValue);
    const relative = path.relative(root, target);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) fail("CLEANUP_SCOPE", "cleanup target must remain strictly beneath runtime root");
    const item = seams.lstat(target);
    const observed = identity(item);
    if (item.isSymbolicLink?.()) fail("CLEANUP_REPARSE", "cleanup target is a symbolic link or reparse-observable object");
    if (!sameIdentity(expected, observed)) return { observed, result: "REFUSED", error: errorRecord(Object.assign(new Error("cleanup identity mismatch"), { code: "IDENTITY_MISMATCH" }), "cleanup") };
    seams.remove(target);
    return { observed, result: "REMOVED", error: null };
  } catch (error) {
    return { observed: null, result: "FAILED", error: errorRecord(error, "cleanup") };
  }
}

function createJson(create, target, value, schema, keys, evidenceRoot) {
  if (create === createEvidenceArtifact) return create(target, Buffer.from(`${JSON.stringify(value)}\n`), { artifactSchemaVersion: schema, closedKeys: keys, evidenceRoot });
  return create(target, Buffer.from(`${JSON.stringify(value)}\n`), { artifactSchemaVersion: schema, closedKeys: keys, evidenceRoot });
}

export function runDiagnosticLifecycle(config, seams = {}) {
  for (const key of ["attemptId", "terminalArtifactPath", "resultArtifactPath", "failureArtifactPath", "cleanupArtifactPath"]) if (!isNonEmptyText(config[key])) fail("SCHEMA", `lifecycle ${key} must be non-empty text`);
  if (config.evidenceRoot !== undefined && !isNonEmptyText(config.evidenceRoot)) fail("SCHEMA", "lifecycle evidenceRoot must be non-empty text when provided");
  if (new Set([config.terminalArtifactPath, config.resultArtifactPath, config.failureArtifactPath, config.cleanupArtifactPath]).size !== 4) fail("SCHEMA", "lifecycle artifact paths must be unique");
  if (typeof config.execute !== "function") fail("SCHEMA", "lifecycle execute must be a function");
  const create = seams.create ?? createEvidenceArtifact;
  const lstat = seams.lstat ?? lstatBigInt;
  const remove = seams.remove ?? fs.unlinkSync;
  const now = seams.now ?? (() => new Date().toISOString());
  const events = [];
  const secondaryErrors = [];
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
      terminalReceipt = createJson(create, config.terminalArtifactPath, terminal, TERMINAL_SCHEMA, TERMINAL_KEYS, config.evidenceRoot);
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
    publicationReceipt = createJson(create, publicationPath, publication, publication.schema, publication.schema === RESULT_SCHEMA ? RESULT_KEYS : FAILURE_KEYS, config.evidenceRoot);
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
    const outcome = cleanupIdentity(owned.path, owned.identity, runtimeRoot, { lstat, remove });
    operations.push({ ordinal: index + 1, operation: "unlink", path: owned.path, expectedIdentity: owned.identity, observedIdentity: outcome.observed, result: outcome.result, error: outcome.error });
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
    cleanupReceipt = createJson(create, config.cleanupArtifactPath, cleanup, CLEANUP_SCHEMA, CLEANUP_KEYS, config.evidenceRoot);
    events.push("cleanup-published");
  } catch (error) {
    const record = errorRecord(error, "cleanup-persistence");
    if (primaryError) secondaryErrors.push(record);
    else primaryError = record;
  }
  return { status: primaryError ? "FAIL" : "PASS", primaryError, secondaryErrors, terminal, publication, cleanup, receipts: { terminal: terminalReceipt, publication: publicationReceipt, cleanup: cleanupReceipt }, events, finishedAt: now() };
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
  for (const [field, replacement] of [["ordinal", 2], ["operation", "rmdir"], ["path", ""], ["expectedIdentity", {}], ["observedIdentity", {}], ["result", "UNKNOWN"], ["error", {}]]) checks.push(expectReject(`schema-mutation-cleanup-operation-${field}`, () => validateCleanup({ ...cleanup, operations: [{ ...operation, [field]: replacement }] }), "SCHEMA"));
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
    for (const name of fs.readdirSync(root)) {
      const target = path.join(root, name);
      const item = fs.lstatSync(target, { bigint: true });
      if (!item.isFile() || item.isSymbolicLink()) fail("SELF_CHECK", `fixture cleanup refused unexpected residue ${name}`);
      fs.unlinkSync(target);
    }
    fs.rmdirSync(root);
  }
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
  checks.push(...schemaMutationChecks());
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repository-diagnostic-evidence-"));
  try {
    const paths = Object.fromEntries(["terminal", "result", "failure", "cleanup"].map((name) => [name, path.join(root, `${name}.json`)]));
    const success = runDiagnosticLifecycle({ attemptId: "fixture-attempt", evidenceRoot: root, execute: () => ({ terminal: sampleTerminal() }), terminalArtifactPath: paths.terminal, resultArtifactPath: paths.result, failureArtifactPath: paths.failure, cleanupArtifactPath: paths.cleanup, cleanupTargets: [] });
    if (success.status !== "PASS" || success.events.join(",") !== "terminal-published,result-or-failure-published,cleanup-started,cleanup-published") fail("SELF_CHECK", "publication-before-cleanup success order failed");
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
        if (drift && observedTarget === root) return new Proxy(item, { get: (subject, key) => key === "nlink" ? subject.nlink + 1n : Reflect.get(subject, key, subject) });
        return item;
      } }), "EVIDENCE_ANCESTOR_DRIFT"));
      if (fs.existsSync(target)) fs.unlinkSync(target);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
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

export function main(argv = process.argv.slice(2)) {
  if (argv.length === 1 && argv[0] === "--self-check") {
    console.log(JSON.stringify(selfCheck()));
    return 0;
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
    const bytes = fs.readFileSync(argv[1]);
    const registry = JSON.parse(decodeLiteralInput(bytes));
    const result = executeDiagnosticRegistry(registry, { runnerPath: path.resolve(process.argv[1]) });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "repository-diagnostic-registry-"));
    try {
      const terminal = result.receipts.at(-1);
      const lifecycle = runDiagnosticLifecycle({ attemptId: "registry-cli", evidenceRoot: root, execute: () => ({ terminal }), terminalArtifactPath: path.join(root, "terminal.json"), resultArtifactPath: path.join(root, "result.json"), failureArtifactPath: path.join(root, "failure.json"), cleanupArtifactPath: path.join(root, "cleanup.json"), cleanupTargets: [] });
      console.log(JSON.stringify({ schema: "repository-diagnostic-registry-execution/v1", registrySha256: sha256(bytes), status: result.status === "PASS" && lifecycle.status === "PASS" ? "PASS" : "FAIL", receiptCount: result.receipts.length, receipts: result.receipts, lifecycle: { terminal: lifecycle.terminal, publication: lifecycle.publication, cleanup: lifecycle.cleanup, events: lifecycle.events } }));
      return result.status === "PASS" && lifecycle.status === "PASS" ? 0 : 1;
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
  fail("USAGE", "usage: run-repository-diagnostic-evidence.mjs --self-check | --diagnostic-op <action> | --literal-input <path> | --registry <path>");
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
