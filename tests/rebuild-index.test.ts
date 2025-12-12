import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { rebuildIndex, readIndex, checkIndexStale } from '../src/planning/rebuild-index.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rebuild-index-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function writeTask(
  id: string,
  title: string,
  status: string,
  spec?: string,
): Promise<string> {
  const backlogDir = path.join(tmpDir, 'backlog');
  await fs.mkdir(backlogDir, { recursive: true });
  const taskPath = path.join(backlogDir, `${id} - ${title}.md`);
  const specLine = spec ? `spec: ${spec}` : '';
  await fs.writeFile(
    taskPath,
    `---
id: ${id}
version: 1
status: ${status}
${specLine}
schema_version: "3.0"
---
# ${title}

## Description
Task description.
`,
    'utf8',
  );
  return taskPath;
}

async function writeSpec(id: string, title: string): Promise<string> {
  const specsDir = path.join(tmpDir, 'specs');
  await fs.mkdir(specsDir, { recursive: true });
  const specPath = path.join(specsDir, `${id}.md`);
  await fs.writeFile(
    specPath,
    `---
id: ${id}
status: Planned
schema_version: "3.0"
---
# ${title}

## Goals
- Sample goal
`,
    'utf8',
  );
  return specPath;
}

describe('planning.rebuild_index', () => {
  describe('empty repo', () => {
    it('creates index.json with empty features and tasks', async () => {
      const now = () => new Date('2025-01-15T10:00:00Z');

      const result = await rebuildIndex(tmpDir, { now });

      expect(result.index_path).toBe('backlog/index.json');
      expect(result.task_count).toBe(0);
      expect(result.spec_count).toBe(0);
      expect(result.stale).toBe(true);

      const index = await readIndex(tmpDir);
      expect(index).not.toBeNull();
      expect(index!.version).toBe(1);
      expect(index!.schema_version).toBe('3.0');
      expect(index!.generated_at).toBe('2025-01-15T10:00:00.000Z');
      expect(index!.features).toEqual([]);
      expect(index!.tasks).toEqual({});
    });

    it('creates backlog directory if missing', async () => {
      await rebuildIndex(tmpDir);

      const stat = await fs.stat(path.join(tmpDir, 'backlog'));
      expect(stat.isDirectory()).toBe(true);
    });
  });

  describe('tasks-only', () => {
    it('indexes tasks without spec links', async () => {
      await writeTask('task-001', 'First task', 'Backlog');
      await writeTask('task-002', 'Second task', 'In Progress');
      const now = () => new Date('2025-01-15T10:00:00Z');

      const result = await rebuildIndex(tmpDir, { now });

      expect(result.task_count).toBe(2);
      expect(result.spec_count).toBe(0);

      const index = await readIndex(tmpDir);
      expect(index!.features).toEqual([]);
      expect(Object.keys(index!.tasks)).toHaveLength(2);
      expect(index!.tasks['task-001']).toEqual({
        title: 'First task',
        status: 'Backlog',
      });
      expect(index!.tasks['task-002']).toEqual({
        title: 'Second task',
        status: 'In Progress',
      });
    });

    it('skips unparseable task files', async () => {
      await writeTask('task-001', 'Valid task', 'Backlog');

      const backlogDir = path.join(tmpDir, 'backlog');
      // Malformed YAML frontmatter - unclosed brace causes parse error
      await fs.writeFile(
        path.join(backlogDir, 'task-002 - Invalid.md'),
        `---
id: task-002
status: { unclosed
---
# Invalid task
`,
        'utf8',
      );

      const result = await rebuildIndex(tmpDir);

      expect(result.task_count).toBe(1);
      const index = await readIndex(tmpDir);
      expect(index!.tasks['task-001']).toBeDefined();
      expect(index!.tasks['task-002']).toBeUndefined();
    });
  });

  describe('specs-only', () => {
    it('indexes specs without linked tasks', async () => {
      await writeSpec('feature-auth', 'Authentication');
      await writeSpec('feature-billing', 'Billing');
      const now = () => new Date('2025-01-15T10:00:00Z');

      const result = await rebuildIndex(tmpDir, { now });

      expect(result.task_count).toBe(0);
      expect(result.spec_count).toBe(2);

      const index = await readIndex(tmpDir);
      // Features only include specs WITH linked tasks
      expect(index!.features).toEqual([]);
      expect(index!.tasks).toEqual({});
    });

    it('skips unparseable spec files', async () => {
      await writeSpec('feature-valid', 'Valid Spec');

      const specsDir = path.join(tmpDir, 'specs');
      // Malformed YAML frontmatter - unclosed brace causes parse error
      await fs.writeFile(
        path.join(specsDir, 'invalid.md'),
        `---
id: invalid-spec
status: { unclosed
---
# Invalid spec
`,
        'utf8',
      );

      const result = await rebuildIndex(tmpDir);

      expect(result.spec_count).toBe(1);
    });
  });

  describe('combined tasks+specs', () => {
    it('links tasks to specs via features array', async () => {
      await writeSpec('feature-auth', 'Authentication');
      await writeSpec('feature-billing', 'Billing');
      await writeTask('task-001', 'Login endpoint', 'Backlog', 'specs/feature-auth.md');
      await writeTask('task-002', 'Logout endpoint', 'In Progress', 'specs/feature-auth.md');
      await writeTask('task-003', 'Payment gateway', 'Ready', 'specs/feature-billing.md');
      await writeTask('task-004', 'Orphan task', 'Done');
      const now = () => new Date('2025-01-15T10:00:00Z');

      const result = await rebuildIndex(tmpDir, { now });

      expect(result.task_count).toBe(4);
      expect(result.spec_count).toBe(2);

      const index = await readIndex(tmpDir);
      expect(index!.features).toHaveLength(2);

      const authFeature = index!.features.find((f) => f.spec_id === 'feature-auth');
      expect(authFeature).toEqual({
        spec_id: 'feature-auth',
        spec_path: 'specs/feature-auth.md',
        tasks: ['task-001', 'task-002'],
      });

      const billingFeature = index!.features.find((f) => f.spec_id === 'feature-billing');
      expect(billingFeature).toEqual({
        spec_id: 'feature-billing',
        spec_path: 'specs/feature-billing.md',
        tasks: ['task-003'],
      });

      expect(index!.tasks['task-001']).toEqual({
        title: 'Login endpoint',
        status: 'Backlog',
        spec: 'specs/feature-auth.md',
      });
      expect(index!.tasks['task-004']).toEqual({
        title: 'Orphan task',
        status: 'Done',
      });
    });

    it('sorts features by spec_id and tasks within features', async () => {
      await writeSpec('feature-z', 'Zulu');
      await writeSpec('feature-a', 'Alpha');
      await writeTask('task-003', 'Task three', 'Backlog', 'specs/feature-a.md');
      await writeTask('task-001', 'Task one', 'Backlog', 'specs/feature-a.md');
      await writeTask('task-002', 'Task two', 'Backlog', 'specs/feature-z.md');

      await rebuildIndex(tmpDir);
      const index = await readIndex(tmpDir);
      expect(index!.features[0].spec_id).toBe('feature-a');
      expect(index!.features[1].spec_id).toBe('feature-z');
      expect(index!.features[0].tasks).toEqual(['task-001', 'task-003']);
    });
  });

  describe('stale detection', () => {
    it('returns stale=true when index does not exist', async () => {
      const result = await rebuildIndex(tmpDir);
      expect(result.stale).toBe(true);
    });

    it('returns stale=false when index is fresh', async () => {
      await writeTask('task-001', 'Sample task', 'Backlog');

      // First rebuild
      await rebuildIndex(tmpDir);

      // Small delay to ensure mtime difference
      await sleep(50);

      // Second rebuild without changes
      const result = await rebuildIndex(tmpDir);
      expect(result.stale).toBe(false);
    });

    it('returns stale=true when task file is newer than generated_at', async () => {
      await writeTask('task-001', 'Sample task', 'Backlog');

      // First rebuild
      await rebuildIndex(tmpDir);

      // Modify task file
      await sleep(50);
      const taskPath = path.join(tmpDir, 'backlog', 'task-001 - Sample task.md');
      await fs.utimes(taskPath, new Date(), new Date());

      // Check stale status
      const isStale = await checkIndexStale(tmpDir);
      expect(isStale).toBe(true);

      // Rebuild should report stale
      const result = await rebuildIndex(tmpDir);
      expect(result.stale).toBe(true);
    });

    it('returns stale=true when spec file is newer than generated_at', async () => {
      await writeSpec('feature-auth', 'Authentication');
      await writeTask('task-001', 'Login', 'Backlog', 'specs/feature-auth.md');

      // First rebuild
      await rebuildIndex(tmpDir);

      // Modify spec file
      await sleep(50);
      const specPath = path.join(tmpDir, 'specs', 'feature-auth.md');
      await fs.utimes(specPath, new Date(), new Date());

      // Check stale status
      const isStale = await checkIndexStale(tmpDir);
      expect(isStale).toBe(true);
    });

    it('returns stale=true when index has invalid generated_at', async () => {
      const backlogDir = path.join(tmpDir, 'backlog');
      await fs.mkdir(backlogDir, { recursive: true });
      await fs.writeFile(
        path.join(backlogDir, 'index.json'),
        JSON.stringify({
          version: 1,
          schema_version: '3.0',
          generated_at: 'invalid-date',
          features: [],
          tasks: {},
        }),
        'utf8',
      );

      const isStale = await checkIndexStale(tmpDir);
      expect(isStale).toBe(true);
    });

    it('returns stale=true when index is malformed JSON', async () => {
      const backlogDir = path.join(tmpDir, 'backlog');
      await fs.mkdir(backlogDir, { recursive: true });
      await fs.writeFile(path.join(backlogDir, 'index.json'), 'not json {{{', 'utf8');

      const isStale = await checkIndexStale(tmpDir);
      expect(isStale).toBe(true);
    });
  });

  describe('readIndex', () => {
    it('returns null when index does not exist', async () => {
      const index = await readIndex(tmpDir);
      expect(index).toBeNull();
    });

    it('returns parsed index when exists', async () => {
      await writeTask('task-001', 'Sample', 'Backlog');
      await rebuildIndex(tmpDir);

      const index = await readIndex(tmpDir);
      expect(index).not.toBeNull();
      expect(index!.version).toBe(1);
      expect(index!.schema_version).toBe('3.0');
    });
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
