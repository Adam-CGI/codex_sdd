import { promises as fs } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import YAML from 'yaml';
import { Errors } from '../shared/errors.js';

export interface TaskMeta {
  id: string;
  title?: string;
  status?: string;
  version: number;
  spec?: string;
  assignee?: string;
  priority?: string;
  created?: string;
  updated?: string;
  branch?: string;
  pr_url?: string;
  depends_on?: string[];
  schema_version?: string;
  // Preserve unknown metadata keys
  [key: string]: unknown;
}

export interface TaskDocument {
  path: string;
  meta: TaskMeta;
  title?: string;
  sections: Record<string, string>;
  sectionOrder: string[];
  preamble?: string;
  rawBody: string;
  metaOrder: string[];
}

const DEFAULT_SCHEMA_VERSION = '3.0';

/**
  * Derive task id from filename (task-### - Title.md → task-###).
  */
export function deriveIdFromFilename(filePath: string): string {
  const base = path.basename(filePath, path.extname(filePath));
  const [id] = base.split(' - ');
  return id;
}

/**
 * Ensure the metadata id matches the filename-derived id.
 */
export function assertPathMatchesId(filePath: string, metaId: string): void {
  const filenameId = deriveIdFromFilename(filePath);
  if (filenameId !== metaId) {
    throw Errors.taskIdMismatch(filenameId, metaId);
  }
}

/**
 * Resolve a task by id (task-###) relative to baseDir/backlog.
 */
export async function getTaskById(
  taskId: string,
  options: { baseDir?: string } = {},
): Promise<TaskDocument> {
  const baseDir = options.baseDir ?? process.cwd();
  const taskPath = await resolveTaskPath(taskId, baseDir);
  return readTask(taskPath);
}

/**
 * Find the path for a task id under /backlog.
 */
export async function resolveTaskPath(taskId: string, baseDir: string): Promise<string> {
  const backlogDir = path.join(baseDir, 'backlog');
  let entries: string[];
  try {
    entries = await fs.readdir(backlogDir);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      throw Errors.taskNotFound(taskId);
    }
    throw error;
  }

  const matcher = new RegExp(`^${escapeRegExp(taskId)}\\s*-\\s*.*\\.md$`, 'i');
  const match = entries.find((name) => matcher.test(name));
  if (!match) {
    throw Errors.taskNotFound(taskId);
  }

  return path.join(backlogDir, match);
}

/**
 * Read and parse a task markdown file into structured data.
 */
export async function readTask(taskPath: string): Promise<TaskDocument> {
  const taskIdFromPath = deriveIdFromFilename(taskPath);
  let fileContent: string;

  try {
    fileContent = await fs.readFile(taskPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw Errors.taskNotFound(taskIdFromPath);
    }
    throw error;
  }

  let parsed;
  try {
    parsed = matter(fileContent);
  } catch (error) {
    throw Errors.taskParseError(taskIdFromPath, (error as Error).message);
  }

  let hasFrontmatter = parsed.matter !== undefined && parsed.matter.trim().length > 0;
  let frontmatterMeta = hasFrontmatter
    ? parseFrontmatterBlock(parsed.matter, taskIdFromPath)
    : ((parsed.data ?? {}) as Record<string, unknown>);
  let bodyContent = parsed.content;

  // gray-matter may skip parsing if YAML is malformed; detect explicit frontmatter start manually
  if (!hasFrontmatter && fileContent.trimStart().startsWith('---')) {
    const match = fileContent.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
    if (!match) {
      throw Errors.taskParseError(taskIdFromPath, 'Frontmatter is not closed with ---');
    }
    const block = match[0];
    frontmatterMeta = parseFrontmatterBlock(block, taskIdFromPath);
    bodyContent = fileContent.slice(block.length);
    hasFrontmatter = true;
  }

  const { meta: inlineMeta, body: bodyWithoutInline } = extractInlineMetadata(
    bodyContent,
    taskIdFromPath,
  );

  // Merge inline + frontmatter with frontmatter taking precedence
  const mergedMeta: Record<string, unknown> = { ...inlineMeta, ...frontmatterMeta };

  const metaOrder = buildMetaOrder(hasFrontmatter, frontmatterMeta, inlineMeta);

  const normalizedMeta = normalizeMeta(mergedMeta, taskIdFromPath);
  assertPathMatchesId(taskPath, normalizedMeta.id);

  const { title, sections, sectionOrder, preamble } = parseBody(bodyWithoutInline);
  const finalTitle = title ?? (typeof mergedMeta.title === 'string' ? mergedMeta.title : undefined);

  if (finalTitle) {
    normalizedMeta.title = finalTitle;
  }

  return {
    path: taskPath,
    meta: normalizedMeta,
    title: finalTitle,
    sections,
    sectionOrder,
    preamble,
    rawBody: bodyWithoutInline,
    metaOrder,
  };
}

