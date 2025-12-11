import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import simpleGit from 'simple-git';
import { gitStatus, createBranch, stageAndCommit, push } from '../src/git/git-service.js';
import { ErrorCode } from '../src/shared/errors.js';

let tmpDir: string;

const defaultConfig = `schema_version: "3.0"
statuses: [Backlog, Ready, "In Progress", Done]
in_progress_statuses: ["In Progress"]
transitions:
  Backlog: [Ready]
  Ready: ["In Progress"]
  "In Progress": [Done]
`;

const defaultFrontmatter = `schema_version: "3.0"
version: 1
`;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-service-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function initGitRepo(): Promise<void> {
  const git = simpleGit(tmpDir);
  await git.init();
  await git.addConfig('user.email', 'test@test.com');
  await git.addConfig('user.name', 'Test User');

  // Create initial commit so we have a valid HEAD
  const readmePath = path.join(tmpDir, 'README.md');
  await fs.writeFile(readmePath, '# Test Repo\n', 'utf8');
  await git.add('README.md');
  await git.commit('Initial commit');
}

async function writeConfig(yaml: string): Promise<void> {
  const backlogDir = path.join(tmpDir, 'backlog');
  await fs.mkdir(backlogDir, { recursive: true });
  await fs.writeFile(path.join(backlogDir, 'config.yaml'), yaml, 'utf8');
}

async function writeTaskFile(id: string, status: string, extraMeta = ''): Promise<string> {
  const backlogDir = path.join(tmpDir, 'backlog');
  await fs.mkdir(backlogDir, { recursive: true });
  const filename = `${id} - Sample.md`;
  const content = `---
id: ${id}
status: ${status}
${extraMeta}${defaultFrontmatter}---

## Description
Test task
`;
  const filePath = path.join(backlogDir, filename);
  await fs.writeFile(filePath, content, 'utf8');
  return filePath;
}

describe('gitStatus', () => {
  it('returns clean status for clean repo', async () => {
    await initGitRepo();

    const result = await gitStatus({ baseDir: tmpDir });

    expect(result.clean).toBe(true);
    expect(result.branch).toBe('master');
    expect(result.staged).toEqual([]);
    expect(result.unstaged).toEqual([]);
    expect(result.untracked).toEqual([]);
  });

  it('returns untracked files', async () => {
    await initGitRepo();

    // Create an untracked file
    await fs.writeFile(path.join(tmpDir, 'new-file.txt'), 'content', 'utf8');

    const result = await gitStatus({ baseDir: tmpDir });

    expect(result.clean).toBe(false);
    expect(result.untracked).toContain('new-file.txt');
  });

  it('returns staged files', async () => {
    await initGitRepo();

    // Create and stage a file
    await fs.writeFile(path.join(tmpDir, 'staged.txt'), 'content', 'utf8');
    const git = simpleGit(tmpDir);
    await git.add('staged.txt');

    const result = await gitStatus({ baseDir: tmpDir });

    expect(result.clean).toBe(false);
    expect(result.staged).toContain('staged.txt');
  });

  it('returns modified (unstaged) files', async () => {
    await initGitRepo();

    // Modify the README
    await fs.writeFile(path.join(tmpDir, 'README.md'), '# Modified\n', 'utf8');

    const result = await gitStatus({ baseDir: tmpDir });

    expect(result.clean).toBe(false);
    expect(result.unstaged).toContain('README.md');
  });
});

describe('createBranch', () => {
  it('creates branch from HEAD by default', async () => {
    await initGitRepo();

    const result = await createBranch(
      { branch_name: 'feature/test' },
      { baseDir: tmpDir }
    );

    expect(result.branch).toBe('feature/test');
    expect(result.base_ref).toBe('HEAD');

    // Verify we're on the new branch
    const status = await gitStatus({ baseDir: tmpDir });
    expect(status.branch).toBe('feature/test');
  });

  it('creates branch from specified base_ref', async () => {
    await initGitRepo();
    const git = simpleGit(tmpDir);

    // Create another branch first
    await git.checkoutLocalBranch('develop');
    await fs.writeFile(path.join(tmpDir, 'dev.txt'), 'dev', 'utf8');
    await git.add('dev.txt');
    await git.commit('Dev commit');
    await git.checkout('master');

    const result = await createBranch(
      { branch_name: 'feature/from-develop', base_ref: 'develop' },
      { baseDir: tmpDir }
    );

    expect(result.branch).toBe('feature/from-develop');
    expect(result.base_ref).toBe('develop');
  });

  it('errors on invalid base_ref', async () => {
    await initGitRepo();

    await expect(
      createBranch(
        { branch_name: 'feature/test', base_ref: 'nonexistent' },
        { baseDir: tmpDir }
      )
    ).rejects.toHaveProperty('code', ErrorCode.BRANCH_NOT_FOUND);
  });

  it('validates task exists when task_id provided', async () => {
    await initGitRepo();
    await writeConfig(defaultConfig);

    await expect(
      createBranch(
        { branch_name: 'feature/test', task_id: 'nonexistent-task' },
        { baseDir: tmpDir }
      )
    ).rejects.toHaveProperty('code', ErrorCode.TASK_NOT_FOUND);
  });

  it('creates branch when task_id is valid', async () => {
    await initGitRepo();
    await writeConfig(defaultConfig);
    await writeTaskFile('task-001', 'In Progress');

    // Stage and commit task file so git is clean
    const git = simpleGit(tmpDir);
    await git.add('-A');
    await git.commit('Add task');

    const result = await createBranch(
      { branch_name: 'feature/task-001', task_id: 'task-001' },
      { baseDir: tmpDir }
    );

    expect(result.branch).toBe('feature/task-001');
  });
});

