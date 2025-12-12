import { promises as fs } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { readSpec } from '../specs/spec-store.js';
import { ErrorCode, McpError, wrapWithErrorHandling, Errors } from '../shared/errors.js';

interface UpdateSpecParams {
  spec_path: string;
  version?: number;
  updated_content: string;
}

interface UpdateSpecResult {
  spec_id: string;
  changes_summary: string;
}

async function updateSpecFile(params: UpdateSpecParams, baseDir: string): Promise<UpdateSpecResult> {
  if (!params.updated_content || params.updated_content.trim().length === 0) {
    throw new McpError(ErrorCode.CONFIG_INVALID, 'updated_content is required');
  }

  const resolvedPath = path.isAbsolute(params.spec_path)
    ? params.spec_path
    : path.join(baseDir, params.spec_path);

  // Load current to ensure it exists and optionally enforce version
  const current = await readSpec(resolvedPath);
  const currentVersion = typeof current.meta.version === 'number' ? current.meta.version : undefined;

  if (params.version !== undefined && currentVersion !== undefined && currentVersion !== params.version) {
    throw Errors.conflictDetected(current.meta.id ?? resolvedPath, params.version, currentVersion);
  }

  // If caller did not include frontmatter, we preserve the current one and swap body
  const parsed = matter(params.updated_content);
  const hasFrontmatter = parsed.data && Object.keys(parsed.data).length > 0;

  if (!hasFrontmatter) {
    // Rebuild file with current frontmatter, new body
    const fm = { ...current.meta };
    if (currentVersion !== undefined) {
      fm.version = (currentVersion ?? 0) + 1;
    }
    const output = matter.stringify(parsed.content || params.updated_content, fm);
    await fs.writeFile(resolvedPath, output, 'utf8');
  } else {
    // Caller provided full file content, just write it
    await fs.writeFile(resolvedPath, params.updated_content, 'utf8');
  }

  return {
    spec_id: current.meta.id,
    changes_summary: 'Spec updated',
  };
}

export const planningUpdateSpec = {
  name: 'planning_update_spec',
  handler: async (params: UpdateSpecParams) =>
    wrapWithErrorHandling(() => updateSpecFile(params, process.cwd())),
};