/**
 * Write a task document back to disk.
 * Optionally performs optimistic locking when expectedVersion is provided.
 */
export async function writeTask(
  doc: TaskDocument,
  options?: { expectedVersion?: number },
): Promise<void> {
  const filenameId = deriveIdFromFilename(doc.path);
  assertPathMatchesId(doc.path, doc.meta.id ?? filenameId);

  if (options?.expectedVersion !== undefined) {
    const current = await readTask(doc.path);
    if (current.meta.version !== options.expectedVersion) {
      throw Errors.conflictDetected(doc.meta.id, options.expectedVersion, current.meta.version);
    }
  }

  const metaForOutput = buildOrderedMeta(doc.meta, doc.metaOrder);
  const body = buildBody(doc.title ?? doc.meta.title, doc.preamble, doc.sections, doc.sectionOrder);
  const output = matter.stringify(body, metaForOutput);

  await fs.mkdir(path.dirname(doc.path), { recursive: true });
  await fs.writeFile(doc.path, output, 'utf8');
}

function extractInlineMetadata(
  body: string,
  taskId: string,
): { meta: Record<string, unknown>; body: string } {
  const lines = body.split(/\r?\n/);
  const metaLines: string[] = [];
  let endOfMeta = 0;
  let started = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === '') {
      if (started) {
        endOfMeta = i + 1;
        break;
      }
      continue;
    }

    if (/^[A-Za-z0-9_.-]+\s*:\s*/.test(line)) {
      started = true;
      metaLines.push(line);
      endOfMeta = i + 1;
      continue;
    }

    endOfMeta = i;
    break;
  }

  if (!started || metaLines.length === 0) {
    return { meta: {}, body };
  }

  let parsedInline: Record<string, unknown> = {};
  try {
    parsedInline = (YAML.parse(metaLines.join('\n')) ?? {}) as Record<string, unknown>;
  } catch (error) {
    throw Errors.taskParseError(taskId, `Inline metadata: ${(error as Error).message}`);
  }

  const remainder = lines.slice(endOfMeta).join('\n').replace(/^\n+/, '');
  return { meta: parsedInline, body: remainder };
}

function parseFrontmatterBlock(matterBlock: string, taskId: string): Record<string, unknown> {
  const withoutDelimiters = matterBlock
    .replace(/^---\s*\n?/, '')
    .replace(/\n---\s*$/, '')
    .replace(/\n\.\.\.\s*$/, '');

  try {
    return (YAML.parse(withoutDelimiters) ?? {}) as Record<string, unknown>;
  } catch (error) {
    throw Errors.taskParseError(taskId, (error as Error).message);
  }
}

function buildMetaOrder(
  hasFrontmatter: boolean,
  frontmatterMeta: Record<string, unknown>,
  inlineMeta: Record<string, unknown>,
): string[] {
  const order: string[] = [];

  if (hasFrontmatter) {
    order.push(...Object.keys(frontmatterMeta));
  } else {
    order.push(...Object.keys(inlineMeta));
  }

  for (const key of Object.keys(inlineMeta)) {
    if (!order.includes(key)) {
      order.push(key);
    }
  }
  for (const key of Object.keys(frontmatterMeta)) {
    if (!order.includes(key)) {
      order.push(key);
    }
  }

  return order;
}

