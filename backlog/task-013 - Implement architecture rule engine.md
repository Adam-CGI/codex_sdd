---
id: task-013
version: 1
status: Backlog
assignee: agent:codex
priority: medium
created: 2025-12-11T10:00:00Z
updated: 2025-12-11T10:00:00Z
schema_version: "3.0"
---
# Implement architecture rule engine

## Description
Build `arch/rules-store.ts` to load `architecture/rules.yaml`, evaluate layer/pattern rules, and expose `arch.validate_spec` + `arch.annotate_spec_and_tasks` tools.

## Acceptance Criteria
- [ ] Parses layers, rules, and prohibited patterns; returns RULE_PARSE_ERROR on invalid config.
- [ ] `arch.validate_spec` scans spec text for layer references/import hints and reports issues with severity/type per SDD.
- [ ] `arch.annotate_spec_and_tasks` can write or attach report notes (no-op ok if annotation strategy minimal).
- [ ] Unit tests cover valid/invalid rules.yaml, violation detection, and spec not found.

## Implementation Notes
- Keep rule grammar `<layer> <constraint> <layer>`; map file paths to layers by prefix.
- For patterns, use glob filtering + regex matching.

## Links
- Spec: docs/mcp-kanban-sdd.md#53-architecture-rules
- Related: task-009, task-015
