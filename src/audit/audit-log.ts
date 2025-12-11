import { promises as fs } from 'node:fs';
import path from 'node:path';
import { resolveAuditPath } from '../auth/authz.js';

export interface AuditEntry {
  timestamp: string;
  callerId: string;
  operation: string;
  context: Record<string, unknown>;
}

/**
 * Append a JSONL audit entry. Creates the log file and parent directory if missing.
 * Best-effort; callers may swallow errors.
 */
export async function appendAuditLog(params: {
  baseDir: string;
  callerId: string;
  operation: string;
  context: Record<string, unknown>;
}): Promise<void> {
  const entry: AuditEntry = {
    timestamp: new Date().toISOString(),
    callerId: params.callerId,
    operation: params.operation,
    context: params.context,
  };

  const auditPath = resolveAuditPath(params.baseDir);
  const dir = path.dirname(auditPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.appendFile(auditPath, `${JSON.stringify(entry)}\n`, 'utf8');
}
