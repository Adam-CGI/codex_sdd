# SDD MCP Server - System Overview

**Version**: 0.1.0  
**Last Updated**: December 12, 2025  
**Schema Version**: 3.0

This document provides a comprehensive overview of the MCP Kanban Spec-Driven Development Server system architecture, codebase structure, and operational model. Use this as a reference when working with the codebase.

---

## 📁 Repository Structure

```
codex_sdd/
│
├── 📄 Configuration & Project Files
│   ├── package.json              # Node.js project config, dependencies, scripts
│   ├── pnpm-lock.yaml           # Lockfile for reproducible builds
│   ├── pnpm-workspace.yaml      # Workspace configuration
│   ├── tsconfig.json            # TypeScript compiler config (dev)
│   ├── tsconfig.build.json      # TypeScript compiler config (production)
│   ├── eslint.config.js         # ESLint configuration (flat config)
│   ├── vitest.config.ts         # Vitest test runner configuration
│   ├── LICENSE                  # Project license (MIT)
│   └── README.md                # User-facing documentation
│
├── 📚 Documentation
│   ├── AGENTS.md                # AI agent playbook (MCP usage guide)
│   ├── SYSTEM_OVERVIEW.md       # This file - comprehensive system overview
│   └── docs/
│       ├── mcp-kanban-sdd.md   # Complete technical specification (v3.0)
│       ├── WORKFLOW.md          # Multi-agent workflow guide
│       └── TESTING_AND_USAGE.md # Testing and usage documentation
│
├── 🎯 Workflow & Task Management
│   ├── backlog/                 # Kanban task board (markdown files)
│   │   ├── config.yaml         # Workflow configuration, statuses, transitions
│   │   ├── index.json          # Generated cache of all tasks
│   │   └── task-*.md           # Individual task files (e.g., task-001 - Title.md)
│   │
│   ├── specs/                   # Feature specifications
│   │   ├── README-specs.md     # Guide to writing specs
│   │   ├── feature-*.md        # Feature specification files
│   │   └── ...
│   │
│   ├── reviews/                 # Code review documents
│   │   └── review-task-*.md   # Review artifacts per task
│   │
│   └── architecture/            # Architecture rules & decisions
│       ├── rules.yaml          # Architecture validation rules
│       └── decisions/
│           └── adr-*.md        # Architecture Decision Records
│
├── 💻 Source Code (src/)
│   ├── index.ts                 # Main entry point (stdio MCP server)
│   ├── server.ts                # MCP server implementation
│   ├── web-ui.ts               # Web interface server
│   │
│   ├── arch/                    # Architecture validation
│   │   ├── rules-store.ts      # Load & parse architecture rules
│   │   ├── validator.ts        # Validate specs against rules
│   │   └── tools.ts            # MCP tools: arch_validate_spec, arch_annotate_spec_and_tasks
│   │
│   ├── audit/                   # Audit logging & compliance
│   │   └── audit-log.ts        # Track all state mutations
│   │
│   ├── auth/                    # Authorization & access control
│   │   └── authz.ts            # Role-based auth, caller identification
│   │
│   ├── backlog/                 # Backlog/task storage layer
│   │   ├── task-store.ts       # CRUD operations on task markdown files
│   │   └── index-cache.ts      # Generate/update index.json
│   │
│   ├── cli/                     # Command-line interface
│   │   ├── index.ts            # CLI entry point (bin/sdd)
│   │   └── commands/           # CLI command implementations
│   │
│   ├── coding/                  # Coding agent tools
│   │   ├── coding-service.ts   # Start tasks, suggest next steps
│   │   └── tools.ts            # MCP tools: coding_start_task, coding_suggest_next_step
│   │
│   ├── config/                  # Configuration management
│   │   └── config-loader.ts    # Load & parse backlog/config.yaml
│   │
│   ├── git/                     # Git integration
│   │   ├── git-service.ts      # Wrapper around simple-git
│   │   └── tools.ts            # MCP tools: git_status, git_create_branch, git_stage_and_commit, etc.
│   │
│   ├── kanban/                  # Kanban board operations
│   │   ├── board-service.ts    # Get board state, pagination
│   │   └── tools.ts            # MCP tools: kanban_get_board
│   │
│   ├── observability/           # Logging, monitoring, rate limiting
│   │   ├── logger.ts           # Pino-based structured logging
│   │   └── rate-limiter.ts     # Per-caller rate limiting
│   │
│   ├── planning/                # Planning agent tools
│   │   ├── spec-service.ts     # Create/update specs
│   │   ├── breakdown-service.ts # Break specs into tasks
│   │   └── tools.ts            # MCP tools: planning_create_spec, planning_breakdown_spec, etc.
│   │
│   ├── review/                  # Code review tools
│   │   ├── review-service.ts   # Analyze diffs, write reviews
│   │   └── tools.ts            # MCP tools: review_analyze_diff, review_write_review_doc
│   │
│   ├── shared/                  # Shared utilities
│   │   ├── errors.ts           # Error envelope, error codes, result types
│   │   └── types.ts            # Common type definitions
│   │
│   ├── specs/                   # Spec storage layer
│   │   └── spec-store.ts       # CRUD operations on spec markdown files
│   │
│   ├── tasks/                   # Task operations
│   │   ├── task-meta.ts        # Parse/write task frontmatter
│   │   └── tools.ts            # MCP tools: tasks_get, tasks_update, tasks_move, tasks_search
│   │
│   ├── web/                     # Web UI components
│   │   └── ...                 # HTML/CSS/JS for browser interface
│   │
│   └── workflow/                # Multi-agent workflow orchestration
│       ├── agents.ts           # Agent definitions, work queues
│       ├── automation.ts       # Workflow automation tools
│       └── tools.ts            # MCP tools: agent_get_context, workflow_*, etc.
│
└── 🧪 Tests (tests/)
    ├── *.test.ts               # Vitest unit & integration tests
    └── tmp/                    # Temporary test fixtures
```

