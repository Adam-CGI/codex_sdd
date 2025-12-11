import { promises as fs } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

export type SpecErrorCode = 'SPEC_NOT_FOUND' | 'SPEC_PARSE_ERROR';

export class SpecError extends Error {
  code: SpecErrorCode;

  constructor(code: SpecErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export interface SpecMeta {
  id: string;
  status?: string;
  schema_version?: string;
  [key: string]: unknown;
}

export interface SpecDocument {
  path: string;
  meta: SpecMeta;
  title?: string;
  sections: Record<string, string>;
  sectionOrder: string[];
  preamble?: string;
  rawBody: string;
}

const DEFAULT_SCHEMA_VERSION = '3.0';

/**
 * Parse a spec markdown file into structured content.
 * - Frontmatter (YAML) → meta
 * - H1 → title
 * - H2 headings → sections map, preserving order
 */
export async function readSpec(specPath: string): Promise<SpecDocument> {
  let fileContent: string;
  try {
    fileContent = await fs.readFile(specPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new SpecError('SPEC_NOT_FOUND', `Spec not found at ${specPath}`);
    }
    throw error;
  }

  let parsed;
  try {
    parsed = matter(fileContent);
  } catch (error) {
    throw new SpecError(
      'SPEC_PARSE_ERROR',
      `Failed to parse frontmatter for ${specPath}: ${(error as Error).message}`,
    );
  }

  const { data, content } = parsed;
  const meta: SpecMeta = {
    ...(data as Record<string, unknown>),
  } as SpecMeta;

  // Derive id from filename if missing
  if (!meta.id) {
    meta.id = deriveIdFromFilename(specPath);
  }

  // Default schema_version
  if (!meta.schema_version) {
    meta.schema_version = DEFAULT_SCHEMA_VERSION;
  }

  const { title, sections, sectionOrder, preamble } = parseBody(content);

  return {
    path: specPath,
    meta,
    title,
    sections,
    sectionOrder,
    preamble,
    rawBody: content,
  };
}

/**
 * Write a spec document back to disk, preserving section order and
 * optionally appending a changelog line.
 */
export async function writeSpec(
  doc: SpecDocument,
  options?: { appendChangelog?: string },
): Promise<void> {
  const nextDoc = { ...doc };

  if (options?.appendChangelog) {
    addChangelogEntry(nextDoc, options.appendChangelog);
  }

  const body = buildBody(
    nextDoc.title,
    nextDoc.preamble,
    nextDoc.sections,
    nextDoc.sectionOrder,
  );

  const fmMeta = {
    ...nextDoc.meta,
    id: nextDoc.meta.id ?? deriveIdFromFilename(nextDoc.path),
    schema_version: nextDoc.meta.schema_version ?? DEFAULT_SCHEMA_VERSION,
  };

  const output = matter.stringify(body, fmMeta);
  await fs.mkdir(path.dirname(nextDoc.path), { recursive: true });
  await fs.writeFile(nextDoc.path, output, 'utf8');
}

/**
 * Convenience helper to merge updates onto an existing spec and persist.
 */
export async function updateSpec(
  specPath: string,
  updates: {
    meta?: Partial<SpecMeta>;
    title?: string;
    sections?: Record<string, string>;
    appendChangelog?: string;
    preamble?: string;
  },
): Promise<SpecDocument> {
  const current = await readSpec(specPath);
  const mergedSections = { ...current.sections };
  const sectionOrder = [...current.sectionOrder];

  if (updates.sections) {
    for (const [name, content] of Object.entries(updates.sections)) {
      mergedSections[name] = content;
      if (!sectionOrder.includes(name)) {
        sectionOrder.push(name);
      }
    }
  }

  const mergedDoc: SpecDocument = {
    ...current,
    meta: { ...current.meta, ...(updates.meta ?? {}) },
    title: updates.title ?? current.title,
    preamble: updates.preamble ?? current.preamble,
    sections: mergedSections,
    sectionOrder,
  };

  await writeSpec(mergedDoc, {
    appendChangelog: updates.appendChangelog,
  });

  return readSpec(specPath);
}

function deriveIdFromFilename(filePath: string): string {
  return path.basename(filePath).replace(path.extname(filePath), '');
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

  // Append any sections not already in the declared order
  for (const [name, body] of Object.entries(sections)) {
    if (order.includes(name)) continue;
    parts.push(`## ${name}`);
    if (body.length > 0) {
      parts.push(body.trimEnd());
    }
    parts.push('');
  }

  // Ensure trailing newline
  if (parts.length === 0) return '';
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

function addChangelogEntry(doc: SpecDocument, entry: string): void {
  const timestamp = new Date().toISOString();
  const line = `- ${timestamp}: ${entry}`;
  const existing = doc.sections['Changelog'];
  if (existing) {
    doc.sections['Changelog'] = `${existing.trimEnd()}\n${line}`;
  } else {
    doc.sections['Changelog'] = line;
    doc.sectionOrder.push('Changelog');
  }
}

function trimTrailingNewlines(value: string): string {
  return value.replace(/[\r\n]+$/, '');
}
