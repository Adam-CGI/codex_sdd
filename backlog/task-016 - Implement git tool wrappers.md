---
id: task-016
version: 2
status: Done
assignee: agent:codex
priority: medium
created: 2025-12-11T10:12:00Z
updated: 2025-12-11T15:38:00Z
schema_version: "3.0"
---
# Implement git tool wrappers

## Description
Implement git MCP tools via `git/git-service.ts`: `git.status`, `git.create_branch`, `git.stage_and_commit`, `git.push`, `git.open_pr` (optional).

## Acceptance Criteria
- [x] `git.status` returns branch, staged/unstaged/untracked lists, clean flag.
- [x] `git.create_branch` creates from base_ref default HEAD; handles BRANCH_NOT_FOUND.
- [x] `git.stage_and_commit` stages current changes, commits with summary, returns commit hash; errors on MERGE_CONFLICT or missing task id mapping.
- [x] `git.push` supports optional remote/branch; errors on missing branch.
- [x] Unit tests mock simple-git; cover dirty tree, branch creation, push default remote.

## Implementation Notes
- Use `simple-git`; keep operations minimal and synchronous enough for MCP.
- Consider config for default remote `origin`.

## Links
- Spec: docs/mcp-kanban-sdd.md#156-git
- Related: task-014, task-015
