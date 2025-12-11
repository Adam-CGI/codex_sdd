---
id: task-001
version: 2
status: Done
assignee: human:adam
priority: medium
created: 2025-12-11T09:00:00Z
updated: 2025-12-11T14:33:15Z
schema_version: "3.0"
---
# Bootstrap TypeScript MCP server stack

## Description
Finalize Node.js 20 + TypeScript 5 + pnpm stack, scaffold src/tests folders, baseline tsconfig, pnpm workspace files, lint/format (ESLint flat + Prettier), and Vitest setup.

## Acceptance Criteria
- [x] pnpm workspace with package.json, tsconfig.json, vitest + ESLint + Prettier configs committed.
- [x] `src/index.ts` entrypoint stub created (ESM) with placeholder tool registry.
- [x] `pnpm test` succeeds with sample passing test.
- [x] README updated to note stack and bootstrap commands.

## Implementation Notes
- Prefer ESM; include `type: "module"` and `tsconfig` paths for src/.
- Add scripts: `dev` (ts-node/register or tsx), `build`, `test`, `lint`, `format`.

## Links
- Spec: docs/mcp-kanban-sdd.md