---

## 🏗️ System Architecture

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Runtime** | Node.js 20 LTS | JavaScript runtime environment |
| **Language** | TypeScript 5.x | Type-safe development |
| **Package Manager** | pnpm | Fast, disk-space efficient package management |
| **MCP SDK** | @modelcontextprotocol/sdk | Model Context Protocol integration |
| **Git** | simple-git | Git operations wrapper |
| **Logging** | pino + pino-pretty | Structured logging with pretty dev output |
| **Testing** | Vitest | Fast unit & integration testing |
| **Linting** | ESLint (flat config) | Code quality enforcement |
| **Formatting** | Prettier | Code formatting |
| **CLI** | Commander.js | Command-line interface framework |
| **YAML** | yaml | Configuration file parsing |
| **Markdown** | gray-matter | Frontmatter parsing |
| **Validation** | Zod | Schema validation |

### Core Principles

1. **Spec-First Development**: All features start with a specification document
2. **Kanban Gating**: Coding tools only work on tasks in "In Progress" status
3. **Multi-Agent Workflow**: Structured flow through Planning → Architecture → Coding → Review
4. **Git-Backed Storage**: All state persists in markdown files tracked by git
5. **Optimistic Locking**: Version-based concurrency control prevents conflicts
6. **MCP Native**: Designed for AI assistant integration via Model Context Protocol

---

## 🔄 Workflow States & Transitions

```
┌─────────────┐
│   Backlog   │  ← Planning Agent creates specs & tasks
└──────┬──────┘
       │
       ↓
┌──────────────────────────────┐
│ Ready for Architecture Review │  ← Specs ready for validation
└──────┬───────────────────────┘
       │
       ├─→ (approved) ──────────┐
       │                         ↓
       │                   ┌──────────────────┐
       │                   │ Ready for Coding │  ← Passed architecture review
       │                   └────────┬─────────┘
       │                            │
       │                            ↓
       │                   ┌────────────────┐
       │                   │  In Progress   │  ← Kanban gate enforced here
       │                   └────────┬───────┘
       │                            │
       │                            ↓
       │                   ┌────────────────────┐
       │                   │ Ready for Code Review│  ← Implementation complete
       │                   └────────┬───────────┘
       │                            │
       │                            ↓
       │                      ┌──────┐
       │                      │ Done │  ← Approved & merged
       │                      └──────┘
       │
       └─→ (rejected) ──────────┐
                                 ↓
                        ┌─────────────────────┐
                        │ Needs Planning Update│  ← Architecture issues found
                        └─────────────────────┘
```

### Allowed Transitions

Defined in `/backlog/config.yaml`:

