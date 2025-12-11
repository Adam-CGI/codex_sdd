/**
 * MCP Kanban Spec-Driven Development Server
 *
 * Entrypoint that registers all MCP tools and starts the stdio server.
 */

import { tasksMove } from './tasks/move.js';
import { planningCreateSpec } from './planning/create-spec.js';
import { tasksUpdate } from './tasks/update.js';

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
toolRegistry.set(tasksUpdate.name, tasksUpdate.handler);

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
  console.log('MCP Kanban Server starting...');
  console.log(`Registered tools: ${getRegisteredTools().length}`);
}

main().catch(console.error);
