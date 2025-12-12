---
id: feature-expose-observability-metrics-via-mcp-tool-and-cli
status: Planned
schema_version: '3.0'
---
# Expose observability metrics via MCP tool and CLI

## Context
Initial request for Expose observability metrics via MCP tool and CLI

We need operators to inspect in-memory tool metrics (call counts, success/error, avg/p95 duration) and rate limiter bucket status from outside the server. Provide an MCP tool to fetch metrics safely (stderr logging only), and a CLI command `sdd metrics` that prints a human-readable table. Include tests and docs. Avoid interfering with JSON-RPC stdout.

## Goals
- We need operators to inspect in-memory tool metrics (call counts, success/error, avg/p95 duration) and rate limiter bucket status from outside the server.
- Provide an MCP tool to fetch metrics safely (stderr logging only), and a CLI command `sdd metrics` that prints a human-readable table.
- Include tests and docs.
- Avoid interfering with JSON-RPC stdout.

## Non-Goals
- TBD

## Functional Requirements
We need operators to inspect in-memory tool metrics (call counts, success/error, avg/p95 duration) and rate limiter bucket status from outside the server. Provide an MCP tool to fetch metrics safely (stderr logging only), and a CLI command `sdd metrics` that prints a human-readable table. Include tests and docs. Avoid interfering with JSON-RPC stdout.

## Non-Functional Requirements
TBD

## Architecture Notes
TBD

## Open Questions
TBD

## Changelog
- 2025-12-12T15:53:31.153Z: Spec created
