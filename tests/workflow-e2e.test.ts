import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { breakdownSpec } from '../src/planning/breakdown-spec.js';
import {
  architectureReview,
  startCoding,
  submitForReview,
  codeReview,
} from '../src/workflow/automation.js';
import { readTask } from '../src/backlog/task-store.js';
import { ErrorCode } from '../src/shared/errors.js';
import { moveTask } from '../src/backlog/task-move.js';

let tmpDir: string;
let originalCwd: string;

const maintainer = 'human:adam';

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
    - ${maintainer}
`;

async function writeSpec(baseDir: string) {
  const specsDir = path.join(baseDir, 'specs');
  await fs.mkdir(specsDir, { recursive: true });
  const content = `---
id: feature-search
schema_version: "3.0"
---
# Search Feature

## Functional Requirements
- Add global search bar
- Index backlog tasks
`;
  const specPath = path.join(specsDir, 'feature-search.md');
  await fs.writeFile(specPath, content, 'utf8');
  return specPath;
}

async function currentStatus(baseDir: string, taskId: string) {
  const task = await readTask(path.join(baseDir, 'backlog', `task-001 - Add global search bar.md`));
  expect(task.meta.id).toBe(taskId);
  return task.meta.status;
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workflow-e2e-'));
  originalCwd = process.cwd();
  process.chdir(tmpDir);
  await fs.mkdir(path.join(tmpDir, 'backlog'), { recursive: true });
  await fs.writeFile(path.join(tmpDir, 'backlog', 'config.yaml'), configYaml, 'utf8');
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('end-to-end workflow', () => {
  it('runs the happy path through all gates', async () => {
    const specPath = await writeSpec(tmpDir);

    const breakdown = await breakdownSpec({ specPath }, { baseDir: tmpDir, now: () => new Date('2025-01-01T00:00:00Z') });
    const taskId = breakdown.task_ids[0];

    expect(await currentStatus(tmpDir, taskId)).toBe('Ready for Architecture Review');

    await architectureReview({ taskId, approve: true, notes: 'Looks good' }, { baseDir: tmpDir, callerId: maintainer });
    expect(await currentStatus(tmpDir, taskId)).toBe('Ready for Coding');

    await startCoding({ taskId, createBranch: false }, { baseDir: tmpDir, callerId: maintainer });
    expect(await currentStatus(tmpDir, taskId)).toBe('In Progress');

    await submitForReview({ taskId }, { baseDir: tmpDir, callerId: maintainer });
    expect(await currentStatus(tmpDir, taskId)).toBe('Ready for Code Review');

    await codeReview({ taskId, approve: true, notes: 'Ship it' }, { baseDir: tmpDir, callerId: maintainer });
    expect(await currentStatus(tmpDir, taskId)).toBe('Done');
  });

  it('handles gate rejections (architecture and code review)', async () => {
    const specPath = await writeSpec(tmpDir);
    const breakdown = await breakdownSpec({ specPath }, { baseDir: tmpDir });
    const taskId = breakdown.task_ids[0];

    // Architecture rejection
    await architectureReview({ taskId, approve: false, notes: 'Missing data flow' }, { baseDir: tmpDir, callerId: maintainer });
    expect(await currentStatus(tmpDir, taskId)).toBe('Needs Planning Update');

    // Coding not allowed from Needs Planning Update
    await expect(
      startCoding({ taskId, createBranch: false }, { baseDir: tmpDir, callerId: maintainer })
    ).rejects.toHaveProperty('code', ErrorCode.GATE_VIOLATION);

    // Move back via architecture approval
    const task = await readTask(path.join(tmpDir, 'backlog', 'task-001 - Add global search bar.md'));
    await moveTask(
      { taskId, toStatus: 'Ready for Architecture Review', version: task.meta.version },
      { baseDir: tmpDir, callerId: maintainer }
    );
    await architectureReview({ taskId, approve: true }, { baseDir: tmpDir, callerId: maintainer });
    await startCoding({ taskId, createBranch: false }, { baseDir: tmpDir, callerId: maintainer });
    await submitForReview({ taskId }, { baseDir: tmpDir, callerId: maintainer });

    // Code review rejection
    await codeReview({ taskId, approve: false, notes: 'Add tests' }, { baseDir: tmpDir, callerId: maintainer });
    expect(await currentStatus(tmpDir, taskId)).toBe('In Progress');
  });
});