function normalizeMeta(rawMeta: Record<string, unknown>, fallbackId: string): TaskMeta {
  const normalized: TaskMeta = { ...rawMeta } as TaskMeta;
  normalized.id = normalizeId(rawMeta.id, fallbackId);
  normalized.version = normalizeVersion(rawMeta.version);
  normalized.schema_version = normalizeSchema(rawMeta.schema_version);
  const depends = normalizeDependsOn(rawMeta.depends_on);
  if (depends !== undefined) {
    normalized.depends_on = depends;
  }
  return normalized;
}

function normalizeId(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return fallback;
}

function normalizeVersion(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const num = Number(value);
    if (Number.isFinite(num)) {
      return num;
    }
  }
  return 1;
}

function normalizeSchema(value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  return DEFAULT_SCHEMA_VERSION;
}

function normalizeDependsOn(value: unknown): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (Array.isArray(value)) {
    const cleaned = value
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .filter((v) => v.length > 0);
    return cleaned;
  }

  if (typeof value === 'string') {
    const parts = value
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
    return parts;
  }

  return undefined;
}

function parseBody(content: string): {
  title?: string;
  sections: Record<string, string>;
  sectionOrder: string[];
  preamble?: string;
} {
  const lines = content.split(/\r?\n/);
  let title: string | undefined;
  const sections: Record<string, string> = {};
  const order: string[] = [];
  let currentSection: string | null = null;
  let buffer: string[] = [];
  const preambleLines: string[] = [];

  const flush = (): void => {
    if (currentSection) {
      sections[currentSection] = trimTrailingNewlines(buffer.join('\n'));
    }
    buffer = [];
  };

  for (const line of lines) {
    const h1Match = line.match(/^#\s+(.*)$/);
    if (h1Match && !title) {
      title = h1Match[1].trim();
      continue;
    }

    const h2Match = line.match(/^##\s+(.*)$/);
    if (h2Match) {
      if (currentSection !== null) {
        flush();
      }
      currentSection = h2Match[1].trim();
      order.push(currentSection);
      buffer = [];
      continue;
    }

    if (currentSection === null) {
      preambleLines.push(line);
    } else {
      buffer.push(line);
    }
  }

  if (currentSection !== null) {
    flush();
  }

  const preamble = trimTrailingNewlines(preambleLines.join('\n')).trim();

  return {
    title,
    sections,
    sectionOrder: order,
    preamble: preamble.length > 0 ? preamble : undefined,
  };
}

function buildBody(
  title: string | undefined,
  preamble: string | undefined,
  sections: Record<string, string>,
  order: string[],
): string {
  const parts: string[] = [];

  if (title) {
    parts.push(`# ${title}`, '');
  }

  if (preamble) {
    parts.push(preamble.trimEnd(), '');
  }

  for (const name of order) {
    const body = sections[name];
    if (body === undefined) {
      continue;
    }
    parts.push(`## ${name}`);
    if (body.length > 0) {
      parts.push(body.trimEnd());
    }
    parts.push('');
  }

  for (const [name, body] of Object.entries(sections)) {
    if (order.includes(name)) continue;
    parts.push(`## ${name}`);
    if (body.length > 0) {
      parts.push(body.trimEnd());
    }
    parts.push('');
  }

  if (parts.length === 0) return '';
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

function buildOrderedMeta(meta: TaskMeta, order: string[]): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  const schemaVersion = normalizeSchema(meta.schema_version);
  const depends = normalizeDependsOn(meta.depends_on);
  const version = normalizeVersion(meta.version);

  const merged: Record<string, unknown> = {
    ...meta,
    id: meta.id,
    version,
    schema_version: schemaVersion,
  };

  if (depends !== undefined) {
    merged.depends_on = depends;
  }

  // Unless explicitly present originally, avoid writing derived title into frontmatter.
  if (!order.includes('title')) {
    delete merged.title;
  }

  const seen = new Set<string>();
  const orderedKeys = [...order, ...Object.keys(merged)];

  for (const key of orderedKeys) {
    if (seen.has(key)) continue;
    seen.add(key);
    const value = merged[key];
    if (value === undefined) continue;
    normalized[key] = value;
  }

  return normalized;
}

function trimTrailingNewlines(value: string): string {
  return value.replace(/[\r\n]+$/, '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
