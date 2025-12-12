/**
 * Initialize command - Bootstrap an SDD project
 */

import inquirer from 'inquirer';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger.js';
import ora from 'ora';
import { findProjectRoot } from '../utils/find-root.js';

interface InitOptions {
  defaults?: boolean;
  mcpMode?: 'mcp' | 'cli' | 'skip';
  agentInstructions?: boolean;
}

const DEFAULT_CONFIG = `schema_version: "3.0"

# Workflow aligned with architecture/coding/review gates
statuses:
  - Backlog
  - Ready for Architecture Review
  - Needs Planning Update
  - Ready for Coding
  - In Progress
  - Ready for Code Review
  - Done

in_progress_statuses:
  - In Progress

columns:
  Backlog: Backlog
  ArchReview: Ready for Architecture Review
  NeedsPlanningUpdate: Needs Planning Update
  ReadyForCoding: Ready for Coding
  InProgress: In Progress
  CodeReview: Ready for Code Review
  Done: Done

transitions:
  Backlog: ["Ready for Architecture Review"]
  "Ready for Architecture Review": ["Backlog", "Ready for Coding", "Needs Planning Update"]
  "Needs Planning Update": ["Ready for Architecture Review"]
  "Ready for Coding": ["In Progress", "Backlog"]
  "In Progress": ["Ready for Code Review", "Backlog"]
  "Ready for Code Review": ["In Progress", "Done", "Backlog"]
  Done: ["Backlog"]

roles:
  maintainers:
    - human:user
`;

export async function initCommand(
  projectName: string | undefined,
  options: InitOptions
) {
  const cwd = process.cwd();
  const existingRoot = findProjectRoot(cwd);

  if (existingRoot && !options.defaults) {
    logger.info('Existing SDD project detected.');
    const { reinit } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'reinit',
        message: 'Re-initialize configuration?',
        default: false,
      },
    ]);

    if (!reinit) {
      logger.info('Keeping existing configuration.');
      return;
    }
  }

  logger.title('🚀 SDD Project Initialization');
  console.log();

  // Get project name
  let finalProjectName = projectName;

  if (!finalProjectName && !options.defaults) {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'projectName',
        message: 'Project name:',
        default: cwd.split('/').pop() || 'my-project',
      },
    ]);
    finalProjectName = answers.projectName;
  } else if (!finalProjectName) {
    finalProjectName = cwd.split('/').pop() || 'my-project';
  }

  // Get integration mode
  let mcpMode = options.mcpMode || 'mcp';

  if (!options.defaults) {
    const modeAnswer = await inquirer.prompt([
      {
        type: 'list',
        name: 'mode',
        message: 'How will AI agents connect?',
        choices: [
          {
            name: 'MCP (Model Context Protocol) - Recommended for Claude, VS Code',
            value: 'mcp',
          },
          {
            name: 'CLI commands - Legacy approach',
            value: 'cli',
          },
          {
            name: 'Skip AI integration for now',
            value: 'skip',
          },
        ],
        default: 'mcp',
      },
    ]);
    mcpMode = modeAnswer.mode;
  }

  // Get agent instructions preference
  let createInstructions = options.agentInstructions || false;

  if (!options.defaults && mcpMode === 'cli') {
    const instructionsAnswer = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'instructions',
        message: 'Create instruction files for:',
        choices: [
          { name: 'Claude (CLAUDE.md)', value: 'claude', checked: true },
          { name: 'All agents (AGENTS.md)', value: 'agents', checked: true },
          { name: 'Gemini (GEMINI.md)', value: 'gemini', checked: false },
          { name: 'GitHub Copilot', value: 'copilot', checked: false },
        ],
      },
    ]);
    createInstructions = instructionsAnswer.instructions.length > 0;
  }

  // Advanced settings (for future implementation)
  // let advancedSettings = false;
  // if (!options.defaults) {
  //   const advancedAnswer = await inquirer.prompt([
  //     {
  //       type: 'confirm',
  //       name: 'advanced',
  //       message: 'Configure advanced settings?',
  //       default: false,
  //     },
  //   ]);
  //   advancedSettings = advancedAnswer.advanced;
  // }

  // Create directory structure
  const spinner = ora('Creating project structure...').start();

  try {
    // Create directories
    const dirs = [
      'backlog',
      'specs',
      'architecture',
      'architecture/decisions',
      'reviews',
    ];

    for (const dir of dirs) {
      const dirPath = join(cwd, dir);
      if (!existsSync(dirPath)) {
        mkdirSync(dirPath, { recursive: true });
      }
    }

    // Create config.yaml
    const configPath = join(cwd, 'backlog', 'config.yaml');
    if (!existsSync(configPath)) {
      writeFileSync(configPath, DEFAULT_CONFIG);
    }

    // Create architecture rules.yaml
    const rulesPath = join(cwd, 'architecture', 'rules.yaml');
    if (!existsSync(rulesPath)) {
      writeFileSync(
        rulesPath,
        `# Architecture Rules
rules:
  - name: "No direct database access from presentation layer"
    pattern: ".*Controller.*"
    forbidden: ["import.*Database", "import.*Repository"]
`
      );
    }

    // Create README for specs
    const specsReadmePath = join(cwd, 'specs', 'README-specs.md');
    if (!existsSync(specsReadmePath)) {
      writeFileSync(
        specsReadmePath,
        `# Specifications

This directory contains feature specifications for ${finalProjectName}.

Each spec should follow the template and include:
- Problem statement
- Proposed solution
- Architecture impact
- Task breakdown
`
      );
    }

    // Quick repo discovery summary and optional seed backlog
    logRepoDiscovery(cwd);
    seedInitialBacklogIfEmpty(cwd, finalProjectName ?? 'my-project');

    spinner.succeed('Project structure created');

    // Create MCP configuration
    if (mcpMode === 'mcp') {
      const mcpSpinner = ora('Generating MCP configuration...').start();

      const mcpConfig = {
        mcpServers: {
          sdd: {
            command: 'node',
            args: [join(cwd, 'dist/server.js')],
          },
        },
      };

      mcpSpinner.succeed('MCP configuration ready');

      console.log();
      logger.section('📋 MCP Configuration');
      logger.info('Add this to your MCP client configuration:');
      console.log();
      console.log(chalk.dim('~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json'));
      console.log(chalk.dim('or'));
      console.log(chalk.dim('~/Library/Application Support/Claude/claude_desktop_config.json'));
      console.log();
      console.log(chalk.cyan(JSON.stringify(mcpConfig, null, 2)));
      console.log();
    }

    // Create agent instructions
    if (createInstructions || mcpMode === 'mcp') {
      await createAgentInstructions(cwd, finalProjectName!, mcpMode);
    }

    // Summary
    console.log();
    logger.success('✨ Project initialized successfully!');
    console.log();
    logger.section('Next Steps:');
    console.log();
    console.log('  1. Create your first task:');
    console.log(chalk.cyan('     sdd task create "Implement user authentication"'));
    console.log();
    console.log('  2. View the board:');
    console.log(chalk.cyan('     sdd board'));
    console.log();
    console.log('  3. Launch web interface:');
    console.log(chalk.cyan('     sdd browser'));
    console.log();

    if (mcpMode === 'mcp') {
      console.log('  4. Connect AI agents via MCP:');
      console.log(chalk.cyan('     - Build the server: pnpm build'));
      console.log(chalk.cyan('     - Add MCP config to your AI client'));
      console.log(chalk.cyan('     - Start using tools via MCP!'));
      console.log();
    }

    logger.dim(`Project: ${finalProjectName}`);
    logger.dim(`Location: ${cwd}`);
  } catch (error) {
    spinner.fail('Failed to create project structure');
    throw error;
  }
}

