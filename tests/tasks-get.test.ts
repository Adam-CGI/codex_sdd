import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getTaskById, type TaskDocument } from '../src/backlog/task-store.js';
import { ErrorCode, McpError } from '../src/shared/errors.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tasks-get-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('tasks.get (getTaskById)', () => {
  it('returns parsed task with meta, sections, and path', async () => {
    const backlogDir = path.join(tmpDir, 'backlog');
    await fs.mkdir(backlogDir, { recursive: true });
    const filePath = path.join(
      backlogDir,
      'task-123 - Test task.md',
    );
    const content = `---
id: task-123
status: Backlog
assignee: human:adam
schema_version: "3.0"
---

## Description
Do the thing

## Acceptance Criteria
- [ ] criterion
`;
    await fs.writeFile(filePath, content, 'utf8');

    const doc: TaskDocument = await getTaskById('task-123', { baseDir: tmpDir });

    expect(doc.path).toBe(filePath);
    expect(doc.meta.id).toBe('task-123');
    expect(doc.meta.status).toBe('Backlog');
    expect(doc.sections.Description.trim()).toBe('Do the thing');
    expect(doc.sections['Acceptance Criteria']).toContain('criterion');
    expect(doc.sectionOrder).toEqual(['Description', 'Acceptance Criteria']);
  });

  it('throws TASK_NOT_FOUND when file is missing', async () => {
    await expect(getTaskById('task-999', { baseDir: tmpDir })).rejects.toHaveProperty(
      'code',
      ErrorCode.TASK_NOT_FOUND,
    );
  });

  it('throws TASK_PARSE_ERROR on malformed YAML', async () => {
    const backlogDir = path.join(tmpDir, 'backlog');
    await fs.mkdir(backlogDir, { recursive: true });
    await fs.writeFile(
      path.join(backlogDir, 'task-001 - bad.md'),
      `---
id: task-001
status: Backlog
bad: [unclosed
---
## Description
oops
`,
      'utf8',
    );

    await expect(getTaskById('task-001', { baseDir: tmpDir })).rejects.toBeInstanceOf(McpError);
    await expect(getTaskById('task-001', { baseDir: tmpDir })).rejects.toHaveProperty(
      'code',
      ErrorCode.TASK_PARSE_ERROR,
    );
  });

  it('throws TASK_ID_MISMATCH when filename id differs from meta id', async () => {
    const backlogDir = path.join(tmpDir, 'backlog');
    await fs.mkdir(backlogDir, { recursive: true });
    await fs.writeFile(
      path.join(backlogDir, 'task-002 - mismatch.md'),
      `---
id: task-003
status: Backlog
---
## Description
text
`,
      'utf8',
    );

    await expect(getTaskById('task-002', { baseDir: tmpDir })).rejects.toHaveProperty(
      'code',
      ErrorCode.TASK_ID_MISMATCH,
    );
  });
});
