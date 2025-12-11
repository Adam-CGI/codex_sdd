import { promises as fs } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import YAML from 'yaml';
import { Errors } from '../shared/errors.js';

const BACKLOG_DIR = 'backlog';
const DEFAULT_SCHEMA_VERSION = '3.0';

export interface TaskMeta {
  id: string;
  status?: string;
  assignee?: string;
  priority?: string;
  spec?: string;
  version?: number;
  schema_version?: string;
  [key: string]: unknown;
}

export interface TaskDocument {
  path: string;
  meta: TaskMeta;
  sections: Record<string, string>;
  sectionOrder: string[];
  preamble?: string;
  rawBody: string;
}

/**
 * Get a task by id (e.g., "task-001") from the backlog directory.
 * Throws McpError with appropriate error codes on failure.
 */
export async function getTaskById(
  taskId: string,
  options?: { baseDir?: string },
): Promise<TaskDocument> {
  const baseDir = options?.baseDir ?? process.cwd();
  const taskPath = await resolveTaskPath(taskId, baseDir);
  const doc = await readTaskFile(taskPath, taskId);
  return doc;
}

async function resolveTaskPath(taskId: string, baseDir: string): Promise<string> {
  const backlogPath = path.join(baseDir, BACKLOG_DIR);
  let entries: string[];
  try {
    entries = await fs.readdir(backlogPath);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      throw Errors.taskNotFound(taskId);
    }
    throw error;
  }

  const match = entries.find((name) =>
    name.toLowerCase().startsWith(taskId.toLowerCase()),
  );

  if (!match) {
    throw Errors.taskNotFound(taskId);
  }

  return path.join(backlogPath, match);
}

async function readTaskFile(taskPath: string, expectedId: string): Promise<TaskDocument> {
  let fileContent: string;
  try {
    fileContent = await fs.readFile(taskPath, 'utf8');
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      throw Errors.taskNotFound(expectedId);
    }
    throw error;
  }

  let parsed;
  try {
    parsed = matter(fileContent, {
      engines: {
        yaml: (input): unknown => YAML.parse(input),
      },
    });
  } catch (error) {
    throw Errors.taskParseError(expectedId, (error as Error).message);
  }

  const { data, content } = parsed;
  const meta: TaskMeta = {
    ...(data as Record<string, unknown>),
  } as TaskMeta;

  const filenameId = deriveIdFromFilename(taskPath);

  if (!meta.id) {
    meta.id = filenameId;
  }

  if (meta.id !== filenameId) {
    throw Errors.taskIdMismatch(filenameId, meta.id);
  }

  if (!meta.schema_version) {
    meta.schema_version = DEFAULT_SCHEMA_VERSION;
  }

  const { sections, sectionOrder, preamble } = parseBody(content);

  return {
    path: taskPath,
    meta,
    sections,
    sectionOrder,
    preamble,
    rawBody: content,
  };
}

function deriveIdFromFilename(filePath: string): string {
  const base = path.basename(filePath, path.extname(filePath));
  const [id] = base.split(' - ');
  return id;
}

function parseBody(content: string): {
  sections: Record<string, string>;
  sectionOrder: string[];
  preamble?: string;
} {
  const lines = content.split(/\r?\n/);
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
    const h2Match = line.match(/^##\s+(.*)$/);
    if (h2Match) {
      if (currentSection !== null) {
        flush();
      }
      currentSection = h2Match[1].trim();
      order.push(currentSection);
      continue;
    }

    if (currentSection === null) {
      preambleLines.push(line);
    } else {
      buffer.push(line);
    }
  }

  flush();

  const preamble = trimTrailingNewlines(preambleLines.join('\n')) || undefined;

  return { sections, sectionOrder: order, preamble };
}

function trimTrailingNewlines(value: string): string {
  return value.replace(/\n+$/, '');
}
