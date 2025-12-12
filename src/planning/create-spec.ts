import { promises as fs } from 'node:fs';
import path from 'node:path';

import { writeSpec } from '../specs/spec-store.js';
import { ErrorCode, McpError, wrapWithErrorHandling } from '../shared/errors.js';

interface CreateSpecParams {
  featureName: string;
  requirementsText?: string;
  requirementsPath?: string;
}

interface CreateSpecOptions {
  baseDir?: string;
}

interface CreateSpecResult {
  spec_id: string;
  spec_path: string;
  summary: {
    title: string;
    goals: string[];
    non_goals: string[];
  };
}

const DEFAULT_SCHEMA_VERSION = '3.0';

/**
 * Create a new feature spec under /specs using a slugified id derived from the feature name.
 * Populates common sections and appends a changelog entry noting creation.
 */
export async function createSpec(
  params: CreateSpecParams,
  options: CreateSpecOptions = {},
): Promise<CreateSpecResult> {
  const baseDir = options.baseDir ?? process.cwd();
  const featureName = params.featureName?.trim();

  if (!featureName) {
    throw new McpError(ErrorCode.CONFIG_INVALID, 'feature_name is required');
  }

  const specId = buildSpecId(featureName);
  const specPath = path.join(baseDir, 'specs', `${specId}.md`);

  if (await pathExists(specPath)) {
    throw new McpError(ErrorCode.CONFIG_INVALID, 'Spec already exists', {
      spec_id: specId,
      spec_path: specPath,
    });
  }

  const requirements = await resolveRequirements(params, baseDir);
  const goals = deriveGoals(requirements, featureName);
  const nonGoals = deriveNonGoals(requirements);
  const sections = buildSections({ featureName, requirements, goals, nonGoals });

  await writeSpec(
    {
      path: specPath,
      meta: { id: specId, status: 'Planned', schema_version: DEFAULT_SCHEMA_VERSION },
      title: featureName,
      sections,
      sectionOrder: [
        'Context',
        'Goals',
        'Non-Goals',
        'Functional Requirements',
        'Non-Functional Requirements',
        'Architecture Notes',
        'Open Questions',
      ],
      rawBody: '',
    },
    { appendChangelog: 'Spec created' },
  );

  return {
    spec_id: specId,
    spec_path: specPath,
    summary: {
      title: featureName,
      goals,
      non_goals: nonGoals,
    },
  };
}

export const planningCreateSpec = {
  name: 'planning_create_spec',
  handler: async (params: unknown) =>
    wrapWithErrorHandling(() => {
      const normalized = normalizeParams(params);
      return createSpec({
        featureName: normalized.featureName ?? '',
        requirementsText: normalized.requirementsText,
        requirementsPath: normalized.requirementsPath,
      });
    }),
};

function normalizeParams(input: unknown): {
  featureName?: string;
  requirementsText?: string;
  requirementsPath?: string;
} {
  // Some MCP clients wrap args under "arguments" or change casing; accept both.
  const raw =
    input && typeof input === 'object' && 'arguments' in (input as Record<string, unknown>)
      ? (input as Record<string, unknown>).arguments
      : input;

  const params = (raw ?? {}) as Record<string, unknown>;

  const featureName =
    (params.feature_name as string | undefined) ??
    (params.featureName as string | undefined) ??
    (params.feature as string | undefined);

  const requirementsText =
    (params.requirements_text as string | undefined) ??
    (params.requirementsText as string | undefined);

  const requirementsPath =
    (params.requirements_path as string | undefined) ??
    (params.requirementsPath as string | undefined);

  return {
    featureName: featureName?.trim(),
    requirementsText: requirementsText?.trim(),
    requirementsPath: requirementsPath?.trim(),
  };
}

function buildSpecId(featureName: string): string {
  const base = slugify(featureName);
  if (!base) {
    throw new McpError(ErrorCode.CONFIG_INVALID, 'feature_name must include alphanumeric characters');
  }
  return base.startsWith('feature-') ? base : `feature-${base}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') return false;
    throw error;
  }
}

async function resolveRequirements(
  params: CreateSpecParams,
  baseDir: string,
): Promise<string | undefined> {
  const text = params.requirementsText?.trim();
  if (text) return text;

  if (!params.requirementsPath) return undefined;

  const resolved = path.resolve(baseDir, params.requirementsPath);
  const repoRoot = path.resolve(baseDir);

  if (!resolved.startsWith(repoRoot)) {
    throw new McpError(ErrorCode.CONFIG_INVALID, 'requirements_path must be inside the repository', {
      requirements_path: params.requirementsPath,
    });
  }

  try {
    const content = await fs.readFile(resolved, 'utf8');
    return content.trim();
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      throw new McpError(ErrorCode.CONFIG_INVALID, 'requirements_path not found', {
        requirements_path: params.requirementsPath,
      });
    }
    throw error;
  }
}

function deriveGoals(requirements: string | undefined, featureName: string): string[] {
  const bulletGoals = extractBullets(requirements);
  if (bulletGoals.length > 0) return bulletGoals;

  const sentenceGoals = extractSentences(requirements);
  if (sentenceGoals.length > 0) return sentenceGoals;

  return [`Deliver ${featureName}`];
}

function deriveNonGoals(requirements: string | undefined): string[] {
  const tagged = extractTagged(requirements, /^non[-\s]?goals?:/i);
  if (tagged.length > 0) return tagged;
  return ['TBD'];
}

function buildSections(input: {
  featureName: string;
  requirements?: string;
  goals: string[];
  nonGoals: string[];
}): Record<string, string> {
  const { featureName, requirements, goals, nonGoals } = input;

  return {
    Context: requirements
      ? `Initial request for ${featureName}\n\n${requirements}`
      : `Initial request for ${featureName}.`,
    Goals: formatList(goals),
    'Non-Goals': formatList(nonGoals),
    'Functional Requirements': requirements ?? 'TBD',
    'Non-Functional Requirements': 'TBD',
    'Architecture Notes': 'TBD',
    'Open Questions': 'TBD',
  };
}

function extractBullets(source?: string): string[] {
  if (!source) return [];
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+.+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, '').trim())
    .filter((line) => line.length > 0);
}

function extractSentences(source?: string): string[] {
  if (!source) return [];
  return source
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function extractTagged(source: string | undefined, tag: RegExp): string[] {
  if (!source) return [];
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => tag.test(line))
    .map((line) => line.replace(tag, '').trim())
    .filter((line) => line.length > 0);
}

function formatList(items: string[]): string {
  if (items.length === 0) return '- TBD';
  return items.map((item) => `- ${item}`).join('\n');
}
