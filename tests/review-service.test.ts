import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import simpleGit from 'simple-git';
import {
  analyzeDiff,
  writeReviewDoc,
  summarizeTaskReviews,
} from '../src/review/review-service.js';
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
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'review-service-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function initGitRepo(): Promise<void> {
  const git = simpleGit(tmpDir);
  await git.init();
  await git.addConfig('user.email', 'test@test.com');
  await git.addConfig('user.name', 'Test User');

  // Create initial commit
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

describe('analyzeDiff', () => {
  it('analyzes diff between two commits', async () => {
    await initGitRepo();
    await writeConfig(defaultConfig);
    await writeTaskFile('task-001', 'In Progress');

    const git = simpleGit(tmpDir);

    // Commit task and config files
    await git.add('-A');
    await git.commit('Add task');

    const baseRef = await git.revparse(['HEAD']);

    // Make changes
    await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'src', 'index.ts'), 'export const x = 1;\n', 'utf8');
    await git.add('-A');
    await git.commit('Add code');

    const result = await analyzeDiff(
      { base_ref: baseRef.trim(), head_ref: 'HEAD' },
      { baseDir: tmpDir }
    );

    expect(result.summary).toBeDefined();
    expect(['Changes Requested', 'Approved', 'Informational']).toContain(result.review_status);
    expect(result.notes.length).toBeGreaterThan(0);
  });

  it('detects console.log as non-blocking suggestion', async () => {
    await initGitRepo();
    await writeConfig(defaultConfig);

    const git = simpleGit(tmpDir);
    const baseRef = await git.revparse(['HEAD']);

    // Add file with console.log
    await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'src', 'app.ts'),
      'console.log("debug");\nexport const x = 1;\n',
      'utf8'
    );
    await git.add('-A');
    await git.commit('Add console.log');

    const result = await analyzeDiff(
      { base_ref: baseRef.trim(), head_ref: 'HEAD' },
      { baseDir: tmpDir }
    );

    expect(result.non_blocking_suggestions.some((s) => s.description.includes('Console statement'))).toBe(true);
  });

  it('detects debugger as blocking issue', async () => {
    await initGitRepo();
    await writeConfig(defaultConfig);

    const git = simpleGit(tmpDir);
    const baseRef = await git.revparse(['HEAD']);

    // Add file with debugger
    await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'src', 'app.ts'),
      'debugger;\nexport const x = 1;\n',
      'utf8'
    );
    await git.add('-A');
    await git.commit('Add debugger');

    const result = await analyzeDiff(
      { base_ref: baseRef.trim(), head_ref: 'HEAD' },
      { baseDir: tmpDir }
    );

    expect(result.review_status).toBe('Changes Requested');
    expect(result.blocking_issues.some((i) => i.description.includes('Debugger'))).toBe(true);
  });

  it('errors on invalid base_ref', async () => {
    await initGitRepo();

    await expect(
      analyzeDiff({ base_ref: 'nonexistent', head_ref: 'HEAD' }, { baseDir: tmpDir })
    ).rejects.toHaveProperty('code', ErrorCode.BRANCH_NOT_FOUND);
  });

  it('errors on invalid head_ref', async () => {
    await initGitRepo();

    await expect(
      analyzeDiff({ base_ref: 'HEAD', head_ref: 'nonexistent' }, { baseDir: tmpDir })
    ).rejects.toHaveProperty('code', ErrorCode.BRANCH_NOT_FOUND);
  });

  it('returns Approved when no issues found', async () => {
    await initGitRepo();
    await writeConfig(defaultConfig);

    const git = simpleGit(tmpDir);
    const baseRef = await git.revparse(['HEAD']);

    // Add clean file
    await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'src', 'clean.ts'), 'export const x = 1;\n', 'utf8');
    await git.add('-A');
    await git.commit('Add clean code');

    const result = await analyzeDiff(
      { base_ref: baseRef.trim(), head_ref: 'HEAD' },
      { baseDir: tmpDir }
    );

    expect(result.review_status).toBe('Approved');
    expect(result.blocking_issues.length).toBe(0);
  });
});

