---
id: task-005
version: 2
status: Done
assignee: human:adam
priority: medium
created: 2025-12-11T09:00:00Z
updated: 2025-12-11T14:48:10Z
schema_version: "3.0"
---
# Implement tasks_get tool

## Description
Expose MCP tool `tasks_get` that uses task-store to read a task by id, returning parsed meta, sections, and raw path with proper error codes.

## Acceptance Criteria
- [x] Resolves task by filename pattern; returns TASK_NOT_FOUND when missing.
- [x] Returns parsed `TaskMeta`, sections map, raw_path.
- [x] Propagates TASK_PARSE_ERROR on malformed frontmatter.
- [x] Unit tests cover happy path, missing file, bad YAML.

## Implementation Notes
- Ensure id match between filename and meta; return TASK_ID_MISMATCH or auto-fix per error helper.

## Links
- Spec: docs/mcp-kanban-sdd.md#15-appendix-a--tool-schemas-summary
- Related: task-004
