import path from 'node:path';
import { promises as fs } from 'node:fs';
import { getTaskById, type TaskDocument } from '../backlog/task-store.js';
import { wrapWithErrorHandling, ErrorCode, McpError } from '../shared/errors.js';

interface SearchParams {
  query?: string;
  status?: string[];
  assignee?: string;
  spec?: string;
  baseDir?: string;
}

interface SearchResultItem {
  id: string;
  title?: string;
  status?: string;
  assignee?: string;
  spec?: string;
}

interface SearchResult {
  results: SearchResultItem[];
}

function matchesQuery(doc: TaskDocument, q: string): boolean {
  const haystack = [
    doc.meta.id,
    doc.title,
    doc.meta.title,
    doc.meta.assignee,
    doc.meta.spec,
    doc.rawBody,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(q.toLowerCase());
}

function matchesFilters(doc: TaskDocument, params: SearchParams): boolean {
  if (params.status && params.status.length > 0) {
    if (!doc.meta.status || !params.status.includes(doc.meta.status)) return false;
  }
  if (params.assignee && doc.meta.assignee !== params.assignee) return false;
  if (params.spec && doc.meta.spec !== params.spec) return false;
  if (params.query && !matchesQuery(doc, params.query)) return false;
  return true;
}

async function searchTasks(params: SearchParams = {}): Promise<SearchResult> {
  const baseDir = params.baseDir ?? process.cwd();
  const backlogDir = path.join(baseDir, 'backlog');

  let entries: string[];
  try {
    entries = await fs.readdir(backlogDir);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      throw new McpError(ErrorCode.TASK_NOT_FOUND, 'Backlog directory not found', {
        path: backlogDir,
      });
    }
    throw error;
  }

  const tasks = entries.filter((name) => /^task-.*\\.md$/i.test(name));
  const results: SearchResultItem[] = [];

  for (const file of tasks) {
    try {
      const doc = await getTaskById(file.replace(/\\.md$/i, '').split(' - ')[0], { baseDir });
      if (!matchesFilters(doc, params)) continue;
      results.push({
        id: doc.meta.id,
        title: doc.title ?? doc.meta.title,
        status: doc.meta.status,
        assignee: doc.meta.assignee as string | undefined,
        spec: doc.meta.spec as string | undefined,
      });
    } catch {
      // skip malformed tasks but keep going
      continue;
    }
  }

  // Deterministic order
  results.sort((a, b) => a.id.localeCompare(b.id));

  return { results };
}

export const tasksSearch = {
  name: 'tasks_search',
  handler: async (params: { query?: string; status?: string[]; assignee?: string; spec?: string }) =>
    wrapWithErrorHandling(() =>
      searchTasks({
        query: params.query,
        status: params.status,
        assignee: params.assignee,
        spec: params.spec,
      }),
    ),
};
