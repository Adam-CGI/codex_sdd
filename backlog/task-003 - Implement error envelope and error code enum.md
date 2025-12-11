---
id: task-003
version: 2
status: Done
assignee: human:adam
priority: medium
created: 2025-12-11T09:00:00Z
updated: 2025-12-11T14:44:36Z
schema_version: "3.0"
---
# Implement error envelope and error code enum

## Description
Create shared error model with enum of all codes defined in SDD, helper for `{ error: { code, message, details } }` envelope, and utilities for mapping validation failures to codes.

## Acceptance Criteria
- [x] Error code enum includes all values in docs section 10.2.
- [x] Helper functions produce envelope consistently; normal responses unaffected.
- [x] Tools can throw/return typed errors; envelope serializer tested.
- [x] Unit tests cover envelope format and representative codes.

## Implementation Notes
- Consider `Result<T, ErrorEnvelope>` helper or custom Error subclass carrying code/details.
- Keep messages human-readable; details typed as record.

## Links
- Spec: docs/mcp-kanban-sdd.md#10-error-handling--error-codes
- Related: all tool tasks
