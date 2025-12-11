import { promises as fs } from 'node:fs';
import { Errors } from '../shared/errors.js';
import { loadConfig } from '../config/config-loader.js';
import { getTaskById, resolveTaskPath, writeTask, type TaskDocument, type TaskMeta } from './task-store.js';

export interface UpdateTaskParams {
  taskId: string;
  version: number;
  meta?: Partial<TaskMeta>;
  sections?: Record<string, string>;
}

export interface UpdateTaskOptions {
  baseDir?: string;
  callerId?: string;
  caller?: import('../auth/authz.js').Caller;
}

export interface UpdateTaskResult {
  success: true;
  meta: TaskMeta;
}

interface LockHandle {
  path: string;
  handle: fs.FileHandle;
}

/**
 * Apply partial metadata/section updates with optimistic locking and
 * best-effort advisory file locks.
 */
export async function updateTask(
  params: UpdateTaskParams,
  options: UpdateTaskOptions = {},
): Promise<UpdateTaskResult> {
  const baseDir = options.baseDir ?? process.cwd();
  const taskPath = await resolveTaskPath(params.taskId, baseDir);
  const lock = await acquireTaskLock(taskPath, params.taskId);

  try {
    const task = await getTaskById(params.taskId, { baseDir });
    const { config } = await loadConfig(baseDir);
    const { assertTaskMutationAllowed, audit } = await import('../auth/authz.js');
    assertTaskMutationAllowed(task, config, options, 'tasks.update');

    if (task.meta.version !== params.version) {
      throw Errors.conflictDetected(task.meta.id, params.version, task.meta.version);
    }

    const metaOrder = [...task.metaOrder];
    const sectionOrder = [...task.sectionOrder];

    const updatedMeta = applyMetaUpdates(task.meta, metaOrder, params.meta);
    const updatedSections = applySectionUpdates(task.sections, sectionOrder, params.sections);

    updatedMeta.updated = new Date().toISOString();
    updatedMeta.version = params.version + 1;

    const updatedDoc: TaskDocument = {
      ...task,
      meta: updatedMeta,
      sections: updatedSections,
      sectionOrder,
      metaOrder,
    };

    await writeTask(updatedDoc, { expectedVersion: params.version });

    await audit(
      'tasks.update',
      { taskId: params.taskId, metaUpdated: Boolean(params.meta), sectionsUpdated: Boolean(params.sections) },
      { ...options, baseDir },
    );

    return { success: true, meta: updatedMeta };
  } finally {
    await releaseTaskLock(lock);
  }
}

function applyMetaUpdates(
  meta: TaskMeta,
  metaOrder: string[],
  updates?: Partial<TaskMeta>,
): TaskMeta {
  const next: TaskMeta = { ...meta };
  if (!updates) return next;

  for (const [key, value] of Object.entries(updates)) {
    if (key === 'version') continue;
    if (key === 'id') {
      if (typeof value === 'string' && value !== meta.id) {
        throw Errors.taskIdMismatch(meta.id, value);
      }
      continue;
    }

    if (value === undefined) continue;
    next[key] = value as unknown;

    if (!metaOrder.includes(key)) {
      metaOrder.push(key);
    }
  }

  return next;
}

function applySectionUpdates(
  sections: Record<string, string>,
  sectionOrder: string[],
  updates?: Record<string, string>,
): Record<string, string> {
  const next: Record<string, string> = { ...sections };
  if (!updates) return next;

  for (const [name, body] of Object.entries(updates)) {
    next[name] = body;
    if (!sectionOrder.includes(name)) {
      sectionOrder.push(name);
    }
  }

  return next;
}

async function acquireTaskLock(taskPath: string, taskId: string): Promise<LockHandle> {
  const lockPath = `${taskPath}.lock`;
  try {
    const handle = await fs.open(lockPath, 'wx');
    return { path: lockPath, handle };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'EEXIST') {
      throw Errors.taskLocked(taskId);
    }
    throw error;
  }
}

async function releaseTaskLock(lock: LockHandle): Promise<void> {
  try {
    await lock.handle.close();
  } catch {
    // ignore close errors
  }

  try {
    await fs.unlink(lock.path);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== 'ENOENT') {
      // surfaces unexpected unlink errors
      throw error;
    }
  }
}