describe('writeReviewDoc', () => {
  it('writes review document to reviews directory', async () => {
    await initGitRepo();
    await writeConfig(defaultConfig);
    await writeTaskFile('task-001', 'In Progress');

    const git = simpleGit(tmpDir);
    await git.add('-A');
    await git.commit('Setup');

    const review = {
      summary: 'Test review summary',
      review_status: 'Approved' as const,
      blocking_issues: [],
      non_blocking_suggestions: [],
      notes: ['Test note'],
    };

    const result = await writeReviewDoc(
      { task_id: 'task-001', review },
      { baseDir: tmpDir }
    );

    expect(result.success).toBe(true);
    expect(result.review_path).toContain('review-task-001');

    // Verify file exists and contains expected content
    const content = await fs.readFile(result.review_path, 'utf8');
    expect(content).toContain('task_id: task-001');
    expect(content).toContain('review_status: Approved');
    expect(content).toContain('Test review summary');
  });

  it('includes blocking issues in document', async () => {
    await initGitRepo();
    await writeConfig(defaultConfig);
    await writeTaskFile('task-001', 'In Progress');

    const git = simpleGit(tmpDir);
    await git.add('-A');
    await git.commit('Setup');

    const review = {
      summary: 'Review with issues',
      review_status: 'Changes Requested' as const,
      blocking_issues: [
        { id: 'REV-1', description: 'Test blocking issue', file: 'src/app.ts', line: 10 },
      ],
      non_blocking_suggestions: [],
      notes: [],
    };

    const result = await writeReviewDoc(
      { task_id: 'task-001', review },
      { baseDir: tmpDir }
    );

    const content = await fs.readFile(result.review_path, 'utf8');
    expect(content).toContain('## Blocking Issues');
    expect(content).toContain('REV-1');
    expect(content).toContain('Test blocking issue');
    expect(content).toContain('src/app.ts:10');
  });

  it('errors when task not found', async () => {
    await initGitRepo();
    await writeConfig(defaultConfig);

    const review = {
      summary: 'Test',
      review_status: 'Approved' as const,
      blocking_issues: [],
      non_blocking_suggestions: [],
      notes: [],
    };

    await expect(
      writeReviewDoc({ task_id: 'nonexistent', review }, { baseDir: tmpDir })
    ).rejects.toHaveProperty('code', ErrorCode.TASK_NOT_FOUND);
  });
});

describe('summarizeTaskReviews', () => {
  it('returns None when no reviews exist', async () => {
    await initGitRepo();
    await writeConfig(defaultConfig);
    await writeTaskFile('task-001', 'In Progress');

    const git = simpleGit(tmpDir);
    await git.add('-A');
    await git.commit('Setup');

    const result = await summarizeTaskReviews(
      { task_id: 'task-001' },
      { baseDir: tmpDir }
    );

    expect(result.task_id).toBe('task-001');
    expect(result.current_status).toBe('None');
    expect(result.open_blocking_issues).toEqual([]);
    expect(result.open_non_blocking_suggestions).toEqual([]);
  });

  it('returns latest review status', async () => {
    await initGitRepo();
    await writeConfig(defaultConfig);
    await writeTaskFile('task-001', 'In Progress');

    const git = simpleGit(tmpDir);
    await git.add('-A');
    await git.commit('Setup');

    // Write a review
    const review = {
      summary: 'Test',
      review_status: 'Changes Requested' as const,
      blocking_issues: [{ id: 'REV-1', description: 'Fix this' }],
      non_blocking_suggestions: [{ id: 'REV-2', description: 'Consider this' }],
      notes: [],
    };

    await writeReviewDoc({ task_id: 'task-001', review }, { baseDir: tmpDir });

    const result = await summarizeTaskReviews(
      { task_id: 'task-001' },
      { baseDir: tmpDir }
    );

    expect(result.current_status).toBe('Changes Requested');
    expect(result.open_blocking_issues.length).toBe(1);
    expect(result.open_non_blocking_suggestions.length).toBe(1);
  });

  it('errors when task not found', async () => {
    await initGitRepo();
    await writeConfig(defaultConfig);

    await expect(
      summarizeTaskReviews({ task_id: 'nonexistent' }, { baseDir: tmpDir })
    ).rejects.toHaveProperty('code', ErrorCode.TASK_NOT_FOUND);
  });
});
