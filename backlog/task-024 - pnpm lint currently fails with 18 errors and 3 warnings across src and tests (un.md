---
id: task-024
version: 9
status: Done
spec: feature-repository-hygiene-and-lint-compliance
created: '2025-12-12T16:31:51.875Z'
updated: '2025-12-12T16:45:29.484Z'
schema_version: '3.0'
priority: medium
title: >-
  pnpm lint currently fails with 18 errors and 3 warnings across src and tests
  (unused variables, no-useless-escape in string literals, and any types).
branch: feature/task-024-lint-cleanup
---
# pnpm lint currently fails with 18 errors and 3 warnings across src and tests (unused variables, no-useless-escape in string literals, and any types).

## Description
Resolve current ESLint errors/warnings so `pnpm lint` exits 0. Issues observed on 2025-12-12:
- `src/arch/rules-store.ts`: no-useless-escape
- `src/cli/commands/board-view.ts`: no-explicit-any (warn)
- `src/cli/commands/init.ts`: no-unused-vars (error)
- `src/coding/coding-service.ts`: no-unused-vars (error)
- `src/git/git-service.ts`: two no-unused-vars (error)
- `src/tasks/search.ts`: no-unused-vars (error)
- `src/tasks/update.ts`: no-explicit-any (warn)
- `src/workflow/automation.ts`: no-explicit-any (warn)
- `tests/arch-rules-store.test.ts`: two no-unused-vars (error)
- `tests/planning-breakdown-spec.test.ts`: four no-useless-escape + two unused vars
- `tests/rebuild-index.test.ts`: two unused vars
- `tests/workflow-e2e.test.ts`: unused var
Do not suppress rules; remove escapes/unuseds or add real types.

## Acceptance Criteria
- [ ] `pnpm lint` succeeds with 0 errors/warnings
- [ ] Unused variables removed or intentionally prefixed `_` where appropriate (no rule disables)
- [ ] No-useless-escape issues corrected via proper string literals
- [ ] Replace `any` warnings with concrete types or safer narrowing
- [ ] CI lint step (task-025) can rely on clean lint status

## Notes
2025-12-12 Review: Approved. Lint clean; tests all pass (169/169). No functional behavior changes; only hygiene fixes and deterministic rebuild-index test.
