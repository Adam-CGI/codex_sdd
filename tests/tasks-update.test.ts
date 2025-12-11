import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { updateTask } from '../src/backlog/task-update.js';
import { getTaskById } from '../src/backlog/task-store.js';
import { ErrorCode } from '../src/shared/errors.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tasks-update-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function writeTaskFile(
  id: string,
  extraMeta = '',
  sections = '## Description\nTest task\n',
): Promise<string> {
  const backlogDir = path.join(tmpDir, 'backlog');
  await fs.mkdir(backlogDir, { recursive: true });
  const filename = `${id} - Sample.md`;
  const content = `---
id: ${id}
status: Backlog
custom: keep-me
version: 1
schema_version: "3.0"
${extraMeta}---

${sections}`;
  const filePath = path.join(backlogDir, filename);
  await fs.writeFile(filePath, content, 'utf8');
  return filePath;
}

describe('updateTask', () => {
  it('updates meta and sections with optimistic version increment', async () => {
    await writeTaskFile('task-400');

    const result = await updateTask(
      {
        taskId: 'task-400',
        version: 1,
        meta: { status: 'In Progress', assignee: 'human:alice' },
        sections: { Notes: 'new section body' },
      },
      { baseDir: tmpDir },
    );

    expect(result.success).toBe(true);
    expect(result.meta.version).toBe(2);
    expect(result.meta.status).toBe('In Progress');
    expect(result.meta.assignee).toBe('human:alice');
    expect(typeof result.meta.updated).toBe('string');

    const updated = await getTaskById('task-400', { baseDir: tmpDir });
    expect(updated.meta.custom).toBe('keep-me');
    expect(updated.sections.Notes).toBe('new section body');
    expect(updated.sectionOrder.includes('Notes')).toBe(true);
  });

  it('throws conflict when version stale', async () => {
    await writeTaskFile('task-401');

    await expect(
      updateTask({ taskId: 'task-401', version: 99, meta: { status: 'Done' } }, { baseDir: tmpDir }),
    ).rejects.toHaveProperty('code', ErrorCode.CONFLICT_DETECTED);
  });

  it('throws TASK_NOT_FOUND when task missing', async () => {
    await expect(
      updateTask({ taskId: 'task-999', version: 1, meta: { status: 'Done' } }, { baseDir: tmpDir }),
    ).rejects.toHaveProperty('code', ErrorCode.TASK_NOT_FOUND);
  });

  it('throws TASK_LOCKED when lock file exists', async () => {
    const filePath = await writeTaskFile('task-402');
    await fs.writeFile(`${filePath}.lock`, 'locked', 'utf8');

    await expect(
      updateTask({ taskId: 'task-402', version: 1, sections: { Notes: 'blocked' } }, { baseDir: tmpDir }),
    ).rejects.toHaveProperty('code', ErrorCode.TASK_LOCKED);
  });
});
