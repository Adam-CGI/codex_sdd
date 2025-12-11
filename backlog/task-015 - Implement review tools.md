---
id: task-015
version: 1
status: Backlog
assignee: agent:codex
priority: medium
created: 2025-12-11T10:10:00Z
updated: 2025-12-11T10:10:00Z
schema_version: "3.0"
---
# Implement review tools

## Description
Implement `review.analyze_diff`, `review.write_review_doc`, and `review.summarize_task_reviews`, integrating architecture rule checks and storing outputs under `/reviews`.

## Acceptance Criteria
- [ ] `review.analyze_diff` accepts base_ref/head_ref, produces summary, review_status, blocking/non-blocking lists; flags ARCH_VIOLATION when applicable.
- [ ] `review.write_review_doc` writes markdown review file tied to task_id with content from analyze_diff.
- [ ] `review.summarize_task_reviews` aggregates review status for a task from review files.
- [ ] Unit tests mock git diffs and cover Changes Requested/Approved paths.

## Implementation Notes
- Use git-service to get diff; reuse architecture patterns for violations if possible.
- Keep review file naming `reviews/review-<task-id>.md`.

## Links
- Spec: docs/mcp-kanban-sdd.md#155-review
- Related: task-016 (git), task-013 (architecture)
