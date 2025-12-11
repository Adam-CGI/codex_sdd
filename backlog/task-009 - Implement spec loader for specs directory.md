---
id: task-009
version: 2
status: Done
assignee: human:adam
priority: medium
created: 2025-12-11T09:00:00Z
updated: 2025-12-11T14:56:58Z
schema_version: "3.0"
---
# Implement spec loader for specs directory

## Description
Implement `specs/spec-store.ts` to parse/write specs under `/specs`, respecting schema_version 3.0 and changelog handling.

## Acceptance Criteria
- [x] Parses frontmatter (id, status, schema_version) + sections into structured object.
- [x] Writes updated content while preserving unknown sections and formatting.
- [x] Supports optional versioning or changelog append.
- [x] Unit tests cover missing spec (SPEC_NOT_FOUND), malformed frontmatter, round-trip.

## Implementation Notes
- Reuse gray-matter; keep spec id consistent with filename when present.

## Links
- Spec: docs/mcp-kanban-sdd.md#52-specs
- Related: task-010, task-011
