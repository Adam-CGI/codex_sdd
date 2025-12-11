---
id: task-018
version: 2
status: Done
assignee: agent:codex
priority: low
created: 2025-12-11T10:18:00Z
updated: 2025-12-11T15:43:00Z
schema_version: "3.0"
---
# Implement logging, observability, and rate limiting

## Description
Add pino-based structured logging, per-tool metrics hooks, and optional per-caller rate limiting per SDD section 14.

## Acceptance Criteria
- [x] Logger initialized in entrypoint with pretty dev transport; all tool handlers log start/end + errors.
- [x] Basic counters/timers per tool collected (in-memory) and exposed via debug log or optional endpoint.
- [x] Optional rate limiter (e.g., token bucket) configurable; returns RATE_LIMIT_EXCEEDED when tripped.
- [x] Unit tests cover limiter trip/reset and logger being invoked without crashing handlers.

## Implementation Notes
- Keep observability lightweight; no external services.
- Rate limits configurable via config or env; defaults off.

## Links
- Spec: docs/mcp-kanban-sdd.md#14-observability-testing--migration
- Related: task-003, task-014
