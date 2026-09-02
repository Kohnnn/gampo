# Fixture — Cleanup Tracked, Normal, Nested, File

## Validate Contract

```json cleanup-negative-cases/v1
[
  { "name": "normal-basename", "path": "allowed_scope.0.basename_b64", "value": "UkVBRE1FLm1k" },
  { "name": "git-basename", "path": "allowed_scope.0.basename_b64", "value": "LmdpdA==" },
  { "name": "nested", "path": "allowed_scope.0.basename_b64", "value": "YS9i" },
  { "name": "regular-file-type", "path": "allowed_scope.0.mode_type", "value": "file" },
  { "name": "directory-link-role", "path": "allowed_scope.0.mode_type", "value": "directory" },
  { "name": "nonempty-declaration", "path": "allowed_scope.2.empty_directory", "value": false },
  { "name": "tracked-shape-denied", "path": "allowed_scope.0.fixture_family", "value": ".git" }
]
```
