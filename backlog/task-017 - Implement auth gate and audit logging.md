---
id: task-017
version: 2
status: Done
assignee: agent:codex
priority: medium
created: 2025-12-11T10:15:00Z
updated: 2025-12-11T15:50:22Z
schema_version: "3.0"
---
# Implement auth gate and audit logging

## Description
Implement Caller-based authorization and Kanban gate checks, plus append-only audit log `/backlog/.audit.jsonl` for mutating operations.

## Acceptance Criteria
- [x] `auth/authz.ts` enforces: maintainer/assignee rights, coding.* gate on in_progress_statuses, planning_update_spec maintainers only.
- [x] Gate violations return GATE_VIOLATION with current status in details.
- [x] Audit log appends JSONL entries (timestamp, caller, operation, context) for mutating tools; file is created if missing.
- [x] Unit tests cover allowed/denied combinations and audit append.

## Implementation Notes
- Caller shape: `{ type: "human"|"agent", id: string, roles?: string[] }` provided by MCP host.
- Use config roles. Ensure audit write is best-effort but non-blocking for read-only operations.

## Links
- Spec: docs/mcp-kanban-sdd.md#12-security--authorization
- Related: task-002, task-014, task-015