describe('stageAndCommit', () => {
  it('stages and commits changes with task reference', async () => {
    await initGitRepo();
    await writeConfig(defaultConfig);
    await writeTaskFile('task-001', 'In Progress');

    // Stage the config and task file to clean state
    const git = simpleGit(tmpDir);
    await git.add('-A');
    await git.commit('Setup');

    // Create a new file to commit
    await fs.writeFile(path.join(tmpDir, 'new-code.ts'), 'export const x = 1;', 'utf8');

    const result = await stageAndCommit(
      { task_id: 'task-001', summary: 'Add new code' },
      { baseDir: tmpDir }
    );

    expect(result.commit_hash).toBeTruthy();
    expect(result.message).toContain('Add new code');
    expect(result.message).toContain('Task: task-001');

    // Verify repo is clean
    const status = await gitStatus({ baseDir: tmpDir });
    expect(status.clean).toBe(true);
  });

  it('errors when task not found', async () => {
    await initGitRepo();
    await writeConfig(defaultConfig);

    await fs.writeFile(path.join(tmpDir, 'file.txt'), 'content', 'utf8');

    await expect(
      stageAndCommit(
        { task_id: 'nonexistent', summary: 'Test' },
        { baseDir: tmpDir }
      )
    ).rejects.toHaveProperty('code', ErrorCode.TASK_NOT_FOUND);
  });

  it('errors when no changes to commit', async () => {
    await initGitRepo();
    await writeConfig(defaultConfig);
    await writeTaskFile('task-001', 'In Progress');

    // Commit everything
    const git = simpleGit(tmpDir);
    await git.add('-A');
    await git.commit('Setup');

    await expect(
      stageAndCommit(
        { task_id: 'task-001', summary: 'Empty commit' },
        { baseDir: tmpDir }
      )
    ).rejects.toHaveProperty('code', ErrorCode.GIT_DIRTY);
  });

  it('errors on merge conflicts', async () => {
    await initGitRepo();
    await writeConfig(defaultConfig);
    await writeTaskFile('task-001', 'In Progress');

    const git = simpleGit(tmpDir);
    await git.add('-A');
    await git.commit('Setup');

    // Create a conflict scenario
    await git.checkoutLocalBranch('branch-a');
    await fs.writeFile(path.join(tmpDir, 'conflict.txt'), 'content-a', 'utf8');
    await git.add('conflict.txt');
    await git.commit('Branch A commit');

    await git.checkout('master');
    await git.checkoutLocalBranch('branch-b');
    await fs.writeFile(path.join(tmpDir, 'conflict.txt'), 'content-b', 'utf8');
    await git.add('conflict.txt');
    await git.commit('Branch B commit');

    // Merge to create conflict
    try {
      await git.merge(['branch-a']);
    } catch {
      // Expected merge conflict
    }

    await expect(
      stageAndCommit(
        { task_id: 'task-001', summary: 'Conflicted' },
        { baseDir: tmpDir }
      )
    ).rejects.toHaveProperty('code', ErrorCode.MERGE_CONFLICT);
  });
});

describe('push', () => {
  it('uses current branch when not specified', async () => {
    await initGitRepo();
    const git = simpleGit(tmpDir);

    // Create a bare repo to push to
    const remoteDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-remote-'));
    const remoteGit = simpleGit(remoteDir);
    await remoteGit.init(true); // bare repo

    await git.addRemote('origin', remoteDir);

    const result = await push({}, { baseDir: tmpDir });

    expect(result.success).toBe(true);
    expect(result.remote).toBe('origin');
    expect(result.branch).toBe('master');

    // Cleanup
    await fs.rm(remoteDir, { recursive: true, force: true });
  });

  it('pushes specific branch to specific remote', async () => {
    await initGitRepo();
    const git = simpleGit(tmpDir);

    // Create a bare repo to push to
    const remoteDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-remote-'));
    const remoteGit = simpleGit(remoteDir);
    await remoteGit.init(true);

    await git.addRemote('upstream', remoteDir);
    await git.checkoutLocalBranch('feature');
    await fs.writeFile(path.join(tmpDir, 'feature.txt'), 'content', 'utf8');
    await git.add('feature.txt');
    await git.commit('Feature commit');

    const result = await push(
      { remote: 'upstream', branch: 'feature' },
      { baseDir: tmpDir }
    );

    expect(result.success).toBe(true);
    expect(result.remote).toBe('upstream');
    expect(result.branch).toBe('feature');

    // Cleanup
    await fs.rm(remoteDir, { recursive: true, force: true });
  });

  it('errors when branch not found', async () => {
    await initGitRepo();
    const git = simpleGit(tmpDir);

    // Create a bare repo to push to
    const remoteDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-remote-'));
    const remoteGit = simpleGit(remoteDir);
    await remoteGit.init(true);

    await git.addRemote('origin', remoteDir);

    await expect(
      push({ branch: 'nonexistent' }, { baseDir: tmpDir })
    ).rejects.toHaveProperty('code', ErrorCode.BRANCH_NOT_FOUND);

    // Cleanup
    await fs.rm(remoteDir, { recursive: true, force: true });
  });
});
