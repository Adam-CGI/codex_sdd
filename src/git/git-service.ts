/**
 * Git service - provides git operations for MCP tools
 * Implements: git.status, git.create_branch, git.stage_and_commit, git.push
 */

import { simpleGit } from 'simple-git';
import type { SimpleGit, StatusResult } from 'simple-git';
import { Errors, McpError, ErrorCode } from '../shared/errors.js';
import { getTaskById } from '../backlog/task-store.js';

export interface GitServiceOptions {
  baseDir?: string;
}

export interface GitStatusResult {
  branch: string;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  clean: boolean;
}

export interface CreateBranchParams {
  branch_name: string;
  base_ref?: string;
  task_id?: string;
}

export interface CreateBranchResult {
  branch: string;
  base_ref: string;
}

export interface StageAndCommitParams {
  task_id: string;
  summary: string;
}

export interface StageAndCommitResult {
  commit_hash: string;
  message: string;
}

export interface PushParams {
  remote?: string;
  branch?: string;
}

export interface PushResult {
  success: true;
  remote: string;
  branch: string;
}

/**
 * Create a simple-git instance for the given directory
 */
function getGit(baseDir: string): SimpleGit {
  return simpleGit(baseDir);
}

/**
 * Get the current git status
 */
export async function gitStatus(
  options: GitServiceOptions = {}
): Promise<GitStatusResult> {
  const baseDir = options.baseDir ?? process.cwd();
  const git = getGit(baseDir);

  const status: StatusResult = await git.status();

  return {
    branch: status.current ?? 'HEAD',
    staged: status.staged,
    unstaged: status.modified.filter((f) => !status.staged.includes(f)),
    untracked: status.not_added,
    clean: status.isClean(),
  };
}

/**
 * Create a new branch, optionally from a base ref
 */
export async function createBranch(
  params: CreateBranchParams,
  options: GitServiceOptions = {}
): Promise<CreateBranchResult> {
  const baseDir = options.baseDir ?? process.cwd();
  const git = getGit(baseDir);

  const { branch_name, base_ref, task_id } = params;
  const actualBaseRef = base_ref ?? 'HEAD';

  // Verify base ref exists if specified
  if (base_ref) {
    try {
      await git.revparse([base_ref]);
    } catch (error) {
      throw Errors.branchNotFound(base_ref);
    }
  }

  // If task_id is provided, verify the task exists
  if (task_id) {
    try {
      await getTaskById(task_id, { baseDir });
    } catch (error) {
      if (error instanceof McpError && error.code === ErrorCode.TASK_NOT_FOUND) {
        throw error;
      }
      throw error;
    }
  }

  // Create the branch
  try {
    await git.checkoutBranch(branch_name, actualBaseRef);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('not a valid ref') || message.includes('did not match')) {
      throw Errors.branchNotFound(actualBaseRef);
    }
    throw error;
  }

  return {
    branch: branch_name,
    base_ref: actualBaseRef,
  };
}

/**
 * Stage all changes and commit with a message tied to a task
 */
export async function stageAndCommit(
  params: StageAndCommitParams,
  options: GitServiceOptions = {}
): Promise<StageAndCommitResult> {
  const baseDir = options.baseDir ?? process.cwd();
  const git = getGit(baseDir);

  const { task_id, summary } = params;

  // Verify task exists
  await getTaskById(task_id, { baseDir });

  // Check for uncommitted changes
  const status = await git.status();

  // Check for merge conflicts
  if (status.conflicted.length > 0) {
    throw Errors.mergeConflict(status.conflicted);
  }

  // Must have something to commit
  const hasChanges =
    status.staged.length > 0 ||
    status.modified.length > 0 ||
    status.not_added.length > 0 ||
    status.deleted.length > 0;

  if (!hasChanges) {
    throw new McpError(
      ErrorCode.GIT_DIRTY,
      'No changes to commit',
      { staged: [], unstaged: [], untracked: [] }
    );
  }

  // Stage all changes
  await git.add('-A');

  // Create commit message
  const message = `${summary}\n\nTask: ${task_id}`;

  // Commit
  const commitResult = await git.commit(message);

  return {
    commit_hash: commitResult.commit,
    message,
  };
}

/**
 * Push to remote
 */
export async function push(
  params: PushParams = {},
  options: GitServiceOptions = {}
): Promise<PushResult> {
  const baseDir = options.baseDir ?? process.cwd();
  const git = getGit(baseDir);

  const remote = params.remote ?? 'origin';
  let branch = params.branch;

  // If no branch specified, use current branch
  if (!branch) {
    const status = await git.status();
    branch = status.current ?? undefined;

    if (!branch) {
      throw Errors.branchNotFound('HEAD (detached)');
    }
  }

  // Verify branch exists locally
  try {
    await git.revparse([branch]);
  } catch (error) {
    throw Errors.branchNotFound(branch);
  }

  // Push
  try {
    await git.push(remote, branch, ['--set-upstream']);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes('does not appear to be a git repository') ||
      message.includes('Could not read from remote')
    ) {
      throw new McpError(
        ErrorCode.BRANCH_NOT_FOUND,
        `Remote "${remote}" not found or not accessible`,
        { remote }
      );
    }
    throw error;
  }

  return {
    success: true,
    remote,
    branch,
  };
}
