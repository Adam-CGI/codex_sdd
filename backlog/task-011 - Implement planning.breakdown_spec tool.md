---
id: task-011
version: 2
status: Done
assignee: human:adam
priority: medium
created: 2025-12-11T09:00:00Z
updated: 2025-12-11T15:30:00Z
schema_version: "3.0"
---
# Implement planning.breakdown_spec tool

## Description
Implement MCP tool `planning.breakdown_spec` to generate task stubs from a spec, writing `/backlog/task-*.md` linked to the spec and updating index.json.

## Acceptance Criteria
- [x] Reads spec via spec-store; errors with SPEC_NOT_FOUND when missing.
- [x] Creates numbered task files with links to spec and initial status=Backlog.
- [x] Returns spec_id, task_ids, summary text.
- [x] Triggers index rebuild hook (task-012) after creation.
- [x] Unit tests cover successful generation, missing spec, existing task collision handling.

## Implementation Notes
- Implement deterministic ID/filename scheme; ensure schema_version set to 3.0.

## Links
- Spec: docs/mcp-kanban-sdd.md#152-planning
- Related: task-004, task-009, task-012