```yaml
transitions:
  Backlog: ["Ready for Architecture Review"]
  "Ready for Architecture Review": ["Backlog", "Ready for Coding", "Needs Planning Update"]
  "Needs Planning Update": ["Ready for Architecture Review"]
  "Ready for Coding": ["In Progress", "Backlog"]
  "In Progress": ["Ready for Code Review", "Backlog"]
  "Ready for Code Review": ["In Progress", "Done", "Backlog"]
  Done: ["Backlog"]
```

---

## 🤖 Multi-Agent System

### Agent Roles

| Agent | Statuses | Primary Tools | Responsibilities |
|-------|----------|---------------|------------------|
| **Planning Agent** | `Backlog` → `Ready for Architecture Review` | `planning_create_spec`<br>`planning_breakdown_spec`<br>`planning_update_spec` | Create feature specs, break into tasks, manage backlog |
| **Architect Agent** | `Ready for Architecture Review` → `Ready for Coding` or `Needs Planning Update` | `arch_validate_spec`<br>`arch_annotate_spec_and_tasks` | Validate architecture compliance, enforce design rules |
| **Coding Agent** | `Ready for Coding` → `In Progress` → `Ready for Code Review` | `coding_start_task`<br>`coding_suggest_next_step`<br>`git_*` tools | Implement features, write tests, commit code |
| **Review Agent** | `Ready for Code Review` → `Done` or `In Progress` | `review_analyze_diff`<br>`review_write_review_doc` | Code review, quality assurance, approve/reject |
| **Git Manager** | Any status | `git_status`<br>`git_create_branch`<br>`git_stage_and_commit`<br>`git_push`<br>`git_open_pr` | Version control operations |

### Agent Coordination

Agents use these tools to coordinate:
- `agent_get_context` - Get context for a specific agent role
- `agent_query_work_queue` - Find tasks ready for a specific agent
- `workflow_*` tools - Automated multi-step workflows

---

## 🔧 MCP Tools Overview

The server provides **28 MCP tools** across 7 categories:

### 1. Kanban Board & Task Management (5 tools)
- `kanban_get_board` - Get board state with pagination
- `tasks_get` - Get detailed task information
- `tasks_search` - Search tasks by content
- `tasks_update` - Update task metadata (requires version)
- `tasks_move` - Move task to new status (validates transitions)

### 2. Planning Tools (4 tools)
- `planning_create_spec` - Create new feature specification
- `planning_breakdown_spec` - Break spec into implementation tasks
- `planning_update_spec` - Update existing specification
- `planning_rebuild_index` - Rebuild backlog index.json cache

### 3. Architecture Tools (2 tools)
- `arch_validate_spec` - Validate spec against architecture rules
- `arch_annotate_spec_and_tasks` - Add architectural notes to spec and tasks

### 4. Coding Tools (3 tools)
- `coding_start_task` - Start working on task (moves to In Progress)
- `coding_suggest_next_step` - Get AI-suggested next implementation step
- `coding_update_task_status` - Update task progress with notes

### 5. Review Tools (3 tools)
- `review_analyze_diff` - Analyze git diff for issues
- `review_write_review_doc` - Write review document
- `review_summarize_task_reviews` - Summarize all reviews for a task

### 6. Git Tools (5 tools)
- `git_status` - Get current git status
- `git_create_branch` - Create and checkout new branch
- `git_stage_and_commit` - Stage files and commit
- `git_push` - Push to remote repository
- `git_open_pr` - Open pull request

### 7. Workflow Automation (6 tools)
- `agent_get_context` - Get context for specific agent role
- `agent_query_work_queue` - Query tasks ready for agent
- `workflow_architecture_review` - Run full architecture review workflow
- `workflow_start_coding` - Start full coding workflow
- `workflow_submit_for_review` - Submit task for code review
- `workflow_code_review` - Run full code review workflow

---

## 📝 File Formats

### Task File Format

Location: `/backlog/task-### - Title.md`

```markdown
---
id: task-001
version: 5
status: In Progress
spec: specs/feature-123-login.md
assignee: agent:codex
priority: high
labels: [auth, backend]
created: 2025-12-11T10:00:00Z
updated: 2025-12-11T12:34:56Z
branch: task/task-001
pr_url: https://github.com/owner/repo/pull/123
depends_on: []
---

# task-001 - Implement login API

## Description

Add REST API endpoint for user login with email/password authentication.

## Acceptance Criteria

- [ ] POST /api/login endpoint accepts email and password
- [ ] Returns JWT token on successful authentication
- [ ] Returns 401 on invalid credentials
- [ ] Rate limiting prevents brute force attacks

## Implementation Plan

1. Create authentication middleware
2. Add login route handler
3. Implement JWT token generation
4. Add rate limiting
5. Write tests

## Implementation Notes

(Added during implementation)
- Used bcrypt for password hashing
- JWT expires in 24 hours
- Rate limit: 5 attempts per 15 minutes per IP
```

