import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { breakdownSpec } from '../src/planning/breakdown-spec.js';
import { ErrorCode, McpError } from '../src/shared/errors.js';
import { readTask } from '../src/backlog/task-store.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'planning-breakdown-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function writeSpecFile(content: string): Promise<string> {
  const specDir = path.join(tmpDir, 'specs');
  await fs.mkdir(specDir, { recursive: true });
  const specPath = path.join(specDir, 'feature-sample.md');
  await fs.writeFile(specPath, content, 'utf8');
  return specPath;
}

describe('planning.breakdown_spec', () => {
  it('creates task stubs from spec bullets and triggers rebuild hook', async () => {
    const specPath = await writeSpecFile(`---
id: feature-sample
status: Planned
schema_version: \"3.0\"
---
# Sample Feature

## Functional Requirements
- Allow users to reset password
- Send confirmation email
`);

    let rebuilt = false;
    const now = () => new Date('2025-01-01T00:00:00Z');

    const result = await breakdownSpec(
      { specPath },
      {
        baseDir: tmpDir,
        now,
        rebuildIndexHook: async () => {
          rebuilt = true;
        },
      },
    );

    expect(result.spec_id).toBe('feature-sample');
    expect(result.task_ids).toEqual(['task-001', 'task-002']);
    expect(rebuilt).toBe(true);

    const task1 = await readTask(path.join(tmpDir, 'backlog', 'task-001 - Allow users to reset password.md'));
    const task2 = await readTask(path.join(tmpDir, 'backlog', 'task-002 - Send confirmation email.md'));

    expect(task1.meta.status).toBe('Backlog');
    expect(task1.meta.spec).toBe('specs/feature-sample.md');
    expect(task1.meta.schema_version).toBe('3.0');
    expect(task1.meta.created).toBe('2025-01-01T00:00:00.000Z');
    expect(task2.meta.id).toBe('task-002');
  });

  it('throws SPEC_NOT_FOUND when spec is missing', async () => {
    await expect(
      breakdownSpec({ specPath: path.join(tmpDir, 'specs', 'missing.md') }, { baseDir: tmpDir }),
    ).rejects.toHaveProperty('code', ErrorCode.SPEC_NOT_FOUND);
  });

  it('throws CONFLICT_DETECTED when allocator collides with existing task', async () => {
    const specPath = await writeSpecFile(`---
id: feature-sample
status: Planned
schema_version: \"3.0\"
---
# Sample Feature

## Functional Requirements
- One item
`);

    const backlogDir = path.join(tmpDir, 'backlog');
    await fs.mkdir(backlogDir, { recursive: true });
    await fs.writeFile(
      path.join(backlogDir, 'task-001 - Existing.md'),
      `---
id: task-001
version: 1
status: Backlog
schema_version: \"3.0\"
---
`,
      'utf8',
    );

    const allocator = vi.fn().mockReturnValue(['task-001']);

    await expect(
      breakdownSpec({ specPath }, { baseDir: tmpDir, idAllocator: allocator }),
    ).rejects.toHaveProperty('code', ErrorCode.CONFLICT_DETECTED);
  });
});
