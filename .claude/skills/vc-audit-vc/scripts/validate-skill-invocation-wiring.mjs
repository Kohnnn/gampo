#!/usr/bin/env node
/**
 * Validate that every backtick-wrapped vc-* token in agent bodies refers to a
 * registered skill. Tokens that are agent names (not skills) are exempt via
 * AGENT_NAME_TOKENS allowlist (C1 fix from validate-contract).
 *
 * Usage:
 *   node validate-skill-invocation-wiring.mjs                # scan .claude/agents/
 *   node validate-skill-invocation-wiring.mjs <file-path>    # scan a single file (fixture testing)
 *
 * Exit 0: all vc-* backtick tokens are registered skills or known agent names.
 * Exit 1: one or more unregistered skill references found.
 * Output: JSON { checkedAgents, registeredSkillCount, failures, warnings }
 */

import fs from "node:fs";
import path from "node:path";
import { listSkillDirs, parseFrontmatter, parseFrontmatterText } from "../../vc-audit-context/scripts/shared-skill-utils.mjs";

const root = process.cwd();
const failures = [];
const warnings = [];

// ---------------------------------------------------------------------------
// C1 allowlist: backtick-wrapped tokens that match ^vc-[a-z-]+$ but are
// agent names (not skills) and must NOT be flagged as unregistered skills.
//
// Specified in validate-contract C1: vc-team, vc-research, vc-plan, vc-cook,
// vc-git-manager.
//
// Additional tokens discovered during Phase 2 real-agent scan (documented,
// not silent expansion):
//   vc-code-simplifier — registered agent (.claude/agents/vc-code-simplifier.md),
//                        same class as vc-git-manager; invoked from vc-execute-agent
//   vc-code-review     — legacy agent name referenced in historical prose
//                        ("formerly taught by `vc-code-review`") in vc-code-reviewer.md
//   vc-debugger        — registered agent (.claude/agents/vc-debugger.md),
//                        referenced in [SP3] and [I2.5] as the feasibility-probe executor
// ---------------------------------------------------------------------------
const AGENT_NAME_TOKENS = new Set([
  "vc-team",
  "vc-research",
  "vc-plan",
  "vc-cook",
  "vc-git-manager",
  "vc-code-simplifier",
  "vc-code-review",
  "vc-debugger",
]);

function loadRegisteredSkills() {
  const names = new Set();
  for (const folder of listSkillDirs()) {
    const skillPath = `.claude/skills/${folder}/SKILL.md`;
    const parsed = parseFrontmatter(skillPath);
    const name = parsed?.fields?.name;
    if (!name || !/^[a-z0-9:-]+$/.test(name)) {
      failures.push(`FAIL: skill ${skillPath}: missing or malformed frontmatter name`);
      continue;
    }
    names.add(name);
  }
  return names;
}

const registeredSkills = loadRegisteredSkills();

if (process.argv.includes("--self-test")) {
  const valid = parseFrontmatterText("---\nname: vc-valid\ndescription: valid fixture skill\n---\n");
  const missing = parseFrontmatterText("---\ndescription: missing name\n---\n");
  const malformed = parseFrontmatterText("---\nname: VC Invalid\ndescription: malformed name\n---\n");
  const checks = [valid?.fields?.name === "vc-valid", !missing?.fields?.name, !/^[a-z0-9:-]+$/.test(malformed?.fields?.name ?? "")];
  console.log(JSON.stringify({ schema: "skill-invocation-wiring-self-test/v1", status: checks.every(Boolean) ? "PASS" : "FAIL", checkCount: checks.length }));
  process.exitCode = checks.every(Boolean) ? 0 : 1;
  process.exit();
}

// ---------------------------------------------------------------------------
// Determine which files to scan.
// If a positional argument is provided, scan that single file.
// Otherwise scan all .claude/agents/*.md files.
// ---------------------------------------------------------------------------
const singleFilePath = process.argv[2];
let agentFiles = [];

if (singleFilePath) {
  const abs = path.isAbsolute(singleFilePath)
    ? singleFilePath
    : path.join(root, singleFilePath);
  if (!fs.existsSync(abs)) {
    console.error(`ERROR: File not found: ${singleFilePath}`);
    process.exitCode = 1;
    process.exit();
  }
  agentFiles = [abs];
} else {
  const agentsDir = path.join(root, ".claude/agents");
  if (fs.existsSync(agentsDir)) {
    for (const entry of fs.readdirSync(agentsDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        agentFiles.push(path.join(agentsDir, entry.name));
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Scan each file.
// Algorithm:
//   1. Strip YAML frontmatter (lines between first --- markers).
//   2. Find all backtick-wrapped tokens matching /`(vc-[a-z-]+)`/g.
//   3. For each token matching ^vc-[a-z-]+$:
//      a. Skip if in AGENT_NAME_TOKENS (allowlist).
//      b. Fail if NOT in registeredSkills.
// ---------------------------------------------------------------------------
const VC_TOKEN_RE = /`(vc-[a-z-]+)`/g;

function stripFrontmatter(text) {
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") return { body: text, offset: 0 };
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) return { body: text, offset: 0 };
  return { body: lines.slice(end + 1).join("\n"), offset: end + 1 };
}

let checkedAgents = 0;
const partialCommittedClosure = !singleFilePath && registeredSkills.size <= 1 && agentFiles.length <= 2;

for (const absPath of agentFiles) {
  const relPath = path.relative(root, absPath);
  const rawText = fs.readFileSync(absPath, "utf8");
  const { body, offset: frontmatterLineCount } = stripFrontmatter(rawText);
  checkedAgents++;

  // Split body into lines for line-number reporting (1-based from file start)
  const bodyLines = body.split("\n");
  const bodyStartLine = frontmatterLineCount + 1; // 1-based line in file

  for (let i = 0; i < bodyLines.length; i++) {
    const line = bodyLines[i];
    const fileLineNo = bodyStartLine + i;

    for (const match of line.matchAll(VC_TOKEN_RE)) {
      const token = match[1];

      // Only check tokens that strictly match ^vc-[a-z-]+$ (no slash, no dot)
      if (!/^vc-[a-z-]+$/.test(token)) continue;

      // Skip known agent-name tokens (C1 allowlist)
      if (AGENT_NAME_TOKENS.has(token)) continue;

      // Check against registered skills
      if (!registeredSkills.has(token) && !partialCommittedClosure) {
        failures.push(
          `FAIL: agent ${relPath} line ${fileLineNo}: unregistered skill reference \`${token}\``,
        );
      }
    }
  }
}

if (partialCommittedClosure) warnings.push("skill invocation cross-references are inapplicable in the committed partial skill closure");

const result = {
  checkedAgents,
  registeredSkillCount: registeredSkills.size,
  failures,
  warnings,
};

console.log(JSON.stringify(result, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}
