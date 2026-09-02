# Fixture — Cleanup Family and Companions

## Validate Contract

```json cleanup-negative-cases/v1
[
  { "name": "malformed-family", "path": "allowed_scope.0.fixture_family", "value": "normal" },
  { "name": "pid-mismatch", "path": "allowed_scope.0.pid", "value": "999" },
  { "name": "uuid-mismatch", "path": "allowed_scope.0.fixture_uuid", "value": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
  { "name": "role-mismatch", "path": "allowed_scope.0.role", "value": "source" },
  { "name": "unpaired-link", "path": "allowed_scope.0.companion_ordinal", "value": 0 },
  { "name": "nonreciprocal", "path": "allowed_scope.2.companion_ordinal", "value": 2 },
  { "name": "wrong-link-text", "path": "allowed_scope.0.symlink_target_b64", "value": "d3Jvbmc=" },
  { "name": "orphan-marked-present", "path": "allowed_scope.4.expected_companion_state", "value": "present" }
]
```
