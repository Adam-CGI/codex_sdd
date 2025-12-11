import { promises as fs } from 'node:fs';
import path from 'node:path';
import { readTask } from '../backlog/task-store.js';
import { readSpec } from '../specs/spec-store.js';
import { wrapWithErrorHandling } from '../shared/errors.js';

const SCHEMA_VERSION = '3.0';
const INDEX_VERSION = 1;

export interface IndexFeature {
  spec_id: string;
  spec_path: string;
  tasks: string[];
}

export interface IndexTaskEntry {
  title: string;
  status: string;
  spec?: string;
}

export interface BacklogIndex {
  version: number;
  schema_version: string;
  generated_at: string;
  features: IndexFeature[];
  tasks: Record<string, IndexTaskEntry>;
}

export interface RebuildIndexResult {
  index_path: string;
  stale: boolean;
  task_count: number;
  spec_count: number;
}

export interface RebuildIndexOptions {
  baseDir?: string;
  now?: () => Date;
}

/**
 * Rebuild the backlog/index.json cache from tasks and specs.
 * Returns information about the rebuild including stale detection.
 */
export async function rebuildIndex(
  baseDir = process.cwd(),
  options: RebuildIndexOptions = {},
): Promise<RebuildIndexResult> {
  const now = options.now ? options.now() : new Date();
  const timestamp = now.toISOString();
  const backlogDir = path.join(baseDir, 'backlog');
  const specsDir = path.join(baseDir, 'specs');
  const indexPath = path.join(backlogDir, 'index.json');

  // Check for stale index before rebuild
  const stale = await isIndexStale(indexPath, backlogDir, specsDir);

  // Ensure backlog directory exists
  await fs.mkdir(backlogDir, { recursive: true });

  // Read all tasks
  const taskFiles = await listMarkdownFiles(backlogDir, /^task-\d+/i);
  const tasks: Record<string, IndexTaskEntry> = {};
  const taskToSpec: Map<string, string> = new Map();

  for (const taskFile of taskFiles) {
    const taskPath = path.join(backlogDir, taskFile);
    try {
      const doc = await readTask(taskPath);
      const meta = doc.meta;
      tasks[meta.id] = {
        title: doc.title ?? meta.title ?? meta.id,
        status: meta.status ?? 'Backlog',
        ...(meta.spec ? { spec: meta.spec } : {}),
      };
      if (meta.spec) {
        taskToSpec.set(meta.id, meta.spec);
      }
    } catch {
      // Skip tasks that fail to parse
    }
  }

  // Read all specs
  const specFiles = await listMarkdownFiles(specsDir);
  const specMap: Map<string, { id: string; path: string }> = new Map();

  for (const specFile of specFiles) {
    const specPath = path.join(specsDir, specFile);
    try {
      const doc = await readSpec(specPath);
      const relPath = path.relative(baseDir, specPath);
      specMap.set(relPath, { id: doc.meta.id, path: relPath });
    } catch {
      // Skip specs that fail to parse
    }
  }

  // Build features array from specs with linked tasks
  const features: IndexFeature[] = [];
  const specToTasks: Map<string, string[]> = new Map();

  for (const [taskId, specPath] of taskToSpec) {
    const existing = specToTasks.get(specPath) ?? [];
    existing.push(taskId);
    specToTasks.set(specPath, existing);
  }

  for (const [specPath, specInfo] of specMap) {
    const linkedTasks = specToTasks.get(specPath) ?? [];
    if (linkedTasks.length > 0) {
      features.push({
        spec_id: specInfo.id,
        spec_path: specPath,
        tasks: linkedTasks.sort(),
      });
    }
  }

  // Sort features by spec_id for consistency
  features.sort((a, b) => a.spec_id.localeCompare(b.spec_id));

  const index: BacklogIndex = {
    version: INDEX_VERSION,
    schema_version: SCHEMA_VERSION,
    generated_at: timestamp,
    features,
    tasks,
  };

  await fs.writeFile(indexPath, JSON.stringify(index, null, 2) + '\n', 'utf8');

  return {
    index_path: path.relative(baseDir, indexPath),
    stale,
    task_count: Object.keys(tasks).length,
    spec_count: specMap.size,
  };
}

/**
 * Check if index.json is stale (any task/spec file is newer than generated_at).
 */
async function isIndexStale(
  indexPath: string,
  backlogDir: string,
  specsDir: string,
): Promise<boolean> {
  try {
    await fs.access(indexPath);
  } catch {
    // Index doesn't exist, so it's "stale" by default
    return true;
  }

  // Read the index to get generated_at
  let indexData: BacklogIndex;
  try {
    const content = await fs.readFile(indexPath, 'utf8');
    indexData = JSON.parse(content) as BacklogIndex;
  } catch {
    return true;
  }

  const generatedAt = new Date(indexData.generated_at).getTime();
  if (!Number.isFinite(generatedAt)) {
    return true;
  }

  // Check task files
  const taskFiles = await listMarkdownFiles(backlogDir, /^task-\d+/i);
  for (const file of taskFiles) {
    const stat = await fs.stat(path.join(backlogDir, file));
    if (stat.mtimeMs > generatedAt) {
      return true;
    }
  }

  // Check spec files
  const specFiles = await listMarkdownFiles(specsDir);
  for (const file of specFiles) {
    const stat = await fs.stat(path.join(specsDir, file));
    if (stat.mtimeMs > generatedAt) {
      return true;
    }
  }

  return false;
}

/**
 * Read existing index.json if present.
 */
export async function readIndex(baseDir = process.cwd()): Promise<BacklogIndex | null> {
  const indexPath = path.join(baseDir, 'backlog', 'index.json');
  try {
    const content = await fs.readFile(indexPath, 'utf8');
    return JSON.parse(content) as BacklogIndex;
  } catch {
    return null;
  }
}

/**
 * Check if the index is stale without rebuilding.
 */
export async function checkIndexStale(baseDir = process.cwd()): Promise<boolean> {
  const backlogDir = path.join(baseDir, 'backlog');
  const specsDir = path.join(baseDir, 'specs');
  const indexPath = path.join(backlogDir, 'index.json');
  return isIndexStale(indexPath, backlogDir, specsDir);
}

async function listMarkdownFiles(dir: string, pattern?: RegExp): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir);
    return entries.filter((name) => {
      if (!name.endsWith('.md')) return false;
      if (pattern && !pattern.test(name)) return false;
      return true;
    });
  } catch {
    return [];
  }
}

export const planningRebuildIndex = {
  name: 'planning.rebuild_index',
  handler: async () =>
    wrapWithErrorHandling(async () => {
      const result = await rebuildIndex(process.cwd());
      return {
        success: true as const,
        index_path: result.index_path,
        stale: result.stale,
        task_count: result.task_count,
        spec_count: result.spec_count,
      };
    }),
};
