# Fixture — Unknown Envelope / Report Schema

**Report destination:** `.claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/reports/fail-unknown-envelope-report-schema-report.md`

## Overview

Fixture plan for `validate-execution-authority-envelope.mjs`. Expected result: **non-zero**.
`artifact_schema_version` is `phase-report/v2`, which is not a supported report schema. The
companion unknown-fence-label case (`execution-authority-envelope/vN`) is asserted by the
validator self-check cases.

## Validate Contract

Status: PASS

### Execution Authority & Evidence Envelope

```json execution-authority-envelope/v1
{
  "selected_plan": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-unknown-envelope-report-schema.md",
  "authority_mode": {
    "mode": "standing-granted",
    "proof_path": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/proof/standing-goal-block.md"
  },
  "allowed_scope": [
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/**"
  ],
  "stop_conditions": [
    "outward-facing action"
  ],
  "artifact_path": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/reports/fail-unknown-envelope-report-schema-report.md",
  "artifact_schema_version": "phase-report/v2"
}
```
