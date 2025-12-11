# MCP Kanban Spec-Driven Development Server

An MCP server that drives spec-first, Kanban-gated development against a Backlog-style markdown task system.

## Stack

- **Runtime**: Node.js 20 LTS (ESM)
- **Language**: TypeScript 5.x
- **Package Manager**: pnpm
- **Tests**: Vitest
- **Lint/Format**: ESLint (flat config) + Prettier
- **Logging**: pino
- **Workspace**: pnpm workspace root (`pnpm-workspace.yaml`)

## Quick Start

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Build for production
pnpm build

# Run tests
pnpm test

# Lint code
pnpm lint

# Format code
pnpm format
```

This repository is the root of the pnpm workspace; all commands above run from the project root.

## Project Structure

```
src/
  index.ts              # Entrypoint, MCP tool registry
  config/               # Config loader
  backlog/              # Task store
  kanban/               # Board service
  auth/                 # Authorization
  audit/                # Audit logging
  shared/               # Shared utilities (errors, types)
tests/                  # Vitest tests
docs/
  mcp-kanban-sdd.md     # System Design Document
backlog/
  config.yaml           # Status model and transitions
  task-*.md             # Backlog tasks
specs/                  # Feature specifications
architecture/
  rules.yaml            # Architecture rules
  decisions/            # ADRs
reviews/                # Code review artifacts
```

## Configuration

See `backlog/config.yaml` for status model, transitions, and roles.

See `docs/mcp-kanban-sdd.md` for the full System Design Document.
