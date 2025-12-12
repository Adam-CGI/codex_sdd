# MCP Kanban Spec-Driven Development Server

An MCP server that drives spec-first, Kanban-gated development against a Backlog-style markdown task system.

## Features

- 🚀 **CLI & MCP Dual Interface** - Use via command line (`sdd`) or MCP tools for AI agents
- 📝 **Markdown-native tasks** - Every task is a plain `.md` file in `/backlog`
- 🤖 **AI-Ready** - Works with Claude Code, VS Code Copilot, and any MCP-compatible assistant
- 🤝 **Multi-Agent Workflow** - Structured workflow with Planning, Architect, Coding, and Review agents
- 📊 **Terminal Kanban board** - Visual task management right in your terminal
- 🌐 **Modern web interface** - Interactive web UI for visual task management
- 🔍 **Spec-driven workflow** - Start from feature specs, break down into tasks
- 🏗️ **Architecture validation** - Enforce rules before coding
- 🔒 **Kanban gate** - Only code tasks in "In Progress" status
- 💻 **Cross-platform** - Works on macOS, Linux, and Windows

## Quick Start

### Installation

```bash
# Clone and install dependencies
git clone https://github.com/yourusername/codex_sdd
cd codex_sdd
pnpm install

# Build the project
pnpm build

# Optional: Install globally for easy access
pnpm add -g .
```

## 5-Minute Tour

```bash
# 1. Initialize a new project (or re-initialize this one)
sdd init "My Awesome Project"

# 2. Create tasks manually
sdd task create "Implement user authentication"

# 3. Or let AI create them via MCP tools
# (After configuring MCP - see below)
# Claude: "Please create tasks for adding a search feature"

# 4. View your board
sdd board

# 5. See task details
sdd task view 1

# 6. List all tasks
sdd task list

# 7. Filter tasks
sdd task list --status "In Progress"

# 8. Launch web interface
sdd browser

# 9. Create a feature spec
sdd spec create "User Authentication System"

# 10. Let AI break it down into tasks
# Claude: "Break down spec-1 into implementation tasks"
```

## CLI Reference

### Project Setup

| Command | Description |
|---------|-------------|
| `sdd init [project-name]` | Initialize project (creates backlog structure) |
| `sdd config` | Interactive configuration wizard |

### Task Management

| Command | Description |
|---------|-------------|
| `sdd task create <title>` | Create a new task |
| `sdd task create <title> -d "Description"` | Create with description |
| `sdd task create <title> -s "In Progress"` | Create with status |
| `sdd task create <title> -a @username` | Create with assignee |
| `sdd task create <title> --priority high` | Create with priority |
| `sdd task create <title> --ac "Must work" --ac "Must be tested"` | Create with acceptance criteria |
| `sdd task list` | List all tasks |
| `sdd task list --status "Backlog"` | Filter by status |
| `sdd task list --assignee @adam` | Filter by assignee |
| `sdd task list --priority high` | Filter by priority |
| `sdd task view <id>` | View task details |
| `sdd task edit <id> -s "Done"` | Edit task status |
| `sdd task archive <id>` | Archive a task |

### Board Operations

| Command | Description |
|---------|-------------|
| `sdd board` | Display interactive Kanban board |
| `sdd board export [file]` | Export board to markdown |

### Workflow Operations

| Command | Description |
|---------|-------------|
| `sdd workflow queue [agent]` | Show work queue for an agent |
| `sdd workflow agents` | Show all agents and their capabilities |
| `sdd workflow flow` | Display workflow diagram |

Available agents: `planning`, `architect`, `coding`, `review`, `git_manager`

### Web Interface

| Command | Description |
|---------|-------------|
| `sdd browser` | Launch web UI (default port 6420) |
| `sdd browser --port 8080` | Launch on custom port |
| `sdd browser --no-open` | Don't open browser automatically |

### Specifications

| Command | Description |
|---------|-------------|
| `sdd spec create <title>` | Create a new specification |
| `sdd spec list` | List all specifications |
| `sdd spec view <id>` | View specification details |

## MCP Integration

The server exposes MCP tools for AI agents to interact with your workflow.

### Configuration for Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sdd-kanban": {
      "command": "node",
      "args": ["/path/to/codex_sdd/dist/server.js"]
    }
  }
}
```

### Configuration for VS Code Copilot

Add to `.vscode/mcp.json` or User Settings:

```json
{
  "mcpServers": {
    "sdd-kanban": {
      "command": "node",
      "args": ["/path/to/codex_sdd/dist/server.js"]
    }
  }
}
```

### Available MCP Tools

- `tasks_get` - Get task details
- `tasks_update` - Update task properties
- `tasks_move` - Move task between statuses
- `tasks_search` - Search for tasks
- `kanban_get_board` - View current board state
- `planning_create_spec` - Create feature specifications
- `planning_breakdown_spec` - Break specs into tasks
- `coding_start_task` - Start implementation (checks Kanban gate)
- `coding_suggest_next_step` - Get next step suggestions
- `review_analyze_diff` - Analyze code changes
- `arch_validate_spec` - Validate against architecture rules
- `git.*` - Git operations (status, branch, commit, push, PR)

## Workflow

### For Humans (via CLI)

1. **Create a spec**: `sdd spec create "New Feature"`
2. **Break it down**: Let AI agent create tasks via MCP
3. **View the board**: `sdd board`
4. **Work on tasks**: `sdd task edit <id> -s "In Progress"`
5. **Track progress**: `sdd task list --status "In Progress"`

### For AI Agents (via MCP)

1. **Receive feature request** from human
2. **Create spec** with `planning_create_spec`
3. **Break down** with `planning_breakdown_spec`
4. **Validate architecture** with `arch_validate_spec`
5. **Check board** with `kanban_get_board`
6. **Start coding** only if task is "In Progress" (Kanban gate enforced)
7. **Review code** with `review_analyze_diff` before committing

## Stack

- **Runtime**: Node.js 20 LTS (ESM)
- **Language**: TypeScript 5.x
- **Package Manager**: pnpm
- **CLI Framework**: Commander.js
- **Terminal UI**: Chalk, CLI-table3, Inquirer, Ora
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

See `docs/WORKFLOW.md` for detailed information about the multi-agent workflow.

## Multi-Agent Workflow

SDD implements a structured development workflow with five specialized agents:

1. **Planning Agent** - Creates specs and breaks them into tasks
2. **Architect Agent** - Reviews tasks for architectural compliance
3. **Coding Agent** - Implements features with tests
4. **Code Review Agent** - Reviews code quality and security
5. **Git Manager** - Manages branches and PRs

Each agent works on tasks in specific states, ensuring quality gates are passed before moving forward.

**Learn more**: [docs/WORKFLOW.md](docs/WORKFLOW.md)

## Testing & Usage

For comprehensive instructions on testing and using this MCP server:

- **Testing Guide**: See [docs/TESTING_AND_USAGE.md](docs/TESTING_AND_USAGE.md)
- **Quick Start Testing**: `npx @modelcontextprotocol/inspector tsx src/server.ts`
- **Connect to Claude Desktop**: Configure in `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Use with VS Code Copilot**: Add to `.vscode/mcp.json` or global settings

The MCP server exposes tools for kanban management, spec-driven planning, architecture validation, coding assistance, code review, and git operations.
