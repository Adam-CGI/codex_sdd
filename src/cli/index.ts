#!/usr/bin/env node

/**
 * CLI entry point for SDD (Spec-Driven Development)
 *
 * Provides a Backlog.md-style interface for managing tasks, specs, and workflows.
 */

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load package.json for version info
const packageJsonPath = join(__dirname, '../../package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

const program = new Command();

program
  .name('sdd')
  .description('Spec-Driven Development with AI-Ready Kanban workflow')
  .version(packageJson.version);

// Initialize project
program
  .command('init [project-name]')
  .description('Initialize a new project with SDD workflow')
  .option('--defaults', 'Use default settings without prompts')
  .option('--mcp-mode <mode>', 'MCP integration mode: mcp, cli, or skip', 'mcp')
  .option('--agent-instructions', 'Create agent instruction files (CLAUDE.md, AGENTS.md, etc.)')
  .action(async (projectName, options) => {
    const { initCommand } = await import('./commands/init.js');
    await initCommand(projectName, options);
  });

// Task management commands
const task = program.command('task').description('Manage tasks');

task
  .command('create <title>')
  .description('Create a new task')
  .option('-d, --desc <description>', 'Task description')
  .option('-a, --assignee <assignee>', 'Task assignee (e.g., @username)')
  .option('-s, --status <status>', 'Initial status')
  .option('-l, --labels <labels>', 'Comma-separated labels')
  .option('-p, --parent <parent>', 'Parent task ID')
  .option('--priority <priority>', 'Priority: low, medium, high')
  .option('--plan <plan>', 'Implementation plan')
  .option('--ac <criteria...>', 'Acceptance criteria (can be used multiple times)')
  .option('--notes <notes>', 'Initial notes')
  .option('--dep <dependencies>', 'Comma-separated task dependencies')
  .option('--draft', 'Create as draft')
  .action(async (title, options) => {
    const { taskCreateCommand } = await import('./commands/task-create.js');
    await taskCreateCommand(title, options);
  });

task
  .command('list')
  .description('List tasks')
  .option('-s, --status <status>', 'Filter by status')
  .option('-a, --assignee <assignee>', 'Filter by assignee')
  .option('-p, --parent <parent>', 'Filter by parent task')
  .option('-l, --labels <labels>', 'Filter by labels')
  .option('--priority <priority>', 'Filter by priority')
  .option('--plain', 'Plain text output (for AI/scripts)')
  .action(async (options) => {
    const { taskListCommand } = await import('./commands/task-list.js');
    await taskListCommand(options);
  });

task
  .command('view <id>')
  .alias('get')
  .description('View task details')
  .option('--plain', 'Plain text output (for AI mode)')
  .action(async (id, options) => {
    const { taskViewCommand } = await import('./commands/task-view.js');
    await taskViewCommand(id, options);
  });

task
  .command('edit <id>')
  .description('Edit task properties')
  .option('-t, --title <title>', 'Update title')
  .option('-d, --desc <description>', 'Update description')
  .option('-a, --assignee <assignee>', 'Update assignee')
  .option('-s, --status <status>', 'Update status')
  .option('-l, --labels <labels>', 'Update labels')
  .option('--priority <priority>', 'Update priority')
  .option('--plan <plan>', 'Update plan')
  .option('--notes <notes>', 'Replace notes')
  .option('--append-notes <notes>', 'Append to notes')
  .option('--ac <criteria...>', 'Add acceptance criterion')
  .option('--check-ac <index...>', 'Mark AC as done (by index)')
  .option('--uncheck-ac <index...>', 'Mark AC as not done (by index)')
  .option('--remove-ac <index...>', 'Remove AC (by index)')
  .option('--dep <dependencies>', 'Add dependencies')
  .action(async (id, options) => {
    const { taskEditCommand } = await import('./commands/task-edit.js');
    await taskEditCommand(id, options);
  });

task
  .command('archive <id>')
  .description('Archive a task')
  .action(async (id) => {
    const { taskArchiveCommand } = await import('./commands/task-archive.js');
    await taskArchiveCommand(id);
  });

// Board commands
const board = program.command('board').description('Kanban board operations');

board
  .command('view')
  .description('Display interactive Kanban board')
  .alias('show')
  .action(async () => {
    const { boardViewCommand } = await import('./commands/board-view.js');
    await boardViewCommand();
  });

board
  .command('export [file]')
  .description('Export board to markdown')
  .option('--force', 'Overwrite existing file')
  .option('--readme', 'Export to README.md with board markers')
  .option('--export-version <version>', 'Include version string in export')
  .action(async (file, options) => {
    const { boardExportCommand } = await import('./commands/stubs.js');
    await boardExportCommand(file, options);
  });

// Default board action is to view
board.action(async () => {
  const { boardViewCommand } = await import('./commands/board-view.js');
  await boardViewCommand();
});

// Search command
program
  .command('search <query>')
  .description('Search tasks, specs, and decisions')
  .option('--status <status>', 'Filter by status')
  .option('--priority <priority>', 'Filter by priority')
  .option('--plain', 'Plain text output')
  .action(async (query, options) => {
    const { searchCommand } = await import('./commands/stubs.js');
    await searchCommand(query, options);
  });

// Browser/Web UI command
program
  .command('browser')
  .description('Launch web interface')
  .option('--port <port>', 'Web server port', '6420')
  .option('--no-open', "Don't open browser automatically")
  .action(async (options) => {
    const { browserCommand } = await import('./commands/browser.js');
    await browserCommand(options);
  });

// Spec management commands
const spec = program.command('spec').description('Manage specifications');

spec
  .command('create <title>')
  .description('Create a new specification')
  .option('-d, --desc <description>', 'Spec description')
  .option('-t, --type <type>', 'Spec type (feature, technical, etc.)')
  .action(async (title, options) => {
    const { specCreateCommand } = await import('./commands/stubs.js');
    await specCreateCommand(title, options);
  });

spec
  .command('list')
  .description('List all specifications')
  .action(async () => {
    const { specListCommand } = await import('./commands/stubs.js');
    await specListCommand();
  });

spec
  .command('view <id>')
  .description('View specification details')
  .action(async (id) => {
    const { specViewCommand } = await import('./commands/stubs.js');
    await specViewCommand(id);
  });

spec
  .command('breakdown <id>')
  .description('Break down spec into tasks')
  .action(async (id) => {
    const { specBreakdownCommand } = await import('./commands/stubs.js');
    await specBreakdownCommand(id);
  });

// MCP command
program
  .command('mcp')
  .description('MCP server operations')
  .option('--start', 'Start MCP server')
  .option('--config', 'Show MCP configuration instructions')
  .action(async (options) => {
    const { mcpCommand } = await import('./commands/stubs.js');
    await mcpCommand(options);
  });

// Config commands
const config = program.command('config').description('Configuration management');

config
  .command('list')
  .description('List all configuration values')
  .action(async () => {
    const { configListCommand } = await import('./commands/stubs.js');
    await configListCommand();
  });

config
  .command('get <key>')
  .description('Get configuration value')
  .action(async (key) => {
    const { configGetCommand } = await import('./commands/stubs.js');
    await configGetCommand(key);
  });

config
  .command('set <key> <value>')
  .description('Set configuration value')
  .action(async (key, value) => {
    const { configSetCommand } = await import('./commands/stubs.js');
    await configSetCommand(key, value);
  });

// Default config action opens interactive wizard
config.action(async () => {
  const { configWizardCommand } = await import('./commands/stubs.js');
  await configWizardCommand();
});

// Overview command
program
  .command('overview')
  .description('Show project overview and statistics')
  .action(async () => {
    const { overviewCommand } = await import('./commands/stubs.js');
    await overviewCommand();
  });

// Workflow commands
const workflowModule = await import('./commands/workflow.js');
program.addCommand(workflowModule.workflowCommand);

// Error handling
program.exitOverride();

// Parse arguments
try {
  await program.parseAsync(process.argv);
} catch (error) {
  if (error instanceof Error && error.message.includes('outputHelp')) {
    // This is expected when --help is used
    process.exit(0);
  }
  console.error('Error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
