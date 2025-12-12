/**
 * Workflow automation helpers
 * 
 * Provides high-level functions that orchestrate common multi-step workflows
 * across agents, automating the flow from planning → architecture → coding → review
 */

import { Errors, wrapWithErrorHandling, McpError, ErrorCode } from '../shared/errors.js';
import { getTaskById } from '../backlog/task-store.js';
import { updateTask } from '../backlog/task-update.js';
import { moveTask } from '../backlog/task-move.js';

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'task'
  );
}

export interface WorkflowOptions {
  baseDir?: string;
  callerId?: string;
}

export interface ArchitectureReviewParams {
  taskId: string;
  approve: boolean;
  notes?: string;
}

export interface ArchitectureReviewResult {
  task_id: string;
  approved: boolean;
  new_status: string;
  notes?: string;
}

/**
 * Architect Agent: Review a task and approve or reject it
 */
export async function architectureReview(
  params: ArchitectureReviewParams,
  options: WorkflowOptions = {}
): Promise<ArchitectureReviewResult> {
  const baseDir = options.baseDir ?? process.cwd();
  const { taskId, approve, notes } = params;

  // Validate task is in correct status
  const task = await getTaskById(taskId, { baseDir });
  
  if (task.meta.status !== 'Ready for Architecture Review') {
    throw Errors.gateViolation(
      taskId,
      task.meta.status ?? 'Unknown'
    );
  }

  const newStatus = approve ? 'Ready for Coding' : 'Needs Planning Update';

  // Move task to appropriate next status
  await moveTask(
    {
      taskId,
      toStatus: newStatus,
      version: task.meta.version,
      force: false,
    },
    { baseDir, callerId: options.callerId }
  );

  // Add notes if provided
  if (notes) {
    const updatedTask = await getTaskById(taskId, { baseDir });
    const existingNotes = updatedTask.sections.Notes || '';
    const timestamp = new Date().toISOString();
    const reviewNotes = `\n\n## Architecture Review (${timestamp})\n\n${notes}`;
    
    await updateTask(
      {
        taskId,
        version: updatedTask.meta.version,
        sections: {
          Notes: existingNotes + reviewNotes,
        },
      },
      { baseDir, callerId: options.callerId }
    );
  }

  return {
    task_id: taskId,
    approved: approve,
    new_status: newStatus,
    notes,
  };
}

export interface StartCodingParams {
  taskId: string;
  createBranch?: boolean;
  branchName?: string;
  dryRun?: boolean;
  protectedBranches?: string[];
  allowProtected?: boolean;
}

export interface StartCodingResult {
  task_id: string;
  status: string;
  branch?: string;
}

/**
 * Coding Agent: Start working on a task
 */
export async function startCoding(
  params: StartCodingParams,
  options: WorkflowOptions = {}
): Promise<StartCodingResult> {
  const baseDir = options.baseDir ?? process.cwd();
  const { taskId, createBranch = true } = params;

  const task = await getTaskById(taskId, { baseDir });

  if (task.meta.status !== 'Ready for Coding' && task.meta.status !== 'In Progress') {
    throw Errors.gateViolation(
      taskId,
      task.meta.status ?? 'Unknown'
    );
  }

  // Move to In Progress if not already
  if (task.meta.status !== 'In Progress') {
    await moveTask(
      {
        taskId,
        toStatus: 'In Progress',
        version: task.meta.version,
        force: false,
      },
      { baseDir, callerId: options.callerId }
    );
  }

  let branchName: string | undefined;
  if (createBranch) {
    // Import git tools dynamically
    const { gitCreateBranchTool } = await import('../git/git-tools.js');
    const slug = slugify(task.title ?? task.meta.id ?? 'task');
    branchName = params.branchName || `feature/${taskId}-${slug}`;
    
    const branchResult = await gitCreateBranchTool.handler({
      branch_name: branchName,
      task_id: taskId,
      dry_run: params.dryRun,
      protected_branches: params.protectedBranches,
      allow_protected: params.allowProtected,
    });

    if (branchResult && typeof branchResult === 'object' && 'error' in branchResult) {
      const err = branchResult.error as { code?: ErrorCode; message?: string; data?: unknown };
      throw new McpError(
        err.code ?? ErrorCode.CONFIG_INVALID,
        err.message ?? 'Branch creation failed',
        err.data
      );
    }

    // Update task with branch info
    const updatedTask = await getTaskById(taskId, { baseDir });
    await updateTask(
      {
        taskId,
        version: updatedTask.meta.version,
        meta: {
          branch: branchName,
        },
      },
      { baseDir, callerId: options.callerId }
    );
  }

  return {
    task_id: taskId,
    status: 'In Progress',
    branch: branchName,
  };
}

export interface SubmitForReviewParams {
  taskId: string;
  commitMessage?: string;
}

export interface SubmitForReviewResult {
  task_id: string;
  status: string;
  committed: boolean;
}

/**
 * Coding Agent: Submit task for code review
 */
