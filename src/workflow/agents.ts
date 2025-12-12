/**
 * Agent definitions and role-based workflow coordination
 * 
 * This module defines the multi-agent system that drives the development workflow:
 * - Planning Agent: Creates specs and breaks them into tasks
 * - Architect Agent: Reviews tasks for architectural compliance
 * - Coding Agent: Implements tasks
 * - Code Review Agent: Reviews code quality
 * - Git Manager: Handles git operations
 */

import { Errors, wrapWithErrorHandling } from '../shared/errors.js';
import { getTaskById } from '../backlog/task-store.js';

export type AgentRole = 'planning' | 'architect' | 'coding' | 'review' | 'git_manager';

export interface Agent {
  role: AgentRole;
  name: string;
  description: string;
  capabilities: string[];
  allowedStatuses: string[];
  nextStatuses: string[];
}

export const AGENTS: Record<AgentRole, Agent> = {
  planning: {
    role: 'planning',
    name: 'Planning Agent',
    description: 'Creates feature specs and breaks them down into tasks',
    capabilities: [
      'planning_create_spec',
      'planning_breakdown_spec',
      'planning_update_spec',
      'planning_rebuild_index',
    ],
    allowedStatuses: ['Backlog', 'Needs Planning Update'],
    nextStatuses: ['Ready for Architecture Review'],
  },
  architect: {
    role: 'architect',
    name: 'Architect Agent',
    description: 'Reviews tasks against architecture rules and patterns',
    capabilities: [
      'arch_validate_spec',
      'arch_annotate_spec_and_tasks',
      'tasks_update',
    ],
    allowedStatuses: ['Ready for Architecture Review'],
    nextStatuses: ['Ready for Coding', 'Needs Planning Update'],
  },
  coding: {
    role: 'coding',
    name: 'Coding Agent',
    description: 'Implements tasks, writes code and tests',
    capabilities: [
      'coding_start_task',
      'coding_suggest_next_step',
      'coding_update_task_status',
      'git_status',
      'git_create_branch',
      'git_stage_and_commit',
    ],
    allowedStatuses: ['Ready for Coding', 'In Progress'],
    nextStatuses: ['Ready for Code Review'],
  },
  review: {
    role: 'review',
    name: 'Code Review Agent',
    description: 'Reviews code for quality, security, and compliance',
    capabilities: [
      'review_analyze_diff',
      'review_write_review_doc',
      'review_summarize_task_reviews',
      'tasks_update',
    ],
    allowedStatuses: ['Ready for Code Review'],
    nextStatuses: ['Done', 'In Progress'],
  },
  git_manager: {
    role: 'git_manager',
    name: 'Git Manager',
    description: 'Manages git operations, branches, and PRs',
    capabilities: [
      'git_status',
      'git_create_branch',
      'git_stage_and_commit',
      'git_push',
      'git_open_pr',
    ],
    allowedStatuses: ['In Progress', 'Ready for Code Review', 'Done'],
    nextStatuses: [],
  },
};

export interface GetAgentContextParams {
  agentRole: AgentRole;
  taskId?: string;
}

export interface GetAgentContextOptions {
  baseDir?: string;
}

export interface AgentContext {
  agent: Agent;
  canActOnTask: boolean;
  task?: {
    id: string;
    status: string;
    title: string;
  };
  availableTools: string[];
  nextActions: string[];
}

/**
 * Get context for a specific agent, optionally scoped to a task
 */
export async function getAgentContext(
  params: GetAgentContextParams,
  options: GetAgentContextOptions = {}
): Promise<AgentContext> {
  const baseDir = options.baseDir ?? process.cwd();
  const { agentRole, taskId } = params;

  const agent = AGENTS[agentRole];
  if (!agent) {
    throw Errors.configInvalid(`Unknown agent role: ${agentRole}`);
  }

  let canActOnTask = false;
  let task: AgentContext['task'];
  let nextActions: string[] = [];

  if (taskId) {
    const taskDoc = await getTaskById(taskId, { baseDir });
    task = {
      id: taskDoc.meta.id,
      status: taskDoc.meta.status ?? 'Backlog',
      title: taskDoc.title ?? taskDoc.meta.title ?? 'Untitled',
    };

    // Check if agent can act on this task based on its status
    canActOnTask = agent.allowedStatuses.includes(task.status);

    if (canActOnTask && task) {
      // Determine next actions based on agent role and task status
      nextActions = determineNextActions(agent, task.status);
    }
  }

  return {
    agent,
    canActOnTask,
    task,
    availableTools: agent.capabilities,
    nextActions,
  };
}

