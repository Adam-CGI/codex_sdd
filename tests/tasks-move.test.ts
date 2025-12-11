import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { moveTask } from '../src/backlog/task-move.js';
import { ErrorCode } from '../src/shared/errors.js';
import { getTaskById } from '../src/backlog/task-store.js';

let tmpDir: string;

const defaultFrontmatter = `schema_version: "3.0"
version: 1
`;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tasks-move-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function writeConfig(yaml: string): Promise<void> {
  const backlogDir = path.join(tmpDir, 'backlog');
  return fs.mkdir(backlogDir, { recursive: true }).then(() =>
    fs.writeFile(path.join(backlogDir, 'config.yaml'), yaml, 'utf8'),
  );
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

describe('moveTask', () => {
  it('moves when transition allowed and versions match', async () => {
    await writeConfig(`schema_version: "3.0"
statuses: [Backlog, Ready]
in_progress_statuses: [Ready]
transitions:
  Backlog: [Ready]
roles:
  maintainers: [human:alice]
`);
    await writeTaskFile('task-100', 'Backlog');

    const result = await moveTask(
      { taskId: 'task-100', version: 1, toStatus: 'Ready' },
      { baseDir: tmpDir, callerId: 'human:alice' },
    );

    expect(result.success).toBe(true);
    expect(result.old_status).toBe('Backlog');
    expect(result.new_status).toBe('Ready');

    const updated = await getTaskById('task-100', { baseDir: tmpDir });
    expect(updated.meta.status).toBe('Ready');
    expect(updated.meta.version).toBe(2);
    expect(typeof updated.meta.updated).toBe('string');
  });

  it('rejects invalid transition when not forced', async () => {
    await writeConfig(`schema_version: "3.0"
statuses: [Backlog, Ready, "In Progress"]
in_progress_statuses: ["In Progress"]
transitions:
  Backlog: [Ready]
roles:
  maintainers: [human:alice]
`);
    await writeTaskFile('task-101', 'Backlog');

    await expect(
      moveTask(
        { taskId: 'task-101', version: 1, toStatus: 'In Progress' },
        { baseDir: tmpDir, callerId: 'human:alice' },
      ),
    ).rejects.toHaveProperty('code', ErrorCode.INVALID_TRANSITION);
  });

  it('allows maintainer force to bypass transitions', async () => {
    await writeConfig(`schema_version: "3.0"
statuses: [Backlog, Done]
in_progress_statuses: []
transitions:
  Backlog: []
roles:
  maintainers: [human:alice]
`);
    await writeTaskFile('task-102', 'Backlog');

    const result = await moveTask(
      { taskId: 'task-102', version: 1, toStatus: 'Done', force: true },
      { baseDir: tmpDir, callerId: 'human:alice' },
    );

    expect(result.new_status).toBe('Done');
  });

  it('blocks move to in-progress when dependencies not Done', async () => {
    await writeConfig(`schema_version: "3.0"
statuses: [Backlog, "In Progress", Done]
in_progress_statuses: ["In Progress"]
transitions:
  Backlog: ["In Progress"]
roles:
  maintainers: [human:alice]
`);
    await writeTaskFile('task-200', 'Backlog', 'depends_on: [task-201]\n');
    await writeTaskFile('task-201', 'Backlog');

    await expect(
      moveTask(
        { taskId: 'task-200', version: 1, toStatus: 'In Progress' },
        { baseDir: tmpDir, callerId: 'human:alice' },
      ),
    ).rejects.toHaveProperty('code', ErrorCode.DEPENDENCIES_NOT_MET);
  });

  it('detects version conflict', async () => {
    await writeConfig(`schema_version: "3.0"
statuses: [Backlog, Ready]
in_progress_statuses: [Ready]
transitions:
  Backlog: [Ready]
roles:
  maintainers: [human:alice]
`);
    await writeTaskFile('task-300', 'Backlog');

    await expect(
      moveTask(
        { taskId: 'task-300', version: 2, toStatus: 'Ready' },
        { baseDir: tmpDir, callerId: 'human:alice' },
      ),
    ).rejects.toHaveProperty('code', ErrorCode.CONFLICT_DETECTED);
  });
});
