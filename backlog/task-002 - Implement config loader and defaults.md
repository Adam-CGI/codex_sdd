---
id: task-002
version: 2
status: Done
assignee: human:adam
priority: medium
created: 2025-12-11T09:00:00Z
updated: 2025-12-11T14:41:35Z
schema_version: "3.0"
---
# Implement config loader and defaults

## Description
Build `config/config-loader.ts` that reads `/backlog/config.yaml`, validates schema_version 3.0, applies defaults when missing, and hot-reloads on file change (watcher).

## Acceptance Criteria
- [x] Loads config from repo root with fallback defaults when file absent.
- [x] Validates statuses, in_progress_statuses, transitions, roles; returns CONFIG_INVALID on bad values.
- [x] Emits CONFIG_NOT_FOUND only when file missing and defaults applied is noted.
- [x] File watcher or explicit reload tested; cached copy accessible.
- [x] Unit tests cover valid, missing, malformed, unknown keys preserved.

## Implementation Notes
- Use `yaml` package; keep unknown keys in memory for round-tripping if needed.
- Return strongly typed Config object used by other services.

## Links
- Spec: docs/mcp-kanban-sdd.md#4-config--status-model
- Related: task-017 (auth/gate), task-007 (tasks.move)
