import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  readTask,
  writeTask,
  deriveIdFromFilename,
  assertPathMatchesId,
} from '../src/backlog/task-store.js';
import { Errors } from '../src/shared/errors.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'task-store-'));
  await fs.mkdir(path.join(tmpDir, 'backlog'), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const backlogPath = (...parts: string[]): string => path.join(tmpDir, 'backlog', ...parts);

describe('task-store parsing and writing', () => {
  it('parses frontmatter, sections, preserves unknown keys, defaults version/schema', async () => {
    const filePath = backlogPath('task-100 - sample.md');
    const content = `---
id: task-100
status: Ready
custom_flag: true
---

# Title

## Description
Text
`;
    await fs.writeFile(filePath, content, 'utf8');

    const doc = await readTask(filePath);

    expect(doc.meta.id).toBe('task-100');
    expect(doc.meta.status).toBe('Ready');
    expect(doc.meta.version).toBe(1); // default
    expect(doc.meta.schema_version).toBe('3.0');
    expect(doc.meta.custom_flag).toBe(true);
    expect(doc.sections.Description.trim()).toBe('Text');
  });

  it('frontmatter takes precedence over inline metadata', async () => {
    const filePath = backlogPath('task-101 - inline.md');
    const content = `---
id: task-101
assignee: front
---
assignee: inline
status: Backlog

## Description
Body
`;
    await fs.writeFile(filePath, content, 'utf8');

    const doc = await readTask(filePath);
    expect(doc.meta.assignee).toBe('front');
    expect(doc.meta.status).toBe('Backlog');
  });

  it('normalizes depends_on from string and array', async () => {
    const path1 = backlogPath('task-102 - depends.md');
    await fs.writeFile(
      path1,
      `---
id: task-102
depends_on: task-001, task-002
---
`,
      'utf8',
    );
    const doc1 = await readTask(path1);
    expect(doc1.meta.depends_on).toEqual(['task-001', 'task-002']);

    const path2 = backlogPath('task-103 - depends.md');
    await fs.writeFile(
      path2,
      `---
id: task-103
depends_on:
  - task-010
  - task-011
---
`,
      'utf8',
    );
    const doc2 = await readTask(path2);
    expect(doc2.meta.depends_on).toEqual(['task-010', 'task-011']);
  });

  it('writeTask round-trips metadata and sections without loss', async () => {
    const filePath = backlogPath('task-104 - roundtrip.md');
    await fs.writeFile(
      filePath,
      `---
id: task-104
status: Backlog
priority: high
custom_field: 7
---

## Description
Keep this text.
`,
      'utf8',
    );

    const original = await readTask(filePath);
    await writeTask(original);
    const reread = await readTask(filePath);

    expect(reread.meta.priority).toBe('high');
    expect(reread.meta.custom_field).toBe(7);
    expect(reread.sections.Description.trim()).toBe('Keep this text.');
  });

  it('assertPathMatchesId throws on mismatch', () => {
    const p = backlogPath('task-200 - bad.md');
    expect(() => assertPathMatchesId(p, 'task-201')).toThrowError(
      Errors.taskIdMismatch('task-200', 'task-201'),
    );
    expect(deriveIdFromFilename(p)).toBe('task-200');
  });
});
