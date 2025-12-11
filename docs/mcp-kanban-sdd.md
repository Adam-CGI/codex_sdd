# MCP Kanban Spec-Driven Development Server
Spec version: **v3.0**  
Doc version: **0.1 (2025-12-11)**

Single MCP server that drives spec-first, Kanban-gated development against a Backlog-style markdown task system. This SDD locks in the tech stack and the operational rules for this repo.

## Table of Contents
- Vision & Scope
- Runtime & Implementation Stack
- Repository Conventions & Schema Versioning
- Config & Status Model
- Data Models & File Formats
  - Tasks
  - Specs
  - Architecture Rules
  - Backlog Index (index.json)
- High-Level System Workflow
- Tool Surface Overview (MCP Tools)
- User Workflows
- Git Integration Boundaries
- Error Handling & Error Codes
- Concurrency & Conflict Resolution
- Security & Authorization
- Performance & Scalability
- Observability, Testing & Migration
- Appendix A – Tool Schemas (summary)

## 1. Vision & Scope
We want one MCP server that:
- Works with Backlog.md-style task system (markdown tasks under `/backlog`, Kanban statuses, git-backed).
- Starts from a feature request and builds everything from there (create/update specs, break into tasks, validate against architecture rules, drive incremental coding, support code review).
- Enforces a Kanban gate: coding tools only operate on tasks whose status ∈ `in_progress_statuses` (typically “In Progress”), gate is explicit/configurable/auditable.
- Coexists cleanly with Backlog CLI/browser: reads/writes the same files, no incompatible formats.

Out of scope for now: retrospectives and long-term knowledge curation (future layers).

## 2. Runtime & Implementation Stack
- Language: **TypeScript 5.x** on **Node.js 20 LTS** (ESM).
- Package manager: **pnpm** (npm acceptable).
- Build: `tsc` to `dist/`; no bundler required.
- Tests: **Vitest** (unit + light integration).
- Lint/format: ESLint (flat config) + Prettier.
- MCP runtime: **OpenAI MCP TypeScript SDK** over stdio. If unavailable, fall back to JSON-RPC over stdio with the same schemas.
- Logging: `pino` (pretty in dev).
- Git wrapper: `simple-git`.
- File locking: best-effort `fs-ext` advisory locks on writes.
- State: repo files only; no external DB or services.
- Process entrypoint: `src/index.ts` registers all MCP tools and starts the stdio server.

Planned source layout:
```
src/
  index.ts
  config/config-loader.ts
  backlog/task-store.ts
  specs/spec-store.ts
  arch/rules-store.ts
  planning/index-cache.ts
  kanban/board-service.ts
  coding/coding-service.ts
  review/review-service.ts
  git/git-service.ts
  auth/authz.ts
  audit/audit-log.ts
tests/ (vitest)
```

## 3. Repository Conventions & Schema Versioning
### 3.1 Folder Layout
```
/specs/                 # Feature-level specifications
  feature-123-login.md
/backlog/               # Task markdown + config
  task-001 - Implement login API.md
  config.yaml
  index.json            # optional generated cache
/architecture/          # Architecture rules & ADRs
  rules.yaml
  decisions/adr-001-layered-architecture.md
/reviews/               # Code review artefacts
  review-task-001.md
```
All paths are relative to a repo root configured per MCP server instance (monorepos allowed; each server instance binds to a single root).

### 3.2 Schema Versioning
- `/backlog/config.yaml` MUST declare `schema_version: "3.0"`.
- Specs SHOULD declare `schema_version: "3.0"` (frontmatter).
- If `schema_version` is missing → assume legacy (v2.x) and read in backward-compatible mode.
- Server writes always use the latest schema version it supports; breaking changes bump major version.

## 4. Config & Status Model
### 4.1 `/backlog/config.yaml`
Example:
```
schema_version: "3.0"

statuses:
  - Backlog
  - Ready
  - In Progress
  - In Review
  - Done

in_progress_statuses:
  - In Progress

columns:
  Backlog: Backlog
  Ready: Ready
  InProgress: In Progress
  InReview: In Review
  Done: Done

transitions:
  Backlog: ["Ready"]
  Ready: ["Backlog", "In Progress"]
  "In Progress": ["Backlog", "In Review"]
  "In Review": ["In Progress", "Done"]
  Done: ["Backlog"]

roles:
  maintainers: ["human:adam"]
```

