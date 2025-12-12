# Testing and Using the MCP Kanban Server

This guide explains how to test and use your MCP Kanban Spec-Driven Development Server based on the official [Model Context Protocol documentation](https://modelcontextprotocol.io/).

## Table of Contents
1. [Using the CLI](#using-the-cli)
2. [Testing Your MCP Server](#testing-your-mcp-server)
3. [Using Your MCP Server with AI Clients](#using-your-mcp-server-with-ai-clients)
4. [Development Workflow](#development-workflow)
5. [Troubleshooting](#troubleshooting)

## Using the CLI

The SDD CLI provides a Backlog.md-style interface for managing tasks, specs, and your Kanban workflow.

### Installation

```bash
# Install dependencies
pnpm install

# Build the project
pnpm build

# Run CLI directly (development)
pnpm cli <command>

# Or install globally for easier access
pnpm add -g .
# Then use: sdd <command>
```

### Initialize a Project

```bash
# Interactive initialization
sdd init

# Or specify project name
sdd init "My Project"

# With defaults (no prompts)
sdd init --defaults

# Choose MCP integration mode
sdd init --mcp-mode mcp  # or cli, or skip
```

This creates:
- `/backlog` directory with `config.yaml`
- `/specs` directory for feature specifications
- `/architecture` directory with `rules.yaml`
- `/reviews` directory for code reviews
- `CLAUDE.md` and `AGENTS.md` instruction files (if MCP mode selected)

### Task Management

```bash
# Create tasks
sdd task create "Implement login API"
sdd task create "Add tests" --desc "Unit and integration tests" --priority high
sdd task create "Fix bug" --status "In Progress" --assignee @adam
sdd task create "Feature" --ac "Must work" --ac "Must be tested" --labels backend,api

# List tasks
sdd task list
sdd task list --status "Backlog"
sdd task list --assignee @adam
sdd task list --priority high
sdd task list --plain  # For AI/scripts

# View task details
sdd task view 1
sdd task view task-1
sdd task view 1 --plain  # For AI mode

# Edit tasks (coming soon - use MCP tools for now)
sdd task edit 1 -s "In Progress"
sdd task edit 1 --priority high

# Archive tasks
sdd task archive 1
```

### Board Operations

```bash
# View Kanban board in terminal
sdd board

# Export board to markdown
sdd board export
sdd board export project-status.md
sdd board export --export-version "v1.0.0"
```

### Web Interface

```bash
# Launch web UI (opens browser automatically)
sdd browser

# Custom port
sdd browser --port 8080

# Don't open browser
sdd browser --no-open
```

### Specifications

```bash
# Create spec (coming soon - use MCP tools for now)
sdd spec create "User Authentication"
sdd spec list
sdd spec view 1
```

### Configuration

```bash
# List all configuration
sdd config list

# Get specific config
sdd config get defaultStatus

# Set config
sdd config set defaultStatus "Backlog"
```

## Testing Your MCP Server

### Option 1: MCP Inspector (Recommended for Development)

The [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) is the official testing tool for MCP servers. It provides an interactive UI to test tools, prompts, and resources.

#### Quick Start with Inspector

```bash
# Install and build your server first
pnpm install
pnpm build

# Run the inspector with your server
npx @modelcontextprotocol/inspector node dist/server.js

# Or for development (with tsx):
npx @modelcontextprotocol/inspector tsx src/server.ts
```

#### What the Inspector Provides:

- **Tools Tab**: Lists all your registered tools, shows schemas, and lets you test with custom inputs
- **Resources Tab**: Displays available resources (when you add them)
- **Prompts Tab**: Shows prompt templates (when you add them)
- **Notifications Pane**: Shows logs and server notifications
- **Server Connection**: View connection status and customize startup

#### Development Workflow with Inspector:

1. **Start Development**
   - Launch Inspector with your server
   - Verify basic connectivity
   - Check that all tools are registered

2. **Iterative Testing**
   - Make changes to your server code
   - Rebuild: `pnpm build`
   - Reconnect the Inspector
   - Test affected features
   - Monitor messages and logs

3. **Test Edge Cases**
   - Invalid inputs
   - Missing required parameters
   - Concurrent operations
   - Error handling

### Option 2: Manual Testing with Direct Execution

You can also test by running your server directly:

```bash
# Run in development mode
pnpm mcp

# The server will start and listen on stdio
# You can pipe JSON-RPC commands to it for testing
```

### Option 3: Unit and Integration Tests

Your project already has Vitest configured:

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# Check specific test files
pnpm test task-store.test.ts
```

## Using Your MCP Server with AI Clients

Once tested, you can integrate your MCP server with various AI clients. Here are the most popular options:

### Option 1: Claude Desktop App (Recommended for Mac Users)

Claude Desktop has full MCP support including tools, resources, and prompts.

#### Configuration:

1. **Build your server**:
   ```bash
   pnpm build
   ```

2. **Find Claude's config file**:
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

3. **Add your server configuration**:
   ```json
   {
     "mcpServers": {
       "kanban-sdd": {
         "command": "node",
         "args": [
           "/home/adamgillespie/git_repos/codex_sdd/dist/server.js"
         ],
         "env": {
           "NODE_ENV": "production"
         }
       }
     }
   }
   ```

4. **Restart Claude Desktop**

5. **Verify**: Look for the 🔌 icon in Claude Desktop showing connected MCP servers

#### Development Mode Configuration:

For active development, use `tsx` instead:

```json
{
  "mcpServers": {
    "kanban-sdd-dev": {
      "command": "npx",
      "args": [
        "tsx",
        "/home/adamgillespie/git_repos/codex_sdd/src/server.ts"
      ],
      "env": {
        "NODE_ENV": "development"
      }
    }
  }
}
```

### Option 2: VS Code with GitHub Copilot

VS Code has comprehensive MCP support through GitHub Copilot's agent mode.

#### Configuration:

1. **Create or edit `.vscode/mcp.json`** in your workspace:
   ```json
   {
     "mcpServers": {
       "kanban-sdd": {
         "command": "node",
         "args": ["dist/server.js"]
       }
     }
   }
   ```

2. **Or configure globally** in VS Code settings:
   - Open Settings (Cmd/Ctrl + ,)
   - Search for "MCP"
   - Add server configuration

3. **Features**:
   - Per-session tool selection
   - Server debugging with restart commands
   - Output logging
   - Tool calls with editable inputs

### Option 3: Cursor IDE

Cursor supports MCP tools in Composer mode.

#### Configuration:

Add to your Cursor settings or `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "kanban-sdd": {
      "command": "node",
      "args": ["/home/adamgillespie/git_repos/codex_sdd/dist/server.js"]
    }
  }
}
```

### Option 4: Continue (VS Code Extension)

[Continue](https://github.com/continuedev/continue) is an open-source AI code assistant with full MCP support.

#### Configuration:

Edit `~/.continue/config.json`:

```json
{
  "mcpServers": [
    {
      "name": "kanban-sdd",
      "command": "node",
      "args": ["/home/adamgillespie/git_repos/codex_sdd/dist/server.js"]
    }
  ]
}
```

### Option 5: Cline (VS Code Extension)

[Cline](https://github.com/cline/cline) is an autonomous coding agent with MCP support.

Features:
- Create tools through natural language
- Share custom MCP servers via `~/Documents/Cline/MCP`
- Error logs and debugging

## Development Workflow

### Recommended Development Cycle

1. **Setup for Development**
   ```bash
   # Install dependencies
   pnpm install
   
   # Start in watch mode (for general dev)
   pnpm dev
   
   # Or use MCP Inspector for tool testing
   npx @modelcontextprotocol/inspector tsx src/server.ts
   ```

2. **Make Changes**
   - Edit your tool implementations
   - Add new tools to `src/index.ts`
   - Update schemas

3. **Test Changes**
   ```bash
   # Run unit tests
   pnpm test
   
   # Or use Inspector to test interactively
   # (rebuild and reconnect)
   pnpm build
   # Then reconnect Inspector
   ```

4. **Integrate with AI Client**
   - Build: `pnpm build`
   - Update client config if needed
   - Restart client
   - Test in real workflow

### Example Usage Scenarios

#### Scenario 1: Creating a New Spec

In Claude Desktop or your AI client:

```
"Create a new spec for a user authentication feature"
```

The AI will use your `planning_create_spec` tool to generate the specification.

#### Scenario 2: Breaking Down a Spec into Tasks

```
"Break down the authentication spec into tasks"
```

Uses `planning_breakdown_spec` to create individual task files.

#### Scenario 3: Moving a Task Through Kanban

```
"Move task-001 to In Progress"
```

Uses `tasks_move` with your configured status transitions.

#### Scenario 4: Starting Work on a Task

```
"Start working on task-001"
```

Uses `coding_start_task` which respects your Kanban gates.

#### Scenario 5: Validating Against Architecture Rules

```
"Validate the authentication spec against our architecture rules"
```

Uses `arch_validate_spec` to check compliance.

## Troubleshooting

### Server Won't Start

**Check logs**:
```bash
# Run with debug logging
NODE_ENV=development pnpm mcp
```

**Common issues**:
- Missing dependencies: `pnpm install`
- TypeScript errors: `pnpm typecheck`
- Build issues: `pnpm build`

### Tools Not Appearing in Client

1. **Verify server is registered**:
   - Check client config file
   - Ensure absolute paths are correct
   - Restart the client

2. **Check server connectivity**:
   ```bash
   # Test with Inspector
   npx @modelcontextprotocol/inspector node dist/server.js
   ```

3. **Review server logs**:
   - Check for registration errors
   - Verify all tools are loaded

### Tool Execution Errors

1. **Use Inspector to test the tool directly**
   - See exact error messages
   - Test with different inputs
   - Check parameter validation

2. **Check authorization**:
   - Verify `backlog/config.yaml` roles match your use case
   - Check audit logs for permission denials

3. **File access issues**:
   - Ensure proper file permissions
   - Check paths are relative to repo root
   - Verify `backlog/`, `specs/`, etc. directories exist

### Performance Issues

1. **Rate limiting**: Check observability metrics
   ```bash
   # Logs show rate limit information
   pnpm mcp
   ```

2. **File locking**: Ensure no stale locks
   - Check for `.lock` files
   - Restart server to clear

### Debugging Tips

1. **Enable verbose logging**:
   ```bash
   NODE_ENV=development LOG_LEVEL=debug pnpm mcp
   ```

2. **Use the Inspector**:
   - View all RPC messages
   - See exact tool schemas
   - Test edge cases safely

3. **Check test coverage**:
   ```bash
   pnpm test
   # Review test failures for clues
   ```

## Next Steps

1. **Start with Inspector**: Test all your tools interactively
2. **Configure Claude Desktop**: Best full-featured client for Mac
3. **Or use VS Code Copilot**: Great for integrated development
4. **Build your workflow**: Combine multiple tools for complete features
5. **Iterate**: Use Inspector → Code → Test → Integrate cycle

## Additional Resources

- [MCP Official Documentation](https://modelcontextprotocol.io/)
- [MCP Inspector Guide](https://modelcontextprotocol.io/docs/tools/inspector)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Example MCP Servers](https://github.com/modelcontextprotocol)
- [Your System Design Doc](./mcp-kanban-sdd.md)

## Available Tools in Your Server

Based on `src/index.ts`, your server provides:

### Kanban & Tasks
- `kanban_get_board` - View the Kanban board
- `tasks_get` - Retrieve task details
- `tasks_update` - Update task metadata
- `tasks_move` - Move tasks between statuses
- `tasks_search` - Search for tasks

### Planning & Specs
- `planning_create_spec` - Create new specifications
- `planning_breakdown_spec` - Break specs into tasks
- `planning_update_spec` - Update existing specs
- `planning_rebuild_index` - Rebuild the backlog index

### Architecture
- `arch_validate_spec` - Validate specs against architecture rules
- `arch_annotate_spec_and_tasks` - Add architecture annotations

### Coding
- `coding_start_task` - Start work on a task (respects Kanban gates)
- `coding_suggest_next_step` - Get coding suggestions
- `coding_update_task_status` - Update task progress

### Review
- `review_analyze_diff` - Analyze code changes
- `review_write_review_doc` - Write review documentation
- `review_summarize_task_reviews` - Summarize reviews

### Git
- `git_status` - Check git status
- `git_create_branch` - Create feature branches
- `git_stage_and_commit` - Stage and commit changes
- `git_push` - Push to remote
- `git_open_pr` - Open pull requests

---

**Ready to start?** Try running the Inspector first to verify everything works:

```bash
npx @modelcontextprotocol/inspector tsx src/server.ts
```
