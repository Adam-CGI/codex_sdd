---
id: task-004
version: 2
status: Done
assignee: human:adam
priority: medium
created: 2025-12-11T09:00:00Z
updated: 2025-12-11T14:55:27Z
schema_version: "3.0"
---
# Implement TaskMeta parser and writer

## Description
Implement `backlog/task-store.ts`: parse/render `/backlog/task-*.md`, support YAML frontmatter + inline metadata precedence, optimistic version handling, and unknown-key preservation.

## Acceptance Criteria
- [x] Parsing returns `TaskMeta` + named sections; preserves unknown keys.
- [x] Rendering round-trips without metadata loss; respects frontmatter precedence rules.
- [x] Supports depends_on, schema_version 3.0, default version=1 when missing.
- [x] Unit tests cover frontmatter vs inline precedence, unknown keys, missing fields, depends_on.

## Implementation Notes
- Use `gray-matter` for frontmatter; avoid reordering keys where possible.
- Provide helper to lock file path ↔ id consistency.

## Links
- Spec: docs/mcp-kanban-sdd.md#51-tasks
- Related: task-005, task-006, task-007
