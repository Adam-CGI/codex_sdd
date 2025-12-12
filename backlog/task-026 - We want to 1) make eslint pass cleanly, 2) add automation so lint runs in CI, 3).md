---
id: task-026
version: 3
status: Ready for Coding
spec: feature-repository-hygiene-and-lint-compliance
created: '2025-12-12T16:31:51.875Z'
updated: '2025-12-12T16:34:57.101Z'
schema_version: '3.0'
priority: low
title: >-
  We want to: 1) make eslint pass cleanly, 2) add automation so lint runs in CI,
  3) audit stray root artifacts like code.html and screen.png and either
  document or remove them.
---
# We want to: 1) make eslint pass cleanly, 2) add automation so lint runs in CI, 3) audit stray root artifacts like code.html and screen.png and either document or remove them.

## Description
Audit root-level artifacts `code.html` and `screen.png` to decide whether they are needed. If unnecessary, remove them from the repo (and ensure gitignore covers) or relocate into docs with context. If needed, document purpose/location in README or SYSTEM_OVERVIEW to avoid clutter.

## Acceptance Criteria
- [ ] Decision recorded for each file (`code.html`, `screen.png`) with rationale in Notes/commit message
- [ ] Unneeded files removed from repo and ignored; or kept but moved to appropriate folder (docs/assets) with a short note in relevant doc
- [ ] `git status` clean after cleanup (no stray artifacts reintroduced)
- [ ] If files kept, referenced in docs so future contributors know their purpose

## Notes
