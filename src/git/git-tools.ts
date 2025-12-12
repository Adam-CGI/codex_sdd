import { gitStatus, createBranch, stageAndCommit, push } from './git-service.js';
import { wrapWithErrorHandling } from '../shared/errors.js';

export const gitStatusTool = {
  name: 'git_status',
  handler: async () => wrapWithErrorHandling(() => gitStatus()),
};

export const gitCreateBranchTool = {
  name: 'git_create_branch',
  handler: async (params: {
    branch_name: string;
    base_ref?: string;
    task_id?: string;
    dry_run?: boolean;
    protected_branches?: string[];
    allow_protected?: boolean;
  }) =>
    wrapWithErrorHandling(() =>
      createBranch(
        {
          branch_name: params.branch_name,
          base_ref: params.base_ref,
          task_id: params.task_id,
          dry_run: params.dry_run,
          protected_branches: params.protected_branches,
          allow_protected: params.allow_protected,
        },
        { baseDir: process.cwd() },
      ),
    ),
};

export const gitStageAndCommitTool = {
  name: 'git_stage_and_commit',
  handler: async (params: { task_id: string; summary: string }) =>
    wrapWithErrorHandling(() =>
      stageAndCommit(
        {
          task_id: params.task_id,
          summary: params.summary,
        },
        { baseDir: process.cwd() },
      ),
    ),
};

export const gitPushTool = {
  name: 'git_push',
  handler: async (params: { remote?: string; branch?: string }) =>
    wrapWithErrorHandling(() =>
      push(
        {
          remote: params.remote,
          branch: params.branch,
        },
        { baseDir: process.cwd() },
      ),
    ),
};

export const gitOpenPrTool = {
  name: 'git_open_pr',
  handler: async (params: { branch?: string; remote?: string }) =>
    wrapWithErrorHandling(async () => {
      const branch = params.branch ?? 'current';
      const remote = params.remote ?? 'origin';
      // No API integration yet; return actionable instruction instead of failing.
      return {
        success: true,
        message: `Push '${branch}' to '${remote}' then open a PR in your git provider (not automated yet).`,
      };
    }),
};
