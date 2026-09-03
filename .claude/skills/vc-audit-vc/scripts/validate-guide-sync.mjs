#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter, listSkillDirs, exists, abs } from "../../vc-audit-context/scripts/shared-skill-utils.mjs";

const root = process.cwd();
const failures = [];
const warnings = [];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function read(relPath) {
  return fs.readFileSync(path.isAbsolute(relPath) ? relPath : path.join(root, relPath), "utf8");
}

function guideExists(relPath) {
  return path.isAbsolute(relPath) ? fs.existsSync(relPath) : exists(relPath);
}

// --- Agent sync ---

function listAgentNames(dir, extension) {
  const dirAbs = path.join(root, dir);
  if (!fs.existsSync(dirAbs)) return [];
  return fs
    .readdirSync(dirAbs, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => entry.name.slice(0, -extension.length))
    .sort();
}

function extractTableAgents(text) {
  // Match backtick-wrapped agent/skill names in markdown table rows like: | `agent-name` | ... |
  // or: | 🔍 `agent-name` | ... | (with emoji prefix)
  const agents = new Set();
  for (const match of text.matchAll(/\|\s*[^|`]*`([a-z0-9_:-]+)`\s*\|/g)) {
    agents.add(match[1]);
  }
  return agents;
}

function extractInlineBackticks(text) {
  // Match any backtick-wrapped name in text (tables OR inline like `vc-foo` · `vc-bar`)
  const names = new Set();
  for (const match of text.matchAll(/`([a-z0-9_:-]+)`/g)) {
    names.add(match[1]);
  }
  return names;
}

const guideFlagIndex = process.argv.indexOf("--guide");
const guidePath = guideFlagIndex !== -1 ? process.argv[guideFlagIndex + 1] : "README.md";
const explicitGuide = guideFlagIndex !== -1;

// This validator audits the KIT repository's catalog README (the one carrying
// "## N Agents" / "## N Skills" sections, per vc-publish/SKILL.md badge checks).
// A consuming project's root README.md is an application doc and must NOT be
// forced to carry a harness catalog. Detect the catalog shape first; if it is
// absent, this repo is a consumer and the audit does not apply here.
// Section terminators must also accept end-of-input: a catalog section that runs to the
// end of the file is still a catalog section. Without the `$` alternative, a trailing
// "## N Skills" block matched nothing and every skill was silently reported missing.
const agentsSectionRe = /#{2,3} \d* ?Agents\b[\s\S]*?(?=\n#{2,3} [^#]|\n---|$)/;
const skillsSectionRe = /#{2,3} \d+ Skills\b[\s\S]*?(?=\n#{2,3} [^#]|\n---\n\n#{2,3} |$)/;

let skipped = null;
let auditable = false;
if (!guideExists(guidePath)) {
  // Only a hard failure when the caller explicitly pointed at a guide.
  if (explicitGuide) {
    fail(`${guidePath} does not exist`);
  } else {
    skipped = "README.md does not exist; nothing to sync against";
  }
} else {
  const probeText = read(guidePath);
  if (!agentsSectionRe.test(probeText) && !skillsSectionRe.test(probeText)) {
    skipped =
      `${guidePath} has no "## N Agents" or "## N Skills" catalog section, so it is an ` +
      `application README rather than the kit catalog. Guide-sync does not apply to consuming ` +
      `projects. Run this validator inside the kit repo, or pass --guide <path> to target an ` +
      `explicit catalog file.`;
  } else {
    auditable = true;
  }
}

if (auditable) {
  const guideText = read(guidePath);

  // Extract agents from the catalog tables (Core + Specialists sections)
  const agentsSectionMatch = guideText.match(agentsSectionRe);
  const agentsSection = agentsSectionMatch ? agentsSectionMatch[0] : "";
  const guideAgents = extractTableAgents(agentsSection);

  // Get disk agents
  const diskAgents = new Set(listAgentNames(".claude/agents", ".md"));

  // Check: every disk agent should be in the catalog
  for (const agent of diskAgents) {
    if (!guideAgents.has(agent)) {
      fail(`Agent ${agent} exists on disk but missing from ${guidePath} agent tables`);
    }
  }

  // Check: every catalog agent should exist on disk
  for (const agent of guideAgents) {
    if (!diskAgents.has(agent)) {
      warn(`Agent ${agent} listed in ${guidePath} but not found on disk at .claude/agents/${agent}.md`);
    }
  }

  // --- Skill sync ---

  // Extract skills from the catalog skill section (skills listed inline, not as tables)
  const skillsSectionMatch = guideText.match(skillsSectionRe);
  const skillsSection = skillsSectionMatch ? skillsSectionMatch[0] : "";
  const guideSkills = extractInlineBackticks(skillsSection);

  // Get disk skills that have a SKILL.md
  const diskSkillDirs = listSkillDirs();
  const diskSkills = new Set();
  for (const skill of diskSkillDirs) {
    const skillFile = `.claude/skills/${skill}/SKILL.md`;
    if (exists(skillFile)) {
      const parsed = parseFrontmatter(skillFile);
      if (parsed && parsed.fields.name) {
        diskSkills.add(parsed.fields.name);
      }
      // Also add folder name as alias
      diskSkills.add(skill);
    }
  }

  // Build a set of skill folder names for matching
  const diskSkillFolders = new Set(diskSkillDirs.filter((skill) => exists(`.claude/skills/${skill}/SKILL.md`)));

  // Check: every disk skill with a SKILL.md should be in the catalog
  for (const folder of diskSkillFolders) {
    const skillFile = `.claude/skills/${folder}/SKILL.md`;
    const parsed = parseFrontmatter(skillFile);
    const name = parsed?.fields?.name || folder;
    // Strip vc- prefix for matching (the catalog uses folder names, not vc--prefixed names)
    const nameWithoutPrefix = name.startsWith("vc-") ? name.slice(3) : name;
    // Check if the skill folder name, frontmatter name, or stripped name appears in the catalog
    if (!guideSkills.has(folder) && !guideSkills.has(name) && !guideSkills.has(nameWithoutPrefix)) {
      fail(`Skill ${folder} (name: ${name}) exists on disk but missing from ${guidePath} skill catalog`);
    }
  }

  // Check: every catalog skill should exist on disk
  for (const skill of guideSkills) {
    // Also check vc--prefixed variant (the catalog may list "code-reviewer" which is an agent, not a skill folder)
    if (!diskSkillFolders.has(skill) && !diskSkills.has(skill) && !diskSkills.has(`vc-${skill}`)) {
      warn(`Skill ${skill} listed in ${guidePath} but not found on disk`);
    }
  }
}

const result = {
  guidePath,
  checkedAgents: auditable,
  checkedSkills: auditable,
  skipped,
  warnings,
  failures,
};

console.log(JSON.stringify(result, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}
