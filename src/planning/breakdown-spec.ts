import { promises as fs } from 'node:fs';
import path from 'node:path';
import { readSpec, SpecError, type SpecDocument } from '../specs/spec-store.js';
import { writeTask, type TaskDocument } from '../backlog/task-store.js';
import { ErrorCode, Errors, McpError, wrapWithErrorHandling, createErrorEnvelope } from '../shared/errors.js';
import { rebuildIndex } from './rebuild-index.js';
import { resolveSpecPath as resolveSpecPathUtil, isSpecPath } from '../shared/spec-utils.js';

export interface BreakdownSpecParams {
  specPath: string;
}

export interface BreakdownSpecOptions {
  baseDir?: string;
  now?: () => Date;
  idAllocator?: (existingIds: string[], workItemCount: number) => string[];
  rebuildIndexHook?: (baseDir: string) => Promise<void>;
}

export interface BreakdownSpecResult {
  spec_id: string;
  task_ids: string[];
  summary: string;
}

const DEFAULT_SCHEMA_VERSION = '3.0';

/**
 * Generate task stubs from a spec document and persist them to /backlog.
 */
export async function breakdownSpec(
  params: BreakdownSpecParams,
  options: BreakdownSpecOptions = {},
): Promise<BreakdownSpecResult> {
  const baseDir = options.baseDir ?? process.cwd();
  const specPath = resolveSpecPath(params.specPath, baseDir);

  const spec = await loadSpecOrThrow(specPath, params.specPath);

  const workItems = extractWorkItems(spec);
  const now = options.now ? options.now() : new Date();
  const timestamp = now.toISOString();
  const backlogDir = path.join(baseDir, 'backlog');
  await fs.mkdir(backlogDir, { recursive: true });

  const existingIds = await readExistingTaskIds(backlogDir);
  const allocator = options.idAllocator ?? allocateSequentialIds;
  const newIds = allocator(existingIds, workItems.length);

  validateIdCollisions(existingIds, newIds);

  const createdTaskIds: string[] = [];
  for (let i = 0; i < workItems.length; i += 1) {
    const id = newIds[i];
    const title = workItems[i];
    const taskPath = path.join(backlogDir, buildTaskFilename(id, title));

    if (await fileExists(taskPath)) {
      throw new McpError(
        ErrorCode.CONFLICT_DETECTED,
        `Task file already exists for ${id}`,
        { taskId: id, path: taskPath },
      );
    }

    const doc: TaskDocument = {
      path: taskPath,
      meta: {
        id,
        version: 1,
        status: 'Ready for Architecture Review',
        spec: spec.meta.id,  // Store just the spec ID, not full path
        created: timestamp,
        updated: timestamp,
        schema_version: DEFAULT_SCHEMA_VERSION,
      },
      title,
      sections: buildTaskSections(title, spec),
      sectionOrder: ['Description', 'Acceptance Criteria', 'Notes'],
      preamble: undefined,
      rawBody: '',
      metaOrder: [
        'id',
        'version',
        'status',
        'assignee',
        'priority',
        'spec',
        'created',
        'updated',
        'schema_version',
      ],
    };

    await writeTask(doc);
    createdTaskIds.push(id);
  }

  const rebuild = options.rebuildIndexHook ?? rebuildIndex;
  await rebuild(baseDir);

  const summary = `Created ${createdTaskIds.length} task${
    createdTaskIds.length === 1 ? '' : 's'
  } from spec ${spec.meta.id}`;

  return {
    spec_id: spec.meta.id,
    task_ids: createdTaskIds,
    summary,
  };
}

export const planningBreakdownSpec = {
  name: 'planning_breakdown_spec',
  handler: async (params: { spec_path?: string; spec_id?: string }) => {
    // Accept either spec_path or spec_id parameter
    const specRef = params.spec_path ?? params.spec_id;

    if (!specRef || typeof specRef !== 'string' || specRef.trim().length === 0) {
      return createErrorEnvelope(
        ErrorCode.CONFIG_INVALID,
        'Missing required parameter: spec_path or spec_id. ' +
          'Example: { "spec_id": "feature-sample" } or { "spec_path": "specs/feature-sample.md" }',
        {
          providedParams: Object.keys(params).filter((k) => params[k as keyof typeof params] !== undefined),
          examples: ['{ "spec_id": "feature-sample" }', '{ "spec_path": "specs/feature-sample.md" }'],
        },
      );
    }

    return wrapWithErrorHandling(() =>
      breakdownSpec({ specPath: specRef.trim() }, { baseDir: process.cwd() }),
    );
  },
};