export async function submitForReview(
  params: SubmitForReviewParams,
  options: WorkflowOptions = {}
): Promise<SubmitForReviewResult> {
  const baseDir = options.baseDir ?? process.cwd();
  const { taskId, commitMessage } = params;

  const task = await getTaskById(taskId, { baseDir });

  if (task.meta.status !== 'In Progress') {
    throw Errors.gateViolation(
      taskId,
      task.meta.status ?? 'Unknown'
    );
  }

  let committed = false;

  // Commit changes if message provided
  if (commitMessage) {
    const { gitStageAndCommitTool } = await import('../git/git-tools.js');
    await gitStageAndCommitTool.handler({
      task_id: taskId,
      summary: commitMessage,
    });
    committed = true;
  }

  // Move to Ready for Code Review
  await moveTask(
    {
      taskId,
      toStatus: 'Ready for Code Review',
      version: task.meta.version,
      force: false,
    },
    { baseDir, callerId: options.callerId }
  );

  return {
    task_id: taskId,
    status: 'Ready for Code Review',
    committed,
  };
}

export interface CodeReviewParams {
  taskId: string;
  approve: boolean;
  notes?: string;
  openPr?: boolean;
}

export interface CodeReviewResult {
  task_id: string;
  approved: boolean;
  new_status: string;
  pr_url?: string;
}

/**
 * Review Agent: Perform code review and approve or request changes
 */
export async function codeReview(
  params: CodeReviewParams,
  options: WorkflowOptions = {}
): Promise<CodeReviewResult> {
  const baseDir = options.baseDir ?? process.cwd();
  const { taskId, approve, notes, openPr = false } = params;

  const task = await getTaskById(taskId, { baseDir });

  if (task.meta.status !== 'Ready for Code Review') {
    throw Errors.gateViolation(
      taskId,
      task.meta.status ?? 'Unknown'
    );
  }

  const newStatus = approve ? 'Done' : 'In Progress';

  // Move task to appropriate status
  await moveTask(
    {
      taskId,
      toStatus: newStatus,
      version: task.meta.version,
      force: false,
    },
    { baseDir, callerId: options.callerId }
  );

  // Add review notes
  if (notes) {
    const updatedTask = await getTaskById(taskId, { baseDir });
    const existingNotes = updatedTask.sections.Notes || '';
    const timestamp = new Date().toISOString();
    const reviewNotes = `\n\n## Code Review (${timestamp})\n\n${approve ? '✅ Approved' : '🔄 Changes Requested'}\n\n${notes}`;
    
    await updateTask(
      {
        taskId,
        version: updatedTask.meta.version,
        sections: {
          Notes: existingNotes + reviewNotes,
        },
      },
      { baseDir, callerId: options.callerId }
    );
  }

  let prUrl: string | undefined;

  // Open PR if approved and requested
  if (approve && openPr && task.meta.branch) {
    const { gitOpenPrTool } = await import('../git/git-tools.js');
    const result = await gitOpenPrTool.handler({
      branch: task.meta.branch as string,
    });

    // PR URL would come from the git provider integration
    // For now, we just record that PR was requested
    if (!('error' in result)) {
      prUrl = `PR requested for branch: ${task.meta.branch}`;

      // Update task with PR note
      const finalTask = await getTaskById(taskId, { baseDir });
      await updateTask(
        {
          taskId,
          version: finalTask.meta.version,
          meta: {
            pr_url: prUrl,
          },
        },
        { baseDir, callerId: options.callerId }
      );
    }
  }

  return {
    task_id: taskId,
    approved: approve,
    new_status: newStatus,
    pr_url: prUrl,
  };
}

// MCP tool wrappers
export const workflowArchitectureReview = {
  name: 'workflow_architecture_review',
  handler: async (params: { task_id: string; approve: boolean; notes?: string }) =>
    wrapWithErrorHandling(() =>
      architectureReview({
        taskId: params.task_id,
        approve: params.approve,
        notes: params.notes,
      })
    ),
};

export const workflowStartCoding = {
  name: 'workflow_start_coding',
  handler: async (params: {
    task_id: string;
    create_branch?: boolean;
    branch_name?: string;
    dry_run?: boolean;
    protected_branches?: string[];
    allow_protected?: boolean;
  }) =>
    wrapWithErrorHandling(() =>
      startCoding({
        taskId: params.task_id,
        createBranch: params.create_branch,
        branchName: params.branch_name,
        dryRun: params.dry_run,
        protectedBranches: params.protected_branches,
        allowProtected: params.allow_protected,
      })
    ),
};

export const workflowSubmitForReview = {
  name: 'workflow_submit_for_review',
  handler: async (params: { task_id: string; commit_message?: string }) =>
    wrapWithErrorHandling(() =>
      submitForReview({
        taskId: params.task_id,
        commitMessage: params.commit_message,
      })
    ),
};

export const workflowCodeReview = {
  name: 'workflow_code_review',
  handler: async (params: { task_id: string; approve: boolean; notes?: string; open_pr?: boolean }) =>
    wrapWithErrorHandling(() =>
      codeReview({
        taskId: params.task_id,
        approve: params.approve,
        notes: params.notes,
        openPr: params.open_pr,
      })
    ),
};
