# Fixture — Valid Fixture Residue Cleanup Set

## Validate Contract

```json execution-authority-envelope/v1
{
  "selected_plan": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/pass-fixture-residue-cleanup-set.md",
  "authority_mode": { "mode": "standing-granted", "proof_path": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/proof/standing-goal-block.md" },
  "authorityClass": "fixture-residue-cleanup-set/v1",
  "repository_root": { "absolute_path": "/execution-authority-portable-fixture-root", "dev": "700", "ino": "800", "mode_type": "directory", "mode": "493", "uid": "1000", "gid": "1000" },
  "allowed_scope": [
    { "ordinal": 1, "basename_b64": "QzpcVXNlcnNcQWRtaW5cQXBwRGF0YVxMb2NhbFxUZW1wXG9wZW5jb2RlXGV4ZWN1dGlvbi1hdXRob3JpdHktY2xlYW51cC1qdW5jdGlvbi0xMDEtMTExMTExMTEtMTExMS00MTExLTgxMTEtMTExMTExMTExMTExLWxpbms=", "operation": "unlink", "fixture_family": "execution-authority-cleanup-junction", "pid": "101", "fixture_uuid": "11111111-1111-4111-8111-111111111111", "role": "link", "companion_ordinal": 3, "expected_companion_state": "present", "dev": "900", "ino": "1001", "mode_type": "symlink", "mode": "511", "uid": "1000", "gid": "1000", "symlink_target_b64": "QzovVXNlcnMvQWRtaW4vQXBwRGF0YS9Mb2NhbC9UZW1wL29wZW5jb2RlL2V4ZWN1dGlvbi1hdXRob3JpdHktY2xlYW51cC1qdW5jdGlvbi0xMDEtMTExMTExMTEtMTExMS00MTExLTgxMTEtMTExMTExMTExMTExLXNvdXJjZQ==", "empty_directory": false },
    { "ordinal": 2, "basename_b64": "QzpcVXNlcnNcQWRtaW5cQXBwRGF0YVxMb2NhbFxUZW1wXG9wZW5jb2RlXGV4ZWN1dGlvbi1hdXRob3JpdHktY2xlYW51cC1qdW5jdGlvbi1zdWJzdGl0dXRlLTEwMi0yMjIyMjIyMi0yMjIyLTQyMjItODIyMi0yMjIyMjIyMjIyMjItbGluaw==", "operation": "unlink", "fixture_family": "execution-authority-cleanup-junction-substitute", "pid": "102", "fixture_uuid": "22222222-2222-4222-8222-222222222222", "role": "link", "companion_ordinal": 4, "expected_companion_state": "present", "dev": "900", "ino": "1002", "mode_type": "symlink", "mode": "511", "uid": "1000", "gid": "1000", "symlink_target_b64": "QzovVXNlcnMvQWRtaW4vQXBwRGF0YS9Mb2NhbC9UZW1wL29wZW5jb2RlL2V4ZWN1dGlvbi1hdXRob3JpdHktY2xlYW51cC1qdW5jdGlvbi1zdWJzdGl0dXRlLTEwMi0yMjIyMjIyMi0yMjIyLTQyMjItODIyMi0yMjIyMjIyMjIyMjItc291cmNl", "empty_directory": false },
    { "ordinal": 3, "basename_b64": "QzpcVXNlcnNcQWRtaW5cQXBwRGF0YVxMb2NhbFxUZW1wXG9wZW5jb2RlXGV4ZWN1dGlvbi1hdXRob3JpdHktY2xlYW51cC1qdW5jdGlvbi0xMDEtMTExMTExMTEtMTExMS00MTExLTgxMTEtMTExMTExMTExMTExLXNvdXJjZQ==", "operation": "rmdir", "fixture_family": "execution-authority-cleanup-junction", "pid": "101", "fixture_uuid": "11111111-1111-4111-8111-111111111111", "role": "source", "companion_ordinal": 1, "expected_companion_state": "present", "dev": "900", "ino": "1003", "mode_type": "directory", "mode": "509", "uid": "1000", "gid": "1000", "symlink_target_b64": "", "empty_directory": true },
    { "ordinal": 4, "basename_b64": "QzpcVXNlcnNcQWRtaW5cQXBwRGF0YVxMb2NhbFxUZW1wXG9wZW5jb2RlXGV4ZWN1dGlvbi1hdXRob3JpdHktY2xlYW51cC1qdW5jdGlvbi1zdWJzdGl0dXRlLTEwMi0yMjIyMjIyMi0yMjIyLTQyMjItODIyMi0yMjIyMjIyMjIyMjItc291cmNl", "operation": "rmdir", "fixture_family": "execution-authority-cleanup-junction-substitute", "pid": "102", "fixture_uuid": "22222222-2222-4222-8222-222222222222", "role": "source", "companion_ordinal": 2, "expected_companion_state": "present", "dev": "900", "ino": "1004", "mode_type": "directory", "mode": "509", "uid": "1000", "gid": "1000", "symlink_target_b64": "", "empty_directory": true },
    { "ordinal": 5, "basename_b64": "QzpcVXNlcnNcQWRtaW5cQXBwRGF0YVxMb2NhbFxUZW1wXG9wZW5jb2RlXGV4ZWN1dGlvbi1hdXRob3JpdHktY2xlYW51cC1qdW5jdGlvbi0xMDMtMzMzMzMzMzMtMzMzMy00MzMzLTgzMzMtMzMzMzMzMzMzMzMzLXNvdXJjZQ==", "operation": "rmdir", "fixture_family": "execution-authority-cleanup-junction", "pid": "103", "fixture_uuid": "33333333-3333-4333-8333-333333333333", "role": "source", "companion_ordinal": 0, "expected_companion_state": "absent", "dev": "900", "ino": "1005", "mode_type": "directory", "mode": "509", "uid": "1000", "gid": "1000", "symlink_target_b64": "", "empty_directory": true },
    { "ordinal": 6, "basename_b64": "QzpcVXNlcnNcQWRtaW5cQXBwRGF0YVxMb2NhbFxUZW1wXG9wZW5jb2RlXGV4ZWN1dGlvbi1hdXRob3JpdHktY2xlYW51cC1qdW5jdGlvbi1zdWJzdGl0dXRlLTEwNC00NDQ0NDQ0NC00NDQ0LTQ0NDQtODQ0NC00NDQ0NDQ0NDQ0NDQtc291cmNl", "operation": "rmdir", "fixture_family": "execution-authority-cleanup-junction-substitute", "pid": "104", "fixture_uuid": "44444444-4444-4444-8444-444444444444", "role": "source", "companion_ordinal": 0, "expected_companion_state": "absent", "dev": "900", "ino": "1006", "mode_type": "directory", "mode": "509", "uid": "1000", "gid": "1000", "symlink_target_b64": "", "empty_directory": true }
  ],
  "scope_count": 6,
  "operation_count": 6,
  "stop_conditions": ["identity drift", "tracked target"],
  "stop_condition_count": 2,
  "creation_count": 0,
  "source_write_count": 0,
  "cleanup_receipt_schema_version": "fixture-residue-cleanup-receipt/v2"
}
```