### Spec File Format

Location: `/specs/feature-###-slug.md`

```markdown
---
id: spec-001
version: 2
status: approved
created: 2025-12-11T10:00:00Z
updated: 2025-12-11T11:00:00Z
---

# User Authentication System

## Overview

Implement a secure user authentication system with JWT tokens.

## Requirements

### Functional
- Users can register with email/password
- Users can login and receive JWT token
- Tokens expire after 24 hours
- Password reset via email

### Non-Functional
- OWASP security compliance
- Rate limiting on auth endpoints
- Audit logging of auth events

## Architecture Notes

- Use bcrypt for password hashing
- Store tokens in HTTP-only cookies
- Implement refresh token rotation

## Tasks Breakdown

(Auto-generated by planning_breakdown_spec)
- task-001: Implement login API
- task-002: Implement registration API
- task-003: Add password reset flow
- task-004: Add rate limiting
- task-005: Write integration tests
```

### Architecture Rules Format

Location: `/architecture/rules.yaml`

```yaml
schema_version: "1.0"

rules:
  - id: layered-architecture
    name: Layered Architecture Pattern
    description: Enforce clean separation of concerns
    patterns:
      - Controllers must not call models directly
      - Business logic belongs in services
      - Database access only in repositories

  - id: security-requirements
    name: Security Best Practices
    patterns:
      - All user input must be validated
      - Passwords must be hashed with bcrypt
      - Secrets must not be committed to git
```

### Review Document Format

Location: `/reviews/review-task-###.md`

```markdown
---
task_id: task-001
reviewer: agent:review
status: approved
created: 2025-12-11T15:00:00Z
---

# Code Review: task-001 - Implement login API

## Summary

Implementation looks good. Clean code, well-tested, follows architecture rules.

## Status: ✅ Approved

## Findings

### Blocking Issues
None

### Suggestions
1. Consider adding rate limiting per user in addition to per IP
2. Add more detailed error messages for debugging

### Positive Observations
- Excellent test coverage (95%)
- Proper error handling
- Follows OWASP guidelines
- Good documentation

## Next Steps

- Merge to main
- Deploy to staging
- Update API documentation
```

---

## 🔐 Security & Authorization

### Role-Based Access Control

Defined in `/backlog/config.yaml`:

```yaml
roles:
  maintainers:
    - human:adam
```

### Caller Identification

Callers are identified as:
- `human:<username>` - Human users
- `agent:<name>` - AI agents
- `system` - System operations

### Authorization Rules

1. **Maintainers** can:
   - Force status transitions with `force: true`
   - Override workflow gates
   - Modify configuration

2. **Agents** can:
   - Perform role-specific operations
   - Move tasks through allowed transitions
   - Create/update specs and tasks

3. **System** can:
   - Rebuild indexes
   - Automated cleanup operations

---

## 🔄 Concurrency Control

### Optimistic Locking

All task mutations require a `version` parameter:

```typescript
// ✅ CORRECT
tasks_move({ task_id: "task-007", version: 3, to_status: "In Progress" })

// ❌ WRONG - Missing version
tasks_move({ task_id: "task-007", to_status: "In Progress" })
```

### Conflict Resolution

1. Get current task state with `tasks_get`
2. Extract `version` from response
3. Make changes
4. Call mutation tool with `version`
5. If conflict (version mismatch), re-fetch and retry

---

## 📊 Observability

### Logging

- Structured JSON logs via `pino`
- Pretty formatting in development
- Log levels: `trace`, `debug`, `info`, `warn`, `error`, `fatal`
- All MCP tool calls are logged with parameters and results

### Rate Limiting

- Per-caller rate limiting
- Configurable limits per tool
- Prevents abuse and runaway automation

### Audit Trail

- All state mutations logged to audit log
- Tracks who did what and when
- Includes before/after states

---

## 🚀 Development Workflows

### Local Development

```bash
# Install dependencies
pnpm install

# Run in development mode (watch)
pnpm dev

# Build for production
pnpm build

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Lint code
pnpm lint

# Format code
pnpm format
```

