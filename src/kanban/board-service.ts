import path from 'node:path';
import { ErrorCode, createErrorEnvelope } from '../shared/errors.js';
import { getTaskById, type TaskDocument } from '../backlog/task-store.js';
import { loadConfig } from '../config/config-loader.js';

export interface BoardFilters {
  status_filter?: string | string[];
  assignee?: string;
  spec_id?: string;
  page?: number;
  page_size?: number;
  baseDir?: string;
}

export interface BoardTaskSummary {
  id: string;
  status?: string;
  column: string;
  assignee?: string;
  spec?: string;
  path: string;
  meta: TaskDocument['meta'];
}

export interface BoardResult {
  tasks: BoardTaskSummary[];
  page: number;
  page_size: number;
  total_tasks: number;
  has_next: boolean;
  warnings: ReturnType<typeof createErrorEnvelope>[];
}

const DEFAULT_PAGE_SIZE = 20;

/**
 * Read tasks from /backlog, apply filters, paginate, and map statuses to columns.
 * Handles parse errors gracefully by emitting warnings and skipping invalid tasks.
 */
export async function getBoard(filters: BoardFilters = {}): Promise<BoardResult> {
  const baseDir = filters.baseDir ?? process.cwd();
  const backlogPath = path.join(baseDir, 'backlog');

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, filters.page_size ?? DEFAULT_PAGE_SIZE);

  const statusFilterSet = toSet(filters.status_filter);

  const { config } = await loadConfig(baseDir);
  const statusToColumn = invertColumns(config.columns);

  const warnings: BoardResult['warnings'] = [];
  let entries: string[] = [];

  try {
    entries = await (await import('node:fs/promises')).readdir(backlogPath);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      return {
        tasks: [],
        page,
        page_size: pageSize,
        total_tasks: 0,
        has_next: false,
        warnings: [
          createErrorEnvelope(ErrorCode.TASK_NOT_FOUND, 'Backlog directory not found', {
            path: backlogPath,
          }),
        ],
      };
    }
    throw error;
  }

  const taskFiles = entries.filter((name) => name.toLowerCase().startsWith('task-') && name.endsWith('.md'));

  const summaries: BoardTaskSummary[] = [];
  for (const filename of taskFiles) {
    const id = filename.split(' - ')[0];
    try {
      const doc = await getTaskById(id, { baseDir });
      if (!passesFilters(doc, filters, statusFilterSet)) {
        continue;
      }
      const column = statusToColumn.get(doc.meta.status ?? '') ?? (doc.meta.status ?? 'Unknown');
      summaries.push({
        id: doc.meta.id,
        status: doc.meta.status,
        column,
        assignee: doc.meta.assignee as string | undefined,
        spec: doc.meta.spec as string | undefined,
        path: doc.path,
        meta: doc.meta,
      });
    } catch (error) {
      const mcpErr = error as { code?: ErrorCode; message?: string };
      if (mcpErr.code === ErrorCode.TASK_PARSE_ERROR) {
        warnings.push(
          createErrorEnvelope(ErrorCode.TASK_PARSE_ERROR, mcpErr.message ?? 'Failed to parse task', {
            taskId: id,
          }),
        );
        continue; // skip malformed task
      }
      if (mcpErr.code === ErrorCode.TASK_ID_MISMATCH) {
        warnings.push(
          createErrorEnvelope(ErrorCode.TASK_ID_MISMATCH, mcpErr.message ?? 'Task ID mismatch', {
            taskId: id,
          }),
        );
        continue;
      }
      // rethrow unexpected errors
      throw error;
    }
  }

  // Sort by id for deterministic pagination
  summaries.sort((a, b) => a.id.localeCompare(b.id));

  const total = summaries.length;
  const start = (page - 1) * pageSize;
  const paged = summaries.slice(start, start + pageSize);
  const hasNext = start + pageSize < total;

  return {
    tasks: paged,
    page,
    page_size: pageSize,
    total_tasks: total,
    has_next: hasNext,
    warnings,
  };
}

function passesFilters(
  doc: TaskDocument,
  filters: BoardFilters,
  statusFilterSet: Set<string> | null,
): boolean {
  if (statusFilterSet && doc.meta.status && !statusFilterSet.has(doc.meta.status)) {
    return false;
  }
  if (filters.assignee && doc.meta.assignee !== filters.assignee) {
    return false;
  }
  if (filters.spec_id && doc.meta.spec !== filters.spec_id) {
    return false;
  }
  return true;
}

function toSet(value?: string | string[]): Set<string> | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    return new Set(value);
  }
  return new Set([value]);
}

function invertColumns(columns: Record<string, string>): Map<string, string> {
  const map = new Map<string, string>();
  for (const [columnKey, status] of Object.entries(columns ?? {})) {
    map.set(status, columnKey);
  }
  return map;
}
