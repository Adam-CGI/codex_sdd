---
id: task-008
version: 2
status: Done
assignee: human:adam
priority: medium
created: 2025-12-11T09:00:00Z
updated: 2025-12-11T14:50:38Z
schema_version: "3.0"
---
# Implement kanban.get_board with pagination

## Description
Return a board grouped by status/columns with optional filters and pagination.

## Acceptance Criteria
- [x] Supports filters: status_filter, assignee, spec_id; paginates with page/page_size.
- [x] Maps statuses to column display names from config.columns.
- [x] Uses task-store for parsing; handles TASK_PARSE_ERROR gracefully.
- [x] Response includes pagination metadata (page, page_size, total_tasks, has_next).
- [x] Unit tests cover filtering, pagination boundaries, unknown statuses.

## Implementation Notes
- Consider caching task summaries for speed; avoid stale reads when index newer than tasks.

## Links
- Spec: docs/mcp-kanban-sdd.md#15-appendix-a--tool-schemas-summary
- Related: task-004, task-002