If `config.yaml` is missing: use defaults `statuses=[Backlog, Ready, In Progress, In Review, Done]`, `in_progress_statuses=[In Progress]`, `transitions={}` (all transitions allowed).

### 4.2 Status Transition Rules
- If `transitions` defined, `tasks.move` MUST validate `current_status → to_status` is allowed.
- If `transitions` missing, all transitions allowed (backward compatibility).
- `force: true` MAY bypass invalid transitions for maintainers only.

## 5. Data Models & File Formats
### 5.1 Tasks
- Markdown files under `/backlog`, filename format: `task-### - Title.md`.
- Metadata parsing precedence: YAML frontmatter (authoritative) > inline `key: value` lines (only used if no frontmatter). Unknown keys preserved.

#### 5.1.1 Example Task
```
---
id: task-001
version: 5
status: Backlog
spec: specs/feature-123-login.md
assignee: agent:codex
priority: high
created: 2025-12-11T10:00:00Z
updated: 2025-12-11T12:34:56Z
branch: task/task-001
pr_url:
depends_on:
  - task-000
schema_version: "3.0"
---

# Implement login API

## Description
Implement POST /api/login endpoint for password-based login.

## Acceptance Criteria
- [ ] Valid credentials return 200 + JWT token
- [ ] Invalid credentials return 401 with generic error
- [ ] Rate limiting applied after N failed attempts

## Implementation Notes
- Use existing user repository
- Do not log raw passwords

## Review Notes
(added by review tools as needed)

## Links
- Requirement: docs/requirements/auth.md
- Spec: specs/feature-123-login.md
- PR:
```

#### 5.1.2 Internal TaskMeta
```
interface TaskMeta {
  id: string;
  title: string;
  status: string;
  version: number;
  spec?: string;
  assignee?: string;
  priority?: string;
  created?: string;
  updated?: string;
  branch?: string;
  pr_url?: string;
  depends_on?: string[];
  schema_version?: string;
  // unknown keys preserved
}
```

#### 5.1.3 Task Dependencies
- Optional `depends_on: [task-000, task-005]`.
- `tasks.move` to any status in `in_progress_statuses` SHOULD ensure all dependencies are `Done`; otherwise return `DEPENDENCIES_NOT_MET`. `force: true` allowed for maintainers.

### 5.2 Specs
- Files under `/specs`.
- Recommended frontmatter with `id`, `status` (Planned | In Progress | Released | Deprecated), `schema_version`.

#### 5.2.1 Example Spec
```
---
id: feature-123-login
status: Planned
schema_version: "3.0"
---

# Feature 123 – User Login

## Context
Users need to authenticate to access protected resources.

## Goals
- Provide secure username/password login.
- Use JWT tokens for session management.

## Non-Goals
- Social login
- MFA

## Functional Requirements
1. Users can log in with email + password.
2. System returns a JWT token for valid credentials.

## Non-Functional Requirements
- Rate limiting on failed login attempts.
- Logging and monitoring.

## Architecture Notes
- Use domain service `AuthService`.
- UI → API → Domain → Infra (no UI → Infra shortcuts).

## Open Questions
- Token expiry duration?
- Password complexity requirements?

## Changelog
- 2025-12-11T10:00:00Z: Initial spec created.
```

### 5.3 Architecture Rules
- `architecture/rules.yaml` defines layers and patterns.
```
layers:
  - name: ui
    path: src/ui
  - name: domain
    path: src/domain
  - name: infra
    path: src/infra

rules:
  - "ui may depend on domain"
  - "domain may not depend on ui"
  - "infra may depend on domain"
  - "infra may not depend on ui"

patterns:
  prohibited:
    - pattern: "raw SQL in controllers"
      regex: "(SELECT|INSERT|UPDATE|DELETE)\\s+.*\\s+FROM"
      paths: ["src/ui/**", "src/api/**"]
    - pattern: "HTTP calls in React components"
      regex: "fetch\\(|axios\\."
      paths: ["src/ui/**/*.tsx"]
```
Rule grammar: `<layer> <constraint> <layer>` where constraint ∈ {may depend on | may not depend on | must depend on}. File → layer via path prefix. Imports detected via static `import/require` resolution. Violations returned as `{file, rule, description, line}`.

