---
id: task-012
version: 2
status: Done
assignee: human:adam
priority: medium
created: 2025-12-11T09:00:00Z
updated: 2025-12-11T15:18:00Z
schema_version: "3.0"
---
# Implement backlog index.json generator

## Description
Generate /backlog/index.json mapping specs to tasks and tasks to basic metadata.

## Acceptance Criteria
- [x] `planning.rebuild_index` tool reads tasks/specs and writes index.json per schema (version, schema_version, generated_at, features[], tasks{}).
- [x] Handles stale detection (if task/spec newer than generated_at) and exposes flag/result.
- [x] Runs after planning.breakdown_spec and when task spec link changes.
- [x] Unit tests cover empty repo, tasks-only, specs-only, combined, and stale detection.

## Implementation Notes
- Consider caching summaries for kanban performance.

## Links
- Spec: docs/mcp-kanban-sdd.md#54-backlogindexjson-schema
- Related: task-011, task-008
