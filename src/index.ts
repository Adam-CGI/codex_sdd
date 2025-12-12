/**
 * MCP Kanban Spec-Driven Development Server
 *
 * Entrypoint that registers all MCP tools and starts the stdio server.
 */

import { tasksMove } from './tasks/move.js';
import { planningCreateSpec } from './planning/create-spec.js';
import { planningBreakdownSpec } from './planning/breakdown-spec.js';
import { planningRebuildIndex } from './planning/rebuild-index.js';
import { planningUpdateSpec } from './planning/update-spec.js';
import { tasksUpdate } from './tasks/update.js';
import { tasksGet } from './tasks/get.js';
import { tasksSearch } from './tasks/search.js';
import { archValidateSpec, archAnnotateSpecAndTasks } from './arch/rules-store.js';
import { kanbanGetBoard } from './kanban/get-board.js';
import { codingStartTask } from './coding/start-task.js';
import { codingSuggestNextStep } from './coding/suggest-next-step.js';
import { codingUpdateTaskStatus } from './coding/update-task-status.js';
import {
  reviewAnalyzeDiff,
  reviewWriteReviewDoc,
  reviewSummarizeTaskReviews,
} from './review/review-service.js';
import {
  gitStatusTool,
  gitCreateBranchTool,
  gitStageAndCommitTool,
  gitPushTool,
  gitOpenPrTool,
} from './git/git-tools.js';
import { agentGetContext, agentQueryWorkQueue } from './workflow/agents.js';
import {
  workflowArchitectureReview,
  workflowStartCoding,
  workflowSubmitForReview,
  workflowCodeReview,
} from './workflow/automation.js';
import { logger, initRateLimiter, metrics } from './observability/index.js';

// Helper to ensure MCP tool names follow the allowed pattern ^[a-zA-Z0-9_-]+$
function sanitizeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

type ToolEntry = {
  originalName: string;
  handler: unknown;
};

// Tool registry keyed by sanitized tool name
const toolRegistry = new Map<string, ToolEntry>();

// Register placeholder tools
const tools = [
  'kanban_get_board',
  'tasks_get',
  'tasks_update',
  'tasks_move',
  'tasks_search',
  'planning_create_spec',
  'planning_breakdown_spec',
  'planning_update_spec',
  'planning_rebuild_index',
  'arch_validate_spec',
  'arch_annotate_spec_and_tasks',
  'coding_start_task',
  'coding_suggest_next_step',
  'coding_update_task_status',
  'review_analyze_diff',
  'review_write_review_doc',
  'review_summarize_task_reviews',
  'git_status',
  'git_create_branch',
  'git_stage_and_commit',
  'git_push',
  'git_open_pr',
  'agent_get_context',
  'agent_query_work_queue',
  'workflow_architecture_review',
  'workflow_start_coding',
  'workflow_submit_for_review',
  'workflow_code_review',
];

// Pre-register placeholders (ensures they appear in lists even before handlers wired)
for (const tool of tools) {
  registerTool(tool, null);
}

// Register implemented tools
registerTool(tasksMove.name, tasksMove.handler);
registerTool(planningCreateSpec.name, planningCreateSpec.handler);
registerTool(planningBreakdownSpec.name, planningBreakdownSpec.handler);
registerTool(planningRebuildIndex.name, planningRebuildIndex.handler);
registerTool(planningUpdateSpec.name, planningUpdateSpec.handler);
registerTool(tasksUpdate.name, tasksUpdate.handler);
registerTool(tasksGet.name, tasksGet.handler);
registerTool(tasksSearch.name, tasksSearch.handler);
registerTool(kanbanGetBoard.name, kanbanGetBoard.handler);
registerTool(archValidateSpec.name, archValidateSpec.handler);
registerTool(archAnnotateSpecAndTasks.name, archAnnotateSpecAndTasks.handler);
registerTool(codingStartTask.name, codingStartTask.handler);
registerTool(codingSuggestNextStep.name, codingSuggestNextStep.handler);
registerTool(codingUpdateTaskStatus.name, codingUpdateTaskStatus.handler);
registerTool(reviewAnalyzeDiff.name, reviewAnalyzeDiff.handler);
registerTool(reviewWriteReviewDoc.name, reviewWriteReviewDoc.handler);
registerTool(reviewSummarizeTaskReviews.name, reviewSummarizeTaskReviews.handler);
registerTool(gitStatusTool.name, gitStatusTool.handler);
registerTool(gitCreateBranchTool.name, gitCreateBranchTool.handler);
registerTool(gitStageAndCommitTool.name, gitStageAndCommitTool.handler);
registerTool(gitPushTool.name, gitPushTool.handler);
registerTool(gitOpenPrTool.name, gitOpenPrTool.handler);
registerTool(agentGetContext.name, agentGetContext.handler);
registerTool(agentQueryWorkQueue.name, agentQueryWorkQueue.handler);
registerTool(workflowArchitectureReview.name, workflowArchitectureReview.handler);
registerTool(workflowStartCoding.name, workflowStartCoding.handler);
registerTool(workflowSubmitForReview.name, workflowSubmitForReview.handler);
registerTool(workflowCodeReview.name, workflowCodeReview.handler);

export function getRegisteredTools(): Array<{ name: string; originalName: string }> {
  return Array.from(toolRegistry.entries()).map(([name, entry]) => ({
    name,
    originalName: entry.originalName,
  }));
}

export function registerTool(name: string, handler: unknown): void {
  const sanitized = sanitizeToolName(name);
  toolRegistry.set(sanitized, { originalName: name, handler });
}

export function getTool(name: string): unknown {
  const direct = toolRegistry.get(name);
  if (direct) return direct.handler;
  const sanitized = sanitizeToolName(name);
  return toolRegistry.get(sanitized)?.handler;
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
