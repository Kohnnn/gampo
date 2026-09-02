# Fixture — Cleanup Root and Target Identity

## Validate Contract

```json cleanup-negative-cases/v1
[
  { "name": "wrong-root", "path": "repository_root.absolute_path", "value": "/tmp" },
  { "name": "wrong-root-dev", "path": "repository_root.dev", "value": "1" },
  { "name": "zero-root-inode", "path": "repository_root.ino", "value": "0" },
  { "name": "target-dev-drift", "path": "allowed_scope.0.dev", "value": "901" },
  { "name": "target-mode-drift", "path": "allowed_scope.2.mode", "value": "493" },
  { "name": "target-owner-drift", "path": "allowed_scope.3.uid", "value": "0" },
  { "name": "duplicate-inode", "path": "allowed_scope.1.ino", "value": "1001" }
]
```
