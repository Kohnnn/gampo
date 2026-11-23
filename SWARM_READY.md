# Swarm-ready handoff

Repository: `Kohnnn/gampo`. Contract: `swarm-ready/v1`. Source inspection: 2026-11-23.
Default branch: `main`. Inspected base: [4994bd02abba](https://github.com/Kohnnn/gampo/commit/4994bd02abba06262c84ca0b777f9423c07fd889).

**Status: documented; runtime qualification is unverified.** This file defines an agent workflow. It does not install a shell command, enroll the repository in a scheduler, certify test success, or activate VMs. Follow the current user task and existing repository instructions; retain prior authorization within its actual scope.

## Invoke

Give the working agent this prompt:

```text
swarm ready: <one measurable repository objective>
Read SWARM_READY.md and the repository's issue-tracker guide. Continue the current owned
work or ready issue, establish the baseline and acceptance check, then prepare
a bounded worker handoff. Use existing authorized tools and capacity. Report
what is documented, implemented, tested, and observed separately.
```

If a `swarm-ready` skill is installed, load it. Otherwise execute the documented workflow directly. Treat the phrase as an agent instruction unless the installed CLI explicitly advertises it. Inspect help/version before using optional command adapters.

## Repository starting point

Read the [GitHub issue-tracker guide](docs/agents/issue-tracker.md), [README](README.md), and [design notes](DESIGN.md). Continue the existing assigned issue or scoped work order; for a new slice, record the outcome and verifier before editing. Do not take over an unrelated QA or Wayfinder ticket.

Start with one writer. Add workers only for disjoint changes or independent experiments whose results can be checked separately. Keep shared interfaces and final integration with one owner.

Use the existing storage, QA-seam and browser checks when those components change. Fast-suite success does not prove the excluded slot behaviors.

The base above is an inspection snapshot, not a permanent working branch. Refresh the actual target branch, current issues, incumbent worker and applicable nested instructions before editing. Preserve unrelated changes and upstream/fork boundaries.

## Execution logic

1. **Recover context.** Read the current issue, work order and last evidence-backed handoff. Keep useful work and the active worker. Record source commit, unresolved criteria and the next action; avoid repeating completed investigation.
2. **Define success.** State one outcome, baseline, target, changed paths, verification command and expected result. Keep acceptance criteria and reference data fixed unless the user changes the requirement.
3. **Bound the attempt.** Reuse the existing owner/task/attempt identities, action scope, resource limits, time/cost budget and retry allowance. Do not demand a new user-written permission receipt for already authorized work. If a real capability or grant is missing, name the exact blocked action and continue independent work.
4. **Partition only useful work.** Use one writer per branch/worktree and non-overlapping change scope. Reuse the existing task ledger and dependency graph. Reserve verification capacity before adding workers; avoid recursive worker growth and duplicate coordinators.
5. **Implement and measure.** Make the smallest coherent change. Use differential checks when a trusted reference exists, and deterministic failure simulation when it materially improves reproduction. Record the seed/configuration and counterexamples. Do not weaken tests, rewrite baselines or hide pre-existing failures to claim success.
6. **Verify and integrate.** Verify the exact returned commit independently in a clean environment. Recheck the final integrated revision when changes interact. Follow existing review, merge and deployment rules; a green worker report alone cannot override them. Use the narrowest checks that resolve a concrete risk.
7. **Checkpoint and finish.** Save candidate SHA, evidence, measured outcome, remaining blockers and a precise next action before context/lease expiry. Reconcile lost or duplicate completions before retrying. Release only the run's owned resources after preserving evidence. Stop when the requested outcome is met or a concrete blocker prevents the next required action.

## Offline setup and verification

For docs-only work, start at the repository root with Git; no Node install or dependency install is needed. Set `base` to the agreed review-base SHA. Confirm the branch and scope with `git status --short` and `git diff --name-status "$base"`. Use `git ls-files --error-unmatch -- README.md SWARM_READY.md package.json package-lock.json .github/workflows/ci.yml docs/agents/issue-tracker.md` to check the entry paths, resolve the changed relative links and headings locally, and require `git diff --check "$base"` to pass.

For separately authorized app work, [Run Locally](README.md#run-locally) gives the setup. [The package manifest](package.json) declares Node 24.x; [CI](.github/workflows/ci.yml) uses Node 24 and `npm ci` against the [lockfile](package-lock.json). The install is not part of offline review. The table below lists source-declared app checks, not steps to run for a docs-only task.

| Declared command | Working directory | Source and limit |
| --- | --- | --- |
| `npm test` | `.` | package.json; full Vitest run |
| `npm run typecheck:core` | `.` | package.json; core TypeScript checks |
| `npm run lint:ratchet` | `.` | package.json and CI; lint ratchet |
| `npm run build` | `.` | package.json; Vite build |
| `npm run test:ci:fast` | `.` | package.json; excludes slotFactory.test.js and slotRtp.test.js; not full-suite evidence |

For app changes, consult [required verification](README.md#required-verification) and the CI workflow for the full sequence and browser-check scope. None of these app commands was run for this documentation change. A passing offline review is not permission to push or merge: confirm that the specific branch update will not trigger an out-of-scope preview or deployment.

## Required handoff result

Return a concise record with `repository`, `objective`, `issue_or_work_order`, `base_sha`, `candidate_sha`, `owner`, `task_id`, `attempt_id`, `worker/session`, `branch/worktree`, `changed_paths`, `environment`, `resource/budget limits`, `acceptance`, `commands_and_results`, `evidence_refs`, `known_failures`, `blocker_owner`, `next_action`, and `cleanup_status`. Use null/unknown when a field is unavailable; never manufacture evidence or authority.

Keep documentation readiness, command availability, source tests, live environment qualification and accepted outcome as separate states. Count verified outcomes, regressions, elapsed time, cost and human interventions. Commits, lines, tokens and worker count describe activity only.
