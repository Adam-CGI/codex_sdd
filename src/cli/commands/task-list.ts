/**
 * Task list command
 */

import { logger } from '../utils/logger.js';
import { requireProjectRoot } from '../utils/find-root.js';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';
import Table from 'cli-table3';
import chalk from 'chalk';

interface TaskListOptions {
  status?: string;
  assignee?: string;
  parent?: string;
  labels?: string;
  priority?: string;
  plain?: boolean;
}

export async function taskListCommand(options: TaskListOptions) {
  const root = requireProjectRoot();

  try {
    const backlogPath = join(root, 'backlog');
    const files = readdirSync(backlogPath)
      .filter((f) => f.startsWith('task-') && f.endsWith('.md'))
      .sort();

    const tasks: Array<{
      id: number;
      title: string;
      status: string;
      assignee?: string;
      labels?: string[];
      priority?: string;
      parent?: string;
    }> = [];

    for (const file of files) {
      const content = readFileSync(join(backlogPath, file), 'utf-8');
      const parsed = matter(content);
      const meta = parsed.data;

      // Extract title from filename if not in frontmatter
      const title = meta.title || file.replace(/^task-\d+\s*-\s*/, '').replace(/\.md$/, '');

      // Apply filters
      if (options.status && meta.status !== options.status) continue;
      if (options.assignee && meta.assignee !== options.assignee) continue;
      if (options.parent && meta.parent !== options.parent) continue;
      if (options.priority && meta.priority !== options.priority) continue;
      if (options.labels) {
        const filterLabels = options.labels.split(',').map(l => l.trim());
        const taskLabels = Array.isArray(meta.labels) ? meta.labels : [];
        const hasLabel = filterLabels.some(fl => taskLabels.includes(fl));
        if (!hasLabel) continue;
      }

      tasks.push({
        id: meta.id || file.match(/task-(\d+)/)?.[1],
        title,
        status: meta.status || 'Unknown',
        assignee: meta.assignee,
        labels: Array.isArray(meta.labels) ? meta.labels : undefined,
        priority: meta.priority,
        parent: meta.parent,
      });
    }

    if (tasks.length === 0) {
      logger.info('No tasks found matching the criteria');
      return;
    }

    // Plain output for AI/scripts
    if (options.plain) {
      for (const task of tasks) {
        console.log(`task-${task.id}: ${task.title} [${task.status}]${task.assignee ? ` @${task.assignee}` : ''}`);
      }
      return;
    }

    // Table output
    const table = new Table({
      head: ['ID', 'Title', 'Status', 'Assignee', 'Labels', 'Priority'],
      style: {
        head: ['cyan'],
      },
    });

    for (const task of tasks) {
      table.push([
        `task-${task.id}`,
        task.title.length > 40 ? task.title.substring(0, 37) + '...' : task.title,
        colorStatus(task.status),
        task.assignee || '-',
        Array.isArray(task.labels) && task.labels.length > 0 ? task.labels.join(', ') : '-',
        task.priority ? colorPriority(task.priority) : '-',
      ]);
    }

    console.log(table.toString());
    console.log();
    logger.dim(`Total: ${tasks.length} task${tasks.length === 1 ? '' : 's'}`);
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
