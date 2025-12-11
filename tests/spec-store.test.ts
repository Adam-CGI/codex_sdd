import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  readSpec,
  writeSpec,
  updateSpec,
  SpecError,
} from '../src/specs/spec-store.js';

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'spec-store-'));
}

describe('spec-store', () => {
  it('throws SPEC_NOT_FOUND for missing files', async () => {
    const dir = await makeTempDir();
    const missing = path.join(dir, 'missing-spec.md');
    await expect(readSpec(missing)).rejects.toMatchObject<SpecError>({
      code: 'SPEC_NOT_FOUND',
    });
  });

  it('throws SPEC_PARSE_ERROR for malformed frontmatter', async () => {
    const dir = await makeTempDir();
    const target = path.join(dir, 'bad-spec.md');
    const badContent = ['---', 'foo: [', 'bar: baz', '---', 'Body'].join('\n');
    await fs.writeFile(target, badContent, 'utf8');

    await expect(readSpec(target)).rejects.toMatchObject<SpecError>({
      code: 'SPEC_PARSE_ERROR',
    });
  });

  it('round-trips spec content and preserves section order', async () => {
    const dir = await makeTempDir();
    const target = path.join(dir, 'feature-abc.md');
    const original = `---
status: Planned
---
# Feature ABC

## Context
Initial context.

## Goals
- Goal A
`;
    await fs.writeFile(target, original, 'utf8');

    const spec = await readSpec(target);
    expect(spec.meta.id).toBe('feature-abc');
    expect(spec.meta.schema_version).toBe('3.0');
    expect(spec.sectionOrder).toEqual(['Context', 'Goals']);
    expect(spec.sections.Context).toContain('Initial context.');

    spec.meta.status = 'In Progress';
    spec.sections.Context += '\nMore context.';

    await writeSpec(spec, { appendChangelog: 'Status updated' });
    const updated = await readSpec(target);

    expect(updated.meta.status).toBe('In Progress');
    expect(updated.meta.schema_version).toBe('3.0');
    expect(updated.sections.Context).toContain('More context.');
    expect(updated.sectionOrder).toContain('Changelog');
    expect(updated.sections.Changelog).toContain('Status updated');
  });

  it('derives id from filename when missing in frontmatter', async () => {
    const dir = await makeTempDir();
    const target = path.join(dir, 'sample-spec.md');
    await fs.writeFile(
      target,
      ['---', 'status: Planned', '---', '# Sample Spec'].join('\n'),
      'utf8',
    );

    const spec = await readSpec(target);
    expect(spec.meta.id).toBe('sample-spec');
  });

  it('updateSpec merges new sections and appends changelog', async () => {
    const dir = await makeTempDir();
    const target = path.join(dir, 'feature-xyz.md');
    await fs.writeFile(
      target,
      ['---', 'id: feature-xyz', '---', '# Feature XYZ', '', '## Context', 'Old'].join('\n'),
      'utf8',
    );

    const updated = await updateSpec(target, {
      meta: { status: 'Planned' },
      sections: { Goals: '- First goal' },
      appendChangelog: 'Added goals',
    });

    expect(updated.meta.status).toBe('Planned');
    expect(updated.sections.Goals).toContain('First goal');
    expect(updated.sectionOrder).toEqual(['Context', 'Goals', 'Changelog']);
    expect(updated.sections.Changelog).toContain('Added goals');
  });
});
