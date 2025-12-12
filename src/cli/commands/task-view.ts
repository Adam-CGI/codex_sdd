/**
 * Task view command
 */

import { logger } from '../utils/logger.js';
import { requireProjectRoot } from '../utils/find-root.js';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';
import chalk from 'chalk';

interface TaskViewOptions {
  plain?: boolean;
}

export async function taskViewCommand(id: string, options: TaskViewOptions) {
  const root = requireProjectRoot();

  try {
    // Parse task ID
    const taskId = id.startsWith('task-') ? parseInt(id.substring(5)) : parseInt(id);

    // Find task file
    const backlogPath = join(root, 'backlog');
    const files = readdirSync(backlogPath);
    const taskFile = files.find((f) => f.startsWith(`task-${String(taskId).padStart(3, '0')}`));

    if (!taskFile) {
      logger.error(`Task ${id} not found`);
      process.exit(1);
    }

    const content = readFileSync(join(backlogPath, taskFile), 'utf-8');
    const parsed = matter(content);
    const meta = parsed.data;

    if (options.plain) {
      // Plain output for AI
      console.log(`Task: task-${taskId}`);
      console.log(`Title: ${meta.title}`);
      console.log(`Status: ${meta.status}`);
      if (meta.assignee) console.log(`Assignee: ${meta.assignee}`);
      if (meta.labels) console.log(`Labels: ${meta.labels.join(', ')}`);
      if (meta.priority) console.log(`Priority: ${meta.priority}`);
      if (meta.parent) console.log(`Parent: ${meta.parent}`);
      if (meta.dependencies) console.log(`Dependencies: ${meta.dependencies.join(', ')}`);
      console.log();
      console.log(parsed.content);
    } else {
      // Rich output
      console.log();
      logger.title(`📋 Task ${taskId}: ${meta.title}`);
      console.log();
      
      console.log(chalk.bold('Status:'), colorStatus(meta.status));
      if (meta.assignee) console.log(chalk.bold('Assignee:'), meta.assignee);
      if (meta.labels && meta.labels.length > 0) {
        console.log(chalk.bold('Labels:'), meta.labels.join(', '));
      }
      if (meta.priority) console.log(chalk.bold('Priority:'), colorPriority(meta.priority));
      if (meta.parent) console.log(chalk.bold('Parent:'), meta.parent);
      if (meta.dependencies && meta.dependencies.length > 0) {
        console.log(chalk.bold('Dependencies:'), meta.dependencies.join(', '));
      }
      
      console.log(chalk.bold('Created:'), new Date(meta.created).toLocaleString());
      console.log(chalk.bold('Updated:'), new Date(meta.updated).toLocaleString());
      
      console.log();
      console.log(chalk.bold.underline('Content:'));
      console.log();
      console.log(parsed.content);
      
      console.log();
      logger.dim(`File: ${taskFile}`);
    }
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function colorStatus(status: string): string {
  switch (status) {
    case 'Done':
      return chalk.green(status);
    case 'In Progress':
      return chalk.yellow(status);
    case 'In Review':
      return chalk.blue(status);
    case 'Backlog':
      return chalk.gray(status);
    default:
      return status;
  }
}

function colorPriority(priority: string): string {
  switch (priority.toLowerCase()) {
    case 'high':
      return chalk.red(priority);
    case 'medium':
      return chalk.yellow(priority);
    case 'low':
      return chalk.green(priority);
    default:
      return priority;
  }
}