### Testing

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test task-store.test.ts

# Run with coverage
pnpm test --coverage
```

### MCP Server Usage

```bash
# Run MCP server (stdio mode)
STDIO_ONLY=true PRETTY_LOGS=false node dist/server.js

# Run CLI
pnpm cli

# Launch web UI
pnpm web
```

---

## 🔌 Integration Points

### MCP Client Configuration

For Claude Code, VS Code Copilot, or other MCP clients:

```toml
[mcpServers.sdd-kanban]
command = "node"
args = ["/path/to/codex_sdd/dist/server.js"]
env = { STDIO_ONLY = "true", PRETTY_LOGS = "false" }
```

### Git Integration

The system integrates with Git for:
- Branch creation per task
- Commit management
- Pull request creation
- Change detection and analysis

---

## 📚 Key Concepts

### Kanban Gate

The **Kanban gate** enforces that coding tools (`coding_start_task`, `coding_suggest_next_step`, `coding_update_task_status`) only work on tasks in statuses defined in `in_progress_statuses` (typically `["In Progress"]`).

This prevents:
- Working on tasks not ready for coding
- Skipping architecture review
- Bypassing workflow gates

### Spec-First Development

All features should start with a specification:
1. Create spec with `planning_create_spec`
2. Break into tasks with `planning_breakdown_spec`
3. Validate architecture with `arch_validate_spec`
4. Implement via coding workflow
5. Review with `review_analyze_diff`

### Optimistic Locking

Version-based concurrency control prevents lost updates:
- Each task has a `version` number
- Increments on every mutation
- Mutations must provide current version
- Conflicts are detected and rejected

---

## 🎯 Best Practices

### For AI Agents

1. **Always check task version** before mutating
2. **Follow workflow states** - don't skip steps
3. **Use semantic commits** - follow conventional commits
4. **Query work queue** to find tasks ready for your role
5. **Validate before coding** - ensure architecture review passed
6. **Move tasks explicitly** - transitions don't happen automatically
7. **Check transition rules** - respect configured workflow
8. **Use workflow tools** for multi-step operations
9. **Keep descriptions outcome-focused** - what, not how
10. **Add implementation notes** after coding, not before

### For Developers

1. **Run tests before committing** - `pnpm test`
2. **Lint and format** - `pnpm lint && pnpm format`
3. **Build before deploying** - `pnpm build`
4. **Update docs** when changing behavior
5. **Follow TypeScript strict mode** - no `any` types
6. **Write tests for new features** - aim for >80% coverage
7. **Use structured logging** - never `console.log` in production
8. **Handle errors properly** - use error envelopes
9. **Validate inputs** - use Zod schemas
10. **Document MCP tools** - clear schemas and descriptions

---

## 🆘 Troubleshooting

### Server Won't Start

1. Check `STDIO_ONLY=true` is set (prevents web UI interference)
2. Run `pnpm build` to rebuild after code changes
3. Check stderr for error messages (stdout must stay clean)
4. Verify Node.js version >= 20.0.0

### Tool Call Fails

1. Use underscored names (`tasks_move` not `tasks_move`)
2. Verify all required parameters are provided
3. For mutations, ensure `version` is included
4. Check tool exists in `src/server.ts` registry

### Version Conflicts

1. Fetch latest task state with `tasks_get`
2. Use `version` from response
3. If conflict, re-fetch and retry
4. Never hardcode version numbers

### Transition Not Allowed

1. Check `/backlog/config.yaml` for allowed transitions
2. Ensure following multi-agent workflow sequence
3. Use `force: true` only with maintainer privileges
4. Consider if task is in wrong state

---

## 📖 Related Documentation

- **[AGENTS.md](AGENTS.md)** - AI agent playbook and MCP usage guide
- **[docs/mcp-kanban-sdd.md](docs/mcp-kanban-sdd.md)** - Complete technical specification (v3.0)
- **[docs/WORKFLOW.md](docs/WORKFLOW.md)** - Detailed multi-agent workflow guide
- **[docs/TESTING_AND_USAGE.md](docs/TESTING_AND_USAGE.md)** - Testing and usage documentation
- **[README.md](README.md)** - User-facing overview and quick start

---

## 🔄 Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | 2025-12-12 | Initial system overview document |

---

**Last Updated**: December 12, 2025  
**Maintainer**: Adam Gillespie  
**License**: MIT