### 5.4 `/backlog/index.json`
- Optional generated cache mapping specs ↔ tasks. Source of truth remains files.
```
{
  "version": 1,
  "schema_version": "3.0",
  "generated_at": "2025-12-11T10:00:00Z",
  "features": [
    {
      "spec_id": "feature-123-login",
      "spec_path": "specs/feature-123-login.md",
      "tasks": ["task-001", "task-002"]
    }
  ],
  "tasks": {
    "task-001": {
      "title": "Implement login API",
      "status": "In Progress",
      "spec": "specs/feature-123-login.md"
    }
  }
}
```
Regeneration triggers: `planning.breakdown_spec`, `tasks.update` when `spec` changes, `planning.rebuild_index`. If any task/spec newer than `generated_at`, treat index as stale.

## 6. High-Level System Workflow (System View)
Feature request → `planning.create_spec` → `/specs/feature-*.md`  
Spec breakdown → `planning.breakdown_spec` → `/backlog/task-*.md`, update `index.json`  
Kanban refinement → `kanban.get_board`, `tasks.get/update/move`  
Gate enforcement → `coding.*` only when task status ∈ `in_progress_statuses`  
Incremental coding → `coding.start_task`, `coding.suggest_next_step`, `git.*`  
Review → `review.analyze_diff`, `review.write_review_doc` → `/reviews`  
Completion → Maintainer moves `In Review → Done`, optionally `planning.update_spec` status.

## 7. Tool Surface Overview (MCP Tools)
Full schemas in Appendix A; handlers live in `src/*-service.ts`.
- Kanban/Tasks: `kanban.get_board`, `tasks.get`, `tasks.update`, `tasks.move`, `tasks.search`
- Planning: `planning.create_spec`, `planning.breakdown_spec`, `planning.update_spec`, `planning.rebuild_index`
- Architecture: `arch.validate_spec`, `arch.annotate_spec_and_tasks`
- Coding: `coding.start_task`, `coding.suggest_next_step`, `coding.update_task_status`
- Review: `review.analyze_diff`, `review.write_review_doc`, `review.summarize_task_reviews`
- Git: `git.status`, `git.create_branch`, `git.stage_and_commit`, `git.push`, `git.open_pr`

## 8. User Workflows (Human + Agent)
### 8.1 Workflow A – New Feature to Done
Requester describes feature → agent `planning.create_spec` → agent `planning.breakdown_spec` → maintainer refines tasks → maintainer moves to Ready → assignee moves to In Progress → agent coding loop (`coding.*`, `git.*`) → agent sets In Review → maintainer `review.*` → maintainer merges PR & `tasks.move` to Done → optional `planning.update_spec` status.

### 8.2 Workflow B – Human Developer Only
Same planning/Kanban; human performs coding and git manually or via git tools; still leverages `review.*`.

### 8.3 Workflow C – Changes Requested
`review.analyze_diff` returns `Changes Requested` → maintainer moves `In Review → In Progress` → fixes → back to `In Review` → Done.

### 8.4 Workflow D – Planning/Kanban Only
Team uses planning/kanban/tasks/arch/review tools; coding is manual; gate remains policy marker.

## 9. Git Integration Boundaries
In scope: `git.status`, `git.create_branch`, `git.stage_and_commit`, `git.push`, `git.open_pr`.  
Out of scope: rebases, cherry-picks, submodules, complex merges. Git kept tightly coupled to tasks; alternative “Git MCP server” is possible later.

## 10. Error Handling & Error Codes
### 10.1 Error Envelope
```
{ "error": { "code": "ERROR_CODE", "message": "Human-readable description", "details": { } } }
```
### 10.2 Error Code Catalog
- Configuration: `CONFIG_NOT_FOUND`, `CONFIG_INVALID`, `STATUS_NOT_DEFINED`, `IN_PROGRESS_STATUS_INVALID`
- Task-related: `TASK_NOT_FOUND`, `TASK_ID_MISMATCH`, `TASK_INVALID_STATUS`, `TASK_PARSE_ERROR`, `TASK_LOCKED`, `DEPENDENCIES_NOT_MET`
- Gate & transitions: `GATE_VIOLATION`, `INVALID_TRANSITION`, `CONFLICT_DETECTED`
- Git: `GIT_DIRTY`, `BRANCH_NOT_FOUND`, `MERGE_CONFLICT`
- Spec/architecture: `SPEC_NOT_FOUND`, `RULE_PARSE_ERROR`, `ARCH_VIOLATION`
- General: `RATE_LIMIT_EXCEEDED`, `UNAUTHORIZED`