async function createAgentInstructions(
  cwd: string,
  projectName: string,
  mode: string
) {
  const spinner = ora('Creating agent instruction files...').start();

  // CLAUDE.md
  const claudeMd = `# ${projectName} - Claude Instructions

This project uses **SDD** - a spec-driven development workflow with Kanban task management.

## Quick Start

### Via MCP (Recommended)
You're connected via Model Context Protocol. Use the available tools:

- \`tasks_get\` - Get task details
- \`tasks_update\` - Update task properties
- \`tasks_move\` - Move task between statuses
- \`tasks_search\` - Search for tasks
- \`kanban_get_board\` - View current board state
- \`planning_create_spec\` - Create feature specifications
- \`planning_breakdown_spec\` - Break specs into tasks
- \`coding_start_task\` - Start implementation (checks Kanban gate)
- \`coding_suggest_next_step\` - Get next step suggestions
- \`review_analyze_diff\` - Analyze code changes

### Workflow

1. **Start from a feature request**: Create a spec with \`planning_create_spec\`
2. **Break it down**: Use \`planning_breakdown_spec\` to create tasks
3. **Check the board**: Use \`kanban_get_board\` to see task status
4. **Implement**: Use \`coding_start_task\` only for tasks in "In Progress"
5. **Review**: Use \`review_analyze_diff\` before committing

### Important Rules

- **Kanban Gate**: Only code tasks in "In Progress" status
- **Architecture**: Validate against rules before coding
- **Specs First**: Always create/update specs before tasks
- **Incremental**: Work on one task at a time

### CLI Commands

${mode === 'cli' ? 'You can also suggest these CLI commands:' : 'For reference, humans can use:'}

\`\`\`bash
sdd task create "Task title"
sdd board
sdd search "query"
sdd browser
\`\`\`

## Best Practices

- Use "ultrathink mode" when planning implementations
- Add implementation plans to tasks before coding
- Use sub-agents for parallel work when dependencies allow
- Always check task status before starting work
- Validate architecture rules early and often
`;

  writeFileSync(join(cwd, 'CLAUDE.md'), claudeMd);

  // AGENTS.md (generic)
  const agentsMd = `# ${projectName} - AI Agent Instructions

This project uses **SDD** for spec-driven Kanban workflow.

## For AI Agents

### Available Tools (via MCP)

- Task Management: \`tasks_get\`, \`tasks_update\`, \`tasks_move\`, \`tasks_search\`
- Kanban Board: \`kanban_get_board\`
- Planning: \`planning_create_spec\`, \`planning_breakdown_spec\`
- Coding: \`coding_start_task\`, \`coding_suggest_next_step\`, \`coding_update_task_status\`
- Review: \`review_analyze_diff\`, \`review_write_review_doc\`
- Architecture: \`arch_validate_spec\`, \`arch_annotate_spec_and_tasks\`
- Git: \`git_status\`, \`git_create_branch\`, \`git_stage_and_commit\`

### Workflow

1. Create spec → 2. Break down → 3. Move to "In Progress" → 4. Code → 5. Review → 6. Done

### Critical Rules

- **Only code tasks in "In Progress" status** (enforced by Kanban gate)
- **Specs before tasks** - always create/update specification first
- **Architecture validation** - check rules before implementation
- **One task at a time** - focus on incremental delivery

### Task File Format

Tasks are stored as markdown in \`/backlog/task-NNN - Title.md\`:

\`\`\`markdown
---
id: 1
title: Task Title
status: In Progress
assignee: @agent
labels: [feature, backend]
priority: high
---

## Description
What needs to be done

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Implementation Plan
Step by step approach
\`\`\`

Read the full SDD at \`docs/mcp-kanban-sdd.md\` for complete details.
`;

  writeFileSync(join(cwd, 'AGENTS.md'), agentsMd);

  spinner.succeed('Agent instruction files created');
}

