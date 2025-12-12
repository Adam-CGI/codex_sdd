/**
 * Workflow command - Demonstrate the multi-agent workflow
 */

import { Command } from 'commander';
import { logger } from '../utils/logger.js';
import ora from 'ora';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { AGENTS, type AgentRole } from '../../workflow/agents.js';

export const workflowCommand = new Command('workflow')
  .description('Multi-agent workflow operations')
  .addCommand(createWorkQueueCommand())
  .addCommand(createAgentInfoCommand())
  .addCommand(createShowFlowCommand());

function createWorkQueueCommand() {
  return new Command('queue')
    .description('Show work queue for a specific agent')
    .argument('[agent-role]', 'Agent role (planning, architect, coding, review, git_manager)')
    .option('-l, --limit <number>', 'Limit number of tasks', '10')
    .action(async (role: string | undefined, options) => {
      try {
        let agentRole: AgentRole = role as AgentRole;

        if (!agentRole) {
          const answer = await inquirer.prompt([
            {
              type: 'list',
              name: 'role',
              message: 'Select agent role:',
              choices: [
                { name: 'Planning Agent - Creates specs and breaks down tasks', value: 'planning' },
                { name: 'Architect Agent - Reviews architectural compliance', value: 'architect' },
                { name: 'Coding Agent - Implements tasks', value: 'coding' },
                { name: 'Code Review Agent - Reviews code quality', value: 'review' },
                { name: 'Git Manager - Manages git operations', value: 'git_manager' },
              ],
            },
          ]);
          agentRole = answer.role;
        }

        const spinner = ora(`Fetching work queue for ${agentRole}...`).start();

        const { agentQueryWorkQueue } = await import('../../workflow/agents.js');
        const result = await agentQueryWorkQueue.handler({
          agent_role: agentRole,
          limit: parseInt(options.limit),
        });

        spinner.stop();

        if ('error' in result) {
          logger.error(result.error.message);
          process.exit(1);
        }

        const { agent, tasks, count } = result.data;

        console.log();
        logger.title(`${agent.name} Work Queue`);
        console.log(chalk.dim(agent.description));
        console.log();

        if (tasks.length === 0) {
          console.log(chalk.yellow('No tasks in queue'));
          console.log();
          console.log(chalk.dim(`This agent works on tasks with status: ${agent.allowedStatuses.join(', ')}`));
        } else {
          console.log(chalk.bold(`${count} task(s) ready for ${agent.name}:`));
          console.log();

          tasks.forEach((task, idx) => {
            console.log(
              chalk.cyan(`${idx + 1}. ${task.id}`) +
                chalk.dim(' - ') +
                task.title +
                chalk.yellow(` [${task.status}]`)
            );
            if (task.assignee) {
              console.log(chalk.dim(`   Assignee: ${task.assignee}`));
            }
          });

          console.log();
          console.log(chalk.dim(`Available tools: ${agent.capabilities.join(', ')}`));
        }

        console.log();
      } catch (error) {
        logger.error(`Failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });
}

function createAgentInfoCommand() {
  return new Command('agents')
    .description('Show information about all agents')
    .action(async () => {
      logger.title('Multi-Agent Development Workflow');
      console.log();

      Object.values(AGENTS).forEach((agent) => {
        console.log(chalk.bold.cyan(agent.name));
        console.log(chalk.dim(agent.description));
        console.log();
        console.log(chalk.yellow('Works on:'), agent.allowedStatuses.join(', '));
        console.log(chalk.green('Transitions to:'), agent.nextStatuses.join(', ') || 'N/A');
        console.log(chalk.blue('Tools:'), agent.capabilities.slice(0, 3).join(', '), '...');
        console.log();
      });
    });
}

function createShowFlowCommand() {
  return new Command('flow')
    .description('Show the workflow flow diagram')
    .action(async () => {
      logger.title('Development Workflow');
      console.log();

      console.log(chalk.bold('1. Creating Work'));
      console.log(chalk.dim('   ├─ Manual: Create tasks via CLI'));
      console.log(chalk.dim('   └─ Planning Agent: Generate tasks from specs'));
      console.log(chalk.yellow('        ↓'));
      console.log(chalk.cyan('      [Ready for Architecture Review]'));
      console.log();

      console.log(chalk.bold('2. Architecture Review'));
      console.log(chalk.dim('   Architect Agent reviews against:'));
      console.log(chalk.dim('   ├─ Architecture rules'));
      console.log(chalk.dim('   ├─ System constraints'));
      console.log(chalk.dim('   └─ Existing patterns'));
      console.log(chalk.yellow('        ↓'));
      console.log(chalk.green('      [Approved] → Ready for Coding'));
      console.log(chalk.red('      [Rejected] → Needs Planning Update'));
      console.log();

      console.log(chalk.bold('3. Implementation'));
      console.log(chalk.dim('   Coding Agent:'));
      console.log(chalk.dim('   ├─ Creates feature branch'));
      console.log(chalk.dim('   ├─ Implements changes'));
      console.log(chalk.dim('   ├─ Writes tests'));
      console.log(chalk.dim('   └─ Commits code'));
      console.log(chalk.yellow('        ↓'));
      console.log(chalk.cyan('      [Ready for Code Review]'));
      console.log();

      console.log(chalk.bold('4. Code Review'));
      console.log(chalk.dim('   Code Review Agent checks:'));
      console.log(chalk.dim('   ├─ Correctness'));
      console.log(chalk.dim('   ├─ Security'));
      console.log(chalk.dim('   ├─ Technical debt'));
      console.log(chalk.dim('   └─ Tests and docs'));
      console.log(chalk.yellow('        ↓'));
      console.log(chalk.green('      [Approved] → Done'));
      console.log(chalk.red('      [Changes Needed] → In Progress'));
      console.log();

      console.log(chalk.bold('5. Git Flow'));
      console.log(chalk.dim('   Git Manager:'));
      console.log(chalk.dim('   ├─ Manages branches'));
      console.log(chalk.dim('   ├─ Ensures clean commits'));
      console.log(chalk.dim('   └─ Helps open PRs'));
      console.log();

      console.log(chalk.dim.italic('Use `sdd workflow queue <agent>` to see work queues'));
      console.log();
    });
}
