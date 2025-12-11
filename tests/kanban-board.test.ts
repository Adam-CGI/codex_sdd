import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getBoard } from '../src/kanban/board-service.js';
import { ErrorCode } from '../src/shared/errors.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-board-'));
  await fs.mkdir(path.join(tmpDir, 'backlog'), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function writeConfig(columns?: Record<string, string>): Promise<void> {
  const cfg = `
schema_version: "3.0"
statuses: ["Backlog","Ready","In Progress","Done"]
in_progress_statuses: ["In Progress"]
columns:
  Backlog: Backlog
  Ready: Ready
  Doing: In Progress
  Done: Done
${columns ? Object.entries(columns).map(([k, v]) => `  ${k}: ${v}`).join('\n') : ''}
`;
  await fs.writeFile(path.join(tmpDir, 'backlog', 'config.yaml'), cfg, 'utf8');
}

async function writeTask(
  filename: string,
  yaml: string,
  body = '## Description\ntext\n',
): Promise<void> {
  await fs.writeFile(path.join(tmpDir, 'backlog', filename), `${yaml}\n${body}`, 'utf8');
}

describe('kanban.get_board', () => {
  it('returns paginated tasks with column mapping', async () => {
    await writeConfig();
    await writeTask(
      'task-001 - one.md',
      `---
id: task-001
status: Backlog
assignee: a
---`,
    );
    await writeTask(
      'task-002 - two.md',
      `---
id: task-002
status: Ready
assignee: b
---`,
    );
    await writeTask(
      'task-003 - three.md',
      `---
id: task-003
status: In Progress
assignee: c
---`,
    );

    const page1 = await getBoard({ baseDir: tmpDir, page: 1, page_size: 2 });
    expect(page1.tasks).toHaveLength(2);
    expect(page1.total_tasks).toBe(3);
    expect(page1.has_next).toBe(true);
    expect(page1.tasks[0].column).toBe('Backlog');

    const page2 = await getBoard({ baseDir: tmpDir, page: 2, page_size: 2 });
    expect(page2.tasks).toHaveLength(1);
    expect(page2.has_next).toBe(false);
    expect(page2.tasks[0].column).toBe('Doing'); // mapped from In Progress
  });

  it('filters by status and assignee', async () => {
    await writeConfig();
    await writeTask(
      'task-010 - alpha.md',
      `---
id: task-010
status: Ready
assignee: sam
---`,
    );
    await writeTask(
      'task-011 - beta.md',
      `---
id: task-011
status: Backlog
assignee: sam
---`,
    );

    const result = await getBoard({
      baseDir: tmpDir,
      status_filter: 'Ready',
      assignee: 'sam',
    });

    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].id).toBe('task-010');
  });

  it('handles unknown statuses by keeping status as column', async () => {
    await writeConfig();
    await writeTask(
      'task-020 - unknown.md',
      `---
id: task-020
status: Blocked
---`,
    );

    const result = await getBoard({ baseDir: tmpDir });
    expect(result.tasks[0].column).toBe('Blocked');
  });

  it('skips malformed tasks but returns warning', async () => {
    await writeConfig();
    await writeTask(
      'task-030 - bad.md',
      `---
id: task-030
status: Backlog
bad: [oops
---`,
      '## Description\nbroken\n',
    );

    const result = await getBoard({ baseDir: tmpDir });
    expect(result.tasks).toHaveLength(0);
    expect(result.warnings[0].error.code).toBe(ErrorCode.TASK_PARSE_ERROR);
  });
});
