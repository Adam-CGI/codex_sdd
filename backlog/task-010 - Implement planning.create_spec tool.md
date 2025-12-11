---
id: task-010
version: 2
status: Done
assignee: human:adam
priority: medium
created: 2025-12-11T09:00:00Z
updated: 2025-12-11T15:08:00Z
schema_version: "3.0"
---
# Implement planning.create_spec tool

## Description
Expose MCP tool `planning.create_spec` to create a new feature spec file (id = slugified name), with initial sections/goals and optional requirements text or file input.

## Acceptance Criteria
- [x] Generates spec path under `/specs` with frontmatter (id, status=Planned, schema_version).
- [x] Populates Goals/Non-Goals/Context from inputs where possible; adds changelog entry.
- [x] Returns spec_id, spec_path, summary (title, goals, non_goals).
- [x] Handles existing file collision gracefully.
- [x] Unit tests cover happy path, collision, invalid input.

## Implementation Notes
- Use spec-store writer; optional requirements_path read from repo.

## Links
- Spec: docs/mcp-kanban-sdd.md#152-planning
- Related: task-009, task-011, task-012
