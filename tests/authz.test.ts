import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';

import { moveTask } from '../src/backlog/task-move.js';
import { updateTask } from '../src/backlog/task-update.js';
import { ErrorCode } from '../src/shared/errors.js';

let tmpDir: string;

const configYaml = `schema_version: "3.0"
statuses: [Backlog, Ready]
in_progress_statuses: [Ready]
transitions:
  Backlog: [Ready]
roles:
  maintainers: [human:alice]
`;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'authz-'));
  const backlogDir = path.join(tmpDir, 'backlog');
  await fs.mkdir(backlogDir, { recursive: true });
  await fs.writeFile(path.join(backlogDir, 'config.yaml'), configYaml, 'utf8');
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function writeTask(id: string, extraMeta = ''): Promise<string> {
  const backlogDir = path.join(tmpDir, 'backlog');
  await fs.mkdir(backlogDir, { recursive: true });
  const content = `---
id: ${id}
status: Backlog
version: 1
schema_version: "3.0"
${extraMeta}---

# Task
`;
  const filePath = path.join(backlogDir, `${id} - Sample.md`);
  await fs.writeFile(filePath, content, 'utf8');
  return filePath;
}

describe('authz + audit', () => {
  it('allows moveTask even when caller is not the assignee', async () => {
    await writeTask('task-noauth', 'assignee: human:bob\n');

    const result = await moveTask(
      { taskId: 'task-noauth', version: 1, toStatus: 'Ready' },
      { baseDir: tmpDir, callerId: 'human:eve' },
    );

    expect(result.meta.status).toBe('Ready');
    expect(result.meta.version).toBe(2);
  });

  it('appends audit entry on successful moveTask', async () => {
    await writeTask('task-audit', 'assignee: human:alice\n');

    await moveTask(
      { taskId: 'task-audit', version: 1, toStatus: 'Ready' },
      { baseDir: tmpDir, callerId: 'human:alice' },
    );

    const auditPath = path.join(tmpDir, 'backlog', '.audit.jsonl');
    const contents = await fs.readFile(auditPath, 'utf8');
    const lines = contents.trim().split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(1);
    const entry = JSON.parse(lines[0] as string);
    expect(entry.operation).toBe('tasks_move');
    expect(entry.callerId).toBe('human:alice');
    expect(entry.context.to).toBe('Ready');
  });

  it('allows updateTask for assignee', async () => {
    await writeTask('task-update', 'assignee: human:alice\n');

    const result = await updateTask(
      { taskId: 'task-update', version: 1, meta: { status: 'Ready' } },
      { baseDir: tmpDir, callerId: 'human:alice' },
    );

    expect(result.meta.status).toBe('Ready');
  });
});
