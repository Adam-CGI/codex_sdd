# ADR-001: Initial Architecture Overview

## Status
Accepted

## Context
We are implementing an MCP server to manage a spec-driven, Kanban-gated development workflow.

## Decision
- Use a modular internal structure with config, tasks, specs, architecture, git, tools, security, and audit modules.
- Represent tasks, specs, and rules as plain files under /backlog, /specs, and /architecture.

## Consequences
- The system remains git-friendly and easy to reason about.
- We can iterate on internal implementations without changing the external MCP tool surface.