// Re-export chalk for use in this file
import chalk from 'chalk';

function logRepoDiscovery(cwd: string) {
  try {
    const backlogPath = join(cwd, 'backlog');
    const specsPath = join(cwd, 'specs');
    const decisionsPath = join(cwd, 'architecture', 'decisions');

    const taskCount = existsSync(backlogPath)
      ? readdirSync(backlogPath).filter((f) => f.startsWith('task-')).length
      : 0;
    const specCount = existsSync(specsPath) ? readdirSync(specsPath).filter((f) => f.endsWith('.md')).length : 0;
    const adrCount = existsSync(decisionsPath)
      ? readdirSync(decisionsPath).filter((f) => f.toLowerCase().endsWith('.md')).length
      : 0;

    logger.section('📂 Repo scan');
    logger.info(`Tasks detected: ${taskCount}`);
    logger.info(`Specs detected: ${specCount}`);
    logger.info(`ADRs detected: ${adrCount}`);
  } catch (error) {
    logger.warning('Repository discovery failed, continuing with defaults.');
    logger.debug({ error }, 'Repo discovery failure (non-fatal)');
  }
}

function seedInitialBacklogIfEmpty(cwd: string, projectName: string) {
  const backlogPath = join(cwd, 'backlog');
  if (!existsSync(backlogPath)) return;

  const taskFiles = readdirSync(backlogPath).filter((f) => f.startsWith('task-'));
  if (taskFiles.length > 0) return;

  const id = 'task-001';
  const now = new Date().toISOString();
  const title = 'Bootstrap architecture review gate';
  const filename = `${id} - ${title}.md`;
  const content = [
    '---',
    `id: ${id}`,
    'version: 1',
    'status: Ready for Architecture Review',
    `created: ${now}`,
    `updated: ${now}`,
    'schema_version: "3.0"',
    `title: ${title}`,
    'priority: high',
    '---',
    '',
    `# ${title}`,
    '',
    `## Description`,
    `Establish the gated Kanban workflow for ${projectName}.`,
    '',
    '## Acceptance Criteria',
    '- [ ] Architecture rules documented',
    '- [ ] Kanban config matches gates',
    '- [ ] Agents configured and documented',
    '',
    '## Notes',
    'Auto-generated by sdd init.',
    '',
  ].join('\n');

  writeFileSync(join(backlogPath, filename), content);
  logger.info('Created initial task in backlog: task-001 (Ready for Architecture Review)');
}