### 10.3 Recovery Strategies
- `TASK_ID_MISMATCH`: prefer filename ID; auto-fix metadata; log warning.
- `GATE_VIOLATION`: include current status; suggest maintainer move to In Progress.
- `GIT_DIRTY`: include unstaged/untracked lists; caller resolves or uses git tools.
- `CONFLICT_DETECTED`: caller re-reads task/spec and retries with new version.

## 11. Concurrency & Conflict Resolution
- Optimistic locking: tasks/specs carry `version`; mutating calls require caller’s last-seen version, else `CONFLICT_DETECTED`.
- Single-writer via version check plus best-effort file lock; multiple readers allowed; may emit `TASK_LOCKED` if lock unavailable quickly.
- Config reload: cache `config.yaml` and watch file changes; briefly block during reload.
- Git conflicts: detect before git/coding tools; return `MERGE_CONFLICT`; suggest manual resolution or move task to “Blocked”.
- Missing spec: `coding.start_task` fails with `SPEC_NOT_FOUND`; `tasks.get` returns warning in `details`.

## 12. Security & Authorization
- Caller identity provided by MCP host:
```
interface Caller { type: "human" | "agent"; id: string; roles?: string[]; }
```
- Authorization rules:
  - `tasks.move`: assignee or maintainer, obey transitions (unless maintainer+force).
  - `coding.*`: caller is assignee or maintainer AND task status ∈ `in_progress_statuses`.
  - `planning.update_spec`: maintainers only.
  - Default deny for mutating ops if unauthorized.
- Audit trail: append JSONL events to `/backlog/.audit.jsonl` with timestamp, caller, operation, context.
- Secrets: rely on OS/git credential helpers; never store secrets in repo files.
- Rate limiting: optional per-caller quotas (e.g., 100 ops/min/agent) → `RATE_LIMIT_EXCEEDED`.

## 13. Performance & Scalability
- Practical limits: ~10k tasks/board, task file ≤1 MB, spec ≤5 MB, diff for review ≤10 MB (truncate beyond).
- Pagination: `kanban.get_board` supports `page`/`page_size`; response includes `{page,page_size,total_tasks,has_next}`.
- Caching: config and rules cached; task/spec read per request to avoid stale data; index.json is an optimization only.

## 14. Observability, Testing & Migration
- Observability: log counts/error rates per tool/error code; latency per tool; optional pino transport to stdout.
- Testing: unit tests for parsing (tasks/specs), architecture rule evaluation; integration tests for workflows A–D using temp repo fixture; mock git for unit level.
- Migration: existing `/backlog` may lack `version`, `branch`, `pr_url`, `spec`, `schema_version`; treat missing `version` as 1 and `schema_version` as legacy; optional migration tool to upgrade to v3.0.

## 15. Appendix A – Tool Schemas (Summary)
Types shown TypeScript-style; flesh out JSON Schema as follow-up.

### 15.1 Kanban & Tasks
`kanban.get_board`
```
params: { status_filter?: string[]; assignee?: string; spec_id?: string; page?: number; page_size?: number; }
returns: { columns: { id: string; name: string; tasks: TaskMeta[]; }[]; pagination?: { page; page_size; total_tasks; has_next; }; }
errors: [CONFIG_INVALID, TASK_PARSE_ERROR]
```

`tasks.get`
```
params: { task_id: string }
returns: { meta: TaskMeta; sections: Record<string,string>; raw_path: string; }
errors: [TASK_NOT_FOUND, TASK_PARSE_ERROR]
```

`tasks.update`
```
params: { task_id: string; version: number; meta?: Partial<TaskMeta>; sections?: Record<string,string>; }
returns: { success: true; meta: TaskMeta }
errors: [TASK_NOT_FOUND, TASK_PARSE_ERROR, CONFLICT_DETECTED, TASK_LOCKED]
```

`tasks.move`
```
params: { task_id: string; version: number; to_status: string; force?: boolean; }
returns: { success: true; old_status: string; new_status: string; meta: TaskMeta; }
errors: [TASK_NOT_FOUND, TASK_INVALID_STATUS, INVALID_TRANSITION, CONFLICT_DETECTED, TASK_LOCKED, DEPENDENCIES_NOT_MET]
```

`tasks.search`
```
params: { query?: string; status?: string[]; assignee?: string; spec?: string; }
returns: { results: { id; title; status; assignee?; spec?; }[]; }
```

