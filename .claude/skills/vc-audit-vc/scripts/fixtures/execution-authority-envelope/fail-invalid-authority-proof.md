# Fixture — Invalid Authority Proof

**Report destination:** `.claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/reports/fail-invalid-authority-proof-report.md`

## Overview

Fixture plan for `validate-execution-authority-envelope.mjs`. Expected result: **non-zero**.
The mode is `standing-granted` but the proof block lacks the exact consent string
`EXECUTE CONSENT: standing-granted`.

## Validate Contract

Status: PASS

### Execution Authority & Evidence Envelope

```json execution-authority-envelope/v1
{
  "selected_plan": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-invalid-authority-proof.md",
  "authority_mode": {
    "mode": "standing-granted",
    "proof_path": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/proof/no-consent-goal-block.md"
  },
  "allowed_scope": [
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/**"
  ],
  "stop_conditions": [
    "outward-facing action"
  ],
  "artifact_path": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/reports/fail-invalid-authority-proof-report.md",
  "artifact_schema_version": "phase-report/v1"
}
```
