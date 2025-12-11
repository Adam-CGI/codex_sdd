import path from 'node:path';
import { loadConfig, type KanbanConfig } from '../config/config-loader.js';
import { Errors } from '../shared/errors.js';
import type { TaskDocument } from '../backlog/task-store.js';
import { appendAuditLog } from '../audit/audit-log.js';

export type CallerType = 'human' | 'agent';

export interface Caller {
  type: CallerType;
  id: string;
  roles?: string[];
}

export interface AuthContext {
  baseDir?: string;
  callerId?: string;
  caller?: Caller;
}

function resolveCallerId(ctx: AuthContext): string | undefined {
  return ctx.caller?.id ?? ctx.callerId;
}

function isMaintainer(config: KanbanConfig, callerId: string | undefined): boolean {
  if (!callerId) return false;
  const maintainers = config.roles?.maintainers ?? [];
  return maintainers.includes(callerId);
}

function isAssignee(task: TaskDocument, callerId: string | undefined): boolean {
  if (!callerId) return false;
  return task.meta.assignee === callerId;
}

/**
 * Ensure the caller is permitted to mutate the given task (assignee or maintainer).
 * Throws UNAUTHORIZED when the caller is missing or lacks rights.
 */
export function assertTaskMutationAllowed(
  task: TaskDocument,
  config: KanbanConfig,
  ctx: AuthContext,
  operation: string,
): void {
  const callerId = resolveCallerId(ctx) ?? 'unknown';
  const allowed = isMaintainer(config, callerId) || isAssignee(task, callerId);

  if (!allowed) {
    throw Errors.unauthorized(callerId, operation);
  }
}

/**
 * Gate for coding.* operations: caller must be assignee or maintainer AND task in in_progress_statuses.
 */
export function assertCodingAllowed(
  task: TaskDocument,
  config: KanbanConfig,
  ctx: AuthContext,
  operation: string,
): void {
  assertTaskMutationAllowed(task, config, ctx, operation);

  const inProgressSet = new Set(config.in_progress_statuses ?? []);
  const status = task.meta.status ?? 'undefined';
  if (!inProgressSet.has(status)) {
    throw Errors.gateViolation(task.meta.id, status);
  }
}

/**
 * Maintain access check for maintainer-only operations.
 */
export function assertMaintainer(
  config: KanbanConfig,
  ctx: AuthContext,
  operation: string,
): void {
  const callerId = resolveCallerId(ctx) ?? 'unknown';
  if (!isMaintainer(config, callerId)) {
    throw Errors.unauthorized(callerId, operation);
  }
}

/**
 * Append a best-effort audit entry for mutating operations.
 */
export async function audit(operation: string, context: Record<string, unknown>, ctx: AuthContext): Promise<void> {
  const callerId = resolveCallerId(ctx) ?? 'unknown';
  const baseDir = ctx.baseDir ?? process.cwd();
  await appendAuditLog({
    baseDir,
    callerId,
    operation,
    context,
  }).catch(() => undefined);
}

/**
 * Convenience helper: load config and return alongside baseDir.
 */
export async function loadConfigForAuth(baseDir?: string): Promise<{ config: KanbanConfig; baseDir: string }> {
  const resolvedBase = baseDir ?? process.cwd();
  const { config } = await loadConfig(resolvedBase);
  return { config, baseDir: resolvedBase };
}

export function resolveAuditPath(baseDir: string): string {
  return path.join(baseDir, 'backlog', '.audit.jsonl');
}