### 15.2 Planning
`planning.create_spec`
```
params: { feature_name: string; requirements_text?: string; requirements_path?: string; }
returns: { spec_id: string; spec_path: string; summary: { title: string; goals: string[]; non_goals: string[]; }; }
errors: [CONFIG_INVALID, TASK_PARSE_ERROR]
```

`planning.breakdown_spec`
```
params: { spec_path: string }
returns: { spec_id: string; task_ids: string[]; summary: string; }
errors: [SPEC_NOT_FOUND, TASK_PARSE_ERROR]
```

`planning.update_spec`
```
params: { spec_path: string; version?: number; updated_content: string; }
returns: { spec_id: string; changes_summary: string; }
errors: [SPEC_NOT_FOUND, CONFLICT_DETECTED]
```

`planning.rebuild_index`
```
params: {}
returns: { success: true; index_path: string; }
```

### 15.3 Architecture
`arch.validate_spec`
```
params: { spec_path: string }
returns: { spec_id: string; issues: { id; severity: "error"|"warning"|"info"; type: "layering_violation"|"pattern_violation"|"missing_component"|"ambiguous"; description: string; suggestion?: string; }[]; }
errors: [SPEC_NOT_FOUND, RULE_PARSE_ERROR]
```

`arch.annotate_spec_and_tasks`
```
params: { spec_path: string; report: any; }
returns: { success: true }
errors: [SPEC_NOT_FOUND, TASK_PARSE_ERROR]
```

### 15.4 Coding
`coding.start_task`
```
params: { task_id: string }
returns: {
  task: { meta: TaskMeta; sections: Record<string,string> };
  spec: { id: string; path: string; summary: any; };
  architecture: { rules_path: string; notes: string[]; };
  git: { current_branch: string; task_branch?: string; };
  reviews: { path: string; review_status?: string; }[];
  relevant_files: string[];
}
errors: [TASK_NOT_FOUND, GATE_VIOLATION, SPEC_NOT_FOUND, UNAUTHORIZED]
```

`coding.suggest_next_step`
```
params: { task_id: string; current_diff_context?: string; }
returns: { step: { description: string; estimated_complexity: "small"|"medium"|"large"; expected_files: string[]; }; }
errors: [TASK_NOT_FOUND, GATE_VIOLATION]
```

`coding.update_task_status`
```
params: { task_id: string; version: number; status: string; notes?: string; }
returns: { success: true; meta: TaskMeta }
errors: [INVALID_TRANSITION, GATE_VIOLATION, CONFLICT_DETECTED]
```

### 15.5 Review
`review.analyze_diff`
```
params: { base_ref: string; head_ref: string; task_id?: string; }
returns: {
  summary: string;
  review_status: "Changes Requested" | "Approved" | "Informational";
  blocking_issues: { id; description; file?; line?; }[];
  non_blocking_suggestions: { id; description; file?; line?; }[];
  notes: string[];
}
errors: [BRANCH_NOT_FOUND, ARCH_VIOLATION]
```

`review.write_review_doc`
```
params: { task_id: string; review: any; }
returns: { success: true; review_path: string; }
errors: [TASK_NOT_FOUND]
```

`review.summarize_task_reviews`
```
params: { task_id: string }
returns: {
  task_id: string;
  current_status: "Changes Requested" | "Approved" | "Informational" | "None";
  open_blocking_issues: any[];
  open_non_blocking_suggestions: any[];
}
errors: [TASK_NOT_FOUND]
```

### 15.6 Git
`git.status`
```
params: {}
returns: { branch: string; staged: string[]; unstaged: string[]; untracked: string[]; clean: boolean; }
```

`git.create_branch`
```
params: { branch_name: string; base_ref?: string; task_id?: string; }
returns: { branch: string; base_ref: string; }
errors: [BRANCH_NOT_FOUND]
```

`git.stage_and_commit`
```
params: { task_id: string; summary: string; }
returns: { commit_hash: string; message: string; }
errors: [GIT_DIRTY, TASK_NOT_FOUND, MERGE_CONFLICT]
```

`git.push`
```
params: { remote?: string; branch?: string; }
returns: { success: true; remote: string; branch: string; }
errors: [BRANCH_NOT_FOUND]
```

`git.open_pr`
```
params: { task_id: string; base_branch: string; title: string; body?: string; }
returns: { pr_url: string; }
errors: [BRANCH_NOT_FOUND, TASK_NOT_FOUND]
```
