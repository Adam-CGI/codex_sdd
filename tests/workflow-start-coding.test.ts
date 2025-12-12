import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import simpleGit from 'simple-git';
import { startCoding } from '../src/workflow/automation.js';
import { ErrorCode } from '../src/shared/errors.js';

let tmpDir: string;
let originalCwd: string;

const configYaml = `schema_version: "3.0"
statuses:
  - Backlog
  - Ready for Architecture Review
  - Needs Planning Update
  - Ready for Coding
  - In Progress
  - Ready for Code Review
  - Done
in_progress_statuses:
  - In Progress
transitions:
  Backlog: ["Ready for Architecture Review"]
  "Ready for Architecture Review": ["Backlog", "Ready for Coding", "Needs Planning Update"]
  "Needs Planning Update": ["Ready for Architecture Review"]
  "Ready for Coding": ["In Progress", "Backlog"]
  "In Progress": ["Ready for Code Review", "Backlog"]
  "Ready for Code Review": ["In Progress", "Done", "Backlog"]
  Done: ["Backlog"]
roles:
  maintainers:
    - human:adam
`;

async function initGitRepo(baseDir: string) {
  const git = simpleGit(baseDir);
  await git.init();
  await git.addConfig('user.email', 'test@test.com');
  await git.addConfig('user.name', 'Test User');
  await fs.writeFile(path.join(baseDir, 'README.md'), '# Test\n', 'utf8');
  await git.add('-A');
  await git.commit('Initial');
}

async function writeTask(baseDir: string, status: string, title = 'Build Search Feature') {
  const backlogDir = path.join(baseDir, 'backlog');
  await fs.mkdir(backlogDir, { recursive: true });
  const now = new Date().toISOString();
  const content = `---
id: task-001
version: 1
status: ${status}
title: ${title}
schema_version: "3.0"
created: ${now}
updated: ${now}
---\n\n# ${title}\n`;
  await fs.writeFile(path.join(backlogDir, 'task-001 - Build Search Feature.md'), content, 'utf8');
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workflow-start-'));
  originalCwd = process.cwd();
  process.chdir(tmpDir);
  await fs.mkdir(path.join(tmpDir, 'backlog'), { recursive: true });
  await fs.writeFile(path.join(tmpDir, 'backlog', 'config.yaml'), configYaml, 'utf8');
  await initGitRepo(tmpDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('workflow.start_coding', () => {
  it('creates slugged feature branch and moves task to In Progress', async () => {
    await writeTask(tmpDir, 'Ready for Coding', 'Add OAuth Login 🔐');

    const result = await startCoding({ taskId: 'task-001' }, { baseDir: tmpDir, callerId: 'human:adam' });

    expect(result.status).toBe('In Progress');
    expect(result.branch).toBe('feature/task-001-add-oauth-login');

    const git = simpleGit(tmpDir);
    const branch = await git.branch();
    expect(branch.current).toBe('feature/task-001-add-oauth-login');
  });

  it('supports dry-run branch creation', async () => {
    await writeTask(tmpDir, 'Ready for Coding');

    const result = await startCoding(
      { taskId: 'task-001', dryRun: true },
      { baseDir: tmpDir, callerId: 'human:adam' }
    );

    expect(result.branch).toBe('feature/task-001-build-search-feature');
    const git = simpleGit(tmpDir);
    const branch = await git.branch();
    expect(branch.all).not.toContain('feature/task-001-build-search-feature');
  });

  it('blocks protected branch targets unless allowed', async () => {
    await writeTask(tmpDir, 'Ready for Coding', 'Release Prep');

    await expect(
      startCoding(
        {
          taskId: 'task-001',
          branchName: 'main',
          protectedBranches: ['main'],
        },
        { baseDir: tmpDir, callerId: 'human:adam' }
      )
    ).rejects.toHaveProperty('code', ErrorCode.BRANCH_NOT_FOUND);
  });
});
