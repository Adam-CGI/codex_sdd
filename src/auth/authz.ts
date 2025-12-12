import path from 'node:path';
import { loadConfig, type KanbanConfig } from '../config/config-loader.js';
import { Errors } from '../shared/errors.js';
import type { TaskDocument } from '../backlog/task-store.js';
import { appendAuditLog } from '../audit/audit-log.js';
import { logger } from '../observability/logger.js';

/**
 * Environment variable keys checked for caller identification (in priority order).
 * Set SDD_CALLER_ID or MCP_CALLER_ID to avoid passing caller_id on every call.
 */
const ENV_CALLER_ID_KEYS = ['SDD_CALLER_ID', 'MCP_CALLER_ID'] as const;

/**
 * Environment variable to enable trust-local mode.
 * When SDD_TRUST_LOCAL=true, operations without a caller_id will use the first
 * maintainer from config, enabling frictionless local development.
 */
const TRUST_LOCAL_ENV = 'SDD_TRUST_LOCAL';

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

/**
 * Resolve caller ID from context, environment variables, or return undefined.
 * Priority: ctx.caller.id > ctx.callerId > SDD_CALLER_ID > MCP_CALLER_ID
 */
function resolveCallerId(ctx: AuthContext): string | undefined {
  // 1. Explicit caller in context takes priority
  if (ctx.caller?.id) return ctx.caller.id;
  if (ctx.callerId) return ctx.callerId;

  // 2. Environment variable fallback
  for (const key of ENV_CALLER_ID_KEYS) {
    const value = process.env[key];
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

/**
 * Check if trust-local mode is enabled via environment variable.
 */
function isTrustLocalEnabled(): boolean {
  return process.env[TRUST_LOCAL_ENV] === 'true';
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
 *
 * In trust-local mode (SDD_TRUST_LOCAL=true), if no caller is identified,
 * uses the first maintainer from config for frictionless local development.
 */
export function assertTaskMutationAllowed(
  task: TaskDocument,
  config: KanbanConfig,
  ctx: AuthContext,
  operation: string,
): void {
  let callerId = resolveCallerId(ctx);

  // Trust-local mode: use first maintainer if no caller identified
  if (!callerId && isTrustLocalEnabled()) {
    const firstMaintainer = config.roles?.maintainers?.[0];
    if (firstMaintainer) {
      callerId = firstMaintainer;
      logger.debug({ callerId, operation }, 'Trust-local mode: using first maintainer');
    }
  }

  // Default to 'unknown' for error reporting
  const effectiveCallerId = callerId ?? 'unknown';
  const allowed = isMaintainer(config, effectiveCallerId) || isAssignee(task, effectiveCallerId);

  if (!allowed) {
    // Debug logging to help troubleshoot auth failures
    logger.debug({
      callerId: effectiveCallerId,
      taskId: task.meta.id,
      taskAssignee: task.meta.assignee,
      maintainers: config.roles?.maintainers ?? [],
      operation,
    }, 'Authorization check failed');

    throw Errors.unauthorized(effectiveCallerId, operation);
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
 * Supports trust-local mode for frictionless local development.
 */
export function assertMaintainer(
  config: KanbanConfig,
  ctx: AuthContext,
  operation: string,
): void {
  let callerId = resolveCallerId(ctx);

  // Trust-local mode: use first maintainer if no caller identified
  if (!callerId && isTrustLocalEnabled()) {
    const firstMaintainer = config.roles?.maintainers?.[0];
    if (firstMaintainer) {
      callerId = firstMaintainer;
      logger.debug({ callerId, operation }, 'Trust-local mode: using first maintainer');
    }
  }

  const effectiveCallerId = callerId ?? 'unknown';
  if (!isMaintainer(config, effectiveCallerId)) {
    logger.debug({
      callerId: effectiveCallerId,
      maintainers: config.roles?.maintainers ?? [],
      operation,
    }, 'Maintainer check failed');

    throw Errors.unauthorized(effectiveCallerId, operation);
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
