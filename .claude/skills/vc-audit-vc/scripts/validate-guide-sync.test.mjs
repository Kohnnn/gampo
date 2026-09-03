import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const validator = ".claude/skills/vc-audit-vc/scripts/validate-guide-sync.mjs";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "guide-sync-"));
const owned = [{ path: tmp, operation: "rmdir", identity: fs.lstatSync(tmp, { bigint: true }) }];

function writeOwned(target, content) {
  fs.writeFileSync(target, content, { flag: "wx" });
  owned.push({ path: target, operation: "unlink", identity: fs.lstatSync(target, { bigint: true }) });
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && (left.mode & BigInt(fs.constants.S_IFMT)) === (right.mode & BigInt(fs.constants.S_IFMT));
}

function teardownOwned() {
  const failures = [];
  for (const entry of [...owned].reverse()) {
    try {
      if (!fs.existsSync(entry.path)) continue;
      const observed = fs.lstatSync(entry.path, { bigint: true });
      if (observed.isSymbolicLink() || !sameIdentity(entry.identity, observed)) throw new Error(`identity drift at ${entry.path}`);
      if (entry.operation === "unlink") fs.unlinkSync(entry.path);
      else fs.rmdirSync(entry.path);
    } catch (error) {
      failures.push(error.message);
    }
  }
  if (failures.length > 0) throw new Error(`guide-sync fixture teardown failed: ${failures.join("; ")}`);
}

process.on("exit", () => {
  try {
    teardownOwned();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
});

const agents = fs
  .readdirSync(path.join(root, ".claude/agents"), { withFileTypes: true })
  .filter((e) => e.isFile() && e.name.endsWith(".md"))
  .map((e) => e.name.slice(0, -3))
  .sort();

const skills = fs
  .readdirSync(path.join(root, ".claude/skills"), { withFileTypes: true })
  .filter((e) => e.isDirectory() && fs.existsSync(path.join(root, ".claude/skills", e.name, "SKILL.md")))
  .map((e) => e.name)
  .sort();

function buildCatalog(agentList, skillList) {
  const rows = agentList.map((a) => `| \`${a}\` | purpose |`).join("\n");
  const inline = skillList.map((s) => `\`${s}\``).join(" · ");
  return [
    "# Agent Harness Kit",
    "",
    `## ${agentList.length} Agents`,
    "",
    "| Agent | Purpose |",
    "|---|---|",
    rows,
    "",
    `## ${skillList.length} Skills`,
    "",
    inline,
    "",
  ].join("\n");
}

function run(args) {
  try {
    const out = execFileSync(process.execPath, [validator, ...args], { encoding: "utf8" });
    return { code: 0, json: JSON.parse(out) };
  } catch (err) {
    const raw = (err.stdout || "").toString();
    let json = null;
    try {
      json = JSON.parse(raw);
    } catch {
      json = null;
    }
    return { code: err.status ?? 1, json, raw: raw || String(err.message) };
  }
}

const cases = [];

function record(name, expect, actual, detail) {
  const ok = expect === actual;
  cases.push({ name, expect, actual, ok, detail });
}

// CASE 1 — complete catalog: must run the audit and find zero drift.
const completePath = path.join(tmp, "complete.md");
writeOwned(completePath, buildCatalog(agents, skills));
{
  const r = run(["--guide", completePath]);
  const audited = r.json && r.json.skipped === null && r.json.checkedAgents === true;
  record(
    "complete-catalog-audits-and-passes",
    "accept",
    r.code === 0 && audited && r.json.failures.length === 0 ? "accept" : "reject",
    `exit=${r.code} skipped=${r.json ? JSON.stringify(r.json.skipped) : "n/a"} failures=${r.json ? r.json.failures.length : "n/a"}`
  );
}

// CASE 2 — real drift: one agent and one skill removed. MUST fail with exactly 2 findings.
const driftPath = path.join(tmp, "drift.md");
const droppedAgent = agents[Math.floor(agents.length / 2)];
const droppedSkill = skills[Math.floor(skills.length / 2)];
writeOwned(
  driftPath,
  buildCatalog(
    agents.filter((a) => a !== droppedAgent),
    skills.filter((s) => s !== droppedSkill)
  )
);
{
  const r = run(["--guide", driftPath]);
  const f = r.json ? r.json.failures : [];
  const caughtAgent = f.some((m) => m.includes(droppedAgent));
  const caughtSkill = f.some((m) => m.includes(droppedSkill));
  record(
    "real-drift-still-detected",
    "reject",
    r.code !== 0 && caughtAgent && caughtSkill ? "reject" : "accept",
    `exit=${r.code} failures=${f.length} caughtAgent(${droppedAgent})=${caughtAgent} caughtSkill(${droppedSkill})=${caughtSkill}`
  );
}

// CASE 3 — explicit --guide pointing at a missing file must FAIL, never silently skip.
{
  const r = run(["--guide", path.join(tmp, "does-not-exist.md")]);
  const f = r.json ? r.json.failures : [];
  record(
    "explicit-missing-guide-fails",
    "reject",
    r.code !== 0 && f.some((m) => m.includes("does not exist")) ? "reject" : "accept",
    `exit=${r.code} failures=${JSON.stringify(f)}`
  );
}

// CASE 4 — application README (no catalog sections) must SKIP with zero failures.
const appPath = path.join(tmp, "app-readme.md");
writeOwned(appPath, "# Some App\n\n## Run Locally\n\nnpm run dev\n");
{
  const r = run(["--guide", appPath]);
  const skippedCleanly =
    r.code === 0 && r.json && typeof r.json.skipped === "string" && r.json.failures.length === 0;
  record(
    "application-readme-skips-cleanly",
    "accept",
    skippedCleanly ? "accept" : "reject",
    `exit=${r.code} skipped=${r.json ? Boolean(r.json.skipped) : "n/a"} failures=${r.json ? r.json.failures.length : "n/a"}`
  );
}

// CASE 5 — a catalog with ONLY an Agents section must still audit (not skip).
const agentsOnlyPath = path.join(tmp, "agents-only.md");
writeOwned(
  agentsOnlyPath,
  ["# Kit", "", `## ${agents.length} Agents`, "", "| Agent | Purpose |", "|---|---|", agents.map((a) => `| \`${a}\` | p |`).join("\n"), ""].join("\n")
);
{
  const r = run(["--guide", agentsOnlyPath]);
  const audited = r.json && r.json.skipped === null;
  record(
    "agents-only-catalog-still-audits",
    "reject",
    r.code !== 0 && audited ? "reject" : "accept",
    `exit=${r.code} skipped=${r.json ? JSON.stringify(r.json.skipped) : "n/a"} failures=${r.json ? r.json.failures.length : "n/a"}`
  );
}

teardownOwned();
owned.length = 0;

let failed = 0;
for (const c of cases) {
  if (!c.ok) failed += 1;
  console.log(`  ${c.ok ? "OK  " : "FAIL"} ${c.name} expected=${c.expect} actual=${c.actual}`);
  console.log(`       ${c.detail}`);
}
console.log(
  failed === 0
    ? `PASS: ${cases.length} guide-sync behavior case(s) met expectations.`
    : `FAIL: ${failed} of ${cases.length} guide-sync case(s) behaved unexpectedly.`
);
process.exitCode = failed === 0 ? 0 : 1;