function determineNextActions(agent: Agent, currentStatus: string): string[] {
  const actions: string[] = [];

  switch (agent.role) {
    case 'planning':
      if (currentStatus === 'Backlog') {
        actions.push('Create or update spec', 'Move to Ready for Architecture Review');
      } else if (currentStatus === 'Needs Planning Update') {
        actions.push('Update spec based on architect feedback', 'Move back to Ready for Architecture Review');
      }
      break;

    case 'architect':
      if (currentStatus === 'Ready for Architecture Review') {
        actions.push(
          'Validate spec against architecture rules',
          'Approve and move to Ready for Coding',
          'Reject and move to Needs Planning Update with feedback'
        );
      }
      break;

    case 'coding':
      if (currentStatus === 'Ready for Coding') {
        actions.push('Start task (creates branch)', 'Move to In Progress');
      } else if (currentStatus === 'In Progress') {
        actions.push(
          'Implement changes',
          'Run tests',
          'Commit code',
          'Move to Ready for Code Review'
        );
      }
      break;

    case 'review':
      if (currentStatus === 'Ready for Code Review') {
        actions.push(
          'Analyze git diff',
          'Write review document',
          'Approve and move to Done',
          'Request changes and move back to In Progress'
        );
      }
      break;

    case 'git_manager':
      actions.push('Create branch', 'Push changes', 'Open PR');
      break;
  }

  return actions;
}

export interface QueryWorkQueueParams {
  agentRole: AgentRole;
  limit?: number;
}

export interface QueryWorkQueueOptions {
  baseDir?: string;
}

export interface WorkQueueResult {
  agent: Agent;
  tasks: Array<{
    id: string;
    status: string;
    title: string;
    priority?: string;
    assignee?: string;
  }>;
  count: number;
}

/**
 * Query tasks that are ready for a specific agent to work on
 */
export async function queryWorkQueue(
  params: QueryWorkQueueParams,
  _options: QueryWorkQueueOptions = {}
): Promise<WorkQueueResult> {
  const { agentRole, limit = 10 } = params;

  const agent = AGENTS[agentRole];
  if (!agent) {
    throw Errors.configInvalid(`Unknown agent role: ${agentRole}`);
  }

  // Import dynamically to avoid circular dependencies
  const { tasksSearch } = await import('../tasks/search.js');

  const result = await tasksSearch.handler({
    status: agent.allowedStatuses,
  });

  // unwrap the Result type
  if ('error' in result) {
    throw new Error(result.error.message);
  }

  const searchResults = result.data.results;
  const limitedTasks = searchResults.slice(0, limit);

  return {
    agent,
    tasks: limitedTasks.map((t) => ({
      id: t.id,
      status: t.status ?? 'Unknown',
      title: t.title ?? 'Untitled',
      priority: undefined,
      assignee: t.assignee,
    })),
    count: searchResults.length,
  };
}

// MCP tool wrappers
export const agentGetContext = {
  name: 'agent_get_context',
  handler: async (params: { agent_role?: AgentRole; role?: AgentRole; task_id?: string }) => {
    const agentRole = params.agent_role ?? params.role;
    if (!agentRole) {
      return { error: { code: 'VALIDATION_FAILED', message: 'Missing required parameter: agent_role' } };
    }
    return wrapWithErrorHandling(() =>
      getAgentContext({
        agentRole,
        taskId: params.task_id,
      })
    );
  },
};

export const agentQueryWorkQueue = {
  name: 'agent_query_work_queue',
  handler: async (params: { agent_role?: AgentRole; role?: AgentRole; limit?: number }) => {
    const agentRole = params.agent_role ?? params.role;
    if (!agentRole) {
      return { error: { code: 'VALIDATION_FAILED', message: 'Missing required parameter: agent_role' } };
    }
    return wrapWithErrorHandling(() =>
      queryWorkQueue({
        agentRole,
        limit: params.limit,
      })
    );
  },
};
