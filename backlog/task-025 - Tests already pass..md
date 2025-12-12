---
id: task-025
version: 3
status: Ready for Coding
spec: feature-repository-hygiene-and-lint-compliance
created: '2025-12-12T16:31:51.875Z'
updated: '2025-12-12T16:34:52.621Z'
schema_version: '3.0'
priority: medium
title: Tests already pass.
---
# Tests already pass.

## Description
Introduce CI (e.g., GitHub Actions) that runs `pnpm lint` and `pnpm test` on pushes and pull requests. Ensure it installs deps with pnpm, uses Node 20, and caches pnpm store for speed. Make lint step rely on clean code from task-024.

## Acceptance Criteria
- [ ] Workflow file committed under `.github/workflows/` named clearly (e.g., `ci.yml`)
- [ ] Steps: checkout, setup Node 20, pnpm install (with cache), run `pnpm lint`, run `pnpm test`
- [ ] Workflow passes locally via `act` or documented with sample run output/screenshot
- [ ] Document CI addition briefly in README or `SYSTEM_OVERVIEW.md` testing section

## Notes
