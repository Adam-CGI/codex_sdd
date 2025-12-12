---
id: task-014
version: 2
status: Done
assignee: agent:codex
priority: medium
created: 2025-12-11T10:05:00Z
updated: 2025-12-11T15:19:00Z
schema_version: "3.0"
---
# Implement coding tools

## Description
Implement `coding_start_task`, `coding_suggest_next_step`, and `coding_update_task_status` using gate enforcement and data from tasks/specs/architecture/git.

## Acceptance Criteria
- [x] `coding_start_task` returns task meta/sections, spec summary, architecture rules path/notes, git context, and relevant review docs; errors with GATE_VIOLATION or SPEC_NOT_FOUND appropriately.
- [x] `coding_suggest_next_step` returns structured next step with description, estimated_complexity, expected_files.
- [x] `coding_update_task_status` enforces transition rules and gate; returns INVALID_TRANSITION or GATE_VIOLATION as needed.
- [x] Unit tests cover gate checks (in_progress_statuses), missing spec, unauthorized caller, and happy path.

## Implementation Notes
- Reuse tasks_move logic for status updates; avoid duplicating transition rules.
- Gate + auth logic from task-017.

## Links
- Spec: docs/mcp-kanban-sdd.md#154-coding
- Related: task-007, task-017, task-015