/**
 * Resolve spec path, handling both bare IDs and full paths.
 * Uses shared utility for normalization.
 */
function resolveSpecPath(specPath: string, baseDir: string): string {
  // If it looks like a path (contains / or .md), resolve relative to baseDir
  if (isSpecPath(specPath)) {
    return path.isAbsolute(specPath) ? specPath : path.join(baseDir, specPath);
  }
  // Otherwise treat as bare spec ID and use the utility
  return resolveSpecPathUtil(specPath, baseDir);
}

async function loadSpecOrThrow(resolvedPath: string, originalInput: string): Promise<SpecDocument> {
  try {
    return await readSpec(resolvedPath);
  } catch (error) {
    if (error instanceof SpecError && error.code === 'SPEC_NOT_FOUND') {
      throw Errors.specNotFound(originalInput);
    }
    if (error instanceof SpecError && error.code === 'SPEC_PARSE_ERROR') {
      throw new McpError(
        ErrorCode.TASK_PARSE_ERROR,
        `Failed to parse spec at ${originalInput}: ${(error as Error).message}`,
        { specPath: originalInput },
      );
    }
    throw error;
  }
}

function extractWorkItems(spec: SpecDocument): string[] {
  const priorities = [
    'Functional Requirements',
    'Tasks',
    'Goals',
    'Non-Functional Requirements',
  ];

  const items: string[] = [];
  for (const name of priorities) {
    const content = spec.sections[name];
    if (!content) continue;
    items.push(...parseBulletLines(content));
  }

  if (items.length === 0) {
    const fallback = spec.title ?? spec.meta.id ?? path.basename(spec.path);
    if (fallback) {
      items.push(fallback);
    }
  }

  return items;
}

function parseBulletLines(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/)?.[1]?.trim())
    .filter((v): v is string => Boolean(v && v.length > 0));
}

function buildTaskSections(title: string, spec: SpecDocument): Record<string, string> {
  const specRel = spec.path;
  return {
    Description: `${title}\n\nSpec: ${specRel}`,
    'Acceptance Criteria': '- [ ] Defined with maintainer',
    Notes: '',
  };
}

async function readExistingTaskIds(backlogDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(backlogDir);
    return entries
      .filter((name) => /^task-\d+/i.test(name))
      .map((name) => name.replace(path.extname(name), ''))
      .map((base) => base.split(' - ')[0]);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') return [];
    throw error;
  }
}

function allocateSequentialIds(existingIds: string[], count: number): string[] {
  let max = 0;
  for (const id of existingIds) {
    const match = id.match(/task-(\d+)/);
    if (match) {
      const num = Number.parseInt(match[1], 10);
      if (Number.isFinite(num)) {
        max = Math.max(max, num);
      }
    }
  }

  const ids: string[] = [];
  for (let i = 1; i <= count; i += 1) {
    const next = max + i;
    ids.push(`task-${String(next).padStart(3, '0')}`);
  }
  return ids;
}

function validateIdCollisions(existingIds: string[], proposedIds: string[]): void {
  const duplicatesInProposal = proposedIds.filter((id, idx) => proposedIds.indexOf(id) !== idx);
  if (duplicatesInProposal.length > 0) {
    throw new McpError(
      ErrorCode.CONFLICT_DETECTED,
      'Proposed task ids contain duplicates',
      { taskIds: duplicatesInProposal },
    );
  }

  const collisions = proposedIds.filter((id) => existingIds.includes(id));
  if (collisions.length > 0) {
    throw new McpError(
      ErrorCode.CONFLICT_DETECTED,
      'Task ids already exist',
      { taskIds: collisions },
    );
  }
}

function buildTaskFilename(id: string, title: string): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);

  const safeTitle = cleaned.length > 0 ? cleaned : 'Task';
  return `${id} - ${safeTitle}.md`;
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
