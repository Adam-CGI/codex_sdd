/**
 * MCP Kanban Spec-Driven Development Server
 *
 * Entrypoint that registers all MCP tools and starts the stdio server.
 */

import { tasksMove } from './tasks/move.js';
import { planningCreateSpec } from './planning/create-spec.js';
import { planningBreakdownSpec } from './planning/breakdown-spec.js';
import { planningRebuildIndex } from './planning/rebuild-index.js';
import { tasksUpdate } from './tasks/update.js';
import { archValidateSpec, archAnnotateSpecAndTasks } from './arch/rules-store.js';
import { codingStartTask } from './coding/start-task.js';
import { codingSuggestNextStep } from './coding/suggest-next-step.js';
import { codingUpdateTaskStatus } from './coding/update-task-status.js';
import { logger, initRateLimiter, metrics } from './observability/index.js';

// Tool registry - will be populated as tools are implemented
const toolRegistry = new Map<string, unknown>();

// Register placeholder tools
const tools = [
  'kanban.get_board',
  'tasks.get',
  'tasks.update',
  'tasks.move',
  'tasks.search',
  'planning.create_spec',
  'planning.breakdown_spec',
  'planning.update_spec',
  'planning.rebuild_index',
  'arch.validate_spec',
  'arch.annotate_spec_and_tasks',
  'coding.start_task',
  'coding.suggest_next_step',
  'coding.update_task_status',
  'review.analyze_diff',
  'review.write_review_doc',
  'review.summarize_task_reviews',
  'git.status',
  'git.create_branch',
  'git.stage_and_commit',
  'git.push',
  'git.open_pr',
];

for (const tool of tools) {
  toolRegistry.set(tool, null);
}

// Register implemented tools
toolRegistry.set(tasksMove.name, tasksMove.handler);
toolRegistry.set(planningCreateSpec.name, planningCreateSpec.handler);
toolRegistry.set(planningBreakdownSpec.name, planningBreakdownSpec.handler);
toolRegistry.set(planningRebuildIndex.name, planningRebuildIndex.handler);
toolRegistry.set(tasksUpdate.name, tasksUpdate.handler);
toolRegistry.set(archValidateSpec.name, archValidateSpec.handler);
toolRegistry.set(archAnnotateSpecAndTasks.name, archAnnotateSpecAndTasks.handler);
toolRegistry.set(codingStartTask.name, codingStartTask.handler);
toolRegistry.set(codingSuggestNextStep.name, codingSuggestNextStep.handler);
toolRegistry.set(codingUpdateTaskStatus.name, codingUpdateTaskStatus.handler);

export function getRegisteredTools(): string[] {
  return Array.from(toolRegistry.keys());
}

export function registerTool(name: string, handler: unknown): void {
  toolRegistry.set(name, handler);
}

export function getTool(name: string): unknown {
  return toolRegistry.get(name);
}

// Main entry point - will start MCP stdio server when fully implemented
async function main(): Promise<void> {
  // Initialize observability
  initRateLimiter();

  logger.info('MCP Kanban Server starting...');
  logger.info({ toolCount: getRegisteredTools().length }, `Registered tools: ${getRegisteredTools().length}`);

  // Log metrics summary on shutdown
  process.on('SIGINT', () => {
    logger.info('Shutting down...');
    metrics.logSummary();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.info('Shutting down...');
    metrics.logSummary();
    process.exit(0);
  });
}

main().catch((error) => {
  logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Fatal error');
  process.exit(1);
});
