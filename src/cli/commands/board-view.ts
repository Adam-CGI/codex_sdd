/**
 * Board view command - displays Kanban board in terminal
 */

import { logger } from '../utils/logger.js';
import { requireProjectRoot } from '../utils/find-root.js';
import { getBoard, type BoardTaskSummary } from '../../kanban/board-service.js';
import { loadConfig } from '../../config/config-loader.js';
import chalk from 'chalk';
import Table from 'cli-table3';

export async function boardViewCommand() {
  const root = requireProjectRoot();

  try {
    logger.title('📊 Kanban Board');
    console.log();

    // Get board data
    const result = await getBoard({ baseDir: root });
    
    // Load config to get status columns
    const { config } = await loadConfig(root);

    // Group tasks by column
    const tasksByColumn = new Map<string, BoardTaskSummary[]>();
    for (const status of config.statuses) {
      tasksByColumn.set(status, []);
    }

    for (const task of result.tasks) {
      const column = task.status || 'Unknown';
      if (!tasksByColumn.has(column)) {
        tasksByColumn.set(column, []);
      }
      tasksByColumn.get(column)!.push(task);
    }

    // Create a table for each status column
    const table = new Table({
      head: config.statuses.map((status: string) => chalk.bold(status)),
      style: {
        head: [],
        border: ['gray'],
      },
      colWidths: config.statuses.map(() => 40),
    });

    // Find max tasks in any column
    const maxTasks = Math.max(...Array.from(tasksByColumn.values()).map((tasks) => tasks.length), 0);

    // Build rows
    for (let i = 0; i < maxTasks; i++) {
      const row: string[] = [];
      for (const status of config.statuses) {
        const tasks = tasksByColumn.get(status) || [];
        if (i < tasks.length) {
          const task = tasks[i];
          let cell = `${chalk.cyan(`#${task.id}`)} ${task.meta.title || ''}`;
          
          if (task.assignee) {
            cell += `\n${chalk.dim(task.assignee)}`;
          }
          
          if (task.meta.labels && task.meta.labels.length > 0) {
            cell += `\n${chalk.yellow(task.meta.labels.join(', '))}`;
          }
          
          row.push(cell);
        } else {
          row.push('');
        }
      }
      table.push(row);
    }

    console.log(table.toString());
    console.log();

    // Summary
    logger.dim(`Total tasks: ${result.total_tasks}`);

    // Stats by column
    console.log();
    for (const status of config.statuses) {
      const count = tasksByColumn.get(status)?.length || 0;
      logger.info(`${status}: ${count} task${count === 1 ? '' : 's'}`);
    }

    if (result.warnings.length > 0) {
      console.log();
      logger.warning(`${result.warnings.length} warning(s) encountered`);
    }
    
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
