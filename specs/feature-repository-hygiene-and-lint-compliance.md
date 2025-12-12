---
id: feature-repository-hygiene-and-lint-compliance
status: Planned
schema_version: '3.0'
---
# Repository hygiene and lint compliance

## Context
Initial request for Repository hygiene and lint compliance

pnpm lint currently fails with 18 errors and 3 warnings across src and tests (unused variables, no-useless-escape in string literals, and any types). Tests already pass. We want to: 1) make eslint pass cleanly, 2) add automation so lint runs in CI, 3) audit stray root artifacts like code.html and screen.png and either document or remove them.

## Goals
- pnpm lint currently fails with 18 errors and 3 warnings across src and tests (unused variables, no-useless-escape in string literals, and any types).
- Tests already pass.
- We want to: 1) make eslint pass cleanly, 2) add automation so lint runs in CI, 3) audit stray root artifacts like code.html and screen.png and either document or remove them.

## Non-Goals
- TBD

## Functional Requirements
pnpm lint currently fails with 18 errors and 3 warnings across src and tests (unused variables, no-useless-escape in string literals, and any types). Tests already pass. We want to: 1) make eslint pass cleanly, 2) add automation so lint runs in CI, 3) audit stray root artifacts like code.html and screen.png and either document or remove them.

## Non-Functional Requirements
TBD

## Architecture Notes
TBD

## Open Questions
TBD

## Changelog
- 2025-12-12T16:31:47.533Z: Spec created
