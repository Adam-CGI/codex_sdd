import { ErrorCode, Errors } from '../shared/errors.js';
import { getTaskById, writeTask, type TaskDocument } from './task-store.js';
import { loadConfig } from '../config/config-loader.js';

export interface MoveTaskParams {
  taskId: string;
  version: number;
  toStatus: string;
  force?: boolean;
}

export interface MoveTaskOptions {
  baseDir?: string;
  callerId?: string;
  caller?: import('../auth/authz.js').Caller;
}

export interface MoveTaskResult {
  success: true;
  old_status: string;
  new_status: string;
  meta: TaskDocument['meta'];
}

/**
 * Move a task to a new status, enforcing config-driven transitions,
 * dependency gates, and optimistic version checks.
 */
export async function moveTask(
  params: MoveTaskParams,
  options: MoveTaskOptions = {},
): Promise<MoveTaskResult> {
  const baseDir = options.baseDir ?? process.cwd();
  const { taskId, version, toStatus, force } = params;

  const { config } = await loadConfig(baseDir);

  if (!config.statuses.includes(toStatus)) {
    throw Errors.taskInvalidStatus(taskId, toStatus);
  }

  const task = await getTaskById(taskId, { baseDir });
  const currentStatus = task.meta.status ?? '';

  // Auth: only maintainer or assignee may move tasks
  const { assertTaskMutationAllowed, audit } = await import('../auth/authz.js');
  assertTaskMutationAllowed(task, config, options, 'tasks_move');

  if (task.meta.version !== version) {
    throw Errors.conflictDetected(task.meta.id, version, task.meta.version);
  }

  const isMaintainer = options.callerId
    ? (config.roles?.maintainers ?? []).includes(options.callerId)
    : false;
  const forceByMaintainer = force === true && isMaintainer;

  const transitions = config.transitions ?? {};
  const transitionsDefined = Object.keys(transitions).length > 0;
  if (transitionsDefined && !forceByMaintainer) {
    const allowedTargets = transitions[currentStatus] ?? [];
    if (!allowedTargets.includes(toStatus)) {
      throw Errors.invalidTransition(taskId, currentStatus, toStatus);
    }
  }

  const inProgressSet = new Set(config.in_progress_statuses ?? []);
  if (inProgressSet.has(toStatus) && !forceByMaintainer) {
    const unmet = await findUnmetDependencies(task, baseDir);
    if (unmet.length > 0) {
      throw Errors.dependenciesNotMet(taskId, unmet);
    }
  }

  task.meta.status = toStatus;
  task.meta.version = version + 1;
  task.meta.updated = new Date().toISOString();

  await writeTask(task, { expectedVersion: version });

  // Audit best-effort
  await audit('tasks_move', { taskId, from: currentStatus, to: toStatus }, { ...options, baseDir });

  return {
    success: true,
    old_status: currentStatus,
    new_status: toStatus,
    meta: task.meta,
  };
}

async function findUnmetDependencies(task: TaskDocument, baseDir: string): Promise<string[]> {
  const deps = task.meta.depends_on ?? [];
  if (deps.length === 0) return [];

  const unmet: string[] = [];

  for (const depId of deps) {
    try {
      const dep = await getTaskById(depId, { baseDir });
      if (dep.meta.status !== 'Done') {
        unmet.push(depId);
      }
    } catch (error) {
      const code = (error as { code?: ErrorCode }).code;
      if (code === ErrorCode.TASK_NOT_FOUND || code === ErrorCode.TASK_PARSE_ERROR) {
        unmet.push(depId);
        continue;
      }
      throw error;
    }
  }

  return unmet;
}
