---
id: task-006
version: 2
status: Done
assignee: human:adam
priority: medium
created: 2025-12-11T09:00:00Z
updated: 2025-12-11T15:07:00Z
schema_version: "3.0"
---
# Implement tasks.update with optimistic locking

## Description
Implement MCP tool `tasks.update` to apply partial updates to metadata/sections with optimistic version checks and write-through to disk.

## Acceptance Criteria
- [x] Requires caller-provided version; returns CONFLICT_DETECTED when stale.
- [x] Preserves unknown metadata keys and section ordering.
- [x] Updates `updated` timestamp; increments version on success.
- [x] Emits TASK_NOT_FOUND, TASK_PARSE_ERROR, TASK_LOCKED as appropriate.
- [x] Unit tests cover conflict, happy path, locked file simulation.

## Implementation Notes
- Consider advisory locks using fs-ext; fall back to retry/backoff.
- Hook audit logging in task-017.

## Links
- Spec: docs/mcp-kanban-sdd.md#15-appendix-a--tool-schemas-summary
- Related: task-004, task-017
