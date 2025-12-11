import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { createSpec } from '../src/planning/create-spec.js';
import { readSpec } from '../src/specs/spec-store.js';
import { ErrorCode, McpError } from '../src/shared/errors.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'planning-create-spec-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('createSpec', () => {
  it('creates a spec with derived id, default sections, and changelog', async () => {
    const result = await createSpec(
      { featureName: 'Awesome Search' },
      { baseDir: tmpDir },
    );

    const spec = await readSpec(result.spec_path);

    expect(result.spec_id).toBe('feature-awesome-search');
    expect(spec.meta.id).toBe('feature-awesome-search');
    expect(spec.meta.status).toBe('Planned');
    expect(spec.meta.schema_version).toBe('3.0');
    expect(spec.title).toBe('Awesome Search');
    expect(spec.sections.Goals).toContain('Deliver Awesome Search');
    expect(spec.sections['Non-Goals']).toContain('TBD');
    expect(spec.sections.Changelog).toMatch(/Spec created/);
  });

  it('prefers requirements_text bullets as goals and tagged non-goals', async () => {
    const requirements = `- fast results\n- minimal clicks\nNon-goals: mobile app`;

    const result = await createSpec(
      { featureName: 'Search V2', requirementsText: requirements },
      { baseDir: tmpDir },
    );

    const spec = await readSpec(result.spec_path);
    expect(spec.sections.Goals).toContain('fast results');
    expect(spec.sections.Goals).toContain('minimal clicks');
    expect(spec.sections['Non-Goals']).toContain('mobile app');
  });

  it('reads requirements from a file path inside repo', async () => {
    const reqPath = path.join(tmpDir, 'docs', 'reqs.md');
    await fs.mkdir(path.dirname(reqPath), { recursive: true });
    await fs.writeFile(reqPath, '- item a\n- item b', 'utf8');

    const result = await createSpec(
      { featureName: 'File Input', requirementsPath: 'docs/reqs.md' },
      { baseDir: tmpDir },
    );

    const spec = await readSpec(result.spec_path);
    expect(spec.sections.Goals).toContain('item a');
    expect(spec.sections['Functional Requirements']).toContain('item b');
  });

  it('rejects collisions when spec already exists', async () => {
    const specPath = path.join(tmpDir, 'specs', 'feature-dupe.md');
    await fs.mkdir(path.dirname(specPath), { recursive: true });
    await fs.writeFile(specPath, '# existing', 'utf8');

    await expect(
      createSpec({ featureName: 'Dupe' }, { baseDir: tmpDir }),
    ).rejects.toMatchObject<McpError>({ code: ErrorCode.CONFIG_INVALID });
  });

  it('rejects requirements_path outside repo', async () => {
    await expect(
      createSpec(
        { featureName: 'Bad Path', requirementsPath: '/etc/passwd' },
        { baseDir: tmpDir },
      ),
    ).rejects.toMatchObject<McpError>({ code: ErrorCode.CONFIG_INVALID });
  });

  it('requires a non-empty feature name', async () => {
    await expect(createSpec({ featureName: ' ' }, { baseDir: tmpDir })).rejects.toMatchObject<
      McpError
    >({ code: ErrorCode.CONFIG_INVALID });
  });
});
