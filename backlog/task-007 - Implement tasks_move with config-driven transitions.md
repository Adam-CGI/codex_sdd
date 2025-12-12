---
id: task-007
version: 2
status: Done
assignee: human:adam
priority: medium
created: 2025-12-11T09:00:00Z
updated: 2025-12-11T14:59:12Z
schema_version: "3.0"
---
# Implement tasks_move with config-driven transitions

## Description
Implement MCP tool `tasks_move` that enforces config-driven transitions, dependency checks, gate statuses, and optional maintainer `force`.

## Acceptance Criteria
- [x] Validates to_status exists in config.statuses; otherwise TASK_INVALID_STATUS.
- [x] Enforces transitions map when present; returns INVALID_TRANSITION unless force + maintainer.
- [x] Checks depends_on tasks are Done before entering `in_progress_statuses`; returns DEPENDENCIES_NOT_MET otherwise.
- [x] Optimistic version check; returns updated `TaskMeta`.
- [x] Unit tests cover allowed/blocked transitions, force override, dependency failure.

## Implementation Notes
- Reuse task-store for dependency reads; minimize I/O where possible.

## Links
- Spec: docs/mcp-kanban-sdd.md#15-appendix-a--tool-schemas-summary
- Related: task-002, task-004, task-006, task-017
